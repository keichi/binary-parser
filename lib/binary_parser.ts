import { Buffer } from 'buffer';
import { runInNewContext } from 'vm';
import { Context } from './context';

const PRIMITIVES_SIZES: { [key in PrimitiveTypesUppercase]: number } = {
  UInt8: 1,
  UInt16LE: 2,
  UInt16BE: 2,
  UInt32LE: 4,
  UInt32BE: 4,
  Int8: 1,
  Int16LE: 2,
  Int16BE: 2,
  Int32LE: 4,
  Int32BE: 4,
  FloatLE: 4,
  FloatBE: 4,
  DoubleLE: 8,
  DoubleBE: 8,
};

const aliasRegistry: { [key: string]: Parser } = {};
const FUNCTION_PREFIX = '___parser_';

// Converts Parser's met hod names to internal type names
const NAME_MAP = {
  uint8: 'UInt8',
  uint16le: 'UInt16LE',
  uint16be: 'UInt16BE',
  uint32le: 'UInt32LE',
  uint32be: 'UInt32BE',
  int8: 'Int8',
  int16le: 'Int16LE',
  int16be: 'Int16BE',
  int32le: 'Int32LE',
  int32be: 'Int32BE',
  floatle: 'FloatLE',
  floatbe: 'FloatBE',
  doublele: 'DoubleLE',
  doublebe: 'DoubleBE',
  String: 'String',
  Buffer: 'Buffer',
  Array: 'Array',
  Skip: 'Skip',
  Choice: 'Choice',
  Nest: 'Nest',
  Bit: 'Bit',
};

interface ParserOptions {
  length?: number;
  type?: Types | Parser;
  assert?: (item: any) => void | string | number;
  formatter?: (item: any) => void;
  encoding?: 'utf8';
  lengthInBytes?: null;
  readUntil?: 'eof';
  greedy?: null;
  choices?: { [key: string]: string };
  defaultChoice?: null;
  zeroTerminated?: boolean;
  clone?: null;
  stripNull?: null;
  key?: null;
  tag?: null;
}

type Types =
  | 'String'
  | 'Buffer'
  | 'Skip'
  | 'Nest'
  | 'Array'
  | 'Choice'
  | 'Bit'
  | 'UInt8'
  | 'UInt16LE'
  | 'UInt16BE'
  | 'UInt32LE'
  | 'UInt32BE'
  | 'Int8'
  | 'Int16LE'
  | 'Int16BE'
  | 'Int32LE'
  | 'Int32BE'
  | 'FloatLE'
  | 'FloatBE'
  | 'DoubleLE'
  | 'DoubleBE'
  | '';

type Endianess = 'be' | 'le';

type PrimitiveTypesUppercase =
  | 'UInt8'
  | 'UInt16LE'
  | 'UInt16BE'
  | 'UInt32LE'
  | 'UInt32BE'
  | 'Int8'
  | 'Int16LE'
  | 'Int16BE'
  | 'Int32LE'
  | 'Int32BE'
  | 'FloatLE'
  | 'FloatBE'
  | 'DoubleLE'
  | 'DoubleBE';

type PrimitiveTypes =
  | 'uint8'
  | 'uint16le'
  | 'uint16be'
  | 'uint32le'
  | 'uint32be'
  | 'int8'
  | 'int16le'
  | 'int16be'
  | 'int32le'
  | 'int32be'
  | 'floatle'
  | 'floatbe'
  | 'doublele'
  | 'doublebe';

type PrimitiveTypesWithoutEndian =
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'int8'
  | 'int16'
  | 'int32';

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

export class Parser {
  varName = '';
  type: Types = '';
  options: ParserOptions = {};
  next: Parser | null = null;
  head: Parser | null = null;
  compiled: Function | null = null;
  endian: Endianess = 'be';
  constructorFn: Function | null = null;
  alias: string | null = null;

  constructor() {}

  static start() {
    return new Parser();
  }

  private primitiveGenerateN(type: PrimitiveTypesUppercase, ctx: Context) {
    ctx.pushCode(
      `${ctx.generateVariable(this.varName)} = buffer.read${type}(offset);`
    );
    ctx.pushCode(`offset += ${PRIMITIVES_SIZES[type]};`);
  }

  private primitiveN(
    type: PrimitiveTypes,
    varName: string,
    options?: ParserOptions
  ) {
    return this.setNextParser(type as Types, varName, options);
  }

  private useThisEndian(type: PrimitiveTypesWithoutEndian): PrimitiveTypes {
    return (type + this.endian.toLowerCase()) as PrimitiveTypes;
  }

  uint8(varName: string, options?: ParserOptions) {
    return this.primitiveN('uint8', varName, options);
  }

  uint16(varName: string, options?: ParserOptions) {
    return this.primitiveN(this.useThisEndian('uint16'), varName, options);
  }
  uint16le(varName: string, options?: ParserOptions) {
    return this.primitiveN('uint16le', varName, options);
  }
  uint16be(varName: string, options?: ParserOptions) {
    return this.primitiveN('uint16be', varName, options);
  }

  uint32(varName: string, options?: ParserOptions) {
    return this.primitiveN(this.useThisEndian('uint32'), varName, options);
  }
  uint32le(varName: string, options?: ParserOptions) {
    return this.primitiveN('uint32le', varName, options);
  }
  uint32be(varName: string, options?: ParserOptions) {
    return this.primitiveN('uint32be', varName, options);
  }

  int8(varName: string, options?: ParserOptions) {
    return this.primitiveN('int8', varName, options);
  }

  int16(varName: string, options?: ParserOptions) {
    return this.primitiveN(this.useThisEndian('int16'), varName, options);
  }
  int16le(varName: string, options?: ParserOptions) {
    return this.primitiveN('int16le', varName, options);
  }
  int16be(varName: string, options?: ParserOptions) {
    return this.primitiveN('int16be', varName, options);
  }

  int32(varName: string, options?: ParserOptions) {
    return this.primitiveN(this.useThisEndian('int32'), varName, options);
  }
  int32le(varName: string, options?: ParserOptions) {
    return this.primitiveN('int32le', varName, options);
  }
  int32be(varName: string, options?: ParserOptions) {
    return this.primitiveN('int32be', varName, options);
  }

  floatle(varName: string, options?: ParserOptions) {
    return this.primitiveN('floatle', varName, options);
  }
  floatbe(varName: string, options?: ParserOptions) {
    return this.primitiveN('floatbe', varName, options);
  }

  doublele(varName: string, options?: ParserOptions) {
    return this.primitiveN('doublele', varName, options);
  }
  doublebe(varName: string, options?: ParserOptions) {
    return this.primitiveN('doublebe', varName, options);
  }

  private bitN(size: BitSizes, varName: string, options?: ParserOptions) {
    if (!options) {
      options = {};
    }
    options.length = size;
    return this.setNextParser('Bit', varName, options);
  }
  bit1(varName: string, options?: ParserOptions) {
    return this.bitN(1, varName, options);
  }
  bit2(varName: string, options?: ParserOptions) {
    return this.bitN(2, varName, options);
  }
  bit3(varName: string, options?: ParserOptions) {
    return this.bitN(3, varName, options);
  }
  bit4(varName: string, options?: ParserOptions) {
    return this.bitN(4, varName, options);
  }
  bit5(varName: string, options?: ParserOptions) {
    return this.bitN(5, varName, options);
  }
  bit6(varName: string, options?: ParserOptions) {
    return this.bitN(6, varName, options);
  }
  bit7(varName: string, options?: ParserOptions) {
    return this.bitN(7, varName, options);
  }
  bit8(varName: string, options?: ParserOptions) {
    return this.bitN(8, varName, options);
  }
  bit9(varName: string, options?: ParserOptions) {
    return this.bitN(9, varName, options);
  }
  bit10(varName: string, options?: ParserOptions) {
    return this.bitN(10, varName, options);
  }
  bit11(varName: string, options?: ParserOptions) {
    return this.bitN(11, varName, options);
  }
  bit12(varName: string, options?: ParserOptions) {
    return this.bitN(12, varName, options);
  }
  bit13(varName: string, options?: ParserOptions) {
    return this.bitN(13, varName, options);
  }
  bit14(varName: string, options?: ParserOptions) {
    return this.bitN(14, varName, options);
  }
  bit15(varName: string, options?: ParserOptions) {
    return this.bitN(15, varName, options);
  }
  bit16(varName: string, options?: ParserOptions) {
    return this.bitN(16, varName, options);
  }
  bit17(varName: string, options?: ParserOptions) {
    return this.bitN(17, varName, options);
  }
  bit18(varName: string, options?: ParserOptions) {
    return this.bitN(18, varName, options);
  }
  bit19(varName: string, options?: ParserOptions) {
    return this.bitN(19, varName, options);
  }
  bit20(varName: string, options?: ParserOptions) {
    return this.bitN(20, varName, options);
  }
  bit21(varName: string, options?: ParserOptions) {
    return this.bitN(21, varName, options);
  }
  bit22(varName: string, options?: ParserOptions) {
    return this.bitN(22, varName, options);
  }
  bit23(varName: string, options?: ParserOptions) {
    return this.bitN(23, varName, options);
  }
  bit24(varName: string, options?: ParserOptions) {
    return this.bitN(24, varName, options);
  }
  bit25(varName: string, options?: ParserOptions) {
    return this.bitN(25, varName, options);
  }
  bit26(varName: string, options?: ParserOptions) {
    return this.bitN(26, varName, options);
  }
  bit27(varName: string, options?: ParserOptions) {
    return this.bitN(27, varName, options);
  }
  bit28(varName: string, options?: ParserOptions) {
    return this.bitN(28, varName, options);
  }
  bit29(varName: string, options?: ParserOptions) {
    return this.bitN(29, varName, options);
  }
  bit30(varName: string, options?: ParserOptions) {
    return this.bitN(30, varName, options);
  }
  bit31(varName: string, options?: ParserOptions) {
    return this.bitN(31, varName, options);
  }
  bit32(varName: string, options?: ParserOptions) {
    return this.bitN(32, varName, options);
  }

  namely(alias: string) {
    aliasRegistry[alias] = this;
    this.alias = alias;
    return this;
  }

  skip(length: number, options: ParserOptions) {
    if (options && options.assert) {
      throw new Error('assert option on skip is not allowed.');
    }

    return this.setNextParser('Skip', '', { length: length });
  }

  string(varName: string, options: ParserOptions) {
    if (!options.zeroTerminated && !options.length && !options.greedy) {
      throw new Error(
        'Neither length, zeroTerminated, nor greedy is defined for string.'
      );
    }
    if ((options.zeroTerminated || options.length) && options.greedy) {
      throw new Error(
        'greedy is mutually exclusive with length and zeroTerminated for string.'
      );
    }
    if (options.stripNull && !(options.length || options.greedy)) {
      throw new Error(
        'Length or greedy must be defined if stripNull is defined.'
      );
    }
    options.encoding = options.encoding || 'utf8';

    return this.setNextParser('String', varName, options);
  }

  buffer(varName: string, options: ParserOptions) {
    if (!options.length && !options.readUntil) {
      throw new Error('Length nor readUntil is defined in buffer parser');
    }

    return this.setNextParser('Buffer', varName, options);
  }

  array(varName: string, options: ParserOptions) {
    if (!options.readUntil && !options.length && !options.lengthInBytes) {
      throw new Error('Length option of array is not defined.');
    }
    if (!options.type) {
      throw new Error('Type option of array is not defined.');
    }
    if (
      typeof options.type === 'string' &&
      !aliasRegistry[options.type] &&
      Object.keys(PRIMITIVES_SIZES).indexOf(NAME_MAP[options.type]) < 0
    ) {
      throw new Error(
        'Specified primitive type "' + options.type + '" is not supported.'
      );
    }

    return this.setNextParser('Array', varName, options);
  }

  choice(varName: string | ParserOptions, options?: ParserOptions) {
    if (typeof options !== 'object' && typeof varName === 'object') {
      options = varName;
      varName = null;
    }

    if (!options.tag) {
      throw new Error('Tag option of array is not defined.');
    }
    if (!options.choices) {
      throw new Error('Choices option of array is not defined.');
    }

    Object.keys(options.choices).forEach(key => {
      if (isNaN(parseInt(key, 10))) {
        throw new Error('Key of choices must be a number.');
      }
      if (!options.choices[key]) {
        throw new Error(
          'Choice Case ' + key + ' of ' + varName + ' is not valid.'
        );
      }

      if (
        typeof options.choices[key] === 'string' &&
        !aliasRegistry[options.choices[key]] &&
        Object.keys(PRIMITIVES_SIZES).indexOf(NAME_MAP[options.choices[key]]) < 0
      ) {
        throw new Error(
          'Specified primitive type "' +
            options.choices[key] +
            '" is not supported.'
        );
      }
    });

    return this.setNextParser('Choice', varName as string, options);
  }

  nest(varName: string | ParserOptions, options: ParserOptions) {
    if (typeof options !== 'object' && typeof varName === 'object') {
      options = varName;
      varName = null;
    }

    if (!options.type) {
      throw new Error('Type option of nest is not defined.');
    }
    if (!(options.type instanceof Parser) && !aliasRegistry[options.type]) {
      throw new Error('Type option of nest must be a Parser object.');
    }
    if (!(options.type instanceof Parser) && !varName) {
      throw new Error(
        'options.type must be a object if variable name is omitted.'
      );
    }

    return this.setNextParser('Nest', varName as string, options);
  }

  endianess(endianess: 'little' | 'big') {
    switch (endianess.toLowerCase()) {
      case 'little':
        this.endian = 'le';
        break;
      case 'big':
        this.endian = 'be';
        break;
      default:
        throw new Error('Invalid endianess: ' + endianess);
    }

    return this;
  }

  create(constructorFn: Function) {
    if (!(constructorFn instanceof Function)) {
      throw new Error('Constructor must be a Function object.');
    }

    this.constructorFn = constructorFn;

    return this;
  }

  getCode() {
    const ctx = new Context();

    ctx.pushCode('if (!Buffer.isBuffer(buffer)) {');
    ctx.generateError('"argument buffer is not a Buffer object"');
    ctx.pushCode('}');

    if (!this.alias) {
      this.addRawCode(ctx);
    } else {
      this.addAliasedCode(ctx);
    }

    if (this.alias) {
      ctx.pushCode(`return ${FUNCTION_PREFIX + this.alias}(0).result;`);
    } else {
      ctx.pushCode('return vars;');
    }

    return ctx.code;
  }

  private addRawCode(ctx: Context) {
    ctx.pushCode('var offset = 0;');

    if (this.constructorFn) {
      ctx.pushCode('var vars = new constructorFn();');
    } else {
      ctx.pushCode('var vars = {};');
    }

    this.generate(ctx);

    this.resolveReferences(ctx);

    ctx.pushCode('return vars;');
  }

  private addAliasedCode(ctx: Context) {
    ctx.pushCode(`function ${FUNCTION_PREFIX + this.alias}(offset) {`);

    if (this.constructorFn) {
      ctx.pushCode('var vars = new constructorFn();');
    } else {
      ctx.pushCode('var vars = {};');
    }

    this.generate(ctx);

    ctx.markResolved(this.alias);
    this.resolveReferences(ctx);

    ctx.pushCode('return { offset: offset, result: vars };');
    ctx.pushCode('}');

    return ctx;
  }

  private resolveReferences(ctx: Context) {
    const references = ctx.getUnresolvedReferences();
    ctx.markRequested(references);
    references.forEach(alias => {
      const parser = aliasRegistry[alias];
      parser.addAliasedCode(ctx);
    });
  }

  compile() {
    const src = '(function(buffer, constructorFn) { ' + this.getCode() + ' })';
    this.compiled = runInNewContext(src, { Buffer });
  }

  sizeOf() {
    let size = NaN;

    if (Object.keys(PRIMITIVES_SIZES).indexOf(this.type) >= 0) {
      size = PRIMITIVES_SIZES[this.type];

      // if this is a fixed length string
    } else if (
      this.type === 'String' &&
      typeof this.options.length === 'number'
    ) {
      size = this.options.length;

      // if this is a fixed length buffer
    } else if (
      this.type === 'Buffer' &&
      typeof this.options.length === 'number'
    ) {
      size = this.options.length;

      // if this is a fixed length array
    } else if (
      this.type === 'Array' &&
      typeof this.options.length === 'number'
    ) {
      let elementSize = NaN;
      if (typeof this.options.type === 'string') {
        elementSize = PRIMITIVES_SIZES[NAME_MAP[this.options.type]];
      } else if (this.options.type instanceof Parser) {
        elementSize = this.options.type.sizeOf();
      }
      size = this.options.length * elementSize;

      // if this a skip
    } else if (this.type === 'Skip') {
      size = this.options.length;

      // if this is a nested parser
    } else if (this.type === 'Nest') {
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
  parse(buffer: Buffer) {
    if (!this.compiled) {
      this.compile();
    }

    return this.compiled(buffer, this.constructorFn);
  }

  private setNextParser(type: Types, varName: string, options: ParserOptions) {
    const parser = new Parser();

    parser.type = NAME_MAP[type];
    parser.varName = varName;
    parser.options = options || parser.options;
    parser.endian = this.endian;

    if (this.head) {
      this.head.next = parser;
    } else {
      this.next = parser;
    }
    this.head = parser;

    return this;
  }

  // Call code generator for this parser
  private generate(ctx: Context) {
    if (this.type) {
        switch (this.type) {
          case 'UInt8':
          case 'UInt16LE':
          case 'UInt16BE':
          case 'UInt32LE':
          case 'UInt32BE':
          case 'Int8':
          case 'Int16LE':
          case 'Int16BE':
          case 'Int32LE':
          case 'Int32BE':
          case 'FloatLE':
          case 'FloatBE':
          case 'DoubleLE':
          case 'DoubleBE':
            this.primitiveGenerateN(this.type, ctx);
            break;
          case 'Bit':
            this.generateBit(ctx);
            break;
          case 'String':
            this.generateString(ctx);
            break;
          case 'Buffer':
            this.generateBuffer(ctx);
            break;
          case 'Skip':
            this.generateSkip(ctx);
            break;
          case 'Nest':
            this.generateNest(ctx);
            break;
          case 'Array':
            this.generateArray(ctx);
            break;
          case 'Choice':
            this.generateChoice(ctx);
            break;
        }
      this.generateAssert(ctx);
    }

    const varName = ctx.generateVariable(this.varName);
    if (this.options.formatter) {
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
      case 'function':
        ctx.pushCode(`if (!(${this.options.assert}).call(vars, ${varName})) {`);
        break;
      case 'number':
        ctx.pushCode(`if (${this.options.assert} !== ${varName}) {`);
        break;
      case 'string':
        ctx.pushCode(`if ("${this.options.assert}" !== ${varName}) {`);
        break;
      default:
        throw new Error(
          'Assert option supports only strings, numbers and assert functions.'
        );
    }
    ctx.generateError(
      `"Assert error: ${varName} is " + ${this.options.assert}`
    );
    ctx.pushCode('}');
  }

  // Recursively call code generators and append results
  private generateNext(ctx: Context) {
    if (this.next) {
      ctx = this.next.generate(ctx);
    }

    return ctx;
  }

  private generateBit(ctx: Context) {
    // TODO find better method to handle nested bit fields
    const parser = JSON.parse(JSON.stringify(this));
    parser.varName = ctx.generateVariable(parser.varName);
    ctx.bitFields.push(parser);

    if (
      !this.next ||
      (this.next && ['Bit', 'Nest'].indexOf(this.next.type) < 0)
    ) {
      let sum = 0;
      ctx.bitFields.forEach(parser => (sum += parser.options.length));

      const val = ctx.generateTmpVariable();

      if (sum <= 8) {
        ctx.pushCode(`var ${val} = buffer.readUInt8(offset);`);
        sum = 8;
      } else if (sum <= 16) {
        ctx.pushCode(`var ${val} = buffer.readUInt16BE(offset);`);
        sum = 16;
      } else if (sum <= 24) {
        const val1 = ctx.generateTmpVariable();
        const val2 = ctx.generateTmpVariable();
        ctx.pushCode(`var ${val1} = buffer.readUInt16BE(offset);`);
        ctx.pushCode(`var ${val2} = buffer.readUInt8(offset + 2);`);
        ctx.pushCode(`var ${val} = (${val1} << 8) | ${val2};`);
        sum = 24;
      } else if (sum <= 32) {
        ctx.pushCode(`var ${val} = buffer.readUInt32BE(offset);`);
        sum = 32;
      } else {
        throw new Error(
          'Currently, bit field sequence longer than 4-bytes is not supported.'
        );
      }
      ctx.pushCode(`offset += ${sum / 8};`);

      let bitOffset = 0;
      const isBigEndian = this.endian === 'be';
      ctx.bitFields.forEach(parser => {
        const offset = isBigEndian
          ? sum - bitOffset - parser.options.length
          : bitOffset;
        const mask = (1 << parser.options.length) - 1;

        ctx.pushCode(`${parser.varName} = ${val} >> ${offset} & ${mask};`);
        bitOffset += parser.options.length;
      });

      ctx.bitFields = [];
    }
  }

  private generateSkip(ctx: Context) {
    const length = ctx.generateOption(this.options.length);
    ctx.pushCode(`offset += ${length};`);
  }

  private generateString(ctx: Context) {
    const name = ctx.generateVariable(this.varName);
    const start = ctx.generateTmpVariable();
    const encoding = this.options.encoding;

    if (this.options.length && this.options.zeroTerminated) {
      const len = this.options.length;
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode(
        `while(buffer.readUInt8(offset++) !== 0 && offset - ${start}  < ${len});`
      );
      ctx.pushCode(
        `${name} = buffer.toString('${encoding}', ${start}, offset - ${start} < ${len} ? offset - 1 : offset);`
      );
    } else if (this.options.length) {
      const len = ctx.generateOption(this.options.length);
      ctx.pushCode(
        `${name} = buffer.toString('${encoding}', offset, offset + ${len});`
      );
      ctx.pushCode(`offset += ${len};`);
    } else if (this.options.zeroTerminated) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode('while(buffer.readUInt8(offset++) !== 0);');
      ctx.pushCode(
        `${name} = buffer.toString('${encoding}', ${start}, offset - 1);`
      );
    } else if (this.options.greedy) {
      ctx.pushCode(`var ${start} = offset;`);
      ctx.pushCode('while(buffer.length > offset++);');
      ctx.pushCode(
        `${name} = buffer.toString('${encoding}', ${start}, offset);`
      );
    }
    if (this.options.stripNull) {
      ctx.pushCode(`${name} = ${name}.replace(/\\x00+$/g, '')`);
    }
  }

  private generateBuffer(ctx: Context) {
    const varName = ctx.generateVariable(this.varName);

    if (this.options.readUntil === 'eof') {
      ctx.pushCode(`${varName} = buffer.slice(offset);`);
    } else {
      const len = ctx.generateOption(this.options.length);

      ctx.pushCode(`${varName} = buffer.slice(offset, offset + ${len});`);
      ctx.pushCode(`offset += ${len};`);
    }

    if (this.options.clone) {
      ctx.pushCode(`${varName} = Buffer.from(${varName});`);
    }
  }

  private generateArray(ctx: Context) {
    const length = ctx.generateOption(this.options.length);
    const lengthInBytes = ctx.generateOption(this.options.lengthInBytes);
    const type = this.options.type;
    const counter = ctx.generateTmpVariable();
    const lhs = ctx.generateVariable(this.varName);
    const item = ctx.generateTmpVariable();
    const key = this.options.key;
    const isHash = typeof key === 'string';

    if (isHash) {
      ctx.pushCode(`${lhs} = {};`);
    } else {
      ctx.pushCode(`${lhs} = [];`);
    }
    if (typeof this.options.readUntil === 'function') {
      ctx.pushCode('do {');
    } else if (this.options.readUntil === 'eof') {
      ctx.pushCode(
        `for (var ${counter} = 0; offset < buffer.length; ${counter}++) {`
      );
    } else if (lengthInBytes !== undefined) {
      ctx.pushCode(
        `for (var ${counter} = offset; offset - ${counter} < ${lengthInBytes}; ) {`
      );
    } else {
      ctx.pushCode(
        `for (var ${counter} = 0; ${counter} < ${length}; ${counter}++) {`
      );
    }

    if (typeof type === 'string') {
      if (!aliasRegistry[type]) {
        ctx.pushCode(`var ${item} = buffer.read${NAME_MAP[type]}(offset);`);
        ctx.pushCode(`offset += ${PRIMITIVES_SIZES[NAME_MAP[type]]};`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset);`);
        ctx.pushCode(
          `var ${item} = ${tempVar}.result; offset = ${tempVar}.offset;`
        );
        if (type !== this.alias) ctx.addReference(type);
      }
    } else if (type instanceof Parser) {
      ctx.pushCode(`var ${item} = {};`);

      ctx.pushScope(item);
      type.generate(ctx);
      ctx.popScope();
    }

    if (isHash) {
      ctx.pushCode(`${lhs}[${item}.${key}] = ${item};`);
    } else {
      ctx.pushCode(`${lhs}.push(${item});`);
    }

    ctx.pushCode('}');

    if (typeof this.options.readUntil === 'function') {
      const pred = this.options.readUntil;
      ctx.pushCode(
        `while (!(${pred}).call(this, ${item}, buffer.slice(offset)));`
      );
    }
  }

  private generateChoiceCase(
    ctx: Context,
    varName: string,
    type: string | Parser
  ) {
    if (typeof type === 'string') {
      const varName = ctx.generateVariable(this.varName);
      if (!aliasRegistry[type]) {
        ctx.pushCode(`${varName} = buffer.read${NAME_MAP[type]}(offset);`);
        ctx.pushCode(`offset += ${PRIMITIVES_SIZES[NAME_MAP[type]]}`);
      } else {
        const tempVar = ctx.generateTmpVariable();
        ctx.pushCode(`var ${tempVar} = ${FUNCTION_PREFIX + type}(offset);`);
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
    const tag = ctx.generateOption(this.options.tag);
    if (this.varName) {
      ctx.pushCode(`${ctx.generateVariable(this.varName)} = {};`);
    }
    ctx.pushCode(`switch(${tag}) {`);
    Object.keys(this.options.choices).forEach(tag => {
      const type = this.options.choices[tag];

      ctx.pushCode(`case ${tag}:`);
      this.generateChoiceCase(ctx, this.varName, type);
      ctx.pushCode('break;');
    });
    ctx.pushCode('default:');
    if (this.options.defaultChoice) {
      this.generateChoiceCase(ctx, this.varName, this.options.defaultChoice);
    } else {
      ctx.generateError(`"Met undefined tag value " + ${tag} + " at choice"`);
    }
    ctx.pushCode('}');
  }

  private generateNest(ctx: Context) {
    const nestVar = ctx.generateVariable(this.varName);

    if (this.options.type instanceof Parser) {
      if (this.varName) {
        ctx.pushCode(`${nestVar} = {};`);
      }
      ctx.pushPath(this.varName);
      this.options.type.generate(ctx);
      ctx.popPath(this.varName);
    } else if (aliasRegistry[this.options.type]) {
      const tempVar = ctx.generateTmpVariable();
      ctx.pushCode(
        `var ${tempVar} = ${FUNCTION_PREFIX + this.options.type}(offset);`
      );
      ctx.pushCode(
        `${nestVar} = ${tempVar}.result; offset = ${tempVar}.offset;`
      );
      if (this.options.type !== this.alias) ctx.addReference(this.options.type);
    }
  }

  private generateFormatter(
    ctx: Context,
    varName: string,
    formatter: Function
  ) {
    if (typeof formatter === 'function') {
      ctx.pushCode(`${varName} = (${formatter}).call(this, ${varName});`);
    }
  }
}
