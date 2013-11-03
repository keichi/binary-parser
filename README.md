# Bang-parser -- blazing-fast binary parser

[![Build Status](https://travis-ci.org/Keichi/bang-parser.png?branch=master)](https://travis-ci.org/Keichi/bang-parser)

Bang-parser is a simple and fast binary parser for [node](http://nodejs.org). It includes various parser
builders for parsing complex binary file formats or network protocols.
Parser code is dynamically generated and compiled on-the-fly, 
so it's fast enough for practical use.

Bang-parser's features are inspired by [BinData](https://github.com/dmendel/bindata)
Ruby gem and its syntax by [binary](https://github.com/substack/node-binary) npm module.

## Installation
In your project's directory,

`$ npm install bang-parser`

## Quick Start
First create a empty Parser object with `new Parser()`, then chain methods to build the desired parser.
Calling `Parser.parse` with an `Buffer` object returns the result object.

```javascript
var keyValue = new Parser()
    .int32le('key')
    .int16le('length')
    .string('message', {length: 'length'});

var parser = new Parser()
    .uint16le('count')
    .array('kvs', {
        type: keyValueParser,
        length: 'count'
    })

parser.parse(buffer);
    
```

##API

### new Parser()
Constructs a Parser object. Returned object represents a parser which parses nothing.

### parse(buffer)
Parse `buffer` with this parser and return the resulting object.
When `parse` is called for the first time, parser code is compiled on-the-fly
and internally cached.

### [u]int{8, 16, 32}{le, be}(name [,options])
Parse bytes as an integer and store it in a variable named `name`. `name` should consist
only of alphanumeric characters and start with an alphabet.
Number of bits can be chosen from 8, 16 and 32.
Byte-ordering can be either `l` for litte endian or `b` for big endian.
With no prefix, it parses as a signed number, with `u` prefixed as an unsiged number. 

```javascript
var parser = new Parser()
	// Signed 32-bit integer (little endian)
    .int32le('a')
    // Unsigned 8-bit integer (little/big endian)
    .uint8('b')
    // Signed 16-bit integer (big endian)
    .int16be('c')
```

### {float, double}{le, be}(name [,options])
Parse bytes as an floating-point value and store it in a variable
named `name`. `name` should consist only of alphanumeric characters and start 
with an alphabet.

### string(name [,options])
Parse bytes as a string. `name` should consist only of alpha numeric characters and start
with an alphabet. `options` is an object; following options are available: 

- `encoding` - (Optional) Specify which encoding to use. `'utf8'`, `'ascii'`, `'hex'` and else
	are valid. See more in [`Buffer.toString`](http://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end)'s doumentation.
- `length `- (Required) Length of the string. Can be a number, string or a function.
	Use number for statically sized arrays, string to reference another variable and
	function to do some calculation.
- `zeroTerminated` - (Optional) If true, then this parser reads until it reaches zero.

### array(name [,options])
Parse bytes as an array. `options` is an object; following options are available: 

- `type` - (Required) Type of the array element. Can be a string or an user defined Parser object.
    If it's a string, you have to choose from [u]int{8, 16, 32}{le, be}.
- `length` - (either `length` or `readUntil` is required) Length of the array. Can be a number, string or a function.
	Use number for statically sized arrays.
- `readUntil` - (either `length` or `readUntil` is required) If `'eof'`, then this parser
	will read till it reaches end of the `Buffer` object.

```javascript
var parser = new Parser()
	// Statically sized array
	.array('data', {
		type: 'int32',
		length: 8
	})
	
	// Dynamically sized array (reference another variable)
	.uint8('dataLength')
	.array('data2', {
		type: 'int32',
		length: 'dataLength'
	})
	
	// Dynamically sized array (with some calculation)
	.array('data3', {
		type: 'int32',
		length: function() { return this.dataLength - 1; } // other fields are available through this
	});
	
	// Use user defined parser object
	.array('data4', {
		type: userDefinedParser,
		length: 'dataLength'
	})
```

### choice(name [,options])
Choose one parser from several choices accrding to a field value.
Combining `choice` with `array` is useful for parsing a typical
[Type-Length-Value](http://en.wikipedia.org/wiki/Type-length-value) styled format.

- `tag` - (Required) The value used to determine which parser to use from the `choices`
	Can be a string pointing to another field or a function. 
- `choices` - (Required) An object. Key is an integer, value is the parser which is executed
	when `tag` equals to the key value.
- `defaultChoice` - (Optional) If tag value doesn't exist in the `choices` use this parser.

```javascript
var parser1 = ...;
var parser2 = ...;
var parser3 = ...;

var parser = new Parser()
	.uint8('tagValue')
	.choice('data', {
		tag: 'tagValue',
		choices: [
			1: parser1, // When tagValue == 1, execute parser1
			4: parser2, // When tagValue == 4, execute parser2
			5: parser3  // When tagValue == 5, execute parser3
		]
	});
```

### skip(length)
Skip parsing for `length` bytes.

### endianess(endianess)
Define what endianess to use in this parser. `endianess` can be either `'little'` or `'big'`.
After this method is called, you can omit endianess postfix from primitive parsers.

```javascript
var parser = new Parser()
	// usually you have to specify endianess explicitly
	.uint16be('a')
	.endianess('big')
	// you can omit le/be after endianess is called
	.uint16('b')
	.int32('c')
```

### compile()
Compile this parser on-the-fly and chache its result. Usually, there is no need to
call this method directly, since it's called when `parse(buffer)` is executed
for the first time.

### Assertion
You can do assertions during the parsing. (Useful for checking magic numbers and so on)
In the `options` hash, define `assert` with an assertion function.
This assertion function should take one argument, which is the parsed result, and return
`true` if assertion successes or `false` when assertion fails.

```javascript
var ClassFile =
	Parser.start()
    .endianess('big')
    .uint32('magic', {assert: function(x) {return x === 0xcafebabe; }})
```

## License
The MIT License (MIT)

Copyright (c) 2013 Keichi Takahashi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
