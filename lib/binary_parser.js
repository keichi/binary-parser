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
    'Choice'   : null
};

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

Parser.prototype.endianess = function(endianess) {
    if (endianess !== 'little' && endianess !== 'big') {
        throw new Error('Invalid endianess: ' + endianess);
    }
    var re = endianess === 'little' ? /(.+)LE/ : /(.+)BE/;

    Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
        var matched = type.match(re);
        if (matched) {
            var funcName = matched[1].toLowerCase();
            Parser.prototype[funcName] = Parser.prototype[type.toLowerCase()];
        }
    });

    return this;
};

Parser.prototype.getCode = function() {
    var ctx = new Context();

    ctx.pushCode('var vars = {};');
    ctx.pushCode('var iterator = 0;');
    this.generate(ctx);
    ctx.pushCode('return vars;');

    return ctx.code;
};

Parser.prototype.compile = function() {
    this.compiled = new Function('buffer', this.getCode());
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
Parser.prototype.parse = function(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('argument "buffer" is not a Buffer object');
    }

    if (!this.compiled) {
        this.compile();
    }

    return this.compiled(buffer);
};

//----------------------------------------------------------------------------------------
// private methods
//----------------------------------------------------------------------------------------

Parser.prototype.setNextParser = function(type, varName, options) {
    var parser = new Parser();
    
    parser.type = NAME_MAP[type];
    parser.varName = varName;
    parser.options = options || parser.options;
    
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
        this['generate' + this.type](ctx);
        this.generateAssert(ctx);
    }

    return this.generateNext(ctx);
};

Parser.prototype.generateAssert = function(ctx) {
    if (!this.options.assert) {
        return;
    }

    var varName = ctx.generateVariable(this.varName);

    ctx.pushCode('if (!({0})({1})) {', this.options.assert, varName);
    ctx.pushCode('throw new Error("Assert error: {0} is " + {0});', varName);
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
        ctx.pushCode('{0} = buffer.read{1}(iterator);', ctx.generateVariable(this.varName), type);
        ctx.pushCode('iterator += {0};', PRIMITIVE_TYPES[type]);
    };
});

Parser.prototype.generateSkip = function(ctx) {
    var length = ctx.generateOption(this.options.length);
    ctx.pushCode('iterator += {0};', length);
};

Parser.prototype.generateString = function(ctx) {
    if (this.options.zeroTerminated) {
        ctx.pushCode('{0} = (function() {', ctx.generateVariable(this.varName));
        ctx.pushCode('var start = iterator;');
        ctx.pushCode('while(buffer.readUInt8(iterator++) !== 0);');
        ctx.pushCode('return buffer.toString(\'{0}\', start, iterator - 1);', this.options.encoding);
        ctx.pushCode('})();');
    }
     else {
        ctx.pushCode('{0} = buffer.toString(\'{1}\', iterator, iterator + {2});',
                            ctx.generateVariable(this.varName),
                            this.options.encoding,
                            ctx.generateOption(this.options.length)
                        );
        ctx.pushCode('iterator += {0};', ctx.generateOption(this.options.length));
     }
};

Parser.prototype.generateBuffer = function(ctx) {
    if (this.options.readUntil === 'eof') {
        ctx.pushCode('{0} = buffer.slice(iterator, buffer.length - 1);',
            ctx.generateVariable(this.varName)
            );
    } else {
        ctx.pushCode('{0} = buffer.slice(iterator, iterator + {1});',
            ctx.generateVariable(this.varName),
            ctx.generateOption(this.options.length)
            );
        ctx.pushCode('iterator += {0};', ctx.generateOption(this.options.length));
    }

    if (this.options.clone) {
        ctx.pushCode('{0} = (function() { var buf = new Buffer({0}.length); {0}.copy(buf); return buf; })();',
            ctx.generateVariable(this.varName)
            );
    }
};

Parser.prototype.generateArray = function(ctx) {
    var length = ctx.generateOption(this.options.length);
    var type = this.options.type;
    var counter = 'i' + ctx.scopes.length.toString();
    var lhs = ctx.generateVariable(this.varName);

    ctx.pushCode('{0} = [];', lhs);
    if (this.options.readUntil === 'eof') {
        ctx.pushCode('for (var {0} = 0; iterator < buffer.length; {0}++) {', counter);
    } else {
        ctx.pushCode('for (var {0} = 0; {0} < {1}; {0}++) {', counter, length);
    }

    if (typeof type === 'string') {
        ctx.pushCode('{0}.push(buffer.read{1}(iterator));', lhs, NAME_MAP[type]);
        ctx.pushCode('iterator += {0};', PRIMITIVE_TYPES[NAME_MAP[type]]);
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
        ctx.pushCode('{0} = buffer.read{1}(iterator);', ctx.generateVariable(this.varName), NAME_MAP[type]);
        ctx.pushCode('iterator += {0};', PRIMITIVE_TYPES[NAME_MAP[type]]);
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
        ctx.pushCode('throw new Error("Met undefined tag value " + {0} + " at choice");', tag);
    }
    ctx.pushCode('}');
};

//========================================================================================
// Utilities
//========================================================================================

//----------------------------------------------------------------------------------------
// constructor
//----------------------------------------------------------------------------------------

var Context = function() {
    this.code = '';
    this.scopes = [];
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
    if (typeof val === 'number') {
        return val.toString();
    } else if (typeof val === 'string') {
        return this.generateVariable(val);
    } else if (typeof val === 'function') {
        return '(' + val + ').call(' + this.generateVariable() + ')';
    }
};

Context.prototype.pushCode = function(code) {
    var re = /{\d+}/g;
    var matches = code.match(re);
    var params = Array.prototype.slice.call(arguments, 1);

    if (matches) {
        matches.forEach(function(match) {
            var index = parseInt(match.substr(1, match.length - 2), 10);
            code = code.replace(match, params[index].toString());
        });
    }

    this.code += code + '\n';
};

//========================================================================================
// Exports
//========================================================================================

exports.Parser = Parser;
