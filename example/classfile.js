var Parser = require('../lib/binary_parser').Parser;

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
    .uint32('magic', {assert: 0xcafebabe})
    .uint16('minor_version')
    .uint16('major_version')
    .uint16('constant_pool_count')
    .array('cp_info', {
        type: CpInfo,
        length: function() {
            return this.constant_pool_count - 1;
        }
    });

require('fs').readFile('Hello.class', function(err, data) {
    console.log(require('util').inspect(ClassFile.parse(data), {depth: null}));
});
