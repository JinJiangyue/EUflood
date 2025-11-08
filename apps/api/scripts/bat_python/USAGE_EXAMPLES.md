# Python模块使用示例

## 1. 基本使用

### 在Node.js中调用Python脚本

```typescript
import { executePythonScript } from './modules/python/service';

// 执行Python脚本，返回文本输出
const result = await executePythonScript('example.py', {
  input_data: { key: 'value' },
  timestamp: new Date().toISOString()
});

console.log(result.output); // Python脚本的stdout输出
```

### 执行Python脚本并解析JSON

```typescript
import { executePythonScriptJSON } from './modules/python/service';

// 执行Python脚本，期望返回JSON
const result = await executePythonScriptJSON('example.py', {
  input_data: { key: 'value' }
});

if (result.success) {
  console.log(result.data); // 解析后的JSON对象
} else {
  console.error(result.error);
}
```

## 2. 通过API调用

### 检查Python是否可用

```bash
curl http://localhost:3000/python/health
```

**响应**:
```json
{
  "available": true,
  "pythonPath": "python3",
  "message": "Python is available"
}
```

### 执行Python脚本（文本输出）

```bash
curl -X POST http://localhost:3000/python/execute \
  -H "Content-Type: application/json" \
  -d '{
    "script": "example.py",
    "args": {
      "input_data": {"key": "value"},
      "timestamp": "2025-01-01T00:00:00Z"
    }
  }'
```

**响应**:
```json
{
  "success": true,
  "output": "{\"success\": true, \"processed\": true, ...}",
  "error": null,
  "executionTime": 1234
}
```

### 执行Python脚本（JSON输出）

```bash
curl -X POST http://localhost:3000/python/execute-json \
  -H "Content-Type: application/json" \
  -d '{
    "script": "example.py",
    "args": {
      "input_data": {"key": "value"}
    }
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "processed": true,
    "input": {"key": "value"},
    "output": {
      "message": "Python script executed successfully"
    }
  },
  "error": null,
  "executionTime": 1234
}
```

## 3. 在业务模块中使用

### 示例：在数据处理模块中调用Python

```typescript
// apps/api/src/modules/processing/service.ts
import { executePythonScriptJSON } from '../python/service';

export async function processWithPython(data: any) {
  // 调用Python脚本处理数据
  const result = await executePythonScriptJSON('process_data.py', {
    input_data: data,
    options: {
      threshold: 0.5,
      normalize: true
    }
  });
  
  if (result.success && result.data) {
    return result.data;
  } else {
    throw new Error(`Python processing failed: ${result.error}`);
  }
}
```

### 示例：在分析模块中调用Python

```typescript
// apps/api/src/modules/analysis/service.ts
import { executePythonScriptJSON } from '../python/service';

export async function analyzeWithPython(records: any[]) {
  const result = await executePythonScriptJSON('analyze_data.py', {
    records,
    analysis_type: 'statistical',
    output_format: 'json'
  });
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(`Python analysis failed: ${result.error}`);
  }
}
```

## 4. 创建自定义Python脚本

### 步骤1：创建Python脚本

在 `apps/api/src/modules/python/scripts/` 目录下创建你的脚本：

```python
# apps/api/src/modules/python/scripts/custom_analysis.py
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

def main():
    # 读取命令行参数（JSON格式）
    args = {}
    if len(sys.argv) > 1:
        args = json.loads(sys.argv[1])
    
    # 获取输入数据
    input_data = args.get('input_data', [])
    
    # 执行你的处理逻辑
    results = []
    for item in input_data:
        # 你的处理逻辑
        processed = {
            'id': item.get('id'),
            'processed': True,
            'result': item.get('value') * 2
        }
        results.append(processed)
    
    # 输出JSON结果
    output = {
        'success': True,
        'results': results,
        'count': len(results)
    }
    
    print(json.dumps(output, ensure_ascii=False))

if __name__ == '__main__':
    main()
```

### 步骤2：在Node.js中调用

```typescript
import { executePythonScriptJSON } from './modules/python/service';

const result = await executePythonScriptJSON('custom_analysis.py', {
  input_data: [
    { id: 1, value: 10 },
    { id: 2, value: 20 }
  ]
});

console.log(result.data); // { success: true, results: [...], count: 2 }
```

## 5. 错误处理

```typescript
import { executePythonScriptJSON } from './modules/python/service';

try {
  const result = await executePythonScriptJSON('script.py', { data: 'test' });
  
  if (!result.success) {
    // Python脚本执行失败
    console.error('Python execution failed:', result.error);
    return;
  }
  
  // 处理成功结果
  console.log('Python output:', result.data);
} catch (error) {
  // Node.js层面的错误（如超时、脚本不存在等）
  console.error('Error:', error);
}
```

## 6. 配置超时

```typescript
// 设置30秒超时
const result = await executePythonScriptJSON(
  'long_running_script.py',
  { data: 'test' },
  { timeout: 30000 }
);
```

## 7. 使用自定义Python路径

```typescript
// 使用特定的Python解释器
const result = await executePythonScriptJSON(
  'script.py',
  { data: 'test' },
  { pythonPath: '/usr/bin/python3.11' }
);
```

## 注意事项

1. **Python脚本必须输出JSON到stdout**（如果使用JSON模式）
2. **错误信息输出到stderr**（不会影响JSON解析）
3. **确保Python脚本有执行权限**：`chmod +x script.py`
4. **安装Python依赖**：`pip install -r requirements.txt`
5. **测试Python是否可用**：`GET /python/health`

