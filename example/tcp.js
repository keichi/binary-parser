var Parser = require('../lib/binary_parser').Parser;

var tcpHeader = new Parser()
    .endianess('big')
    .uint16('srcPort')
    .uint16('dstPort')
    .uint32('seq')
    .uint32('ack')
    .bit4('dataOffset')
    .bit6('reserved')
    .nest('flags', {
        type: new Parser()
            .bit1('urg')
            .bit1('ack')
            .bit1('psh')
            .bit1('rst')
            .bit1('syn')
            .bit1('fin')
    })
    .uint16('windowSize')
    .uint16('checksum')
    .uint16('urgentPointer');

var buf = new Buffer('e8a203e108e177e13d20756b801829d3004100000101080a2ea486ba793310bc', 'hex');

console.log(tcpHeader.parse(buf));
