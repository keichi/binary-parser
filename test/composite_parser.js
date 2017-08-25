var assert = require('assert');
var util = require('util');
var Parser = require('../lib/binary_parser').Parser;

describe('Composite parser', function(){
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
        it('should parse array of primitive types with lengthInBytes', function(){
            var parser =
                Parser.start()
                .uint8('length')
                .array('message', {
                    lengthInBytes: 'length',
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
        it('should parse array of user defined types with lengthInBytes', function(){
            var elementParser = new Parser()
                .uint8('key')
                .int16le('value');

            var parser =
                Parser.start()
                .uint16le('length')
                .array('message', {
                    lengthInBytes: 'length',
                    type: elementParser
                });

            var buffer = new Buffer([0x06, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04]);
            assert.deepEqual(parser.parse(buffer), {
                length: 0x06,
                message: [
                    {key: 0xca, value: 1234},
                    {key: 0xbe, value: 1235}
                ]
            });
        });
        it('should parse array of user defined types with lengthInBytes literal', function(){
            var elementParser = new Parser()
                .uint8('key')
                .int16le('value');

            var parser =
                Parser.start()
                .array('message', {
                    lengthInBytes: 0x06,
                    type: elementParser
                });

            var buffer = new Buffer([0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04]);
            assert.deepEqual(parser.parse(buffer), {
                message: [
                    {key: 0xca, value: 1234},
                    {key: 0xbe, value: 1235}
                ]
            });
        });
        it('should parse array of user defined types with lengthInBytes function', function(){
            var elementParser = new Parser()
                .uint8('key')
                .int16le('value');

            var parser =
                Parser.start()
                .uint16le('length')
                .array('message', {
                    lengthInBytes: function() { return this.length; },
                    type: elementParser
                });

            var buffer = new Buffer([0x06, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04]);
            assert.deepEqual(parser.parse(buffer), {
                length: 0x06,
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
        it('should parse until eof when readUntil is specified', function(){
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
        it('should parse until function returns true when readUntil is function', function(){
            var parser =
                Parser.start()
                .array('data', {
                    readUntil: function (item, buf) { return item === 0 },
                    type: 'uint8'
                });

            var buffer = new Buffer([0xff, 0xff, 0xff, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff]);
            assert.deepEqual(parser.parse(buffer), {
                data: [0xff, 0xff, 0xff, 0x01, 0x00]
            });
        });
        it('should parse until function returns true when readUntil is function (using read-ahead)', function(){
            var parser =
                Parser.start()
                .array('data', {
                    readUntil: function (item, buf) { return buf.length > 0 && buf.readUInt8(0) === 0 },
                    type: 'uint8'
                });

            var buffer = new Buffer([0xff, 0xff, 0xff, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff]);
            assert.deepEqual(parser.parse(buffer), {
                data: [0xff, 0xff, 0xff, 0x01]
            });
        });
        it('should parse associative arrays', function(){
            var parser =
                Parser.start()
                .int8('numlumps')
                .array('lumps', {
                    type: Parser.start()
                        .int32le('filepos')
                        .int32le('size')
                        .string('name', { length: 8, encoding : 'ascii'}),
                    length: 'numlumps',
                    key: 'name'
                });

            var buffer = new Buffer([0x02,
                                     0xd2, 0x04, 0x00, 0x00, 0x2e, 0x16, 0x00, 0x00,
                                     0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
                                     0x2e, 0x16, 0x00, 0x00, 0xd2, 0x04, 0x00, 0x00,
                                     0x62, 0x62, 0x62, 0x62, 0x62, 0x62, 0x62, 0x62,
                                    ]);
            assert.deepEqual(parser.parse(buffer), {
                numlumps: 2,
                lumps: {
                    "AAAAAAAA": {
                        filepos: 1234,
                        size: 5678,
                        name: "AAAAAAAA"
                    },
                    "bbbbbbbb": {
                        filepos: 5678,
                        size: 1234,
                        name: "bbbbbbbb"
                    }
                }
            });
        });
        it('should use formatter to transform parsed array', function(){
            var parser =
                Parser.start()
                .array('data', {
                    type: 'uint8',
                    length: 4,
                    formatter: function(arr) { return arr.join('.'); }
                });

            var buffer = new Buffer([0x0a, 0x0a, 0x01, 0x6e]);
            assert.deepEqual(parser.parse(buffer), {
                data: '10.10.1.110'
            });
        });
        it('should be able to go into recursion', function(){
            var parser =
                Parser.start().namely('self')
                .uint8('length')
                .array('data', {
                    type: 'self',
                    length: 'length'
                });

            var buffer = new Buffer([ 1, 1, 1, 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                length: 1,
                data: [ {
                    length: 1,
                    data: [ {
                        length: 1,
                        data: [ { length: 0, data: [] } ]
                    } ]
                } ]
            });
        });
        it('should be able to go into even deeper recursion', function(){
            var parser =
                Parser.start().namely('self')
                .uint8('length')
                .array('data', {
                    type: 'self',
                    length: 'length'
                });

            //        2
            //       / \
            //      3   1
            //    / | \  \
            //   1  0  2  0
            //  /     / \
            // 0     1   0
            //      /
            //     0

            var buffer = new Buffer([ 2,
                                    /* 0 */ 3,
                                        /* 0 */ 1,
                                            /* 0 */ 0,
                                        /* 1 */ 0,
                                        /* 2 */ 2,
                                            /* 0 */ 1,
                                                /* 0 */ 0,
                                            /* 1 */ 0,
                                    /* 1 */ 1,
                                        /* 0 */ 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                length: 2,
                data: [ {
                    length: 3,
                    data: [ { length: 1, data: [ { length: 0, data: [] } ] },
                            { length: 0, data: [] },
                            { length: 2, data: [ { length: 1, data: [ { length: 0, data: [] } ] },
                                                 { length: 0, data: [] } ] } ]
                }, {
                    length: 1,
                    data: [ { length: 0, data: [] } ]
                } ]
            });
        });

        it('should allow parent parser attributes as choice key', function() {
            var ChildParser = Parser.start()
                .choice('data', {
                    tag: function(vars) {
                        return vars.version;
                    },
                    choices: {
                        1: Parser.start().uint8('v1'),
                        2: Parser.start().uint16('v2'),
                    }
                });

            var ParentParser = Parser.start()
                .uint8('version')
                .nest('child', { type: ChildParser });

            var buffer = new Buffer([0x1, 0x2]);
            assert.deepEqual(ParentParser.parse(buffer), {
                version: 1, child: { data: { v1: 2 } }
            });

            buffer = new Buffer([0x2, 0x3, 0x4]);
            assert.deepEqual(ParentParser.parse(buffer), {
                version: 2, child: { data: { v2: 0x0304 } }
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
        it('should be able to go into recursion', function(){
            var stop = Parser.start();

            var parser =
                Parser.start().namely('self')
                .uint8('type')
                .choice('data', {
                    'tag': 'type',
                    'choices': {
                        0: stop,
                        1: 'self'
                    }
                });

            var buffer = new Buffer([ 1, 1, 1, 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                type: 1,
                data: {
                    type: 1,
                    data: {
                        type: 1,
                        data: { type: 0, data: {} }
                    }
                }
            });
        });
        it('should be able to go into recursion with simple nesting', function(){
            var stop = Parser.start();

            var parser =
                Parser.start().namely('self')
                .uint8('type')
                .choice('data', {
                    'tag': 'type',
                    'choices': {
                        0: stop,
                        1: 'self',
                        2: Parser.start().nest('left',  { type: 'self' })
                                         .nest('right', { type: stop })
                    }
                });

            var buffer = new Buffer([ 2,
                                        /* left */  1, 1, 0,
                                        /* right */ 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                type: 2,
                data: {
                    left: {
                        type: 1,
                        data: { type: 1, data: { type: 0, data: {} } },
                    },
                    right: { }
                }
            });
        });
        it('should be able to refer to other parsers by name', function(){
            var parser = Parser.start().namely('self');

            var stop = Parser.start().namely('stop');

            var twoCells = Parser.start().namely('twoCells')
                                         .nest('left',  { type: 'self' })
                                         .nest('right', { type: 'stop' })

            parser
                .uint8('type')
                .choice('data', {
                    'tag': 'type',
                    'choices': {
                        0: 'stop',
                        1: 'self',
                        2: 'twoCells'
                    }
                });

            var buffer = new Buffer([ 2,
                                        /* left */  1, 1, 0,
                                        /* right */ 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                type: 2,
                data: {
                    left: {
                        type: 1,
                        data: { type: 1, data: { type: 0, data: {} } },
                    },
                    right: { }
                }
            });
        });
        it('should be able to refer to other parsers both directly and by name', function(){
            var parser = Parser.start().namely('self');

            var stop = Parser.start();

            var twoCells = Parser.start().nest('left',  { type: 'self' })
                                         .nest('right', { type: stop })

            parser
                .uint8('type')
                .choice('data', {
                    'tag': 'type',
                    'choices': {
                        0: stop,
                        1: 'self',
                        2: twoCells
                    }
                });

            var buffer = new Buffer([ 2,
                                        /* left */  1, 1, 0,
                                        /* right */ 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                type: 2,
                data: {
                    left: {
                        type: 1,
                        data: { type: 1, data: { type: 0, data: {} } },
                    },
                    right: { }
                }
            });
        });
        it('should be able to go into recursion with complex nesting', function(){
            var stop = Parser.start();

            var parser =
                Parser.start().namely('self')
                .uint8('type')
                .choice('data', {
                    'tag': 'type',
                    'choices': {
                        0: stop,
                        1: 'self',
                        2: Parser.start().nest('left',  { type: 'self' })
                                         .nest('right', { type: 'self' }),
                        3: Parser.start().nest('one',   { type: 'self' })
                                         .nest('two',   { type: 'self' })
                                         .nest('three', { type: 'self' })
                    }
                });

            //        2
            //       / \
            //      3   1
            //    / | \  \
            //   1  0  2  0
            //  /     / \
            // 0     1   0
            //      /
            //     0

            var buffer = new Buffer([ 2,
                                    /* left -> */ 3,
                                        /* one   -> */ 1, /* -> */ 0,
                                        /* two   -> */ 0,
                                        /* three -> */ 2,
                                            /* left  -> */ 1, /* -> */ 0,
                                            /* right -> */ 0,
                                    /* right -> */ 1, /* -> */ 0 ]);
            assert.deepEqual(parser.parse(buffer), {
                type: 2,
                data: {
                    left: {
                        type: 3,
                        data: {
                            one: { type: 1, data: { type: 0, data: {} } },
                            two: { type: 0, data: {} },
                            three: { type: 2,
                                     data: {
                                        left: { type: 1, data: { type: 0, data: {} } },
                                        right: { type: 0, data: {} }
                                     } },
                        }
                    },
                    right: {
                        type: 1,
                        data: { type: 0, data: {} }
                    }
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

        it('should format parsed nested parser', function() {
            var nameParser = new Parser()
                .string('firstName', {
                    zeroTerminated: true
                })
                .string('lastName', {
                    zeroTerminated: true
                });
            var personParser = new Parser()
                .nest('name', {
                    type: nameParser,
                    formatter: function(name) { return name.firstName + ' ' + name.lastName }
                })

            var buffer = new Buffer('John\0Doe\0');
            assert.deepEqual(personParser.parse(buffer), {
                name: 'John Doe'
            });
        });
    });

    describe('Buffer parser', function() {
            //this is a test for testing a fix of a bug, that removed the last byte of the
            //buffer parser
            it('should return a buffer with same size', function() {

                var bufferParser = new Parser()
                    .buffer('buf', {
                        readUntil: 'eof',
                        formatter: function(buffer) {
                            return buffer;
                        }
                    })

                var buffer = new Buffer('John\0Doe\0');
                assert.deepEqual(bufferParser.parse(buffer),{buf:buffer});
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
                })
                .buffer('raw', {length:8});

            assert.equal(parser.sizeOf(), 1 + 4 + 10 + 2 + 3 + 8);
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
    });

    describe('Parse other fields after bit', function() {
        it('Parse uint8', function() {
            var buffer = new Buffer([0, 1, 0, 4]);
            for (var i = 17; i <= 24; i++) {
                var parser =
                    Parser.start()['bit' + i]('a').uint8('b');

                assert.deepEqual(parser.parse(buffer), {
                    a: 1 << (i - 16),
                    b: 4,
                });
            }
        });
    });
});
