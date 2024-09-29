import { readFile } from "fs";
import { join } from "path";
import { inspect } from "util";

import { Parser } from "../lib/binary_parser";

var ConstantClassInfo = Parser.start().uint16be("name_index");

  var ConstantFieldrefInfo = Parser.start()
    .uint16be("class_index")
    .uint16be("name_and_type_index");

  var ConstantMethodrefInfo = Parser.start()
    .uint16be("class_index")
    .uint16be("name_and_type_index");

  var ConstantInterfaceMethodrefInfo = Parser.start()
    .uint16be("class_index")
    .uint16be("name_and_type_index");

  var ConstantStringInfo = Parser.start().uint16be("string_index");

  var ConstantIntegerInfo = Parser.start().uint32be("bytes");

  var ConstantFloatInfo = Parser.start().uint32be("bytes");

  var ConstantLongInfo = Parser.start()
    .uint32be("high_bytes")
    .uint32be("low_bytes");

  var ConstantDoubleInfo = Parser.start()
    .uint32be("high_bytes")
    .uint32be("low_bytes");

  var ConstantNameAndTypeInfo = Parser.start()
    .uint16be("name_index")
    .uint16be("descriptor_index");

  var ConstantUtf8Info = Parser.start()
    .uint16be("len")
    .string("bytes", { length: "len" });

  // @ts-ignore
  var ConstantMethodHandleInfo = Parser.start()
    .uint8("reference_kind")
    .uint16be("reference_index");

  var ConstantMethodHandleInfo = Parser.start()
    .uint8("reference_kind")
    .uint16be("reference_index");

  var ConstantMethodTypeInfo = Parser.start().uint16be("descriptor_index");

  var ConstantInvokeDynamicInfo = Parser.start()
    .uint16be("bootstrap_method_attr_index")
    .uint16be("name_and_type_index");

  var CpInfo = Parser.start()
    .uint8("tag")
    .choice("info", {
      tag: "tag",
      choices: {
        7: ConstantClassInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.1
        9: ConstantFieldrefInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.2
        10: ConstantMethodrefInfo,
        11: ConstantInterfaceMethodrefInfo,
        8: ConstantStringInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.3
        3: ConstantIntegerInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.4
        4: ConstantFloatInfo,
        5: ConstantLongInfo, //https://docs.oracle.com/javase/specs/jvms/se22/html/jvms-4.html#jvms-4.4.5 //2 byte
        6: ConstantDoubleInfo,
        12: ConstantNameAndTypeInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.6
        1: ConstantUtf8Info, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.7,
        15: ConstantMethodHandleInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.8,
        16: ConstantMethodTypeInfo, //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.9
        18: ConstantInvokeDynamicInfo
      }
    });

  var VerificationTypeInfo = Parser.start()
    .uint8("tag")
    .choice("info", {
      tag: "tag",
      choices: {
        0: Parser.start(), // Top_variable_info
        1: Parser.start(), // Integer_variable_info
        2: Parser.start(), // Float_variable_info
        4: Parser.start(), // Long_variable_info
        3: Parser.start(), // Double_variable_info
        5: Parser.start(), // Null_variable_info
        6: Parser.start(), // UninitializedThis_variable_info
        7: Parser.start().uint16be("cpool_index"), // Object_variable_info
        8: Parser.start().uint16be("offset") // Uninitialized_variable_info
      }
    });
  var LineNumberTableAttribute = Parser.start()
    .uint16be("line_number_table_length")
    .array("line_number_table", {
      type: Parser.start().uint16be("start_pc").uint16be("line_number"),
      length: "line_number_table_length"
    });
  var ConstantValueAttribute = Parser.start().uint16be("constantvalue_index");
  var StackMapFrame = Parser.start()
    .uint8("frame_type")
    .nest("info", {
      type: Parser.start().choice("data", {
        tag: function () {
          console.log(this.$parent.frame_type);
          // Function to map frame_type to choice index
          if (this.$parent.frame_type >= 0 && this.$parent.frame_type <= 63)
            return 0; // same_frame
          if (this.$parent.frame_type >= 64 && this.$parent.frame_type <= 127)
            return 1; // same_locals_1_stack_item_frame
          if (this.$parent.frame_type === 247) return 2; // same_locals_1_stack_item_frame_extended
          if (this.$parent.frame_type >= 248 && this.$parent.frame_type <= 250)
            return 3; // chop_frame
          if (this.$parent.frame_type === 251) return 4; // same_frame_extended
          if (this.$parent.frame_type >= 252 && this.$parent.frame_type <= 254)
            return 5; // append_frame
          if (this.$parent.frame_type === 255) return 6; // full_frame
          return -1; // Invalid frame_type
        },
        choices: {
          0: Parser.start(), // same_frame
          1: Parser.start().nest("stack", {
            // same_locals_1_stack_item_frame
            type: VerificationTypeInfo
          }),
          2: Parser.start() // same_locals_1_stack_item_frame_extended
            .uint16be("offset_delta")
            .nest("stack", {
              type: VerificationTypeInfo
            }),
          3: Parser.start().uint16be("offset_delta"), // chop_frame
          4: Parser.start().uint16be("offset_delta"), // same_frame_extended
          5: Parser.start() // append_frame
            .useContextVars()
            .uint16be("offset_delta")
            .array("locals", {
              type: VerificationTypeInfo,
              length: function () {
                return this.$parent.$parent.frame_type - 251;
              }
            }),
          6: Parser.start() // full_frame
            .uint16be("offset_delta")
            .uint16be("number_of_locals")
            .array("locals", {
              type: VerificationTypeInfo,
              length: "number_of_locals"
            })
            .uint16be("number_of_stack_items")
            .array("stack", {
              type: VerificationTypeInfo,
              length: "number_of_stack_items"
            })
        }
      }),
      formatter: function (frame) {
        if (this.frame_type >= 0 && this.frame_type <= 63) {
          frame.offset_delta = this.frame_type;
        } else if (this.frame_type >= 64 && this.frame_type <= 127) {
          frame.offset_delta = this.frame_type - 64;
        }
        return frame;
      }
    });
  var StackMapTableAttribute = Parser.start()
    .uint16be("number_of_entries")
    .array("entries", {
      type: StackMapFrame,
      length: "number_of_entries"
    });
  var SourceFileAttribute = Parser.start().uint16be("sourcefile_index");
  var BootstrapMethodsAttribute = Parser.start()
    .uint16be("num_bootstrap_methods")
    .array("bootstrap_methods", {
      type: Parser.start()
        .uint16be("bootstrap_method_ref")
        .uint16be("num_bootstrap_arguments")
        .array("bootstrap_arguments", {
          type: "uint16be",
          length: "num_bootstrap_arguments"
        }),
      length: "num_bootstrap_methods"
    });
  var ElementValue = Parser.start().namely("elementvalue").uint8("tag");
  var AnnotationDefaultAttribute = Parser.start().nest("default_value", {
    type: "elementvalue"
  });

  var Annotation = Parser.start()
    .namely("annotation")
    .uint16be("type_index")
    .uint16be("num_element_value_pairs")
    .array("element_value_pairs", {
      type: Parser.start()
        .uint16be("element_name_index")
        .nest("value", { type: "elementvalue" }),
      length: "num_element_value_pairs"
    });
  ElementValue = ElementValue.choice("value", {
    tag: "tag",
    choices: {
      66: Parser.start().uint16be("const_value_index"), // byte ('B')
      67: Parser.start().uint16be("const_value_index"), // char ('C')
      68: Parser.start().uint16be("const_value_index"), // double ('D')
      70: Parser.start().uint16be("const_value_index"), // float ('F')
      73: Parser.start().uint16be("const_value_index"), // int ('I')
      74: Parser.start().uint16be("const_value_index"), // long ('J')
      83: Parser.start().uint16be("const_value_index"), // short ('S')
      90: Parser.start().uint16be("const_value_index"), // boolean ('Z')
      115: Parser.start().uint16be("const_value_index"), // String ('s')
      101: Parser.start()
        .uint16be("type_name_index")
        .uint16be("const_name_index"), // enum constant ('e')
      99: Parser.start().uint16be("class_info_index"), // class ('c')
      64: Parser.start().nest("annotation_value", { type: "annotation" }), // annotation ('@')
      91: Parser.start() // array ('[')
        .uint16be("num_values")
        .array("values", { type: "elementvalue", length: "num_values" })
    }
  });
  var DeprecatedAttribute = Parser.start();
  var SourceDebugExtensionAttribute = Parser.start()
    .uint32be("attribute_length")
    .array("debug_extension", {
      type: "uint8",
      length: "attribute_length",
      formatter: function (arr) {
        return new TextDecoder().decode(new Uint8Array(arr));
      }
    });

  var LocalVariableTableEntry = Parser.start()
    .uint16be("start_pc")
    .uint16be("length")
    .uint16be("name_index")
    .uint16be("descriptor_index")
    .uint16be("index");

  var LocalVariableTableAttribute = Parser.start()
    .uint16be("local_variable_table_length")
    .array("local_variable_table", {
      type: LocalVariableTableEntry,
      length: "local_variable_table_length"
    });

  var LocalVariableTypeTableEntry = Parser.start()
    .uint16be("start_pc")
    .uint16be("length")
    .uint16be("name_index")
    .uint16be("signature_index")
    .uint16be("index");

  var ExceptionsAttribute = Parser.start()
    .uint16be("number_of_exceptions")
    .array("exception_index_table", {
      type: "uint16be",
      length: "number_of_exceptions"
    });

  var InnerClassesEntry = Parser.start()
    .uint16be("inner_class_info_index")
    .uint16be("outer_class_info_index")
    .uint16be("inner_name_index")
    .uint16be("inner_class_access_flags");

  var InnerClassesAttribute = Parser.start()
    .uint16be("number_of_classes")
    .array("classes", {
      type: InnerClassesEntry,
      length: "number_of_classes"
    });

  var EnclosingMethodAttribute = Parser.start()
    .uint16be("class_index")
    .uint16be("method_index");

  var SyntheticAttribute = Parser.start(); // No data to parse for SyntheticAttribute

  var SignatureAttribute = Parser.start().uint16be("signature_index");

  var LocalVariableTypeTableAttribute = Parser.start()
    .uint16be("local_variable_type_table_length")
    .array("local_variable_type_table", {
      type: LocalVariableTypeTableEntry,
      length: "local_variable_type_table_length"
    });
  var RuntimeVisibleAnnotationsAttribute = Parser.start()
    .uint16be("num_annotations")
    .array("annotations", {
      type: Annotation,
      length: "num_annotations"
    });
  var RuntimeInvisibleAnnotationsAttribute = Parser.start()
    .uint16be("num_annotations")
    .array("annotations", {
      type: Annotation,
      length: "num_annotations"
    });

  var ParameterAnnotationsEntry = Parser.start()
    .uint16be("num_annotations")
    .array("annotations", {
      type: Annotation,
      length: "num_annotations"
    });

  var RuntimeVisibleParameterAnnotationsAttribute = Parser.start()
    .uint8("num_parameters")
    .array("parameter_annotations", {
      type: ParameterAnnotationsEntry,
      length: "num_parameters"
    });

  var RuntimeInvisibleParameterAnnotationsAttribute = Parser.start()
    .uint8("num_parameters")
    .array("parameter_annotations", {
      type: ParameterAnnotationsEntry,
      length: "num_parameters"
    });

  var CodeAttribute = Parser.start().namely("code_attribute");

  //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.5
  var AttributeInfo = Parser.start()
    .useContextVars()
    .namely("attribute_info")
    .uint16be("attribute_name_index", {
      formatter: function (_) {
        //console.log(this.$root.constant_pool);
        return { index: _, name: this.$root.constant_pool?.entries[_] };
      }
    })
    .uint32be("attribute_length")
    .choice("info", {
      tag: function () {
        const nameInfo = this.attribute_name_index.name;
        if (nameInfo && nameInfo.tag === 1) {
          // CONSTANT_Utf8
          //console.log(nameInfo.info.bytes);
          return ((_) => {
            switch (_) {
              case "Code":
                return 1;
              case "ConstantValue":
                return 2;
              case "StackMapTable":
                return 3;
              case "LineNumberTable":
                return 4;
              case "SourceFile":
                return 5;
              case "BootstrapMethods":
                return 6;
              case "AnnotationDefault":
                return 7;
              case "RuntimeVisibleAnnotations":
                return 8;
              case "Deprecated":
                return 9;
              case "SourceDebugExtension":
                return 10;
              case "LocalVariableTable":
                return 11;
              case "LocalVariableTypeTable":
                return 12;
              case "Exceptions":
                return 13;
              case "InnerClasses":
                return 14;
              case "EnclosingMethod":
                return 15;
              case "Synthetic":
                return 16;
              case "Signature":
                return 17;
              case "RuntimeInvisibleAnnotations":
                return 18; // Add RuntimeInvisibleAnnotations case
              case "RuntimeVisibleParameterAnnotations":
                return 19; // Add RuntimeVisibleParameterAnnotations case
              case "RuntimeInvisibleParameterAnnotations":
                return 20; // Add RuntimeInvisibleParameterAnnotations case
              default:
                return 0;
            }
          })(nameInfo.info.bytes);
        }
        return 0;
      },
      choices: {
        //Code
        1: "code_attribute",
        //ConstantValue
        2: ConstantValueAttribute,
        3: StackMapTableAttribute,
        4: LineNumberTableAttribute,
        5: SourceFileAttribute,
        6: BootstrapMethodsAttribute,
        7: AnnotationDefaultAttribute,
        8: RuntimeVisibleAnnotationsAttribute,
        9: DeprecatedAttribute,
        10: SourceDebugExtensionAttribute,
        11: LocalVariableTableAttribute,
        12: LocalVariableTypeTableAttribute,
        13: ExceptionsAttribute,
        14: InnerClassesAttribute,
        15: EnclosingMethodAttribute,
        16: SyntheticAttribute,
        17: SignatureAttribute,
        18: RuntimeInvisibleAnnotationsAttribute, // Add RuntimeInvisibleAnnotations choice
        19: RuntimeVisibleParameterAnnotationsAttribute, // Add RuntimeVisibleParameterAnnotations choice
        20: RuntimeInvisibleParameterAnnotationsAttribute, // Add RuntimeInvisibleParameterAnnotations choice
        // Add other attribute types here as needed
        0: Parser.start().array("info", {
          type: "uint8",
          length: function () {
            //console.log("what", this.$parent);
            return this.$parent.attribute_length;
          }
        })
      }
    });

  const WideInstructionParser = Parser.start()
    .uint8("opcode", { assert: 0xc4 }) // wide opcode
    .uint8("modifiedOpcode")
    .uint16be("index")
    .choice("info", {
      tag: "modifiedOpcode",
      choices: {
        0x84: Parser.start().int16be("const").namely("iinc"), // iinc
        0x15: Parser.start().namely("iload"), // iload
        0x16: Parser.start().namely("lload"), // lload
        0x17: Parser.start().namely("fload"), // fload
        0x18: Parser.start().namely("dload"), // dload
        0x19: Parser.start().namely("aload"), // aload
        0x36: Parser.start().namely("istore"), // istore
        0x37: Parser.start().namely("lstore"), // lstore
        0x38: Parser.start().namely("fstore"), // fstore
        0x39: Parser.start().namely("dstore"), // dstore
        0x3a: Parser.start().namely("astore"), // astore
        0xa9: Parser.start().namely("ret") // ret
      }
    })
    .namely("wide");

  const TableswitchParser = Parser.start()
    .namely("tableswitch")
    .uint8("padding1")
    .uint8("padding2")
    .uint8("padding3")
    .int32be("default")
    .int32be("low")
    .int32be("high")
    .array("jumpOffsets", {
      type: "int32be",
      length: function () {
        return this.high - this.low + 1;
      }
    });

  const LookupswitchParser = Parser.start()
    .namely("lookupswitch")
    .uint8("padding1")
    .uint8("padding2")
    .uint8("padding3")
    .int32be("default")
    .int32be("npairs")
    .array("matchOffsetPairs", {
      type: Parser.start().int32be("match").int32be("offset"),
      length: "npairs"
    });

  var InstructionParser = Parser.start()
    .uint8("opcode")
    .choice("info", {
      tag: "opcode",
      choices: {
        0x00: Parser.start().namely("nop"), // nop
        0x01: Parser.start().namely("aconst_null"), // aconst_null
        0x02: Parser.start().namely("iconst_m1"), // iconst_m1
        0x03: Parser.start().namely("iconst_0"), // iconst_0
        0x04: Parser.start().namely("iconst_1"), // iconst_1
        0x05: Parser.start().namely("iconst_2"), // iconst_2
        0x06: Parser.start().namely("iconst_3"), // iconst_3
        0x07: Parser.start().namely("iconst_4"), // iconst_4
        0x08: Parser.start().namely("iconst_5"), // iconst_5
        0x09: Parser.start().namely("lconst_0"), // lconst_0
        0x0a: Parser.start().namely("lconst_1"), // lconst_1
        0x0b: Parser.start().namely("fconst_0"), // fconst_0
        0x0c: Parser.start().namely("fconst_1"), // fconst_1
        0x0d: Parser.start().namely("fconst_2"), // fconst_2
        0x0e: Parser.start().namely("dconst_0"), // dconst_0
        0x0f: Parser.start().namely("dconst_1"), // dconst_1
        0x10: Parser.start().int8("byte").namely("bipush"), // bipush
        0x11: Parser.start().int16be("value").namely("sipush"), // sipush
        0x12: Parser.start().uint8("index").namely("ldc"), // ldc
        0x13: Parser.start().uint16be("index").namely("ldc_w"), // ldc_w
        0x14: Parser.start().uint16be("index").namely("ldc2_w"), // ldc2_w
        0x15: Parser.start().uint8("index").namely("iload"), // iload
        0x16: Parser.start().uint8("index").namely("lload"), // lload
        0x17: Parser.start().uint8("index").namely("fload"), // fload
        0x18: Parser.start().uint8("index").namely("dload"), // dload
        0x19: Parser.start().uint8("index").namely("aload"), // aload
        0x1a: Parser.start().namely("iload_0"), // iload_0
        0x1b: Parser.start().namely("iload_1"), // iload_1
        0x1c: Parser.start().namely("iload_2"), // iload_2
        0x1d: Parser.start().namely("iload_3"), // iload_3
        0x1e: Parser.start().namely("lload_0"), // lload_0
        0x1f: Parser.start().namely("lload_1"), // lload_1
        0x20: Parser.start().namely("lload_2"), // lload_2
        0x21: Parser.start().namely("lload_3"), // lload_3
        0x22: Parser.start().namely("fload_0"), // fload_0
        0x23: Parser.start().namely("fload_1"), // fload_1
        0x24: Parser.start().namely("fload_2"), // fload_2
        0x25: Parser.start().namely("fload_3"), // fload_3
        0x26: Parser.start().namely("dload_0"), // dload_0
        0x27: Parser.start().namely("dload_1"), // dload_1
        0x28: Parser.start().namely("dload_2"), // dload_2
        0x29: Parser.start().namely("dload_3"), // dload_3
        0x2a: Parser.start().namely("aload_0"), // aload_0
        0x2b: Parser.start().namely("aload_1"), // aload_1
        0x2c: Parser.start().namely("aload_2"), // aload_2
        0x2d: Parser.start().namely("aload_3"), // aload_3
        0x2e: Parser.start().namely("iaload"), // iaload
        0x2f: Parser.start().namely("laload"), // laload
        0x30: Parser.start().namely("faload"), // faload
        0x31: Parser.start().namely("daload"), // daload
        0x32: Parser.start().namely("aaload"), // aaload
        0x33: Parser.start().namely("baload"), // baload
        0x34: Parser.start().namely("caload"), // caload
        0x35: Parser.start().namely("saload"), // saload
        0x36: Parser.start().uint8("index").namely("istore"), // istore
        0x37: Parser.start().uint8("index").namely("lstore"), // lstore
        0x38: Parser.start().uint8("index").namely("fstore"), // fstore
        0x39: Parser.start().uint8("index").namely("dstore"), // dstore
        0x3a: Parser.start().uint8("index").namely("astore"), // astore
        0x3b: Parser.start().namely("istore_0"), // istore_0
        0x3c: Parser.start().namely("istore_1"), // istore_1
        0x3d: Parser.start().namely("istore_2"), // istore_2
        0x3e: Parser.start().namely("istore_3"), // istore_3
        0x3f: Parser.start().namely("lstore_0"), // lstore_0
        0x40: Parser.start().namely("lstore_1"), // lstore_1
        0x41: Parser.start().namely("lstore_2"), // lstore_2
        0x42: Parser.start().namely("lstore_3"), // lstore_3
        0x43: Parser.start().namely("fstore_0"), // fstore_0
        0x44: Parser.start().namely("fstore_1"), // fstore_1
        0x45: Parser.start().namely("fstore_2"), // fstore_2
        0x46: Parser.start().namely("fstore_3"), // fstore_3
        0x47: Parser.start().namely("dstore_0"), // dstore_0
        0x48: Parser.start().namely("dstore_1"), // dstore_1
        0x49: Parser.start().namely("dstore_2"), // dstore_2
        0x4a: Parser.start().namely("dstore_3"), // dstore_3
        0x4b: Parser.start().namely("astore_0"), // astore_0
        0x4c: Parser.start().namely("astore_1"), // astore_1
        0x4d: Parser.start().namely("astore_2"), // astore_2
        0x4e: Parser.start().namely("astore_3"), // astore_3
        0x4f: Parser.start().namely("iastore"), // iastore
        0x50: Parser.start().namely("lastore"), // lastore
        0x51: Parser.start().namely("fastore"), // fastore
        0x52: Parser.start().namely("dastore"), // dastore
        0x53: Parser.start().namely("aastore"), // aastore
        0x54: Parser.start().namely("bastore"), // bastore
        0x55: Parser.start().namely("castore"), // castore
        0x56: Parser.start().namely("sastore"), // sastore
        0x57: Parser.start().namely("pop"), // pop
        0x58: Parser.start().namely("pop2"), // pop2
        0x59: Parser.start().namely("dup"), // dup
        0x5a: Parser.start().namely("dup_x1"), // dup_x1
        0x5b: Parser.start().namely("dup_x2"), // dup_x2
        0x5c: Parser.start().namely("dup2"), // dup2
        0x5d: Parser.start().namely("dup2_x1"), // dup2_x1
        0x5e: Parser.start().namely("dup2_x2"), // dup2_x2
        0x5f: Parser.start().namely("swap"), // swap
        0x60: Parser.start().namely("iadd"), // iadd
        0x61: Parser.start().namely("ladd"), // ladd
        0x62: Parser.start().namely("fadd"), // fadd
        0x63: Parser.start().namely("dadd"), // dadd
        0x64: Parser.start().namely("isub"), // isub
        0x65: Parser.start().namely("lsub"), // lsub
        0x66: Parser.start().namely("fsub"), // fsub
        0x67: Parser.start().namely("dsub"), // dsub
        0x68: Parser.start().namely("imul"), // imul
        0x69: Parser.start().namely("lmul"), // lmul
        0x6a: Parser.start().namely("fmul"), // fmul
        0x6b: Parser.start().namely("dmul"), // dmul
        0x6c: Parser.start().namely("idiv"), // idiv
        0x6d: Parser.start().namely("ldiv"), // ldiv
        0x6e: Parser.start().namely("fdiv"), // fdiv
        0x6f: Parser.start().namely("ddiv"), // ddiv
        0x70: Parser.start().namely("irem"), // irem
        0x71: Parser.start().namely("lrem"), // lrem
        0x72: Parser.start().namely("frem"), // frem
        0x73: Parser.start().namely("drem"), // drem
        0x74: Parser.start().namely("ineg"), // ineg
        0x75: Parser.start().namely("lneg"), // lneg
        0x76: Parser.start().namely("fneg"), // fneg
        0x77: Parser.start().namely("dneg"), // dneg
        0x78: Parser.start().namely("ishl"), // ishl
        0x79: Parser.start().namely("lshl"), // lshl
        0x7a: Parser.start().namely("ishr"), // ishr
        0x7b: Parser.start().namely("lshr"), // lshr
        0x7c: Parser.start().namely("iushr"), // iushr
        0x7d: Parser.start().namely("lushr"), // lushr
        0x7e: Parser.start().namely("iand"), // iand
        0x7f: Parser.start().namely("land"), // land
        0x80: Parser.start().namely("ior"), // ior
        0x81: Parser.start().namely("lor"), // lor
        0x82: Parser.start().namely("ixor"), // ixor
        0x83: Parser.start().namely("lxor"), // lxor
        0x84: Parser.start().uint8("index").int8("const").namely("iinc"), // iinc
        0x85: Parser.start().namely("i2l"), // i2l
        0x86: Parser.start().namely("i2f"), // i2f
        0x87: Parser.start().namely("i2d"), // i2d
        0x88: Parser.start().namely("l2i"), // l2i
        0x89: Parser.start().namely("l2f"), // l2f
        0x8a: Parser.start().namely("l2d"), // l2d
        0x8b: Parser.start().namely("f2i"), // f2i
        0x8c: Parser.start().namely("f2l"), // f2l
        0x8d: Parser.start().namely("f2d"), // f2d
        0x8e: Parser.start().namely("d2i"), // d2i
        0x8f: Parser.start().namely("d2l"), // d2l
        0x90: Parser.start().namely("d2f"), // d2f
        0x91: Parser.start().namely("i2b"), // i2b
        0x92: Parser.start().namely("i2c"), // i2c
        0x93: Parser.start().namely("i2s"), // i2s
        0x94: Parser.start().namely("lcmp"), // lcmp
        0x95: Parser.start().namely("fcmpl"), // fcmpl
        0x96: Parser.start().namely("fcmpg"), // fcmpg
        0x97: Parser.start().namely("dcmpl"), // dcmpl
        0x98: Parser.start().namely("dcmpg"), // dcmpg
        0x99: Parser.start().int16be("branchoffset").namely("ifeq"), // ifeq
        0x9a: Parser.start().int16be("branchoffset").namely("ifne"), // ifne
        0x9b: Parser.start().int16be("branchoffset").namely("iflt"), // iflt
        0x9c: Parser.start().int16be("branchoffset").namely("ifge"), // ifge
        0x9d: Parser.start().int16be("branchoffset").namely("ifgt"), // ifgt
        0x9e: Parser.start().int16be("branchoffset").namely("ifle"), // ifle
        0x9f: Parser.start().int16be("branchoffset").namely("if_icmpeq"), // if_icmpeq
        0xa0: Parser.start().int16be("branchoffset").namely("if_icmpne"), // if_icmpne
        0xa1: Parser.start().int16be("branchoffset").namely("if_icmplt"), // if_icmplt
        0xa2: Parser.start().int16be("branchoffset").namely("if_icmpge"), // if_icmpge
        0xa3: Parser.start().int16be("branchoffset").namely("if_icmpgt"), // if_icmpgt
        0xa4: Parser.start().int16be("branchoffset").namely("if_icmple"), // if_icmple
        0xa5: Parser.start().int16be("branchoffset").namely("if_acmpeq"), // if_acmpeq
        0xa6: Parser.start().int16be("branchoffset").namely("if_acmpne"), // if_acmpne
        0xa7: Parser.start().int16be("branchoffset").namely("goto"), // goto
        0xa8: Parser.start().int16be("branchoffset").namely("jsr"), // jsr
        0xa9: Parser.start().uint8("index").namely("ret"), // ret
        0xaa: "tableswitch", // tableswitch
        0xab: "lookupswitch", // lookupswitch
        0xac: Parser.start().namely("ireturn"), // ireturn
        0xad: Parser.start().namely("lreturn"), // lreturn
        0xae: Parser.start().namely("freturn"), // freturn
        0xaf: Parser.start().namely("dreturn"), // dreturn
        0xb0: Parser.start().namely("areturn"), // areturn
        0xb1: Parser.start().namely("return"), // return
        0xb2: Parser.start().uint16be("index").namely("getstatic"), // getstatic
        0xb3: Parser.start().uint16be("index").namely("putstatic"), // putstatic
        0xb4: Parser.start().uint16be("index").namely("getfield"), // getfield
        0xb5: Parser.start().uint16be("index").namely("putfield"), // putfield
        0xb6: Parser.start().uint16be("index").namely("invokevirtual"), // invokevirtual
        0xb7: Parser.start().uint16be("index").namely("invokespecial"), // invokespecial
        0xb8: Parser.start().uint16be("index").namely("invokestatic"), // invokestatic
        0xb9: Parser.start()
          .uint16be("index")
          .uint8("count")
          .uint8("zero")
          .namely("invokeinterface"), // invokeinterface
        0xba: Parser.start()
          .uint16be("index")
          .uint8("zero1")
          .uint8("zero2")
          .namely("invokedynamic"), // invokedynamic
        0xbb: Parser.start().uint16be("index").namely("new"), // new
        0xbc: Parser.start().uint8("atype").namely("newarray"), // newarray
        0xbd: Parser.start().uint16be("index").namely("anewarray"), // anewarray
        0xbe: Parser.start().namely("arraylength"), // arraylength
        0xbf: Parser.start().namely("athrow"), // athrow
        0xc0: Parser.start().uint16be("index").namely("checkcast"), // checkcast
        0xc1: Parser.start().uint16be("index").namely("instanceof"), // instanceof
        0xc2: Parser.start().namely("monitorenter"), // monitorenter
        0xc3: Parser.start().namely("monitorexit"), // monitorexit
        0xc4: "wide", // wide
        0xc5: Parser.start()
          .uint16be("index")
          .uint8("dimensions")
          .namely("multianewarray"), // multianewarray
        0xc6: Parser.start().int16be("branchoffset").namely("ifnull"), // ifnull
        0xc7: Parser.start().int16be("branchoffset").namely("ifnonnull"), // ifnonnull
        0xc8: Parser.start().int32be("branchoffset").namely("goto_w"), // goto_w
        0xc9: Parser.start().int32be("branchoffset").namely("jsr_w") // jsr_w
      }
    });
  const BytecodeParser = Parser.start()
    .useContextVars()
    .array("instructions", {
      type: Parser.start().choice("instruction", {
        tag: function () {
          switch (
            this.opcode // Access the "opcode" property of the current item
          ) {
            case 0xc4:
              return 0; // WideInstructionParser
            case 0xaa:
              return 1; // TableswitchParser
            case 0xab:
              return 2; // LookupswitchParser
            default:
              return 3; // InstructionParser (default)
          }
        },
        choices: [
          // Use an array of choices (indexed numerically)
          WideInstructionParser,
          TableswitchParser,
          LookupswitchParser,
          InstructionParser
        ]
      }),
      lengthInBytes: function (item, buffer) {
        //console.log("eyy", this, this.$parent.code_length);
        return this.$parent.code_length;
      }
    });

  CodeAttribute = CodeAttribute.useContextVars()
    .uint16be("max_stack")
    .uint16be("max_locals")
    .uint32be("code_length")
    .nest("code", {
      type: BytecodeParser
    })
    .uint16be("exception_table_length")
    .array("exception_table", {
      type: Parser.start()
        .uint16be("start_pc")
        .uint16be("end_pc")
        .uint16be("handler_pc")
        .uint16be("catch_type"),
      length: "exception_table_length"
    })
    .uint16be("attributes_count")
    .array("attributes", {
      type: "attribute_info",
      length: "attributes_count"
    });
  var FieldInfo = Parser.start()
    .uint16be("access_flags")
    .uint16be("name_index")
    .uint16be("descriptor_index")
    .uint16be("attributes_count")
    .array("attributes", {
      type: "attribute_info",
      length: "attributes_count"
    });

  //https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.6
  var MethodInfo = Parser.start()
    .useContextVars()
    .uint16be("access_flags")
    .uint16be("name_index")
    .uint16be("descriptor_index")
    .uint16be("attributes_count")
    .array("attributes", {
      type: "attribute_info",
      length: "attributes_count"
    });

  const ConstantPoolParser = Parser.start()
    .uint16("count")
    .array("entries", {
      type: CpInfo,
      readUntil: function (item, buffer, offset) {
        if (this.entries.length >= this.count - 1) return true;
        // Check if we've just read a long or double
        if (item.tag === 5 || item.tag === 6) {
          this.entries.push(null); // Add placeholder for the second slot
        }
        return false;
      },
      formatter: function (array) {
        return [null, ...array];
      }
    });

  const ClassFile = Parser.start()
    .useContextVars()
    .endianness("big")
    .uint32("magic", { assert: 0xcafebabe })
    .uint16("minor_version")
    .uint16("major_version")
    .nest("constant_pool", { type: ConstantPoolParser })
    .uint16("access_flags")
    .uint16("this_class")
    .uint16("super_class")
    .uint16("interfaces_count")
    .array("interfaces", {
      type: "uint16be",
      length: "interfaces_count"
    })
    .uint16("fields_count")
    .array("fields", {
      type: FieldInfo,
      length: "fields_count"
    })
    .uint16("methods_count")
    .array("methods", {
      type: MethodInfo,
      length: "methods_count"
    })
    .uint16("attributes_count")
    .array("attributes", {
      type: AttributeInfo,
      length: "attributes_count"
    });

readFile(join(__dirname, "Hello.class"), (_, data) => {
  console.log(inspect(ClassFile.parse(data), { depth: null, colors: true }));
});
