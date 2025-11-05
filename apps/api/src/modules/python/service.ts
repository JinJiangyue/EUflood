// Python模块服务
import { executePython, executePythonJSON } from './utils/executor';

export interface PythonScriptOptions {
  script: string;
  args?: Record<string, any>;
  timeout?: number;
  pythonPath?: string;
}

/**
 * 执行Python脚本
 */
export async function executePythonScript(
  script: string,
  args?: Record<string, any>,
  options?: { timeout?: number; pythonPath?: string }
) {
  return executePython({
    script,
    args,
    timeout: options?.timeout,
    pythonPath: options?.pythonPath
  });
}

/**
 * 执行Python脚本并返回JSON结果
 */
export async function executePythonScriptJSON<T = any>(
  script: string,
  args?: Record<string, any>,
  options?: { timeout?: number; pythonPath?: string }
) {
  return executePythonJSON<T>({
    script,
    args,
    timeout: options?.timeout,
    pythonPath: options?.pythonPath
  });
}

/**
 * 示例：处理数据的Python脚本调用
 */
export async function processDataWithPython(data: any) {
  return executePythonScriptJSON('process_data.py', {
    input_data: data
  });
}

/**
 * 示例：分析数据的Python脚本调用
 */
export async function analyzeDataWithPython(data: any) {
  return executePythonScriptJSON('analyze_data.py', {
    input_data: data
  });
}

