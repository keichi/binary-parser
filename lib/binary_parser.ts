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
        return this.generateVariable(val);
      case "function":
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
    if (!id) {
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

const aliasRegistry = new Map<string, Parser<unknown>>();
const FUNCTION_PREFIX = "___parser_";

interface ParserOptions<O = {}, T = unknown, F = T, C = string | Parser<T>> {
  length?: number | string | ((this: O, item: any) => number);
  assert?: number | string | ((this: O, item: T) => boolean);
  lengthInBytes?: number | string | ((this: O, item: any) => number);
  type?: string | Parser<T>;
  formatter?: (this: O, item: T) => F;
  encoding?: string;
  readUntil?: "eof" | ((this: O, item: number, buffer: Buffer) => boolean);
  greedy?: boolean;
  choices?: Record<number, C>;
  defaultChoice?: string | Parser<unknown>;
  zeroTerminated?: boolean;
  clone?: boolean;
  stripNull?: boolean;
  key?: string;
  tag?: string | ((this: O, item: any) => number);
  offset?: number | string | ((this: O, item: any) => number);
  wrapper?: (buffer: Buffer) => Buffer;
}

interface ArrayParserOptions<O, T, F = T[]>
  extends Omit<ParserOptions<O, T[], F>, "type"> {
  type?: string | Parser<T>;
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

export type PrimitiveTypes =
  | "uint8"
  | "uint16le"
  | "uint16be"
  | "uint32le"
  | "uint32be"
  | "uint64le"
  | "uint64be"
  | "int8"
  | "int16le"
  | "int16be"
  | "int32le"
  | "int32be"
  | "int64le"
  | "int64be"
  | "floatle"
  | "floatbe"
  | "doublele"
  | "doublebe";

type PrimitiveTypesWithoutEndian =
  | "uint8"
  | "uint16"
  | "uint32"
  | "int8"
  | "int16"
  | "int32"
  | "int64"
  | "uint64";

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
  uint32le: 4,
  uint32be: 4,
  int8: 1,
  int16le: 2,
  int16be: 2,
  int32le: 4,
  int32be: 4,
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
  uint32le: "Uint32",
  uint32be: "Uint32",
  int8: "Int8",
  int16le: "Int16",
  int16be: "Int16",
  int32le: "Int32",
  int32be: "Int32",
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
  uint32le: true,
  uint32be: false,
  int8: false,
  int16le: true,
  int16be: false,
  int32le: true,
  int32be: false,
  int64be: false,
  int64le: true,
  uint64be: false,
  uint64le: true,
  floatle: true,
  floatbe: false,
  doublele: true,
  doublebe: false,
};

type Next<O, N, T> = N extends string
  ? Parser<O & { [name in N]: T }>
  : Parser<O & T>;

type ChoiceType<P> = P extends Parser<infer O>
  ? O
  : P extends PrimitiveTypes
  ? number
  : any;

export class Parser<O = {}> {
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

  constructor() {}

  static start() {
    return new Parser();
  }

  private primitiveGenerateN(type: PrimitiveTypes, ctx: Context) {
    const typeName = PRIMITIVE_NAMES[type];
    const littleEndian = PRIMITIVE_LITTLE_ENDIANS[type];
    ctx.pushCode(
      `${ctx.generateVariable(
        this.varName
      )} = dataView.get${typeName}(offset, ${littleEndian});`
    );
    ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type]};`);
  }

  private primitiveN<N extends string, F = number>(
    type: PrimitiveTypes,
    varName: N | undefined,
    options: ParserOptions<O, number, F>
  ): Next<O, N, F> {
    return this.setNextParser(type as Types, varName, options);
  }

  private useThisEndian(type: PrimitiveTypesWithoutEndian): PrimitiveTypes {
    return (type + this.endian.toLowerCase()) as PrimitiveTypes;
  }

  uint8(): Next<O, unknown, number>;
  uint8<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  uint8<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("uint8", varName, options);
  }

  uint16(): Next<O, unknown, number>;
  uint16<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  uint16<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN(this.useThisEndian("uint16"), varName, options);
  }

  uint16le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("uint16le", varName, options);
  }

  uint16be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("uint16be", varName, options);
  }

  uint32(): Next<O, unknown, number>;
  uint32<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  uint32<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN(this.useThisEndian("uint32"), varName, options);
  }

  uint32le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("uint32le", varName, options);
  }

  uint32be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("uint32be", varName, options);
  }

  int8(): Next<O, unknown, number>;
  int8<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  int8<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("int8", varName, options);
  }

  int16(): Next<O, unknown, number>;
  int16<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  int16<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN(this.useThisEndian("int16"), varName, options);
  }

  int16le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("int16le", varName, options);
  }

  int16be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("int16be", varName, options);
  }

  int32(): Next<O, unknown, number>;
  int32<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  int32<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN(this.useThisEndian("int32"), varName, options);
  }

  int32le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("int32le", varName, options);
  }

  int32be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("int32be", varName, options);
  }

  private bigIntVersionCheck() {
    if (!DataView.prototype.getBigInt64)
      throw new Error("BigInt64 is unsupported on this runtime");
  }

  int64(): Next<O, unknown, number>;
  int64<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  int64<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN(this.useThisEndian("int64"), varName, options);
  }

  int64be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN("int64be", varName, options);
  }

  int64le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN("int64le", varName, options);
  }

  uint64(): Next<O, unknown, number>;
  uint64<N extends string, F = number>(
    varName: N,
    options?: ParserOptions<O, number, F>
  ): Next<O, N, F>;
  uint64<N extends string, F = number>(
    varName?: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN(this.useThisEndian("uint64"), varName, options);
  }

  uint64be<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN("uint64be", varName, options);
  }

  uint64le<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    this.bigIntVersionCheck();
    return this.primitiveN("uint64le", varName, options);
  }

  floatle<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("floatle", varName, options);
  }

  floatbe<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("floatbe", varName, options);
  }

  doublele<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("doublele", varName, options);
  }

  doublebe<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.primitiveN("doublebe", varName, options);
  }

  private bitN<N extends string, F = number>(
    size: BitSizes,
    varName: N,
    options: ParserOptions<O, number, F>
  ): Next<O, N, F> {
    options.length = size;
    return this.setNextParser("bit", varName, options);
  }

  bit1<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(1, varName, options);
  }

  bit2<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(2, varName, options);
  }

  bit3<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(3, varName, options);
  }

  bit4<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(4, varName, options);
  }

  bit5<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(5, varName, options);
  }

  bit6<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(6, varName, options);
  }

  bit7<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(7, varName, options);
  }

  bit8<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(8, varName, options);
  }

  bit9<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(9, varName, options);
  }

  bit10<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(10, varName, options);
  }

  bit11<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(11, varName, options);
  }

  bit12<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(12, varName, options);
  }

  bit13<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(13, varName, options);
  }

  bit14<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(14, varName, options);
  }

  bit15<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(15, varName, options);
  }

  bit16<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(16, varName, options);
  }

  bit17<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(17, varName, options);
  }

  bit18<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(18, varName, options);
  }

  bit19<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(19, varName, options);
  }

  bit20<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(20, varName, options);
  }

  bit21<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(21, varName, options);
  }

  bit22<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(22, varName, options);
  }

  bit23<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(23, varName, options);
  }

  bit24<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(24, varName, options);
  }

  bit25<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(25, varName, options);
  }

  bit26<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(26, varName, options);
  }

  bit27<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(27, varName, options);
  }

  bit28<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(28, varName, options);
  }

  bit29<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(29, varName, options);
  }

  bit30<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(30, varName, options);
  }

  bit31<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(31, varName, options);
  }

  bit32<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
    return this.bitN(32, varName, options);
  }

  namely(alias: string): this {
    aliasRegistry.set(alias, this);
    this.alias = alias;
    return this;
  }

  skip(length: ParserOptions["length"], options: ParserOptions = {}): this {
    return this.seek(length, options);
  }

  seek(relOffset: ParserOptions["length"], options: ParserOptions = {}): this {
    if (options.assert) {
      throw new Error("assert option on seek is not allowed.");
    }

    return this.setNextParser("seek", "", {
      length: relOffset,
    } as ParserOptions<O>) as unknown as this;
  }

  string<N extends string, F = string>(
    varName: N,
    options: ParserOptions<O, string, F>
  ): Next<O, N, F> {
    if (!options.zeroTerminated && !options.length && !options.greedy) {
      throw new Error(
        "One of length, zeroTerminated, or greedy must be defined for string."
      );
    }

    if ((options.zeroTerminated || options.length) && options.greedy) {
      throw new Error(
        "greedy is mutually exclusive with length and zeroTerminated for string."
      );
    }

    if (options.stripNull && !(options.length || options.greedy)) {
      throw new Error(
        "length or greedy must be defined if stripNull is enabled."
      );
    }

    options.encoding = options.encoding || "utf8";

    return this.setNextParser("string", varName, options);
  }

  buffer<N extends string, F = Buffer>(
    varName: N,
    options: ParserOptions<O, Buffer, F>
  ): Next<O, N, F> {
    if (!options.length && !options.readUntil) {
      throw new Error("length or readUntil must be defined for buffer.");
    }

    return this.setNextParser("buffer", varName, options);
  }

  wrapped<T, F = T>(options: ParserOptions<O, T, F>): Next<O, unknown, F>;
  wrapped<N extends string, T, F = T>(
    varName: N,
    options: ParserOptions<O, T, F>
  ): Next<O, N, F>;
  wrapped<N extends string, T, F = T>(
    varName: N | ParserOptions<O, T, F>,
    options?: ParserOptions<O, T, F>
  ): Next<O, N, F> {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options || !options.wrapper || !options.type) {
      throw new Error("Both wrapper and type must be defined for wrapped.");
    }

    if (!options.length && !options.readUntil) {
      throw new Error("length or readUntil must be defined for wrapped.");
    }

    return this.setNextParser("wrapper", varName as N, options);
  }

  array<N extends string, F = number[]>(
    varName: N,
    options: Omit<ArrayParserOptions<O, number, F>, "type"> & {
      type: PrimitiveTypes;
    }
  ): Next<O, N, F>;
  array<N extends string, T, F = T[]>(
    varName: N,
    options: ArrayParserOptions<O, T, F>
  ): Next<O, N, F>;
  array<N extends string, T, F = T[]>(
    varName: N,
    options: ArrayParserOptions<O, T, F>
  ): Next<O, N, F> {
    if (!options.readUntil && !options.length && !options.lengthInBytes) {
      throw new Error(
        "One of readUntil, length and lengthInBytes must be defined for array."
      );
    }

    if (!options.type) {
      throw new Error("type is required for array.");
    }

    if (
      typeof options.type === "string" &&
      !aliasRegistry.has(options.type) &&
      !(options.type in PRIMITIVE_SIZES)
    ) {
      throw new Error(`Array element type "${options.type}" is unkown.`);
    }

    return this.setNextParser(
      "array",
      varName,
      options as ParserOptions<O, T, F>
    );
  }

  choice<C extends string | Parser<ChoiceType<C>>, F = ChoiceType<C>>(
    options: ParserOptions<O, ChoiceType<C>, F, C>
  ): Next<O, unknown, F>;
  choice<
    N extends string,
    C extends string | Parser<ChoiceType<C>>,
    F = ChoiceType<C>
  >(varName: N, options: ParserOptions<O, ChoiceType<C>, F, C>): Next<O, N, F>;
  choice<
    N extends string,
    C extends string | Parser<ChoiceType<C>>,
    F = ChoiceType<C>
  >(
    varName: N | ParserOptions<O, ChoiceType<C>, F, C>,
    options?: ParserOptions<O, ChoiceType<C>, F, C>
  ): Next<O, N, F> {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options) {
      throw new Error("tag and choices are are required for choice.");
    }

    if (!options.tag) {
      throw new Error("tag is requird for choice.");
    }

    if (!options.choices) {
      throw new Error("choices is required for choice.");
    }

    for (const keyString in options.choices) {
      const key = parseInt(keyString, 10);
      const value = options.choices[key];

      if (isNaN(key)) {
        throw new Error(`Choice key "${keyString}" is not a number.`);
      }

      if (
        typeof value === "string" &&
        !aliasRegistry.has(value) &&
        !((value as string) in PRIMITIVE_SIZES)
      ) {
        throw new Error(`Choice type "${value}" is unkown.`);
      }
    }

    return this.setNextParser("choice", varName as N, options);
  }

  nest<T, F = T>(options: ParserOptions<O, T, F>): Next<O, unknown, F>;
  nest<N extends string, T, F = T>(
    varName: N,
    options: ParserOptions<O, T, F>
  ): Next<O, N, F>;
  nest<N extends string, T, F = T>(
    varName: N | ParserOptions<O, T, F>,
    options?: ParserOptions<O, T, F>
  ): Next<O, N, F> {
    if (typeof options !== "object" && typeof varName === "object") {
      options = varName;
      varName = "";
    }

    if (!options || !options.type) {
      throw new Error("type is required for nest.");
    }

    if (!(options.type instanceof Parser) && !aliasRegistry.has(options.type)) {
      throw new Error("type must be a known parser name or a Parser object.");
    }

    if (!(options.type instanceof Parser) && !varName) {
      throw new Error(
        "type must be a Parser object if the variable name is omitted."
      );
    }

    return this.setNextParser("nest", varName as N, options);
  }

  pointer<N extends string, T, F = T>(
    varName: N,
    options: ParserOptions<O, T, F>
  ): Next<O, N, F> {
    if (!options.offset) {
      throw new Error("offset is required for pointer.");
    }

    if (!options.type) {
      throw new Error("type is required for pointer.");
    }

    if (
      typeof options.type === "string" &&
      !(options.type in PRIMITIVE_SIZES) &&
      !aliasRegistry.has(options.type)
    ) {
      throw new Error(`Pointer type "${options.type}" is unkown.`);
    }

    return this.setNextParser("pointer", varName, options);
  }

  saveOffset<N extends string, F = number>(
    varName: N,
    options: ParserOptions<O, number, F> = {}
  ): Next<O, N, F> {
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
    if (!(constructorFn instanceof Function)) {
      throw new Error("Constructor must be a Function object.");
    }

    this.constructorFn = constructorFn;

    return this;
  }

  private getContext(importPath: string): Context {
    const ctx = new Context(importPath, this.useContextVariables);

    ctx.pushCode(
      "var dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);"
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
    ctx.pushCode(
      `var vars = ${this.constructorFn ? "new constructorFn()" : "{}"};`
    );

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
    ctx.pushCode(
      `var vars = ${this.constructorFn ? "new constructorFn()" : "{}"};`
    );
    ctx.pushCode(
      "var ctx = Object.assign({$parent: null, $root: vars}, context || {});"
    );
    ctx.pushCode(`vars = Object.assign(vars, ctx);`);

    this.generate(ctx);

    ctx.markResolved(this.alias!);
    this.resolveReferences(ctx);

    ctx.pushCode(
      "Object.keys(ctx).forEach(function (item) { delete vars[item]; });"
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
      "TextDecoder",
      `return function (buffer, constructorFn) { ${ctx.code} };`
    )(ctx.imports, TextDecoder);
  }

  sizeOf(): number {
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

    if (this.next) {
      size += this.next.sizeOf();
    }

    return size;
  }

  // Follow the parser chain till the root and start parsing from there
  parse(buffer: Buffer | Uint8Array): O {
    if (!this.compiled) {
      this.compile();
    }

    return this.compiled!(buffer, this.constructorFn);
  }

  private setNextParser<N extends string, T, F>(
    type: Types,
    varName: N | undefined,
    options: ParserOptions<O, T, F>
  ): Next<O, N, F> {
    const parser = new Parser();

    parser.type = type;
    parser.varName = varName as string;
    parser.options = options as ParserOptions;
    parser.endian = this.endian;

    if (this.head) {
      this.head.next = parser;
    } else {
      this.next = parser;
    }
    this.head = parser;

    return this as unknown as Next<O, N, F>;
  }

  // Call code generator for this parser
  private generate(ctx: Context) {
    if (this.type) {
      switch (this.type) {
        case "uint8":
        case "uint16le":
        case "uint16be":
        case "uint32le":
        case "uint32be":
        case "int8":
        case "int16le":
        case "int16be":
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

    return this.generateNext(ctx);
  }

  private generateAssert(ctx: Context) {
    if (!this.options.assert) {
      return;
    }

    const varName = ctx.generateVariable(this.varName);

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
          `if (${JSON.stringify(this.options.assert)} !== ${varName}) {`
        );
        break;
      default:
        throw new Error(
          "assert option must be a string, number or a function."
        );
    }
    ctx.generateError(
      `"Assertion error: ${varName} is " + ${JSON.stringify(
        this.options.assert.toString()
      )}`
    );
    ctx.pushCode("}");
  }

  // Recursively call code generators and append results
  private generateNext(ctx: Context): Context {
    if (this.next) {
      ctx = this.next.generate(ctx);
    }

    return ctx;
  }

  private generateBit(ctx: Context) {
    // TODO find better method to handle nested bit fields
    const parser = JSON.parse(JSON.stringify(this));
    parser.options = this.options;
    parser.generateAssert = this.generateAssert.bind(this);
    parser.generateFormatter = this.generateFormatter.bind(this);
    parser.varName = ctx.generateVariable(parser.varName);
    ctx.bitFields.push(parser);

    if (
      !this.next ||
      (this.next && ["bit", "nest"].indexOf(this.next.type) < 0)
    ) {
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
            `${val} = (dataView.getUint16(offset) << 8) | dataView.getUint8(offset + 2);`
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

      ctx.bitFields.forEach((parser, i) => {
        let length = parser.options.length as number;
        if (length > rem) {
          if (rem) {
            const mask = -1 >>> (32 - rem);
            ctx.pushCode(
              `${parser.varName} = (${val} & 0x${mask.toString(16)}) << ${
                length - rem
              };`
            );
            length -= rem;
          }
          bitOffset = 0;
          rem = sum = getBytes(getMaxBits(i) - rem);
        }
        const offset = isBigEndian ? sum - bitOffset - length : bitOffset;
        const mask = -1 >>> (32 - length);

        ctx.pushCode(
          `${parser.varName} ${
            length < (parser.options.length as number) ? "|=" : "="
          } ${val} >> ${offset} & 0x${mask.toString(16)};`
        );

        // Ensure value is unsigned
        if ((parser.options.length as number) === 32) {
          ctx.pushCode(`${parser.varName} >>>= 0`);
        }

        if (parser.options.assert) {
          parser.generateAssert(ctx);
        }

        if (parser.options.formatter) {
          parser.generateFormatter(
            ctx,
            parser.varName,
            parser.options.formatter
          );
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
    const encoding = this.options.encoding!;
    const isHex = encoding.toLowerCase() === "hex";
    const toHex = 'b => b.toString(16).padStart(2, "0")';

    if (this.options.length && this.options.zeroTerminated) {
      const len = this.options.length;
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode(
        `while(dataView.getUint8(offset++) !== 0 && offset - ${start} < ${len});`
      );
      const end = `offset - ${start} < ${len} ? offset - 1 : offset`;
      ctx.pushCode(
        isHex
          ? `${name} = Array.from(buffer.subarray(${start}, ${end}), ${toHex}).join('');`
          : `${name} = new TextDecoder('${encoding}').decode(buffer.subarray(${start}, ${end}));`
      );
    } else if (this.options.length) {
      const len = ctx.generateOption(this.options.length);
      ctx.pushCode(
        isHex
          ? `${name} = Array.from(buffer.subarray(offset, offset + ${len}), ${toHex}).join('');`
          : `${name} = new TextDecoder('${encoding}').decode(buffer.subarray(offset, offset + ${len}));`
      );
      ctx.pushCode(`offset += ${len};`);
    } else if (this.options.zeroTerminated) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode("while(dataView.getUint8(offset++) !== 0);");
      ctx.pushCode(
        isHex
          ? `${name} = Array.from(buffer.subarray(${start}, offset - 1), ${toHex}).join('');`
          : `${name} = new TextDecoder('${encoding}').decode(buffer.subarray(${start}, offset - 1));`
      );
    } else if (this.options.greedy) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode("while(buffer.length > offset++);");
      ctx.pushCode(
        isHex
          ? `${name} = Array.from(buffer.subarray(${start}, offset), ${toHex}).join('');`
          : `${name} = new TextDecoder('${encoding}').decode(buffer.subarray(${start}, offset));`
      );
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
        `if (${func}.call(${ctx.generateVariable()}, ${cur}, buffer.subarray(offset))) break;`
      );
      ctx.pushCode(`offset += 1;`);
      ctx.pushCode(`}`);
      ctx.pushCode(`${varName} = buffer.subarray(${start}, offset);`);
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode(`${varName} = buffer.subarray(offset);`);
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
    const lengthInBytes = ctx.generateOption(this.options.lengthInBytes!);
    const type = this.options.type;
    const counter = ctx.generateTmpVariable();
    const lhs = ctx.generateVariable(this.varName);
    const item = ctx.generateTmpVariable();
    const key = this.options.key;
    const isHash = typeof key === "string";

    if (isHash) {
      ctx.pushCode(`${lhs} = {};`);
    } else {
      ctx.pushCode(`${lhs} = [];`);
    }
    if (typeof this.options.readUntil === "function") {
      ctx.pushCode("do {");
    } else if (this.options.readUntil === "eof") {
      ctx.pushCode(
        `for (var ${counter} = 0; offset < buffer.length; ${counter}++) {`
      );
    } else if (lengthInBytes !== undefined) {
      ctx.pushCode(
        `for (var ${counter} = offset + ${lengthInBytes}; offset < ${counter}; ) {`
      );
    } else {
      ctx.pushCode(
        `for (var ${counter} = ${length}; ${counter} > 0; ${counter}--) {`
      );
    }

    if (typeof type === "string") {
      if (!aliasRegistry.get(type)) {
        const typeName = PRIMITIVE_NAMES[type as PrimitiveTypes];
        const littleEndian = PRIMITIVE_LITTLE_ENDIANS[type as PrimitiveTypes];
        ctx.pushCode(
          `var ${item} = dataView.get${typeName}(offset, ${littleEndian});`
        );
        ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type as PrimitiveTypes]};`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset, {`);
        if (ctx.useContextVariables) {
          const parentVar = ctx.generateVariable();
          ctx.pushCode(`$parent: ${parentVar},`);
          ctx.pushCode(`$root: ${parentVar}.$root,`);
          if (!this.options.readUntil && lengthInBytes === undefined) {
            ctx.pushCode(`$index: ${length} - ${counter},`);
          }
        }
        ctx.pushCode(`});`);
        ctx.pushCode(
          `var ${item} = ${tempVar}.result; offset = ${tempVar}.offset;`
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser) {
      ctx.pushCode(`var ${item} = {};`);
      const parentVar = ctx.generateVariable();
      ctx.pushScope(item);

      if (ctx.useContextVariables) {
        ctx.pushCode(`${item}.$parent = ${parentVar};`);
        ctx.pushCode(`${item}.$root = ${parentVar}.$root;`);
        if (!this.options.readUntil && lengthInBytes === undefined) {
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
      ctx.pushCode(`${lhs}[${item}.${key}] = ${item};`);
    } else {
      ctx.pushCode(`${lhs}.push(${item});`);
    }

    ctx.pushCode("}");

    if (typeof this.options.readUntil === "function") {
      const pred = this.options.readUntil;
      const func = ctx.addImport(pred);
      ctx.pushCode(
        `while (!${func}.call(${ctx.generateVariable()}, ${item}, buffer.subarray(offset)));`
      );
    }
  }

  private generateChoiceCase<T>(
    ctx: Context,
    varName: string,
    type: string | Parser<T>
  ) {
    if (typeof type === "string") {
      const varName = ctx.generateVariable(this.varName);
      if (!aliasRegistry.has(type)) {
        const typeName = PRIMITIVE_NAMES[type as PrimitiveTypes];
        const littleEndian = PRIMITIVE_LITTLE_ENDIANS[type as PrimitiveTypes];
        ctx.pushCode(
          `${varName} = dataView.get${typeName}(offset, ${littleEndian});`
        );
        ctx.pushCode(`offset += ${PRIMITIVE_SIZES[type as PrimitiveTypes]}`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset, {`);
        if (ctx.useContextVariables) {
          ctx.pushCode(`$parent: ${varName}.$parent,`);
          ctx.pushCode(`$root: ${varName}.$root,`);
        }
        ctx.pushCode(`});`);
        ctx.pushCode(
          `${varName} = ${tempVar}.result; offset = ${tempVar}.offset;`
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser) {
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
      const tag = parseInt(tagString, 10);
      const type = this.options.choices[tag];

      ctx.pushCode(`case ${tag}:`);
      this.generateChoiceCase(ctx, this.varName, type);
      ctx.pushCode("break;");
    }
    ctx.pushCode("default:");
    if (this.options.defaultChoice) {
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
        ctx.pushCode(`${nestVar} = {};`);

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
        if (ctx.useContextVariables) {
          ctx.pushCode(`delete ${nestVar}.$parent;`);
          ctx.pushCode(`delete ${nestVar}.$root;`);
        }
      }
    } else if (aliasRegistry.has(this.options.type!)) {
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(offset, {`
      );
      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`$parent: ${parentVar},`);
        ctx.pushCode(`$root: ${parentVar}.$root,`);
      }
      ctx.pushCode(`});`);
      ctx.pushCode(
        `${nestVar} = ${tempVar}.result; offset = ${tempVar}.offset;`
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
        `if (${func}.call(${ctx.generateVariable()}, ${cur}, buffer.subarray(offset))) break;`
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
      `${wrappedBuf} = ${func}.call(this, ${wrappedBuf}).subarray(0);`
    );
    ctx.pushCode(`var ${tempBuf} = buffer;`);
    ctx.pushCode(`var ${tempOff} = offset;`);
    ctx.pushCode(`var ${tempView} = dataView;`);
    ctx.pushCode(`buffer = ${wrappedBuf};`);
    ctx.pushCode(`offset = 0;`);
    ctx.pushCode(
      `dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);`
    );
    if (this.options.type instanceof Parser) {
      if (this.varName) {
        ctx.pushCode(`${wrapperVar} = {};`);
      }
      ctx.pushPath(this.varName);
      this.options.type.generate(ctx);
      ctx.popPath(this.varName);
    } else if (aliasRegistry.has(this.options.type!)) {
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(0);`
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
    formatter: Function
  ) {
    if (typeof formatter === "function") {
      const func = ctx.addImport(formatter);
      ctx.pushCode(
        `${varName} = ${func}.call(${ctx.generateVariable()}, ${varName});`
      );
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
      ctx.pushCode(`${nestVar} = {};`);

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
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(offset, {`
      );
      if (ctx.useContextVariables) {
        const parentVar = ctx.generateVariable();
        ctx.pushCode(`$parent: ${parentVar},`);
        ctx.pushCode(`$root: ${parentVar}.$root,`);
      }
      ctx.pushCode(`});`);
      ctx.pushCode(
        `${nestVar} = ${tempVar}.result; offset = ${tempVar}.offset;`
      );
      if (this.options.type !== this.alias) {
        ctx.addReference(this.options.type!);
      }
    } else if (Object.keys(PRIMITIVE_SIZES).indexOf(this.options.type!) >= 0) {
      const typeName = PRIMITIVE_NAMES[type as PrimitiveTypes];
      const littleEndian = PRIMITIVE_LITTLE_ENDIANS[type as PrimitiveTypes];
      ctx.pushCode(
        `${nestVar} = dataView.get${typeName}(offset, ${littleEndian});`
      );
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
