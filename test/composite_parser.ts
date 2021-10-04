import { deepStrictEqual, throws, doesNotThrow, ok } from "assert";
import { deflateRawSync, inflateRawSync } from "zlib";
import { Parser } from "../lib/binary_parser";

function compositeParserTests(
  name: string,
  factory: (array: Uint8Array | number[]) => Uint8Array
) {
  describe(`Composite parser (${name})`, () => {
    function hexToBuf(hex: string): Uint8Array {
      return factory(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    }

    describe("Array parser", () => {
      it("should parse array of primitive types", () => {
        const parser = Parser.start().uint8("length").array("message", {
          length: "length",
          type: "uint8",
        });

        const buffer = factory([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        deepStrictEqual(parser.parse(buffer), {
          length: 12,
          message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        });
      });
      it("should parse array of primitive types with lengthInBytes", () => {
        const parser = Parser.start().uint8("length").array("message", {
          lengthInBytes: "length",
          type: "uint8",
        });

        const buffer = factory([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        deepStrictEqual(parser.parse(buffer), {
          length: 12,
          message: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        });
      });
      it("should parse array of user defined types", () => {
        const elementParser = new Parser().uint8("key").int16le("value");

        const parser = Parser.start().uint16le("length").array("message", {
          length: "length",
          type: elementParser,
        });

        const buffer = factory([
          0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x02,
          message: [
            { key: 0xca, value: 1234 },
            { key: 0xbe, value: 1235 },
          ],
        });
      });
      it("should parse array of user defined types and have access to parent context", () => {
        const elementParser = new Parser().uint8("key").array("value", {
          type: "uint8",
          length: function (this: any) {
            return this.$parent.valueLength;
          },
        });

        const parser = Parser.start()
          .useContextVars()
          .uint16le("length")
          .uint16le("valueLength")
          .array("message", {
            length: "length",
            type: elementParser,
          });

        const buffer = factory([
          0x02, 0x00, 0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x02,
          valueLength: 0x02,
          message: [
            { key: 0xca, value: [0xd2, 0x04] },
            { key: 0xbe, value: [0xd3, 0x04] },
          ],
        });
      });
      it("should parse array of user defined types and have access to root context", () => {
        const elementParser = new Parser().uint8("key").nest("data", {
          type: new Parser().array("value", {
            type: "uint8",
            length: "$root.valueLength",
          }),
        });

        const parser = Parser.start()
          .useContextVars()
          .uint16le("length")
          .uint16le("valueLength")
          .array("message", {
            length: "length",
            type: elementParser,
          });

        const buffer = factory([
          0x02, 0x00, 0x02, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x02,
          valueLength: 0x02,
          message: [
            { key: 0xca, data: { value: [0xd2, 0x04] } },
            { key: 0xbe, data: { value: [0xd3, 0x04] } },
          ],
        });
      });
      it("should parse array of user defined types with lengthInBytes", () => {
        const elementParser = new Parser().uint8("key").int16le("value");

        const parser = Parser.start().uint16le("length").array("message", {
          lengthInBytes: "length",
          type: elementParser,
        });

        const buffer = factory([
          0x06, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x06,
          message: [
            { key: 0xca, value: 1234 },
            { key: 0xbe, value: 1235 },
          ],
        });
      });
      it("should parse array of user defined types with lengthInBytes literal", () => {
        const elementParser = new Parser().uint8("key").int16le("value");

        const parser = Parser.start().array("message", {
          lengthInBytes: 0x06,
          type: elementParser,
        });

        const buffer = factory([0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04]);
        deepStrictEqual(parser.parse(buffer), {
          message: [
            { key: 0xca, value: 1234 },
            { key: 0xbe, value: 1235 },
          ],
        });
      });
      it("should parse array of user defined types with lengthInBytes function", () => {
        const elementParser = new Parser().uint8("key").int16le("value");

        const parser = Parser.start()
          .uint16le("length")
          .array("message", {
            lengthInBytes: function (this: any) {
              return this.length;
            },
            type: elementParser,
          });

        const buffer = factory([
          0x06, 0x00, 0xca, 0xd2, 0x04, 0xbe, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x06,
          message: [
            { key: 0xca, value: 1234 },
            { key: 0xbe, value: 1235 },
          ],
        });
      });
      it("should parse array of arrays", () => {
        const rowParser = Parser.start().uint8("length").array("cols", {
          length: "length",
          type: "int32le",
        });

        const parser = Parser.start().uint8("length").array("rows", {
          length: "length",
          type: rowParser,
        });

        const size = 1 + 10 * (1 + 5 * 4);
        const buffer = Buffer.alloc ? Buffer.alloc(size) : new Buffer(size);
        const dataView = new DataView(buffer.buffer);

        let iterator = 0;
        buffer[iterator] = 10;
        iterator += 1;
        for (let i = 0; i < 10; i++) {
          buffer[iterator] = 5;
          iterator += 1;
          for (let j = 0; j < 5; j++) {
            dataView.setInt32(iterator, i * j, true);
            iterator += 4;
          }
        }

        deepStrictEqual(parser.parse(buffer), {
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
      });
      it("should parse until eof when readUntil is specified", () => {
        const parser = Parser.start().array("data", {
          readUntil: "eof",
          type: "uint8",
        });

        const buffer = factory([
          0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          data: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        });
      });
      it("should parse until function returns true when readUntil is function", () => {
        const parser = Parser.start().array("data", {
          readUntil: (item: number, _: Buffer) => item === 0,
          type: "uint8",
        });

        const buffer = factory([
          0xff, 0xff, 0xff, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          data: [0xff, 0xff, 0xff, 0x01, 0x00],
        });
      });
      it("should parse until function returns true when readUntil is function (using read-ahead)", () => {
        const parser = Parser.start().array("data", {
          readUntil: (_: number, buf: Buffer) => buf.length > 0 && buf[0] === 0,
          type: "uint8",
        });

        const buffer = factory([
          0xff, 0xff, 0xff, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          data: [0xff, 0xff, 0xff, 0x01],
        });
      });
      it("should parse associative arrays", () => {
        const parser = Parser.start()
          .int8("numlumps")
          .array("lumps", {
            type: Parser.start()
              .int32le("filepos")
              .int32le("size")
              .string("name", { length: 8, encoding: "utf8" }),
            length: "numlumps",
            key: "name",
          });

        const buffer = factory([
          0x02, 0xd2, 0x04, 0x00, 0x00, 0x2e, 0x16, 0x00, 0x00, 0x41, 0x41,
          0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x2e, 0x16, 0x00, 0x00, 0xd2,
          0x04, 0x00, 0x00, 0x62, 0x62, 0x62, 0x62, 0x62, 0x62, 0x62, 0x62,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          numlumps: 2,
          lumps: {
            AAAAAAAA: {
              filepos: 1234,
              size: 5678,
              name: "AAAAAAAA",
            },
            bbbbbbbb: {
              filepos: 5678,
              size: 1234,
              name: "bbbbbbbb",
            },
          },
        });
      });
      it("should use formatter to transform parsed array", () => {
        const parser = Parser.start().array("data", {
          type: "uint8",
          length: 4,
          formatter: (arr: number[]) => arr.join("."),
        });

        const buffer = factory([0x0a, 0x0a, 0x01, 0x6e]);
        deepStrictEqual(parser.parse(buffer), {
          data: "10.10.1.110",
        });
      });
      it("should be able to go into recursion", () => {
        const parser = Parser.start()
          .namely("self")
          .uint8("length")
          .array("data", {
            type: "self",
            length: "length",
          });

        const buffer = factory([1, 1, 1, 0]);
        deepStrictEqual(parser.parse(buffer), {
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
      });
      it("should be able to go into even deeper recursion", () => {
        const parser = Parser.start()
          .namely("self")
          .uint8("length")
          .array("data", {
            type: "self",
            length: "length",
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

        // prettier-ignore
        const buffer = factory([
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
        deepStrictEqual(parser.parse(buffer), {
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
      });
      it("should allow parent parser attributes as choice key", () => {
        const ChildParser = Parser.start().choice("data", {
          tag: (vars: { version: number }) => vars.version,
          choices: {
            1: Parser.start().uint8("v1"),
            2: Parser.start().uint16("v2"),
          },
        });

        const ParentParser = Parser.start()
          .uint8("version")
          .nest("child", { type: ChildParser });

        const buffer1 = factory([0x1, 0x2]);
        deepStrictEqual(ParentParser.parse(buffer1), {
          version: 1,
          child: { data: { v1: 2 } },
        });

        const buffer2 = factory([0x2, 0x3, 0x4]);
        deepStrictEqual(ParentParser.parse(buffer2), {
          version: 2,
          child: { data: { v2: 0x0304 } },
        });
      });
      it("should be able to access to index context variable when using length", () => {
        const elementParser = new Parser()
          .uint8("key", {
            formatter: function (this: any, item: number) {
              return this.$index % 2 === 0 ? item : String.fromCharCode(item);
            },
          })
          .nest("data", {
            type: new Parser().array("value", {
              type: "uint8",
              length: "$root.valueLength",
            }),
          });

        const parser = Parser.start()
          .useContextVars()
          .uint16le("length")
          .uint16le("valueLength")
          .array("message", {
            length: "length",
            type: elementParser,
          });

        const buffer = factory([
          0x02, 0x00, 0x02, 0x00, 0x50, 0xd2, 0x04, 0x51, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x02,
          valueLength: 0x02,
          message: [
            { key: 0x50, data: { value: [0xd2, 0x04] } },
            { key: "Q", data: { value: [0xd3, 0x04] } },
          ],
        });
      });
      it("should be able to access to index context variable when using length on named parser", () => {
        // @ts-ignore
        const elementParser = new Parser()
          .uint8("key", {
            formatter: function (this: any, item: number) {
              return this.$index % 2 === 0 ? item : String.fromCharCode(item);
            },
          })
          .nest("data", {
            type: new Parser().array("value", {
              type: "uint8",
              length: "$root.valueLength",
            }),
          })
          .namely("ArrayLengthIndexTest");

        const parser = Parser.start()
          .useContextVars()
          .uint16le("length")
          .uint16le("valueLength")
          .array("message", {
            length: "length",
            type: "ArrayLengthIndexTest",
          });

        const buffer = factory([
          0x02, 0x00, 0x02, 0x00, 0x50, 0xd2, 0x04, 0x51, 0xd3, 0x04,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          length: 0x02,
          valueLength: 0x02,
          message: [
            { key: 0x50, data: { value: [0xd2, 0x04] } },
            { key: "Q", data: { value: [0xd3, 0x04] } },
          ],
        });
      });
    });

    describe("Choice parser", () => {
      it("should parse choices of primitive types", () => {
        const parser = Parser.start()
          .uint8("tag1")
          .choice("data1", {
            tag: "tag1",
            choices: {
              0: "int32le",
              1: "int16le",
            },
          })
          .uint8("tag2")
          .choice("data2", {
            tag: "tag2",
            choices: {
              0: "int32le",
              1: "int16le",
            },
          });

        const buffer = factory([0x0, 0x4e, 0x61, 0xbc, 0x00, 0x01, 0xd2, 0x04]);
        deepStrictEqual(parser.parse(buffer), {
          tag1: 0,
          data1: 12345678,
          tag2: 1,
          data2: 1234,
        });
      });
      it("should parse default choice", () => {
        const parser = Parser.start()
          .uint8("tag")
          .choice("data", {
            tag: "tag",
            choices: {
              0: "int32le",
              1: "int16le",
            },
            defaultChoice: "uint8",
          })
          .int32le("test");

        const buffer = factory([0x03, 0xff, 0x2f, 0xcb, 0x04, 0x0]);
        deepStrictEqual(parser.parse(buffer), {
          tag: 3,
          data: 0xff,
          test: 314159,
        });
      });
      it("should parse choices of user defined types", () => {
        const parser = Parser.start()
          .uint8("tag")
          .choice("data", {
            tag: "tag",
            choices: {
              1: Parser.start()
                .uint8("length")
                .string("message", { length: "length" }),
              3: Parser.start().int32le("number"),
            },
          });

        const buffer1 = factory([
          0x1, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72,
          0x6c, 0x64,
        ]);
        deepStrictEqual(parser.parse(buffer1), {
          tag: 1,
          data: {
            length: 12,
            message: "hello, world",
          },
        });

        const buffer2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
        deepStrictEqual(parser.parse(buffer2), {
          tag: 3,
          data: {
            number: 12345678,
          },
        });
      });
      it("should be able to go into recursion", () => {
        const stop = Parser.start();

        const parser = Parser.start()
          .namely("self")
          .uint8("type")
          .choice("data", {
            tag: "type",
            choices: {
              0: stop,
              1: "self",
            },
          });

        const buffer = factory([1, 1, 1, 0]);
        deepStrictEqual(parser.parse(buffer), {
          type: 1,
          data: {
            type: 1,
            data: {
              type: 1,
              data: { type: 0, data: {} },
            },
          },
        });
      });
      it("should be able to go into recursion with simple nesting", () => {
        const stop = Parser.start();

        const parser = Parser.start()
          .namely("self")
          .uint8("type")
          .choice("data", {
            tag: "type",
            choices: {
              0: stop,
              1: "self",
              2: Parser.start()
                .nest("left", { type: "self" })
                .nest("right", { type: stop }),
            },
          });

        const buffer = factory([2, /* left */ 1, 1, 0, /* right */ 0]);
        deepStrictEqual(parser.parse(buffer), {
          type: 2,
          data: {
            left: {
              type: 1,
              data: { type: 1, data: { type: 0, data: {} } },
            },
            right: {},
          },
        });
      });
      it("should be able to refer to other parsers by name", () => {
        const parser = Parser.start().namely("self");

        // @ts-ignore
        const stop = Parser.start().namely("stop");

        // @ts-ignore
        const twoCells = Parser.start()
          .namely("twoCells")
          .nest("left", { type: "self" })
          .nest("right", { type: "stop" });

        parser.uint8("type").choice("data", {
          tag: "type",
          choices: {
            0: "stop",
            1: "self",
            2: "twoCells",
          },
        });

        const buffer = factory([2, /* left */ 1, 1, 0, /* right */ 0]);
        deepStrictEqual(parser.parse(buffer), {
          type: 2,
          data: {
            left: {
              type: 1,
              data: { type: 1, data: { type: 0, data: {} } },
            },
            right: {},
          },
        });
      });
      it("should be able to refer to other parsers both directly and by name", () => {
        const parser = Parser.start().namely("self");

        const stop = Parser.start();

        const twoCells = Parser.start()
          .nest("left", { type: "self" })
          .nest("right", { type: stop });

        parser.uint8("type").choice("data", {
          tag: "type",
          choices: {
            0: stop,
            1: "self",
            2: twoCells,
          },
        });

        const buffer = factory([2, /* left */ 1, 1, 0, /* right */ 0]);
        deepStrictEqual(parser.parse(buffer), {
          type: 2,
          data: {
            left: {
              type: 1,
              data: { type: 1, data: { type: 0, data: {} } },
            },
            right: {},
          },
        });
      });
      it("should be able to go into recursion with complex nesting", () => {
        const stop = Parser.start();

        const parser = Parser.start()
          .namely("self")
          .uint8("type")
          .choice("data", {
            tag: "type",
            choices: {
              0: stop,
              1: "self",
              2: Parser.start()
                .nest("left", { type: "self" })
                .nest("right", { type: "self" }),
              3: Parser.start()
                .nest("one", { type: "self" })
                .nest("two", { type: "self" })
                .nest("three", { type: "self" }),
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

        // prettier-ignore
        const buffer = factory([
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
        deepStrictEqual(parser.parse(buffer), {
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
      });
      it("should be able to 'flatten' choices when using null varName", () => {
        const parser = Parser.start()
          .uint8("tag")
          .choice({
            tag: "tag",
            choices: {
              1: Parser.start()
                .uint8("length")
                .string("message", { length: "length" }),
              3: Parser.start().int32le("number"),
            },
          });
        const buffer1 = factory([
          0x1, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72,
          0x6c, 0x64,
        ]);
        deepStrictEqual(parser.parse(buffer1), {
          tag: 1,
          length: 12,
          message: "hello, world",
        });

        const buffer2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
        deepStrictEqual(parser.parse(buffer2), {
          tag: 3,
          number: 12345678,
        });
      });
      it("should be able to 'flatten' choices when omitting varName parameter", () => {
        const parser = Parser.start()
          .uint8("tag")
          .choice({
            tag: "tag",
            choices: {
              1: Parser.start()
                .uint8("length")
                .string("message", { length: "length" }),
              3: Parser.start().int32le("number"),
            },
          });

        const buffer1 = factory([
          0x1, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72,
          0x6c, 0x64,
        ]);
        deepStrictEqual(parser.parse(buffer1), {
          tag: 1,
          length: 12,
          message: "hello, world",
        });

        const buffer2 = factory([0x03, 0x4e, 0x61, 0xbc, 0x00]);
        deepStrictEqual(parser.parse(buffer2), {
          tag: 3,
          number: 12345678,
        });
      });
      it("should be able to use function as the choice selector", () => {
        const parser = Parser.start()
          .string("selector", { length: 4 })
          .choice({
            tag: function (this: { selector: string }) {
              return parseInt(this.selector, 2); // string base 2 to integer decimal
            },
            choices: {
              2: Parser.start()
                .uint8("length")
                .string("message", { length: "length" }),
              7: Parser.start().int32le("number"),
            },
          });

        const buffer1 = factory([
          48, 48, 49, 48, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77,
          0x6f, 0x72, 0x6c, 0x64,
        ]);
        deepStrictEqual(parser.parse(buffer1), {
          selector: "0010", // -> choice 2
          length: 12,
          message: "hello, world",
        });

        const buffer2 = factory([48, 49, 49, 49, 0x4e, 0x61, 0xbc, 0x00]);
        deepStrictEqual(parser.parse(buffer2), {
          selector: "0111", // -> choice 7
          number: 12345678,
        });
      });
      it("should be able to use parsing context", () => {
        const parser = Parser.start()
          .useContextVars()
          .uint8("tag")
          .uint8("items")
          .choice("data", {
            tag: "tag",
            choices: {
              1: Parser.start()
                .uint8("length")
                .string("message", { length: "length" })
                .array("value", {
                  type: "uint8",
                  length: "$parent.items",
                }),
              3: Parser.start().int32le("number"),
            },
          });

        const buffer1 = factory([
          0x1, 0x2, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f,
          0x72, 0x6c, 0x64, 0x01, 0x02, 0x02, 0x02,
        ]);
        deepStrictEqual(parser.parse(buffer1), {
          tag: 1,
          items: 2,
          data: {
            length: 12,
            message: "hello, world",
            value: [0x01, 0x02],
          },
        });
        const buffer2 = factory([0x03, 0x0, 0x4e, 0x61, 0xbc, 0x00]);
        deepStrictEqual(parser.parse(buffer2), {
          tag: 3,
          items: 0,
          data: {
            number: 12345678,
          },
        });
      });
    });

    describe("Nest parser", () => {
      it("should parse nested parsers", () => {
        const nameParser = new Parser()
          .string("firstName", {
            zeroTerminated: true,
          })
          .string("lastName", {
            zeroTerminated: true,
          });
        const infoParser = new Parser().uint8("age");
        const personParser = new Parser()
          .nest("name", {
            type: nameParser,
          })
          .nest("info", {
            type: infoParser,
          });

        const name = Array.from(new TextEncoder().encode("John\0Doe\0"));
        const age = [0x20];
        const buffer = [...name, ...age];

        deepStrictEqual(personParser.parse(factory(buffer)), {
          name: {
            firstName: "John",
            lastName: "Doe",
          },
          info: {
            age: 0x20,
          },
        });
      });

      it("should format parsed nested parser", () => {
        const nameParser = new Parser()
          .string("firstName", {
            zeroTerminated: true,
          })
          .string("lastName", {
            zeroTerminated: true,
          });
        const personParser = new Parser().nest("name", {
          type: nameParser,
          formatter: (name: { firstName: string; lastName: string }) =>
            name.firstName + " " + name.lastName,
        });

        const buffer = factory(new TextEncoder().encode("John\0Doe\0"));
        deepStrictEqual(personParser.parse(buffer), {
          name: "John Doe",
        });
      });

      it("should 'flatten' output when using null varName", () => {
        const parser = new Parser()
          .string("s1", { zeroTerminated: true })
          .nest({
            type: new Parser().string("s2", { zeroTerminated: true }),
          });

        const buf = factory(new TextEncoder().encode("foo\0bar\0"));

        deepStrictEqual(parser.parse(buf), { s1: "foo", s2: "bar" });
      });

      it("should 'flatten' output when omitting varName", () => {
        const parser = new Parser()
          .string("s1", { zeroTerminated: true })
          .nest({
            type: new Parser().string("s2", { zeroTerminated: true }),
          });

        const buf = factory(new TextEncoder().encode("foo\0bar\0"));

        deepStrictEqual(parser.parse(buf), { s1: "foo", s2: "bar" });
      });

      it("should be able to use parsing context", () => {
        const parser = Parser.start()
          .useContextVars()
          .uint8("items")
          .nest("data", {
            type: Parser.start()
              .uint8("length")
              .string("message", { length: "length" })
              .array("value", {
                type: "uint8",
                length: "$parent.items",
              }),
          });

        const buffer = factory([
          0x2, 0xc, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77, 0x6f, 0x72,
          0x6c, 0x64, 0x01, 0x02, 0x02, 0x02,
        ]);
        deepStrictEqual(parser.parse(buffer), {
          items: 2,
          data: {
            length: 12,
            message: "hello, world",
            value: [0x01, 0x02],
          },
        });
      });
    });

    describe("Constructors", () => {
      it("should create a custom object type", () => {
        class Person {
          name: string = "";
        }

        const parser = Parser.start().create(Person).string("name", {
          zeroTerminated: true,
        });

        const buffer = factory(new TextEncoder().encode("John Doe\0"));
        const person = parser.parse(buffer);
        ok(person instanceof Person);
        deepStrictEqual(person.name, "John Doe");
      });
    });

    describe("Pointer parser", () => {
      it("should move pointer to specified offset", () => {
        const parser = Parser.start().pointer("x", {
          type: "uint8",
          offset: 2,
        });
        const buf = factory([0x1, 0x2, 0x3, 0x4, 0x5]);

        deepStrictEqual(parser.parse(buf), { x: 3 });
      });

      it("should restore pointer to original position", () => {
        const parser = Parser.start()
          .pointer("x", { type: "uint8", offset: 2 })
          .uint16be("y");
        const buf = factory([0x1, 0x2, 0x3, 0x4, 0x5]);

        deepStrictEqual(parser.parse(buf), { x: 0x3, y: 0x0102 });
      });

      it("should work with child parser", () => {
        const parser = Parser.start()
          .uint32le("x")
          .pointer("y", {
            type: Parser.start().string("s", { zeroTerminated: true }),
            offset: 4,
          });
        const buf = factory([
          1,
          2,
          3,
          4,
          ...Array.from(new TextEncoder().encode("hello")),
          0,
          6,
        ]);

        deepStrictEqual(parser.parse(buf), {
          x: 0x04030201,
          y: { s: "hello" },
        });
      });

      it("should pass variable context to child parser", () => {});
      const parser = Parser.start()
        .uint16be("len")
        .pointer("child", {
          offset: 4,
          type: Parser.start().array("a", {
            type: "uint8",
            length: (vars: { len: number }) => vars.len,
          }),
        });
      const buf = factory([0, 6, 0, 0, 1, 2, 3, 4, 5, 6]);

      deepStrictEqual(parser.parse(buf), {
        len: 6,
        child: { a: [1, 2, 3, 4, 5, 6] },
      });
    });

    describe("SaveOffset", () => {
      it("should save the offset", () => {
        const buff = factory([0x01, 0x00, 0x02]);
        const parser = Parser.start()
          .int8("a")
          .int16("b")
          .saveOffset("bytesRead");

        deepStrictEqual(parser.parse(buff), {
          a: 1,
          b: 2,
          bytesRead: 3,
        });
      });

      it("should save the offset if not at end", () => {
        const buff = factory([0x01, 0x00, 0x02]);
        const parser = Parser.start()
          .int8("a")
          .saveOffset("bytesRead")
          .int16("b");

        deepStrictEqual(parser.parse(buff), {
          a: 1,
          b: 2,
          bytesRead: 1,
        });
      });

      it("should save the offset with a dynamic parser", () => {
        const buff = factory([0x74, 0x65, 0x73, 0x74, 0x00]);
        const parser = Parser.start()
          .string("name", { zeroTerminated: true })
          .saveOffset("bytesRead");

        deepStrictEqual(parser.parse(buff), {
          name: "test",
          bytesRead: 5,
        });
      });
    });

    describe("Utilities", () => {
      it("should count size for fixed size structs", () => {
        const parser = Parser.start()
          .int8("a")
          .int32le("b")
          .string("msg", { length: 10 })
          .seek(2)
          .array("data", {
            length: 3,
            type: "int8",
          })
          .buffer("raw", { length: 8 });

        deepStrictEqual(parser.sizeOf(), 1 + 4 + 10 + 2 + 3 + 8);
      });
      it("should assert parsed values", () => {
        const parser1 = Parser.start().string("msg", {
          encoding: "utf8",
          zeroTerminated: true,
          assert: "hello, world",
        });
        const buffer1 = hexToBuf("68656c6c6f2c20776f726c6400");
        doesNotThrow(() => {
          parser1.parse(buffer1);
        });

        const buffer2 = hexToBuf("68656c6c6f2c206a7300");
        throws(() => {
          parser1.parse(buffer2);
        });

        let parser2 = new Parser()
          .int16le("a")
          .int16le("b")
          .int16le("c", {
            assert: function (
              this: { a: number; b: number },
              x: number | string
            ) {
              return this.a + this.b === x;
            },
          });

        const buffer3 = hexToBuf("d2042e16001b");
        doesNotThrow(() => {
          parser2.parse(buffer3);
        });

        const buffer4 = hexToBuf("2e16001bd204");
        throws(() => {
          parser2.parse(buffer4);
        });
      });
    });

    describe("Parse other fields after bit", () => {
      it("Parse uint8", () => {
        const buffer = factory([0, 1, 0, 4]);

        const parser1 = Parser.start().bit17("a").uint8("b");
        deepStrictEqual(parser1.parse(buffer), {
          a: 1 << 1,
          b: 4,
        });
        const parser2 = Parser.start().bit18("a").uint8("b");
        deepStrictEqual(parser2.parse(buffer), {
          a: 1 << 2,
          b: 4,
        });
        const parser3 = Parser.start().bit19("a").uint8("b");
        deepStrictEqual(parser3.parse(buffer), {
          a: 1 << 3,
          b: 4,
        });
        const parser4 = Parser.start().bit20("a").uint8("b");
        deepStrictEqual(parser4.parse(buffer), {
          a: 1 << 4,
          b: 4,
        });
        const parser5 = Parser.start().bit21("a").uint8("b");
        deepStrictEqual(parser5.parse(buffer), {
          a: 1 << 5,
          b: 4,
        });
        const parser6 = Parser.start().bit22("a").uint8("b");
        deepStrictEqual(parser6.parse(buffer), {
          a: 1 << 6,
          b: 4,
        });
        const parser7 = Parser.start().bit23("a").uint8("b");
        deepStrictEqual(parser7.parse(buffer), {
          a: 1 << 7,
          b: 4,
        });
        const parser8 = Parser.start().bit24("a").uint8("b");
        deepStrictEqual(parser8.parse(buffer), {
          a: 1 << 8,
          b: 4,
        });
      });
    });

    describe("Wrapper", () => {
      it("should parse deflated then inflated data", () => {
        const text = "This is compressible text.\0";
        const bufferBefore = factory([
          12,
          ...Array.from(new TextEncoder().encode(text)),
          34,
        ]);

        // Skip if we are testing with Uint8Array since the zlib polyfill does
        // not support Uint8Array
        if (bufferBefore instanceof Uint8Array) return;

        const compressedData = factory(deflateRawSync(bufferBefore));

        const buffer = factory([
          ...Array.from(
            new Uint8Array(new Uint32Array([compressedData.length]).buffer)
          ),
          ...Array.from(compressedData),
          42,
        ]);

        const bufferParser = Parser.start()
          .uint8("a")
          .string("b", {
            zeroTerminated: true,
          })
          .uint8("c");

        const mainParser = Parser.start()
          .uint32le("length")
          .wrapped("compressedData", {
            length: "length",
            wrapper: (x: Uint8Array) => inflateRawSync(x),
            type: bufferParser,
          })
          .uint8("answer");
        deepStrictEqual(mainParser.parse(buffer), {
          length: compressedData.length,
          compressedData: {
            a: 12,
            b: text.substring(0, text.length - 1),
            c: 34,
          },
          answer: 42,
        });
      });
    });
  });
}

compositeParserTests("Buffer", (arr) => Buffer.from(arr));
compositeParserTests("Uint8Array", (arr) => Uint8Array.from(arr));
