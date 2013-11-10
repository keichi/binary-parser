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
        assert: 'BM'
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

require('fs').readFile('test.bmp', function(err, data) {
    console.log(bmpFile.parse(data));
});
