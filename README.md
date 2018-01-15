# Binary-parser

[![Circle CI](https://circleci.com/gh/keichi/binary-parser.svg?style=svg)](https://circleci.com/gh/keichi/binary-parser)

Binary-parser is a binary parser builder for [node](http://nodejs.org) that
enables you to write efficient parsers in a simple and declarative manner.

It supports all common data types required to analyze a structured binary
data. Binary-parser dynamically generates and compiles the parser code
on-the-fly, which runs as fast as a hand-written parser (which takes much more
time and effort to write). Supported data types are:

- Integers (supports 8, 16, 32 bit signed- and unsigned integers)
- Floating point numbers (supports 32 and 64 bit floating point values)
- Bit fields (supports bit fields with length from 1 to 32 bits)
- Strings (supports various encodings, fixed-length and variable-length, zero
  terminated string)
- Arrays (supports user-defined element type, fixed-length and variable-length)
- Choices
- User defined types

This library's features are inspired by [BinData](https://github.com/dmendel/bindata)
, its syntax by [binary](https://github.com/substack/node-binary).

## Installation
Binary-parser can be installed with [npm](https://npmjs.org/):

```shell
$ npm install binary-parser
```

## Quick Start
1. Create an empty Parser object with `new Parser()`.
2. Chain builder methods to build the desired parser. (See
   [API](https://github.com/Keichi/binary-parser#api) for detailed document of
   each methods)
3. Call `Parser.prototype.parse` with an `Buffer` object passed as argument.
4. Parsed result will be returned as an object.

```javascript
// Module import
var Parser = require("binary-parser").Parser;

// Build an IP packet header Parser
var ipHeader = new Parser()
  .endianess("big")
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
var buf = Buffer.from("450002c5939900002c06ef98adc24f6c850186d1", "hex");

// Parse buffer and show result
console.log(ipHeader.parse(buf));
```

## API

### new Parser()
Constructs a Parser object. Returned object represents a parser which parses
nothing.

### parse(buffer)
Parse a `Buffer` object `buffer` with this parser and return the resulting
object. When `parse(buffer)` is called for the first time, parser code is
compiled on-the-fly and internally cached.

### create(constructorFunction)
Set the constructor function that should be called to create the object
returned from the `parse` method.

### [u]int{8, 16, 32}{le, be}(name[, options])
Parse bytes as an integer and store it in a variable named `name`. `name`
should consist only of alphanumeric characters and start with an alphabet.
Number of bits can be chosen from 8, 16 and 32. Byte-ordering can be either
`l` for little endian or `b` for big endian. With no prefix, it parses as a
signed number, with `u` prefixed as an unsigned number.

```javascript
var parser = new Parser()
  // Signed 32-bit integer (little endian)
  .int32le("a")
  // Unsigned 8-bit integer
  .uint8("b")
  // Signed 16-bit integer (big endian)
  .int16be("c");
```

### bit\[1-32\](name[, options])
Parse bytes as a bit field and store it in variable `name`. There are 32
methods from `bit1` to `bit32` each corresponding to 1-bit-length to
32-bits-length bit field.

### {float, double}{le, be}(name[, options])
Parse bytes as an floating-point value and store it in a variable named
`name`. `name` should consist only of alphanumeric characters and start with
an alphabet.

```javascript
var parser = new Parser()
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
  `"utf8"`, `"ascii"`, `"hex"` and else are valid. See
  [`Buffer.toString`](http://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end)
  for more info.
- `length ` - (Optional) Length of the string. Can be a number, string or a
  function. Use number for statically sized arrays, string to reference
  another variable and function to do some calculation.
- `zeroTerminated` - (Optional, defaults to `false`) If true, then this parser
  reads until it reaches zero.
- `greedy` - (Optional, defaults to `false`) If true, then this parser reads
  until it reaches the end of the buffer. Will consume zero-bytes.
- `stripNull` - (Optional, must be used with `length`) If true, then strip
  null characters from end of the string

### buffer(name[, options])
Parse bytes as a buffer. `name` should consist only of alpha numeric
characters and start with an alphabet. `options` is an object which can have
the following keys:

- `clone` - (Optional, defaults to `false`) By default,
  `buffer(name [,options])` returns a new buffer which references the same
  memory as the parser input, but offset and cropped by a certain range. If
  this option is true, input buffer will be cloned and a new buffer referncing
  another memory is returned.
- `length ` - (either `length` or `readUntil` is required) Length of the
  buffer. Can be a number, string or a function. Use number for statically
  sized buffers, string to reference another variable and function to do some
  calculation.
- `readUntil` - (either `length` or `readUntil` is required) If `"eof"`, then
  this parser will read till it reaches end of the `Buffer` object.

### array(name, options)
Parse bytes as an array. `options` is an object which can have the following
keys:

- `type` - (Required) Type of the array element. Can be a string or an user
  defined Parser object. If it's a string, you have to choose from [u]int{8,
  16, 32}{le, be}.
- `length` - (either `length`, `lengthInBytes`, or `readUntil` is required)
  Length of the array. Can be a number, string or a function. Use number for
  statically sized arrays.
- `lengthInBytes` - (either `length`, `lengthInBytes`, or `readUntil` is
  required) Length of the array expressed in bytes. Can be a number, string or
  a function. Use number for statically sized arrays.
- `readUntil` - (either `length`, `lengthInBytes`, or `readUntil` is required)
  If `"eof"`, then this parser reads until the end of `Buffer` object. If
  function it reads until the function returns true.

```javascript
var parser = new Parser()
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
    } // other fields are available through this
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
    } // other fields are available through this
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
  `choices` Can be a string pointing to another field or a function.
- `choices` - (Required) An object which key is an integer and value is the
  parser which is executed when `tag` equals the key value.
- `defaultChoice` - (Optional) In case of the tag value doesn't match any of
  `choices`, this parser is used.

```javascript
var parser1 = ...;
var parser2 = ...;
var parser3 = ...;

var parser = new Parser().uint8("tagValue").choice("data", {
  tag: "tagValue",
  choices: {
    1: parser1, // When tagValue == 1, execute parser1
    4: parser2, // When tagValue == 4, execute parser2
    5: parser3 // When tagValue == 5, execute parser3
  }
});
```

Combining `choice` with `array` is an idiom to parse
[TLV](http://en.wikipedia.org/wiki/Type-length-value)-based formats.

### nest([name,] options)
Execute an inner parser and store its result to key `name`. If `name` is null
or omitted, the result of the inner parser is directly embedded into the
current object. `options` is an object which can have the following keys:

- `type` - (Required) A `Parser` object.

### skip(length)
Skip parsing for `length` bytes.

### endianess(endianess)
Define what endianess to use in this parser. `endianess` can be either
`"little"` or `"big"`. The default endianess of `Parser` is set to big-endian.

```javascript
var parser = new Parser()
  .endianess("little")
  // You can specify endianess explicitly
  .uint16be("a")
  .uint32le("a")
  // Or you can omit endianess (in this case, little-endian is used)
  .uint16("b")
  .int32("c");
```

### namely(alias)
Set an alias to this parser, so there will be an opportunity to refer to it by
name in methods like `.array`, `.nest` and `.choice`, instead of requirement
to have an instance of it.

Especially, the parser may reference itself:

```javascript
var stop = new Parser();

var parser = new Parser()
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

var buffer = Buffer.from([
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

NB: This style could lead to circular references and infinite recursion, to
avoid this, ensure that every possible path has its end. Also, this recursion
is not tail-optimized, so could lead to memory leaks when it goes too deep.

An example of referencing other patches:

```javascript
// the line below registers the name 'self', so we will be able to use it in
// `twoCells` as a reference
var parser = Parser.start().namely("self");

var stop = Parser.start().namely("stop");

var twoCells = Parser.start()
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

var buffer = Buffer.from([2, /* left */ 1, 1, 0, /* right */ 0]);

parser.parse(buffer);
```

### compile()
Compile this parser on-the-fly and cache its result. Usually, there is no need
to call this method directly, since it's called when `parse(buffer)` is
executed for the first time.

### getCode()
Dynamically generates the code for this parser and returns it as a string.
Usually used for debugging.

### Common options
These are common options that can be specified in all parsers.

- `formatter` - Function that transforms the parsed value into a more desired
  form.
    ```javascript
    var parser = new Parser().array("ipv4", {
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
  function, that function is executed with one argument (parsed result) and if
  it returns false, an exception is thrown.

    ```javascript
    // simple maginc number validation
    var ClassFile = Parser.start()
      .endianess("big")
      .uint32("magic", { assert: 0xcafebabe });

    // Doing more complex assertion with a predicate function
    var parser = new Parser()
      .int16le("a")
      .int16le("b")
      .int16le("c", {
        assert: function(x) {
          return this.a + this.b === x;
        }
      });
    ```

## Examples
See `example` for more complex examples.

## Support
Please report issues to the
[issue tracker](https://github.com/Keichi/binary-parser/issues) if you have
any difficulties using this module, found a bug, or request a new feature.

Pull requests with fixes and improvements are welcomed!
