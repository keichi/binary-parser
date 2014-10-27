var assert = require('assert');
var util = require('util');
var Parser = require('../lib/binary_parser').Parser;

describe('Parser', function(){
    describe('Primitive parsers', function(){
        it('should nothing', function(){
            var parser = Parser.start();

            var buffer = new Buffer([0xa, 0x14, 0x1e, 0x28, 0x32]);
            assert.deepEqual(parser.parse(buffer), {});
        });
        it('should parse integer types', function(){
            var parser =
            Parser.start()
            .uint8('a')
            .int16le('b')
            .uint32be('c');

            var buffer = new Buffer([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
            assert.deepEqual(parser.parse(buffer), {a: 0, b: 1234, c: 12345678});
        });
        it('should parse floating point types', function(){
            var parser =
            Parser.start()
            .floatbe('a')
            .doublele('b');

            var FLT_EPSILON = 0.00001
            var buffer = new Buffer([
                0x41, 0x45, 0x85, 0x1f,
                0x7a, 0x36, 0xab, 0x3e, 0x57, 0x5b, 0xb1, 0xbf
            ]);
            var result = parser.parse(buffer);

            assert(Math.abs(result.a - 12.345) < FLT_EPSILON);
            assert(Math.abs(result.b - (-0.0678)) < FLT_EPSILON);
        });
        it('should handle endianess', function(){
            var parser =
            Parser.start()
            .int32le('little')
            .int32be('big');

            var buffer = new Buffer([0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e]);
            assert.deepEqual(parser.parse(buffer), {little: 12345678, big: 12345678});
        });
        it('should skip when specified', function(){
            var parser =
            Parser.start()
            .uint8('a')
            .skip(3)
            .uint16le('b')
            .uint32be('c');

            var buffer = new Buffer([0x00, 0xff, 0xff, 0xfe, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
            assert.deepEqual(parser.parse(buffer), {a: 0, b: 1234, c: 12345678});
        });
    });

    describe('Bit field parsers', function() {
        var binaryLiteral = function(s) {
            var i;
            var bytes = [];

            s = s.replace(/\s/g, '');
            for (i = 0; i < s.length; i += 8) {
                bytes.push(parseInt(s.slice(i, i + 8), 2));
            }

            return new Buffer(bytes);
        };

        it('binary literal helper should work', function() {
            assert.deepEqual(binaryLiteral('11110000'), new Buffer([0xf0]));
            assert.deepEqual(binaryLiteral('11110000 10100101'), new Buffer([0xf0, 0xa5]));
        });

        it('should parse 1-byte-length bit field sequence', function() {
            var parser = new Parser()
                .bit1('a')
                .bit2('b')
                .bit4('c')
                .bit1('d');

            var buf = binaryLiteral('1 10 1010 0');
            assert.deepEqual(parser.parse(buf), {
                a: 1,
                b: 2,
                c: 10,
                d: 0
            });

            parser = new Parser()
                .endianess('little')
                .bit1('a')
                .bit2('b')
                .bit4('c')
                .bit1('d');

            assert.deepEqual(parser.parse(buf), {
                a: 0,
                b: 2,
                c: 10,
                d: 1
            });
        });
        it('should parse 2-byte-length bit field sequence', function() {
            var parser = new Parser()
                .bit3('a')
                .bit9('b')
                .bit4('c');

            var buf = binaryLiteral('101 111000111 0111');
            assert.deepEqual(parser.parse(buf), {
                a: 5,
                b: 455,
                c: 7
            });
            
            parser = new Parser()
                .endianess('little')
                .bit3('a')
                .bit9('b')
                .bit4('c');
            assert.deepEqual(parser.parse(buf), {
                a: 7,
                b: 398,
                c: 11
            });
        });
        it('should parse 4-byte-length bit field sequence', function() {
            var parser = new Parser()
                .bit1('a')
                .bit24('b')
                .bit4('c')
                .bit2('d')
                .bit1('e');
            var buf = binaryLiteral('1 101010101010101010101010 1111 01 1');
            assert.deepEqual(parser.parse(buf), {
                a: 1,
                b: 11184810,
                c: 15,
                d: 1,
                e: 1
            });

            parser = new Parser()
                .endianess('little')
                .bit1('a')
                .bit24('b')
                .bit4('c')
                .bit2('d')
                .bit1('e');
            assert.deepEqual(parser.parse(buf), {
                a: 1,
                b: 11184829,
                c: 10,
                d: 2,
                e: 1
            });
        });
        it('should parse nested bit fields', function() {
            var parser = new Parser()
                .bit1('a')
                .nest('x', {
                    type: new Parser()
                        .bit2('b')
                        .bit4('c')
                        .bit1('d')
                });

            var buf = binaryLiteral('11010100');

            assert.deepEqual(parser.parse(buf), {
                a: 1,
                x: {
                    b: 2,
                    c: 10,
                    d: 0
                }
            });
        });
    });

    describe('String parser', function() {
        it('should parse ASCII encoded string', function(){
            var text = 'hello, world';
            var buffer = new Buffer(text, 'ascii');
            var parser = Parser.start().string('msg', {length: buffer.length, encoding: 'ascii'});

            assert.equal(parser.parse(buffer).msg, text);
        });
        it('should parse UTF8 encoded string', function(){
            var text = 'こんにちは、せかい。';
            var buffer = new Buffer(text, 'utf8');
            var parser = Parser.start().string('msg', {length: buffer.length, encoding: 'utf8'});

            assert.equal(parser.parse(buffer).msg, text);
        });
        it('should parse HEX encoded string', function(){
            var text = 'cafebabe';
            var buffer = new Buffer(text, 'hex');
            var parser = Parser.start().string('msg', {length: buffer.length, encoding: 'hex'});

            assert.equal(parser.parse(buffer).msg, text);
        });
        it('should parse variable length string', function(){
            var buffer = new Buffer('0c68656c6c6f2c20776f726c64', 'hex');
            var parser = Parser.start()
                .uint8('length')
                .string('msg', {length: 'length', encoding: 'utf8'});

            assert.equal(parser.parse(buffer).msg, 'hello, world');
        });
        it('should parse zero terminated string', function(){
            var buffer = new Buffer('68656c6c6f2c20776f726c6400', 'hex');
            var parser = Parser.start().string('msg', {zeroTerminated: true, encoding: 'ascii'});

            assert.deepEqual(parser.parse(buffer), {msg: 'hello, world'});
        });
    });

    describe('Buffer parser', function() {
        it('should parse as buffer', function() {
            var parser = new Parser()
                .uint8('len')
                .buffer('raw', {
                    length: 'len'
                });

            var buf = new Buffer('deadbeefdeadbeef', 'hex');
            var result = parser.parse(Buffer.concat([new Buffer([8]), buf]));

            assert.deepEqual(result.raw, buf);
        });

        it('should clone buffer if options.clone is true', function() {
            var parser = new Parser()
                .buffer('raw', {
                    length: 8,
                    clone: true
                });

            var buf = new Buffer('deadbeefdeadbeef', 'hex');
            var result = parser.parse(buf);
            assert.deepEqual(result.raw, buf);
            result.raw[0] = 0xff;
            assert.notDeepEqual(result.raw, buf);
        });
    });

    describe('Array parser', function() {
        it('should parse array of primitive types', function(){
            var parser =
                Parser.start()
                .uint8('length')
                .array('message', {
                    length: 'length',
                    type: 'uint8'
                });

            var buffer = new Buffer([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
            assert.deepEqual(parser.parse(buffer), {
                length: 12,
                message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
            });
        });
        it('should parse array of user defined types', function(){
            var elementParser = new Parser()
                .uint8('key')
                .int16le('value');

            var parser =
                Parser.start()
                .uint16le('length')
                .array('message', {
                    length: 'length',
                    type: elementParser
                });

            var buffer = new Buffer([0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04]);
            assert.deepEqual(parser.parse(buffer), {
                length: 0x02,
                message: [
                    {key: 0xca, value: 1234},
                    {key: 0xbe, value: 1235}
                ]
            });
        });
        it('should parse array of arrays', function(){
            var rowParser =
                Parser.start()
                .uint8('length')
                .array('cols', {
                    length: 'length',
                    type: 'int32le'
                });

            var parser =
                Parser.start()
                .uint8('length')
                .array('rows', {
                    length: 'length',
                    type: rowParser
                });

            var buffer = new Buffer(1 + 10 * (1 + 5 * 4));
            var i, j;

            iterator = 0;
            buffer.writeUInt8(10, iterator);
            iterator += 1;
            for (i = 0; i < 10; i++) {
                buffer.writeUInt8(5, iterator);
                iterator += 1;
                for (j = 0; j < 5; j++) {
                    buffer.writeInt32LE(i * j, iterator);
                    iterator += 4;
                }
            }

            assert.deepEqual(parser.parse(buffer), {
                length: 10,
                rows: [
                    { length: 5, cols: [0, 0, 0, 0, 0] },
                    { length: 5, cols: [0, 1, 2, 3, 4] },
                    { length: 5, cols: [0, 2, 4, 6, 8] },
                    { length: 5, cols: [0, 3, 6, 9, 12] },
                    { length: 5, cols: [0, 4, 8, 12, 16] },
                    { length: 5, cols: [0, 5, 10, 15, 20] },
                    { length: 5, cols: [0, 6, 12, 18, 24] },
                    { length: 5, cols: [0, 7, 14, 21, 28] },
                    { length: 5, cols: [0, 8, 16, 24, 32] },
                    { length: 5, cols: [0, 9, 18, 27, 36] }
                ]
            });
        });
        it('should parse until eof when readUnitl is specified', function(){
            var parser =
                Parser.start()
                .array('data', {
                    readUntil: 'eof',
                    type: 'uint8'
                });

            var buffer = new Buffer([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
            assert.deepEqual(parser.parse(buffer), {
                data: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
            });
        });
    });

    describe('Choice parser', function() {
        it('should parse choices of primitive types', function() {
            var parser =
                Parser.start()
                .uint8('tag1')
                .choice('data1', {
                    tag: 'tag1',
                    choices: {
                        0: 'int32le',
                        1: 'int16le'
                    }
                })
                .uint8('tag2')
                .choice('data2', {
                    tag: 'tag2',
                    choices: {
                        0: 'int32le',
                        1: 'int16le'
                    }
                });

            var buffer = new Buffer([0x0, 0x4e, 0x61, 0xbc, 0x00, 0x01, 0xd2, 0x04]);
            assert.deepEqual(parser.parse(buffer), {
                tag1: 0,
                data1: 12345678,
                tag2: 1,
                data2: 1234
            });
        });
        it('should parse default choice', function() {
            var parser =
                Parser.start()
                .uint8('tag')
                .choice('data', {
                    tag: 'tag',
                    choices: {
                        0: 'int32le',
                        1: 'int16le'
                    },
                    defaultChoice: 'uint8'
                })
                .int32le('test');

            buffer = new Buffer([0x03, 0xff, 0x2f, 0xcb, 0x04, 0x0]);
            assert.deepEqual(parser.parse(buffer), {
                tag: 3,
                data: 0xff,
                test: 314159
            });
        });
        it('should parse choices of user defied types', function() {
            var parser =
                Parser.start()
                .uint8('tag')
                .choice('data', {
                    tag: 'tag',
                    choices: {
                        1: Parser.start()
                            .uint8('length')
                            .string('message', {length: 'length'}),
                        3: Parser.start()
                            .int32le('number')
                    }
                });

            var buffer = new Buffer([0x1, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64]);
            assert.deepEqual(parser.parse(buffer), {
                tag: 1,
                data: {
                    length: 12,
                    message: 'hello, world'
                }
            });
            buffer = new Buffer([0x03, 0x4e, 0x61, 0xbc, 0x00]);
            assert.deepEqual(parser.parse(buffer), {
                tag: 3,
                data: {
                    number: 12345678
                }
            });
        });
    });

    describe('Nest parser', function() {
        it('should parse nested parsers', function() {
            var nameParser = new Parser()
                .string('firstName', {
                    zeroTerminated: true
                })
                .string('lastName', {
                    zeroTerminated: true
                });
            var infoParser = new Parser()
                .uint8('age');
            var personParser = new Parser()
                .nest('name', {
                    type: nameParser
                })
                .nest('info', {
                    type: infoParser
                });

            var buffer = Buffer.concat([new Buffer('John\0Doe\0'), new Buffer([0x20])]);
            assert.deepEqual(personParser.parse(buffer), {
                name: {
                    firstName: 'John',
                    lastName: 'Doe'
                },
                info: {
                    age: 0x20
                }
            });
        });
    });

    describe('Constructors', function() {
        it('should create a custom object type', function() {
           function Person () {
             this.name = ''
           };
           Person.prototype.toString = function () { return '[object Person]'; };
           var parser =
               Parser.start()
               .create(Person)
               .string('name', {
                   zeroTerminated: true
               });

           var buffer = new Buffer('John Doe\0');
           var person = parser.parse(buffer);
           assert.ok(person instanceof Person);
           assert.equal(person.name, 'John Doe');
        });
    });

    describe('Utilities', function() {
        it('should count size for fixed size structs', function() {
            var parser =
                Parser.start()
                .int8('a')
                .int32le('b')
                .string('msg', {length: 10})
                .skip(2)
                .array('data', {
                    length: 3,
                    type: 'int8'
                });

            assert.equal(parser.sizeOf(), 1 + 4 + 10 + 2 + 3);
        });
        it('should assert parsed values', function() {
            var parser =
                Parser.start()
                .string('msg', {
                    encoding: 'ascii',
                    zeroTerminated: true,
                    assert: 'hello, world'
                });
            var buffer = new Buffer('68656c6c6f2c20776f726c6400', 'hex');
            assert.doesNotThrow(function() {
                parser.parse(buffer);
            });

            buffer = new Buffer('68656c6c6f2c206a7300', 'hex');
            assert.throws(function() {
                parser.parse(buffer);
            });

            parser = new Parser()
                .int16le('a')
                .int16le('b')
                .int16le('c', {
                    assert: function(x) {
                        return this.a + this.b === x;
                    }
                });

            buffer = new Buffer('d2042e16001b', 'hex');
            assert.doesNotThrow(function() {
                parser.parse(buffer);
            });
            buffer = new Buffer('2e16001bd204', 'hex');
            assert.throws(function() {
                parser.parse(buffer);
            });

        });
        it('should parse asynchronously', function() {
            var parser = new Parser()
                .uint8('len')
                .string('text', {length: 'len', async: true});

            var buf = new Buffer('0c68656c6c6f2c20776f726c64', 'hex');

            parser.parse(buf, function(err, result) {
                assert.deepEqual(result, {len: 12, text: 'hello, world'});
            });
        });
        it('should emit error asynchronously', function() {
            var parser = new Parser()
                .uint8('len')
                .string('text', {length: 'len', async: true});

            var buf = null;

            parser.parse(buf, function(err, result) {
                assert(err);
            });

            parser = new Parser().uint32be('val', {
                assert: function(x) {
                    return x === 0xdeadbeef;
                },
                async: true
            });

            buf = new Buffer('cafebabe', 'hex');

            parser.parse(buf, function(err, result) {
                assert(err);
            });
        });
    });
});
