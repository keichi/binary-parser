//========================================================================================
// Globals
//========================================================================================
var util = require('util');

var Parser = function() {
    this.varName = '';
    this.type = '';
    this.options = {};
    this.next = null;
    this.head = null;
    this.compiled = null;
};

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
// Parser builder functions
//========================================================================================

Parser.start = function() {
    return new Parser();
};

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

Object.keys(PRIMITIVE_TYPES)
    .forEach(function(type) {
        Parser.prototype[type.toLowerCase()] = function(varName, options) {
            return this.setNextParser(type.toLowerCase(), varName, options);
        };
    });

Parser.prototype.skip = function(length) {
    return this.setNextParser('skip', '', {length: length});
};

Parser.prototype.string = function(varName, options) {
    if (!options.length) {
        throw new Error('Length option of string is not defined.');
    }
    options.encoding = options.encoding || 'utf8';

    return this.setNextParser('string', varName, options);
};

Parser.prototype.array = function(varName, options) {
    if (!options.length) {
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
            throw new Error('Choice ' + key + ' of ' + varName + ' is not defined.');
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

//========================================================================================
// Parsers
//========================================================================================

// Follow the parser chain till the root and start parsing from there
Parser.prototype.parse = function(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('argument "buffer" is not a Buffer object');
    }

    if (this.compiled) {
        return this.compiled(buffer);
    }

    return this.next._parse({
        buffer: buffer,
        iterator: 0,
        vars: {}
    }).vars;
};

// Start parsing from this parser
Parser.prototype._parse = function(ctx) {
    return this['_parse' + this.type](ctx);
};

Parser.prototype.parseNext = function(ctx) {
    return this.next ? this.next._parse(ctx) : ctx;
};

Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
    Parser.prototype['_parse' + type] = function(ctx) {
        ctx.vars[this.varName] = ctx.buffer['read' + type](ctx.iterator);
        ctx.iterator += PRIMITIVE_TYPES[type];

        return this.parseNext(ctx);
    };
});

Parser.prototype._parseSkip = function(ctx) {
    ctx.iterator += this.options.length;

    return this.parseNext(ctx);
};


Parser.prototype.evalField = function(val, ctx) {
    if (typeof val === 'number') {
        return val;
    } else if (typeof val === 'string') {
        if (val in ctx.vars) {
            return ctx.vars[val];
        } else {
            throw new Error('Field ' + val + ' is not yet defined.');
        }
    } else if (typeof val === 'function') {
        return val.call(ctx.vars);
    }
};

Parser.prototype._parseString = function(ctx) {
    var encoding = this.options.encoding;
    var length = this.evalField(this.options.length, ctx);

    ctx.vars[this.varName] = ctx.buffer.toString(encoding, ctx.iterator, ctx.iterator + length);
    ctx.iterator += length;

    return this.parseNext(ctx);
};

Parser.prototype._parseArray = function(ctx) {
    var length = this.evalField(this.options.length, ctx);
    var type = this.options.type;
    var i, data, tmp;

    ctx.vars[this.varName] = [];
    if (typeof type === 'string') {
        for (i = 0; i < length ; i++) {
            tmp = this['_parse' + NAME_MAP[type]].call(
                new Parser(), {
                buffer: ctx.buffer,
                iterator: ctx.iterator,
                vars: {}
            });
            ctx.iterator = tmp.iterator;
            ctx.vars[this.varName].push(tmp.vars['']);
        }
    } else if (type instanceof Parser) {
        for (i = 0; i < length ; i++) {
            tmp = type.next._parse({
                buffer: ctx.buffer,
                iterator: ctx.iterator,
                vars: {}
            });
            ctx.iterator = tmp.iterator;
            ctx.vars[this.varName].push(tmp.vars);
        }
    }

    return this.parseNext(ctx);
};

Parser.prototype._parseChoice = function(ctx) {
    var tag = this.evalField(this.options.tag, ctx);
    var type = this.options.choices[tag];
    var tmp;

    if (typeof type === 'string') {
        tmp = this['_parse' + NAME_MAP[type]].call(
            new Parser(), {
            buffer: ctx.buffer,
            iterator: ctx.iterator,
            vars: {}
        });
        ctx.iterator = tmp.iterator;
        ctx.vars[this.varName] = tmp.vars[''];
    } else if (type instanceof Parser) {
        tmp = type.next._parse({
            buffer: ctx.buffer,
            iterator: ctx.iterator,
            vars: {}
        });
        ctx.iterator = tmp.iterator;
        ctx.vars[this.varName] = tmp.vars;
    }

    return this.parseNext(ctx);
};

//========================================================================================
// JIT code generators
//========================================================================================

Parser.prototype.compile = function() {
    var code =  'var vars = {};\n' +
                'var iterator = 0;\n' +
                this.next.generate({code: '', scopes: []}).code +
                'return vars;';

    console.log();
    console.log(code);
    
    this.compiled = new Function('buffer', code);
};

// Call code generator for this parser
Parser.prototype.generate = function(ctx) {
    return this['generate' + this.type](ctx);
};

// Recursively call code generators and append results
Parser.prototype.generateNextParser = function(ctx) {
    if (this.next) {
        ctx = this.next.generate(ctx);
    }

    return ctx;
};

Object.keys(PRIMITIVE_TYPES).forEach(function(type) {
    Parser.prototype['generate' + type] = function(ctx) {
        ctx.code += util.format('vars.%s = buffer.read%s(iterator);\n', this.varName, type);
        ctx.code += util.format('iterator += %d;\n', PRIMITIVE_TYPES[type]);

        return this.generateNextParser(ctx);
    };
});

Parser.prototype.generateField = function(val, ctx) {
    if (typeof val === 'number') {
        return val.toString();
    } else if (typeof val === 'string') {
        return util.format('vars.%s', val);
    } else if (typeof val === 'function') {
        return util.format('(%s).call(vars)', val);
    }
};

Parser.prototype.generateSkip = function(ctx) {
    var length = this.generateField(this.options.length, ctx);
    ctx.code += util.format('iterator += %s;\n', length);

    return this.generateNextParser(ctx);
};

Parser.prototype.generateString = function(ctx) {
    ctx.code += util.format('vars.%s = buffer.toString(\'%s\', iterator, iterator + %s);\n',
                                this.varName,
                                this.options.encoding,
                                this.generateField(this.options.length, ctx)
                            );
    ctx.code += util.format('iterator += %s;\n', this.generateField(this.options.length, ctx));
    
    return this.generateNextParser(ctx);
};

Parser.prototype.generateArray = function(ctx) {
    var length = this.generateField(this.options.length, ctx);
    var type = this.options.type;

    if (typeof type === 'string') {
        ctx.code += util.format('vars.%s = [];\n', this.varName);
        ctx.code += util.format('for (var i = 0; i < %s; i++) {\n', length);
        ctx.code += util.format('\tvars.%s.push(buffer.read%s(iterator));\n', this.varName, NAME_MAP[type]);
        ctx.code += util.format('\titerator += %d;\n', PRIMITIVE_TYPES[NAME_MAP[type]]);
        ctx.code += '}\n';
    } else if (type instanceof Parser) {
        for (i = 0; i < length ; i++) {
            ctx = type.next._parse({
                buffer: context.buffer,
                iterator: context.iterator,
                vars: {}
            });
            context.iterator = ctx.iterator;
            context.vars[this.varName].push(ctx.vars);
        }
    }
    return this.generateNextParser(ctx);
};

//========================================================================================
// Utilities
//========================================================================================

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

//========================================================================================
// Exports
//========================================================================================

// TODO skip should be also variable length
// TODO nestable arrays

exports.Parser = Parser;
