# Binary-parser

[![build](https://github.com/keichi/binary-parser/workflows/build/badge.svg)](https://github.com/keichi/binary-parser/actions?query=workflow%3Abuild)
[![npm](https://img.shields.io/npm/v/binary-parser)](https://www.npmjs.com/package/binary-parser)
[![license](https://img.shields.io/github/license/keichi/binary-parser)](https://github.com/keichi/binary-parser/blob/master/LICENSE)

Binary-parser is a parser builder for JavaScript that enables you to write
efficient binary parsers in a simple and declarative manner.

It supports all common data types required to analyze a structured binary
data. Binary-parser dynamically generates and compiles the parser code
on-the-fly, which runs as fast as a hand-written parser (which takes much more
time and effort to write). Supported data types are:

- [Integers](#uint8-16-32-64le-bename-options) (8, 16, 32 and 64 bit signed
  and unsigned integers)
- [Floating point numbers](#float-doublele-bename-options) (32 and 64 bit
  floating point values)
- [Bit fields](#bit1-32name-options) (bit fields with length from 1 to 32
  bits)
- [Strings](#stringname-options) (fixed-length, variable-length and zero
  terminated strings with various encodings)
- [Arrays](#arrayname-options) (fixed-length and variable-length arrays of
  builtin or user-defined element types)
- [Choices](#choicename-options) (supports integer keys)
- [Pointers](#pointername-options)
- User defined types (arbitrary combination of builtin types)

Binary-parser was inspired by [BinData](https://github.com/dmendel/bindata)
and [binary](https://github.com/substack/node-binary).

## Quick Start

1. Create an empty `Parser` object with `new Parser()` or `Parser.start()`.
2. Chain methods to build your desired parser. (See [API](#api) for detailed
   documentation of each method)
3. Call `Parser.prototype.parse` with a `Buffer`/`Uint8Array` object passed as
   its only argument.
4. The parsed result will be returned as an object.
   - If parsing failed, an exception will be thrown.

```javascript
// Module import
const Parser = require("binary-parser").Parser;

// Alternative way to import the module
// import { Parser } from "binary-parser";

// Build an IP packet header Parser
const ipHeader = new Parser()
  .endianness("big")
  .bit4("version")
  .bit4("headerLength")
  .uint8("tos")
  .uint16("packetLength")
  .uint16("id")
  .bit3("offset")
  .bit13("fragOffset")
  .uint8("ttl")
  .uint8("protocol")
  .uint16("checksum")
  .array("src", {
    type: "uint8",
    length: 4
  })
  .array("dst", {
    type: "uint8",
    length: 4
  });

// Prepare buffer to parse.
const buf = Buffer.from("450002c5939900002c06ef98adc24f6c850186d1", "hex");

// Parse buffer and show result
console.log(ipHeader.parse(buf));
```

## Installation

You can install `binary-parser` via npm:

```bash
npm install binary-parser
```

The npm package provides entry points for both CommonJS and ES modules.

## API

### new Parser()
Create an empty parser object that parses nothing.

### parse(buffer)
Parse a `Buffer`/`Uint8Array` object `buffer` with this parser and return the
resulting object. When `parse(buffer)` is called for the first time, the
associated parser code is compiled on-the-fly and internally cached.

### create(constructorFunction)
Set the constructor function that should be called to create the object
returned from the `parse` method.

### [u]int{8, 16, 32, 64}{le, be}(name[, options])
Parse bytes as an integer and store it in a variable named `name`. `name`
should consist only of alphanumeric characters and start with an alphabet.
Number of bits can be chosen from 8, 16, 32 and 64. Byte-ordering can be either
`le` for little endian or `be` for big endian. With no prefix, it parses as a
signed number, with `u` prefix as an unsigned number. The runtime type
returned by the 8, 16, 32 bit methods is `number` while the type
returned by the 64 bit is `bigint`.

**Note:** [u]int64{be,le} methods only work if your runtime is node v12.0.0 or
greater. Lower versions will throw a runtime error.

```javascript
const parser = new Parser()
  // Signed 32-bit integer (little endian)
  .int32le("a")
  // Unsigned 8-bit integer
  .uint8("b")
  // Signed 16-bit integer (big endian)
  .int16be("c")
  // signed 64-bit integer (big endian)
  .int64be("d")
```

### bit\[1-32\](name[, options])
Parse bytes as a bit field and store it in variable `name`. There are 32
methods from `bit1` to `bit32` each corresponding to 1-bit-length to
32-bits-length bit field.

### {float, double}{le, be}(name[, options])
Parse bytes as a floating-point value and stores it to a variable named
`name`.

```javascript
const parser = new Parser()
  // 32-bit floating value (big endian)
  .floatbe("a")
  // 64-bit floating value (little endian)
  .doublele("b");
```

### string(name[, options])
Parse bytes as a string. `name` should consist only of alpha numeric
characters and start with an alphabet. `options` is an object which can have
the following keys:

- `encoding` - (Optional, defaults to `utf8`) Specify which encoding to use.
  Supported encodings include `"hex"` and all encodings supported by
  [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding).
- `length ` - (Optional) Length of the string. Can be a number, string or a
  function. Use number for statically sized arrays, string to reference
  another variable and function to do some calculation.
- `zeroTerminated` - (Optional, defaults to `false`) If true, then this parser
  reads until it reaches zero.
- `greedy` - (Optional, defaults to `false`) If true, then this parser reads
  until it reaches the end of the buffer. Will consume zero-bytes.
- `stripNull` - (Optional, must be used with `length`) If true, then strip
  null characters from end of the string.

### buffer(name[, options])
Parse bytes as a buffer. Its type will be the same as the input to
`parse(buffer)`. `name` should consist only of alpha numeric characters and
start with an alphabet. `options` is an object which can have the following
keys:

- `clone` - (Optional, defaults to `false`) By default,
  `buffer(name [,options])` returns a new buffer which references the same
  memory as the parser input, but offset and cropped by a certain range. If
  this option is true, input buffer will be cloned and a new buffer
  referencing a new memory region is returned.
- `length ` - (either `length` or `readUntil` is required) Length of the
  buffer. Can be a number, string or a function. Use number for statically
  sized buffers, string to reference another variable and function to do some
  calculation.
- `readUntil` - (either `length` or `readUntil` is required) If `"eof"`, then
  this parser will read till it reaches the end of the `Buffer`/`Uint8Array`
  object. If it is a function, this parser will read the buffer until the
  function returns true.

### array(name, options)
Parse bytes as an array. `options` is an object which can have the following
keys:

- `type` - (Required) Type of the array element. Can be a string or a user
  defined `Parser` object. If it's a string, you have to choose from [u]int{8,
  16, 32}{le, be}.
- `length` - (either `length`, `lengthInBytes`, or `readUntil` is required)
  Length of the array. Can be a number, string or a function. Use number for
  statically sized arrays.
- `lengthInBytes` - (either `length`, `lengthInBytes`, or `readUntil` is
  required) Length of the array expressed in bytes. Can be a number, string or
  a function. Use number for statically sized arrays.
- `readUntil` - (either `length`, `lengthInBytes`, or `readUntil` is required)
  If `"eof"`, then this parser reads until the end of the `Buffer`/`Uint8Array`
  object. If function it reads until the function returns true.

```javascript
const parser = new Parser()
  // Statically sized array
  .array("data", {
    type: "int32",
    length: 8
  })

  // Dynamically sized array (references another variable)
  .uint8("dataLength")
  .array("data2", {
    type: "int32",
    length: "dataLength"
  })

  // Dynamically sized array (with some calculation)
  .array("data3", {
    type: "int32",
    length: function() {
      return this.dataLength - 1;
    } // other fields are available through `this`
  })

  // Statically sized array
  .array("data4", {
    type: "int32",
    lengthInBytes: 16
  })

  // Dynamically sized array (references another variable)
  .uint8("dataLengthInBytes")
  .array("data5", {
    type: "int32",
    lengthInBytes: "dataLengthInBytes"
  })

  // Dynamically sized array (with some calculation)
  .array("data6", {
    type: "int32",
    lengthInBytes: function() {
      return this.dataLengthInBytes - 4;
    } // other fields are available through `this`
  })

  // Dynamically sized array (with stop-check on parsed item)
  .array("data7", {
    type: "int32",
    readUntil: function(item, buffer) {
      return item === 42;
    } // stop when specific item is parsed. buffer can be used to perform a read-ahead.
  })

  // Use user defined parser object
  .array("data8", {
    type: userDefinedParser,
    length: "dataLength"
  });
```

### choice([name,] options)
Choose one parser from multiple parsers according to a field value and store
its parsed result to key `name`. If `name` is null or omitted, the result of
the chosen parser is directly embedded into the current object. `options` is
an object which can have the following keys:

- `tag` - (Required) The value used to determine which parser to use from the
  `choices`. Can be a string pointing to another field or a function.
- `choices` - (Required) An object which key is an integer and value is the
  parser which is executed when `tag` equals the key value.
- `defaultChoice` - (Optional) In case if the tag value doesn't match any of
  `choices`, this parser is used.

```javascript
const parser1 = ...;
const parser2 = ...;
const parser3 = ...;

const parser = new Parser().uint8("tagValue").choice("data", {
  tag: "tagValue",
  choices: {
    1: parser1, // if tagValue == 1, execute parser1
    4: parser2, // if tagValue == 4, execute parser2
    5: parser3 // if tagValue == 5, execute parser3
  }
});
```

Combining `choice` with `array` is an idiom to parse
[TLV](http://en.wikipedia.org/wiki/Type-length-value)-based binary formats.

### nest([name,] options)
Execute an inner parser and store its result to key `name`. If `name` is null
or omitted, the result of the inner parser is directly embedded into the
current object. `options` is an object which can have the following keys:

- `type` - (Required) A `Parser` object.

### pointer(name [,options])
Jump to `offset`, execute parser for `type` and rewind to previous offset.
Useful for parsing binary formats such as ELF where the offset of a field is
pointed by another field.

- `type` - (Required) Can be a string `[u]int{8, 16, 32, 64}{le, be}`
   or a user defined `Parser` object.
- `offset` - (Required) Indicates absolute offset from the beginning of the
  input buffer. Can be a number, string or a function.

### saveOffset(name [,options])
Save the current buffer offset as key `name`. This function is only useful
when called after another function which would advance the internal buffer
offset.

```javascript
const parser = new Parser()
  // this call advances the buffer offset by
  // a variable (i.e. unknown to us) number of bytes
  .string("name", {
    zeroTerminated: true
  })
  // this variable points to an absolute position
  // in the buffer
  .uint32("seekOffset")
  // now, save the "current" offset in the stream
  // as the variable "currentOffset"
  .saveOffset("currentOffset")
  // finally, use the saved offset to figure out
  // how many bytes we need to skip
  .seek(function() {
    return this.seekOffset - this.currentOffset;
  })
  ... // the parser would continue here
```

### seek(relOffset)
Move the buffer offset for `relOffset` bytes from the current position. Use a
negative `relOffset` value to rewind the offset. This method was previously
named `skip(length)`.

### endianness(endianness)
Define what endianness to use in this parser. `endianness` can be either
`"little"` or `"big"`. The default endianness of `Parser` is set to big-endian.

```javascript
const parser = new Parser()
  .endianness("little")
  // You can specify endianness explicitly
  .uint16be("a")
  .uint32le("a")
  // Or you can omit endianness (in this case, little-endian is used)
  .uint16("b")
  .int32("c");
```

### namely(alias)
Set an alias to this parser, so that it can be referred to by name in methods
like `.array`, `.nest` and `.choice`, without the requirement to have an
instance of this parser.

Especially, the parser may reference itself:

```javascript
const stop = new Parser();

const parser = new Parser()
  .namely("self") // use 'self' to refer to the parser itself
  .uint8("type")
  .choice("data", {
    tag: "type",
    choices: {
      0: stop,
      1: "self",
      2: Parser.start()
        .nest("left", { type: "self" })
        .nest("right", { type: "self" }),
      3: Parser.start()
        .nest("one", { type: "self" })
        .nest("two", { type: "self" })
        .nest("three", { type: "self" })
    }
  });

//        2
//       / \
//      3   1
//    / | \  \
//   1  0  2  0
//  /     / \
// 0     1   0
//      /
//     0

const buffer = Buffer.from([
  2,
  /* left -> */ 3,
    /* one   -> */ 1, /* -> */ 0,
    /* two   -> */ 0,
    /* three -> */ 2,
      /* left  -> */ 1, /* -> */ 0,
      /* right -> */ 0,
  /* right -> */ 1, /* -> */ 0
]);

parser.parse(buffer);
```

For most of the cases there is almost no difference to the instance-way of
referencing, but this method provides the way to parse recursive trees, where
each node could reference the node of the same type from the inside.

Also, when you reference a parser using its instance twice, the generated code
will contain two similar parts of the code included, while with the named
approach, it will include a function with a name, and will just call this
function for every case of usage.

**Note**: This style could lead to circular references and infinite recursion,
to avoid this, ensure that every possible path has its end. Also, this
recursion is not tail-optimized, so could lead to memory leaks when it goes
too deep.

An example of referencing other parsers:

```javascript
// the line below registers the name "self", so we will be able to use it in
// `twoCells` as a reference
const parser = Parser.start().namely("self");

const stop = Parser.start().namely("stop");

const twoCells = Parser.start()
  .namely("twoCells")
  .nest("left", { type: "self" })
  .nest("right", { type: "stop" });

parser.uint8("type").choice("data", {
  tag: "type",
  choices: {
    0: "stop",
    1: "self",
    2: "twoCells"
  }
});

const buffer = Buffer.from([2, /* left */ 1, 1, 0, /* right */ 0]);

parser.parse(buffer);
```

### wrapped([name,] options)
Read data, then wrap it by transforming it by a function for further parsing.
It works similarly to a buffer where it reads a block of data. But instead of
returning the buffer it will pass the buffer on to a parser for further processing.

The result will be stored in the key `name`. If `name` is an empty string or
`null`, or if it is omitted, the parsed result is directly embedded into the
current object.

- `wrapper` - (Required) A function taking a buffer and returning a buffer
  (`(x: Buffer | Uint8Array ) => Buffer | Uint8Array`) transforming the buffer
  into a buffer expected by `type`.
- `type` - (Required) A `Parser` object to parse the buffer returned by `wrapper`.
- `length ` - (either `length` or `readUntil` is required) Length of the
  buffer. Can be a number, string or a function. Use a number for statically
  sized buffers, a string to reference another variable and a function to do some
  calculation.
- `readUntil` - (either `length` or `readUntil` is required) If `"eof"`, then
  this parser will read till it reaches the end of the `Buffer`/`Uint8Array`
  object. If it is a function, this parser will read the buffer until the
  function returns `true`.

```javascript
const zlib = require("zlib");
// A parser to run on the data returned by the wrapper
const textParser = Parser.start()
  .string("text", {
    zeroTerminated: true,
  });

const mainParser = Parser.start()
  // Read length of the data to wrap
  .uint32le("length")
  // Read wrapped data
  .wrapped("wrappedData", {
    // Indicate how much data to read, like buffer()
    length: "length",
    // Define function to pre-process the data buffer
    wrapper: function (buffer) {
      // E.g. decompress data and return it for further parsing
      return zlib.inflateRawSync(buffer);
    },
    // The parser to run on the decompressed data
    type: textParser,
  });

mainParser.parse(buffer);
```

### sizeOf()
Returns how many bytes this parser consumes. If the size of the parser cannot
be statically determined, a `NaN` is returned.

### compile()
Compile this parser on-the-fly and cache its result. Usually, there is no need
to call this method directly, since it's called when `parse(buffer)` is
executed for the first time.

### getCode()
Dynamically generates the code for this parser and returns it as a string.
Useful for debugging the generated code.

### Common options
These options can be used in all parsers.

- `formatter` - Function that transforms the parsed value into a more desired
  form.
    ```javascript
    const parser = new Parser().array("ipv4", {
      type: uint8,
      length: "4",
      formatter: function(arr) {
        return arr.join(".");
      }
    });
    ```

- `assert` - Do assertion on the parsed result (useful for checking magic
  numbers and so on). If `assert` is a `string` or `number`, the actual parsed
  result will be compared with it with `===` (strict equality check), and an
  exception is thrown if they mismatch. On the other hand, if `assert` is a
  function, that function is executed with one argument (the parsed result)
  and if it returns false, an exception is thrown.

    ```javascript
    // simple maginc number validation
    const ClassFile = Parser.start()
      .endianness("big")
      .uint32("magic", { assert: 0xcafebabe });

    // Doing more complex assertion with a predicate function
    const parser = new Parser()
      .int16le("a")
      .int16le("b")
      .int16le("c", {
        assert: function(x) {
          return this.a + this.b === x;
        }
      });
    ```

### Context variables
You can use some special fields while parsing to traverse your structure.
These context variables will be removed after the parsing process.
Note that this feature is turned off by default for performance reasons, and
you need to call `.useContextVars()` at the top level `Parser` to enable it.
Otherwise, the context variables will not be present.

- `$parent` - This field references the parent structure. This variable will be
  `null` while parsing the root structure.

  ```javascript
  var parser = new Parser()
    .useContextVars()
    .nest("header", {
      type: new Parser().uint32("length"),
    })
    .array("data", {
      type: "int32",
      length: function() {
        return this.$parent.header.length;
      }
    });
  ```

- `$root` - This field references the root structure.

  ```javascript
  const parser = new Parser()
    .useContextVars()
    .nest("header", {
      type: new Parser().uint32("length"),
    })
    .nest("data", {
      type: new Parser()
        .uint32("value")
        .array("data", {
          type: "int32",
          length: function() {
            return this.$root.header.length;
          }
        }),
    });
  ```

- `$index` - This field references the actual index in array parsing. This
  variable will be available only when using the `length` mode for arrays.

  ```javascript
  const parser = new Parser()
    .useContextVars()
    .nest("header", {
      type: new Parser().uint32("length"),
    })
    .nest("data", {
      type: new Parser()
        .uint32("value")
        .array("data", {
          type: new Parser().nest({
            type: new Parser().uint8("_tmp"),
            formatter: function(item) {
              return this.$index % 2 === 0 ? item._tmp : String.fromCharCode(item._tmp);
            }
          }),
          length: "$root.header.length"
        }),
    });
  ```

## Examples

See `example/` for real-world examples.

## Benchmarks

A benchmark script to compare the parsing performance with binparse, structron
and destruct.js is available under `benchmark/`.

## Contributing

Please report issues to the
[issue tracker](https://github.com/keichi/binary-parser/issues) if you have
any difficulties using this module, found a bug, or would like to request a
new feature. Pull requests are welcome.

To contribute code, first clone this repo, then install the dependencies:

```bash
git clone https://github.com/keichi/binary-parser.git
cd binary-parser
npm install
```

If you added a feature or fixed a bug, update the test suite under `test/` and
then run it like this:

```bash
npm run test
```

Make sure all the tests pass before submitting a pull request.
