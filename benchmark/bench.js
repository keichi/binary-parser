var binary = require("binary");
var Benchmark = require("benchmark");
var bp = require("binparse").bp;
var Parser = require("../dist/binary_parser").Parser;
var Destruct = require("destruct-js");
const Struct = require("structron");

var suite = new Benchmark.Suite();

// binparse
const PointParser = bp.object("Point", {
  x: bp.lu16,
  y: bp.lu16,
  z: bp.lu16,
});

const PointsParser = bp.object("SimpleObject", {
  length: bp.variable("len", bp.lu32),
  points: bp.array("Points", PointParser, "len"),
});

// binary-parser
const Points = new Parser().uint32le("len").array("points", {
  length: "len",
  type: new Parser().uint16le("x").uint16le("y").uint16le("z"),
});

// destruct-js
const spec = new Destruct.Spec({ mode: Destruct.Mode.LE });
spec
  .field("len", Destruct.UInt32)
  .loop(
    "points",
    (r) => r.len,
    new Destruct.Spec({ mode: Destruct.Mode.LE })
      .field("x", Destruct.UInt16)
      .field("y", Destruct.UInt16)
      .field("z", Destruct.UInt16)
  );

// structron
const PointsStruct = new Struct()
  .addMember(Struct.TYPES.UINT_LE, "len")
  .addArray(
    new Struct()
      .addMember(Struct.TYPES.USHORT_LE, "x")
      .addMember(Struct.TYPES.USHORT_LE, "y")
      .addMember(Struct.TYPES.USHORT_LE, "z"),
    "points",
    0,
    "len"
  );

// Prepare input
var n = 1000;
var buf = Buffer.alloc(4 + n * 2 * 3);

buf.writeUInt32LE(n, 0);
for (var i = 0; i < n; i++) {
  buf.writeUInt16LE(123, i * 6 + 0 + 4);
  buf.writeUInt16LE(456, i * 6 + 2 + 4);
  buf.writeUInt16LE(789, i * 6 + 4 + 4);
}

// Run benchmarks
suite
  .add("hand-written", function () {
    n = buf.readUInt32LE(0);
    const points = [];
    for (var i = 0; i < n; i++) {
      points.push({
        x: buf.readUInt16LE(i * 6 + 0 + 4),
        y: buf.readUInt16LE(i * 6 + 2 + 4),
        z: buf.readUInt16LE(i * 6 + 4 + 4),
      });
    }
  })
  .add("binparse", function () {
    const points = PointsParser.read(buf);
  })
  .add("binary-parser", function () {
    const points = Points.parse(buf);
  })
  .add("destruct-js", function () {
    const points = spec.read(buf);
  })
  .add("structron", function () {
    const points = PointsStruct.read(buf);
  })
  .on("cycle", function (event) {
    console.log(String(event.target));
  })
  .on("complete", function () {
    console.log("Fastest is " + this.filter("fastest").map("name"));
  })
  .run({ async: true });
