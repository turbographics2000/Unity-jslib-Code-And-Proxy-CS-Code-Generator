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
        if (type.typeName.endsWith('?')) {
            type.typeName = type.typeName.substr(0, type.typeName.length - 1);
            type.nullable = true;
        }
        type.csTypeName = csTypeNames[type.typeName.toLowerCase()] || type.typeName;
        if (type.sequence || type.typeName === 'ArrayBuffer' || type.typeName === 'ArrayBufferView') type.array = true;
        if (primitiveTypes.includes(type.csTypeName)) type.primitive = true;
        if (type.csTypeName === 'string' && type.array) type.primitive = false;
        type.proxyType = type.primitive ? type.csTypeName : 'json';
    });
}

function patternFilter(pattern, result) {
    if(!pattern.map) debugger;
    var pattern_string = pattern.map(p => {
        return p.data_type.csTypeName;
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
        for (var i = 0, l = param[idx].data_type.length; i < l; i++) {
            var p = [].concat(ptn);
            var itm = {};
            Object.keys(param[idx]).forEach(key => {
                if (key !== 'data_type') itm[key] = param[idx][key];
            });
            itm.data_type = param[idx].data_type[i];
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
        }
        dataTypeParse(data[key]);
    });
}