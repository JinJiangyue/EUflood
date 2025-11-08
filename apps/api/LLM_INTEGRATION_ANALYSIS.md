# LLM模型对接分析与优化建议

## 一、当前LLM处理流程

### 4个处理步骤

1. **Step 1: 验证（Validation）**
   - 目的：判断搜索结果是否属于该事件
   - 输出：`relevant_items` 和 `irrelevant_items`
   - 用途：计算 `source_count`

2. **Step 2: 提取（Extraction）**
   - 目的：提取时间线和影响评估
   - 输出：`timeline` 和 `impact`
   - 用途：**核心数据源，用于填写表2**

3. **Step 3: 媒体（Media）**
   - 目的：提取多媒体内容
   - 输出：`selected_items`
   - 用途：用于生成报告

4. **Step 4: 报告（Report）**
   - 目的：生成Markdown报告
   - 输出：Markdown文本
   - 用途：保存到 `detail_file`

---

## 二、表2字段与LLM输出的映射关系

| 表2字段 | 数据来源 | LLM输出路径 | 计算/转换方式 |
|---------|---------|------------|--------------|
| `rain_event_id` | 表1 | - | 直接使用表1的id |
| `time` | LLM + 表1 | `extraction.timeline[0].time_slot` 或 `rain_event.date` | 提取日期部分 |
| `level` | 计算 | `extraction.impact.*` | 综合三个影响程度计算（1-4级） |
| `country` | 表1 | - | 直接复制 |
| `province` | 表1 | - | 直接复制 |
| `city` | 表1 | - | 直接复制 |
| `transport_impact_level` | LLM | `extraction.impact.transport.quantitative_data` | 根据数据计算（1-10分） |
| `economy_impact_level` | LLM | `extraction.impact.economy.quantitative_data` | 根据数据计算（1-10分） |
| `safety_impact_level` | LLM | `extraction.impact.safety.quantitative_data` | 根据数据计算（1-10分） |
| `timeline_data` | LLM | `extraction.timeline` | JSON.stringify() |
| `source_count` | LLM | `validation.relevant_items.length` | 直接计数 |
| `detail_file` | 生成 | - | `search_outputs/{date}/{rain_event_id}_report.md` |

---

## 三、当前提示词分析

### Step 2: Extraction Prompt（关键）

**当前要求：**
```json
{
  "impact": {
    "transport": {
      "summary": "...",
      "details": [...],
      "quantitative_data": {
        "closed_roads": "15 roads",
        "source": "index0",
        "confidence": "high"
      }
    },
    "economy": {
      "summary": "...",
      "quantitative_data": {
        "estimated_loss": "50 million EUR",
        "source": "index2",
        "confidence": "medium"
      }
    },
    "safety": {
      "summary": "...",
      "quantitative_data": {
        "injured": 0,
        "deaths": 0,
        "source": "index1",
        "confidence": "high"
      }
    }
  }
}
```

**优点：**
- ✅ 已经要求提取 `quantitative_data`
- ✅ 结构清晰，包含 `summary`、`details`、`quantitative_data`

**问题：**
- ⚠️ `quantitative_data` 的字段名不够标准化
- ⚠️ 缺少明确的提取指导（哪些数据应该提取）
- ⚠️ 没有明确要求提取所有可能的数据字段

---

## 四、优化建议

### 建议1：增强 Extraction Prompt 的定量数据提取要求

**当前问题：**
- LLM可能只提取部分数据
- 字段名不统一（如 `closed_roads` vs `roads_closed`）
- 缺少关键数据（如疏散人数、房屋受损等）

**优化方案：**

在 `build_extraction_prompt` 中，明确要求提取以下标准字段：

```python
# 在 prompt 中添加明确的字段要求
quantitative_fields_guide = """
**Transport Impact - 必须提取的字段：**
- closed_roads: 关闭的道路数量（整数或字符串，如 "15 roads"）
- bridges_damaged: 受损桥梁数量（整数）
- traffic_disruption_level: 交通中断程度（描述性文本，如 "severe", "moderate"）
- affected_highways: 受影响的高速公路数量（整数）

**Economy Impact - 必须提取的字段：**
- estimated_loss: 经济损失（字符串，如 "50 million EUR"）
- affected_businesses: 受影响的企业数量（整数）
- agricultural_damage: 农业损失（字符串或数字）

**Safety Impact - 必须提取的字段：**
- injured: 受伤人数（整数）
- deaths: 死亡人数（整数）
- evacuated: 疏散人数（整数）
- houses_damaged: 受损房屋数量（整数）
- houses_destroyed: 摧毁房屋数量（整数）
- missing: 失踪人数（整数）

**提取规则：**
1. 如果文本中没有明确提到某个数据，该字段设为 null 或 0
2. 优先提取数字，如果只有描述性文本，保留文本
3. 如果多个来源有冲突数据，提取最可信的来源（官方 > 新闻 > 社交媒体）
4. 所有数字字段尽量提取为整数，货币字段保留单位
"""
```

### 建议2：添加评分指导（可选）

**方案A：在Prompt中提供评分参考**
- 在prompt中说明评分标准（1-10分），让LLM理解数据的重要性
- 但**不要求LLM直接评分**，由应用层计算

**方案B：完全由应用层计算**
- LLM只负责提取原始数据
- 应用层根据提取的数据计算评分
- **推荐方案B**，更可控、更一致

### 建议3：增强时间线提取

**当前要求：**
- 时间格式：`YYYY-MM-DD HH:MM-HH:MM`
- 提取事件和亮点

**优化建议：**
- 明确要求提取**最早的时间点**（用于表2的 `time` 字段）
- 要求时间线按时间顺序排列
- 如果无法确定具体时间，使用日期（`YYYY-MM-DD`）

### 建议4：数据验证和容错

**问题：**
- LLM可能返回格式错误的数据
- 可能缺少某些字段
- 可能返回无效的数值

**解决方案：**

```python
def validate_and_normalize_extraction_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """验证和规范化LLM提取结果"""
    
    # 1. 验证timeline格式
    timeline = result.get("timeline", [])
    for item in timeline:
        if "time_slot" not in item:
            logger.warning("Timeline item missing time_slot")
            continue
        # 验证时间格式
        # ...
    
    # 2. 验证impact结构
    impact = result.get("impact", {})
    
    # 规范化transport数据
    transport = impact.get("transport", {})
    quantitative_data = transport.get("quantitative_data", {})
    
    # 标准化字段名
    normalized_transport = {
        "closed_roads": _extract_number(quantitative_data.get("closed_roads") or quantitative_data.get("roads_closed")),
        "bridges_damaged": _extract_number(quantitative_data.get("bridges_damaged") or quantitative_data.get("bridges")),
        # ...
    }
    
    # 3. 验证数值范围
    # closed_roads 应该是非负整数
    if normalized_transport["closed_roads"] < 0:
        normalized_transport["closed_roads"] = 0
    
    return {
        "timeline": timeline,
        "impact": {
            "transport": {**transport, "quantitative_data": normalized_transport},
            # ...
        }
    }
```

---

## 五、评分计算逻辑（应用层）

### 1. Transport Impact Level (1-10分)

```python
def calculate_transport_impact_level(transport_impact: Dict[str, Any]) -> Optional[int]:
    """计算交通影响程度（1-10分）"""
    if not transport_impact or not transport_impact.get("quantitative_data"):
        return None
    
    data = transport_impact["quantitative_data"]
    closed_roads = _extract_number(data.get("closed_roads", 0))
    bridges_damaged = _extract_number(data.get("bridges_damaged", 0))
    
    score = 0
    
    # 道路关闭评分
    if closed_roads >= 30:
        score += 9
    elif closed_roads >= 15:
        score += 7
    elif closed_roads >= 5:
        score += 5
    elif closed_roads >= 1:
        score += 2
    else:
        score += 1  # 即使没有道路关闭，也可能有轻微影响
    
    # 桥梁受损加分
    if bridges_damaged >= 3:
        score += 2
    elif bridges_damaged >= 1:
        score += 1
    
    # 限制在1-10范围内
    return min(10, max(1, score))
```

### 2. Economy Impact Level (1-10分)

```python
def calculate_economy_impact_level(economy_impact: Dict[str, Any]) -> Optional[int]:
    """计算经济影响程度（1-10分）"""
    if not economy_impact or not economy_impact.get("quantitative_data"):
        return None
    
    data = economy_impact["quantitative_data"]
    loss_str = data.get("estimated_loss", "0")
    
    # 提取数字（处理 "50 million EUR" 格式）
    loss = _parse_loss_amount(loss_str)  # 返回million单位
    
    # 评分
    if loss >= 50:
        return 9
    elif loss >= 10:
        return 7
    elif loss >= 1:
        return 5
    elif loss >= 0.1:
        return 2
    else:
        return 1
```

### 3. Safety Impact Level (1-10分)

```python
def calculate_safety_impact_level(safety_impact: Dict[str, Any]) -> Optional[int]:
    """计算安全影响程度（1-10分）"""
    if not safety_impact or not safety_impact.get("quantitative_data"):
        return None
    
    data = safety_impact["quantitative_data"]
    injured = _extract_number(data.get("injured", 0))
    deaths = _extract_number(data.get("deaths", 0))
    evacuated = _extract_number(data.get("evacuated", 0))
    houses_damaged = _extract_number(data.get("houses_damaged", 0))
    
    casualties = injured + deaths
    
    score = 0
    
    # 伤亡评分
    if casualties >= 20:
        score += 9
    elif casualties >= 5:
        score += 7
    elif casualties >= 1:
        score += 4
    else:
        score += 1  # 无伤亡
    
    # 疏散人数加分
    if evacuated >= 1000:
        score += 2
    elif evacuated >= 200:
        score += 1
    
    # 房屋受损加分
    if houses_damaged >= 200:
        score += 2
    elif houses_damaged >= 50:
        score += 1
    
    return min(10, max(1, score))
```

### 4. Overall Level (1-4级)

```python
def calculate_overall_level(
    transport_level: Optional[int],
    economy_level: Optional[int],
    safety_level: Optional[int]
) -> Optional[int]:
    """计算整体级别（1-4级）"""
    
    # 只计算非空值
    levels = [l for l in [transport_level, economy_level, safety_level] if l is not None]
    
    if not levels:
        return None
    
    avg = sum(levels) / len(levels)
    
    if avg < 3:
        return 1  # 1级：轻微影响
    elif avg < 6:
        return 2  # 2级：中等影响
    elif avg < 9:
        return 3  # 3级：严重影响
    else:
        return 4  # 4级：极端影响
```

---

## 六、完整的表2数据填充流程

### 流程步骤

```python
async def fill_rain_flood_impact_table(rain_event_id: str, llm_result: Dict[str, Any]):
    """填充表2数据"""
    
    # 1. 获取表1数据
    rain_event = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(rain_event_id)
    
    # 2. 提取LLM结果
    validation = llm_result.get("validation", {})
    extraction = llm_result.get("extraction", {})
    
    # 3. 计算基础字段
    country = rain_event.country
    province = rain_event.province
    city = rain_event.city
    
    # 4. 计算时间字段
    timeline = extraction.get("timeline", [])
    if timeline and len(timeline) > 0:
        time_slot = timeline[0].get("time_slot", "")
        time = time_slot.split(" ")[0] if " " in time_slot else time_slot
    else:
        time = rain_event.date
    
    # 5. 计算影响程度
    impact = extraction.get("impact", {})
    transport_level = calculate_transport_impact_level(impact.get("transport"))
    economy_level = calculate_economy_impact_level(impact.get("economy"))
    safety_level = calculate_safety_impact_level(impact.get("safety"))
    
    # 6. 计算整体级别
    level = calculate_overall_level(transport_level, economy_level, safety_level)
    
    # 7. 时间线数据
    timeline_data = json.dumps(timeline)
    
    # 8. 来源数量
    source_count = len(validation.get("relevant_items", []))
    
    # 9. 文件路径
    date_dir = rain_event.date.replace("-", "")
    detail_file = f"search_outputs/{date_dir}/{rain_event_id}_report.md"
    
    # 10. 插入或更新表2
    db.prepare("""
        INSERT INTO rain_flood_impact (
            rain_event_id, time, level,
            country, province, city,
            transport_impact_level, economy_impact_level, safety_impact_level,
            timeline_data, source_count, detail_file,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(rain_event_id) DO UPDATE SET
            time = excluded.time,
            level = excluded.level,
            transport_impact_level = excluded.transport_impact_level,
            economy_impact_level = excluded.economy_impact_level,
            safety_impact_level = excluded.safety_impact_level,
            timeline_data = excluded.timeline_data,
            source_count = excluded.source_count,
            detail_file = excluded.detail_file,
            updated_at = datetime('now')
    """).run(
        rain_event_id, time, level,
        country, province, city,
        transport_level, economy_level, safety_level,
        timeline_data, source_count, detail_file
    )
```

---

## 七、Prompt优化具体建议

### 修改 `build_extraction_prompt`

**在prompt中添加以下内容：**

```python
# 在 prompt 中添加定量数据提取指导
quantitative_extraction_guide = """
**重要：定量数据提取要求**

请从文本中提取以下定量数据（如果文本中没有提到，该字段设为 null）：

**Transport Impact (交通影响):**
- closed_roads: 关闭的道路数量（整数，如 15）
- bridges_damaged: 受损桥梁数量（整数，如 2）
- affected_highways: 受影响的高速公路数量（整数）

**Economy Impact (经济影响):**
- estimated_loss: 经济损失（字符串，保留单位，如 "50 million EUR"）
- affected_businesses: 受影响的企业数量（整数）
- agricultural_damage: 农业损失（字符串或数字）

**Safety Impact (安全影响):**
- injured: 受伤人数（整数，如 5）
- deaths: 死亡人数（整数，如 0）
- evacuated: 疏散人数（整数，如 200）
- houses_damaged: 受损房屋数量（整数，如 50）
- houses_destroyed: 摧毁房屋数量（整数，如 10）
- missing: 失踪人数（整数，如 0）

**提取规则：**
1. 优先提取明确的数字
2. 如果文本中只有描述性信息（如 "many roads closed"），在 summary 中说明，quantitative_data 设为 null
3. 如果多个来源有冲突，选择最可信的来源（官方 > 新闻 > 社交媒体）
4. 所有数字字段尽量提取为整数
"""
```

---

## 八、测试和验证

### 测试用例

1. **完整数据测试**
   - 输入：包含所有影响类别的完整数据
   - 验证：所有字段都能正确提取和计算

2. **部分数据测试**
   - 输入：只有部分影响类别（如只有transport，没有economy）
   - 验证：缺失字段设为null，不影响其他字段

3. **边界值测试**
   - 输入：极端值（如0伤亡、100条道路关闭）
   - 验证：评分计算正确

4. **格式错误测试**
   - 输入：LLM返回格式错误的数据
   - 验证：容错处理正确

---

## 九、总结和建议

### 关键点

1. **LLM只负责提取原始数据，不负责评分**
   - 评分由应用层统一计算，保证一致性

2. **增强Prompt的明确性**
   - 明确要求提取哪些字段
   - 提供字段名标准
   - 说明提取规则

3. **数据验证和容错**
   - 验证LLM返回的数据格式
   - 规范化字段名
   - 处理缺失数据

4. **评分算法标准化**
   - 制定明确的评分标准
   - 使用配置化的评分规则
   - 记录评分依据

### 实施优先级

1. **高优先级**（立即实施）：
   - ✅ 增强 Extraction Prompt 的定量数据提取要求
   - ✅ 实现评分计算函数
   - ✅ 实现表2数据填充流程

2. **中优先级**（后续优化）：
   - ⚠️ 数据验证和容错机制
   - ⚠️ 评分标准配置化

3. **低优先级**（可选）：
   - ⚪ 评分依据记录（用于审计）
   - ⚪ 评分历史追踪

---

## 十、下一步行动

1. **修改 `search/llm/prompts.py`**
   - 增强 `build_extraction_prompt` 的定量数据提取要求

2. **创建评分计算模块**
   - 在 `apps/api/src/modules/` 下创建新模块
   - 实现评分计算函数

3. **实现表2填充逻辑**
   - 在LLM处理完成后调用
   - 集成到现有工作流

4. **测试**
   - 使用真实数据测试
   - 验证所有字段都能正确填充

