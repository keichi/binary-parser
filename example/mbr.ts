import { readFile } from "fs";
import { join } from "path";
import { inspect } from "util";

import { Parser } from "../lib/binary_parser.ts";

const chs = new Parser()
  .uint8("head")
  .bit2("cylinderHigh")
  .bit6("sector")
  .uint8("cylinder");

function mergeCylinder(val: any) {
  val.cylinder |= val.cylinderHigh << 8;
  delete val.cylinderHigh;
  return val;
}

const partitionTable = new Parser()
  .uint8("bootFlag")
  .nest("startCHS", { type: chs, formatter: mergeCylinder })
  .uint8("type")
  .nest("endCHS", { type: chs, formatter: mergeCylinder })
  .uint32le("startLBA")
  .uint32le("sectorCount");

const mbrParser = new Parser()
  .seek(446)
  .array("partitionTables", {
    type: partitionTable,
    length: 4,
  })
  .int16be("signature", {
    assert: 0x55aa,
  });

readFile(join(import.meta.dirname, "raspbian.img"), (_, data) => {
  console.log(inspect(mbrParser.parse(data), { depth: null, colors: true }));
});
