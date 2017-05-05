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

function WebIDLParse(docs, optimize) {
    var parseData = {};

    docs.forEach(doc => {
        var groups = [...doc.querySelectorAll('.idl *[class$=ID]')]
            .map(elm => elm.className.replace(/^idl(.+?)ID$/, (a, b) => b))
            .filter((val, idx, arr) => arr.indexOf(val) === idx);
        groups.forEach(group => { // Dictionary, Interface, Enum, Callback ...
            var groupData = parseData[group] = parseData[group] || {};
            doc.querySelectorAll(`.idl${group}`).forEach(groupElm => {
                var id = getText(groupElm.querySelector(`.idl${group}ID`));
                var groupItemData = groupData[id] = groupData[id] || {};
                extAttrParse(groupElm, groupItemData);
                var types = typeParse(groupElm.querySelector('.idlMaplike'));
                if (types) {
                    parseData.Maplike = parseData.Maplike || {};
                    parseData.Maplike[id] = types;
                    if (types[0].readonly) parseData.Maplike[id].readonly = true;
                    return;
                }
                switch (group) {
                    case 'Dictionary':
                    case 'Interface':
                        var superclass = getText(groupElm.querySelector('.idlSuperclass'));
                        if (superclass) groupItemData.Superclass = superclass;
                        ['Ctor', 'Attribute', 'Member', 'Method'].forEach(memberKind => {
                            memberParse(groupElm, groupItemData, memberKind);
                        })
                        break;
                    case 'Callback':
                        memberParse(groupElm, groupItemData, 'Callback');
                        var cbParams = paramParse(groupElm);
                        if (cbParams) groupItemData.param = cbParams;
                        break;
                    case 'Enum':
                        groupElm.querySelectorAll('.idlEnumItem').forEach(item => {
                            groupItemData.item = groupItemData.item || [];
                            groupItemData.item.push(getText(item).replace(/"/g, ''));
                        });
                        break;
                }
            });
        });

        if (optimize) {
            dataOptimize(parseData);
            dataOptimize2(parseData);
        }
    });

    return parseData;
}

function memberParse(groupElm, groupItemData, memberKind) {
    var memberElms = groupElm.querySelectorAll(`.idl${memberKind}`);
    if (memberElms.length) {
        var memberData = null;
        memberElms.forEach(elm => {
            memberKind = { Attribute: 'Attr', Method: 'Meth' }[memberKind] || memberKind;
            var memberName = getText(elm.querySelector(`.idl${memberKind}Name`));

            var types = typeParse(elm.querySelector(`.idlType, .idl${memberKind}Type`));
            if (types && types[0].typeName === 'EventHandler') {
                groupItemData.EventHandler = groupItemData.EventHandler || [];
                groupItemData.EventHandler.push(memberName);
                return;
            }

            memberData = groupItemData[memberKind] = groupItemData[memberKind] || {};
            var memberItemData = memberName ? memberData[memberName] = memberData[memberName] || {} : memberData;

            if (types) memberItemData.data_type = types;
            var typeDec = /([a-z]+?)<(.+?)>/i.exec(getText(elm));
            var typeDecs = ['frozenarray', 'record', 'sequence'];
            if (elm.className === 'idlAttribute') typeDecs.push('promise');
            if (typeDec && !typeDecs.includes(typeDec[1].toLowerCase())) {
                memberItemData[typeDec[1]] = true;
            }

            headerKeywordsParse(elm, memberItemData);
            extAttrParse(elm, memberItemData);

            var params = paramParse(elm);
            if (params) {
                memberItemData.param_pattern = memberItemData.param_pattern || [];
                memberItemData.param_pattern.push(params);
            }

            var defaultValue = getText(elm.querySelector(`.idl${memberKind}Value`));
            if (defaultValue) {
                memberItemData.defaltValue = defaultValue.replace(/"/g, '');
            }

            if (memberKind === 'Superclass') {
                memberData = getText(elm);
            }
        });
        Object.keys(memberData).forEach(memberName => {
            if (memberData[memberName].param_pattern) {
                paramPatternParse(memberData[memberName]);
            }
        })
    }
}

function appendMessage(txt) {
    var div = document.createElement('div');
    div.textContent = txt;
    document.body.appendChild(div);
}

function extAttrParse(target, parseData) {
    var extAttrElms = target.querySelectorAll(':scope > .extAttr');
    var extAttrs = [];
    extAttrElms.forEach(elm => {
        var extAttr = {};
        var name = getText(elm.querySelector('.extAttrName')).trim();
        if(!name) return;
        extAttr.extAttrName = name;
        var rhs = getText(elm.querySelector('.extAttrRhs'));
        if (rhs) extAttr.extAttrRhs = rhs;
        extAttrs.push(extAttr);
    });
    if (extAttrs.length) parseData.extAttr = extAttrs;
}

var nullObj = { textContent: '' };
function getText(elm) {
    return (elm || nullObj).textContent.trim();
}

function headerKeywordsParse(target, parseData) {
    var keywords = getText(target).split(' ');
    keywords.forEach(keyword => {
        if (keyword === 'static') parseData.static = true;
        if (keyword === 'readonly') parseData.readonly = true;
        if (keyword === 'required') parseData.required = true;
        if (keyword === 'partial') parseData.partial = true;
    });
}

function paramParse(target) {
    var params = null;
    target.querySelectorAll('.idlParam').forEach(param => {
        params = params || [];

        var prm = {
            paramName: getText(param.querySelector('.idlParamName')),
            data_type: typeParse(param.querySelector('.idlParamType'))
        };
        var txt = getText(param);
        if (txt.startsWith('optional ')) {
            prm.optional = true;
        }
        var defaultValue = getText(param.querySelector('.idlMemberValue'));
        if (defaultValue) {
            if (prm.data_type[0].isPrimitive) {
                if (prm.data_type[0].typeName !== 'boolean') {
                    defaultValue = defaultValue === 'true';
                } else if (prm.data_type[0].typeName !== 'string') {
                    defaultValue = +defaultValue;
                }
            }
            prm.defaultValue = defaultValue;
        }
        headerKeywordsParse(param, prm);
        params.push(prm);
    });
    return params;
}

function typeParse(typeElm) {
    if (!typeElm) return null;

    var types = [];
    var txt = getText(typeElm);
    txt.replace(/\(|\)|\r|\n/g, '').split(' or ').forEach(typeName => {
        var typeDec = /([a-z]+?)<(.+?)>/i.exec(typeName);
        var type = {};
        if (typeDec) {
            typeDecs = ['frozenarray', 'record', 'sequence', 'maplike'];
            if (typeElm.className === 'idlAttrType') typeDecs.push('promise');
            if (typeDecs.includes(typeDec[1].toLowerCase())) {
                type[typeDec[1]] = true;
            }
            typeName = typeDec[2];
        }
        var typeNames = typeName.split(',').map(x => x.trim());
        if (type.record || type.maplike) {
            var copy = Object.assign({}, type);
            delete copy.record;
            delete copy.maplike;
            type.key = Object.assign({}, copy);
            type.value = Object.assign({}, copy);
            type.key.typeName = typeNames[0];
            type.value.typeName = typeNames[1];
            addCSTypeInfo(type.key);
            addCSTypeInfo(type.value);
        } else {
            type.typeName = type.maplike ? typeNames : typeNames[0];
            addCSTypeInfo(type);
        }

        types.push(type);
    });
    return types;
}

function addCSTypeInfo(type) {
    if (type.typeName.endsWith('?')) {
        type.typeName = type.typeName.substr(0, type.typeName.length - 1);
        type.nullable = true;
    }
    type.csTypeName = csTypeNames[type.typeName.toLowerCase()] || type.typeName;
    if (type.typeName === 'ArrayBuffer' || type.typeName === 'ArrayBufferView') {
        type.array = true;
    }
    if (primitiveTypes.includes(type.csTypeName)) {
        type.primitive = true;
    }
    if (!type.primitive || (type.csTypeName === 'string' && type.array) || (type.sequence && type.array)) {
        type.proxyJSON = true;
    }
}

function paramPatternParse(data) {
    for (var i = 0, il = data.param_pattern.length; i < il; i++) {
        var results = [];
        generateParamPattern(data.param_pattern[i], 0, [], results);
        var patterns = data.cs_param_pattern = data.cs_param_pattern || [];
        results.forEach(result => {
            patterns.forEach(pattern => pattern.map(ptn => {
                if (result.every(res => JSON.stringify(res) !== JSON.stringify())) {
                    patterns.push(result);
                }
            }));
        });
    }
}

function generateParamPattern(param, idx, ptn, results) {
    for (var i = 0, l = param[idx].data_type.length; i < l; i++) {
        var p = [].concat(ptn);
        var itm = {};
        Object.keys(param[idx]).forEach(key => {
            if (key !== 'data_type') itm[key] = param[idx][key];
        });
        itm.data_type = param[idx].data_type[i];
        p.push(itm);
        if (idx + 1 === param.length) {
            results.push(p);
        } else {
            generateParamPattern(param, idx + 1, p, results);
        }
    }
}

function dataOptimize(data) {
    if (typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
        dataOptimize(data[key]);
        if (Array.isArray(data[key]) && data[key].length === 1) {
            data[key] = data[key][0];
        }
    });
}

function dataOptimize2(data) {
    Object.keys(data).forEach(group => {
        Object.keys(data[group]).forEach(objKey => {
            dataOptimize2_(data[group][objKey]);
        });
    });
}

function dataOptimize2_(data) {
    if (typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
        dataOptimize2(data[key]);
        var subKeys = Object.keys(data[key]);
        if (subKeys.length === 1) {
            data[key] = data[key][subKeys[0]];
        }
    });
}
