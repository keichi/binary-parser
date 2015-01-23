var assert = require('assert');
var util = require('util');
var Parser = require('../lib/binary_parser').Parser;

describe('Primitive parser', function(){
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
        it('should use formatter to transform parsed integer', function(){
            var parser =
            Parser.start()
            .uint8('a', {
                formatter: function(val) { return val * 2; }
            })
            .int16le('b', {
                formatter: function(val) { return "test" + String(val); }
            });

            var buffer = new Buffer([0x01, 0xd2, 0x04]);
            assert.deepEqual(parser.parse(buffer), {a: 2, b: "test1234"});
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
});
