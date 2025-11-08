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
      // 验证路径是否存在
      if (fs.existsSync(scriptDir)) {
        console.log(`[Config] Using PYTHON_SCRIPT_DIR (absolute): ${scriptDir}`);
        return scriptDir;
      } else {
        console.warn(`[Config] PYTHON_SCRIPT_DIR not found: ${scriptDir}`);
      }
    } else {
      // 相对路径：从项目根目录解析
      // 先尝试从 __dirname 找到项目根目录
      let projectRoot: string | null = null;
      let currentDir = __dirname;
      
      // 向上查找，直到找到包含 'apps' 的目录
      for (let i = 0; i < 6; i++) {
        const dirName = path.basename(currentDir);
        if (dirName === 'apps' || currentDir.includes('apps' + path.sep) || currentDir.includes('apps\\')) {
          // 找到 apps 目录，项目根目录是其父目录
          projectRoot = path.dirname(currentDir);
          break;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) {
          // 到达根目录，使用默认方法
          projectRoot = path.resolve(__dirname, '../../../../..');
          break;
        }
        currentDir = parent;
      }
      
      if (!projectRoot) {
        projectRoot = path.resolve(__dirname, '../../../../..');
      }
      
      const resolvedDir = path.resolve(projectRoot, scriptDir);
      console.log(`[Config] Resolving PYTHON_SCRIPT_DIR: ${scriptDir} -> ${resolvedDir}`);
      console.log(`[Config] Project root: ${projectRoot}`);
      
      if (fs.existsSync(resolvedDir)) {
        console.log(`[Config] Using PYTHON_SCRIPT_DIR (relative): ${resolvedDir}`);
        return resolvedDir;
      } else {
        console.warn(`[Config] PYTHON_SCRIPT_DIR not found: ${resolvedDir}`);
        // 继续使用默认路径解析
      }
    }
  }
  
  // 处理编译后的情况：Python 脚本始终在 src 目录，不在 dist 目录
  // 使用最简单可靠的方法：从 process.cwd() 或 __dirname 找到 apps/api，然后构建路径
  
  // 方法1：从 process.cwd() 查找（最可靠，因为通常从 apps/api 目录启动）
  const cwd = process.cwd();
  let apiDir: string | null = null;
  
  // 从 cwd 向上查找 apps/api 目录
  let currentDir = cwd;
  for (let i = 0; i < 6; i++) {
    const dirName = path.basename(currentDir);
    const parentDir = path.basename(path.dirname(currentDir));
    
    if (dirName === 'api' && parentDir === 'apps') {
      apiDir = currentDir;
      break;
    }
    
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  // 方法2：如果方法1失败，从 __dirname 向上查找
  if (!apiDir) {
    currentDir = __dirname;
    for (let i = 0; i < 6; i++) {
      const dirName = path.basename(currentDir);
      const parentDir = path.basename(path.dirname(currentDir));
      
      if (dirName === 'api' && parentDir === 'apps') {
        apiDir = currentDir;
        break;
      }
      
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  
  // 如果找到了 apps/api 目录，直接构建路径到 scripts（Python 脚本目录）
  if (apiDir) {
    const scriptDir = path.join(apiDir, 'scripts');
    // 验证路径是否存在
    if (fs.existsSync(scriptDir)) {
      console.log(`[Config] Found script dir via apiDir: ${scriptDir}`);
      return scriptDir;
    } else {
      console.warn(`[Config] Script dir not found: ${scriptDir}`);
    }
  }
  
  // 方法3：回退方案：从 __dirname 直接计算
  // 移动后：__dirname 是 apps/api/scripts (新位置)
  // 旧位置：apps/api/src/modules/python (如果还在)
  let scriptDir: string;
  
  // 检查是否在新位置（apps/api/scripts）
  if (__dirname.includes('scripts') && !__dirname.includes('src')) {
    // 新位置：直接使用当前目录（已经是 scripts 目录）
    scriptDir = __dirname;
  } else if (__dirname.includes('dist')) {
    // 编译后的情况：从 dist 目录计算到新位置
    // dist/modules/python -> scripts
    const apiDirFromDist = path.resolve(__dirname, '../../../');
    scriptDir = path.join(apiDirFromDist, 'scripts');
  } else {
    // 旧位置或未知：尝试从 apps/api 计算
    let currentDir = __dirname;
    let apiDirFromCurrent: string | null = null;
    for (let i = 0; i < 6; i++) {
      const dirName = path.basename(currentDir);
      const parentDir = path.basename(path.dirname(currentDir));
      if (dirName === 'api' && parentDir === 'apps') {
        apiDirFromCurrent = currentDir;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
    if (apiDirFromCurrent) {
      scriptDir = path.join(apiDirFromCurrent, 'scripts');
    } else {
      // 最后回退：从项目根目录计算
      const projectRoot = path.resolve(__dirname, '../../../../..');
      scriptDir = path.join(projectRoot, 'apps', 'api', 'scripts');
    }
  }
  
  // 确保是绝对路径
  if (!path.isAbsolute(scriptDir)) {
    const projectRoot = path.resolve(__dirname, '../../../../..');
    scriptDir = path.resolve(projectRoot, scriptDir);
  }
  
  console.log(`[Config] Using fallback script dir: ${scriptDir}`);
  return scriptDir;
}

/**
 * 获取上传文件目录
 * 默认位置：apps/uploads/rain_file/
 */
export function getUploadDir(): string {
  // 如果环境变量指定了路径，使用环境变量
  if (process.env.UPLOAD_DIR) {
    const uploadDir = process.env.UPLOAD_DIR;
    if (path.isAbsolute(uploadDir)) {
      // 确保目录存在
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      return uploadDir;
    }
    // 相对路径：从项目根目录解析
    const projectRoot = path.resolve(__dirname, '../../../../..');
    const resolvedDir = path.resolve(projectRoot, uploadDir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    return resolvedDir;
  }
  
  // 默认路径：从 process.cwd() 或 __dirname 找到 apps 目录
  let appsDir: string | null = null;
  
  // 方法1：从 process.cwd() 查找
  let currentDir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const dirName = path.basename(currentDir);
    if (dirName === 'apps') {
      appsDir = currentDir;
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  // 方法2：从 __dirname 向上查找
  if (!appsDir) {
    currentDir = __dirname;
    for (let i = 0; i < 6; i++) {
      const dirName = path.basename(currentDir);
      if (dirName === 'apps') {
        appsDir = currentDir;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  
  let uploadDir: string;
  if (appsDir) {
    uploadDir = path.join(appsDir, 'uploads', 'rain_file');
  } else {
    // 回退方案：从项目根目录计算
    const projectRoot = path.resolve(__dirname, '../../../../..');
    uploadDir = path.join(projectRoot, 'apps', 'uploads', 'rain_file');
  }
  
  // 确保目录存在
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  return uploadDir;
}

/**
 * 获取地理数据文件目录
 * NUTS3 GeoJSON 文件在: apps/uploads/geofile/nuts3/
 * City GPKG 文件在: apps/uploads/geofile/city/
 */
export function getGeoFileDir(): string {
  // 如果环境变量指定了路径，使用环境变量
  if (process.env.GEO_FILE_DIR) {
    const geoFileDir = process.env.GEO_FILE_DIR;
    if (path.isAbsolute(geoFileDir)) {
      // 确保目录存在
      if (!fs.existsSync(geoFileDir)) {
        fs.mkdirSync(geoFileDir, { recursive: true });
      }
      return geoFileDir;
    }
    // 相对路径：从项目根目录解析
    const projectRoot = path.resolve(__dirname, '../../../../..');
    const resolvedDir = path.resolve(projectRoot, geoFileDir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    return resolvedDir;
  }
  
  // 默认路径：从 process.cwd() 或 __dirname 找到 apps 目录
  let appsDir: string | null = null;
  
  // 方法1：从 process.cwd() 查找
  let currentDir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const dirName = path.basename(currentDir);
    if (dirName === 'apps') {
      appsDir = currentDir;
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  // 方法2：从 __dirname 向上查找
  if (!appsDir) {
    currentDir = __dirname;
    for (let i = 0; i < 6; i++) {
      const dirName = path.basename(currentDir);
      if (dirName === 'apps') {
        appsDir = currentDir;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  
  let geoFileDir: string;
  if (appsDir) {
    geoFileDir = path.join(appsDir, 'uploads', 'geofile');
  } else {
    // 回退方案：从项目根目录计算
    const projectRoot = path.resolve(__dirname, '../../../../..');
    geoFileDir = path.join(projectRoot, 'apps', 'uploads', 'geofile');
  }
  
  // 确保目录存在
  if (!fs.existsSync(geoFileDir)) {
    fs.mkdirSync(geoFileDir, { recursive: true });
  }
  
  return geoFileDir;
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

