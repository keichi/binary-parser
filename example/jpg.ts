import { readFile } from "fs";
import { join } from "path";
import { inspect } from "util";

import { Parser } from "../lib/binary_parser";

const SOI = Parser.start();

const EOI = Parser.start();

const APP0 = Parser.start()
  .endianness("big")
  .uint16("length")
  .string("id", {
    encoding: "ascii",
    zeroTerminated: true,
    assert: "JFIF",
  })
  .uint16("version")
  .uint8("unit")
  .uint16("xDensity")
  .uint16("yDensity")
  .uint8("thumbWidth")
  .uint8("thumbHeight")
  .array("thumbData", {
    type: "uint8",
    length: function (this: any) {
      return this.Xt * this.Yt * 3;
    },
  });

// @ts-ignore
const COM = Parser.start()
  .endianness("big")
  .uint16("length")
  .string("comment", {
    encoding: "ascii",
    length: function (this: any) {
      return this.length - 2;
    },
  });

const SOS = Parser.start()
  .endianness("big")
  .uint16("length")
  .uint8("componentCount")
  .array("components", {
    type: Parser.start().uint8("id").uint8("dht"),
    length: "componentCount",
  })
  .uint8("spectrumStart")
  .uint8("spectrumEnd")
  .uint8("spectrumSelect");

const DQT = Parser.start()
  .endianness("big")
  .uint16("length")
  .array("tables", {
    type: Parser.start().uint8("precisionAndTableId").array("table", {
      type: "uint8",
      length: 64,
    }),
    length: function (this: any) {
      return (this.length - 2) / 65;
    },
  });

const SOF0 = Parser.start()
  .endianness("big")
  .uint16("length")
  .uint8("precision")
  .uint16("width")
  .uint16("height")
  .uint8("componentCount")
  .array("components", {
    type: Parser.start()
      .uint8("id")
      .uint8("samplingFactor")
      .uint8("quantizationTableId"),
    length: "componentCount",
  });

const Ignore = Parser.start()
  .endianness("big")
  .uint16("length")
  .seek(function (this: any) {
    return this.length - 2;
  });

const Segment = Parser.start()
  .endianness("big")
  .uint16("marker")
  .choice("segment", {
    tag: "marker",
    choices: {
      0xffd8: SOI,
      0xffd9: EOI,
      0xffe0: APP0,
      0xffda: SOS,
      0xffdb: DQT,
      0xffc0: SOF0,
    },
    defaultChoice: Ignore,
  });

const JPEG = Parser.start().array("segments", {
  type: Segment,
  readUntil: "eof",
});

readFile(join(__dirname, "test.jpg"), (_, data) => {
  console.log(inspect(JPEG.parse(data), { depth: null, colors: true }));
});
