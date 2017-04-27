
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
var jsCode = '';
var jsIndentSize = 2;
var jsIndentLevel = 0;
var csCode = '';
var csIndentSize = 2;
var csIndentLevel = 0;
var useListClasses = [];
var jslibName = 'UnityWebGLWebRTC';
var callbackFuncs = [];

function camelize(txt, forceUpperCase) {
    if (!txt.split) debugger;
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

function getJSIndent(size, level) {
    return [...Array(size * level)].map(x => ' ').join('');
}
function addJSIndent() {
    jsCode += getJSIndent(jsIndentSize, jsIndentLevel);
}
function addJSCode(code = '', isIndent) {
    if (isIndent) addJSIndent();
    jsCode += code;
}
function addJSLine(code = '') {
    if (code.startsWith('}') || code.startsWith(')')) jsIndentLevel--;
    addJSIndent();
    jsCode += code + '\r\n';
    if (code.endsWith('{') || code.endsWith('(')) jsIndentLevel++;
}
function addJSLineWithDllImport(id, funcName, funcType, retType, proxyType, params, isPromise, paramsMultiline) {
    switch (funcType) {
        case 'get':
            addJSLine(`${id}_get${funcName}: function(instanceId) {`);
            addJSLine(`var value = ${jslibName}.instances[instanceId].${funcName};`);
            if (proxyType === 'json') {
                addJSLine(`value = JSON.stringify(value);`)
            }
            addJSLine(`return value;`);
            addJSLine(`},`);
            break;
        case 'set':
            addJSLine(`${id}_set${funcName}: function(instanceId, value) {`);
            if (proxyType === 'json') {
                addJSLine('value = JSON.parse(value);');
            }
            addJSLine(`${jslibName}.instances[instanceId].${funcName} = value;`)
            addJSLine('},');
            break;
        case 'method':
            var paramString = params ? params.map(param => param.paramName).join(', ') : '';
            var paramString = '';
            if (paramsMultiline) {
                paramString = `\r\n${getJSIndent(jsIndentSize, jsIndentLevel + 1)}${params.map(param => param.paramName).join(',\r\n')}`;
            } else {
                paramString = params ? params.map(param => param.paramName).join(', ') : '';
            }
            addJSLine(`${id ? id + '_' : ''}${funcName}: function(instanceId${paramString ? ', ' + paramString : ''}) {`);
            if (params) params.forEach(param => {
                if (param.cs_type.proxyType === 'json') {
                    addJSLine(`${param.paramName} = JSON.parse(${param.paramName});`);
                }
            });
            if (isPromise) {
                addJSLine(`${jslibName}.instances[instanceId].${funcName}(${paramString}).then(res => {`);
                addJSLine('var args = [instanceId];');
                if (retType !== 'void') {
                    if (proxyType === 'json') {
                        addJSLine('res = args.push(JSON.stringify(res));');
                    }
                    addJSLine('args.push(res);');
                }
                addJSLine(`_UnityCall(${id}_res${funcName}, args);`);
                addJSLine('});');
            } else {
                if (retType === 'void') {
                    addJSLine(`${id ? jslibName + '.': ''}instances[instanceId].${funcName}(${paramString});`);
                } else {
                    addJSLine(`var res = ${id ? jslibName + '.': ''}instances[instanceId].${funcName}(${paramString});`);
                    if (proxyType === 'json') {
                        addJSLine('res = JSON.stringify(res);');
                    }
                    addJSLine('return res;');
                }
            }
            addJSLine(`},`);
            break;
    }
}
function saveJSCode(fileName) {
    zip.file(fileName, jsCode);
    jsCode = '';
    jsIndentLevel = 0;
}

function getCSIndent(size, level) {
    return [...Array(size * level)].map(x => ' ').join('');
}
function addCSIndent() {
    csCode += getCSIndent(csIndentSize, csIndentLevel);
}
function addCSLine(code = '') {
    if (code.startsWith('}')) csIndentLevel--;
    addCSIndent();
    csCode += code + '\r\n';
    if (code === '{') csIndentLevel++;
}
function addCSLineWithDllImport(id, funcName, funcType, retType, proxyType, params, isPromise, public, paramsMultiline) {
    addCSLine('[DllImport("__Internal")]');
    var paramString = '';
    if (paramsMultiline) {
        paramString = `\r\n${getCSIndent(csIndentSize, csIndentLevel + 1)}${params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(',\r\n')}`;
    } else {
        paramString = params ? params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ') : '';
    }
    paramString = paramString ? ', ' + paramString : '';
    switch (funcType) {
        case 'get':
            addCSLine(`${public ? 'public' : 'private'} static extern ${retType} ${id ? id + '_' : ''}_get${funcName}(string instanceId${paramString});`);
            break;
        case 'set':
            addCSLine(`${public ? 'public' : 'private'} static extern void ${id ? id + '_' : ''}_set${funcName}(string instanceId, ${retType} value);`);
            break;
        case 'method':
            addCSLine(`${public ? 'public' : 'private'} static extern ${retType} ${id ? id + '_' : ''}${funcName}(string instanceId${paramString});`);
            break;
    }
    addJSLineWithDllImport(id, funcName, funcType, retType, proxyType, params, isPromise, paramsMultiline);
}
function addCSLineWithMonoPInvokeCallback(id, funcName, isVoid, proxyType) {
    addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyType}>))]`);
    addCSLine(`public static void ${id ? id + '_' : ''}res${funcName}(string instanceId${isVoid ? ', string error' : ', ' + proxyType + ' result'})`);
    callbackFuncs.push({
        cs_type: {
            typeName: `Action<string${isVoid ? '' : ', ' + (proxyType === 'json' ? 'string' : proxyType)}>`
        },
        paramName: funcName
    });
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

function generateUnityProxyCode(parseData, zipFileName) {
    addJSLine(`${jslibName}Plugin = {`);

    var attrOrMemberAddCSLine = (id, name, data) => {
        var camName = camelize(name, true);
        var type = data.cs_type[0];
        if (type.array && !type.primitive) {
            useListClasses.push(type.typeName);
        }
        var retType = type.proxyType === 'json' ? 'string' : type.typeName;

        addCSLine();
        //addCSLineWithDllImport(`private static extern ${retType} get${camName}(string instanceId);`);
        addCSLineWithDllImport(id, camName, 'get', retType, type);
        if (!data.readonly) {
            //addCSLineWithDllImport(`private static extern void set${camName}(string instanceId, ${retType} value);`);
            addCSLineWithDllImport(id, camName, 'set', retType, type);
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

    var methodAddCSLine = (id, methodName, method) => {
        var isVoid = method.cs_type[0].typeName === 'void';
        var isPrimitive = method.cs_type[0].primitive;
        var retType = method.cs_type[0].typeName;
        var proxyType = method.cs_type[0].proxyType;
        var isPromise = method.Promise;

        var paramPattern = method.param_pattern ? method.param_pattern : [{ pattern: [] }];

        for (var i = 0, il = paramPattern.length; i < il; i++) {
            var params = paramPattern[i].pattern;
            var paramTNO = params.map(param => {
                var ret = `${param.cs_type.typeName} ${param.paramName}`;
                if (param.cs_type.optional) {
                    if (param.primitive) {
                        ret += ` = ${primitiveDefault[param.paramName]}`;
                    } else {
                        ret += ` = null`;
                    }
                }
                return ret;
            }).join(', ');
            paramTNO = paramTNO ? ', ' + paramTNO : '';
            var paramN = params.map(param => param.paramName).join(', ');
            paramN = paramN ? ', ' + paramN : '';
            var paramTN = params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ');
            paramTN = paramTN ? ', ' + paramTN : '';

            addCSLine();
            if (isPromise) {
                addCSLine(`private Action<${isVoid ? 'string' : proxyType}> ${id}___${methodName};`);
                //addCSLineWithDllImport(`private static extern void _${methodName}(string instanceId${paramTN})`);
                addCSLineWithDllImport(id, '_' + methodName, 'method', 'void', method.cs_type[0], params, true);
                // addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyType}>))]`);
                // addCSLine(`private static void res${methodName}(string instanceId${isVoid ? ', string error' : ', ' + proxyType + 'result'})`);
                addCSLineWithMonoPInvokeCallback(id, methodName, isVoid, proxyType);
                addCSLine('{');
                if (isPrimitive) {
                    addCSLine(`Instances[instanceId].__${methodName}.Invoke(${isVoid ? 'error' : 'result'});`);
                } else {
                    addCSLine(`var res = JsonUtility.FromJson<${retType}>(result);`);
                    addCSLine(`Instances[instanceId].__${methodName}.Invoke(res);`);
                }
                addCSLine('}');
                addCSLine();
                addCSLine(`public Promise${isVoid ? '' : '<' + retType + '>'} ${methodName}(${paramTNO})`);
                addCSLine('{');
                if (isVoid) {
                    addCSLine(`var promise = new Promise((resolve, reject) =>`);
                    addCSLine('{');
                    addCSLine(`${id}___${methodName} = (error) =>`);
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
                    addCSLine(`${id}___${methodName} = (result) =>`);
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
                addCSLine(`${id}__${methodName}(InstanceId${paramN});`);
                addCSLine('});');
                addCSLine('return promise;');
                addCSLine('}');
            } else {
                //addCSLineWithDllImport(`private static extern ${retType} _${methodName}(string instanceId${strParamTN});`);
                addCSLineWithDllImport(id, methodName, 'method', retType, method.cs_type[0], params);
                addCSLine(`public ${retType} ${methodName}(${paramTNO})`);
                addCSLine('{');
                if (isVoid) {
                    addCSLine(`_${methodName}(instanceId${paramN});`);
                } else {
                    if (isPrimitive) {
                        addCSLine(`${isVoid ? '' : 'return '}_${methodName}(InstanceId${paramN});`);
                    } else {
                        addCSLine(`var json = _${methodName}(InstanceId${paramN});`);
                        addCSLine(`var ret = JsonUtility.fromJson<${retType}>(json);`);
                        addCSLine('return ret;');
                    }
                }
                addCSLine('}');
            }
        }
    };

    zip = new JSZip();
    zip.file('parseData.json', JSON.stringify(parseData, null, 2));
    //saveIdlCode('WebIDL.txt', 'WebIDLEnum.txt');
    Object.keys(parseData).forEach(group => {
        var callbackFuncs = [];
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
                    addCSLine(`namespace ${jslibName}Proxy`);
                    addCSLine('{');
                    addCSLine(`public class ${id}${data.Superclass ? ' : ' + data.SuperClass : ''}`);
                    addCSLine('{');
                    addCSLine(`public static Dictionary<string, ${id}> Instances; `);
                    addCSLine('public string InstanceId;');
                    addCSLine('public string error;');

                    if (!data.partial) {
                        var ctorCSLine = function (params) {
                            addCSLine();
                            addCSLineWithDllImport(id, 'instantiate', 'method', 'void', null, null, false)
                            addCSLine(`public ${id} (${params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ')})`);
                            addCSLine(`{`);
                            addCSLine(`InstanceId = ${id}_instantiate(${params.map(param => param.paramName).join(', ')});`);
                            addCSLine(`} `);
                        }
                        if (data.ctor && data.Ctor.param_pattern) {
                            for (var i = 0, il = data.Ctor.param_pattern.length; i < il; i++) {
                                ctorCSLine(data.Ctor.param_pattern[i].pattern);
                            }
                        } else {
                            ctorCSLine([]);
                        }
                    }

                    if (data.Attribute) {
                        Object.keys(data.Attribute).forEach(attributeName => {
                            attrOrMemberAddCSLine(id, attributeName, data.Attribute[attributeName]);
                        });
                    }

                    if (data.Member) {
                        Object.keys(data.Member).forEach(memberName => {
                            attrOrMemberAddCSLine(id, memberName, data.Member[memberName]);
                        });
                    }

                    if (data.Method) {
                        Object.keys(data.Method).forEach(methodName => {
                            methodAddCSLine(id, methodName, data.Method[methodName]);
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

                    addCSLine('public void Dispose()');
                    addCSLine('{');
                    addCSLine(`if(${jslibName}.instance_dispose(InstanceId) == false)`);
                    addCSLine('{');
                    addCSLine('throw new Exception("Dispose error.")');
                    addCSLine('}');
                    addCSLine('}');

                    saveCSCode(id + '.cs');

                    if (useListClasses.includes(id)) {
                        addCSLine('using System.Collections.Generic;');
                        addCSLine();
                        addCSLine(`namespace ${jslibName}Proxy`);
                        addCSLine('{');
                        addCSLine(`public class ${id}Array`);
                        addCSLine('{');
                        addCSLine(`public ${id}[] array; `);
                        addCSLine('}');
                        addCSLine('}');
                        saveCSCode(`${id}Array.cs`);
                    }
                });
                break;
            case 'Enum':
                addCSLine('using System;');
                addCSLine('using System.Collections.Generic;');
                addCSLine('using System.Linq;');
                addCSLine('using System.Text;');
                addCSLine();
                addCSLine(`namespace ${jslibName}Proxy`);
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
                saveCSCode(`${jslibName}Proxy_Enums.cs`);
                break;
            case 'Callback':
                break;
        }
    });

    addCSLine('using System;');
    addCSLine('using UnityEngine;');
    addCSLine(`namespace ${jslibName}Proxy`);
    addCSLine('{');
    addCSLine(`public class Manager`);
    addCSLine('{');
    addCSLineWithDllImport('', 'instance_dispose', 'method', 'bool');
    addCSLine();
    addCSLineWithDllImport('', 'proxyInit', 'method', 'void', null, callbackFuncs, null, true, true);
    addCSLine('public static ProxyInit()');
    addCSLine('{');
    callbackFuncs.forEach((func, idx) => {
        addCSLine(`${func.id}.${func.funcName}${idx === callbackFuncs.length - 1 ? '' : ','}`);
    });
    addCSLine('}');
    addCSLine('}');
    addCSLine('}');
    saveCSCode(`${jslibName}.cs`);

    addJSLine('proxyInit: function(');
    callbackFuncs.forEach((func, idx) => {
        addJSLine(`${func.id}_${func.funcName}${idx === callbackFuncs.length - 1 ? '' : ','}`);
    });
    addJSLine(') {');
    callbackFuncs.forEach((func, idx) => {
        addJSLine(`${jslibName}.${func.id}_${func.funcName}${idx === callbackFuncs.length - 1 ? '' : ','}`);
    });
    addJSLine('},');
    addJSLine();
    addJSLine(`instance_dispose: function(instanceId) {`);
    addJSLine(`delete ${jslibName}.instances[instanceId];`);
    addJSLine('},');
    addJSLine();
    addJSLine(`$${jslibName}: {`);
    addJSLine('instances: {},');
    callbackFuncs.forEach((func, idx) => {
        addJSLine(`${func.id}_${func.funcName}: null${idx === callbackFuncs.length - 1 ? '' : ','}`);
    });
    addJSLine('}');
    addJSLine('}');
    addJSLine(`autoAddDeps(${jslibName}Plugin, '$${jslibName}');`);
    addJSLine(`mergeInto(LibraryManager.library, ${jslibName}Plugin);`);
    saveJSCode(`${jslibName}.jslib`);

    zip.generateAsync({ type: 'blob' })
        .then((content) => {
            var a = document.createElement('a');
            a.download = `${zipFileName || 'cs'}.zip`;
            a.href = URL.createObjectURL(content);
            a.click();
        });
}

