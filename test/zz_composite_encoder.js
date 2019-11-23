var assert = require('assert');
var util = require('util');
var Parser = require('../dist/binary_parser').Parser;

describe('Composite encoder', function() {
  describe('Array encoder', function() {
    it('should encode array of primitive types', function() {
      var parser = Parser.start()
        .uint8('length')
        .array('message', {
          length: 'length',
          type: 'uint8',
        });

      var buffer = Buffer.from([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 12,
        message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode array of primitive types with lengthInBytes', function() {
      var parser = Parser.start()
        .uint8('length')
        .array('message', {
          lengthInBytes: 'length',
          type: 'uint8',
        });

      var buffer = Buffer.from([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 12,
        message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode array of primitive types with lengthInBytes as a maximum but not minimum', function() {
      var parser = Parser.start()
        .uint8('length')
        .array('message', {
          lengthInBytes: 'length',
          type: 'uint8',
        });
      var encoded = parser.encode({
        length: 5,
        message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // Extra items in array than encoding limit
      });
      assert.deepEqual(encoded, Buffer.from([5, 1, 2, 3, 4, 5]));
      encoded = parser.encode({
        length: 5,
        message: [1, 2, 3], // Less items in array than encoding limit
      });
      assert.deepEqual(encoded, Buffer.from([5, 1, 2, 3]));
    });
    it('should encode array of user defined types', function() {
      var elementParser = new Parser().uint8('key').int16le('value');

      var parser = Parser.start()
        .uint16le('length')
        .array('message', {
          length: 'length',
          type: elementParser,
        });

      var buffer = Buffer.from([
        0x02,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 0x02,
        message: [
          { key: 0xca, value: 1234 },
          { key: 0xbe, value: 1235 },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode array of user defined types with lengthInBytes', function() {
      var elementParser = new Parser().uint8('key').int16le('value');

      var parser = Parser.start()
        .uint16le('length')
        .array('message', {
          lengthInBytes: 'length',
          type: elementParser,
        });

      var buffer = Buffer.from([
        0x06,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 0x06,
        message: [
          { key: 0xca, value: 1234 },
          { key: 0xbe, value: 1235 },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode array of user defined types with length function', function() {
      var elementParser = new Parser().uint8('key').int16le('value');

      var parser = Parser.start()
        .uint16le('length')
        .array('message', {
          length: function() {
            return this.length;
          },
          type: elementParser,
        });

      var buffer = Buffer.from([
        0x02,
        0x00,
        0xca,
        0xd2,
        0x04,
        0xbe,
        0xd3,
        0x04,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 0x02,
        message: [
          { key: 0xca, value: 1234 },
          { key: 0xbe, value: 1235 },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode array of arrays', function() {
      var rowParser = Parser.start()
        .uint8('length')
        .array('cols', {
          length: 'length',
          type: 'int32le',
        });

      var parser = Parser.start()
        .uint8('length')
        .array('rows', {
          length: 'length',
          type: rowParser,
        });

      var buffer = Buffer.alloc(1 + 10 * (1 + 5 * 4));
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

      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
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
          { length: 5, cols: [0, 9, 18, 27, 36] },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode until function returns true when readUntil is function', function() {
      var parser = Parser.start().array('data', {
        readUntil: function(item, buf) {
          return item === 0;
        },
        type: 'uint8',
      });

      var buffer = Buffer.from([
        0xff,
        0xff,
        0xff,
        0x01,
        0x00,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
      ]);
      assert.deepEqual(parser.parse(buffer), {
        data: [0xff, 0xff, 0xff, 0x01, 0x00],
      });
      var encoded = parser.encode({
        ignore1: [0x00, 0x00],
        data: [0xff, 0xff, 0xff, 0x01, 0x00, 0xff, 0xff, 0x00, 0xff],
        ignore2: [0x01, 0x00, 0xff],
      });
      assert.deepEqual(encoded, Buffer.from([0xff, 0xff, 0xff, 0x01, 0x00]));
    });
    it('should not support associative arrays', function() {
      var parser = Parser.start()
        .int8('numlumps')
        .array('lumps', {
          type: Parser.start()
            .int32le('filepos')
            .int32le('size')
            .string('name', { length: 8, encoding: 'ascii' }),
          length: 'numlumps',
          key: 'name',
        });

      assert.throws(function() {
        parser.encode({
          numlumps: 2,
          lumps: {
            AAAAAAAA: {
              filepos: 1234,
              size: 5678,
              name: 'AAAAAAAA',
            },
            bbbbbbbb: {
              filepos: 5678,
              size: 1234,
              name: 'bbbbbbbb',
            },
          },
        });
      }, /Encoding associative array not supported/);
    });
    it('should use encoder to transform encoded array', function() {
      var parser = Parser.start().array('data', {
        type: 'uint8',
        length: 4,
        formatter: function(arr) {
          return arr.join('.');
        },
        encoder: function(str) {
          return str.split('.');
        },
      });

      var buffer = Buffer.from([0x0a, 0x0a, 0x01, 0x6e]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        data: '10.10.1.110',
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to go into recursion', function() {
      var parser = Parser.start()
        .namely('self')
        .uint8('length')
        .array('data', {
          type: 'self',
          length: 'length',
        });

      var buffer = Buffer.from([1, 1, 1, 0]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 1,
        data: [
          {
            length: 1,
            data: [
              {
                length: 1,
                data: [{ length: 0, data: [] }],
              },
            ],
          },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to go into even deeper recursion', function() {
      var parser = Parser.start()
        .namely('self')
        .uint8('length')
        .array('data', {
          type: 'self',
          length: 'length',
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

      var buffer = Buffer.from([
        2,
        /* 0 */ 3,
        /* 0 */ 1,
        /* 0 */ 0,
        /* 1 */ 0,
        /* 2 */ 2,
        /* 0 */ 1,
        /* 0 */ 0,
        /* 1 */ 0,
        /* 1 */ 1,
        /* 0 */ 0,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        length: 2,
        data: [
          {
            length: 3,
            data: [
              { length: 1, data: [{ length: 0, data: [] }] },
              { length: 0, data: [] },
              {
                length: 2,
                data: [
                  { length: 1, data: [{ length: 0, data: [] }] },
                  { length: 0, data: [] },
                ],
              },
            ],
          },
          {
            length: 1,
            data: [{ length: 0, data: [] }],
          },
        ],
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });

    it('should allow parent parser attributes as choice key', function() {
      var ChildParser = Parser.start().choice('data', {
        tag: function(vars) {
          return vars.version;
        },
        choices: {
          1: Parser.start().uint8('v1'),
          2: Parser.start().uint16('v2'),
        },
      });

      var ParentParser = Parser.start()
        .uint8('version')
        .nest('child', { type: ChildParser });

      var buffer = Buffer.from([0x1, 0x2]);
      var decoded = ParentParser.parse(buffer);
      assert.deepEqual(decoded, {
        version: 1,
        child: { data: { v1: 2 } },
      });
      var encoded = ParentParser.encode(decoded);
      assert.deepEqual(encoded, buffer);

      buffer = Buffer.from([0x2, 0x3, 0x4]);
      decoded = ParentParser.parse(buffer);
      assert.deepEqual(decoded, {
        version: 2,
        child: { data: { v2: 0x0304 } },
      });
      encoded = ParentParser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe('Choice encoder', function() {
    it('should encode choices of primitive types', function() {
      var parser = Parser.start()
        .uint8('tag1')
        .choice('data1', {
          tag: 'tag1',
          choices: {
            0: 'int32le',
            1: 'int16le',
          },
        })
        .uint8('tag2')
        .choice('data2', {
          tag: 'tag2',
          choices: {
            0: 'int32le',
            1: 'int16le',
          },
        });

      var buffer = Buffer.from([0x0, 0x4e, 0x61, 0xbc, 0x00, 0x01, 0xd2, 0x04]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag1: 0,
        data1: 12345678,
        tag2: 1,
        data2: 1234,
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should encode default choice', function() {
      var parser = Parser.start()
        .uint8('tag')
        .choice('data', {
          tag: 'tag',
          choices: {
            0: 'int32le',
            1: 'int16le',
          },
          defaultChoice: 'uint8',
        })
        .int32le('test');

      buffer = Buffer.from([0x03, 0xff, 0x2f, 0xcb, 0x04, 0x0]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 3,
        data: 0xff,
        test: 314159,
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should parse choices of user defied types', function() {
      var parser = Parser.start()
        .uint8('tag')
        .choice('data', {
          tag: 'tag',
          choices: {
            1: Parser.start()
              .uint8('length')
              .string('message', { length: 'length' }),
            3: Parser.start().int32le('number'),
          },
        });

      var buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 1,
        data: {
          length: 12,
          message: 'hello, world',
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00]);
      decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 3,
        data: {
          number: 12345678,
        },
      });
      encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to go into recursion', function() {
      var stop = Parser.start();

      var parser = Parser.start()
        .namely('self')
        .uint8('type')
        .choice('data', {
          tag: 'type',
          choices: {
            0: stop,
            1: 'self',
          },
        });

      var buffer = Buffer.from([1, 1, 1, 0]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(parser.parse(buffer), {
        type: 1,
        data: {
          type: 1,
          data: {
            type: 1,
            data: { type: 0, data: {} },
          },
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to go into recursion with simple nesting', function() {
      var stop = Parser.start();

      var parser = Parser.start()
        .namely('self')
        .uint8('type')
        .choice('data', {
          tag: 'type',
          choices: {
            0: stop,
            1: 'self',
            2: Parser.start()
              .nest('left', { type: 'self' })
              .nest('right', { type: stop }),
          },
        });

      var buffer = Buffer.from([2, /* left */ 1, 1, 0 /* right */]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        type: 2,
        data: {
          left: {
            type: 1,
            data: {
              type: 1,
              data: {
                type: 0,
                data: {},
              },
            },
          },
          right: {},
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to refer to other parsers by name', function() {
      var parser = Parser.start().namely('self');

      var stop = Parser.start().namely('stop');

      var twoCells = Parser.start()
        .namely('twoCells')
        .nest('left', { type: 'self' })
        .nest('right', { type: 'stop' });

      parser.uint8('type').choice('data', {
        tag: 'type',
        choices: {
          0: 'stop',
          1: 'self',
          2: 'twoCells',
        },
      });

      var buffer = Buffer.from([2, /* left */ 1, 1, 0 /* right */]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        type: 2,
        data: {
          left: {
            type: 1,
            data: { type: 1, data: { type: 0, data: {} } },
          },
          right: {},
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to refer to other parsers both directly and by name', function() {
      var parser = Parser.start().namely('self');

      var stop = Parser.start();

      var twoCells = Parser.start()
        .nest('left', { type: 'self' })
        .nest('right', { type: stop });

      parser.uint8('type').choice('data', {
        tag: 'type',
        choices: {
          0: stop,
          1: 'self',
          2: twoCells,
        },
      });

      var buffer = Buffer.from([2, /* left */ 1, 1, 0 /* right */]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        type: 2,
        data: {
          left: {
            type: 1,
            data: { type: 1, data: { type: 0, data: {} } },
          },
          right: {},
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to go into recursion with complex nesting', function() {
      var stop = Parser.start();

      var parser = Parser.start()
        .namely('self')
        .uint8('type')
        .choice('data', {
          tag: 'type',
          choices: {
            0: stop,
            1: 'self',
            2: Parser.start()
              .nest('left', { type: 'self' })
              .nest('right', { type: 'self' }),
            3: Parser.start()
              .nest('one', { type: 'self' })
              .nest('two', { type: 'self' })
              .nest('three', { type: 'self' }),
          },
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

      var buffer = Buffer.from([
        2,
        /* left -> */ 3,
        /* one   -> */ 1,
        /* -> */ 0,
        /* two   -> */ 0,
        /* three -> */ 2,
        /* left  -> */ 1,
        /* -> */ 0,
        /* right -> */ 0,
        /* right -> */ 1,
        /* -> */ 0,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        type: 2,
        data: {
          left: {
            type: 3,
            data: {
              one: { type: 1, data: { type: 0, data: {} } },
              two: { type: 0, data: {} },
              three: {
                type: 2,
                data: {
                  left: { type: 1, data: { type: 0, data: {} } },
                  right: { type: 0, data: {} },
                },
              },
            },
          },
          right: {
            type: 1,
            data: { type: 0, data: {} },
          },
        },
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should be able to 'flatten' choices when using null varName", function() {
      var parser = Parser.start()
        .uint8('tag')
        .choice(null, {
          tag: 'tag',
          choices: {
            1: Parser.start()
              .uint8('length')
              .string('message', { length: 'length' }),
            3: Parser.start().int32le('number'),
          },
        });

      var buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 1,
        length: 12,
        message: 'hello, world',
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00]);
      decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 3,
        number: 12345678,
      });
      encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should be able to 'flatten' choices when omitting varName paramater", function() {
      var parser = Parser.start()
        .uint8('tag')
        .choice({
          tag: 'tag',
          choices: {
            1: Parser.start()
              .uint8('length')
              .string('message', { length: 'length' }),
            3: Parser.start().int32le('number'),
          },
        });

      var buffer = Buffer.from([
        0x1,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 1,
        length: 12,
        message: 'hello, world',
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
      buffer = Buffer.from([0x03, 0x4e, 0x61, 0xbc, 0x00]);
      decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        tag: 3,
        number: 12345678,
      });
      encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it('should be able to use function as the choice selector', function() {
      var parser = Parser.start()
        .string('selector', { length: 4 })
        .choice(null, {
          tag: function() {
            return parseInt(this.selector, 2); // string base 2 to integer decimal
          },
          choices: {
            2: Parser.start()
              .uint8('length')
              .string('message', { length: 'length' }),
            7: Parser.start().int32le('number'),
          },
        });

      var buffer = Buffer.from([
        48,
        48,
        49,
        48,
        0xc,
        0x68,
        0x65,
        0x6c,
        0x6c,
        0x6f,
        0x2c,
        0x20,
        0x77,
        0x6f,
        0x72,
        0x6c,
        0x64,
      ]);
      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        selector: '0010', // -> choice 2
        length: 12,
        message: 'hello, world',
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
      buffer = Buffer.from([48, 49, 49, 49, 0x4e, 0x61, 0xbc, 0x00]);
      decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        selector: '0111', // -> choice 7
        number: 12345678,
      });
      encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe('Nest parser', function() {
    it('should encode nested parsers', function() {
      var nameParser = new Parser()
        .string('firstName', {
          zeroTerminated: true,
        })
        .string('lastName', {
          zeroTerminated: true,
        });
      var infoParser = new Parser().uint8('age');
      var personParser = new Parser()
        .nest('name', {
          type: nameParser,
        })
        .nest('info', {
          type: infoParser,
        });

      var buffer = Buffer.concat([
        Buffer.from('John\0Doe\0'),
        Buffer.from([0x20]),
      ]);
      var person = personParser.parse(buffer);
      assert.deepEqual(person, {
        name: {
          firstName: 'John',
          lastName: 'Doe',
        },
        info: {
          age: 0x20,
        },
      });
      var encoded = personParser.encode(person);
      assert.deepEqual(encoded, buffer);
    });

    it('should format parsed nested parser', function() {
      var nameParser = new Parser()
        .string('firstName', {
          zeroTerminated: true,
        })
        .string('lastName', {
          zeroTerminated: true,
        });
      var personParser = new Parser().nest('name', {
        type: nameParser,
        formatter: function(name) {
          return name.firstName + ' ' + name.lastName;
        },
        encoder: function(name) {
          // Reverse of aboce formatter
          var names = name.split(' ');
          return { firstName: names[0], lastName: names[1] };
        },
      });

      var buffer = Buffer.from('John\0Doe\0');
      var person = personParser.parse(buffer);
      assert.deepEqual(person, {
        name: 'John Doe',
      });
      var encoded = personParser.encode(person);
      assert.deepEqual(encoded, buffer);
    });

    it("should 'flatten' output when using null varName", function() {
      var parser = new Parser()
        .string('s1', { zeroTerminated: true })
        .nest(null, {
          type: new Parser().string('s2', { zeroTerminated: true }),
        });

      var buf = Buffer.from('foo\0bar\0');
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, { s1: 'foo', s2: 'bar' });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);
    });

    it("should 'flatten' output when omitting varName", function() {
      var parser = new Parser().string('s1', { zeroTerminated: true }).nest({
        type: new Parser().string('s2', { zeroTerminated: true }),
      });

      var buf = Buffer.from('foo\0bar\0');
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, { s1: 'foo', s2: 'bar' });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);
    });
  });

  describe('Buffer encoder', function() {
    //this is a test for testing a fix of a bug, that removed the last byte of the
    //buffer parser
    it('should return a buffer with same size', function() {
      var bufferParser = new Parser().buffer('buf', {
        readUntil: 'eof',
        formatter: function(buffer) {
          return buffer;
        },
      });

      var buffer = Buffer.from('John\0Doe\0');
      var decoded = bufferParser.parse(buffer);
      assert.deepEqual(decoded, { buf: buffer });
      var encoded = bufferParser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe('Constructors', function() {
    it('should create a custom object type', function() {
      function Person() {
        this.name = '';
      }
      Person.prototype.toString = function() {
        return '[object Person]';
      };
      var parser = Parser.start()
        .create(Person)
        .string('name', {
          zeroTerminated: true,
        });

      var buffer = Buffer.from('John Doe\0');
      var person = parser.parse(buffer);
      assert.ok(person instanceof Person);
      assert.equal(person.name, 'John Doe');
      var encoded = parser.encode(person);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe('encode other fields after bit', function() {
    it('Encode uint8', function() {
      var buffer = Buffer.from([0, 1, 0, 4]);
      for (var i = 17; i <= 24; i++) {
        var parser = Parser.start()
          ['bit' + i]('a')
          .uint8('b');
        var decoded = parser.parse(buffer);
        assert.deepEqual(decoded, {
          a: 1 << (i - 16),
          b: 4,
        });
        var encoded = parser.encode(decoded);
        assert.deepEqual(encoded, buffer);
      }
    });
  });
});
