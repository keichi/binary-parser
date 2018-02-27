var assert = require("assert");
var util = require("util");
var Parser = require("../lib/binary_parser").Parser;

describe("Primitive encoder", function() {
  describe("Primitive encoders", function() {
    it("should nothing", function() {
      var parser = Parser.start();

      var buffer = parser.encode({ a: 0, b: 1 });
      assert.deepEqual(buffer.length, 0);
    });
    it("should encode integer types", function() {
      var parser = Parser.start()
        .uint8("a")
        .int16le("b")
        .uint32be("c");

      var buffer = Buffer.from([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
      var parsed = parser.parse(buffer);
      var encoded = parser.encode(parsed);
      assert.deepEqual(parsed, { a: 0, b: 1234, c: 12345678 });
      assert.deepEqual(encoded, buffer);
    });
    it("should use encoder to transform to integer", function() {
      var parser = Parser.start()
        .uint8("a", {
          formatter: function(val) {
            return val * 2;
          },
          encoder: function(val) {
            return val / 2;
          }
        })
        .int16le("b", {
          formatter: function(val) {
            return "test" + String(val);
          },
          encoder: function(val) {
            return parseInt(val.substr("test".length));
          }
        });

      var buffer = Buffer.from([0x01, 0xd2, 0x04]);
      var parsed = parser.parse(buffer);
      var parsedClone = Object.assign({}, parsed);
      var encoded = parser.encode(parsedClone);
      assert.deepEqual(parsed, { a: 2, b: "test1234" });
      assert.deepEqual(encoded, buffer);
    });
    it("should encode floating point types", function() {
      var parser = Parser.start()
        .floatbe("a")
        .doublele("b");

      var FLT_EPSILON = 0.00001;
      var buffer = Buffer.from([
        0x41,
        0x45,
        0x85,
        0x1f,
        0x7a,
        0x36,
        0xab,
        0x3e,
        0x57,
        0x5b,
        0xb1,
        0xbf
      ]);
      var result = parser.parse(buffer);

      assert(Math.abs(result.a - 12.345) < FLT_EPSILON);
      assert(Math.abs(result.b - -0.0678) < FLT_EPSILON);
      var encoded = parser.encode(result);
      assert.deepEqual(encoded, buffer);
    });
    it("should handle endianess", function() {
      var parser = Parser.start()
        .int32le("little")
        .int32be("big");

      var buffer = Buffer.from([
        0x4e,
        0x61,
        0xbc,
        0x00,
        0x00,
        0xbc,
        0x61,
        0x4e
      ]);
      var parsed = parser.parse(buffer);
      assert.deepEqual(parsed, {
        little: 12345678,
        big: 12345678
      });
      var encoded = parser.encode(parsed);
      assert.deepEqual(encoded, buffer);
    });
    it("should skip when specified", function() {
      var parser = Parser.start()
        .uint8("a")
        .skip(3)
        .uint16le("b")
        .uint32be("c");

      var buffer = Buffer.from([
        0x00,
        0x00, // Skipped will be encoded as Null
        0x00, // Skipped will be encoded as Null
        0x00, // Skipped will be encoded as Null
        0xd2,
        0x04,
        0x00,
        0xbc,
        0x61,
        0x4e
      ]);
      var parsed = parser.parse(buffer);
      assert.deepEqual(parsed, { a: 0, b: 1234, c: 12345678 });
      var encoded = parser.encode(parsed);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe("Bit field encoders", function() {
    var binaryLiteral = function(s) {
      var i;
      var bytes = [];

      s = s.replace(/\s/g, "");
      for (i = 0; i < s.length; i += 8) {
        bytes.push(parseInt(s.slice(i, i + 8), 2));
      }

      return Buffer.from(bytes);
    };

    it("binary literal helper should work", function() {
      assert.deepEqual(binaryLiteral("11110000"), Buffer.from([0xf0]));
      assert.deepEqual(
        binaryLiteral("11110000 10100101"),
        Buffer.from([0xf0, 0xa5])
      );
    });

    it("should encode 1-byte-length bit field sequence", function() {
      var parser = new Parser()
        .bit1("a")
        .bit2("b")
        .bit4("c")
        .bit1("d");

      var buf = binaryLiteral("1 10 1010 0");
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, {
        a: 1,
        b: 2,
        c: 10,
        d: 0
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);

      // Endianess will change nothing you still specify bits for left to right
      parser = new Parser()
        .endianess("little")
        .bit1("a")
        .bit2("b")
        .bit4("c")
        .bit1("d");

      encoded = parser.encode({
        a: 1,
        b: 2,
        c: 10,
        d: 0
      });
      assert.deepEqual(encoded, buf);
    });
    it("should parse 2-byte-length bit field sequence", function() {
      var parser = new Parser()
        .bit3("a")
        .bit9("b")
        .bit4("c");

      var buf = binaryLiteral("101 111000111 0111");
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, {
        a: 5,
        b: 455,
        c: 7
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);
    });
    it("should parse 4-byte-length bit field sequence", function() {
      var parser = new Parser()
        .bit1("a")
        .bit24("b")
        .bit4("c")
        .bit2("d")
        .bit1("e");
      var buf = binaryLiteral("1 101010101010101010101010 1111 01 1");
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, {
        a: 1,
        b: 11184810,
        c: 15,
        d: 1,
        e: 1
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);
    });
    it("should parse nested bit fields", function() {
      var parser = new Parser().bit1("a").nest("x", {
        type: new Parser()
          .bit2("b")
          .bit4("c")
          .bit1("d")
      });

      var buf = binaryLiteral("1 10 1010 0");
      var decoded = parser.parse(buf);
      assert.deepEqual(decoded, {
        a: 1,
        x: {
          b: 2,
          c: 10,
          d: 0
        }
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buf);
    });
  });

  describe("String encoder", function() {
    it("should encode ASCII encoded string", function() {
      var text = "hello, world";
      var buffer = Buffer.from(text, "ascii");
      var parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "ascii"
      });

      var decoded = parser.parse(buffer);
      assert.equal(decoded.msg, text);
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should encode UTF8 encoded string", function() {
      var text = "こんにちは、せかい。";
      var buffer = Buffer.from(text, "utf8");
      var parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "utf8"
      });

      var decoded = parser.parse(buffer);
      assert.equal(decoded.msg, text);
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should encode HEX encoded string", function() {
      var text = "cafebabe";
      var buffer = Buffer.from(text, "hex");
      var parser = Parser.start().string("msg", {
        length: buffer.length,
        encoding: "hex"
      });

      var decoded = parser.parse(buffer);
      assert.equal(decoded.msg, text);
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should encode variable length string", function() {
      var buffer = Buffer.from("0c68656c6c6f2c20776f726c64", "hex");
      var parser = Parser.start()
        .uint8("length")
        .string("msg", { length: "length", encoding: "utf8" });

      var decoded = parser.parse(buffer);
      assert.equal(decoded.msg, "hello, world");
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should encode zero terminated string", function() {
      var buffer = Buffer.from("68656c6c6f2c20776f726c6400", "hex");
      var parser = Parser.start().string("msg", {
        zeroTerminated: true,
        encoding: "ascii"
      });

      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, { msg: "hello, world" });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
    it("should encode zero terminated fixed-length string", function() {
      // In that case parsing and encoding are not  the exact oposite
      var buffer = Buffer.from("abc\u0000defghij\u0000");
      var parser = Parser.start()
        .string("a", { length: 5, zeroTerminated: true })
        .string("b", { length: 5, zeroTerminated: true })
        .string("c", { length: 5, zeroTerminated: true });

      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        a: "abc",
        b: "defgh",
        c: "ij"
      });

      var encoded = parser.encode({
        a: "abc",
        b: "defghzzzzzzz",
        c: "ij"
      });
      assert.deepEqual(
        encoded,
        Buffer.from("abc  \u0000defgh\u0000ij   \u0000")
      );
    });
    it("should strip trailing null characters", function() {
      var buffer = Buffer.from("746573740000", "hex");
      var parser1 = Parser.start().string("str", {
        length: 6,
        stripNull: false
      });
      var parser2 = Parser.start().string("str", {
        length: 6,
        stripNull: true
      });

      var decoded1 = parser1.parse(buffer);
      assert.equal(decoded1.str, "test\u0000\u0000");
      var encoded1 = parser1.encode(decoded1);
      assert.deepEqual(encoded1, buffer);

      var decoded2 = parser2.parse(buffer);
      assert.equal(decoded2.str, "test");
      // In this case (stripNull = true) parsing and encoding are not  the exact oposite
      var encoded2 = parser2.encode(decoded2);
      assert.notDeepEqual(encoded2, buffer);
      assert.deepEqual(encoded2, Buffer.from("test  "));
    });
    it("should encode string with zero-bytes internally", function() {
      var buffer = Buffer.from("abc\u0000defghij\u0000");
      var parser = Parser.start().string("a", { greedy: true });

      var decoded = parser.parse(buffer);
      assert.deepEqual(decoded, {
        a: "abc\u0000defghij\u0000"
      });
      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, buffer);
    });
  });

  describe("Buffer encoder", function() {
    it("should encode buffer", function() {
      var parser = new Parser().uint8("len").buffer("raw", {
        length: "len"
      });

      var buf = Buffer.from("deadbeefdeadbeef", "hex");
      var result = parser.parse(
        Buffer.concat([Buffer.from([8]), buf, Buffer.from("garbage at end")])
      );

      assert.deepEqual(result, {
        len: 8,
        raw: buf
      });

      var encoded = parser.encode(result);
      assert.deepEqual(encoded, Buffer.concat([Buffer.from([8]), buf]));
    });
  });
});
