import { Parser } from "../lib/binary_parser";

describe("primitive type lookup", () => {
  for (const type of ["toString", "constructor", "valueOf"]) {
    it(`rejects inherited Object member ${type} as an array type`, () => {
      expect(() => new Parser().array("items", { type, length: 1 })).toThrow(
        "unknown",
      );
    });
    it(`rejects inherited Object member ${type} as a pointer type`, () => {
      expect(() => new Parser().pointer("item", { type, offset: 0 })).toThrow(
        "unknown",
      );
    });
    it(`rejects inherited Object member ${type} as a choice type`, () => {
      expect(() =>
        new Parser().choice("item", { tag: 1, choices: { 1: type } }),
      ).toThrow("unknown");
    });
  }

  it("still permits an explicitly registered alias with an Object member name", () => {
    new Parser().uint8("value").namely("toString");
    const parser = new Parser().array("items", { type: "toString", length: 1 });
    expect(parser.parse(new Uint8Array([7]))).toStrictEqual({
      items: [{ value: 7 }],
    });
  });
});
