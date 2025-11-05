# Python模块集成

## 概述

此模块允许Node.js应用调用Python脚本，并将Python输出传递给后续接口。

## 目录结构

```
python/
├── README.md              # 本文件
├── service.ts             # Python调用服务
├── routes.ts             # API路由
├── scripts/              # Python脚本目录
│   ├── __init__.py
│   ├── example.py        # 示例Python脚本
│   └── requirements.txt  # Python依赖
└── utils/                # 工具函数
    └── executor.ts       # Python执行器
```

## 使用方法

### 1. 安装Python依赖

```bash
cd apps/api/src/modules/python/scripts
pip install -r requirements.txt
```

### 2. 配置环境变量

在 `apps/api/.env` 中添加：

```bash
# Python配置
PYTHON_PATH=python3          # 或 python（Windows）
PYTHON_SCRIPT_DIR=./src/modules/python/scripts
PYTHON_TIMEOUT=30000         # 超时时间（毫秒）
```

### 3. 调用Python脚本

```typescript
import { executePythonScript } from './modules/python/service';

const result = await executePythonScript('example.py', {
  input1: 'value1',
  input2: 123
});
```

## API接口

### POST /python/execute

执行Python脚本

**请求**:
```json
{
  "script": "example.py",
  "args": {
    "input1": "value1",
    "input2": 123
  }
}
```

**响应**:
```json
{
  "success": true,
  "output": "...",
  "error": null,
  "executionTime": 1234
}
```

