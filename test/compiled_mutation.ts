import { Parser } from "../lib/binary_parser";

describe("changes after compilation", () => {
  for (const explicit of [false, true]) {
    it(`includes fields appended after ${explicit ? "compile" : "parse"}`, () => {
      const parser = new Parser().uint8("first");
      const input = new Uint8Array([1, 2]);
      if (explicit) parser.compile();
      else expect(parser.parse(input)).toStrictEqual({ first: 1 });
      parser.uint8("second");
      expect(parser.parse(input)).toStrictEqual({ first: 1, second: 2 });
    });
  }

  it("uses a constructor selected after the first parse", () => {
    class Result {
      kind = "custom";
    }
    const parser = new Parser().uint8("value");
    parser.parse(new Uint8Array([1]));
    parser.create(Result);
    const result = parser.parse(new Uint8Array([2]));
    expect(result).toBeInstanceOf(Result);
    expect(result.kind).toBe("custom");
    expect(result.value).toBe(2);
  });

  it("honors context toggles after earlier parses", () => {
    const child = new Parser().uint8("value", {
      formatter(this: any) {
        return this.$parent !== undefined;
      },
    });
    const parser = new Parser().nest("child", { type: child });
    const input = new Uint8Array([1]);
    expect(parser.parse(input).child.value).toBe(false);
    parser.useContextVars();
    expect(parser.parse(input).child.value).toBe(true);
    parser.useContextVars(false);
    expect(parser.parse(input).child.value).toBe(false);
  });
});
