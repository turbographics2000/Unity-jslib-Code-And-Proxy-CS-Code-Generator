
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
    'record': 'map'
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

var primitiveDefault = {
    bool: false,
    byte: 0,
    sbyte: 0,
    short: 0,
    ushort: 0,
    int: 0,
    uint: 0,
    long: 0,
    float: '0f',
    double: '0f',
    string: null
};

var zip = null;
var idlCodes = [];
var idlEnums = [];
var csCode = '';
var csIndentSize = 2;
var csIndentLevel = 0;
var managerNameSpace = 'UnityWebGLWebRTC';
var useListClasses = [];

function camelize(txt, forceUpperCase) {
    if (txt === 'new') return 'New';
    return txt.split('-').map((elm, idx) => {
        var arr = elm.split('');
        if (idx === 0 && !forceUpperCase) {
            arr[0] = arr[0].toLowerCase();
        } else {
            arr[0] = arr[0].toUpperCase();
        }
        return arr.join('');
    }).join('');
}

function addCSIndent() {
    csCode += [...Array(csIndentSize * csIndentLevel)].map(x => ' ').join('');
}
function addCSCode(code = '', isIndent) {
    if (isIndent) addCSIndent();
    csCode += code;
}
function addCSLineWithDllImport(code) {
    addCSLine('[DllImport("__Internal")]');
    addCSLine(code);
}
function addCSLine(code = '') {
    if (code.startsWith('}')) csIndentLevel--;
    addCSIndent();
    csCode += code + '\r\n';
    if (code === '{') csIndentLevel++;
}
function saveCSCode(fileName) {
    zip.file(fileName, csCode);
    csCode = '';
    csIndentLevel = 0;
}
function saveIdlCode(fileName, enumFileName) {
    idlCodes.sort((a, b) => {
        if (a.id > b.id) return 1;
        if (a.id < b.id) return -1;
        return 0;
    });
    var idlCode = '';
    idlCodes.forEach(code => {
        idlCode += '\r\n' + code.code;
    });
    zip.file(fileName, idlCode);
    var idlEnumCode = '';
    idlEnums.sort((a, b) => {
        if (a.id > b.id) return 1;
        if (a.id < b.id) return -1;
        return 0;
    });
    idlEnums.forEach(code => {
        idlEnumCode += '\r\n' + code.code;
    });
    zip.file(enumFileName, idlEnumCode);
}
var csManagerCode = '';
var csManagerIndentLevel = 0;
function addCSManagerIndent() {
    csManager += [...Array(csIndentSize * csIndentLevel)].map(x => ' ').join();
}
function addCSManagerCode(code = '') {
    csManagerCode += code;
}
function addCSManagerLine(code = '') {
    if (code.startsWith('}')) csManagerIndentLevel--;
    addCSIndent();
    csManagerCode += [...Array(csIndentSize * csIndentLevel)].map(x => ' ') + code + '\r\n';
    if (code === '{') csManagerIndentLevel++;
}
function saveCSManagerCode(fileName) {
    zip.file(fileName, csManagerCode);
    csManagerCode = '';
    csManagerIndentLevel = 0;
}

function generateCS(parseData, zipFileName) {
    convertToCSData(parseData);

    var attrOrMemberAddCSLine = (name, data) => {
        var camName = camelize(name, true);
        var type = data.cs_type[0];
        if (type.array && !type.primitive) {
            useListClasses.push(type.typeName);
        }
        var retType = type.proxyType === 'json' ? 'string' : type.typeName;

        addCSLine();
        addCSLineWithDllImport(`private static extern ${retType} get${camName}(string instanceId);`);
        if (!data.readonly) {
            addCSLineWithDllImport(`private static extern void set${camName}(string instanceId, ${retType} value);`);
        }
        if (type.array) {
            addCSLine(`public ${type.typeName}[] ${name}`);
            addCSLine('{');
            addCSLine('get');
            addCSLine('{');
            addCSLine(`var ret = get${camName}(InstanceId);`);
            addCSLine(`return JsonUtility.FromJson<${type.typeName + 'Array'}>(ret).arr;`);
            addCSLine('}');
            if (!data.readonly) {
                addCSLine('set');
                addCSLine('{');
                addCSLine(`var tmp = new ${type.typeName}Array();`);
                addCSLine('tmp.array = value;');
                addCSLine('var json = JsonUtility.ToJson(tmp);');
                addCSLine(`set${camName}(InstanceId, json);`);
                addCSLine('}');
            }
            addCSLine('}');
        } else {
            addCSLine(`public ${type.typeName} ${name}`);
            addCSLine('{');
            addCSLine('get');
            addCSLine('{');
            if (type.primitive) {
                addCSLine(`return get${camName}(InstanceId);`);
            } else {
                addCSLine(`var ret = get${camName}(InstanceId);`);
                addCSLine(`return JsonUtility.FromJson<${type.typeName}>(ret);`);
            }
            addCSLine('}');
            if (!data.readonly) {
                addCSLine('set');
                addCSLine('{');
                if (type.primitive) {
                    addCSLine(`set${camName}(InstanceId, value);`);
                } else {
                    addCSLine('var json = JsonUtility.ToJson(value);');
                    addCSLine(`set${camName}(InstanceId, json);`);
                }
                addCSLine('}');
            }
            addCSLine('}');
        }
    };

    var methodAddCSLine = (methodName, method) => {
        var isVoid = method.cs_type[0].typeName === 'void';
        var isPrimitive = method.cs_type[0].primitive;
        var retType = method.cs_type[0].typeName;
        var proxyType = method.cs_type[0].proxyType;
        var isPromise = method.promise;

        var paramPattern = method.param_pattern ? method.param_pattern : [{ pattern: [] }];

        for (var i = 0, il = paramPattern.length; i < il; i++) {
            var params = paramPattern[i].pattern;
            var paramString = params.map(pt => {
                var ret = `, ${pt.cs_type.typeName} ${pt.paramName}`;
                if (pt.cs_type.optional) {
                    if (pt.primitive) {
                        ret += ` = ${primitiveDefault[pt.paramName]}`;
                    } else {
                        ret += ` = null`;
                    }
                }
                return ret;
            });
            var paramString2 = params.map(pt => pt.paramName).join(', ');
            paramString2 = paramString2 ? ', ' + paramString2 : '';
            var paramString3 = params.map(pt => pt.cs_type.typeName + ' ' + pt.paramName).join(', ');
            paramString3 = paramString3 ? ', ' + paramString3 : '';

            addCSLine();
            if (isPromise) {
                addCSLine(`private Action<${isVoid ? 'string' : proxyType}> __${methodName};`);
                addCSLineWithDllImport(`private static extern void _${methodName}(string instanceId, ${paramString})`);
                addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyType}>))]`);
                addCSLine(`private static void res_${methodName}(string instanceId` + (isVoid ? ', string error' : `, ${proxyType} result`) + ')');
                addCSLine('{');
                if (isPrimitive) {
                    addCSLine(`Instances[instanceId].__${methodName}.Invoke(${isVoid ? 'error' : 'result'});`);
                } else {
                    addCSLine(`var res = JsonUtility.FromJson<${retType}>(result);`);
                    addCSLine(`Instances[instanceId].__${methodName}.Invoke(res);`);
                }
                addCSLine('}');
                addCSLine();
                addCSCode(`public Promise${isVoid ? '' : '<' + retType + '>'} ${methodName}(${paramString})`);
                addCSLine('{');
                if (isVoid) {
                    addCSLine(`var promise = new Promise((resolve, reject) =>`);
                    addCSLine('{');
                    addCSLine(`__${methodName} = (error) =>`);
                    addCSLine('{');
                    addCSLine('if(error == "")');
                    addCSLine('{');
                    addCSLine('resolve();');
                    addCSLine('}');
                    addCSLine('else');
                    addCSLine('{');
                    addCSLine('reject(new Exception(error));');
                } else {
                    addCSLine(`var promise = new Promise<${retType}>((resolve, reject) =>`);
                    addCSLine('{');
                    addCSLine(`__${methodName} = (result) =>`);
                    addCSLine('{');
                    addCSLine('if(result.error == "")');
                    addCSLine('{');
                    addCSLine('resolve(result);');
                    addCSLine('}');
                    addCSLine('else');
                    addCSLine('{');
                    addCSLine('reject(new Exception(result.error));');
                }
                addCSLine('}');
                addCSLine('};');
                addCSLine(`_${methodName}(InstanceId${paramString2});`);
                addCSLine('});');
                addCSLine('return promise;');
                addCSLine('}');
            } else {
                addCSLineWithDllImport(`private static extern ${proxyType} _${methodName}(string instanceId${paramString3});`);
                addCSLine(`public ${retType} ${methodName}(string instanceId${paramString3})`);
                addCSLine('{');
                if (isVoid) {
                    addCSLine(`_${methodName}(instanceId${paramString2});`);
                } else {
                    if (isPrimitive) {
                        addCSLine(`${isVoid ? '' : 'return '}_${methodName}(instanceId${paramString2});`);
                    } else {
                        addCSLine(`var json = _${methodName}(instanceId${paramString2});`);
                        addCSLine(`var ret = JsonUtility.fromJson<${retType}>(json);`);
                        addCSLine('return ret;');
                    }
                }
                addCSLine('}');
            }
        }
    };

    zip = new JSZip();
    saveIdlCode('WebIDL.txt', 'WebIDLEnum.txt');
    Object.keys(parseData).forEach(group => {
        var groupData = parseData[group];
        switch (group) {
            case 'Dictionary':
            case 'Interface':
                Object.keys(groupData).forEach(id => {
                    var data = groupData[id];
                    addCSLine('using AOT;');
                    addCSLine('using RSG;');
                    addCSLine('using System;');
                    addCSLine('using System.Collections.Generic;');
                    addCSLine('using System.Runtime.InteropServices;');
                    addCSLine('using UnityEngine;');
                    addCSLine();
                    addCSLine(`namespace ${managerNameSpace}`);
                    addCSLine('{');
                    addCSLine(`public class ${id}${data.Superclass ? ' : ' + data.SuperClass : ''}`);
                    addCSLine('{');
                    addCSLine(`public static Dictionary<string, ${id}> Instances; `);
                    addCSLine('public string InstanceId;');
                    addCSLine('public string error;');

                    if (data.Ctor) {
                        var ctorCSLine = function (params) {
                            addCSLine();
                            addCSLine(`public ${id} (${params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ')})`);
                            addCSLine(`{`);
                            addCSLine(`} `);
                        }
                        if (data.Ctor.param_pattern) {
                            for (var i = 0, il = data.Ctor.param_pattern.length; i < il; i++) {
                                ctorCSLine(data.Ctor.param_pattern[i].pattern);
                            }
                        } else {
                            ctorCSLine([]);
                        }
                    }

                    if (data.Attribute) {
                        Object.keys(data.Attribute).forEach(attributeName => {
                            attrOrMemberAddCSLine(attributeName, data.Attribute[attributeName]);
                        });
                    }

                    if (data.Member) {
                        Object.keys(data.Member).forEach(memberName => {
                            attrOrMemberAddCSLine(memberName, data.Member[memberName]);
                        });
                    }

                    if (data.Method) {
                        Object.keys(data.Method).forEach(methodName => {
                            methodAddCSLine(methodName, data.Method[methodName]);
                        });
                    }

                    if (data.EventHandler) {
                        data.EventHandler.forEach(eventHandlerName => {
                            addCSLine();
                            addCSLine(`[MonoPInvokeCallback(typeof (Action<string>))]`);
                            addCSLine(`private static void _${eventHandlerName}(string instanceId) `);
                            addCSLine('{');
                            addCSLine(`Instances[instanceId].${eventHandlerName}.Invoke();`);
                            addCSLine('}');
                            addCSLine(`public Action ${eventHandlerName};`);
                        });
                    }

                    addCSLine('}');
                    addCSLine('}');

                    saveCSCode(id + '.cs');
                    if (useListClasses.includes(id)) {
                        addCSLine('using System.Collections.Generic;');
                        addCSLine();
                        addCSLine(`namespace ${managerNameSpace}`);
                        addCSLine('{');
                        addCSLine(`public class ${id}Array`);
                        addCSLine('{');
                        addCSLine(`public ${id}[] array; `);
                        addCSLine('}');
                        addCSLine('}');
                        saveCSCode(id + 'Array.cs');
                    }
                });
                break;
            case 'Enum':
                addCSLine('using System;');
                addCSLine('using System.Collections.Generic;');
                addCSLine('using System.Linq;');
                addCSLine('using System.Text;');
                addCSLine();
                addCSLine(`namespace ${managerNameSpace} `);
                addCSLine('{');
                Object.keys(groupData).forEach(id => {
                    var enm = groupData[id];
                    addCSLine(`public enum ${id} ${enm.superClassName ? ' : ' + enm.superClassName : ''}`);
                    addCSLine(`{`);
                    enm.items && enm.item.forEach((item, idx) => {
                        addCSLine(`${camelize(item)}${enm.items.length - 1 > idx ? ',' : ''} // ${item}`);
                    });
                    addCSLine(`}`);
                });
                addCSLine(`}`);
                saveCSCode(`${managerNameSpace}_Enums.cs`);
                break;
            case 'Callback':
                break;
        }
    });

    zip.generateAsync({ type: 'blob' })
        .then((content) => {
            var a = document.createElement('a');
            a.download = `${zipFileName || 'cs'}.zip`;
            a.href = URL.createObjectURL(content);
            a.click();
        });
}

