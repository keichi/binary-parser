import { Parser } from "../../lib/binary_parser.js";

const type = new Parser().uint8("value");

const copiedBytes = new Parser().wrapped("data", {
  length: 1,
  type,
  wrapper: (input) => Uint8Array.from(input),
});
copiedBytes.parse(Uint8Array.of(42));

const slicedBytes = new Parser().wrapped("data", {
  length: 1,
  type,
  wrapper: (input: Uint8Array): Uint8Array => input.subarray(0),
});
slicedBytes.parse(Buffer.from([42]));

const copiedBuffer = new Parser().wrapped("data", {
  length: 1,
  type,
  wrapper: (input: Buffer): Buffer => Buffer.from(input),
});
copiedBuffer.parse(Buffer.from([42]));

new Parser().wrapped("data", {
  length: 1,
  type,
  // @ts-expect-error Wrapper output must provide Uint8Array's byte-view methods.
  wrapper: () => new ArrayBuffer(1),
});
