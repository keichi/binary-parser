import { deepStrictEqual, notDeepStrictEqual, throws, ok } from "assert";
import { Parser } from "../lib/binary_parser";

function primitiveParserTests(
  name: string,
  factory: (array: Uint8Array | number[]) => Uint8Array
) {
  describe(`Primitive parser (${name})`, () => {
    function hexToBuf(hex: string): Uint8Array {
      return factory(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    }

    describe("Primitive parsers", () => {
      it("should nothing", () => {
        const parser = Parser.start();
        const buffer = factory([0xa, 0x14, 0x1e, 0x28, 0x32]);

        deepStrictEqual(parser.parse(buffer), {});
      });
      it("should parse integer types", () => {
        const parser = Parser.start().uint8("a").int16le("b").uint32be("c");

        const buffer = factory([0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e]);
        deepStrictEqual(parser.parse(buffer), {
          a: 0,
          b: 1234,
          c: 12345678,
        });
      });
      describe("BigInt64 parsers", () => {
        const [major] = process.version.replace("v", "").split(".");
        if (Number(major) >= 12) {
          it("should parse biguints64", () => {
            const parser = Parser.start().uint64be("a").uint64le("b");
            // from https://nodejs.org/api/buffer.html#buffer_buf_readbiguint64le_offset
            const buf = factory([
              0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
              0x00, 0xff, 0xff, 0xff, 0xff,
            ]);
            deepStrictEqual(parser.parse(buf), {
              a: BigInt("4294967295"),
              b: BigInt("18446744069414584320"),
            });
          });

          it("should parse bigints64", () => {
            const parser = Parser.start()
              .int64be("a")
              .int64le("b")
              .int64be("c")
              .int64le("d");
            // from https://nodejs.org/api/buffer.html#buffer_buf_readbiguint64le_offset
            const buf = factory([
              0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00,
              0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
              0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
            ]);
            deepStrictEqual(parser.parse(buf), {
              a: BigInt("4294967295"),
              b: BigInt("-4294967295"),
              c: BigInt("4294967295"),
              d: BigInt("-4294967295"),
            });
          });
        } else {
          it("should throw when run under not v12", () => {
            throws(() => Parser.start().int64("a"));
          });
        }
      });
      it("should use formatter to transform parsed integer", () => {
        const parser = Parser.start()
          .uint8("a", {
            formatter: (val: number) => val * 2,
          })
          .int16le("b", {
            formatter: (val: number) => "test" + String(val),
          });

        const buffer = factory([0x01, 0xd2, 0x04]);
        deepStrictEqual(parser.parse(buffer), { a: 2, b: "test1234" });
      });
      it("should parse floating point types", () => {
        const parser = Parser.start().floatbe("a").doublele("b");

        const FLT_EPSILON = 0.00001;
        const buffer = factory([
          0x41, 0x45, 0x85, 0x1f, 0x7a, 0x36, 0xab, 0x3e, 0x57, 0x5b, 0xb1,
          0xbf,
        ]);
        const result = parser.parse(buffer);

        ok(Math.abs(result.a - 12.345) < FLT_EPSILON);
        ok(Math.abs(result.b - -0.0678) < FLT_EPSILON);
      });
      it("should handle endianess", () => {
        const parser = Parser.start().int32le("little").int32be("big");

        const buffer = factory([
          0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          little: 12345678,
          big: 12345678,
        });
      });
      it("should seek offset", () => {
        const parser = Parser.start()
          .uint8("a")
          .seek(3)
          .uint16le("b")
          .uint32be("c");

        const buffer = factory([
          0x00, 0xff, 0xff, 0xfe, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          a: 0,
          b: 1234,
          c: 12345678,
        });
      });
    });

    describe("Bit field parsers", () => {
      function binaryLiteral(s: string): Uint8Array {
        const bytes = [];

        s = s.replace(/\s/g, "");
        for (let i = 0; i < s.length; i += 8) {
          bytes.push(parseInt(s.slice(i, i + 8), 2));
        }

        return factory(bytes);
      }

      it("binary literal helper should work", () => {
        deepStrictEqual(binaryLiteral("11110000"), factory([0xf0]));
        deepStrictEqual(
          binaryLiteral("11110000 10100101"),
          factory([0xf0, 0xa5])
        );
      });

      it("should parse 1-byte-length bit field sequence", () => {
        const parser1 = new Parser().bit1("a").bit2("b").bit4("c").bit1("d");

        const buf = binaryLiteral("1 10 1010 0");
        deepStrictEqual(parser1.parse(buf), {
          a: 1,
          b: 2,
          c: 10,
          d: 0,
        });

        const parser2 = new Parser()
          .endianess("little")
          .bit1("a")
          .bit2("b")
          .bit4("c")
          .bit1("d");

        deepStrictEqual(parser2.parse(buf), {
          a: 0,
          b: 2,
          c: 10,
          d: 1,
        });
      });
      it("should parse 2-byte-length bit field sequence", () => {
        const parser1 = new Parser().bit3("a").bit9("b").bit4("c");

        const buf = binaryLiteral("101 111000111 0111");
        deepStrictEqual(parser1.parse(buf), {
          a: 5,
          b: 455,
          c: 7,
        });

        const parser2 = new Parser()
          .endianess("little")
          .bit3("a")
          .bit9("b")
          .bit4("c");
        deepStrictEqual(parser2.parse(buf), {
          a: 7,
          b: 398,
          c: 11,
        });
      });
      it("should parse 4-byte-length bit field sequence", () => {
        const parser1 = new Parser()
          .bit1("a")
          .bit24("b")
          .bit4("c")
          .bit2("d")
          .bit1("e");
        const buf = binaryLiteral("1 101010101010101010101010 1111 01 1");
        deepStrictEqual(parser1.parse(buf), {
          a: 1,
          b: 11184810,
          c: 15,
          d: 1,
          e: 1,
        });

        const parser2 = new Parser()
          .endianess("little")
          .bit1("a")
          .bit24("b")
          .bit4("c")
          .bit2("d")
          .bit1("e");
        deepStrictEqual(parser2.parse(buf), {
          a: 1,
          b: 11184829,
          c: 10,
          d: 2,
          e: 1,
        });
      });
      it("should parse nested bit fields", () => {
        const parser = new Parser().bit1("a").nest("x", {
          type: new Parser().bit2("b").bit4("c").bit1("d"),
        });

        const buf = binaryLiteral("11010100");

        deepStrictEqual(parser.parse(buf), {
          a: 1,
          x: {
            b: 2,
            c: 10,
            d: 0,
          },
        });
      });
    });

    describe("String parser", () => {
      it("should parse UTF8 encoded string (ASCII only)", () => {
        const text = "hello, world";
        const buffer = factory(new TextEncoder().encode(text));
        const parser = Parser.start().string("msg", {
          length: buffer.length,
          encoding: "utf8",
        });

        deepStrictEqual(parser.parse(buffer).msg, text);
      });
      it("should parse UTF8 encoded string", () => {
        const text = "こんにちは、せかい。";
        const buffer = factory(new TextEncoder().encode(text));
        const parser = Parser.start().string("msg", {
          length: buffer.length,
          encoding: "utf8",
        });

        deepStrictEqual(parser.parse(buffer).msg, text);
      });
      it("should parse HEX encoded string", () => {
        const text = "cafebabe";
        const buffer = hexToBuf(text);
        const parser = Parser.start().string("msg", {
          length: buffer.length,
          encoding: "hex",
        });

        deepStrictEqual(parser.parse(buffer).msg, text);
      });
      it("should parse variable length string", () => {
        const buffer = hexToBuf("0c68656c6c6f2c20776f726c64");
        const parser = Parser.start()
          .uint8("length")
          .string("msg", { length: "length", encoding: "utf8" });

        deepStrictEqual(parser.parse(buffer).msg, "hello, world");
      });
      it("should parse zero terminated string", () => {
        const buffer = hexToBuf("68656c6c6f2c20776f726c6400");
        const parser = Parser.start().string("msg", {
          zeroTerminated: true,
          encoding: "utf8",
        });

        deepStrictEqual(parser.parse(buffer), { msg: "hello, world" });
      });
      it("should parser zero terminated fixed-length string", () => {
        const buffer = factory(
          new TextEncoder().encode("abc\u0000defghij\u0000")
        );
        const parser = Parser.start()
          .string("a", { length: 5, zeroTerminated: true })
          .string("b", { length: 5, zeroTerminated: true })
          .string("c", { length: 5, zeroTerminated: true });

        deepStrictEqual(parser.parse(buffer), {
          a: "abc",
          b: "defgh",
          c: "ij",
        });
      });
      it("should strip trailing null characters", () => {
        const buffer = hexToBuf("746573740000");
        const parser1 = Parser.start().string("str", {
          length: 7,
          stripNull: false,
        });
        const parser2 = Parser.start().string("str", {
          length: 7,
          stripNull: true,
        });

        deepStrictEqual(parser1.parse(buffer).str, "test\u0000\u0000");
        deepStrictEqual(parser2.parse(buffer).str, "test");
      });
      it("should parse string greedily with zero-bytes internally", () => {
        const buffer = factory(
          new TextEncoder().encode("abc\u0000defghij\u0000")
        );
        const parser = Parser.start().string("a", { greedy: true });

        deepStrictEqual(parser.parse(buffer), {
          a: "abc\u0000defghij\u0000",
        });
      });
    });

    describe("Bytes parser", () => {
      it("should parse as buffer", () => {
        const parser = new Parser().uint8("len").buffer("raw", {
          length: "len",
        });

        const hex = "deadbeefdeadbeef";

        deepStrictEqual(parser.parse(hexToBuf("08" + hex)).raw, hexToBuf(hex));
      });

      it("should clone buffer if options.clone is true", () => {
        const parser = new Parser().buffer("raw", {
          length: 8,
          clone: true,
        });

        const buf = hexToBuf("deadbeefdeadbeef");
        const result = parser.parse(buf);
        deepStrictEqual(result.raw, buf);
        result.raw[0] = 0xff;
        notDeepStrictEqual(result.raw, buf);
      });

      it("should parse until function returns true when readUntil is function", () => {
        const parser = new Parser()
          .endianess("big")
          .uint8("cmd")
          .buffer("data", {
            readUntil: (item: number) => item === 2,
          });

        const result1 = parser.parse(hexToBuf("aa"));
        deepStrictEqual(result1, { cmd: 0xaa, data: factory([]) });

        const result2 = parser.parse(hexToBuf("aabbcc"));
        deepStrictEqual(result2, { cmd: 0xaa, data: hexToBuf("bbcc") });

        const result3 = parser.parse(hexToBuf("aa02bbcc"));
        deepStrictEqual(result3, { cmd: 0xaa, data: factory([]) });

        const result4 = parser.parse(hexToBuf("aabbcc02"));
        deepStrictEqual(result4, { cmd: 0xaa, data: hexToBuf("bbcc") });

        const result5 = parser.parse(hexToBuf("aabbcc02dd"));
        deepStrictEqual(result5, { cmd: 0xaa, data: hexToBuf("bbcc") });
      });

      // this is a test for testing a fix of a bug, that removed the last byte
      // of the buffer parser
      it("should return a buffer with same size", () => {
        const bufferParser = new Parser().buffer("buf", {
          readUntil: "eof",
          formatter: (buffer: Uint8Array) => buffer,
        });

        const buffer = factory(new TextEncoder().encode("John\0Doe\0"));
        deepStrictEqual(bufferParser.parse(buffer), { buf: buffer });
      });
    });
  });
}

primitiveParserTests("Buffer", (arr) => Buffer.from(arr));
primitiveParserTests("Uint8Array", (arr) => Uint8Array.from(arr));
