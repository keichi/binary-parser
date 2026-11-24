import { Parser } from "../lib/binary_parser";

describe("dynamic field lengths", () => {
  for (const kind of ["string", "buffer", "wrapped"] as const) {
    it(`evaluates a ${kind} length once before advancing the cursor`, () => {
      let calls = 0;
      const length = () => (++calls === 1 ? 2 : 3);
      const parser = new Parser().uint8("prefix");
      if (kind === "wrapped") {
        parser.wrapped("field", {
          length,
          wrapper: (bytes) => bytes,
          type: new Parser().array("bytes", {
            type: "uint8",
            readUntil: "eof",
          }),
        });
      } else {
        parser[kind]("field", { length });
      }
      parser.saveOffset("offset").uint8("next");
      const result = parser.parse(new Uint8Array([9, 65, 66, 99, 100, 101]));
      expect(result.field).toStrictEqual(
        kind === "string"
          ? "AB"
          : kind === "buffer"
            ? new Uint8Array([65, 66])
            : { bytes: [65, 66] },
      );
      expect([result.offset, result.next, calls]).toStrictEqual([3, 99, 1]);
    });
  }

  it("uses the captured array length when assigning context indexes", () => {
    let calls = 0;
    const element = new Parser().uint8("value", {
      formatter(this: any, value) {
        return { value, index: this.$index };
      },
    });
    const parser = new Parser().useContextVars().array("items", {
      type: element,
      length: () => (++calls === 1 ? 2 : 5),
    });
    expect(parser.parse(new Uint8Array([8, 9]))).toStrictEqual({
      items: [
        { value: { value: 8, index: 0 } },
        { value: { value: 9, index: 1 } },
      ],
    });
    expect(calls).toBe(1);
  });
});
