import { readFile } from "fs";
import { join } from "path";
import { inspect } from "util";

import { Parser } from "../lib/binary_parser";

const chs = new Parser()
  .uint8("head")
  .bit2("cylinderHigh")
  .bit6("sector")
  .uint8("cylinder");

const partitionTable = new Parser()
  .uint8("bootFlag")
  .nest("startCHS", {
    type: chs,
    formatter: function (val) {
      delete val.cylinderHigh;
      return val;
    },
  })
  .uint8("type")
  .nest("endCHS", {
    type: chs,
    formatter: function (val) {
      val.cylinder |= val.cylinderHigh << 8;
      delete val.cylinderHigh;
      return val;
    },
  })
  .uint32le("startLBA")
  .uint32le("endLBA");

const mbrParser = new Parser()
  .seek(446)
  .array("partitionTables", {
    type: partitionTable,
    length: 4,
  })
  .int16be("signature", {
    assert: 0x55aa,
  });

readFile(join(__dirname, "raspbian.img"), (_, data) => {
  console.log(inspect(mbrParser.parse(data), { depth: null, colors: true }));
});
