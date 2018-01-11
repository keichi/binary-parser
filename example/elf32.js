var Parser = require("../lib/binary_parser").Parser;

var ELF32ProgramHeader = new Parser()
  .endianess("little")
  .uint32("type")
  .uint32("offset")
  .uint32("vaddr")
  .uint32("paddr")
  .uint32("filesz")
  .uint32("memsz")
  .uint32("flags")
  .uint32("align");

var ELF32ProgramHeaderTable = new Parser().array("items", {
  type: ELF32ProgramHeader,
  length: function(vars) {
    return vars.phnum;
  }
});

var ELF32SectionHeader = new Parser()
  .endianess("little")
  .uint32("name")
  .uint32("type")
  .uint32("flags")
  .uint32("address")
  .uint32("offset")
  .uint32("size")
  .uint32("link")
  .uint32("info")
  .uint32("addralign")
  .uint32("entsize");

var ELF32SectionHeaderTable = new Parser().array("items", {
  type: ELF32SectionHeader,
  length: function(vars) {
    return vars.shnum;
  }
});

var ELF32SectionHeaderStringTable = new Parser().skip(1).array("items", {
  type: new Parser().string("name", { zeroTerminated: true }),
  lengthInBytes: function(vars) {
    var shstr = vars.section_headers.items[vars.shstrndx];
    return shstr.size - 1;
  }
});

var ELF32Header = new Parser()
  .endianess("little")
  .buffer("ident", { length: 16 })
  .uint16("type")
  .uint16("machine")
  .uint32("version")
  .uint32("entry")
  .uint32("phoff")
  .uint32("shoff")
  .uint32("flags")
  .uint16("ehsize")
  .uint16("phentsize")
  .uint16("phnum")
  .uint16("shentsize")
  .uint16("shnum")
  .uint16("shstrndx")
  .pointer("program_headers", {
    type: ELF32ProgramHeaderTable,
    offset: "phoff"
  })
  .pointer("section_headers", {
    type: ELF32SectionHeaderTable,
    offset: "shoff"
  })
  .pointer("strings", {
    type: ELF32SectionHeaderStringTable,
    offset: function() {
      var shstr = vars.section_headers.items[vars.shstrndx];
      return shstr.offset;
    }
  });

require("fs").readFile("hello", function(err, data) {
  var result = ELF32Header.parse(data);
  console.log(require("util").inspect(result, { depth: null }));
});
