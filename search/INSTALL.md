# Search 模块安装指南

## 使用嵌入式 Python（推荐）

项目已经包含了嵌入式 Python（`apps/api/python-embed/`），推荐使用它来运行 search 模块。

### 1. 安装依赖

```bash
# 从项目根目录运行
apps/api/python-embed/Scripts/pip.exe install -r search/requirements.txt
```

### 2. 配置环境变量（可选）

在 `.env` 文件中可以指定 Python 路径（但系统会自动检测）：

```env
# 可选：明确指定嵌入式Python路径
PYTHON_PATH=apps/api/python-embed/python.exe
```

**注意**：即使不配置，系统也会自动检测并使用嵌入式Python！

### 3. 运行测试

```bash
# 使用嵌入式Python运行测试
apps/api/python-embed/python.exe search/test_search.py --json '{"id":"20251011_Valencia/València_1",...}'
```

## 使用系统 Python

如果你更喜欢使用系统安装的 Python：

### 1. 安装依赖

```bash
pip install -r search/requirements.txt
```

### 2. 运行测试

```bash
python search/test_search.py --json '{"id":"20251011_Valencia/València_1",...}'
```

## 依赖说明

Search 模块需要以下 Python 包：

- **pydantic** 和 **pydantic-settings**: 配置管理
- **requests**: HTTP 请求（用于 API 调用）
- **jinja2**: 模板渲染（用于报告生成）
- **python-dateutil**: 日期时间处理（推荐）

这些都是轻量级依赖，安装很快。

## 验证安装

运行以下命令验证依赖是否安装成功：

```bash
# 使用嵌入式Python
apps/api/python-embed/python.exe -c "import pydantic, requests, jinja2; print('✓ 所有依赖已安装')"

# 或使用系统Python
python -c "import pydantic, requests, jinja2; print('✓ 所有依赖已安装')"
```

## 常见问题

### 1. 找不到 pip

**错误**: `'pip' 不是内部或外部命令`

**解决**: 使用完整路径：
```bash
apps/api/python-embed/Scripts/pip.exe install -r search/requirements.txt
```

### 2. 权限错误

**错误**: `Permission denied` 或 `Access is denied`

**解决**: 
- Windows: 以管理员身份运行 PowerShell
- 或使用 `--user` 参数：`pip install --user -r search/requirements.txt`

### 3. 网络问题

**错误**: `Connection timeout` 或 `SSL error`

**解决**: 
- 检查网络连接
- 使用国内镜像源：
  ```bash
  pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r search/requirements.txt
  ```

