// Python模块配置
// 注意：dotenv 已在 src/index.ts 中加载，这里不需要重复加载
import path from 'path';
import fs from 'fs';

/**
 * 查找项目根目录（包含 apps 目录的目录）
 * 会跳过当前目录名为 'apps' 的情况，避免将 apps 目录误认为项目根
 */
function findProjectRoot(): string {
  let projectRoot: string | null = null;
  
  // 方法1：从 __dirname 向上查找
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const dirName = path.basename(currentDir);
    // 如果当前目录名是 apps，继续向上查找
    if (dirName === 'apps') {
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
      continue;
    }
    const appsPath = path.join(currentDir, 'apps');
    if (fs.existsSync(appsPath) && fs.statSync(appsPath).isDirectory()) {
      projectRoot = currentDir;
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  // 方法2：如果方法1失败，从 process.cwd() 查找
  if (!projectRoot) {
    currentDir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const dirName = path.basename(currentDir);
      // 如果当前目录名是 apps，继续向上查找
      if (dirName === 'apps') {
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
        continue;
      }
      const appsPath = path.join(currentDir, 'apps');
      if (fs.existsSync(appsPath) && fs.statSync(appsPath).isDirectory()) {
        projectRoot = currentDir;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }
  
  // 回退方案
  if (!projectRoot) {
    projectRoot = path.resolve(__dirname, '../../../../..');
    console.warn(`[Config] Could not find project root, using fallback: ${projectRoot}`);
  }
  
  return projectRoot;
}

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
      const projectRoot = findProjectRoot();
      const resolvedDir = path.resolve(projectRoot, scriptDir);
      console.log(`[Config] Resolving PYTHON_SCRIPT_DIR: ${scriptDir} -> ${resolvedDir} (project root: ${projectRoot})`);
      
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
    console.log(`[Config] UPLOAD_DIR environment variable found: ${uploadDir}`);
    if (path.isAbsolute(uploadDir)) {
      console.log(`[Config] Using absolute path from UPLOAD_DIR: ${uploadDir}`);
      // 确保目录存在
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      return uploadDir;
    }
    // 相对路径：从项目根目录解析
    const projectRoot = findProjectRoot();
    const resolvedDir = path.resolve(projectRoot, uploadDir);
    console.log(`[Config] Resolving relative UPLOAD_DIR: ${uploadDir} -> ${resolvedDir} (project root: ${projectRoot})`);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    return resolvedDir;
  }
  
  // 默认路径：从项目根目录构建
  const projectRoot = findProjectRoot();
  const uploadDir = path.join(projectRoot, 'apps', 'uploads', 'rain_file');
  
  // 确保目录存在
  if (!fs.existsSync(uploadDir)) {
    console.log(`[Config] Creating upload directory: ${uploadDir}`);
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
      if (!fs.existsSync(geoFileDir)) fs.mkdirSync(geoFileDir, { recursive: true });
      return geoFileDir;
    }
    // 相对路径：从项目根目录解析
    const projectRoot = findProjectRoot();
    
    // 解析路径
    let resolvedDir: string;
    if (geoFileDir.startsWith('apps/') || geoFileDir.startsWith('apps\\')) {
      // 如果路径以 apps/ 开头，直接从项目根解析
      resolvedDir = path.resolve(projectRoot, geoFileDir);
    } else {
      // 否则，假设是相对于 apps/uploads 的路径
      const uploadsRoot = path.join(projectRoot, 'apps', 'uploads');
      resolvedDir = path.resolve(uploadsRoot, geoFileDir);
    }
    
    console.log(`[Config] Resolving GEO_FILE_DIR: ${geoFileDir} -> ${resolvedDir} (project root: ${projectRoot})`);
    if (!fs.existsSync(resolvedDir)) fs.mkdirSync(resolvedDir, { recursive: true });
    return resolvedDir;
  }
  
  // 默认路径：从项目根目录构建
  const projectRoot = findProjectRoot();
  const geoFileDir = path.join(projectRoot, 'apps', 'uploads', 'geofile');
  if (!fs.existsSync(geoFileDir)) {
    fs.mkdirSync(geoFileDir, { recursive: true });
  }
  // 同时确保常用子目录存在，避免后续访问失败
  const nuts3Dir = path.join(geoFileDir, 'nuts3');
  const cityDir = path.join(geoFileDir, 'city');
  if (!fs.existsSync(nuts3Dir)) {
    fs.mkdirSync(nuts3Dir, { recursive: true });
  }
  if (!fs.existsSync(cityDir)) {
    fs.mkdirSync(cityDir, { recursive: true });
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

