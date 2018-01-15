//========================================================================================
// Globals
//========================================================================================
var vm = require("vm");

var Context = require("./context").Context;

var PRIMITIVE_TYPES = {
  UInt8: 1,
  UInt16LE: 2,
  UInt16BE: 2,
  UInt32LE: 4,
  UInt32BE: 4,
  Int8: 1,
  Int16LE: 2,
  Int16BE: 2,
  Int32LE: 4,
  Int32BE: 4,
  FloatLE: 4,
  FloatBE: 4,
  DoubleLE: 8,
  DoubleBE: 8
};

var SPECIAL_TYPES = {
  String: null,
  Buffer: null,
  Array: null,
  Skip: null,
  Choice: null,
  Nest: null,
  Bit: null
};

var aliasRegistry = {};
var FUNCTION_PREFIX = "___parser_";

var BIT_RANGE = [];
(function() {
  var i;
  for (i = 1; i <= 32; i++) {
    BIT_RANGE.push(i);
  }
})();

// Converts Parser's method names to internal type names
var NAME_MAP = {};
Object.keys(PRIMITIVE_TYPES)
  .concat(Object.keys(SPECIAL_TYPES))
  .forEach(function(type) {
    NAME_MAP[type.toLowerCase()] = type;
  });

//========================================================================================
// class Parser
//========================================================================================

//----------------------------------------------------------------------------------------
// constructor
//----------------------------------------------------------------------------------------

var Parser = function() {
  this.varName = "";
  this.type = "";
  this.options = {};
  this.next = null;
  this.head = null;
  this.compiled = null;
  this.endian = "be";
  this.constructorFn = null;
  this.alias = null;
};

//----------------------------------------------------------------------------------------
// public methods
//----------------------------------------------------------------------------------------

Parser.start = function() {
  return new Parser();
};

Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
  Parser.prototype[type.toLowerCase()] = function(varName, options) {
    return this.setNextParser(type.toLowerCase(), varName, options);
  };

  var typeWithoutEndian = type.replace(/BE|LE/, "").toLowerCase();
  if (!(typeWithoutEndian in Parser.prototype)) {
    Parser.prototype[typeWithoutEndian] = function(varName, options) {
      return this[typeWithoutEndian + this.endian](varName, options);
    };
  }
});

BIT_RANGE.forEach(function(i) {
  Parser.prototype["bit" + i.toString()] = function(varName, options) {
    if (!options) {
      options = {};
    }
    options.length = i;
    return this.setNextParser("bit", varName, options);
  };
});

Parser.prototype.namely = function(alias) {
  aliasRegistry[alias] = this;
  this.alias = alias;
  return this;
};

Parser.prototype.skip = function(length, options) {
  if (options && options.assert) {
    throw new Error("assert option on skip is not allowed.");
  }

  return this.setNextParser("skip", "", { length: length });
};

Parser.prototype.string = function(varName, options) {
  if (!options.zeroTerminated && !options.length && !options.greedy) {
    throw new Error(
      "Neither length, zeroTerminated, nor greedy is defined for string."
    );
  }
  if ((options.zeroTerminated || options.length) && options.greedy) {
    throw new Error(
      "greedy is mutually exclusive with length and zeroTerminated for string."
    );
  }
  if (options.stripNull && !(options.length || options.greedy)) {
    throw new Error(
      "Length or greedy must be defined if stripNull is defined."
    );
  }
  options.encoding = options.encoding || "utf8";

  return this.setNextParser("string", varName, options);
};

Parser.prototype.buffer = function(varName, options) {
  if (!options.length && !options.readUntil) {
    throw new Error("Length nor readUntil is defined in buffer parser");
  }

  return this.setNextParser("buffer", varName, options);
};

Parser.prototype.array = function(varName, options) {
  if (!options.readUntil && !options.length && !options.lengthInBytes) {
    throw new Error("Length option of array is not defined.");
  }
  if (!options.type) {
    throw new Error("Type option of array is not defined.");
  }
  if (
    typeof options.type === "string" &&
    !aliasRegistry[options.type] &&
    Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.type]) < 0
  ) {
    throw new Error(
      'Specified primitive type "' + options.type + '" is not supported.'
    );
  }

  return this.setNextParser("array", varName, options);
};

Parser.prototype.choice = function(varName, options) {
  if (arguments.length == 1 && typeof varName === "object") {
    options = varName;
    varName = null;
  }

  if (!options.tag) {
    throw new Error("Tag option of array is not defined.");
  }
  if (!options.choices) {
    throw new Error("Choices option of array is not defined.");
  }

  Object.keys(options.choices).forEach(function(key) {
    if (isNaN(parseInt(key, 10))) {
      throw new Error("Key of choices must be a number.");
    }
    if (!options.choices[key]) {
      throw new Error(
        "Choice Case " + key + " of " + varName + " is not valid."
      );
    }

    if (
      typeof options.choices[key] === "string" &&
      !aliasRegistry[options.choices[key]] &&
      Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.choices[key]]) < 0
    ) {
      throw new Error(
        'Specified primitive type "' +
          options.choices[key] +
          '" is not supported.'
      );
    }
  }, this);

  return this.setNextParser("choice", varName, options);
};

Parser.prototype.nest = function(varName, options) {
  if (arguments.length == 1 && typeof varName === "object") {
    options = varName;
    varName = null;
  }

  if (!options.type) {
    throw new Error("Type option of nest is not defined.");
  }
  if (!(options.type instanceof Parser) && !aliasRegistry[options.type]) {
    throw new Error("Type option of nest must be a Parser object.");
  }
  if (!(options.type instanceof Parser) && !varName) {
    throw new Error(
      "options.type must be a object if variable name is omitted."
    );
  }

  return this.setNextParser("nest", varName, options);
};

Parser.prototype.endianess = function(endianess) {
  switch (endianess.toLowerCase()) {
    case "little":
      this.endian = "le";
      break;
    case "big":
      this.endian = "be";
      break;
    default:
      throw new Error("Invalid endianess: " + endianess);
  }

  return this;
};

Parser.prototype.create = function(constructorFn) {
  if (!(constructorFn instanceof Function)) {
    throw new Error("Constructor must be a Function object.");
  }

  this.constructorFn = constructorFn;

  return this;
};

Parser.prototype.getCode = function() {
  var ctx = new Context();

  ctx.pushCode("if (!Buffer.isBuffer(buffer)) {");
  ctx.generateError('"argument buffer is not a Buffer object"');
  ctx.pushCode("}");

  if (!this.alias) {
    this.addRawCode(ctx);
  } else {
    this.addAliasedCode(ctx);
  }

  if (this.alias) {
    ctx.pushCode("return {0}(0).result;", FUNCTION_PREFIX + this.alias);
  } else {
    ctx.pushCode("return vars;");
  }

  return ctx.code;
};

Parser.prototype.addRawCode = function(ctx) {
  ctx.pushCode("var offset = 0;");

  if (this.constructorFn) {
    ctx.pushCode("var vars = new constructorFn();");
  } else {
    ctx.pushCode("var vars = {};");
  }

  this.generate(ctx);

  this.resolveReferences(ctx);

  ctx.pushCode("return vars;");
};

Parser.prototype.addAliasedCode = function(ctx) {
  ctx.pushCode("function {0}(offset) {", FUNCTION_PREFIX + this.alias);

  if (this.constructorFn) {
    ctx.pushCode("var vars = new constructorFn();");
  } else {
    ctx.pushCode("var vars = {};");
  }

  this.generate(ctx);

  ctx.markResolved(this.alias);
  this.resolveReferences(ctx);

  ctx.pushCode("return { offset: offset, result: vars };");
  ctx.pushCode("}");

  return ctx;
};

Parser.prototype.resolveReferences = function(ctx) {
  var references = ctx.getUnresolvedReferences();
  ctx.markRequested(references);
  references.forEach(function(alias) {
    var parser = aliasRegistry[alias];
    parser.addAliasedCode(ctx);
  });
};

Parser.prototype.compile = function() {
  var src = "(function(buffer, constructorFn) { " + this.getCode() + " })";
  this.compiled = vm.runInThisContext(src);
};

Parser.prototype.sizeOf = function() {
  var size = NaN;

  if (Object.keys(PRIMITIVE_TYPES).indexOf(this.type) >= 0) {
    size = PRIMITIVE_TYPES[this.type];

    // if this is a fixed length string
  } else if (
    this.type === "String" &&
    typeof this.options.length === "number"
  ) {
    size = this.options.length;

    // if this is a fixed length buffer
  } else if (
    this.type === "Buffer" &&
    typeof this.options.length === "number"
  ) {
    size = this.options.length;

    // if this is a fixed length array
  } else if (this.type === "Array" && typeof this.options.length === "number") {
    var elementSize = NaN;
    if (typeof this.options.type === "string") {
      elementSize = PRIMITIVE_TYPES[NAME_MAP[this.options.type]];
    } else if (this.options.type instanceof Parser) {
      elementSize = this.options.type.sizeOf();
    }
    size = this.options.length * elementSize;

    // if this a skip
  } else if (this.type === "Skip") {
    size = this.options.length;

    // if this is a nested parser
  } else if (this.type === "Nest") {
    size = this.options.type.sizeOf();
  } else if (!this.type) {
    size = 0;
  }

  if (this.next) {
    size += this.next.sizeOf();
  }

  return size;
};

// Follow the parser chain till the root and start parsing from there
Parser.prototype.parse = function(buffer) {
  if (!this.compiled) {
    this.compile();
  }

  return this.compiled(buffer, this.constructorFn);
};

//----------------------------------------------------------------------------------------
// private methods
//----------------------------------------------------------------------------------------

Parser.prototype.setNextParser = function(type, varName, options) {
  var parser = new Parser();

  parser.type = NAME_MAP[type];
  parser.varName = varName;
  parser.options = options || parser.options;
  parser.endian = this.endian;

  if (this.head) {
    this.head.next = parser;
  } else {
    this.next = parser;
  }
  this.head = parser;

  return this;
};

// Call code generator for this parser
Parser.prototype.generate = function(ctx) {
  if (this.type) {
    this["generate" + this.type](ctx);
    this.generateAssert(ctx);
  }

  var varName = ctx.generateVariable(this.varName);
  if (this.options.formatter) {
    this.generateFormatter(ctx, varName, this.options.formatter);
  }

  return this.generateNext(ctx);
};

Parser.prototype.generateAssert = function(ctx) {
  if (!this.options.assert) {
    return;
  }

  var varName = ctx.generateVariable(this.varName);

  switch (typeof this.options.assert) {
    case "function":
      ctx.pushCode(
        "if (!({0}).call(vars, {1})) {",
        this.options.assert,
        varName
      );
      break;
    case "number":
      ctx.pushCode("if ({0} !== {1}) {", this.options.assert, varName);
      break;
    case "string":
      ctx.pushCode('if ("{0}" !== {1}) {', this.options.assert, varName);
      break;
    default:
      throw new Error(
        "Assert option supports only strings, numbers and assert functions."
      );
  }
  ctx.generateError('"Assert error: {0} is " + {0}', varName);
  ctx.pushCode("}");
};

// Recursively call code generators and append results
Parser.prototype.generateNext = function(ctx) {
  if (this.next) {
    ctx = this.next.generate(ctx);
  }

  return ctx;
};

Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
  Parser.prototype["generate" + type] = function(ctx) {
    ctx.pushCode(
      "{0} = buffer.read{1}(offset);",
      ctx.generateVariable(this.varName),
      type
    );
    ctx.pushCode("offset += {0};", PRIMITIVE_TYPES[type]);
  };
});

Parser.prototype.generateBit = function(ctx) {
  // TODO find better method to handle nested bit fields
  var parser = JSON.parse(JSON.stringify(this));
  parser.varName = ctx.generateVariable(parser.varName);
  ctx.bitFields.push(parser);

  if (
    !this.next ||
    (this.next && ["Bit", "Nest"].indexOf(this.next.type) < 0)
  ) {
    var sum = 0;
    ctx.bitFields.forEach(function(parser) {
      sum += parser.options.length;
    });

    var val = ctx.generateTmpVariable();

    if (sum <= 8) {
      ctx.pushCode("var {0} = buffer.readUInt8(offset);", val);
      sum = 8;
    } else if (sum <= 16) {
      ctx.pushCode("var {0} = buffer.readUInt16BE(offset);", val);
      sum = 16;
    } else if (sum <= 24) {
      var val1 = ctx.generateTmpVariable();
      var val2 = ctx.generateTmpVariable();
      ctx.pushCode("var {0} = buffer.readUInt16BE(offset);", val1);
      ctx.pushCode("var {0} = buffer.readUInt8(offset + 2);", val2);
      ctx.pushCode("var {2} = ({0} << 8) | {1};", val1, val2, val);
      sum = 24;
    } else if (sum <= 32) {
      ctx.pushCode("var {0} = buffer.readUInt32BE(offset);", val);
      sum = 32;
    } else {
      throw new Error(
        "Currently, bit field sequence longer than 4-bytes is not supported."
      );
    }
    ctx.pushCode("offset += {0};", sum / 8);

    var bitOffset = 0;
    var isBigEndian = this.endian === "be";
    ctx.bitFields.forEach(function(parser) {
      ctx.pushCode(
        "{0} = {1} >> {2} & {3};",
        parser.varName,
        val,
        isBigEndian ? sum - bitOffset - parser.options.length : bitOffset,
        (1 << parser.options.length) - 1
      );
      bitOffset += parser.options.length;
    });

    ctx.bitFields = [];
  }
};

Parser.prototype.generateSkip = function(ctx) {
  var length = ctx.generateOption(this.options.length);
  ctx.pushCode("offset += {0};", length);
};

Parser.prototype.generateString = function(ctx) {
  var name = ctx.generateVariable(this.varName);
  var start = ctx.generateTmpVariable();

  if (this.options.length && this.options.zeroTerminated) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode(
      "while(buffer.readUInt8(offset++) !== 0 && offset - {0}  < {1});",
      start,
      this.options.length
    );
    ctx.pushCode(
      "{0} = buffer.toString('{1}', {2}, offset - {2} < {3} ? offset - 1 : offset);",
      name,
      this.options.encoding,
      start,
      this.options.length
    );
  } else if (this.options.length) {
    ctx.pushCode(
      "{0} = buffer.toString('{1}', offset, offset + {2});",
      name,
      this.options.encoding,
      ctx.generateOption(this.options.length)
    );
    ctx.pushCode("offset += {0};", ctx.generateOption(this.options.length));
  } else if (this.options.zeroTerminated) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode("while(buffer.readUInt8(offset++) !== 0);");
    ctx.pushCode(
      "{0} = buffer.toString('{1}', {2}, offset - 1);",
      name,
      this.options.encoding,
      start
    );
  } else if (this.options.greedy) {
    ctx.pushCode("var {0} = offset;", start);
    ctx.pushCode("while(buffer.length > offset++);");
    ctx.pushCode(
      "{0} = buffer.toString('{1}', {2}, offset);",
      name,
      this.options.encoding,
      start
    );
  }
  if (this.options.stripNull) {
    ctx.pushCode("{0} = {0}.replace(/\\x00+$/g, '')", name);
  }
};

Parser.prototype.generateBuffer = function(ctx) {
  if (this.options.readUntil === "eof") {
    ctx.pushCode(
      "{0} = buffer.slice(offset);",
      ctx.generateVariable(this.varName)
    );
  } else {
    ctx.pushCode(
      "{0} = buffer.slice(offset, offset + {1});",
      ctx.generateVariable(this.varName),
      ctx.generateOption(this.options.length)
    );
    ctx.pushCode("offset += {0};", ctx.generateOption(this.options.length));
  }

  if (this.options.clone) {
    ctx.pushCode("{0} = Buffer.from({0});", ctx.generateVariable(this.varName));
  }
};

Parser.prototype.generateArray = function(ctx) {
  var length = ctx.generateOption(this.options.length);
  var lengthInBytes = ctx.generateOption(this.options.lengthInBytes);
  var type = this.options.type;
  var counter = ctx.generateTmpVariable();
  var lhs = ctx.generateVariable(this.varName);
  var item = ctx.generateTmpVariable();
  var key = this.options.key;
  var isHash = typeof key === "string";

  if (isHash) {
    ctx.pushCode("{0} = {};", lhs);
  } else {
    ctx.pushCode("{0} = [];", lhs);
  }
  if (typeof this.options.readUntil === "function") {
    ctx.pushCode("do {");
  } else if (this.options.readUntil === "eof") {
    ctx.pushCode("for (var {0} = 0; offset < buffer.length; {0}++) {", counter);
  } else if (lengthInBytes !== undefined) {
    ctx.pushCode(
      "for (var {0} = offset; offset - {0} < {1}; ) {",
      counter,
      lengthInBytes
    );
  } else {
    ctx.pushCode("for (var {0} = 0; {0} < {1}; {0}++) {", counter, length);
  }

  if (typeof type === "string") {
    if (!aliasRegistry[type]) {
      ctx.pushCode("var {0} = buffer.read{1}(offset);", item, NAME_MAP[type]);
      ctx.pushCode("offset += {0};", PRIMITIVE_TYPES[NAME_MAP[type]]);
    } else {
      var tempVar = ctx.generateTmpVariable();
      ctx.pushCode("var {0} = {1}(offset);", tempVar, FUNCTION_PREFIX + type);
      ctx.pushCode("var {0} = {1}.result; offset = {1}.offset;", item, tempVar);
      if (type !== this.alias) ctx.addReference(type);
    }
  } else if (type instanceof Parser) {
    ctx.pushCode("var {0} = {};", item);

    ctx.pushScope(item);
    type.generate(ctx);
    ctx.popScope();
  }

  if (isHash) {
    ctx.pushCode("{0}[{2}.{1}] = {2};", lhs, key, item);
  } else {
    ctx.pushCode("{0}.push({1});", lhs, item);
  }

  ctx.pushCode("}");

  if (typeof this.options.readUntil === "function") {
    ctx.pushCode(
      " while (!({0}).call(this, {1}, buffer.slice(offset)));",
      this.options.readUntil,
      item
    );
  }
};

Parser.prototype.generateChoiceCase = function(ctx, varName, type) {
  if (typeof type === "string") {
    if (!aliasRegistry[type]) {
      ctx.pushCode(
        "{0} = buffer.read{1}(offset);",
        ctx.generateVariable(this.varName),
        NAME_MAP[type]
      );
      ctx.pushCode("offset += {0};", PRIMITIVE_TYPES[NAME_MAP[type]]);
    } else {
      var tempVar = ctx.generateTmpVariable();
      ctx.pushCode("var {0} = {1}(offset);", tempVar, FUNCTION_PREFIX + type);
      ctx.pushCode(
        "{0} = {1}.result; offset = {1}.offset;",
        ctx.generateVariable(this.varName),
        tempVar
      );
      if (type !== this.alias) ctx.addReference(type);
    }
  } else if (type instanceof Parser) {
    ctx.pushPath(varName);
    type.generate(ctx);
    ctx.popPath(varName);
  }
};

Parser.prototype.generateChoice = function(ctx) {
  var tag = ctx.generateOption(this.options.tag);
  if (this.varName) {
    ctx.pushCode("{0} = {};", ctx.generateVariable(this.varName));
  }
  ctx.pushCode("switch({0}) {", tag);
  Object.keys(this.options.choices).forEach(function(tag) {
    var type = this.options.choices[tag];

    ctx.pushCode("case {0}:", tag);
    this.generateChoiceCase(ctx, this.varName, type);
    ctx.pushCode("break;");
  }, this);
  ctx.pushCode("default:");
  if (this.options.defaultChoice) {
    this.generateChoiceCase(ctx, this.varName, this.options.defaultChoice);
  } else {
    ctx.generateError('"Met undefined tag value " + {0} + " at choice"', tag);
  }
  ctx.pushCode("}");
};

Parser.prototype.generateNest = function(ctx) {
  var nestVar = ctx.generateVariable(this.varName);

  if (this.options.type instanceof Parser) {
    if (this.varName) {
      ctx.pushCode("{0} = {};", nestVar);
    }
    ctx.pushPath(this.varName);
    this.options.type.generate(ctx);
    ctx.popPath(this.varName);
  } else if (aliasRegistry[this.options.type]) {
    var tempVar = ctx.generateTmpVariable();
    ctx.pushCode(
      "var {0} = {1}(offset);",
      tempVar,
      FUNCTION_PREFIX + this.options.type
    );
    ctx.pushCode("{0} = {1}.result; offset = {1}.offset;", nestVar, tempVar);
    if (this.options.type !== this.alias) ctx.addReference(this.options.type);
  }
};

Parser.prototype.generateFormatter = function(ctx, varName, formatter) {
  if (typeof formatter === "function") {
    ctx.pushCode("{0} = ({1}).call(this, {0});", varName, formatter);
  }
};

Parser.prototype.isInteger = function() {
  return !!this.type.match(/U?Int[8|16|32][BE|LE]?|Bit\d+/);
};

//========================================================================================
// Exports
//========================================================================================

exports.Parser = Parser;
