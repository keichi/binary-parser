import { Parser } from "../lib/binary_parser";

describe("wrapped parser context", () => {
  for (const aliased of [false, true]) {
    it(`preserves parent and root for ${aliased ? "named" : "inline"} types`, () => {
      const child = new Parser().uint8("value", {
        formatter(this: any, value) {
          return { value, parent: this.$parent.tag, root: this.$root.rootTag };
        },
      });
      const type = aliased
        ? child.namely("wrapper_context_child").alias!
        : child;
      const parent = new Parser().uint8("tag").wrapped("child", {
        length: 1,
        wrapper: (bytes) => bytes,
        type,
      });
      const parser = new Parser()
        .useContextVars()
        .uint8("rootTag")
        .nest("parent", { type: parent });
      expect(parser.parse(new Uint8Array([3, 4, 5]))).toStrictEqual({
        rootTag: 3,
        parent: { tag: 4, child: { value: { value: 5, parent: 4, root: 3 } } },
      });
    });
  }

  it("leaves context disabled for inline wrapped types by default", () => {
    const child = new Parser().uint8("value", {
      formatter(this: any, value) {
        expect(Object.hasOwn(this, "$parent")).toBe(false);
        expect(Object.hasOwn(this, "$root")).toBe(false);
        return value;
      },
    });
    const parser = new Parser().wrapped("child", {
      type: child,
      length: 1,
      wrapper: (bytes) => bytes,
    });
    expect(parser.parse(new Uint8Array([5]))).toStrictEqual({
      child: { value: 5 },
    });
  });
});
