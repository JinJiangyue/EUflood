# 嵌入式Python安装状态

## ✅ 安装完成

### 安装位置
```
apps/api/python-embed/
```

### Python版本
```
Python 3.12.0
```

### 已安装的组件
- ✅ Python解释器（python.exe）
- ✅ pip（已安装并可用）
- ✅ 标准库（完整）

### pip位置
```
apps/api/python-embed/Scripts/pip.exe
```

## 下一步

### 1. 安装Python依赖包

运行以下命令安装依赖：

```bash
cd apps/api/python-embed
Scripts\pip.exe install -r ..\src\modules\python\scripts\requirements.txt
```

**或使用脚本**：
```bash
cd apps/api/scripts
install-python-deps.bat
```

### 2. 配置环境变量（可选）

在 `apps/api/.env` 文件中添加（可选，系统会自动检测）：

```bash
PYTHON_PATH=./python-embed/python.exe
```

**注意**：即使不配置，系统也会自动检测并使用嵌入式Python！

### 3. 验证安装

**方式1：命令行验证**
```bash
# 检查Python
apps/api/python-embed/python.exe --version

# 检查pip
apps/api/python-embed/Scripts/pip.exe --version

# 测试脚本
apps/api/python-embed/python.exe apps/api/src/modules/python/scripts/test_example.py '{"test":"value"}'
```

**方式2：API验证**
```bash
# 检查运行环境
curl http://localhost:3000/python/runtime

# 检查Python是否可用
curl http://localhost:3000/python/health
```

## 自动检测机制

系统会自动检测并使用嵌入式Python：

**检测顺序**：
1. ✅ 环境变量 `PYTHON_PATH`（如果设置）
2. ✅ `apps/api/python-embed/python.exe`（如果存在）← **当前使用**
3. ✅ 系统Python（否则）

**当前状态**：系统会自动使用嵌入式Python，无需额外配置！

## 目录结构

```
apps/api/
├── python-embed/              # ✅ 已安装
│   ├── python.exe             # ✅ Python解释器
│   ├── python312.dll          # ✅ Python动态库
│   ├── python312._pth         # ✅ 已启用pip支持
│   ├── Scripts/               # ✅ pip脚本目录
│   │   └── pip.exe            # ✅ pip已安装
│   └── ...
└── src/modules/python/
    └── scripts/
        ├── process_file.py
        ├── example.py
        └── requirements.txt
```

## 使用方式

### 开发环境

直接使用，系统会自动检测：

```typescript
// 自动使用嵌入式Python
const result = await executePythonScriptJSON('process_file.py', {
  input_file: '/path/to/file.csv'
});
```

**日志输出**：
```
[Python] Using Python script: ...process_file.py
```

### 验证Python路径

调用API检查：
```bash
curl http://localhost:3000/python/runtime
```

**响应示例**：
```json
{
  "success": true,
  "pythonPath": "E:\\Project\\europe\\apps\\api\\python-embed\\python.exe",
  "hasEmbeddedPython": true,
  "embeddedPythonDir": "E:\\Project\\europe\\apps\\api\\python-embed",
  ...
}
```

## 管理Python环境

### 安装新包

```bash
cd apps/api/python-embed
Scripts\pip.exe install <package-name>
```

### 查看已安装的包

```bash
cd apps/api/python-embed
Scripts\pip.exe list
```

### 更新包

```bash
cd apps/api/python-embed
Scripts\pip.exe install --upgrade <package-name>
```

## 优势

### ✅ 完全自主管理
- 不依赖系统Python
- 版本可控（Python 3.12.0）
- 可以打包到项目中

### ✅ 体积小
- 嵌入式Python：~20-30MB
- 加上依赖：~100-150MB（安装依赖后）
- 比PyInstaller打包的exe小

### ✅ 灵活性高
- 可以随时更新Python版本
- 可以随时添加/删除依赖
- 可以自定义配置

## 完成！

现在可以：
- ✅ 使用嵌入式Python（无需系统Python）
- ✅ 自己管理Python环境
- ✅ 安装所需的依赖包
- ✅ 调用Python脚本处理文件

**下一步**：安装Python依赖包（运行 `install-python-deps.bat` 或手动安装）

