var Parser = require('../lib/binary_parser').Parser;

var ipHeader = new Parser()
    .endianess('big')
    .bit4('version')
    .bit4('headerLength')
    .uint8('tos')
    .uint16('packetLength')
    .uint16('id')
    .bit3('offset')
    .bit13('fragOffset')
    .uint8('ttl')
    .uint8('protocol')
    .uint16('checksum')
    .uint32('src')
    .uint32('dst');

console.log(ipHeader.getCode());
