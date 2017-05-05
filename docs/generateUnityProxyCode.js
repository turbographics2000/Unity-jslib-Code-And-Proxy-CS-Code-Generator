
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

function addJSIndent() {
    jsCode += [...Array(jsIndentSize * jsIndentLevel)].map(x => ' ').join('');
}
function addJSLine(code = '') {
    if (code.startsWith('}') || code.startsWith(')')) jsIndentLevel--;
    addJSIndent();
    jsCode += code + '\r\n';
    if (code.endsWith('{') || code.endsWith('(')) jsIndentLevel++;
}
function addJSLineWithDllImport(id, funcName, funcType, retType, proxyJSON, params, isPromise) {
    switch (funcType) {
        case 'get':
            addJSLine(`${id}_get${funcName}: function(instanceId) {`);
            addJSLine(`var value = ${jslibName}.instances[instanceId].${funcName};`);
            if (proxyJSON) {
                addJSLine(`value = JSON.stringify(value);`)
            }
            addJSLine(`return value;`);
            addJSLine(`},`);
            break;
        case 'set':
            addJSLine(`${id}_set${funcName}: function(instanceId, value) {`);
            if (proxyJSON) {
                addJSLine('value = JSON.parse(value);');
            }
            addJSLine(`${jslibName}.instances[instanceId].${funcName} = value;`)
            addJSLine('},');
            break;
        case 'method':
            var paramString = params ? params.map(param => param.paramName).join(', ') : '';
            addJSLine(`${id}_${funcName}: function(instanceId${paramString ? ', ' + paramString : ''}) {`);
            if (params) params.forEach(param => {
                if (param.data_type.proxyJSON) {
                    addJSLine(`${param.paramName} = JSON.parse(${param.paramName});`);
                }
            });
            if (isPromise) {
                addJSLine(`${jslibName}.instances[instanceId].${funcName}(${paramString}).then(res => {`);
                addJSLine('var args = [instanceId];');
                if (retType !== 'void') {
                    if (proxyJSON) {
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
                    if (proxyJSON) {
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

function addCSIndent() {
    csCode += [...Array(csIndentSize * csIndentLevel)].map(x => ' ').join('');
}
function addCSLine(code = '') {
    if (code.startsWith('}')) csIndentLevel--;
    addCSIndent();
    csCode += code + '\r\n';
    if (code === '{') csIndentLevel++;
}
function addCSLineWithDllImport(id, funcName, funcType, retType, proxyJSON, params, isPromise) {
    addCSLine('[DllImport("__Internal")]');
    var paramString = params ? params.map(param => param.data_type.csTypeName + ' ' + param.paramName).join(', ') : '';
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
    addJSLineWithDllImport(id, funcName, funcType, retType, proxyJSON, params, isPromise);
}
function addCSLineWithMonoPInvokeCallback(id, funcName, isVoid, proxyJSON) {
    addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyJSON}>))]`);
    addCSLine(`public static void ${id}_res${funcName}(string instanceId${isVoid ? ', string error' : ', ' + proxyJSON + ' result'})`);
    callbackFuncs.push({ id, funcName, isVoid, proxyJSON });
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
        var type = data.data_type[0];
        if (type.array && !type.primitive) {
            useListClasses.push(type.csTypeName);
        }
        var retType = !!type.proxyJSON ? 'string' : type.csTypeName;

        addCSLine();
        //addCSLineWithDllImport(`private static extern ${retType} get${camName}(string instanceId);`);
        addCSLineWithDllImport(id, camName, 'get', retType, type);
        if (!data.readonly) {
            //addCSLineWithDllImport(`private static extern void set${camName}(string instanceId, ${retType} value);`);
            addCSLineWithDllImport(id, camName, 'set', retType, type);
        }
        if (type.array) {
            addCSLine(`public ${type.csTypeName}[] ${name}`);
            addCSLine('{');
            addCSLine('get');
            addCSLine('{');
            addCSLine(`var ret = get${camName}(InstanceId);`);
            addCSLine(`return JsonUtility.FromJson<${type.csTypeName + 'Array'}>(ret).arr;`);
            addCSLine('}');
            if (!data.readonly) {
                addCSLine('set');
                addCSLine('{');
                addCSLine(`var tmp = new ${type.csTypeName}Array();`);
                addCSLine('tmp.array = value;');
                addCSLine('var json = JsonUtility.ToJson(tmp);');
                addCSLine(`set${camName}(InstanceId, json);`);
                addCSLine('}');
            }
            addCSLine('}');
        } else {
            addCSLine(`public ${type.csTypeName} ${name}`);
            addCSLine('{');
            addCSLine('get');
            addCSLine('{');
            if (type.primitive) {
                addCSLine(`return get${camName}(InstanceId);`);
            } else {
                addCSLine(`var ret = get${camName}(InstanceId);`);
                addCSLine(`return JsonUtility.FromJson<${type.csTypeName}>(ret);`);
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
        var isVoid = method.data_type[0].csTypeName === 'void';
        var isPrimitive = method.data_type[0].primitive;
        var retType = method.data_type[0].csTypeName;
        var proxyJSON = !!method.data_type[0].proxyJSON;
        var isPromise = method.Promise;

        var paramPattern = method.cs_param_pattern ? method.cs_param_pattern : [];

        for (var i = 0, il = paramPattern.length; i < il; i++) {
            var params = paramPattern[i];
            var paramTNO = params.map(param => {
                var ret = `${param.data_type.csTypeName} ${param.paramName}`;
                if (param.data_type.optional) {
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
            var paramTN = params.map(param => param.data_type.csTypeName + ' ' + param.paramName).join(', ');
            paramTN = paramTN ? ', ' + paramTN : '';

            addCSLine();
            if (isPromise) {
                addCSLine(`private Action<${isVoid ? 'string' : proxyJSON}> ${id}___${methodName};`);
                //addCSLineWithDllImport(`private static extern void _${methodName}(string instanceId${paramTN})`);
                addCSLineWithDllImport(id, '_' + methodName, 'method', 'void', proxyJSON, params, true);
                // addCSLine(`[MonoPInvokeCallback(typeof(Action<string${isVoid ? '' : ', ' + proxyJSON}>))]`);
                // addCSLine(`private static void res${methodName}(string instanceId${isVoid ? ', string error' : ', ' + proxyJSON + 'result'})`);
                addCSLineWithMonoPInvokeCallback(id, methodName, isVoid, proxyJSON);
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
                addCSLineWithDllImport(id, methodName, 'method', retType, proxyJSON, params);
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
                    addCSLine(`public static Dictionary<string, ${id}> Instances;`);
                    addCSLine('public string InstanceId;');
                    addCSLine('public string error;');

                    if (!data.partial) {
                        var ctorCSLine = function (params) {
                            addCSLine();
                            addCSLineWithDllImport(id, 'instantiate', 'method', 'void', null, null, false)
                            addCSLine(`public ${id} (${params.map(param => param.data_type.csTypeName + ' ' + param.paramName).join(', ')})`);
                            addCSLine(`{`);
                            addCSLine(`InstanceId = ${id}_instantiate(${params.map(param => param.paramName).join(', ')});`);
                            //data.EventHandler.forEach(eventHandlerName => {
                            addCSLine(``)
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
                            addCSLine(`public static void _${eventHandlerName}(string instanceId) `);
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

    // var itemTypes = ['sbyte', 'byte', 'short', 'ushort', 'int', 'uint', 'float', 'double'];
    // ['ArrayBuffer', 'TypedArray'].forEach(className => {
    //     addCSLine('using AOT;');
    //     addCSLine('using RSG;');
    //     addCSLine('using System;');
    //     addCSLine('using System.Collections.Generic;');
    //     addCSLine('using System.Runtime.InteropServices;');
    //     addCSLine('using UnityEngine;');
    //     addCSLine();
    //     addCSLine(`namespace ${jslibName}Proxy`);
    //     addCSLine('{');
    //     addCSLine(`public ${className === 'TypedArray' ? 'abstract' : ''} class ${className}`);
    //     addCSLine('{');
    //     addCSLine(`public Dictionary<string, ${className}> Instances;`);
    //     addCSLine('public string InstanceId');
    //     if (className === 'TypeArray') addCSLine('public string BufferInstanceId');
    //     addCSLine();
    //     addCSLine('[DllImport("__Internal")]');
    //     addCSLine(`private static extern string ${className}_instantiate(int length);`);
    //     addCSLine('[DllImport("__Internal")]');
    //     addCSLine('private static extern int getByteLength(string instanceId)');
    //     addCSLine();
    //     if (className === 'TypeArray') {
    //         addCSLine('[DllImport("__Internal")]');
    //         addCSLine(`protected static extern string TypedArray_instantiate(string ArrayBufferInstanceId, int offset, int length);`);

    //         itemTypes.forEach(itemTypeName => {
    //             addCSLine('[DllImport("__Internal")]');
    //             addCSLine(`protected static extern string TypedArray_instantiate_from_${itemTypeName}_array(${itemTypeName}[] srcArray);`);
    //             addCSLine();
    //         });


    //         addCSLine('public buffer');
    //         addCSLine('{');
    //         addCSLine('get');
    //         addCSLine('{');
    //         addCSLine('var bufferInstanceId = TypedArray_getBuffer(InstanceId);');
    //         addCSLine('return ArrayBuffer.Instances[bufferInstanceId];');
    //         addCSLine('}');
    //         addCSLine('}');
    //         addCSLine();
    //         addCSLine('public int byteOffset');
    //         addCSLine('{');
    //         addCSLine('get');
    //         addCSLine('{');
    //         addCSLine('var byteOffset = TypedArray_getByteOffset(InstanceId);');
    //         addCSLine('return byteOffset');
    //         addCSLine('}');
    //         addCSLine('}');
    //         addCSLine();
    //         addCSLine('public int length');
    //         addCSLine('{');
    //         addCSLine('get');
    //         addCSLine('{');
    //         addCSLine('var length = TypedArray_getLength(InstanceId);');
    //         addCSLine('return length');
    //         addCSLine('}');
    //         addCSLine('}');
    //         addCSLine();

    //         addCSLine(`public ${className}(int length)`);
    //         addCSLine('{');
    //         addCSLine(`var InstanceId = ${className}_instantiate(length);`);
    //         addCSLine('var bufferInstanceId = TypedArray_getBuffer(InstanceId);');
    //         addCSLine('}');
    //         addCSLine();
    //         addCSLine(`public ${className}(TypedArray src)`);
    //         addCSLine('{');
    //         addCSLine(`var InstanceId = ${className}_instantiate(src.instanceId);`);
    //         addCSLine('var bufferInstanceId = TypedArray_getBuffer(InstanceId);');
    //         addCSLine('}');
    //         addCSLine();
    //         addCSLine(`public ${className}(ArrayBuffer src, int index, int length)`);
    //         addCSLine('{');
    //         addCSLine(`var InstanceId = ${className}_instantiate(src.instanceId, index, length);`);
    //         addCSLine('var bufferInstanceId = TypedArray_getBuffer(InstanceId);');
    //         addCSLine('}');
    //         addCSLine();
    //         ['sbyte', 'byte', 'short', 'ushort', 'int', 'uint', 'float', 'double'].forEach(typeName => {
    //             addCSLine(`public ${className}(${typeName}[] src)`);
    //             addCSLine('{');
    //             addCSLine(`var InstanceId = ${className}_instantiate(src);`);
    //             addCSLine('var bufferInstanceId = TypedArray_getBuffer(InstanceId);');
    //             addCSLine('}');
    //             addCSLine();
    //         });
    //         addCSLine('public int this[int index]');
    //         addCSLine('{');
    //         addCSLine('get');
    //         addCSLine('{');
    //         addCSLine('var value = TypedArray_getValue(InstanceId, index);');
    //         addCSLine('return value;');
    //         addCSLine('}');
    //         addCSLine('}');
    //         addCSLine();
    //     } else {
    //         addCSLine('[DllImport("__Internal")]');
    //         addCSLine('private static extern void slice(string instanceId, int begin, int end);');
    //         addCSLine();
    //         addCSLine(`public ${className}(int length)`);
    //         addCSLine('{');
    //         addCSLine(`var InstanceId = ${className}_instantiate(length);`);
    //         addCSLine('}');
    //         addCSLine();
    //     }
    //     addCSLine('public int byteLength');
    //     addCSLine('{');
    //     addCSLine('get');
    //     addCSLine('{');
    //     addCSLine('var byteLength = getByteLength(InstanceId);');
    //     addCSLine('return byteLength;');
    //     addCSLine('}');
    //     addCSLine('}');
    //     addCSLine();

    //     addCSLine('}');
    //     addCSLine('}');
    //     saveCSCode(`${className}.cs`);
    // });

    [
        'Int8Array',
        'Uint8Array',
        'Uint8ClampedArray',
        'Int16Array',
        'Uint16Array',
        'Int32Array',
        'Uint32Array',
        'Fload32Array',
        'Float64Array'
    ].forEach(className => {
        addCSLine('using AOT;');
        addCSLine('using RSG;');
        addCSLine('using System;');
        addCSLine('using System.Collections.Generic;');
        addCSLine('using System.Runtime.InteropServices;');
        addCSLine('using UnityEngine;');
        addCSLine();
        addCSLine(`namespace ${jslibName}Proxy`);
        addCSLine('{');
        addCSLine(`public class ${className} : TypedArray`);
        addCSLine('{');
        addCSLine('}');
        addCSLine('}');
        saveCSCode(`${className}.cs`);
    });

    addCSLine('using AOT;');
    addCSLine('using RSG;');
    addCSLine('using System;');
    addCSLine('using System.Collections.Generic;');
    addCSLine('using System.Runtime.InteropServices;');
    addCSLine('using UnityEngine;');
    addCSLine();
    addCSLine(`namespace ${jslibName}Proxy`);
    addCSLine('{');
    addCSLine(`public class Manager`);
    addCSLine('{');
    addCSLine('[DllImport("__Internal")]');
    addCSLine(`private static extern bool instance_dispose(string instanceId);`);
    addCSLine();
    addCSLine('[DllImport("__Internal")]');
    addCSLine('public static extern proxyInit(');
    callbackFuncs.forEach((func, idx) => {
        addCSLine(`Action<string${func.isVoid ? '' : ', ' + !!func.proxyJSON ? 'string' : func.data_type.typeName}> ${func.id}.${func.funcName}${idx === callbackFuncs.length - 1 ? '' : ','}`);
    });
    addCSLine(');');
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
        addJSLine(`${jslibName}.${func.id}_${func.funcName} = ${func.funcName};`);
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

