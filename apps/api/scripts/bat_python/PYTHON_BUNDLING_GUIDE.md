# Python打包方案指南

## 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **PyInstaller** | ✅ 打包成独立exe<br>✅ 无需安装Python<br>✅ 跨平台 | ⚠️ 文件较大（50-100MB）<br>⚠️ 需要单独打包脚本 | 推荐：生产环境 |
| **嵌入版Python** | ✅ 体积小（20-30MB）<br>✅ 完整Python功能<br>✅ 可调用标准库 | ⚠️ 需要管理Python版本<br>⚠️ 需要安装依赖 | 推荐：开发环境 |
| **Docker** | ✅ 完全隔离<br>✅ 环境一致 | ⚠️ 需要Docker环境<br>⚠️ 配置复杂 | 服务器部署 |
| **Nuitka** | ✅ 编译成C++<br>✅ 性能好 | ⚠️ 编译时间长<br>⚠️ 配置复杂 | 性能要求高 |

## 推荐方案：PyInstaller（生产环境）

### 方案1：PyInstaller - 打包成独立exe

**优点**：
- ✅ 无需用户安装Python
- ✅ 单个exe文件，包含所有依赖
- ✅ 跨平台支持（Windows、Linux、Mac）

**实现步骤**：

#### 1. 安装PyInstaller

```bash
cd apps/api/src/modules/python/scripts
pip install pyinstaller
```

#### 2. 打包Python脚本

```bash
# 打包单个脚本
pyinstaller --onefile --name process_file process_file.py

# 打包所有脚本
pyinstaller --onefile --name process_file process_file.py
pyinstaller --onefile --name example example.py
```

#### 3. 修改Node.js调用方式

修改 `executor.ts`，支持调用exe文件：

```typescript
// 检查是否存在打包后的exe
const exePath = path.join(scriptDir, `${scriptName.replace('.py', '.exe')}`);
if (fs.existsSync(exePath)) {
  // 使用exe文件
  command = `"${exePath}"`;
} else {
  // 使用Python脚本
  command = `${pythonPath} "${scriptPath}"`;
}
```

#### 4. 目录结构

```
apps/api/src/modules/python/scripts/
├── process_file.py
├── process_file.exe        # 打包后的exe
├── dist/                   # PyInstaller输出目录
│   └── process_file.exe
└── requirements.txt
```

---

## 推荐方案：嵌入版Python（开发环境）

### 方案2：使用嵌入版Python（Embeddable Python）

**优点**：
- ✅ 体积小（20-30MB）
- ✅ 完整Python功能
- ✅ 不需要系统安装Python

**实现步骤**：

#### 1. 下载嵌入版Python

- Windows: https://www.python.org/downloads/windows/
- 选择 "Windows embeddable package"（如：python-3.11.0-embed-amd64.zip）

#### 2. 解压到项目目录

```
apps/api/
└── python-embed/          # 嵌入版Python
    ├── python.exe
    ├── python311.dll
    └── ...
```

#### 3. 配置环境变量

在 `.env` 中：
```bash
PYTHON_PATH=./python-embed/python.exe
```

#### 4. 安装依赖

```bash
# 使用嵌入版Python的pip
./python-embed/python.exe -m pip install pandas openpyxl xlrd
```

---

## 方案3：混合方案（推荐）

### 开发环境：使用系统Python
### 生产环境：使用打包的exe

**实现**：

#### 1. 创建打包脚本

`apps/api/scripts/build-python.sh`（Linux/Mac）或 `build-python.bat`（Windows）：

```bash
# Windows版本
@echo off
cd src\modules\python\scripts
pip install pyinstaller
pyinstaller --onefile --name process_file process_file.py
pyinstaller --onefile --name example example.py
echo Python scripts bundled successfully!
```

#### 2. 修改executor.ts支持自动检测

```typescript
// 自动检测使用exe还是Python脚本
function getScriptCommand(scriptPath: string, scriptName: string): string {
  const scriptDir = path.dirname(scriptPath);
  const exeName = scriptName.replace('.py', '');
  const exePath = path.join(scriptDir, 'dist', `${exeName}.exe`);
  
  // 优先使用打包后的exe（生产环境）
  if (fs.existsSync(exePath)) {
    return `"${exePath}"`;
  }
  
  // 否则使用Python脚本（开发环境）
  const pythonPath = getPythonPath();
  return `${pythonPath} "${scriptPath}"`;
}
```

---

## 实施方案：PyInstaller打包

### 步骤1：创建打包脚本

`apps/api/scripts/build-python.bat`：

```batch
@echo off
echo Building Python scripts...

cd src\modules\python\scripts

REM 安装PyInstaller（如果还没安装）
pip install pyinstaller

REM 打包process_file.py
pyinstaller --onefile --name process_file --clean process_file.py

REM 打包example.py
pyinstaller --onefile --name example --clean example.py

REM 移动exe到scripts目录
move dist\process_file.exe . 2>nul
move dist\example.exe . 2>nul

echo.
echo Python scripts bundled successfully!
echo Executables are in: src\modules\python\scripts\
```

### 步骤2：修改executor.ts支持exe

```typescript
// 在executePython函数中
const scriptPath = path.join(scriptDir, options.script);
const scriptName = path.basename(options.script, '.py');
const exePath = path.join(scriptDir, `${scriptName}.exe`);

// 检查是否存在打包后的exe
let command: string;
if (fs.existsSync(exePath)) {
  // 使用打包后的exe（生产环境）
  command = `"${exePath}"`;
  console.log(`Using bundled executable: ${exePath}`);
} else {
  // 使用Python脚本（开发环境）
  command = `${pythonPath} "${scriptPath}"`;
  console.log(`Using Python script: ${scriptPath}`);
}
```

### 步骤3：更新.gitignore

```
apps/api/src/modules/python/scripts/*.exe
apps/api/src/modules/python/scripts/dist/
apps/api/src/modules/python/scripts/build/
apps/api/src/modules/python/scripts/*.spec
```

---

## 方案4：使用node-python-bridge（高级）

### 通过Node.js直接调用Python

**优点**：
- ✅ 无需命令行调用
- ✅ 更好的错误处理
- ✅ 性能更好

**缺点**：
- ⚠️ 需要编译native模块
- ⚠️ 配置复杂

**安装**：
```bash
npm install python-bridge
```

**使用**：
```typescript
import { PythonShell } from 'python-shell';

const pyshell = new PythonShell('script.py', {
  scriptPath: './scripts',
  args: [JSON.stringify({ input: 'data' })]
});

pyshell.on('message', (message) => {
  console.log(message);
});
```

---

## 推荐实施步骤

### 阶段1：开发环境（当前）

- ✅ 使用系统Python
- ✅ 直接调用Python脚本
- ✅ 配置灵活

### 阶段2：打包准备

1. 创建打包脚本 `build-python.bat`
2. 修改 `executor.ts` 支持exe
3. 测试打包后的exe

### 阶段3：生产部署

1. 运行打包脚本
2. 将exe文件包含在部署包中
3. 系统自动使用exe（如果存在）

---

## 文件大小对比

| 方案 | 单个脚本大小 | 总大小 |
|------|-------------|--------|
| Python脚本 | ~10KB | ~10KB + Python环境 |
| PyInstaller exe | ~50-100MB | ~50-100MB（每个脚本） |
| 嵌入版Python | ~20-30MB | ~20-30MB + 脚本 |

**注意**：PyInstaller打包的exe包含Python解释器和所有依赖，所以体积较大。

---

## 最佳实践建议

### 开发环境
- 使用系统Python
- 直接调用 `.py` 脚本
- 快速迭代

### 生产环境
- 使用PyInstaller打包
- 调用 `.exe` 文件
- 无需安装Python

### 混合方案（推荐）
- 自动检测：优先使用exe，不存在则使用Python脚本
- 开发时：使用Python脚本
- 部署时：打包成exe

---

## 立即实施

我可以帮你：
1. ✅ 创建打包脚本
2. ✅ 修改executor.ts支持exe
3. ✅ 更新配置和环境检测

需要我现在实施吗？

