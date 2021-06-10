var Parser = require('../dist/binary_parser').Parser;
var fs = require('fs');

var chs = new Parser({
  formatter: function (val) {
    val.cylinder |= val.cylinderHigh << 8;
    return val;
  },
})
  .uint8('head')
  .bit2('cylinderHigh')
  .bit6('sector')
  .uint8('cylinder');

var partitionTable = new Parser()
  .uint8('bootFlag')
  .nest('startCHS', {
    type: chs,
    formatter: function (val) {
      delete val.cylinderHigh;
      return val;
    },
  })
  .uint8('type')
  .nest('endCHS', {
    type: chs,
    formatter: function (val) {
      delete val.cylinderHigh;
      return val;
    },
  })
  .uint32le('startLBA')
  .uint32le('endLBA');

var mbrParser = new Parser()
  .seek(446)
  .array('partitionTables', {
    type: partitionTable,
    length: 4,
  })
  .int16be('signature', {
    assert: 0x55aa,
  });

fs.readFile('raspbian.img', function (err, data) {
  console.dir(mbrParser.parse(data), { depth: null, colors: true });
});
