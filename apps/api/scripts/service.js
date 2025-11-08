"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePythonScript = executePythonScript;
exports.executePythonScriptJSON = executePythonScriptJSON;
exports.processDataWithPython = processDataWithPython;
exports.analyzeDataWithPython = analyzeDataWithPython;
// Python模块服务
const executor_1 = require("./utils/executor");
/**
 * 执行Python脚本
 */
async function executePythonScript(script, args, options) {
    return (0, executor_1.executePython)({
        script,
        args,
        timeout: options?.timeout,
        pythonPath: options?.pythonPath
    });
}
/**
 * 执行Python脚本并返回JSON结果
 */
async function executePythonScriptJSON(script, args, options) {
    return (0, executor_1.executePythonJSON)({
        script,
        args,
        timeout: options?.timeout,
        pythonPath: options?.pythonPath
    });
}
/**
 * 示例：处理数据的Python脚本调用
 */
async function processDataWithPython(data) {
    return executePythonScriptJSON('process_data.py', {
        input_data: data
    });
}
/**
 * 示例：分析数据的Python脚本调用
 */
async function analyzeDataWithPython(data) {
    return executePythonScriptJSON('analyze_data.py', {
        input_data: data
    });
}
