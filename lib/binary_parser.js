//========================================================================================
// Globals
//========================================================================================

var PRIMITIVE_TYPES = {
    'UInt8'    : 1,
    'UInt16LE' : 2,
    'UInt16BE' : 2,
    'UInt32LE' : 4,
    'UInt32BE' : 4,
    'Int8'     : 1,
    'Int16LE'  : 2,
    'Int16BE'  : 2,
    'Int32LE'  : 4,
    'Int32BE'  : 4,
    'FloatLE'  : 4,
    'FloatBE'  : 4,
    'DoubleLE' : 8,
    'DoubleBE' : 8
};

var SPECIAL_TYPES = {
    'String'   : null,
    'Buffer'   : null,
    'Array'    : null,
    'Skip'     : null,
    'Choice'   : null,
    'Nest'     : null,
    'Bit'      : null
};

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
    this.varName = '';
    this.type = '';
    this.options = {};
    this.next = null;
    this.head = null;
    this.compiled = null;
    this.isAsync = false;
    this.endian = 'be';
    this.constructorFn = null;
};

//----------------------------------------------------------------------------------------
// public methods
//----------------------------------------------------------------------------------------

Parser.start = function() {
    return new Parser();
};

Object.keys(PRIMITIVE_TYPES)
    .forEach(function(type) {
        Parser.prototype[type.toLowerCase()] = function(varName, options) {
            return this.setNextParser(type.toLowerCase(), varName, options);
        };

        var typeWithoutEndian = type.replace(/BE|LE/, '').toLowerCase();
        if (!(typeWithoutEndian in Parser.prototype)) {
            Parser.prototype[typeWithoutEndian] = function(varName, options) {
                return this[typeWithoutEndian + this.endian](varName, options);
            };
        }
    });

BIT_RANGE.forEach(function(i) {
    Parser.prototype['bit' + i.toString()] = function(varName, options) {
        if (!options) {
            options = {};
        }
        options.length = i;
        return this.setNextParser('bit', varName, options);
    };
});

Parser.prototype.skip = function(length, options) {
    if (options && options.assert) {
        throw new Error('assert option on skip is not allowed.');
    }

    return this.setNextParser('skip', '', {length: length});
};

Parser.prototype.string = function(varName, options) {
    if (!options.zeroTerminated && !options.length) {
        throw new Error('Length option of string is not defined.');
    }
    options.encoding = options.encoding || 'utf8';

    return this.setNextParser('string', varName, options);
};

Parser.prototype.buffer = function(varName, options) {
    if (!options.length && !options.readUntil) {
        throw new Error('Length nor readUntil is defined in buffer parser');
    }

    return this.setNextParser('buffer', varName, options);
};

Parser.prototype.array = function(varName, options) {
    if (!options.readUntil && !options.length) {
        throw new Error('Length option of array is not defined.');
    }
    if (!options.type) {
        throw new Error('Type option of array is not defined.');
    }
    if (typeof options.type === 'string' && Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.type]) < 0) {
        throw new Error('Specified primitive type "' + options.type + '" is not supported.');
    }

    return this.setNextParser('array', varName, options);
};

Parser.prototype.choice = function(varName, options) {
    if (!options.tag) {
        throw new Error('Tag option of array is not defined.');
    }
    if (!options.choices) {
        throw new Error('Choices option of array is not defined.');
    }
    Object.keys(options.choices).forEach(function(key) {
        if (isNaN(parseInt(key, 10))) {
            throw new Error('Key of choices must be a number.');
        }
        if (!options.choices[key]) {
            throw new Error('Choice Case ' + key + ' of ' + varName + ' is not valid.');
        }

        if (typeof options.choices[key] === 'string' && Object.keys(PRIMITIVE_TYPES).indexOf(NAME_MAP[options.choices[key]]) < 0) {
            throw new Error('Specified primitive type "' +  options.choices[key] + '" is not supported.');
        }
    });

    return this.setNextParser('choice', varName, options);
};

Parser.prototype.nest = function(varName, options) {
    if (!options.type) {
        throw new Error('Type option of nest is not defined.');
    }
    if (!(options.type instanceof Parser)) {
        throw new Error('Type option of nest must be a Parser object.');
    }

    return this.setNextParser('nest', varName, options);
};

Parser.prototype.endianess = function(endianess) {
    switch (endianess.toLowerCase()) {
    case 'little':
        this.endian = 'le';
        break;
    case 'big':
        this.endian = 'be';
        break;
    default:
        throw new Error('Invalid endianess: ' + endianess);
    }

    return this;
};

Parser.prototype.create = function(constructorFn) {
    if (!(constructorFn instanceof Function)) {
        throw new Error('Constructor must be a Function object.');
    }

    this.constructorFn = constructorFn;

    return this;
};

Parser.prototype.getCode = function() {
    var ctx = new Context();
    if (this.isAsync) {
        ctx.isAsync = true;
    }

    if (this.constructorFn) {
        ctx.pushCode('var vars = new constructorFn();');
    } else {
        ctx.pushCode('var vars = {};');
    }
    ctx.pushCode('var offset = 0;');
    ctx.pushCode('if (!Buffer.isBuffer(buffer)) {');
    ctx.generateError('"argument buffer is not a Buffer object"');
    ctx.pushCode('}');

    this.generate(ctx);

    if (!this.isAsync) {
        ctx.pushCode('return vars;');
    }

    return ctx.code;
};

Parser.prototype.compile = function() {
    this.compiled = new Function('buffer', 'callback', 'constructorFn', this.getCode());
};

Parser.prototype.sizeOf = function() {
    var size = NaN;

    if (Object.keys(PRIMITIVE_TYPES).indexOf(this.type) >= 0) {
        size = PRIMITIVE_TYPES[this.type];
    
    // if this is a fixed length string
    } else if (this.type === 'String' && typeof this.options.length === 'number') {
        size = this.options.length;
    
    // if this is a fixed length array
    } else if (this.type === 'Array' && typeof this.options.length === 'number') {
        var elementSize = NaN;
        if (typeof this.options.type === 'string'){
            elementSize = PRIMITIVE_TYPES[NAME_MAP[this.options.type]];
        } else if (this.options.type instanceof Parser) {
            elementSize = this.options.type.sizeOf();
        }
        size = this.options.length * elementSize;
    
    // if this a skip
    } else if (this.type === 'Skip') {
        size = this.options.length;

    } else if (!this.type) {
        size = 0;
    }

    if (this.next) {
        size += this.next.sizeOf();
    }

    return size;
};

// Follow the parser chain till the root and start parsing from there
Parser.prototype.parse = function(buffer, callback) {
    if (!this.compiled) {
        this.compile();
    }

    return this.compiled(buffer, callback, this.constructorFn);
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

    if (parser.options.async) {
        this.isAsync = true;
    }

    return this;
};

// Call code generator for this parser
Parser.prototype.generate = function(ctx) {
    if (this.type) {
        if (this.options.async) {
            ctx.pushCode('process.nextTick(function() {');
        }
        
        this['generate' + this.type](ctx);
        this.generateAssert(ctx);
        
        if (this.options.async) {
            if (!this.next) {
                ctx.pushCode('process.nextTick(function() { callback(null, vars); });');
            }
            ctx.pushCode('});');
        }
    }

    return this.generateNext(ctx);
};

Parser.prototype.generateAssert = function(ctx) {
    if (!this.options.assert) {
        return;
    }

    var varName = ctx.generateVariable(this.varName);

    switch (typeof this.options.assert) {
        case 'function':
            ctx.pushCode('if (!({0}).call(vars, {1})) {', this.options.assert, varName);
        break;
        case 'number':
            ctx.pushCode('if ({0} !== {1}) {', this.options.assert, varName);
        break;
        case 'string':
            ctx.pushCode('if ("{0}" !== {1}) {', this.options.assert, varName);
        break;
        default:
            throw new Error('Assert option supports only strings, numbers and assert functions.');
    }
    ctx.generateError('"Assert error: {0} is " + {0}', varName);
    ctx.pushCode('}');
};

// Recursively call code generators and append results
Parser.prototype.generateNext = function(ctx) {
    if (this.next) {
        ctx = this.next.generate(ctx);
    }

    return ctx;
};

Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
    Parser.prototype['generate' + type] = function(ctx) {
        ctx.pushCode('{0} = buffer.read{1}(offset);', ctx.generateVariable(this.varName), type);
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[type]);
    };
});

Parser.prototype.generateBit = function(ctx) {
    // TODO find better method to handle nested bit fields
    var parser = JSON.parse(JSON.stringify(this));
    parser.varName = ctx.generateVariable(parser.varName);
    ctx.bitFields.push(parser);

    if (!this.next || (this.next && ['Bit', 'Nest'].indexOf(this.next.type) < 0)) {
        var sum = 0;
        ctx.bitFields.forEach(function(parser) {
            sum += parser.options.length;
        });

        var val = ctx.generateTmpVariable();

        if (sum <= 8) {
            ctx.pushCode('var {0} = buffer.readUInt8(offset);', val);
            sum = 8;
        } else if (sum <= 16) {
            ctx.pushCode('var {0} = buffer.readUInt16BE(offset);', val);
            sum = 16;
        } else if (sum <= 32) {
            ctx.pushCode('var {0} = buffer.readUInt32BE(offset);', val);
            sum = 32;
        } else {
            throw new Error('Currently, bit field sequence longer than 4-bytes is not supported.');
        }
        ctx.pushCode('offset += {0};', sum / 8);

        var bitOffset = 0;
        var isBigEndian = this.endian === 'be';
        ctx.bitFields.forEach(function(parser) {
            ctx.pushCode('{0} = {1} >> {2} & {3};',
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
    ctx.pushCode('offset += {0};', length);
};

Parser.prototype.generateString = function(ctx) {
    if (this.options.zeroTerminated) {
        var start = ctx.generateTmpVariable();

        ctx.pushCode('var {0} = offset;', start);
        ctx.pushCode('while(buffer.readUInt8(offset++) !== 0);');
        ctx.pushCode('{0} = buffer.toString(\'{1}\', {2}, offset - 1);',
            ctx.generateVariable(this.varName),
            this.options.encoding,
            start
        );
    }
     else {
        ctx.pushCode('{0} = buffer.toString(\'{1}\', offset, offset + {2});',
                            ctx.generateVariable(this.varName),
                            this.options.encoding,
                            ctx.generateOption(this.options.length)
                        );
        ctx.pushCode('offset += {0};', ctx.generateOption(this.options.length));
     }
};

Parser.prototype.generateBuffer = function(ctx) {
    if (this.options.readUntil === 'eof') {
        ctx.pushCode('{0} = buffer.slice(offset, buffer.length - 1);',
            ctx.generateVariable(this.varName)
            );
    } else {
        ctx.pushCode('{0} = buffer.slice(offset, offset + {1});',
            ctx.generateVariable(this.varName),
            ctx.generateOption(this.options.length)
            );
        ctx.pushCode('offset += {0};', ctx.generateOption(this.options.length));
    }

    if (this.options.clone) {
        var buf = ctx.generateTmpVariable();

        ctx.pushCode('var {0} = new Buffer({1}.length);', buf, ctx.generateVariable(this.varName));
        ctx.pushCode('{0}.copy({1});', ctx.generateVariable(this.varName), buf);
        ctx.pushCode('{0} = {1}', ctx.generateVariable(this.varName), buf);
    }
};

Parser.prototype.generateArray = function(ctx) {
    var length = ctx.generateOption(this.options.length);
    var type = this.options.type;
    var counter = ctx.generateTmpVariable();
    var lhs = ctx.generateVariable(this.varName);

    ctx.pushCode('{0} = [];', lhs);
    if (this.options.readUntil === 'eof') {
        ctx.pushCode('for (var {0} = 0; offset < buffer.length; {0}++) {', counter);
    } else {
        ctx.pushCode('for (var {0} = 0; {0} < {1}; {0}++) {', counter, length);
    }

    if (typeof type === 'string') {
        ctx.pushCode('{0}.push(buffer.read{1}(offset));', lhs, NAME_MAP[type]);
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[NAME_MAP[type]]);
    } else if (type instanceof Parser) {
        ctx.pushCode('{0}.push({});', lhs);

        ctx.scopes.push(this.varName + '[' + counter + ']');
        type.generate(ctx);
        ctx.scopes.pop();
    }
    ctx.pushCode('}');
};

Parser.prototype.generateChoiceCase = function(ctx, varName, type) {
    if (typeof type === 'string') {
        ctx.pushCode('{0} = buffer.read{1}(offset);', ctx.generateVariable(this.varName), NAME_MAP[type]);
        ctx.pushCode('offset += {0};', PRIMITIVE_TYPES[NAME_MAP[type]]);
    } else if (type instanceof Parser) {
        ctx.scopes.push(varName);
        type.generate(ctx);
        ctx.scopes.pop();
    }
};

Parser.prototype.generateChoice = function(ctx) {
    var tag = ctx.generateOption(this.options.tag);

    ctx.pushCode('{0} = {};', ctx.generateVariable(this.varName));
    ctx.pushCode('switch({0}) {', tag);
    Object.keys(this.options.choices).forEach(function(tag) {
        var type = this.options.choices[tag];

        ctx.pushCode('case {0}:', tag);
        this.generateChoiceCase(ctx, this.varName, type);
        ctx.pushCode('break;');
    }, this);
    ctx.pushCode('default:');
    if (this.options.defaultChoice) {
        this.generateChoiceCase(ctx, this.varName, this.options.defaultChoice);
    } else {
        ctx.generateError('"Met undefined tag value " + {0} + " at choice"', tag);
    }
    ctx.pushCode('}');
};

Parser.prototype.generateNest = function(ctx) {
    ctx.pushCode('{0} = {};', ctx.generateVariable(this.varName));
    ctx.scopes.push(this.varName);
    this.options.type.generate(ctx);
    ctx.scopes.pop();
};

Parser.prototype.isInteger = function() {
    return !!this.type.match(/U?Int[8|16|32][BE|LE]?|Bit\d+/);
};

//========================================================================================
// class Context
//========================================================================================

//----------------------------------------------------------------------------------------
// constructor
//----------------------------------------------------------------------------------------

var Context = function() {
    this.code = '';
    this.scopes = [];
    this.isAsync = false;
    this.bitFields = [];
    this.tmpVariableCount = 0;
};

//----------------------------------------------------------------------------------------
// public methods
//----------------------------------------------------------------------------------------

Context.prototype.generateVariable = function(name) {
    var arr = ['vars'];
    Array.prototype.push.apply(arr, this.scopes);
    if (name) {
        arr.push(name);
    }

    return arr.join('.');
};

Context.prototype.generateOption = function(val) {
    switch(typeof val) {
        case 'number':
            return val.toString();
        case 'string':
            return this.generateVariable(val);
        case 'function':
            return '(' + val + ').call(' + this.generateVariable() + ')';
    }
};

Context.prototype.generateError = function() {
    var args = Array.prototype.slice.call(arguments);
    var err = Context.interpolate.apply(this, args);

    if (this.isAsync) {
        this.pushCode('return process.nextTick(function() { callback(new Error(' + err + '), vars); });');
    } else {
        this.pushCode('throw new Error(' + err + ');');
    }
};

Context.prototype.generateTmpVariable = function() {
    return 'tmp' + (this.tmpVariableCount++);
};

Context.prototype.pushCode = function() {
    var args = Array.prototype.slice.call(arguments);
 
    this.code += Context.interpolate.apply(this, args) + '\n';
};

//----------------------------------------------------------------------------------------
// private methods
//----------------------------------------------------------------------------------------

Context.interpolate = function(s) {
    var re = /{\d+}/g;
    var matches = s.match(re);
    var params = Array.prototype.slice.call(arguments, 1);

    if (matches) {
        matches.forEach(function(match) {
            var index = parseInt(match.substr(1, match.length - 2), 10);
            s = s.replace(match, params[index].toString());
        });
    }

    return s;
};

//========================================================================================
// Exports
//========================================================================================

exports.Parser = Parser;
