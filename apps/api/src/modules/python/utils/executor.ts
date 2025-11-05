// Python脚本执行器
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

interface PythonExecutionOptions {
  script: string;
  args?: Record<string, any>;
  timeout?: number;
  pythonPath?: string;
}

interface PythonExecutionResult {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
}

/**
 * 执行Python脚本
 * @param options 执行选项
 * @returns 执行结果
 */
export async function executePython(
  options: PythonExecutionOptions
): Promise<PythonExecutionResult> {
  const startTime = Date.now();
  
  // 使用配置模块获取Python路径（支持嵌入式Python）
  const { getPythonPath } = await import('../config');
  const pythonPath = options.pythonPath || getPythonPath();
  console.log(`[Python Executor] Using Python: ${pythonPath}`);
  
  // 使用配置模块获取脚本目录
  const { getPythonScriptDir } = await import('../config');
  const scriptDir = getPythonScriptDir();
  console.log(`[Python Executor] Script directory: ${scriptDir}`);
  
  const scriptPath = path.join(scriptDir, options.script);
  console.log(`[Python Executor] Script path: ${scriptPath}`);
  const timeout = options.timeout || parseInt(process.env.PYTHON_TIMEOUT || '30000');
  
  // 检查是否存在打包后的exe文件（优先使用）
  const scriptName = path.basename(options.script, path.extname(options.script));
  const exePath = path.join(scriptDir, `${scriptName}.exe`);
  const exePathInDist = path.join(scriptDir, 'dist', `${scriptName}.exe`);
  
  let command: string;
  let useBundled = false;
  
  // 优先使用打包后的exe（生产环境）
  if (fs.existsSync(exePath)) {
    command = `"${exePath}"`;
    useBundled = true;
    console.log(`[Python] Using bundled executable: ${exePath}`);
  } else if (fs.existsSync(exePathInDist)) {
    command = `"${exePathInDist}"`;
    useBundled = true;
    console.log(`[Python] Using bundled executable: ${exePathInDist}`);
  } else {
    // 使用Python脚本（开发环境）
    // 检查脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        output: '',
        error: `Python script not found: ${scriptPath}`,
        executionTime: Date.now() - startTime
      };
    }
    command = `${pythonPath} "${scriptPath}"`;
    console.log(`[Python] Using Python script: ${scriptPath}`);
  }
  
  // 如果有参数，通过JSON传递
  if (options.args && Object.keys(options.args).length > 0) {
    const argsJson = JSON.stringify(options.args);
    // 在Windows上，使用双引号包裹，并转义内部的双引号
    // 在Unix系统上，使用单引号
    if (process.platform === 'win32') {
      // Windows: 使用双引号，转义内部的双引号
      const escapedJson = argsJson.replace(/"/g, '\\"');
      command = `${command} "${escapedJson}"`;
    } else {
      // Unix: 使用单引号（更安全）
      command = `${command} '${argsJson}'`;
    }
    console.log(`[Python Executor] Command args: ${argsJson.substring(0, 200)}...`);
  }
  
  try {
    // 执行Python脚本
    const { stdout, stderr } = await execAsync(command, {
      cwd: scriptDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    const executionTime = Date.now() - startTime;
    
    // 检查stderr中是否有错误JSON（Python脚本可能将错误输出到stderr）
    if (stderr && stderr.trim()) {
      // 提取所有进度信息（以[Progress]开头的行）
      const progressLines = stderr.split('\n').filter(line => line.includes('[Progress]') || line.includes('[Warning]'));
      if (progressLines.length > 0) {
        console.log(`[Python Progress] ${progressLines.join(' | ')}`);
      }
      
      try {
        // 尝试解析stderr中的JSON错误（查找最后一行JSON）
        const stderrLines = stderr.trim().split('\n');
        for (let i = stderrLines.length - 1; i >= 0; i--) {
          const line = stderrLines[i].trim();
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              const errorJson = JSON.parse(line);
              if (errorJson.success === false || errorJson.error) {
                console.error(`[Python Error] ${errorJson.error || stderr}`);
                if (errorJson.traceback) {
                  console.error(`[Python Traceback]\n${errorJson.traceback}`);
                }
                return {
                  success: false,
                  output: stdout.trim() || '',
                  error: errorJson.error || stderr.trim(),
                  executionTime
                };
              }
            } catch {
              // 不是有效的JSON，继续查找
            }
          }
        }
      } catch {
        // 解析失败
      }
      
      // stderr不是JSON错误，可能是警告或进度信息
      if (stderr.trim().length > 0 && !stderr.includes('[Progress]')) {
        console.warn(`[Python stderr] ${stderr.trim()}`);
      }
    }
    
    return {
      success: true,
      output: stdout.trim(),
      error: null,
      executionTime
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    // 处理超时错误
    if (error.killed && error.signal === 'SIGTERM') {
      return {
        success: false,
        output: error.stdout?.toString() || '',
        error: `Python script execution timeout after ${timeout}ms`,
        executionTime
      };
    }
    
    // 尝试从stderr获取错误信息
    const stderr = error.stderr?.toString() || '';
    let errorMessage = error.message || String(error);
    
    if (stderr) {
      try {
        const errorJson = JSON.parse(stderr.trim());
        if (errorJson.error) {
          errorMessage = errorJson.error;
        } else {
          errorMessage = stderr.trim();
        }
      } catch {
        // stderr不是JSON，使用原始错误信息
        if (stderr.trim()) {
          errorMessage = `${errorMessage}\n${stderr.trim()}`;
        }
      }
    }
    
    console.error(`Python execution error: ${errorMessage}`);
    
    return {
      success: false,
      output: error.stdout?.toString() || '',
      error: errorMessage,
      executionTime
    };
  }
}

/**
 * 执行Python脚本并解析JSON输出
 */
export async function executePythonJSON<T = any>(
  options: PythonExecutionOptions
): Promise<{ success: boolean; data: T | null; error: string | null; executionTime: number }> {
  const result = await executePython(options);
  
  if (!result.success) {
    return {
      success: false,
      data: null,
      error: result.error || 'Unknown error occurred during Python script execution',
      executionTime: result.executionTime
    };
  }
  
  // 如果输出为空，尝试从错误信息中解析
  if (!result.output || result.output.trim().length === 0) {
    return {
      success: false,
      data: null,
      error: result.error || 'Python script returned no output',
      executionTime: result.executionTime
    };
  }
  
  try {
    const data = JSON.parse(result.output);
    
    // 检查返回的JSON中是否包含错误
    if (data && typeof data === 'object' && 'success' in data && data.success === false) {
      return {
        success: false,
        data: null,
        error: data.error || 'Python script reported failure',
        executionTime: result.executionTime
      };
    }
    
    return {
      success: true,
      data,
      error: null,
      executionTime: result.executionTime
    };
  } catch (error: any) {
    // 如果解析失败，尝试从输出中提取错误信息
    const outputPreview = result.output.substring(0, 200);
    console.error(`Failed to parse JSON output. Preview: ${outputPreview}`);
    
    return {
      success: false,
      data: null,
      error: `Failed to parse JSON output: ${error.message}\nOutput preview: ${outputPreview}`,
      executionTime: result.executionTime
    };
  }
}

/**
 * 检查Python是否可用
 */
export async function checkPythonAvailable(pythonPath?: string): Promise<boolean> {
  const python = pythonPath || process.env.PYTHON_PATH || 'python3';
  
  try {
    const { stdout } = await execAsync(`${python} --version`);
    return stdout.includes('Python');
  } catch {
    return false;
  }
}

