var Parser = require('../lib/binary_parser.js').Parser;

// C structure BITMAPFILEHEADER
// typedef struct tagBITMAPFILEHEADER {
//   WORD  bfType;
//   DWORD bfSize;
//   WORD  bfReserved1;
//   WORD  bfReserved2;
//   DWORD bfOffBits;
// } BITMAPFILEHEADER, *PBITMAPFILEHEADER;
var bmpFileHeader = new Parser()
    .endianess('little')
    .string('type', {
        length: 2,
        assert: function(s) {return s === 'BM';}
    })
    .uint32('size')
    .uint16('reserved1')
    .uint16('reserved2')
    .uint32('offBits');

// C structure BITMAPINFOHEADER definition
// typedef struct tagBITMAPINFOHEADER {
//     DWORD  biSize;
//     LONG   biWidth;
//     LONG   biHeight;
//     WORD   biPlanes;
//     WORD   biBitCount;
//     DWORD  biCompression;
//     DWORD  biSizeImage;
//     LONG   biXPelsPerMeter;
//     LONG   biYPelsPerMeter;
//     DWORD  biClrUsed;
//     DWORD  biClrImportant;
// } BITMAPINFOHEADER;
var bmpInfoHeader = new Parser()
    .endianess('little')
    .uint32('size')
    .int32('width')
    .int32('height')
    .uint16('planes')
    .uint16('bitCount')
    .uint32('compression')
    .uint32('sizeImage')
    .int32('xPelsPerMeter')
    .int32('yPelsPerMeter')
    .uint32('clrUsed')
    .uint32('clrImportant');

var bmpFile = new Parser()
    .nest('fileHeader', {
        type: bmpFileHeader
    })
    .nest('infoHeader', {
        type: bmpInfoHeader
    });

describe('BMP file parser', function() {
    it('should parse bmp file header', function() {
        require('fs').readFile('test/test.bmp', function(err, data) {
            require('assert').deepEqual(bmpFile.parse(data), {
                fileHeader: {
                    type: 'BM',
                    size: 46182,
                    reserved1: 0,
                    reserved2: 0,
                    offBits: 54
                },
                infoHeader: {
                    size: 40,
                    width: 124,
                    height: 124,
                    planes: 1,
                    bitCount: 24,
                    compression: 0,
                    sizeImage: 0,
                    xPelsPerMeter: 0,
                    yPelsPerMeter: 0,
                    clrUsed: 0,
                    clrImportant: 0
                }
            });
        });
    });
});
