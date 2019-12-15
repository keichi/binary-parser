var assert = require('assert');
var Parser = require('../dist/binary_parser').Parser;

describe('Specific bugs testing', function() {
  describe('Array encoder with readUntil', function() {
    it('should limit to array length even if readUntil is never true', function() {
      var parser = Parser.start()
        .uint16('len')
        .array('payloads', {
          type: new Parser().uint8('cmd').array('params', {
            type: new Parser().uint8('param'),
            readUntil: function(item, buffer) {
              return buffer.length == 2; // Stop when 2 bytes left in parsed buffer
            },
          }),
          lengthInBytes: function() {
            return this.len - 4;
          },
        })
        .uint16('crc');

      var buffer = Buffer.from('0008AAB1B2B3FFFF', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177,
              },
              {
                param: 178,
              },
              {
                param: 179,
              },
            ],
          },
        ],
        crc: 65535,
      });

      var encoded;
      // Although readUntil is never true here, the encoding will be good
      assert.doesNotThrow(function() {
        encoded = parser.encode(decoded);
      });
      assert.deepEqual(encoded, buffer);
    });

    it('is not the reverse of parsing when readUntil gives false information', function() {
      var parser = Parser.start()
        .uint16('len')
        .array('payloads', {
          type: new Parser().uint8('cmd').array('params', {
            type: new Parser().uint8('param'),
            readUntil: function(item, buffer) {
              return buffer.length <= 2; // Stop when 2 bytes left in buffer
            },
          }),
          lengthInBytes: function() {
            return this.len - 4;
          },
        })
        .uint16('crc');

      var buffer = Buffer.from('0008AAB1B2B3FFFF', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177,
              },
              {
                param: 178,
              },
              {
                param: 179,
              },
            ],
          },
        ],
        crc: 0xffff,
      });

      var encoded = parser.encode(decoded);
      // Missing parms 178 and 179 as readUntil will be true at first run
      assert.deepEqual(encoded, Buffer.from('0008AAB1FFFF', 'hex'));
    });

    it('should ignore readUntil when encodeUntil is provided', function() {
      var parser = Parser.start()
        .uint16('len')
        .array('payloads', {
          type: new Parser().uint8('cmd').array('params', {
            type: new Parser().uint8('param'),
            readUntil: function(item, buffer) {
              return buffer.length == 2; // Stop when 2 bytes left in buffer
            },
            encodeUntil: function(item, obj) {
              return item.param === 178; // Stop encoding when value 178 is reached
            },
          }),
          lengthInBytes: function() {
            return this.len - 4;
          },
        })
        .uint16('crc');

      var buffer = Buffer.from('0008AAB1B2B3FFFF', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177,
              },
              {
                param: 178,
              },
              {
                param: 179,
              },
            ],
          },
        ],
        crc: 0xffff,
      });

      var encoded = parser.encode(decoded);
      // Missing parms 179 as encodeUntil stops at 178
      assert.deepEqual(encoded, Buffer.from('0008AAB1B2FFFF', 'hex'));
    });

    it('should accept readUntil=eof and no encodeUntil provided', function() {
      var parser = Parser.start().array('arr', {
        type: 'uint8',
        readUntil: 'eof', // Read until end of buffer
      });

      var buffer = Buffer.from('01020304050607', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: [1, 2, 3, 4, 5, 6, 7],
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from('01020304050607', 'hex'));
    });

    it('should accept empty array to encode', function() {
      var parser = Parser.start().array('arr', {
        type: 'uint8',
        readUntil: 'eof', // Read until end of buffer
      });

      var buffer = Buffer.from('', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: [],
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from('', 'hex'));
    });

    it('should accept empty array to encode and encodeUntil function', function() {
      var parser = Parser.start().array('arr', {
        type: 'uint8',
        readUntil: 'eof', // Read until end of buffer
        encodeUntil: function(item, obj) {
          return false; // Never stop on content value
        },
      });

      var buffer = Buffer.from('', 'hex');
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: [],
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from('', 'hex'));
    });

    it('should accept undefined or null array', function() {
      var parser = Parser.start().array('arr', {
        type: 'uint8',
        readUntil: 'eof', // Read until end of buffer
      });

      var buffer = Buffer.from('', 'hex');
      var decoded = parser.parse(buffer);

      // Decode an empty buffer as an empty array
      assert.deepEqual(decoded, {
        arr: [],
      });

      // Encode undefined, null or empty array as an empty buffer
      [{}, { arr: undefined }, { arr: null }, { arr: [] }].forEach(data => {
        let encoded = parser.encode(data);
        assert.deepEqual(encoded, Buffer.from('', 'hex'));
      });
    });
  });

  describe('Issue #19 Little endianess incorrect', function() {
    let binaryLiteral = function(s) {
      var i;
      var bytes = [];

      s = s.replace(/\s/g, '');
      for (i = 0; i < s.length; i += 8) {
        bytes.push(parseInt(s.slice(i, i + 8), 2));
      }

      return Buffer.from(bytes);
    };
    it('should parse 4-byte-length bit field sequence wit little endian', function() {
      let buf = binaryLiteral('0000000000001111 1010000110100010'); // 000F A1A2

      // Parsed as two uint16 with little-endian (BYTES order)
      let parser1 = new Parser().uint16le('a').uint16le('b');

      // Parsed as two 16 bits fields with little-endian
      let parser2 = new Parser()
        .endianess('little')
        .bit16('a')
        .bit16('b');

      let parsed1 = parser1.parse(buf);
      let parsed2 = parser2.parse(buf);

      assert.deepEqual(parsed1, {
        a: 0x0f00, // 000F
        b: 0xa2a1, // A1A2
      });

      assert.deepEqual(parsed2, {
        a: 0xa1a2, // last 16 bits (but value coded as BE)
        b: 0x000f, // first 16 bits  (but value coded as BE)
      });

      /* This is a little confusing. The endianess with bits fields affect the order of fields */
    });
    it('should encode bit ranges with little endian correctly', function() {
      let bigParser = Parser.start()
        .endianess('big')
        .bit4('a')
        .bit1('b')
        .bit1('c')
        .bit1('d')
        .bit1('e')
        .uint16('f')
        .array('g', { type: 'uint8', readUntil: 'eof' });
      let littleParser = Parser.start()
        .endianess('little')
        .bit4('a')
        .bit1('b')
        .bit1('c')
        .bit1('d')
        .bit1('e')
        .uint16('f')
        .array('g', { type: 'uint8', readUntil: 'eof' });
      // Parser definition for a symetric encoding/decoding of little-endian bit fields
      let little2Parser = Parser.start()
        .endianess('little')
        .encoderSetOptions({ bitEndianess: true })
        .bit4('a')
        .bit1('b')
        .bit1('c')
        .bit1('d')
        .bit1('e')
        .uint16('f')
        .array('g', { type: 'uint8', readUntil: 'eof' });

      let data = binaryLiteral(
        '0011 0 1 0 1 0000000011111111 00000001 00000010 00000011'
      ); // 35 00FF 01 02 03
      // in big endian:            3 0 1 0 1             00FF        1        2        3
      // in little endian:         3 0 1 0 1             FF00        1        2        3
      // LE with encoderBitEndianess option:
      //                           5 1 1 0 0             FF00        1        2        3

      //let bigDecoded = bigParser.parse(data);
      //let littleDecoded = littleParser.parse(data);
      let little2Decoded = little2Parser.parse(data);

      //console.log(bigDecoded);
      //console.log(littleDecoded);
      //console.log(little2Decoded);

      let big = {
        a: 3,
        b: 0,
        c: 1,
        d: 0,
        e: 1,
        f: 0x00ff,
        g: [1, 2, 3],
      };
      let little = {
        a: 3,
        b: 0,
        c: 1,
        d: 0,
        e: 1,
        f: 0xff00,
        g: [1, 2, 3],
      };
      let little2 = {
        a: 5,
        b: 1,
        c: 1,
        d: 0,
        e: 0,
        f: 0xff00,
        g: [1, 2, 3],
      };

      assert.deepEqual(little2Decoded, little2);

      let bigEncoded = bigParser.encode(big);
      let littleEncoded = littleParser.encode(little);
      let little2Encoded = little2Parser.encode(little2);

      //console.log(bigEncoded);
      //console.log(littleEncoded);
      //console.log(little2Encoded);

      assert.deepEqual(bigEncoded, data);
      assert.deepEqual(littleEncoded, data);
      assert.deepEqual(little2Encoded, data);
    });
  });

  describe('Issue #20 Encoding fixed length null terminated or strip null strings', function() {
    it('should encode zero terminated fixed-length string', function() {
      // In that case parsing and encoding are not  the exact oposite
      let buffer = Buffer.from(
        '\u0000A\u0000AB\u0000ABC\u0000ABCD\u0000ABCDE\u0000'
      );
      let parser = Parser.start()
        .string('a', { length: 4, zeroTerminated: true })
        .string('b', { length: 4, zeroTerminated: true })
        .string('c', { length: 4, zeroTerminated: true })
        .string('d', { length: 4, zeroTerminated: true })
        .string('e', { length: 4, zeroTerminated: true })
        .string('f', { length: 4, zeroTerminated: true })
        .string('g', { length: 4, zeroTerminated: true })
        .string('h', { length: 4, zeroTerminated: true });

      let decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        a: '',
        b: 'A',
        c: 'AB',
        d: 'ABC',
        e: 'ABCD',
        f: '',
        g: 'ABCD',
        h: 'E',
      });

      let encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });

    it('should encode fixed-length string with stripNull', function() {
      let parser = Parser.start()
        .string('a', { length: 8, zeroTerminated: false, stripNull: true })
        .string('b', { length: 8, zeroTerminated: false, stripNull: true })
        .string('z', { length: 2, zeroTerminated: false, stripNull: true });
      let buffer = Buffer.from('ABCD\u0000\u0000\u0000\u000012345678ZZ');
      let decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        a: 'ABCD',
        b: '12345678',
        z: 'ZZ',
      });
      let encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
  });
});
