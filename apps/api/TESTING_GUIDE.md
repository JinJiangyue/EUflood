# 表2填写功能测试指南

## ✅ 前置检查清单

在运行测试之前，请确认以下项目：

### 1. 数据库中有测试数据

**检查表1（rain_event）是否有数据：**
```bash
# 通过API检查
curl http://localhost:3000/python/rain/list

# 或直接查询数据库
sqlite3 apps/api/dev.db "SELECT id, date, searched FROM rain_event LIMIT 5;"
```

**要求：**
- 至少有一条 `searched = 0` 的记录（未处理）
- `value >= 50`（满足最小降雨量阈值）

### 2. 数据库路径配置

**检查 `.env` 文件：**
```bash
# 确保有数据库路径配置
DB_FILE=apps/api/dev.db
```

**或使用默认路径：** `apps/api/dev.db`（相对于项目根目录）

### 3. LLM API Key配置

**检查 `.env` 文件中的LLM配置：**

**选项A：使用OpenAI**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**选项B：使用Gemini**
```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

### 4. 搜索API Key配置

**必需：**
```bash
TAVILY_API_KEY=...
THENEWSAPI_KEY=...
YOUTUBE_API_KEY=...
```

---

## 🚀 运行测试

### 方法1：处理所有待处理事件（推荐）

```bash
# 从项目根目录运行
apps/api/python-embed/python.exe search/test_search.py
```

**流程：**
1. 自动从表1拉取 `searched = 0` 的事件
2. 执行完整工作流（搜索 → LLM处理 → 填充表2）
3. 自动更新 `searched = 1`

### 方法2：处理指定事件

```bash
# 先查看有哪些待处理事件
apps/api/python-embed/python.exe search/test_search.py --event-id "20251011_Valencia_1"
```

### 方法3：干运行（不更新数据库）

```bash
# 测试但不更新数据库
apps/api/python-embed/python.exe search/test_search.py --event-id "20251011_Valencia_1" --dry-run
```

---

## 📊 验证结果

### 1. 检查表2数据

**通过API：**
```bash
curl http://localhost:3000/python/rain/impact/list
```

**或直接查询数据库：**
```bash
sqlite3 apps/api/dev.db "SELECT * FROM rain_flood_impact LIMIT 5;"
```

### 2. 检查日志输出

**成功标志：**
```
✅ 表2数据填充成功: 20251011_Valencia_1
```

**失败标志：**
```
⚠️  表2数据填充失败: 20251011_Valencia_1
```

### 3. 检查生成的报告

**报告文件位置：**
```
search_outputs/{date}/{rain_event_id}_report.md
```

**例如：**
```
search_outputs/20251011/20251011_Valencia_1_report.md
```

---

## 🔍 常见问题排查

### 问题1：表2没有数据

**可能原因：**
1. LLM处理失败（检查API Key）
2. 没有搜索到相关数据（检查搜索API Key）
3. 数据库路径错误（检查日志）

**排查步骤：**
```bash
# 1. 检查日志中的错误信息
# 2. 检查表1数据是否存在
curl http://localhost:3000/python/rain/list?searched=0

# 3. 检查数据库路径
# 查看日志中的数据库路径
```

### 问题2：评分字段为NULL

**可能原因：**
1. LLM没有提取到影响数据
2. 提取的数据格式不正确

**排查步骤：**
```bash
# 检查LLM提取结果
# 查看 search_outputs/{event_id}_llm_validation_results.md
# 查看 search_outputs/{event_id}_filtered_items_after_prefilter.md
```

### 问题3：数据库路径错误

**错误信息：**
```
填充表2数据时出错: no such table: rain_flood_impact
```

**解决方法：**
1. 确认数据库路径正确
2. 确认表2已创建（检查 `apps/api/src/db.ts`）

---

## 📝 测试数据准备

### 如果表1没有数据，可以手动插入测试数据：

```sql
-- 插入测试数据到表1
INSERT INTO rain_event (
    id, date, country, province, city,
    longitude, latitude, value, threshold,
    file_name, seq, searched
) VALUES (
    '20251011_Valencia_1',
    '2025-10-11',
    'Spain',
    'Valencia',
    'Carcaixent',
    -0.4459,
    39.1134,
    102.0,
    50.0,
    'test_file.txt',
    1,
    0  -- 未处理
);
```

---

## ✅ 完整测试流程

### 步骤1：准备测试数据
```bash
# 确保表1有 searched=0 的数据
curl http://localhost:3000/python/rain/list?searched=0
```

### 步骤2：运行测试
```bash
apps/api/python-embed/python.exe search/test_search.py
```

### 步骤3：检查结果
```bash
# 检查表2数据
curl http://localhost:3000/python/rain/impact/list

# 检查表1状态（应该变为 searched=1）
curl http://localhost:3000/python/rain/list?searched=1
```

### 步骤4：验证数据完整性
```bash
# 检查特定事件
curl "http://localhost:3000/python/rain/impact/list?rain_event_id=20251011_Valencia_1"
```

---

## 🎯 预期结果

**成功运行后，应该看到：**

1. **表2中有新记录：**
   - `rain_event_id` 对应表1的ID
   - `level` 有值（1-4）
   - `transport_impact_level`、`economy_impact_level`、`safety_impact_level` 有值（1-10）或NULL
   - `timeline_data` 有JSON数据
   - `source_count` 有值
   - `detail_file` 有路径

2. **表1状态更新：**
   - `searched` 从 0 变为 1

3. **生成报告文件：**
   - `search_outputs/{date}/{rain_event_id}_report.md` 存在

---

## 📞 需要帮助？

如果遇到问题，请检查：
1. 日志文件（`test_log.md`）
2. 错误信息（控制台输出）
3. 数据库状态（通过API或直接查询）

