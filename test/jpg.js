var Parser = require('../lib/binary_parser').Parser;

var SOI = Parser.start();

var EOI = Parser.start();

var APP0 = Parser.start()
    .endianess('big')
    .uint16('length')
    .string('id', {
        encoding: 'ascii',
        zeroTerminated: true,
        validate: 'JFIF'
    })
    .uint16('version')
    .uint8('unit')
    .uint16('xDensity')
    .uint16('yDensity')
    .uint8('thumbWidth')
    .uint8('thumbHeight')
    .array('thumbData', {
        type: 'uint8',
        length: function() { return this.Xt * this.Yt * 3; }
    });

var COM = Parser.start()
    .endianess('big')
    .uint16('length')
    .string('comment', {
        encoding: 'ascii',
        length: function() { return this.length - 2; }
    });

var SOS = Parser.start()
    .endianess('big')
    .uint16('length')
    .uint8('componentCount')
    .array('components', {
        type: Parser.start()
            .uint8('id')
            .uint8('dht'),
        length: 'componentCount'
    })
    .uint8('spectrumStart')
    .uint8('spectrumEnd')
    .uint8('spectrumSelect');

var DQT = Parser.start()
    .endianess('big')
    .uint16('length')
    .array('tables', {
        type: Parser.start()
            .uint8('precisionAndTableId')
            .array('table', {
                type: 'uint8',
                length: 64
            }),
        length: function() { return (this.length - 2) / 65; }
    });

var SOF0 = Parser.start()
    .endianess('big')
    .uint16('length')
    .uint8('precision')
    .uint16('width')
    .uint16('height')
    .uint8('componentCount')
    .array('components', {
        type: Parser.start()
            .uint8('id')
            .uint8('samplingFactor')
            .uint8('quantizationTableId'),
        length: 'componentCount'
    });

var Ignore = Parser.start()
    .endianess('big')
    .uint16('length')
    .skip(function() { return this.length - 2; });

var Segment = Parser.start()
    .endianess('big')
    .uint16('marker')
    .choice('segment', {
        tag: 'marker',
        choices: {
            0xffd8: SOI,
            0xffd9: EOI,
            0xffe0: APP0,
            0xffda: SOS,
            0xffdb: DQT,
            0xffc0: SOF0
        },
        defaultChoice: Ignore
    });

var JPEG = Parser.start()
    .array('segments', {
        type: Segment,
        readUntil: 'eof'
    });

require('fs').readFile('test.jpg', function(err, data) {
    console.log(require('util').inspect(JPEG.parse(data), {depth: null}));
});
