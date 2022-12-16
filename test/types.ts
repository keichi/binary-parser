import { expectTypeOf } from "expect-type";

import { Parser as Parser_ } from "../lib/binary_parser";

type Endianness = "be" | "le";
type N = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type BitSizes = Exclude<N, 0> | `1${N}` | `2${N}` | `3${0 | 1 | 2}`;
type Int<T extends number> =
  | `int${T}`
  | `uint${T}`
  | `int${T}${Endianness}`
  | `uint${T}${Endianness}`;
type NumericType =
  | "int8"
  | "uint8"
  | Int<16>
  | Int<32>
  | Int<64>
  | `float${Endianness}`
  | `double${Endianness}`
  | `bit${BitSizes}`;

const buf = Buffer.from([]);

// We only care about the types, don't actually parse
class Parser extends Parser_ {
  static start() {
    return new Parser();
  }
  parse() {
    return {};
  }
  // @ts-expect-error
  private setNextParser() {
    return this;
  }
}

describe("Parser", () => {
  it("should have correct numeric types", () => {
    const numericType = "uint8" as NumericType;
    expectTypeOf(
      Parser.start()
        [numericType]("x", {
          assert: (x) => {
            expectTypeOf(x).toEqualTypeOf<number>();
            return x == 1;
          },
          formatter: (x) => {
            expectTypeOf(x).toEqualTypeOf<number>();
            return x.toString();
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{
      x: string;
    }>();
  });
  it("should have correct string types", () => {
    expectTypeOf(
      Parser.start().string("s", { length: 1 }).parse(buf)
    ).toEqualTypeOf<{ s: string }>();
    expectTypeOf(
      Parser.start()
        .string("s", {
          length: 1,
          assert: (s) => {
            expectTypeOf(s).toEqualTypeOf<string>();
            return s.length == 1;
          },
          formatter: (s) => {
            expectTypeOf(s).toEqualTypeOf<string>();
            return Number(s);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ s: number }>();
  });
  it("should have correct buffer types", () => {
    expectTypeOf(
      Parser.start().buffer("b", { length: 1 }).parse(buf)
    ).toEqualTypeOf<{ b: Buffer }>();
    expectTypeOf(
      Parser.start()
        .buffer("b", {
          length: 1,
          assert: (b) => {
            expectTypeOf(b).toEqualTypeOf<Buffer>();
            return b.length == 1;
          },
          formatter: (b) => {
            expectTypeOf(b).toEqualTypeOf<Buffer>();
            return Number(b[0]);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ b: number }>();
  });
  it("should have correct wrapped types", () => {
    expectTypeOf(
      Parser.start()
        .wrapped("w", {
          type: Parser.start().string("s", { length: 1 }),
          wrapper: (b) => b,
          length: 1,
        })
        .parse(buf)
    ).toEqualTypeOf<{ w: { s: string } }>();
    expectTypeOf(
      Parser.start()
        .wrapped({
          type: Parser.start().string("s", { length: 1 }),
          wrapper: (b) => b,
          length: 1,
        })
        .parse(buf)
    ).toEqualTypeOf<{ s: string }>();
    expectTypeOf(
      Parser.start()
        .wrapped("w", {
          type: Parser.start().string("s", { length: 1 }),
          length: 1,
          wrapper(b) {
            expectTypeOf(b).toEqualTypeOf<Buffer | Uint8Array>();
            return b;
          },
          assert: (w) => {
            expectTypeOf(w).toEqualTypeOf<{ s: string }>();
            return w.s.length == 1;
          },
          formatter: (w) => {
            expectTypeOf(w).toEqualTypeOf<{ s: string }>();
            return Number(w.s);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ w: number }>();
  });
  it("should have correct array types", () => {
    const arr = Parser.start()
      .array("a", {
        type: "uint8" as const,
        length: 1,
      })
      .parse(buf);
    expectTypeOf(arr).toEqualTypeOf<{ a: number[] }>();
    expectTypeOf(arr.a?.[0]).not.toBeAny();

    const arr2 = Parser.start()
      .array("a", {
        type: Parser.start().string("s", { length: 10 }),
        length: 1,
      })
      .parse(buf);
    expectTypeOf(arr2).toEqualTypeOf<{ a: { s: string }[] }>();
    expectTypeOf(arr2.a?.[0]).not.toBeAny();

    expectTypeOf(
      Parser.start()
        .array("a", {
          type: Parser.start().string("s", { length: 1 }),
          length: 1,
          assert(a) {
            expectTypeOf(a).toEqualTypeOf<{ s: string }[]>();
            return a[0]?.s.length === 1;
          },
          formatter(a) {
            expectTypeOf(a).toEqualTypeOf<{ s: string }[]>();
            return Number(a[0]?.s);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ a: number }>();
  });
  it("should have correct choice types", () => {
    expectTypeOf(
      Parser.start()
        .uint8("tag")
        .choice("val", {
          tag: "tag",
          choices: {
            1: Parser.start().uint8("num"),
            2: Parser.start().string("str", { zeroTerminated: true }),
          },
          defaultChoice: Parser.start().uint8("def"),
        })
        .parse(buf)
    ).toEqualTypeOf<{
      tag: number;
      val: { num: number } | { str: string } | { def: number };
    }>();
    expectTypeOf(
      Parser.start()
        .uint8("tag")
        .choice({
          tag: "tag",
          choices: {
            1: Parser.start().uint8("num"),
            2: Parser.start().string("str", { zeroTerminated: true }),
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ tag: number } & ({ num: number } | { str: string })>();
  });
  it("should have correct nest types", () => {
    expectTypeOf(
      Parser.start()
        .nest("n", { type: Parser.start().string("s", { length: 1 }) })
        .parse(buf)
    ).toEqualTypeOf<{ n: { s: string } }>();
    expectTypeOf(
      Parser.start()
        .nest({ type: Parser.start().string("s", { length: 1 }) })
        .parse(buf)
    ).toEqualTypeOf<{ s: string }>();
    expectTypeOf(
      Parser.start()
        .nest("n", {
          type: Parser.start().string("s", { length: 1 }),
          assert: (n) => {
            expectTypeOf(n).toEqualTypeOf<{ s: string }>();
            return n.s.length == 1;
          },
          formatter: (n) => {
            expectTypeOf(n).toEqualTypeOf<{ s: string }>();
            return Number(n.s);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ n: number }>();
  });
  it("should have correct pointer types", () => {
    expectTypeOf(
      Parser.start()
        .pointer("p", {
          type: Parser.start().string("s", { length: 1 }),
          offset: 1,
        })
        .parse(buf)
    ).toEqualTypeOf<{ p: { s: string } }>();
    expectTypeOf(
      Parser.start()
        .pointer("p", {
          type: Parser.start().string("s", { length: 1 }),
          offset: 1,
          assert: (p) => {
            expectTypeOf(p).toEqualTypeOf<{ s: string }>();
            return p.s.length == 1;
          },
          formatter: (p) => {
            expectTypeOf(p).toEqualTypeOf<{ s: string }>();
            return Number(p.s);
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ p: number }>();
  });
  it("should have correct offset types", () => {
    expectTypeOf(Parser.start().saveOffset("p").parse(buf)).toEqualTypeOf<{
      p: number;
    }>();
    expectTypeOf(
      Parser.start()
        .saveOffset("p", {
          assert: (p) => {
            expectTypeOf(p).toEqualTypeOf<number>();
            return p == 1;
          },
          formatter: (p) => {
            expectTypeOf(p).toEqualTypeOf<number>();
            return p.toString();
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ p: string }>();
  });
  it("should have assert context type", () => {
    expectTypeOf(
      Parser.start()
        .uint8("a")
        .uint8("b", {
          assert() {
            expectTypeOf(this).toEqualTypeOf<{ a: number }>();
            return this.a == 1;
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ a: number; b: number }>();
  });
  it("should have tag context type", () => {
    expectTypeOf(
      Parser.start()
        .uint8("a")
        .choice({
          tag() {
            expectTypeOf(this).toEqualTypeOf<{ a: number }>();
            return this.a;
          },
          choices: {
            1: Parser.start().uint8("num"),
          },
        })
        .parse(buf)
    ).toEqualTypeOf<{ a: number; num: number }>();
  });
});
