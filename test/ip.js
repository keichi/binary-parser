var Parser = require('../lib/binary_parser').Parser;
var assert = require('assert');

describe('IP packet parser', function() {
    it('should IP packet', function() {
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
            .array('src', {
                type: 'uint8',
                length: 4
            })
            .array('dst', {
                type: 'uint8',
                length: 4
            });

        var buf = new Buffer('450002c5939900002c06ef98adc24f6c850186d1', 'hex');

        assert.deepEqual(ipHeader.parse(buf), {
            version: 4,
            headerLength: 5,
            tos: 0,
            packetLength: 709,
            id: 37785,
            offset: 0,
            fragOffset: 0,
            ttl: 44,
            protocol: 6,
            checksum: 61336,
            src: [ 173, 194, 79, 108 ],
            dst: [ 133, 1, 134, 209 ]
        });
    });
});
