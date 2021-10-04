import { Parser } from "../lib/binary_parser";
import { readFile } from "fs";
import { inspect } from "util";

const ConstantClassInfo = Parser.start().uint16be("name_index");

const ConstantFieldrefInfo = Parser.start()
  .uint16be("class_index")
  .uint16be("name_and_type_index");

const ConstantMethodrefInfo = Parser.start()
  .uint16be("class_index")
  .uint16be("name_and_type_index");

const ConstantInterfaceMethodrefInfo = Parser.start()
  .uint16be("class_index")
  .uint16be("name_and_type_index");

const ConstantStringInfo = Parser.start().uint16be("string_index");

const ConstantIntegerInfo = Parser.start().uint32be("bytes");

const ConstantFloatInfo = Parser.start().uint32be("bytes");

const ConstantLongInfo = Parser.start()
  .uint32be("high_bytes")
  .uint32be("low_bytes");

const ConstantDoubleInfo = Parser.start()
  .uint32be("high_bytes")
  .uint32be("low_bytes");

const ConstantNameAndTypeInfo = Parser.start()
  .uint16be("name_index")
  .uint16be("descriptor_index");

const ConstantUtf8Info = Parser.start()
  .uint16be("len")
  .string("bytes", { length: "len" });

// @ts-ignore
const ConstantMethodHandleInfo = Parser.start()
  .uint8("reference_kind")
  .uint16be("reference_index");

const ConstantMethodTypeInfo = Parser.start().uint16be("descriptor_index");

const ConstantInvokeDynamicInfo = Parser.start()
  .uint16be("bootstrap_method_attr_index")
  .uint16be("name_and_type_index");

const CpInfo = Parser.start()
  .uint8("tag")
  .choice("info", {
    tag: "tag",
    choices: {
      7: ConstantClassInfo,
      9: ConstantFieldrefInfo,
      10: ConstantMethodrefInfo,
      11: ConstantInterfaceMethodrefInfo,
      8: ConstantStringInfo,
      3: ConstantIntegerInfo,
      4: ConstantFloatInfo,
      5: ConstantLongInfo,
      6: ConstantDoubleInfo,
      12: ConstantNameAndTypeInfo,
      1: ConstantUtf8Info,
      16: ConstantMethodTypeInfo,
      18: ConstantInvokeDynamicInfo,
    },
  });

const ClassFile = Parser.start()
  .endianess("big")
  .uint32("magic", { assert: 0xcafebabe })
  .uint16("minor_version")
  .uint16("major_version")
  .uint16("constant_pool_count")
  .array("cp_info", {
    type: CpInfo,
    length: function (this: any) {
      return this.constant_pool_count - 1;
    },
  });

readFile("Hello.class", function (_, data) {
  console.log(inspect(ClassFile.parse(data), { depth: null, colors: true }));
});
