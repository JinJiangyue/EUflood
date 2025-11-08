# 表2填写功能实现完成 ✅

## 实现状态

**✅ 已完成** - 现在可以完整填写表2（rain_flood_impact）了！

---

## 已实现的组件

### 1. ✅ 评分计算模块

**文件**：`search/llm/scoring.py`

**功能：**
- `calculate_transport_impact_level()` - 计算交通影响程度（1-10分）
- `calculate_economy_impact_level()` - 计算经济影响程度（1-10分）
- `calculate_safety_impact_level()` - 计算安全影响程度（1-10分）
- `calculate_overall_level()` - 计算整体级别（1-4级）

**特点：**
- **三层评分策略**：
  1. 数字优先：如果有明确数字，基于数字计算
  2. 推断补充：如果没有数字，基于 `severity_inference` 计算
  3. 关键词补充：如果都没有，基于 `description` 中的关键词计算

**辅助函数：**
- `extract_number()` - 从字符串或数字中提取整数
- `parse_loss_amount()` - 解析经济损失金额（转换为million单位）

---

### 2. ✅ 数据库写入模块

**文件**：`search/llm/db_writer.py`

**功能：**
- `fill_rain_flood_impact_table()` - 填充表2数据
- `get_rain_event_from_db()` - 从数据库获取表1数据

**处理流程：**
1. 获取表1数据（rain_event）
2. 提取LLM结果（validation, extraction）
3. 计算所有字段值：
   - 基础字段（country, province, city）- 从表1复制
   - 时间字段 - 从timeline或表1日期获取
   - 影响程度 - 调用评分计算函数
   - 整体级别 - 综合计算
   - 时间线数据 - JSON字符串
   - 来源数量 - relevant_items长度
   - 文件路径 - 生成MD文件路径
4. 插入或更新数据库（使用ON CONFLICT处理重复）

---

### 3. ✅ 工作流集成

**文件**：`search/orchestrator/workflow.py`

**修改位置**：`_process_contents()` 方法

**功能：**
- 在LLM处理完成后，自动调用表2数据填充
- 自动处理数据库路径（支持相对路径和绝对路径）
- 错误处理：填充失败不影响主流程

**调用时机：**
```
LLM处理完成
    ↓
检查是否有extraction结果
    ↓
调用 fill_rain_flood_impact_table()
    ↓
继续返回LLM结果
```

---

## 数据流转

### 完整流程

```
1. 用户触发搜索
   ↓
2. SearchWorkflow.run_for_event()
   ↓
3. _process_contents() 调用 LLMProcessor
   ↓
4. LLM处理（4个步骤）
   - 步骤1: 验证
   - 步骤2: 提取（关键数据源）
   - 步骤3: 媒体筛选
   - 步骤4: 报告生成
   ↓
5. 填充表2（新增）
   - 调用 fill_rain_flood_impact_table()
   - 计算所有字段值
   - 写入数据库
   ↓
6. 返回结果
```

### 数据映射

| 表2字段 | 数据来源 | 处理方式 |
|---------|---------|---------|
| `rain_event_id` | `context.rain_event.event_id` | 直接使用 |
| `time` | `extraction.timeline[0].time_slot` 或 `rain_event.date` | 提取日期部分 |
| `level` | `extraction.impact.*` | `calculate_overall_level()` |
| `country` | `rain_event.country` | 直接复制 |
| `province` | `rain_event.province` | 直接复制 |
| `city` | `rain_event.city` | 直接复制 |
| `transport_impact_level` | `extraction.impact.transport` | `calculate_transport_impact_level()` |
| `economy_impact_level` | `extraction.impact.economy` | `calculate_economy_impact_level()` |
| `safety_impact_level` | `extraction.impact.safety` | `calculate_safety_impact_level()` |
| `timeline_data` | `extraction.timeline` | `JSON.stringify()` |
| `source_count` | `validation.relevant_items.length` | 直接计数 |
| `detail_file` | - | 生成路径：`search_outputs/{date}/{rain_event_id}_report.md` |

---

## 使用说明

### 自动触发

表2数据填充会在LLM处理完成后**自动执行**，无需手动调用。

### 数据库路径配置

**方式1：环境变量**
```bash
# .env 文件
DB_FILE=apps/api/dev.db
```

**方式2：默认路径**
如果未配置，默认使用：`apps/api/dev.db`（相对于项目根目录）

### 日志输出

成功时：
```
✅ 表2数据填充成功: 20251011_Valencia_1
```

失败时：
```
⚠️  表2数据填充失败: 20251011_Valencia_1
```

详细错误会记录在日志中。

---

## 测试建议

### 1. 测试完整流程

```python
from search.orchestrator.workflow import SearchWorkflow
from search.watcher.rain_event_watcher import RainEvent

# 创建事件
event = RainEvent(
    event_id="20251011_Valencia_1",
    event_time=datetime(2025, 10, 11),
    location_name="Carcaixent",
    country="Spain",
    ...
)

# 运行工作流
workflow = SearchWorkflow()
context = workflow.run_for_event(event)

# 检查表2数据
import sqlite3
conn = sqlite3.connect("apps/api/dev.db")
cursor = conn.cursor()
cursor.execute("SELECT * FROM rain_flood_impact WHERE rain_event_id = ?", ("20251011_Valencia_1",))
result = cursor.fetchone()
print(result)
```

### 2. 测试评分计算

```python
from search.llm.scoring import calculate_transport_impact_level

# 测试有数字的情况
impact = {
    "quantitative_data": {
        "closed_roads": 15,
        "severity_inference": "high"
    }
}
score = calculate_transport_impact_level(impact)
print(score)  # 应该返回 7

# 测试只有推断的情况
impact = {
    "quantitative_data": {
        "closed_roads": None,
        "severity_inference": "moderate"
    }
}
score = calculate_transport_impact_level(impact)
print(score)  # 应该返回 5
```

---

## 注意事项

### 1. 数据库路径

- 确保数据库路径正确（Python和Node.js使用同一个数据库文件）
- 如果使用相对路径，确保从项目根目录运行

### 2. 错误处理

- 表2填充失败不会中断主流程
- 错误会记录在日志中，便于排查

### 3. 数据一致性

- 使用 `ON CONFLICT` 处理重复插入（更新现有记录）
- 确保表1数据存在（rain_event表）

### 4. 缺失数据处理

- 如果LLM没有提取到某个影响类别，对应字段设为 `NULL`
- 如果所有影响程度都为 `NULL`，`level` 也设为 `NULL`

---

## 总结

✅ **表2填写功能已完整实现**

**实现内容：**
1. ✅ 评分计算模块（三层策略）
2. ✅ 数据库写入模块
3. ✅ 工作流集成（自动触发）

**现在可以：**
- 自动从LLM结果中提取数据
- 智能计算影响程度评分
- 自动填充表2所有字段
- 处理缺失数据和错误情况

**下一步：**
- 测试完整流程
- 验证数据准确性
- 根据实际使用情况调整评分算法

