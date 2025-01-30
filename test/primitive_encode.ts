import { deepStrictEqual, throws } from "assert";
import { Parser } from "../lib/binary_parser";

describe("Primitive encoding", () => {
  describe("Integer encoding", () => {
    it("should encode basic integer types", () => {
      const parser = Parser.start().uint8("a").int16le("b").uint32be("c");

      const encoded = parser.encode({
        a: 0,
        b: 1234,
        c: 12345678,
      });

      deepStrictEqual(
        Array.from(encoded),
        [0x00, 0xd2, 0x04, 0x00, 0xbc, 0x61, 0x4e],
      );
    });

    it("should encode with correct endianness", () => {
      const parser = Parser.start().int32le("little").int32be("big");

      const encoded = parser.encode({
        little: 12345678,
        big: 12345678,
      });

      deepStrictEqual(
        Array.from(encoded),
        [0x4e, 0x61, 0xbc, 0x00, 0x00, 0xbc, 0x61, 0x4e],
      );
    });
  });

  describe("String encoding", () => {
    it("should encode fixed-length strings", () => {
      const parser = Parser.start().string("msg", {
        length: 5,
        encoding: "utf8",
      });

      const encoded = parser.encode({
        msg: "hello",
      });

      deepStrictEqual(Array.from(encoded), [0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    it("should encode zero-terminated strings", () => {
      const parser = Parser.start().string("msg", {
        zeroTerminated: true,
        encoding: "utf8",
      });

      const encoded = parser.encode({
        msg: "hello",
      });

      deepStrictEqual(
        Array.from(encoded),
        [0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00],
      );
    });
  });

  describe("Bit field encoding", () => {
    it("should encode bit fields", () => {
      const parser = Parser.start().bit1("a").bit2("b").bit4("c").bit1("d");

      const encoded = parser.encode({
        a: "a",
        b: "bb",
        c: "cccc",
        d: "d",
      });

      deepStrictEqual(Array.from(encoded), [97, 98, 98, 99, 99, 99, 99, 100]);
    });

    it("should encode larger bit fields", () => {
      const parser = Parser.start().bit3("a").bit9("b").bit4("c");

      const encoded = parser.encode({
        a: "aaa",
        b: "bbbbbbbbb",
        c: "cccc",
      });

      deepStrictEqual(
        Array.from(encoded),
        [97, 97, 97, 98, 98, 98, 98, 98, 98, 98, 98, 98, 99, 99, 99, 99],
      );
    });
  });

  describe("Complex structures", () => {
    it("should encode nested structures", () => {
      const parser = Parser.start()
        .uint8("type")
        .nest("data", {
          type: Parser.start().uint16le("value").string("text", { length: 3 }),
        });

      const encoded = parser.encode({
        type: 1,
        data: {
          value: 1234,
          text: "abc",
        },
      });

      deepStrictEqual(
        Array.from(encoded),
        [0x01, 0xd2, 0x04, 0x61, 0x62, 0x63],
      );
    });

    it("should encode arrays", () => {
      const parser = Parser.start().uint8("length").array("data", {
        type: "uint8",
        length: "length",
      });

      const encoded = parser.encode({
        length: 3,
        data: [1, 2, 3],
      });

      deepStrictEqual(Array.from(encoded), [0x03, 0x01, 0x02, 0x03]);
    });
  });

  describe("Error cases", () => {
    it("should throw on invalid integer values", () => {
      const parser = Parser.start().uint8("value");

      throws(() => {
        parser.encode({ value: 256 });
      });
    });

    it("should throw on missing required fields", () => {
      const parser = Parser.start()
        .uint8("required")
        .string("text", { length: 3 });

      throws(() => {
        parser.encode({ text: "abc" });
      });
    });
  });
});
