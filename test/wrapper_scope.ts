import { Parser } from "../lib/binary_parser";

function changedGlobals(run: () => void): string[] {
  const before = Object.getOwnPropertyDescriptors(globalThis);
  let changed: string[] = [];
  try {
    run();
  } finally {
    const after = Object.getOwnPropertyDescriptors(globalThis);
    changed = Object.keys(after).filter(
      (name) =>
        !Object.hasOwn(before, name) ||
        !Object.is(before[name].value, after[name].value),
    );
    for (const name of changed) {
      if (Object.hasOwn(before, name)) {
        Object.defineProperty(globalThis, name, before[name]);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  }
  return changed;
}

const boundaries = [
  { length: 1 },
  { readUntil: "eof" as const },
  { readUntil: (byte: number) => byte === 0 },
];

describe("Wrapped parser variable scope", () => {
  for (const boundary of boundaries) {
    const label = "length" in boundary ? "length" : String(boundary.readUntil);

    it(`keeps ${label} buffers local on repeated parses`, () => {
      const parser = new Parser().wrapped("packet", {
        ...boundary,
        wrapper: (bytes: Uint8Array) => bytes,
        type: new Parser().uint8("value"),
      });

      const changed = changedGlobals(() => {
        expect(parser.parse(Uint8Array.of(7, 0))).toStrictEqual({
          packet: { value: 7 },
        });
        expect(parser.parse(Uint8Array.of(9, 0))).toStrictEqual({
          packet: { value: 9 },
        });
      });
      expect(changed).toStrictEqual([]);
    });

    it(`keeps ${label} buffers local when the wrapper throws`, () => {
      const failure = new Error("wrapper failed");
      const parser = new Parser().wrapped("packet", {
        ...boundary,
        wrapper: () => {
          throw failure;
        },
        type: new Parser().uint8("value"),
      });

      const changed = changedGlobals(() => {
        expect(() => parser.parse(Uint8Array.of(7, 0))).toThrow(failure);
      });
      expect(changed).toStrictEqual([]);
    });
  }
});
