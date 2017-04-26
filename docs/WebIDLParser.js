function WebIDLParse(docs, optimize) {
    var parseData = {};

    docs.forEach(doc => {
        var groups = Array.from(doc.querySelectorAll('.idl *[class$=ID]'))
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
                    parseData.Maplike[id] = {};
                    setKeyValueType(parseData.Maplike[id], types[0].typeName);
                    if (types[0].readonly) parseData.Maplike[id].readonly = true;
                    return;
                }
                switch (group) {
                    case 'Dictionary':
                    case 'Interface':
                        var superclass = getText(groupElm.querySelector('.idlSuperclass'));
                        if (superclass) groupItemData.Superclass = superclass;
                        ['Ctor', 'Attribute', 'Member', 'Method', 'Maplike'].forEach(memberKind => {
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
        memberData = groupItemData[memberKind] = groupItemData[memberKind] || {};
        memberElms.forEach(elm => {
            memberKind = { Attribute: 'Attr', Method: 'Meth' }[memberKind] || memberKind;
            var memberName = getText(elm.querySelector(`.idl${memberKind}Name`));

            var types = typeParse(elm.querySelector(`.idlType, .idl${memberKind}Type`));
            if (types && types[0].typeName === 'EventHandler') {
                groupItemData.EventHandler = groupItemData.EventHandler || [];
                groupItemData.EventHandler.push(memberName);
                return;
            }

            var memberItemData = memberName ? memberData[memberName] = memberData[memberName] || {} : memberData;
            if (['Ctor', 'Meth'].includes(memberKind)) {
                if (memberItemData.param) {
                    if (!memberItemData.over_load) {
                        memberItemData.over_load = [];
                        memberItemData.over_load.push(memberItemData.param);
                        delete memberItemData.param;
                    }
                }
            }
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
                if (memberItemData.over_load) {
                    memberItemData.over_load.push(params);
                } else {
                    memberItemData.param = params;
                }
            }

            var defaultValue = getText(elm.querySelector(`.idl${memberKind}Value`));
            if (defaultValue) {
                memberItemData.defaltValue = defaultValue.replace(/"/g, '');
            }

            if (memberKind === 'Superclass') {
                memberData = getText(elm);
            }
        });
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
        var name = getText(elm.querySelector('.extAttrName'));
        if (name) extAttr.extAttrName = name;
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
            if (prm.data_type[0].isPrimitive && prm.data_type[0].typeName !== 'string') {
                defaultValue = +defaultValue;
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
        if (type.record) {
            setKeyValueType(type, typeNames);
        } else {
            type.typeName = type.maplike ? typeNames : typeNames[0];
        }
        types.push(type);
    });
    return types;
}

function setKeyValueType(data, typeNames) {
    data.key = {
        typeName: typeNames[0]
    };
    data.value = {
        typeName: typeNames[1]
    };
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
