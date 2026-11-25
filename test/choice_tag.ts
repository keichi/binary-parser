import { Parser } from "../lib/binary_parser";

function choiceTagTests(
  name: string,
  factory: (bytes: number[]) => Uint8Array,
) {
  describe(`Choice tag evaluation (${name})`, () => {
    const alias = `choice_tag_${name}`;
    new Parser().uint8("value").namely(alias);
    const cases: [string, string | Parser, number | { value: number }][] = [
      ["primitive", "uint8", 42],
      ["inline parser", new Parser().uint8("value"), { value: 42 }],
      ["aliased parser", alias, { value: 42 }],
    ];

    for (const [description, type, result] of cases) {
      it(`can replace the tag field with a ${description} result`, () => {
        const parser = new Parser()
          .uint8("kind")
          .choice("kind", { tag: "kind", choices: { 1: type } })
          .uint8("tail");

        expect(parser.parse(factory([1, 42, 7]))).toStrictEqual({
          kind: result,
          tail: 7,
        });
      });
    }

    it("calls a tag function while the previous field value is still available", () => {
      let calls = 0;
      const parser = new Parser()
        .uint8("kind")
        .choice("kind", {
          tag: function (this: { kind: number }, root: { kind: number }) {
            calls++;
            expect(this).toBe(root);
            return this.kind;
          },
          choices: { 1: "uint8" },
        })
        .uint8("tail");

      expect(parser.parse(factory([1, 42, 7]))).toStrictEqual({
        kind: 42,
        tail: 7,
      });
      expect(calls).toBe(1);
    });

    it("reads a nested tag before replacing its containing field", () => {
      const parser = new Parser()
        .nest("header", { type: new Parser().uint8("kind") })
        .choice("header", {
          tag: "header.kind",
          choices: { 1: new Parser().uint8("value") },
        })
        .uint8("tail");

      expect(parser.parse(factory([1, 42, 7]))).toStrictEqual({
        header: { value: 42 },
        tail: 7,
      });
    });

    it("does not select the default when replacing a matching tag field", () => {
      const parser = new Parser()
        .uint8("kind")
        .choice("kind", {
          tag: "kind",
          choices: { 1: "uint8" },
          defaultChoice: "uint16be",
        })
        .uint8("tail");

      expect(parser.parse(factory([1, 42, 7]))).toStrictEqual({
        kind: 42,
        tail: 7,
      });
    });

    it("reports an unmatched function tag without evaluating it again", () => {
      let calls = 0;
      const parser = new Parser().choice("result", {
        tag: () => {
          calls++;
          return 8;
        },
        choices: { 1: "uint8" },
      });

      expect(() => parser.parse(factory([42]))).toThrow(
        "Met undefined tag value 8 at choice",
      );
      expect(calls).toBe(1);
    });

    it("still selects the default for an unmatched tag", () => {
      const parser = new Parser()
        .uint8("kind")
        .choice("kind", {
          tag: "kind",
          choices: { 1: "uint8" },
          defaultChoice: "uint16be",
        })
        .uint8("tail");

      expect(parser.parse(factory([2, 0x12, 0x34, 7]))).toStrictEqual({
        kind: 0x1234,
        tail: 7,
      });
    });

    it("keeps anonymous choices in the current scope", () => {
      const parser = new Parser()
        .uint8("kind")
        .choice({ tag: "kind", choices: { 1: new Parser().uint8("value") } })
        .uint8("tail");

      expect(parser.parse(factory([1, 42, 7]))).toStrictEqual({
        kind: 1,
        value: 42,
        tail: 7,
      });
    });
  });
}

if (typeof Buffer !== "undefined") {
  choiceTagTests("Buffer", (bytes) => Buffer.from(bytes));
}
choiceTagTests("Uint8Array", (bytes) => Uint8Array.from(bytes));
