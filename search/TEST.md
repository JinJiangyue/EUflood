# 测试搜索流程

## 前置条件

1. **安装 Python 依赖**
   ```bash
   # 使用嵌入式Python（推荐）
   apps/api/python-embed/Scripts/pip.exe install -r search/requirements.txt
   
   # 或使用系统Python
   pip install -r search/requirements.txt
   ```
   详见 [INSTALL.md](INSTALL.md)

2. **确保 `.env` 文件已配置**
   - 复制 `env.template` 为根目录下的 `.env`
   - 填写必要的 API Key：
     - `TAVILY_API_KEY`（必需）
     - `THENEWSAPI_KEY`（必需）
     - `YOUTUBE_API_KEY`（必需）

3. **确保数据库中有待处理的事件**
   - 事件在 `rain_event` 表中
   - `searched = 0`（未处理）
   - `value >= 50`（满足最小降雨量阈值）

## 测试方法

### 使用嵌入式 Python（推荐）

```bash
# 从项目根目录运行
apps/api/python-embed/python.exe search/test_search.py [选项]
```

### 使用系统 Python

```bash
# 从项目根目录运行
python search/test_search.py [选项]
```

### 方法 1: 处理所有待处理事件

```bash
# 使用嵌入式Python
apps/api/python-embed/python.exe search/test_search.py

# 或使用系统Python
python search/test_search.py
```

### 方法 2: 处理指定的事件ID

```bash
# 处理指定事件
apps/api/python-embed/python.exe search/test_search.py --event-id "20251011_Valencia/València_1"
```

### 方法 3: 从 JSON 直接测试（不更新数据库）

```bash
# 使用你提供的数据直接测试
apps/api/python-embed/python.exe search/test_search.py --json '{"id":"20251011_Valencia/València_1","date":"2025-10-11","country":"Spain","province":"Valencia/València","city":"Carcaixent","longitude":-0.44589999999999735,"latitude":39.11339999273075,"value":102,"threshold":50,"file_name":"pr20251011_20251013021010_ext.txt","seq":1,"searched":0}'
```

### 方法 4: 干运行（不更新数据库）

```bash
# 测试但不更新数据库中的 searched 标志
apps/api/python-embed/python.exe search/test_search.py --event-id "20251011_Valencia/València_1" --dry-run
```

## 输出

- **控制台日志**: 显示处理进度和结果
- **报告文件**: 保存在 `search_outputs/{event_id}_report.md`

## 常见问题

### 1. 数据库连接失败

**错误**: `查询 rain_events 表失败`

**解决**: 
- 检查 `.env` 中的 `DB_FILE` 配置是否正确
- 默认应该是 `apps/api/dev.db`（相对于项目根目录）
- 确保数据库文件存在

### 2. API Key 未配置

**错误**: `API Key 未配置` 或 `401 Unauthorized`

**解决**:
- 检查 `.env` 文件中的 API Key 是否填写
- 确保 API Key 有效

### 3. 找不到事件

**错误**: `未找到事件ID: xxx`

**解决**:
- 检查事件ID是否正确
- 检查数据库中该事件的 `searched` 字段是否为 0
- 检查 `value` 是否满足最小阈值（默认 50mm）

## 测试你的数据

使用你提供的数据进行测试：

```bash
# 使用嵌入式Python（推荐）
apps/api/python-embed/python.exe search/test_search.py --json '{"id":"20251011_Valencia/València_1","date":"2025-10-11","country":"Spain","province":"Valencia/València","city":"Carcaixent","longitude":-0.44589999999999735,"latitude":39.11339999273075,"value":102,"threshold":50,"file_name":"pr20251011_20251013021010_ext.txt","seq":1,"searched":0}'

# 或使用系统Python
python search/test_search.py --json '{"id":"20251011_Valencia/València_1","date":"2025-10-11","country":"Spain","province":"Valencia/València","city":"Carcaixent","longitude":-0.44589999999999735,"latitude":39.11339999273075,"value":102,"threshold":50,"file_name":"pr20251011_20251013021010_ext.txt","seq":1,"searched":0}'
```

这会：
1. 创建事件对象
2. 执行完整的搜索流程
3. 生成报告
4. 保存到 `search_outputs/20251011_Valencia/València_1_report.md`
5. **不会更新数据库**（因为是 JSON 模式）

