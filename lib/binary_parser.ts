const IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function sanitizeReference(ref: string): string {
  if (!ref.split(".").every((s) => IDENTIFIER.test(s))) {
    throw new Error(`Invalid reference: ${ref}`);
  }
  return ref;
}

class Context {
  code = "";
  scopes = [["vars"]];
  bitFields: Parser[] = [];
  tmpVariableCount = 0;
  references = new Map<string, { resolved: boolean; requested: boolean }>();
  importPath: string;
  imports: any[] = [];
  reverseImports = new Map<any, number>();
  useContextVariables = false;

  constructor(importPath: string, useContextVariables: boolean) {
    this.importPath = importPath;
    this.useContextVariables = useContextVariables;
  }

  generateVariable(name?: string): string {
    const scopes = [...this.scopes[this.scopes.length - 1]];
    if (name) {
      scopes.push(name);
    }

    return scopes.join(".");
  }

  generateOption(val: number | string | Function): string {
    switch (typeof val) {
      case "number":
        return val.toString();
      case "string":
        return this.generateVariable(sanitizeReference(val));
      default:
        return `${this.addImport(val)}.call(${this.generateVariable()}, vars)`;
    }
  }

  generateError(err: string) {
    this.pushCode(`throw new Error(${err});`);
  }

  generateTmpVariable(): string {
    return "$tmp" + this.tmpVariableCount++;
  }

  pushCode(code: string) {
    this.code += code + "\n";
  }

  pushPath(name: string) {
    if (name) {
      this.scopes[this.scopes.length - 1].push(name);
    }
  }

  popPath(name: string) {
    if (name) {
      this.scopes[this.scopes.length - 1].pop();
    }
  }

  pushScope(name: string) {
    this.scopes.push([name]);
  }

  popScope() {
    this.scopes.pop();
  }

  addImport(im: any): string {
    if (!this.importPath) return `(${im})`;
    let id = this.reverseImports.get(im);
    if (id === undefined) {
      id = this.imports.push(im) - 1;
      this.reverseImports.set(im, id);
    }
    return `${this.importPath}[${id}]`;
  }

  addReference(alias: string) {
    if (!this.references.has(alias)) {
      this.references.set(alias, { resolved: false, requested: false });
    }
  }

  markResolved(alias: string) {
    const reference = this.references.get(alias);

    if (reference) {
      reference.resolved = true;
    }
  }

  markRequested(aliasList: string[]) {
    aliasList.forEach((alias) => {
      const reference = this.references.get(alias);

      if (reference) {
        reference.requested = true;
      }
    });
  }

  getUnresolvedReferences(): string[] {
    return Array.from(this.references)
      .filter(([_, reference]) => !reference.resolved && !reference.requested)
      .map(([alias, _]) => alias);
  }
}

const aliasRegistry = new Map<string, Parser>();
const FUNCTION_PREFIX = "___parser_";

interface ParserOptions {
  length?: number | string | ((item: any) => number);
  assert?: number | string | ((item: number | string) => boolean);
  lengthInBytes?: number | string | ((item: any) => number);
  type?: string | Parser;
  formatter?: (item: any) => any;
  encoding?: string;
  decoder?: TextDecoder;
  readUntil?: "eof" | ((item: any, buffer: Buffer) => boolean);
  greedy?: boolean;
  choices?: { [key: number]: string | Parser };
  defaultChoice?: string | Parser;
  zeroTerminated?: boolean;
  clone?: boolean;
  stripNull?: boolean;
  key?: string;
  tag?: string | ((item: any) => number);
  offset?: number | string | ((item: any) => number);
  wrapper?: (buffer: Buffer) => Buffer;
  skip?: boolean;
}

type Types = PrimitiveTypes | ComplexTypes;

type ComplexTypes =
  | "bit"
  | "string"
  | "buffer"
  | "array"
  | "choice"
  | "nest"
  | "seek"
  | "pointer"
  | "saveOffset"
  | "wrapper"
  | "";

type Endianness = "be" | "le";

type PrimitiveTypes =
  | "uint8"
  | "uint16le"
  | "uint16be"
  | "uint24le"
  | "uint24be"
  | "uint32le"
  | "uint32be"
  | "uint48le"
  | "uint48be"
  | "uint64le"
  | "uint64be"
  | "int8"
  | "int16le"
  | "int16be"
  | "int24le"
  | "int24be"
  | "int32le"
  | "int32be"
  | "int48le"
  | "int48be"
  | "int64le"
  | "int64be"
  | "floatle"
  | "floatbe"
  | "doublele"
  | "doublebe";

type PrimitiveTypesWithoutEndian =
  | "uint8"
  | "uint16"
  | "uint24"
  | "uint32"
  | "int8"
  | "int16"
  | "int24"
  | "int32"
  | "int48"
  | "uint48"
  | "int64"
  | "uint64"
  | "float"
  | "double";

type BitSizes =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32;

const PRIMITIVE_SIZES: { [key in PrimitiveTypes]: number } = {
  uint8: 1,
  uint16le: 2,
  uint16be: 2,
  uint24le: 3,
  uint24be: 3,
  uint32le: 4,
  uint32be: 4,
  int8: 1,
  int16le: 2,
  int16be: 2,
  int24le: 3,
  int24be: 3,
  int32le: 4,
  int32be: 4,
  int48be: 6,
  int48le: 6,
  uint48be: 6,
  uint48le: 6,
  int64be: 8,
  int64le: 8,
  uint64be: 8,
  uint64le: 8,
  floatle: 4,
  floatbe: 4,
  doublele: 8,
  doublebe: 8,
};

const PRIMITIVE_NAMES: { [key in PrimitiveTypes]: string } = {
  uint8: "Uint8",
  uint16le: "Uint16",
  uint16be: "Uint16",
  uint24le: "Uint24",
  uint24be: "Uint24",
  uint32le: "Uint32",
  uint32be: "Uint32",
  int8: "Int8",
  int16le: "Int16",
  int16be: "Int16",
  int24le: "Int24",
  int24be: "Int24",
  int32le: "Int32",
  int32be: "Int32",
  int48be: "Int48",
  int48le: "Int48",
  uint48be: "Uint48",
  uint48le: "Uint48",
  int64be: "BigInt64",
  int64le: "BigInt64",
  uint64be: "BigUint64",
  uint64le: "BigUint64",
  floatle: "Float32",
  floatbe: "Float32",
  doublele: "Float64",
  doublebe: "Float64",
};

const PRIMITIVE_LITTLE_ENDIANS: { [key in PrimitiveTypes]: boolean } = {
  uint8: false,
  uint16le: true,
  uint16be: false,
  uint24le: true,
  uint24be: false,
  uint32le: true,
  uint32be: false,
  int8: false,
  int16le: true,
  int16be: false,
  int24le: true,
  int24be: false,
  int32le: true,
  int32be: false,
  int48be: false,
  int48le: true,
  uint48be: false,
  uint48le: true,
  int64be: false,
  int64le: true,
  uint64be: false,
  uint64le: true,
  floatle: true,
  floatbe: false,
  doublele: true,
  doublebe: false,
};

// Returns an expression that reads a value of the given type at offset.
// DataView has no 24/48-bit getters, so compose them from narrower reads.
// 48-bit values fit in a safe integer, so they are returned as number.
function readPrimitive(type: PrimitiveTypes): string {
  switch (type) {
    case "uint48be":
      return "(dataView.getUint16(offset) * 0x100000000 + dataView.getUint32(offset + 2))";
    case "int48be":
      return "(dataView.getInt16(offset) * 0x100000000 + dataView.getUint32(offset + 2))";
    case "uint48le":
      return "(dataView.getUint32(offset, true) + dataView.getUint16(offset + 4, true) * 0x100000000)";
    case "int48le":
      return "(dataView.getUint32(offset, true) + dataView.getInt16(offset + 4, true) * 0x100000000)";
    case "uint24be":
      return "(dataView.getUint16(offset) << 8 | dataView.getUint8(offset + 2))";
    case "int24be":
      return "(dataView.getInt16(offset) << 8 | dataView.getUint8(offset + 2))";
    case "uint24le":
      return "(dataView.getUint16(offset, true) | dataView.getUint8(offset + 2) << 16)";
    case "int24le":
      return "(dataView.getUint16(offset, true) | dataView.getInt8(offset + 2) << 16)";
    default:
      return `dataView.get${PRIMITIVE_NAMES[type]}(offset, ${PRIMITIVE_LITTLE_ENDIANS[type]})`;
  }
}

// Encodings that TextDecoder doesn't support, decoded like Node.js Buffer
const BYTE_ENCODINGS = ["hex", "binary", "base64", "base64url"];

// Must not reference outer scope (see Context#addImport).
function bytesToLatin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as any);
  }
  return s;
}

export class Parser {
  varName = "";
  type: Types = "";
  options: ParserOptions = {};
  next?: Parser;
  head?: Parser;
  compiled?: Function;
  endian: Endianness = "be";
  constructorFn?: Function;
  alias?: string;
  useContextVariables = false;

  static start() {
    return new Parser();
  }

  private sanitizeFieldName(name: string): string {
    if (name && !IDENTIFIER.test(name)) {
      throw new Error(`Invalid field name: ${name}`);
    }
    return name;
  }

  private primitiveGenerateN(type: PrimitiveTypes, ctx: Context) {
    ctx.pushCode(
      `${ctx.generateVariable(this.varName)} = ${readPrimitive(type)};`,
    );
    ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type]};`);
  }

  private primitiveN(
    type: PrimitiveTypes,
    varName: string,
    options: ParserOptions,
  ): this {
    return this.setNextParser(type, varName, options);
  }

  private useThisEndian(type: PrimitiveTypesWithoutEndian): PrimitiveTypes {
    return (type + this.endian.toLowerCase()) as PrimitiveTypes;
  }

  // Appends this parser's endianness to type names without an endian suffix
  // (e.g. "int32" -> "int32be"). Aliases and other values are left as is.
  private resolveEndian<T>(type: T): T {
    if (
      typeof type === "string" &&
      !aliasRegistry.has(type) &&
      !(type in PRIMITIVE_SIZES) &&
      type + this.endian in PRIMITIVE_SIZES
    ) {
      return (type + this.endian) as T;
    }
    return type;
  }

  uint8(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint8", varName, options);
  }

  uint16(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("uint16"), varName, options);
  }

  uint16le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint16le", varName, options);
  }

  uint16be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint16be", varName, options);
  }

  uint24(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("uint24"), varName, options);
  }

  uint24le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint24le", varName, options);
  }

  uint24be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint24be", varName, options);
  }

  uint32(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("uint32"), varName, options);
  }

  uint32le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint32le", varName, options);
  }

  uint32be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint32be", varName, options);
  }

  uint48(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("uint48"), varName, options);
  }

  uint48le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint48le", varName, options);
  }

  uint48be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint48be", varName, options);
  }

  int8(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int8", varName, options);
  }

  int16(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("int16"), varName, options);
  }

  int16le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int16le", varName, options);
  }

  int16be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int16be", varName, options);
  }

  int24(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("int24"), varName, options);
  }

  int24le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int24le", varName, options);
  }

  int24be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int24be", varName, options);
  }

  int32(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("int32"), varName, options);
  }

  int32le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int32le", varName, options);
  }

  int32be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int32be", varName, options);
  }

  int48(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("int48"), varName, options);
  }

  int48le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int48le", varName, options);
  }

  int48be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int48be", varName, options);
  }

  int64(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("int64"), varName, options);
  }

  int64be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int64be", varName, options);
  }

  int64le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("int64le", varName, options);
  }

  uint64(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("uint64"), varName, options);
  }

  uint64be(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint64be", varName, options);
  }

  uint64le(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("uint64le", varName, options);
  }

  float(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("float"), varName, options);
  }

  floatle(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("floatle", varName, options);
  }

  floatbe(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("floatbe", varName, options);
  }

  double(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN(this.useThisEndian("double"), varName, options);
  }

  doublele(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("doublele", varName, options);
  }

  doublebe(varName: string, options: ParserOptions = {}): this {
    return this.primitiveN("doublebe", varName, options);
  }

  private bitN(size: BitSizes, varName: string, options: ParserOptions): this {
    return this.setNextParser("bit", varName, { ...options, length: size });
  }

  bit1(varName: string, options: ParserOptions = {}): this {
    return this.bitN(1, varName, options);
  }

  bit2(varName: string, options: ParserOptions = {}): this {
    return this.bitN(2, varName, options);
  }

  bit3(varName: string, options: ParserOptions = {}): this {
    return this.bitN(3, varName, options);
  }

  bit4(varName: string, options: ParserOptions = {}): this {
    return this.bitN(4, varName, options);
  }

  bit5(varName: string, options: ParserOptions = {}): this {
    return this.bitN(5, varName, options);
  }

  bit6(varName: string, options: ParserOptions = {}): this {
    return this.bitN(6, varName, options);
  }

  bit7(varName: string, options: ParserOptions = {}): this {
    return this.bitN(7, varName, options);
  }

  bit8(varName: string, options: ParserOptions = {}): this {
    return this.bitN(8, varName, options);
  }

  bit9(varName: string, options: ParserOptions = {}): this {
    return this.bitN(9, varName, options);
  }

  bit10(varName: string, options: ParserOptions = {}): this {
    return this.bitN(10, varName, options);
  }

  bit11(varName: string, options: ParserOptions = {}): this {
    return this.bitN(11, varName, options);
  }

  bit12(varName: string, options: ParserOptions = {}): this {
    return this.bitN(12, varName, options);
  }

  bit13(varName: string, options: ParserOptions = {}): this {
    return this.bitN(13, varName, options);
  }

  bit14(varName: string, options: ParserOptions = {}): this {
    return this.bitN(14, varName, options);
  }

  bit15(varName: string, options: ParserOptions = {}): this {
    return this.bitN(15, varName, options);
  }

  bit16(varName: string, options: ParserOptions = {}): this {
    return this.bitN(16, varName, options);
  }

  bit17(varName: string, options: ParserOptions = {}): this {
    return this.bitN(17, varName, options);
  }

  bit18(varName: string, options: ParserOptions = {}): this {
    return this.bitN(18, varName, options);
  }

  bit19(varName: string, options: ParserOptions = {}): this {
    return this.bitN(19, varName, options);
  }

  bit20(varName: string, options: ParserOptions = {}): this {
    return this.bitN(20, varName, options);
  }

  bit21(varName: string, options: ParserOptions = {}): this {
    return this.bitN(21, varName, options);
  }

  bit22(varName: string, options: ParserOptions = {}): this {
    return this.bitN(22, varName, options);
  }

  bit23(varName: string, options: ParserOptions = {}): this {
    return this.bitN(23, varName, options);
  }

  bit24(varName: string, options: ParserOptions = {}): this {
    return this.bitN(24, varName, options);
  }

  bit25(varName: string, options: ParserOptions = {}): this {
    return this.bitN(25, varName, options);
  }

  bit26(varName: string, options: ParserOptions = {}): this {
    return this.bitN(26, varName, options);
  }

  bit27(varName: string, options: ParserOptions = {}): this {
    return this.bitN(27, varName, options);
  }

  bit28(varName: string, options: ParserOptions = {}): this {
    return this.bitN(28, varName, options);
  }

  bit29(varName: string, options: ParserOptions = {}): this {
    return this.bitN(29, varName, options);
  }

  bit30(varName: string, options: ParserOptions = {}): this {
    return this.bitN(30, varName, options);
  }

  bit31(varName: string, options: ParserOptions = {}): this {
    return this.bitN(31, varName, options);
  }

  bit32(varName: string, options: ParserOptions = {}): this {
    return this.bitN(32, varName, options);
  }

  namely(alias: string): this {
    this.sanitizeFieldName(alias);
    aliasRegistry.set(alias, this);
    this.alias = alias;
    return this;
  }

  skip(length: ParserOptions["length"], options: ParserOptions = {}): this {
    return this.seek(length, options);
  }

  skipBits(length: number, options: ParserOptions = {}): this {
    if (options.assert != null) {
      throw new Error("assert option on skipBits is not allowed.");
    }

    if (typeof length !== "number" || !Number.isInteger(length) || length < 1) {
      throw new Error("skipBits length must be a positive integer.");
    }

    if (length > 32) {
      throw new Error("skipBits length must not exceed 32.");
    }

    return this.setNextParser("bit", "", { ...options, length, skip: true });
  }

  seek(relOffset: ParserOptions["length"], options: ParserOptions = {}): this {
    if (options.assert != null) {
      throw new Error("assert option on seek is not allowed.");
    }

    return this.setNextParser("seek", "", { length: relOffset });
  }

  string(varName: string, options: ParserOptions): this {
    if (!options.zeroTerminated && options.length == null && !options.greedy) {
      throw new Error(
        "One of length, zeroTerminated, or greedy must be defined for string.",
      );
    }

    if ((options.zeroTerminated || options.length != null) && options.greedy) {
      throw new Error(
        "greedy is mutually exclusive with length and zeroTerminated for string.",
      );
    }

    if (options.stripNull && !(options.length != null || options.greedy)) {
      throw new Error(
        "length or greedy must be defined if stripNull is enabled.",
      );
    }

    const encoding = options.encoding || "utf8";
    if (typeof encoding !== "string") {
      throw new Error("Invalid encoding: must be a string");
    }
    let decoder: TextDecoder | undefined;
    if (!BYTE_ENCODINGS.includes(encoding.toLowerCase())) {
      try {
        decoder = new TextDecoder(encoding);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        throw new Error(`Invalid encoding: ${encoding}`, { cause: e });
      }
    }
    options = { ...options, encoding, decoder };

    return this.setNextParser("string", varName, options);
  }

  buffer(varName: string, options: ParserOptions): this {
    if (options.length == null && options.readUntil == null) {
      throw new Error("length or readUntil must be defined for buffer.");
    }

    return this.setNextParser("buffer", varName, options);
  }

  wrapped(varName: string | ParserOptions, options?: ParserOptions): this {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options || options.wrapper == null || options.type == null) {
      throw new Error("Both wrapper and type must be defined for wrapped.");
    }

    if (options.length == null && options.readUntil == null) {
      throw new Error("length or readUntil must be defined for wrapped.");
    }

    if (!(options.type instanceof Parser) && !(varName as string)) {
      throw new Error(
        "type must be a Parser object if the variable name is omitted.",
      );
    }

    return this.setNextParser("wrapper", varName as string, options);
  }

  array(varName: string, options: ParserOptions): this {
    if (
      options.readUntil == null &&
      options.length == null &&
      options.lengthInBytes == null
    ) {
      throw new Error(
        "One of readUntil, length and lengthInBytes must be defined for array.",
      );
    }

    if (options.type == null) {
      throw new Error("type is required for array.");
    }

    options = { ...options, type: this.resolveEndian(options.type) };

    if (
      typeof options.type === "string" &&
      !aliasRegistry.has(options.type) &&
      !(options.type in PRIMITIVE_SIZES)
    ) {
      throw new Error(`Array element type "${options.type}" is unknown.`);
    }

    return this.setNextParser("array", varName, options);
  }

  choice(varName: string | ParserOptions, options?: ParserOptions): this {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options) {
      throw new Error("tag and choices are required for choice.");
    }

    if (options.tag == null) {
      throw new Error("tag is required for choice.");
    }

    if (!options.choices) {
      throw new Error("choices is required for choice.");
    }

    options = {
      ...options,
      choices: Object.fromEntries(
        Object.entries(options.choices).map(([k, v]) => [
          k,
          this.resolveEndian(v),
        ]),
      ),
      defaultChoice: this.resolveEndian(options.defaultChoice),
    };

    for (const keyString in options.choices) {
      const key = parseInt(keyString, 10);
      const value = options.choices[key];

      if (isNaN(key)) {
        throw new Error(`Choice key "${keyString}" is not a number.`);
      }

      if (
        typeof value === "string" &&
        !aliasRegistry.has(value) &&
        !(value in PRIMITIVE_SIZES)
      ) {
        throw new Error(`Choice type "${value}" is unknown.`);
      }

      if (typeof value === "string" && !(varName as string)) {
        throw new Error(
          "Choice type must be a Parser object if the variable name is omitted.",
        );
      }
    }

    if (typeof options.defaultChoice === "string" && !(varName as string)) {
      throw new Error(
        "defaultChoice must be a Parser object if the variable name is omitted.",
      );
    }

    return this.setNextParser("choice", varName as string, options);
  }

  nest(varName: string | ParserOptions, options?: ParserOptions): this {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options || options.type == null) {
      throw new Error("type is required for nest.");
    }

    if (!(options.type instanceof Parser) && !aliasRegistry.has(options.type)) {
      throw new Error("type must be a known parser name or a Parser object.");
    }

    if (!(options.type instanceof Parser) && !(varName as string)) {
      throw new Error(
        "type must be a Parser object if the variable name is omitted.",
      );
    }

    return this.setNextParser("nest", varName as string, options);
  }

  pointer(varName: string, options: ParserOptions): this {
    if (options.offset == null) {
      throw new Error("offset is required for pointer.");
    }

    if (options.type == null) {
      throw new Error("type is required for pointer.");
    }

    options = { ...options, type: this.resolveEndian(options.type) };

    if (
      typeof options.type === "string" &&
      !(options.type in PRIMITIVE_SIZES) &&
      !aliasRegistry.has(options.type)
    ) {
      throw new Error(`Pointer type "${options.type}" is unknown.`);
    }

    return this.setNextParser("pointer", varName, options);
  }

  saveOffset(varName: string, options: ParserOptions = {}): this {
    return this.setNextParser("saveOffset", varName, options);
  }

  endianness(endianness: "little" | "big"): this {
    switch (endianness.toLowerCase()) {
      case "little":
        this.endian = "le";
        break;
      case "big":
        this.endian = "be";
        break;
      default:
        throw new Error('endianness must be one of "little" or "big"');
    }

    return this;
  }

  endianess(endianess: "little" | "big"): this {
    return this.endianness(endianess);
  }

  useContextVars(useContextVariables = true): this {
    this.useContextVariables = useContextVariables;

    return this;
  }

  create(constructorFn: Function): this {
    if (typeof constructorFn !== "function") {
      throw new Error("Constructor must be a Function object.");
    }

    this.constructorFn = constructorFn;

    return this;
  }

  private newObject(ctx: Context): string {
    return this.constructorFn
      ? `new ${ctx.addImport(this.constructorFn)}()`
      : "{}";
  }

  private getContext(importPath: string): Context {
    const ctx = new Context(importPath, this.useContextVariables);

    ctx.pushCode(
      "var dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);",
    );

    if (!this.alias) {
      this.addRawCode(ctx);
    } else {
      this.addAliasedCode(ctx);
      ctx.pushCode(`return ${FUNCTION_PREFIX + this.alias}(0).result;`);
    }

    return ctx;
  }

  getCode(): string {
    const importPath = "imports";
    return this.getContext(importPath).code;
  }

  private addRawCode(ctx: Context) {
    ctx.pushCode("var offset = 0;");
    ctx.pushCode(`var vars = ${this.newObject(ctx)};`);

    ctx.pushCode("vars.$parent = null;");
    ctx.pushCode("vars.$root = vars;");

    this.generate(ctx);
    this.resolveReferences(ctx);

    ctx.pushCode("delete vars.$parent;");
    ctx.pushCode("delete vars.$root;");

    ctx.pushCode("return vars;");
  }

  private addAliasedCode(ctx: Context) {
    ctx.pushCode(`function ${FUNCTION_PREFIX + this.alias}(offset, context) {`);
    ctx.pushCode(`var vars = ${this.newObject(ctx)};`);
    ctx.pushCode(
      "var ctx = Object.assign({$parent: null, $root: vars}, context || {});",
    );
    ctx.pushCode(`vars = Object.assign(vars, ctx);`);

    this.generate(ctx);

    ctx.markResolved(this.alias!);
    this.resolveReferences(ctx);

    ctx.pushCode(
      "Object.keys(ctx).forEach(function (item) { delete vars[item]; });",
    );
    ctx.pushCode("return { offset: offset, result: vars };");
    ctx.pushCode("}");

    return ctx;
  }

  private resolveReferences(ctx: Context) {
    const references = ctx.getUnresolvedReferences();
    ctx.markRequested(references);
    references.forEach((alias) => {
      aliasRegistry.get(alias)?.addAliasedCode(ctx);
    });
  }

  compile() {
    const importPath = "imports";
    const ctx = this.getContext(importPath);
    this.compiled = new Function(
      importPath,
      `return function (buffer) { ${ctx.code} };`,
    )(ctx.imports);
  }

  // Sum consecutive fields without consuming one stack frame per field.
  sizeOf(): number {
    let size = this.fieldSizeOf();
    for (let parser = this.next; parser; parser = parser.next) {
      size += parser.fieldSizeOf();
    }
    return size;
  }

  private fieldSizeOf(): number {
    let size = NaN;

    if (Object.keys(PRIMITIVE_SIZES).indexOf(this.type) >= 0) {
      size = PRIMITIVE_SIZES[this.type as PrimitiveTypes];

      // if this is a fixed length string
    } else if (
      this.type === "string" &&
      typeof this.options.length === "number"
    ) {
      size = this.options.length;

      // if this is a fixed length buffer
    } else if (
      this.type === "buffer" &&
      typeof this.options.length === "number"
    ) {
      size = this.options.length;

      // if this is a fixed length array
    } else if (
      this.type === "array" &&
      typeof this.options.length === "number"
    ) {
      let elementSize = NaN;
      if (typeof this.options.type === "string") {
        elementSize = PRIMITIVE_SIZES[this.options.type as PrimitiveTypes];
      } else if (this.options.type instanceof Parser) {
        elementSize = this.options.type.sizeOf();
      }
      size = this.options.length * elementSize;

      // if this a skip
    } else if (this.type === "seek") {
      size = this.options.length as number;

      // if this is a nested parser
    } else if (this.type === "nest") {
      size = (this.options.type as Parser).sizeOf();
    } else if (!this.type) {
      size = 0;
    }

    return size;
  }

  // Follow the parser chain till the root and start parsing from there
  parse(buffer: Buffer | Uint8Array) {
    if (!this.compiled) {
      this.compile();
    }

    return this.compiled!(buffer);
  }

  private setNextParser(
    type: Types,
    varName: string,
    options: ParserOptions,
  ): this {
    const parser = new Parser();

    parser.type = type;
    parser.varName = this.sanitizeFieldName(varName);
    parser.options = options;
    parser.endian = this.endian;

    if (this.head) {
      this.head.next = parser;
    } else {
      this.next = parser;
    }
    this.head = parser;

    return this;
  }

  // Generate consecutive fields without consuming one stack frame per field.
  private generate(ctx: Context) {
    this.generateField(ctx);
    for (let parser = this.next; parser; parser = parser.next) {
      parser.generateField(ctx);
    }
    return ctx;
  }

  private generateField(ctx: Context) {
    if (this.type) {
      switch (this.type) {
        case "uint8":
        case "uint16le":
        case "uint16be":
        case "uint24le":
        case "uint24be":
        case "uint32le":
        case "uint32be":
        case "int8":
        case "int16le":
        case "int16be":
        case "int24le":
        case "int24be":
        case "uint48le":
        case "uint48be":
        case "int48le":
        case "int48be":
        case "int32le":
        case "int32be":
        case "int64be":
        case "int64le":
        case "uint64be":
        case "uint64le":
        case "floatle":
        case "floatbe":
        case "doublele":
        case "doublebe":
          this.primitiveGenerateN(this.type, ctx);
          break;
        case "bit":
          this.generateBit(ctx);
          break;
        case "string":
          this.generateString(ctx);
          break;
        case "buffer":
          this.generateBuffer(ctx);
          break;
        case "seek":
          this.generateSeek(ctx);
          break;
        case "nest":
          this.generateNest(ctx);
          break;
        case "array":
          this.generateArray(ctx);
          break;
        case "choice":
          this.generateChoice(ctx);
          break;
        case "pointer":
          this.generatePointer(ctx);
          break;
        case "saveOffset":
          this.generateSaveOffset(ctx);
          break;
        case "wrapper":
          this.generateWrapper(ctx);
          break;
      }
      if (this.type !== "bit") this.generateAssert(ctx);
    }

    const varName = ctx.generateVariable(this.varName);
    if (this.options.formatter && this.type !== "bit") {
      this.generateFormatter(ctx, varName, this.options.formatter);
    }
  }

  private generateAssert(
    ctx: Context,
    varName = ctx.generateVariable(this.varName),
  ) {
    if (this.options.assert == null) {
      return;
    }

    switch (typeof this.options.assert) {
      case "function":
        {
          const func = ctx.addImport(this.options.assert);
          ctx.pushCode(`if (!${func}.call(vars, ${varName})) {`);
        }
        break;
      case "number":
        ctx.pushCode(`if (${this.options.assert} !== ${varName}) {`);
        break;
      case "string":
        ctx.pushCode(
          `if (${JSON.stringify(this.options.assert)} !== ${varName}) {`,
        );
        break;
      default:
        throw new Error(
          "assert option must be a string, number or a function.",
        );
    }
    ctx.generateError(
      `"Assertion error: ${varName} is " + ${JSON.stringify(
        this.options.assert.toString(),
      )}`,
    );
    ctx.pushCode("}");
  }

  private nextNotBit() {
    // Used to test if next type is a bitN or not
    if (this.next) {
      if (this.next.type === "nest") {
        // For now consider a nest as a bit
        if (this.next.options.type instanceof Parser) {
          // Something in the nest
          if (this.next.options.type.next) {
            return this.next.options.type.next.type !== "bit";
          }
          return false;
        } else {
          // Nest is empty. For now assume this means bit is not next. However what if something comes after the nest?
          return true;
        }
      } else {
        return this.next.type !== "bit";
      }
    } else {
      // Nothing else so next can't be bits
      return true;
    }
  }

  private generateBit(ctx: Context) {
    // Retain only this field's metadata, not the rest of the parser chain.
    const parser = new Parser();
    parser.options = this.options;
    parser.generateAssert = this.generateAssert.bind(this);
    // Bit fields may be flushed inside a nested scope, so bind the formatter's
    // `this` to the scope the field was declared in.
    const thisVar = ctx.generateVariable();
    parser.generateFormatter = (c: Context, v: string, f: Function) =>
      this.generateFormatter(c, v, f, thisVar);
    parser.varName = ctx.generateVariable(this.varName);
    ctx.bitFields.push(parser);

    if (!this.next || this.nextNotBit()) {
      const val = ctx.generateTmpVariable();

      ctx.pushCode(`var ${val} = 0;`);

      const getMaxBits = (from = 0) => {
        let sum = 0;
        for (let i = from; i < ctx.bitFields.length; i++) {
          const length = ctx.bitFields[i].options.length as number;
          if (sum + length > 32) break;
          sum += length;
        }
        return sum;
      };

      const getBytes = (sum: number) => {
        if (sum <= 8) {
          ctx.pushCode(`${val} = dataView.getUint8(offset);`);
          sum = 8;
        } else if (sum <= 16) {
          ctx.pushCode(`${val} = dataView.getUint16(offset);`);
          sum = 16;
        } else if (sum <= 24) {
          ctx.pushCode(
            `${val} = (dataView.getUint16(offset) << 8) | dataView.getUint8(offset + 2);`,
          );
          sum = 24;
        } else {
          ctx.pushCode(`${val} = dataView.getUint32(offset);`);
          sum = 32;
        }
        ctx.pushCode(`offset += ${sum / 8};`);
        return sum;
      };

      let bitOffset = 0;
      const isBigEndian = this.endian === "be";

      let sum = 0;
      let rem = 0;

      ctx.bitFields.forEach((field, i) => {
        let length = field.options.length as number;
        if (length > rem) {
          if (rem > 0) {
            if (!field.options.skip) {
              const mask = -1 >>> (32 - rem);
              ctx.pushCode(
                `${field.varName} = (${val} & 0x${mask.toString(16)}) << ${
                  length - rem
                };`,
              );
            }
            length -= rem;
          }
          bitOffset = 0;
          rem = sum = getBytes(getMaxBits(i) - rem);
        }

        if (!field.options.skip) {
          const offset = isBigEndian ? sum - bitOffset - length : bitOffset;
          const mask = -1 >>> (32 - length);

          ctx.pushCode(
            `${field.varName} ${
              length < (field.options.length as number) ? "|=" : "="
            } ${val} >> ${offset} & 0x${mask.toString(16)};`,
          );

          // Ensure value is unsigned
          if ((field.options.length as number) === 32) {
            ctx.pushCode(`${field.varName} >>>= 0`);
          }

          if (field.options.assert != null) {
            // Bit fields may be flushed inside a nested scope, so use the
            // variable name resolved when the field was queued.
            field.generateAssert(ctx, field.varName);
          }

          if (field.options.formatter) {
            field.generateFormatter(
              ctx,
              field.varName,
              field.options.formatter,
            );
          }
        }

        bitOffset += length;
        rem -= length;
      });

      ctx.bitFields = [];
    }
  }

  private generateSeek(ctx: Context) {
    const length = ctx.generateOption(this.options.length!);
    ctx.pushCode(`offset += ${length};`);
  }

  private generateString(ctx: Context) {
    const name = ctx.generateVariable(this.varName);
    const start = ctx.generateTmpVariable();
    const decoder = this.options.decoder;
    const latin1 = (bytes: string) =>
      `${ctx.addImport(bytesToLatin1)}(${bytes})`;
    const decode = (bytes: string) => {
      if (decoder) return `${ctx.addImport(decoder)}.decode(${bytes})`;
      switch (this.options.encoding!.toLowerCase()) {
        case "hex":
          return `Array.from(${bytes}, b => b.toString(16).padStart(2, "0")).join('')`;
        case "binary":
          return latin1(bytes);
        case "base64":
          return `btoa(${latin1(bytes)})`;
        default:
          // base64url
          return `btoa(${latin1(
            bytes,
          )}).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')`;
      }
    };

    if (this.options.length != null && this.options.zeroTerminated) {
      const len = ctx.generateTmpVariable();
      ctx.pushCode(`var ${len} = ${ctx.generateOption(this.options.length)};`);
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode(
        `while(offset - ${start} < ${len} && dataView.getUint8(offset) !== 0) offset++;`,
      );
      ctx.pushCode(`${name} = ${decode(`buffer.subarray(${start}, offset)`)};`);
      ctx.pushCode(`if (offset - ${start} < ${len}) offset++;`);
    } else if (this.options.length != null) {
      const len = ctx.generateOption(this.options.length);
      ctx.pushCode(
        `${name} = ${decode(`buffer.subarray(offset, offset + ${len})`)};`,
      );
      ctx.pushCode(`offset += ${len};`);
    } else if (this.options.zeroTerminated) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode("while(dataView.getUint8(offset++) !== 0);");
      ctx.pushCode(
        `${name} = ${decode(`buffer.subarray(${start}, offset - 1)`)};`,
      );
    } else if (this.options.greedy) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode("offset = buffer.length;");
      ctx.pushCode(`${name} = ${decode(`buffer.subarray(${start}, offset)`)};`);
    }
    if (this.options.stripNull) {
      ctx.pushCode(`${name} = ${name}.replace(/\\x00+$/g, '')`);
    }
  }

  private generateBuffer(ctx: Context) {
    const varName = ctx.generateVariable(this.varName);

    if (typeof this.options.readUntil === "function") {
      const pred = this.options.readUntil;
      const start = ctx.generateTmpVariable();
      const cur = ctx.generateTmpVariable();

      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode(`var ${cur} = 0;`);
      ctx.pushCode(`while (offset < buffer.length) {`);
      ctx.pushCode(`${cur} = dataView.getUint8(offset);`);
      const func = ctx.addImport(pred);
      ctx.pushCode(
        `if (${func}.call(${ctx.generateVariable()}, ${cur}, buffer.subarray(offset))) break;`,
      );
      ctx.pushCode(`offset += 1;`);
      ctx.pushCode(`}`);
      ctx.pushCode(`${varName} = buffer.subarray(${start}, offset);`);
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode(`${varName} = buffer.subarray(offset);`);
      ctx.pushCode("offset = buffer.length;");
    } else {
      const len = ctx.generateOption(this.options.length!);

      ctx.pushCode(`${varName} = buffer.subarray(offset, offset + ${len});`);
      ctx.pushCode(`offset += ${len};`);
    }

    if (this.options.clone) {
      ctx.pushCode(`${varName} = buffer.constructor.from(${varName});`);
    }
  }

  private generateArray(ctx: Context) {
    const length = ctx.generateOption(this.options.length!);
    const lengthInBytes =
      this.options.lengthInBytes == null
        ? undefined
        : ctx.generateOption(this.options.lengthInBytes);
    const type = this.options.type;
    const counter = ctx.generateTmpVariable();
    const lhs = ctx.generateVariable(this.varName);
    const item = ctx.generateTmpVariable();
    const key = this.options.key;
    const isHash = typeof key === "string";
    if (isHash) sanitizeReference(key);
    const checkProgress =
      this.options.readUntil === "eof" || lengthInBytes !== undefined;
    const start = checkProgress ? ctx.generateTmpVariable() : "";

    if (isHash) {
      ctx.pushCode(`${lhs} = {};`);
    } else {
      ctx.pushCode(`${lhs} = [];`);
    }
    if (typeof this.options.readUntil === "function") {
      ctx.pushCode("do {");
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode(
        `for (var ${counter} = 0; offset < buffer.length; ${counter}++) {`,
      );
    } else if (lengthInBytes !== undefined) {
      ctx.pushCode(
        `for (var ${counter} = offset + ${lengthInBytes}; offset < ${counter}; ) {`,
      );
    } else {
      ctx.pushCode(
        `for (var ${counter} = ${length}; ${counter} > 0; ${counter}--) {`,
      );
    }
    if (checkProgress) {
      ctx.pushCode(`var ${start} = offset;`);
    }

    if (typeof type === "string") {
      if (!aliasRegistry.get(type)) {
        ctx.pushCode(`var ${item} = ${readPrimitive(type as PrimitiveTypes)};`);
        ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type as PrimitiveTypes]};`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset, {`);
        if (ctx.useContextVariables) {
          const parentVar = ctx.generateVariable();
          ctx.pushCode(`$parent: ${parentVar},`);
          ctx.pushCode(`$root: ${parentVar}.$root,`);
          if (this.options.readUntil == null && lengthInBytes === undefined) {
            ctx.pushCode(`$index: ${length} - ${counter},`);
          }
        }
        ctx.pushCode(`});`);
        ctx.pushCode(
          `var ${item} = ${tempVar}.result; offset = ${tempVar}.offset;`,
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser) {
      ctx.pushCode(`var ${item} = ${type.newObject(ctx)};`);
      const parentVar = ctx.generateVariable();
      ctx.pushScope(item);

      if (ctx.useContextVariables) {
        ctx.pushCode(`${item}.$parent = ${parentVar};`);
        ctx.pushCode(`${item}.$root = ${parentVar}.$root;`);
        if (this.options.readUntil == null && lengthInBytes === undefined) {
          ctx.pushCode(`${item}.$index = ${length} - ${counter};`);
        }
      }

      type.generate(ctx);

      if (ctx.useContextVariables) {
        ctx.pushCode(`delete ${item}.$parent;`);
        ctx.pushCode(`delete ${item}.$root;`);
        ctx.pushCode(`delete ${item}.$index;`);
      }
      ctx.popScope();
    }

    if (isHash) {
      // Reject "__proto__" since assigning it would replace the prototype
      const hashKey = ctx.generateTmpVariable();
      ctx.pushCode(`var ${hashKey} = ${item}.${key};`);
      ctx.pushCode(`if (${hashKey} === "__proto__") {`);
      ctx.generateError(`"Invalid key: __proto__"`);
      ctx.pushCode("}");
      ctx.pushCode(`${lhs}[${hashKey}] = ${item};`);
    } else {
      ctx.pushCode(`${lhs}.push(${item});`);
    }

    if (checkProgress) {
      ctx.pushCode(
        `if (offset <= ${start}) throw new Error("Array element did not consume any bytes");`,
      );
    }

    ctx.pushCode("}");

    if (typeof this.options.readUntil === "function") {
      const pred = this.options.readUntil;
      const func = ctx.addImport(pred);
      ctx.pushCode(
        `while (!${func}.call(${ctx.generateVariable()}, ${item}, buffer.subarray(offset)));`,
      );
    }
  }

  private generateChoiceCase(
    ctx: Context,
    varName: string,
    type: string | Parser,
  ) {
    if (typeof type === "string") {
      const fieldVar = ctx.generateVariable(this.varName);
      if (!aliasRegistry.has(type)) {
        ctx.pushCode(`${fieldVar} = ${readPrimitive(type as PrimitiveTypes)};`);
        ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type as PrimitiveTypes]}`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset, {`);
        if (ctx.useContextVariables) {
          ctx.pushCode(`$parent: ${fieldVar}.$parent,`);
          ctx.pushCode(`$root: ${fieldVar}.$root,`);
        }
        ctx.pushCode(`});`);
        ctx.pushCode(
          `${fieldVar} = ${tempVar}.result; offset = ${tempVar}.offset;`,
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser) {
      if (varName && type.constructorFn) {
        const fieldVar = ctx.generateVariable(varName);
        ctx.pushCode(
          `${fieldVar} = Object.assign(${type.newObject(ctx)}, ${fieldVar});`,
        );
      }
      ctx.pushPath(varName);
      type.generate(ctx);
      ctx.popPath(varName);
    }
  }

  private generateChoice(ctx: Context) {
    const tag = ctx.generateOption(this.options.tag!);
    const nestVar = ctx.generateVariable(this.varName);

    if (this.varName) {
      ctx.pushCode(`${nestVar} = {};`);

      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`${nestVar}.$parent = ${parentVar};`);
        ctx.pushCode(`${nestVar}.$root = ${parentVar}.$root;`);
      }
    }
    ctx.pushCode(`switch(${tag}) {`);
    for (const tagString in this.options.choices) {
      const key = parseInt(tagString, 10);
      const type = this.options.choices[key];

      ctx.pushCode(`case ${key}:`);
      this.generateChoiceCase(ctx, this.varName, type);
      ctx.pushCode("break;");
    }
    ctx.pushCode("default:");
    if (this.options.defaultChoice != null) {
      this.generateChoiceCase(ctx, this.varName, this.options.defaultChoice);
    } else {
      ctx.generateError(`"Met undefined tag value " + ${tag} + " at choice"`);
    }
    ctx.pushCode("}");

    if (this.varName && ctx.useContextVariables) {
      ctx.pushCode(`delete ${nestVar}.$parent;`);
      ctx.pushCode(`delete ${nestVar}.$root;`);
    }
  }

  private generateNest(ctx: Context) {
    const nestVar = ctx.generateVariable(this.varName);

    if (this.options.type instanceof Parser) {
      if (this.varName) {
        ctx.pushCode(`${nestVar} = ${this.options.type.newObject(ctx)};`);

        if (ctx.useContextVariables) {
          const parentVar = ctx.generateVariable();
          ctx.pushCode(`${nestVar}.$parent = ${parentVar};`);
          ctx.pushCode(`${nestVar}.$root = ${parentVar}.$root;`);
        }
      }

      ctx.pushPath(this.varName);
      this.options.type.generate(ctx);
      ctx.popPath(this.varName);

      if (this.varName && ctx.useContextVariables) {
        ctx.pushCode(`delete ${nestVar}.$parent;`);
        ctx.pushCode(`delete ${nestVar}.$root;`);
      }
    } else if (aliasRegistry.has(this.options.type!)) {
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(offset, {`,
      );
      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`$parent: ${parentVar},`);
        ctx.pushCode(`$root: ${parentVar}.$root,`);
      }
      ctx.pushCode(`});`);
      ctx.pushCode(
        `${nestVar} = ${tempVar}.result; offset = ${tempVar}.offset;`,
      );
      if (this.options.type !== this.alias) {
        ctx.addReference(this.options.type!);
      }
    }
  }

  private generateWrapper(ctx: Context) {
    const wrapperVar = ctx.generateVariable(this.varName);
    const wrappedBuf = ctx.generateTmpVariable();
    if (typeof this.options.readUntil === "function") {
      const pred = this.options.readUntil;
      const start = ctx.generateTmpVariable();
      const cur = ctx.generateTmpVariable();

      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode(`var ${cur} = 0;`);
      ctx.pushCode(`while (offset < buffer.length) {`);
      ctx.pushCode(`${cur} = dataView.getUint8(offset);`);
      const func = ctx.addImport(pred);
      ctx.pushCode(
        `if (${func}.call(${ctx.generateVariable()}, ${cur}, buffer.subarray(offset))) break;`,
      );
      ctx.pushCode(`offset += 1;`);
      ctx.pushCode(`}`);
      ctx.pushCode(`${wrappedBuf} = buffer.subarray(${start}, offset);`);
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode(`${wrappedBuf} = buffer.subarray(offset);`);
    } else {
      const len = ctx.generateOption(this.options.length!);
      ctx.pushCode(`${wrappedBuf} = buffer.subarray(offset, offset + ${len});`);
      ctx.pushCode(`offset += ${len};`);
    }

    if (this.options.clone) {
      ctx.pushCode(`${wrappedBuf} = buffer.constructor.from(${wrappedBuf});`);
    }

    const tempBuf = ctx.generateTmpVariable();
    const tempOff = ctx.generateTmpVariable();
    const tempView = ctx.generateTmpVariable();
    const func = ctx.addImport(this.options.wrapper);
    ctx.pushCode(
      `${wrappedBuf} = ${func}.call(${ctx.generateVariable()}, ${wrappedBuf}).subarray(0);`,
    );
    ctx.pushCode(`var ${tempBuf} = buffer;`);
    ctx.pushCode(`var ${tempOff} = offset;`);
    ctx.pushCode(`var ${tempView} = dataView;`);
    ctx.pushCode(`buffer = ${wrappedBuf};`);
    ctx.pushCode(`offset = 0;`);
    ctx.pushCode(
      `dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);`,
    );
    if (this.options.type instanceof Parser) {
      if (this.varName) {
        ctx.pushCode(`${wrapperVar} = ${this.options.type.newObject(ctx)};`);
      }
      ctx.pushPath(this.varName);
      this.options.type.generate(ctx);
      ctx.popPath(this.varName);
    } else if (aliasRegistry.has(this.options.type!)) {
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(0);`,
      );
      ctx.pushCode(`${wrapperVar} = ${tempVar}.result;`);
      if (this.options.type !== this.alias) {
        ctx.addReference(this.options.type!);
      }
    }
    ctx.pushCode(`buffer = ${tempBuf};`);
    ctx.pushCode(`dataView = ${tempView};`);
    ctx.pushCode(`offset = ${tempOff};`);
  }

  private generateFormatter(
    ctx: Context,
    varName: string,
    formatter: Function,
    thisVar = ctx.generateVariable(),
  ) {
    if (typeof formatter === "function") {
      const func = ctx.addImport(formatter);
      ctx.pushCode(`${varName} = ${func}.call(${thisVar}, ${varName});`);
    }
  }

  private generatePointer(ctx: Context) {
    const type = this.options.type;
    const offset = ctx.generateOption(this.options.offset!);
    const tempVar = ctx.generateTmpVariable();
    const nestVar = ctx.generateVariable(this.varName);

    // Save current offset
    ctx.pushCode(`var ${tempVar} = offset;`);

    // Move offset
    ctx.pushCode(`offset = ${offset};`);

    if (this.options.type instanceof Parser) {
      ctx.pushCode(`${nestVar} = ${this.options.type.newObject(ctx)};`);

      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`${nestVar}.$parent = ${parentVar};`);
        ctx.pushCode(`${nestVar}.$root = ${parentVar}.$root;`);
      }

      ctx.pushPath(this.varName);
      this.options.type.generate(ctx);
      ctx.popPath(this.varName);

      if (ctx.useContextVariables) {
        ctx.pushCode(`delete ${nestVar}.$parent;`);
        ctx.pushCode(`delete ${nestVar}.$root;`);
      }
    } else if (aliasRegistry.has(this.options.type!)) {
      const resultVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${resultVar} = ${FUNCTION_PREFIX + this.options.type}(offset, {`,
      );
      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`$parent: ${parentVar},`);
        ctx.pushCode(`$root: ${parentVar}.$root,`);
      }
      ctx.pushCode(`});`);
      ctx.pushCode(
        `${nestVar} = ${resultVar}.result; offset = ${resultVar}.offset;`,
      );
      if (this.options.type !== this.alias) {
        ctx.addReference(this.options.type!);
      }
    } else if (Object.keys(PRIMITIVE_SIZES).indexOf(this.options.type!) >= 0) {
      ctx.pushCode(`${nestVar} = ${readPrimitive(type as PrimitiveTypes)};`);
      ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type as PrimitiveTypes]};`);
    }

    // Restore offset
    ctx.pushCode(`offset = ${tempVar};`);
  }

  private generateSaveOffset(ctx: Context) {
    const varName = ctx.generateVariable(this.varName);
    ctx.pushCode(`${varName} = offset`);
  }
}
