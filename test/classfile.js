var fs = require('fs');
var assert = require('assert');
var Parser = require('../lib/bang').Parser;

var ConstantClassInfo =
	Parser.start()
    .uint16be('name_index');

var ConstantFieldrefInfo =
	Parser.start()
    .uint16be('class_index')
    .uint16be('name_and_type_index');

var ConstantMethodrefInfo =
	Parser.start()
    .uint16be('class_index')
    .uint16be('name_and_type_index');

var ConstantInterfaceMethodrefInfo =
	Parser.start()
    .uint16be('class_index')
    .uint16be('name_and_type_index');


var ConstantStringInfo =
	Parser.start()
    .uint16be('string_index');

var ConstantIntegerInfo =
	Parser.start()
    .uint32be('bytes');

var ConstantFloatInfo =
	Parser.start()
    .uint32be('bytes');

var ConstantLongInfo =
	Parser.start()
    .uint32be('high_bytes')
    .uint32be('low_bytes');

var ConstantDoubleInfo =
	Parser.start()
    .uint32be('high_bytes')
    .uint32be('low_bytes');

var ConstantNameAndTypeInfo =
	Parser.start()
    .uint16be('name_index')
    .uint16be('descriptor_index');

var ConstantUtf8Info =
	Parser.start()
    .uint16be('len')
    .string('bytes', {length: 'len'});

var ConstantMethodHandleInfo =
	Parser.start()
    .uint8('reference_kind')
    .uint16be('reference_index');

var ConstantMethodTypeInfo =
	Parser.start()
    .uint16be('descriptor_index');

var ConstantInvokeDynamicInfo =
	Parser.start()
    .uint16be('bootstrap_method_attr_index')
    .uint16be('name_and_type_index');

var CpInfo =
	Parser.start()
    .uint8('tag')
    .choice('info', {
        tag: 'tag',
        choices: {
            7:  ConstantClassInfo,
            9:  ConstantFieldrefInfo,
            10: ConstantMethodrefInfo,
            11: ConstantInterfaceMethodrefInfo,
            8:  ConstantStringInfo,
            3:  ConstantIntegerInfo,
            4:  ConstantFloatInfo,
            5:  ConstantLongInfo,
            6:  ConstantDoubleInfo,
            12: ConstantNameAndTypeInfo,
            1:  ConstantUtf8Info,
            16: ConstantMethodTypeInfo,
            18: ConstantInvokeDynamicInfo
        }
    });

var ClassFile =
	Parser.start()
    .endianess('big')
    .uint32('magic')
    .uint16('minor_version')
    .uint16('major_version')
    .uint16('constant_pool_count')
    .array('cp_info', {
        type: CpInfo,
        length: function() {
            return this.constant_pool_count - 1;
        }
    });

describe('Java class file parser', function() {
    var expect = {
        magic: 0xcafebabe,
        minor_version: 0,
        major_version: 50,
        constant_pool_count: 29,
        cp_info: [
            { tag: 10, info: { class_index: 6, name_and_type_index: 15 } },
            { tag: 9, info: { class_index: 16, name_and_type_index: 17 } },
            { tag: 8, info: { string_index: 18 } },
            { tag: 10, info: { class_index: 19, name_and_type_index: 20 } },
            { tag: 7, info: { name_index: 21 } },
            { tag: 7, info: { name_index: 22 } },
            { tag: 1, info: { len: 6, bytes: '<init>' } },
            { tag: 1, info: { len: 3, bytes: '()V' } },
            { tag: 1, info: { len: 4, bytes: 'Code' } },
            { tag: 1, info: { len: 15, bytes: 'LineNumberTable' } },
            { tag: 1, info: { len: 4, bytes: 'main' } },
            { tag: 1, info: { len: 22, bytes: '([Ljava/lang/String;)V' } },
            { tag: 1, info: { len: 10, bytes: 'SourceFile' } },
            { tag: 1, info: { len: 10, bytes: 'Hello.java' } },
            { tag: 12, info: { name_index: 7, descriptor_index: 8 } },
            { tag: 7, info: { name_index: 23 } },
            { tag: 12, info: { name_index: 24, descriptor_index: 25 } },
            { tag: 1, info: { len: 13, bytes: 'Hello, world!' } },
            { tag: 7, info: { name_index: 26 } },
            { tag: 12, info: { name_index: 27, descriptor_index: 28 } },
            { tag: 1, info: { len: 5, bytes: 'Hello' } },
            { tag: 1, info: { len: 16, bytes: 'java/lang/Object' } },
            { tag: 1, info: { len: 16, bytes: 'java/lang/System' } },
            { tag: 1, info: { len: 3, bytes: 'out' } },
            { tag: 1, info: { len: 21, bytes: 'Ljava/io/PrintStream;' } },
            { tag: 1, info: { len: 19, bytes: 'java/io/PrintStream' } },
            { tag: 1, info: { len: 7, bytes: 'println' } },
            { tag: 1, info: { len: 21, bytes: '(Ljava/lang/String;)V' } }
        ]
    };

    it('should parse class file', function() {
        fs.readFile('test/Hello.class', function(err, data) {
            assert.deepEqual(ClassFile.parse(data), expect);
        });
    });
});
