// Python模块配置
import path from 'path';
import fs from 'fs';

/**
 * 获取Python脚本目录
 */
export function getPythonScriptDir(): string {
  // 如果环境变量指定了路径，使用环境变量
  if (process.env.PYTHON_SCRIPT_DIR) {
    const scriptDir = process.env.PYTHON_SCRIPT_DIR;
    if (path.isAbsolute(scriptDir)) {
      return scriptDir;
    }
    const projectRoot = path.resolve(__dirname, '../../../../..');
    return path.resolve(projectRoot, scriptDir);
  }
  
  // 默认路径：从当前文件位置到scripts目录
  // config.ts 在 apps/api/src/modules/python/config.ts
  // scripts 在 apps/api/src/modules/python/scripts/
  const scriptDir = path.join(__dirname, 'scripts');
  
  // 确保是绝对路径
  if (path.isAbsolute(scriptDir)) {
    return scriptDir;
  }
  
  // 如果是相对路径，转换为绝对路径
  const projectRoot = path.resolve(__dirname, '../../../../..');
  return path.resolve(projectRoot, scriptDir);
}

/**
 * 获取上传文件目录
 */
export function getUploadDir(): string {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
  
  // 如果是相对路径，转换为绝对路径
  if (!path.isAbsolute(uploadDir)) {
    const projectRoot = path.resolve(__dirname, '../../../../..');
    return path.resolve(projectRoot, uploadDir);
  }
  
  // 确保目录存在
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  return uploadDir;
}

/**
 * 获取处理结果目录
 */
export function getOutputDir(): string {
  const outputDir = process.env.OUTPUT_DIR || path.join(__dirname, '../../../outputs');
  
  // 如果是相对路径，转换为绝对路径
  if (!path.isAbsolute(outputDir)) {
    const projectRoot = path.resolve(__dirname, '../../../../..');
    return path.resolve(projectRoot, outputDir);
  }
  
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  return outputDir;
}

/**
 * 获取Python可执行文件路径
 * 优先使用嵌入式Python，否则使用系统Python
 */
export function getPythonPath(): string {
  // 如果环境变量指定了路径，使用环境变量
  if (process.env.PYTHON_PATH) {
    const envPath = process.env.PYTHON_PATH;
    // 如果是相对路径，转换为绝对路径
    if (!path.isAbsolute(envPath)) {
      const projectRoot = path.resolve(__dirname, '../../../../..');
      const resolvedPath = path.resolve(projectRoot, envPath);
      if (fs.existsSync(resolvedPath)) {
        console.log(`[Python] Using PYTHON_PATH from env (resolved): ${resolvedPath}`);
        return resolvedPath;
      }
    }
    if (fs.existsSync(envPath)) {
      console.log(`[Python] Using PYTHON_PATH from env: ${envPath}`);
      return envPath;
    }
  }
  
  // 检查是否存在嵌入式Python
  // 优先从当前工作目录计算（最可靠）
  const cwd = process.cwd();
  let embedPythonPath: string;
  let embedPythonPathUnix: string;
  
  // 方式1: 从当前工作目录（apps/api）直接计算
  if (cwd.endsWith('apps/api') || cwd.includes('apps\\api')) {
    embedPythonPath = path.join(cwd, 'python-embed', 'python.exe');
    embedPythonPathUnix = path.join(cwd, 'python-embed', 'python');
    if (fs.existsSync(embedPythonPath)) {
      console.log(`[Python] ✓ Found embedded Python (from cwd): ${embedPythonPath}`);
      return embedPythonPath;
    }
  }
  
  // 方式2: 从 __dirname 计算
  let projectRoot = path.resolve(__dirname, '../../../../..');
  if (projectRoot.includes('dist')) {
    projectRoot = path.resolve(projectRoot, '..');
  }
  embedPythonPath = path.join(projectRoot, 'python-embed', 'python.exe');
  embedPythonPathUnix = path.join(projectRoot, 'python-embed', 'python');
  
  console.log(`[Python] Checking embedded Python:`);
  console.log(`[Python]   - From cwd: ${cwd.includes('apps/api') ? path.join(cwd, 'python-embed', 'python.exe') : 'N/A'}`);
  console.log(`[Python]   - From __dirname: ${embedPythonPath}`);
  console.log(`[Python]   - __dirname: ${__dirname}`);
  console.log(`[Python]   - Project root: ${projectRoot}`);
  
  if (process.platform === 'win32') {
    if (fs.existsSync(embedPythonPath)) {
      console.log(`[Python] Using embedded Python: ${embedPythonPath}`);
      return embedPythonPath;
    }
    console.warn(`[Python] Embedded Python not found at ${embedPythonPath}, using system Python`);
    return 'python';
  } else {
    if (fs.existsSync(embedPythonPathUnix)) {
      console.log(`[Python] Using embedded Python: ${embedPythonPathUnix}`);
      return embedPythonPathUnix;
    }
    console.warn(`[Python] Embedded Python not found at ${embedPythonPathUnix}, using system Python`);
    return 'python3';
  }
}

/**
 * 检查是否存在嵌入式Python
 */
export function hasEmbeddedPython(): boolean {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  if (process.platform === 'win32') {
    const embedPythonPath = path.join(projectRoot, 'python-embed', 'python.exe');
    return fs.existsSync(embedPythonPath);
  } else {
    const embedPythonPath = path.join(projectRoot, 'python-embed', 'python');
    return fs.existsSync(embedPythonPath);
  }
}

/**
 * 获取嵌入式Python目录
 */
export function getEmbeddedPythonDir(): string | null {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const embedDir = path.join(projectRoot, 'python-embed');
  if (fs.existsSync(embedDir)) {
    return embedDir;
  }
  return null;
}

/**
 * 获取Python执行超时时间
 */
export function getPythonTimeout(): number {
  return parseInt(process.env.PYTHON_TIMEOUT || '30000');
}

/**
 * 检查运行环境
 */
export function getRuntimeInfo() {
  const embedDir = getEmbeddedPythonDir();
  const hasEmbedded = hasEmbeddedPython();
  
  return {
    platform: process.platform,
    nodeVersion: process.version,
    pythonPath: getPythonPath(),
    hasEmbeddedPython: hasEmbedded,
    embeddedPythonDir: embedDir,
    scriptDir: getPythonScriptDir(),
    uploadDir: getUploadDir(),
    outputDir: getOutputDir(),
    timeout: getPythonTimeout()
  };
}

