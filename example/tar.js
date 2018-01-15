var Parser = require("../lib/binary_parser.js").Parser;
var fs = require("fs");

var oct2int = function(s) {
  return parseInt(s, 8);
};

var tarHeader = new Parser()
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
  .skip(12);

var tarItem = new Parser()
  .nest({
    type: tarHeader
  })
  .skip(function() {
    return Math.ceil(this.size / 512) * 512;
  });

var tarArchive = new Parser().array("files", {
  type: tarItem,
  readUntil: "eof"
});

fs.readFile("test.tar", function(err, data) {
  console.dir(tarArchive.parse(data), { depth: null, colors: true });
});
