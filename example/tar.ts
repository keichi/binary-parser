import { Parser } from "../lib/binary_parser";
import { readFile } from "fs";

function oct2int(s: string): number {
  return parseInt(s, 8);
}

const tarHeader = new Parser()
  .string("name", { length: 100, stripNull: true })
  .string("mode", { length: 8, stripNull: true, formatter: oct2int })
  .string("uid", { length: 8, stripNull: true, formatter: oct2int })
  .string("gid", { length: 8, stripNull: true, formatter: oct2int })
  .string("size", { length: 12, stripNull: true, formatter: oct2int })
  .string("mtime", { length: 12, stripNull: true, formatter: oct2int })
  .string("chksum", { length: 8, stripNull: true, formatter: oct2int })
  .string("typeflag", { length: 1, stripNull: true, formatter: oct2int })
  .string("linkname", { length: 100, stripNull: true })
  .string("magic", { length: 6, stripNull: true })
  .string("version", { length: 2, stripNull: true, formatter: oct2int })
  .string("uname", { length: 32, stripNull: true })
  .string("gname", { length: 32, stripNull: true })
  .string("devmajor", { length: 8, stripNull: true, formatter: oct2int })
  .string("devminor", { length: 8, stripNull: true, formatter: oct2int })
  .string("prefix", { length: 155, stripNull: true })
  .seek(12);

const tarItem = new Parser()
  .nest({
    type: tarHeader,
  })
  .seek(function (this: any) {
    return Math.ceil(this.size / 512) * 512;
  });

const tarArchive = new Parser().array("files", {
  type: tarItem,
  readUntil: "eof",
});

console.log(tarArchive.getCode());

readFile("test.tar", function (_, data) {
  console.dir(tarArchive.parse(data), { depth: null, colors: true });
});
