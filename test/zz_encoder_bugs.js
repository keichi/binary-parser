var assert = require("assert");
var Parser = require("../dist/binary_parser").Parser;

describe("Specific bugs testing", function() {
  describe("Array encoder with readUntil", function() {
    it("should limit to array length even if readUntil is never true", function() {
      var parser = Parser.start()
        .uint16("len")
        .array("payloads", {
          type: new Parser().uint8("cmd").array("params", {
            type: new Parser().uint8("param"),
            readUntil: function(item, buffer) {
              return buffer.length == 2; // Stop when 2 bytes left in parsed buffer
            }
          }),
          lengthInBytes: function() {
            return this.len - 4;
          }
        })
        .uint16("crc");

      var buffer = Buffer.from("0008AAB1B2B3FFFF", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177
              },
              {
                param: 178
              },
              {
                param: 179
              }
            ]
          }
        ],
        crc: 65535
      });

      var encoded;
      // Although readUntil is never true here, the encoding will be good
      assert.doesNotThrow(function() {
        encoded = parser.encode(decoded);
      });
      assert.deepEqual(encoded, buffer);
    });

    it("is not the reverse of parsing when readUntil gives false information", function() {
      var parser = Parser.start()
        .uint16("len")
        .array("payloads", {
          type: new Parser().uint8("cmd").array("params", {
            type: new Parser().uint8("param"),
            readUntil: function(item, buffer) {
              return buffer.length <= 2; // Stop when 2 bytes left in buffer
            }
          }),
          lengthInBytes: function() {
            return this.len - 4;
          }
        })
        .uint16("crc");

      var buffer = Buffer.from("0008AAB1B2B3FFFF", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177
              },
              {
                param: 178
              },
              {
                param: 179
              }
            ]
          }
        ],
        crc: 0xffff
      });

      var encoded = parser.encode(decoded);
      // Missing parms 178 and 179 as readUntil will be true at first run
      assert.deepEqual(encoded, Buffer.from("0008AAB1FFFF", "hex"));
    });

    it("should ignore readUntil when encodeUntil is provided", function() {
      var parser = Parser.start()
        .uint16("len")
        .array("payloads", {
          type: new Parser().uint8("cmd").array("params", {
            type: new Parser().uint8("param"),
            readUntil: function(item, buffer) {
              return buffer.length == 2; // Stop when 2 bytes left in buffer
            },
            encodeUntil: function(item, obj) {
              return item.param === 178; // Stop encoding when value 178 is reached
            }
          }),
          lengthInBytes: function() {
            return this.len - 4;
          }
        })
        .uint16("crc");

      var buffer = Buffer.from("0008AAB1B2B3FFFF", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        len: 8,
        payloads: [
          {
            cmd: 170,
            params: [
              {
                param: 177
              },
              {
                param: 178
              },
              {
                param: 179
              }
            ]
          }
        ],
        crc: 0xffff
      });

      var encoded = parser.encode(decoded);
      // Missing parms 179 as encodeUntil stops at 178
      assert.deepEqual(encoded, Buffer.from("0008AAB1B2FFFF", "hex"));
    });

    it("should accept readUntil=eof and no encodeUntil provided", function() {
      var parser = Parser.start().array("arr", {
        type: "uint8",
        readUntil: "eof" // Read until end of buffer
      });

      var buffer = Buffer.from("01020304050607", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: [1, 2, 3, 4, 5, 6, 7]
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from("01020304050607", "hex"));
    });

    it("should accept empty array to encode", function() {
      var parser = Parser.start().array("arr", {
        type: "uint8",
        readUntil: "eof" // Read until end of buffer
      });

      var buffer = Buffer.from("", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: []
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from("", "hex"));
    });

    it("should accept empty array to encode and encodeUntil function", function() {
      var parser = Parser.start().array("arr", {
        type: "uint8",
        readUntil: "eof", // Read until end of buffer
        encodeUntil: function(item, obj) {
          return false; // Never stop on content value
        }
      });

      var buffer = Buffer.from("", "hex");
      var decoded = parser.parse(buffer);

      assert.deepEqual(decoded, {
        arr: []
      });

      var encoded = parser.encode(decoded);
      assert.deepEqual(encoded, Buffer.from("", "hex"));
    });

    it("should accept undefined or null array", function() {
      var parser = Parser.start().array("arr", {
        type: "uint8",
        readUntil: "eof" // Read until end of buffer
      });

      var buffer = Buffer.from("", "hex");
      var decoded = parser.parse(buffer);

      // Decode an empty buffer as an empty array
      assert.deepEqual(decoded, {
        arr: []
      });

      // Encode undefined, null or empty array as an empty buffer
      [{}, { arr: undefined }, { arr: null }, { arr: [] }].forEach(data => {
        let encoded = parser.encode(data);
        assert.deepEqual(encoded, Buffer.from("", "hex"));
      });
    });
  });
});
