# LLM处理流程完整文档

## 一、流程来源

### 设计参考

根据 `search/orchestrator/workflow.py` 的注释：

```python
"""搜索流程编排器。

参考 BettaFish 中各 Agent 的 orchestrate 思路，将地理识别、关键词
规划、数据采集、处理融合、报告生成等步骤串联成统一工作流。
"""
```

**来源：** 参考了 `BettaFish` 项目中的 Agent orchestration 思路

### 实现位置

- **流程定义**：`search/llm/processor.py` - `LLMProcessor.process()`
- **流程调用**：`search/orchestrator/workflow.py` - `SearchWorkflow._process_contents()`
- **提示词定义**：`search/llm/prompts.py`

---

## 二、完整工作流（从事件到报告）

### 整体流程（SearchWorkflow）

```
1. 地理信息解析 (_resolve_location)
   ↓
2. 查询计划生成 (_build_query_plan)
   ↓
3. 数据采集 (_collect_sources)
   ↓
4. LLM处理 (_process_contents) ← 这里调用LLMProcessor
   ↓
5. 报告生成 (_generate_reports)
```

### LLM处理流程（LLMProcessor）

```
步骤1: 验证 (Validation) - LLM调用
   ↓
步骤2: 提取 (Extraction) - LLM调用
   ↓
步骤3: 媒体筛选 (Media) - 非LLM，数据筛选
   ↓
步骤4: 报告生成 (Report) - LLM调用
```

---

## 三、详细步骤说明

### 步骤1: 事件验证和冲突解决 (Validation)

**文件位置：** `search/llm/processor.py` - `_step1_validation()`

**目的：** 判断搜索结果是否属于该特定事件

**LLM调用：** ✅ 是

**输入：**
- 事件信息（时间、地点、降雨量）
- 搜索结果（预过滤后，最多15条，媒体优先）

**处理流程：**
1. **预过滤**（可选，非LLM）：
   - 时间过滤：只保留事件时间 + N 天内的结果
   - 地点过滤：标题或摘要包含省名或国家名
   - 关键词过滤：包含"rain"/"flood"等关键词
   - 媒体优先：最多3条媒体内容优先进入15条

2. **LLM验证**：
   - 调用 `build_validation_prompt()` 构建提示词
   - 发送给LLM（OpenAI或Gemini）
   - 解析返回的JSON

**输出：**
```json
{
  "relevant_items": [
    {
      "index": 0,
      "relevance_score": 0.95,
      "reason": "Time matches, location matches, highly relevant content",
      "title": "...",
      "url": "...",
      ...
    }
  ],
  "irrelevant_items": [
    {
      "index": 1,
      "reason": "Time doesn't match"
    }
  ]
}
```

**关键逻辑：**
- 如果 `relevant_items` 为空，跳过后续LLM处理（节省成本）
- 媒体优先：即使评分低也优先保留（最多3条）

**提示词位置：** `search/llm/prompts.py` - `build_validation_prompt()`

---

### 步骤2: 时间线和影响提取 (Extraction)

**文件位置：** `search/llm/processor.py` - `_step2_extraction()`

**目的：** 从验证后的相关项中提取时间线和影响评估

**LLM调用：** ✅ 是

**输入：**
- 事件信息
- 验证后的相关项（`relevant_items`）

**处理流程：**
1. 构建提取提示词（使用完整内容，不限长度）
2. 调用LLM
3. 解析返回的JSON

**输出：**
```json
{
  "timeline": [
    {
      "time_slot": "2025-10-11 00:00-06:00",
      "events": ["Rainfall began"],
      "highlights": "Rainfall started",
      "references": ["index0"]
    }
  ],
  "impact": {
    "transport": {
      "summary": "Multiple road closures",
      "details": [...],
      "quantitative_data": {
        "closed_roads": 15,
        "bridges_damaged": null,
        "description": "Multiple roads closed",
        "severity_inference": "high",
        "source": "index0",
        "confidence": "high"
      }
    },
    "economy": {...},
    "safety": {...},
    "response": {...}
  }
}
```

**关键特性：**
- **智能提取**：三层策略（数字优先 → 描述补充 → 推断严重程度）
- **灵活处理**：不强制要求数字，允许使用描述性文本
- **严重程度推断**：从关键词推断（very_low, low, moderate, high, extreme）

**提示词位置：** `search/llm/prompts.py` - `build_extraction_prompt()`

**用途：** 这是**表2数据的主要来源**

---

### 步骤3: 提取验证后的多媒体内容 (Media)

**文件位置：** `search/llm/processor.py` - `_extract_media_from_validation()`

**目的：** 从验证结果中筛选出多媒体内容

**LLM调用：** ❌ 否（只是数据筛选）

**处理流程：**
1. 从 `relevant_items` 中筛选
2. 识别条件：`channel` 为 `"media"` 或 `"social"`，或 `type` 为 `"media"`
3. 限制数量：最多10条（按相关性排序）

**输出：**
```json
{
  "selected_items": [
    {
      "title": "...",
      "url": "...",
      "channel": "media",
      ...
    }
  ],
  "rejected_items": []
}
```

**说明：** 
- 这不是独立的LLM处理步骤
- 只是从步骤1的结果中筛选数据
- 用于步骤4的报告生成

---

### 步骤4: 报告生成 (Report Generation)

**文件位置：** `search/llm/processor.py` - `_step4_report_generation()`

**目的：** 生成完整的Markdown报告（ArcGIS StoryMaps风格）

**LLM调用：** ✅ 是

**输入：**
- 事件信息
- 时间线（步骤2）
- 影响评估（步骤2）
- 新闻来源（步骤1的相关项，排除媒体）
- 多媒体来源（步骤3的筛选结果）

**处理流程：**
1. 收集所有可用的新闻和多媒体来源
2. 构建报告生成提示词
3. 调用LLM生成Markdown报告

**输出：**
```markdown
# The Deluge of DANA Alice

## Event Overview
...

## Timeline
...

## Impact Assessment
...

## Multimedia & News Sources
...
```

**提示词位置：** `search/llm/prompts.py` - `build_report_prompt()`

**用途：** 保存到 `search_outputs/{date}/{rain_event_id}_report.md`

---

## 四、流程调用链

### 完整调用路径

```
用户触发 / Python脚本调用
    ↓
SearchWorkflow.run_for_event()
    ↓
SearchWorkflow._process_contents()
    ↓
LLMProcessor.process()  ← 这里开始LLM处理
    ↓
步骤1: _step1_validation()
    ├─ 预过滤（可选）
    ├─ build_validation_prompt()
    └─ LLM调用
    ↓
步骤2: _step2_extraction()
    ├─ build_extraction_prompt()
    └─ LLM调用
    ↓
步骤3: _extract_media_from_validation()
    └─ 数据筛选（非LLM）
    ↓
步骤4: _step4_report_generation()
    ├─ build_report_prompt()
    └─ LLM调用
    ↓
返回结果
```

### 代码位置

| 步骤 | 方法 | 文件 | LLM调用 |
|------|------|------|---------|
| 步骤1 | `_step1_validation()` | `search/llm/processor.py` | ✅ |
| 步骤2 | `_step2_extraction()` | `search/llm/processor.py` | ✅ |
| 步骤3 | `_extract_media_from_validation()` | `search/llm/processor.py` | ❌ |
| 步骤4 | `_step4_report_generation()` | `search/llm/processor.py` | ✅ |

---

## 五、数据流转

### 输入数据

**EventContext**（从workflow传入）：
```python
{
  "rain_event": RainEvent,  # 事件信息
  "location_profile": {...},  # 地理信息
  "query_plan": {...},  # 查询计划
  "raw_contents": {  # 原始搜索结果
    "news_thenewsapi": [...],
    "official": [...],
    "media": [...],
    ...
  }
}
```

### 中间数据

**步骤1输出：**
```python
{
  "relevant_items": [...],  # 相关项（用于步骤2）
  "irrelevant_items": [...]  # 不相关项（仅记录）
}
```

**步骤2输出：**
```python
{
  "timeline": [...],  # 时间线（用于步骤4和表2）
  "impact": {  # 影响评估（用于步骤4和表2）
    "transport": {...},
    "economy": {...},
    "safety": {...}
  }
}
```

**步骤3输出：**
```python
{
  "selected_items": [...]  # 多媒体内容（用于步骤4）
}
```

### 最终输出

**LLMProcessor.process() 返回：**
```python
{
  "validation": {...},  # 步骤1结果
  "extraction": {...},  # 步骤2结果
  "media": {...},  # 步骤3结果
  "report": "..."  # 步骤4结果（Markdown文本）
}
```

**SearchWorkflow 转换后：**
```python
{
  "validation": {...},
  "extraction": {...},
  "media": {...},
  "timeline": [...],
  "impact": {...},
  "relevant": {...},
  "report": "..."
}
```

---

## 六、关键配置

### LLM提供商

**支持：**
- OpenAI（GPT模型）
- Google Gemini

**配置位置：** `search/config/settings.py`

**环境变量：**
- `LLM_PROVIDER`: `"openai"` 或 `"gemini"`
- `OPENAI_API_KEY`: OpenAI API密钥
- `GEMINI_API_KEY`: Gemini API密钥

### 预过滤配置

**位置：** `search/config/settings.py`

**配置项：**
- `PRE_FILTER_ENABLED`: 是否启用预过滤
- `PRE_FILTER_MODE`: `"strict"` 或 `"loose"`
- `PRE_FILTER_TIME_WINDOW_DAYS`: 时间窗口（默认5天）
- `MAX_ITEMS_FOR_LLM_VALIDATION`: 发送给LLM的最大项数（默认15）

---

## 七、成本优化

### 跳过机制

1. **无搜索结果时**：
   - 在 `_collect_sources()` 后检查
   - 如果 `total_items == 0`，跳过LLM处理

2. **验证后无相关项时**：
   - 在步骤1后检查
   - 如果 `relevant_items` 为空，跳过步骤2和步骤4
   - 只生成最小报告

### Token优化

1. **预过滤**：减少发送给LLM的数据量
2. **摘要限制**：步骤1只发送标题+日期+摘要200字符
3. **媒体优先**：优先保留有价值的媒体内容

---

## 八、与表2的关联

### 数据映射

| 表2字段 | LLM输出路径 | 处理方式 |
|---------|------------|---------|
| `time` | `extraction.timeline[0].time_slot` | 提取日期部分 |
| `level` | `extraction.impact.*` | 综合计算（1-4级） |
| `transport_impact_level` | `extraction.impact.transport.quantitative_data` | 计算评分（1-10分） |
| `economy_impact_level` | `extraction.impact.economy.quantitative_data` | 计算评分（1-10分） |
| `safety_impact_level` | `extraction.impact.safety.quantitative_data` | 计算评分（1-10分） |
| `timeline_data` | `extraction.timeline` | JSON.stringify() |
| `source_count` | `validation.relevant_items.length` | 直接计数 |
| `detail_file` | - | 生成路径 |

### 评分计算

**位置：** 应用层（Node.js），不在LLM流程中

**策略：**
1. **数字优先**：如果有明确数字，基于数字计算
2. **推断补充**：如果没有数字，基于 `severity_inference` 计算
3. **关键词补充**：如果都没有，基于 `description` 中的关键词计算

---

## 九、总结

### 流程特点

1. **4个步骤**：验证 → 提取 → 媒体筛选 → 报告生成
2. **3次LLM调用**：步骤1、步骤2、步骤4
3. **智能提取**：灵活处理缺失数据，不强制要求数字
4. **成本优化**：预过滤、跳过机制、Token限制

### 设计思路

- **参考BettaFish**：Agent orchestration思路
- **模块化设计**：每个步骤独立，易于维护
- **灵活处理**：支持多种数据情况

### 关键文件

- **流程定义**：`search/llm/processor.py`
- **提示词**：`search/llm/prompts.py`
- **工作流编排**：`search/orchestrator/workflow.py`
- **配置**：`search/config/settings.py`

