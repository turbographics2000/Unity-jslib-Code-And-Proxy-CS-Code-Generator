
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

function addJSIndent() {
    jsCode += [...Array(jsIndentSize * jsIndentLevel)].map(x => ' ').join('');
}
function addJSCode(code = '', isIndent) {
    if (isIndent) addJSIndent();
    jsCode += code;
}
function addJSLine(code = '') {
    if (code.includes('}')) jsIndentLevel--;
    addJSIndent();
    jsCode += code + '\r\n';
    if (code.includes('{')) jsIndentLevel++;
}
function addJSLineWithDllImport(id, funcName, funcType, retType, proxyType, params, isPromise) {
    switch (funcType) {
        case 'get':
            addJSLine(`${id}_get${funcName}: function(instanceId) {`);
            addJSLine(`var value = ${jslibName}.instances[instanceId].${funcName}`);
            if (proxyType === 'json') {
                addJSLine(`value = JSON.stringify(val);`)
            }
            addJSLine(`return value;`);
            addJSLine(`},`);
            break;
        case 'set':
            addJSLine(`${id}_set${funcName}: function(instanceId, value) {`);
            if (proxyType === 'json') {
                addJSLine('value = JSON.parse(value);');
            }
            addJSLine(`${jslibName}.instances[instanceId].${funcName} = val;`)
            addJSLine('},');
            break;
        case 'method':
            var paramString = params ? params.map(param => param.paramName).join(', ') : '';
            paramString = paramString ? ', ' + paramString : '';
            addJSLine(`function ${id}_${funcName}(instanceId${paramString}) {`);
            params.forEach(param => {
                if (param.cs_type.proxyType === 'json') {
                    addJSLine(`${param.paramName} = JSON.parse(${param.paramName};`);
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
                    addJSLine(`${jslibName}.instances[instanceId].${funcName}(${paramString});`);
                } else {
                    addJSLine(`var res = ${jslibName}.instances[instanceId].${funcName}(${paramString});`);
                    if (proxyType === 'json') {
                        addJSLine('res = JSON.stringify(res);');
                    }
                    addJSLine('return res;');
                }
            }
            addJSLine(`}`);
            break;
    }
}

function addCSIndent() {
    csCode += [...Array(csIndentSize * csIndentLevel)].map(x => ' ').join('');
}
function addCSLine(code = '') {
    if (code.startsWith('}')) csIndentLevel--;
    addCSIndent();
    csCode += code + '\r\n';
    if (code === '{') csIndentLevel++;
}
function addCSLineWithDllImport(id, funcName, funcType, retType, proxyType, params, isPromise) {
    addCSLine('[DllImport("__Internal")]');
    var paramString = params ? params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ') : '';
    paramString = paramString ? ', ' + paramString : '';
    switch (funcType) {
        case 'get':
            addCSLine(`private static extern ${retType} ${id}_get${funcName}(string instanceId${paramString});`);
            break;
        case 'set':
            addCSLine(`private static extern void ${id}_set${funcName}(string instanceId, ${retType} value);`);
            break;
        case 'method':
            addCSLine(`private static extern ${retType} ${id}_${funcName}(string instanceId${paramString});`);
            break;
    }
}
function addCSLineWithMonoPInvokeCallback(id, funcName, isVoid, proxyType) {
    addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyType}>))]`);
    addCSLine(`public static void ${id}_res${funcName}(string instanceId${isVoid ? ', string error' : ', ' + proxyType + ' result'})`);
    pinvokeFuncs.push({id, funcName, isVoid, proxyType});
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
    convertToCSData(parseData);

    addJSLine(`${jslibName}Plugin = {`);
    addJSLine(`$${jslibName}: {`);
    addJSLine('instances: {}');
    addJSLine('},');

    var attrOrMemberAddCSLine = (id, name, data) => {
        var camName = camelize(name, true);
        var type = data.cs_type[0];
        if (type.array && !type.primitive) {
            useListClasses.push(type.typeName);
        }
        var retType = type.proxyType === 'json' ? 'string' : type.typeName;

        addCSLine();
        //addCSLineWithDllImport(`private static extern ${retType} get${camName}(string instanceId);`);
        addCSLineWithDllImport(id, camName, 'get', retType, type.proxyType);
        if (!data.readonly) {
            //addCSLineWithDllImport(`private static extern void set${camName}(string instanceId, ${retType} value);`);
            addCSLineWithDllImport(id, camName, 'set', retType, type.proxyType);
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
        var isPromise = method.promise;

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
            paramNTO = strParamNTO ? ', ' + strParamNTO : '';
            var paramN = params.map(param => param.paramName).join(', ');
            paramN = paramN ? ', ' + paramN : '';
            var paramTN = params.map(param => param.cs_type.typeName + ' ' + param.paramName).join(', ');
            paramTN = paramTN ? ', ' + paramTN : '';

            addCSLine();
            if (isPromise) {
                addCSLine(`private Action<${isVoid ? 'string' : proxyType}> __${methodName};`);
                //addCSLineWithDllImport(`private static extern void _${methodName}(string instanceId${paramTN})`);
                addCSLineWithDllImport(id, methodName, 'method', 'void', proxyType, params, true);
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
                addCSCode(`public Promise${isVoid ? '' : '<' + retType + '>'} ${methodName}(${paramTNO})`);
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
                addCSLine(`_${id}_${methodName}(InstanceId${strParamName});`);
                addCSLine('});');
                addCSLine('return promise;');
                addCSLine('}');
            } else {
                //addCSLineWithDllImport(`private static extern ${retType} _${methodName}(string instanceId${strParamTN});`);
                addCSLineWithDllImport(id, methodName, 'method', retType, proxyType, params);
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
    saveIdlCode('WebIDL.txt', 'WebIDLEnum.txt');
    Object.keys(parseData).forEach(group => {
        var pinvokeFuncs = [];
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
                            addCSLineWithDllImport(id, id + '_instantiate', 'method', 'void', null, null, false)
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
                            attrOrMemberAddCSLine(attributeName, data.Attribute[attributeName]);
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

                    addCSLineWithDllImport(`private static extern bool _${id}Dispose(string instanceId${paramString3});`);
                    addCSLine('public void Dispose()');
                    addCSLine('{');
                    addCSLine(`if(${id}_dispose(InstanceId) == false)`);
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
    addCSLine('public static ProxyInit()');
    addCSLine('{');
    pinvokeFuncs.forEach((func, idx)  => {
        addCSLine(`${id}.${funcName}${idx === pinvokeFuncs.length - 1 ? '' : ','}`);
    });
    addCSLine('}');
    addCSLine('}');
    addCSLine('}');
    saveCSCode('Manager.cs');

    addJSLine();
    addJSLine(`${id}_dispose: function(instanceId) {`);
    addJSLine(`delete ${jslibName}.instances[instanceId];`);
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
