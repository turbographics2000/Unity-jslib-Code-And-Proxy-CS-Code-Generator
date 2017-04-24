var csTypeNames = {
    'boolean': 'bool',
    'byte': 'byte',
    'short': 'short',
    'long': 'int',
    'long long': 'long',
    'double': 'double',
    'unsigned short': 'ushort',
    'unsigned long': 'uint',
    'unsigned long long': 'ulong',
    'float': 'float',
    'unrestricted float': 'float',
    'double': 'double',
    'unrestricted double': 'double',
    'domstring': 'string',
    'usvstring': 'string',
    'object': 'object',
    'void': 'void',
    'arraybuffer': 'byte',
    'arraybufferview': 'byte',
    'domhighRestimestamp': 'TimeSpan',
    'domtimestamp': 'TimeSpan',
    'octet': 'byte',
    'blob': 'FileInfo',
    'record': 'dictionary'
};

var primitiveTypes = [
    'void',
    'bool',
    'byte',
    'sbyte',
    'short',
    'ushort',
    'int',
    'uint',
    'long',
    'ulong',
    'float',
    'double',
    'string'
];

function convertToCSData(data) {
    dataTypeParse(data);
    paramPatternParse(data);
}

function convertToCSType(data, types) {
    var csTypes = [];
    types.forEach(type => {
        var csType = {};
        csType.typeName = type.typeName;
        if (csType.typeName.endsWith('?')) {
            csType.typeName = csType.typeName.substr(0, type.typeName.length - 1);
            csType.nullable = true;
        }
        csType.typeName = csTypeNames[csType.typeName.toLowerCase()] || csType.typeName;
        if (type.sequence || type.typeName === 'ArrayBuffer' || type.typeName === 'ArrayBufferView') csType.array = true;
        if (primitiveTypes.includes(csType.typeName)) csType.primitive = true;
        if (csType.typeName === 'string' && csType.array) csType.primitive = false;
        csType.proxyType = csType.primitive ? csType.typeName : 'json';
        csTypes.push(csType);
    });
    data.cs_type = csTypes;
}

function patternFilter(pattern, result) {
    if(!pattern.map) debugger;
    var pattern_string = pattern.map(p => {
        return p.cs_type.typeName;
    }).join('');
    if (result.filter(res => res.pattern_string === pattern_string).length === 0) {
        result.push({
            pattern_string,
            pattern
        });
    }
}

function generateParamPattern(param, idx, ptn, result) {
    if (idx === param.length) {
        patternFilter(ptn, result);
    } else {
        if (!param[idx].data_type) debugger;
        for (var i = 0, l = param[idx].cs_type.length; i < l; i++) {
            var p = [].concat(ptn);
            var itm = {};
            Object.keys(param[idx]).forEach(key => {
                if (!['data_type', 'cs_type'].includes(key)) itm[key] = param[idx][key];
            });
            itm.cs_type = param[idx].cs_type[i];
            p.push(itm);
            generateParamPattern(param, idx + 1, p, result);
        }
    }
}

function paramPatternParse(data) {
    if (typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
        var patterns = [];
        if (key === 'param') {
            generateParamPattern(data[key], 0, [], patterns);
        } else if (key === 'over_load') {
            for (var i = 0, il = data[key].length; i < il; i++) {
                var result = [];
                generateParamPattern(data[key][i], 0, [], result);
                if (result.length) {
                    for(var j = 0, jl = result.length; j < jl; j++) {
                        patternFilter(result[j].pattern, patterns);
                    }
                }
            }
        }
        if (patterns.length) {
            data.param_pattern = patterns;
        }
        paramPatternParse(data[key]);
    });
}

function dataTypeParse(data) {
    if (typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
        if (key === 'data_type') {
            convertToCSType(data, data[key]);
            //delete data[key];
        }
        dataTypeParse(data[key]);
    });

}