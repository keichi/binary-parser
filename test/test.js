var assert = require('assert');
var util = require('util');
var Parser = require('../lib/bang').Parser;

describe('Parser', function(){
    describe('Primitive parsers', function(){
        it('should nothing', function(){
            var parser = Parser.start();

            var buffer = new Buffer([0xa, 0x14, 0x1e, 0x28, 0x32]);
            assert.deepEqual(parser.parse(buffer), {});
        });
        it('should parse primitive types', function(){
            var parser =
            Parser.start()
            .uint8('a')
            .int16le('b')
            .uint32be('c');

            var buffer = new Buffer([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
            assert.deepEqual(parser.parse(buffer), {a: 0, b: 1234, c: 12345678});
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

    describe('Size counter', function() {
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
    });
});
