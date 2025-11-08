# LLM提示词优化方案

## 问题1：媒体步骤说明

### 当前状态

**步骤3（媒体）** 实际上**不再调用LLM**，只是从步骤1的验证结果中筛选出多媒体内容：

```python
def _extract_media_from_validation(self, validation_result):
    """从步骤1的验证结果中提取多媒体内容（不再单独调用LLM）"""
    # 只是筛选，不调用LLM
    relevant_items = validation_result.get("relevant_items", [])
    media_items = [item for item in relevant_items 
                   if item.get("channel") in {"media", "social"}]
    return {"selected_items": media_items}
```

### 建议

**可以保留步骤3，但说明它只是数据筛选，不是LLM处理步骤。**

或者，可以简化为：
- **步骤1**：验证（LLM）
- **步骤2**：提取（LLM）
- **步骤3**：报告生成（LLM，内部包含媒体筛选）

---

## 问题2：智能、灵活的提示词设计

### 核心原则

1. **不强制要求数字**：如果文本中没有明确数字，允许使用描述性文本
2. **智能推断**：从描述性文本中推断影响程度
3. **灵活处理缺失**：缺失数据设为 `null`，不影响其他字段
4. **定性+定量结合**：既有数字，也有描述性评估

### 优化后的 Extraction Prompt

```python
def build_extraction_prompt(
    event_info: Dict[str, Any],
    verified_items: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """Build extraction prompt - 智能、灵活版本"""
    
    # ... 前面的代码相同 ...
    
    prompt = f"""You are a disaster information extraction expert. Extract timeline and impact assessment from the following verified information sources.

Event Information:
- Time: {event_time}
- Location: {location}
- Rainfall: {rainfall_mm}mm

Verified Information Sources:
{items_text}

Your Tasks:

1. **Timeline Extraction**:
   - Extract specific time points from the text
   - Understand natural language time expressions (e.g., "early morning", "afternoon", "evening")
   - Organize events by time slots (e.g., 00:00-06:00, 06:00-09:00, etc.)
   - Format: "YYYY-MM-DD HH:MM-HH:MM"
   - If exact time is not available, use date only: "YYYY-MM-DD"

2. **Impact Assessment** (智能提取，灵活处理):

   **Extraction Strategy:**
   - **Priority 1**: Extract explicit numbers if available (e.g., "15 roads closed", "50 million EUR")
   - **Priority 2**: If no numbers, extract descriptive text and infer severity level
   - **Priority 3**: If no information, set field to null
   
   **For each impact category, extract:**
   
   **Transport Impact:**
   - Look for: road closures, traffic disruptions, bridge damage, highway closures
   - Extract numbers if available: closed_roads (integer), bridges_damaged (integer)
   - If no numbers: extract descriptive text (e.g., "multiple roads", "several highways")
   - Infer severity from keywords:
     * "severe", "extensive", "major" → high impact
     * "some", "several", "a few" → moderate impact
     * "minor", "limited" → low impact
   
   **Economy Impact:**
   - Look for: economic loss, damage estimates, business impact, agricultural damage
   - Extract numbers if available: estimated_loss (string with unit, e.g., "50 million EUR")
   - If no numbers: extract descriptive text (e.g., "significant losses", "millions in damage")
   - Infer severity from keywords:
     * "millions", "billions", "significant" → high impact
     * "thousands", "moderate" → moderate impact
     * "minor", "limited" → low impact
   
   **Safety Impact:**
   - Look for: casualties, injuries, deaths, evacuations, house damage
   - Extract numbers if available:
     * injured (integer)
     * deaths (integer)
     * evacuated (integer)
     * houses_damaged (integer)
     * houses_destroyed (integer)
   - If no numbers: extract descriptive text (e.g., "no casualties", "several injured", "many evacuated")
   - Infer severity from keywords:
     * "no casualties", "no injuries" → very low impact (0)
     * "several", "a few" → low impact (1-3)
     * "many", "dozens" → moderate impact (4-6)
     * "hundreds", "massive" → high impact (7-10)

Return JSON format (must be valid JSON, no code block markers):
{{
  "timeline": [
    {{
      "time_slot": "2025-10-11 00:00-06:00",
      "events": [
        "Rainfall began",
        "Meteorological agency issued heavy rain warning"
      ],
      "highlights": "Rainfall started, warning issued",
      "references": ["index0", "index2"]
    }}
  ],
  "impact": {{
    "transport": {{
      "summary": "Multiple road closures, severe traffic disruption",
      "details": [
        "A-7 highway partially closed",
        "Multiple streets in Valencia city flooded"
      ],
      "quantitative_data": {{
        "closed_roads": 15,  // 如果有数字，使用整数；如果没有，可以是描述性文本或null
        "bridges_damaged": null,  // 如果没有提到，设为null
        "description": "Multiple roads closed, severe disruption",  // 描述性补充
        "severity_inference": "high",  // 从文本推断的严重程度：low, moderate, high, extreme
        "source": "index0",
        "confidence": "high"
      }}
    }},
    "economy": {{
      "summary": "Preliminary economic loss estimates...",
      "quantitative_data": {{
        "estimated_loss": "50 million EUR",  // 如果有数字，保留单位
        "description": "Significant economic losses reported",  // 描述性补充
        "severity_inference": "high",  // 推断的严重程度
        "source": "index2",
        "confidence": "medium"
      }}
    }},
    "safety": {{
      "summary": "No casualties reported",
      "quantitative_data": {{
        "injured": 0,  // 明确提到"no casualties"时，设为0
        "deaths": 0,
        "evacuated": null,  // 如果没有提到，设为null
        "houses_damaged": null,
        "description": "No casualties reported, some areas evacuated",  // 描述性补充
        "severity_inference": "low",  // 推断的严重程度
        "source": "index1",
        "confidence": "high"
      }}
    }},
    "response": {{
      "summary": "Emergency response activated...",
      "details": [
        "Red alert issued",
        "Residents in low-lying areas evacuated"
      ]
    }}
  }}
}}

**Important Extraction Rules:**
1. **Numbers First**: If text contains explicit numbers, extract them as integers or strings with units
2. **Descriptive Fallback**: If no numbers, extract descriptive text in "description" field
3. **Severity Inference**: Always provide "severity_inference" based on keywords and context
4. **Null for Missing**: If category is not mentioned at all, set quantitative_data to null
5. **Confidence Levels**: 
   - "high": explicit numbers or official sources
   - "medium": descriptive text with clear context
   - "low": vague descriptions or conflicting information
6. **Flexibility**: Don't force numbers if they don't exist - use descriptions and inferences instead

Important Notes:
- Return only JSON object, no ```json or ``` code block markers
- Use double quotes for all strings
- Ensure JSON is valid and parseable
- Use English for all extracted content
- Time slots should be in format: "YYYY-MM-DD HH:MM-HH:MM" or "YYYY-MM-DD" if time is unknown
"""
    
    return [
        {
            "role": "system",
            "content": "You are a professional disaster information extraction expert. You excel at extracting both quantitative and qualitative information from unstructured text. You can intelligently infer impact severity from descriptive language when explicit numbers are not available. You are flexible and don't force data that doesn't exist.",
        },
        {"role": "user", "content": prompt},
    ]
```

---

## 应用层评分逻辑（基于智能提取结果）

### 评分策略：数字优先，描述补充

```python
def calculate_transport_impact_level(transport_impact: Dict[str, Any]) -> Optional[int]:
    """计算交通影响程度（1-10分）- 智能版本"""
    if not transport_impact or not transport_impact.get("quantitative_data"):
        return None
    
    data = transport_impact["quantitative_data"]
    
    # 策略1：如果有明确数字，使用数字计算
    closed_roads = _extract_number(data.get("closed_roads"))
    bridges_damaged = _extract_number(data.get("bridges_damaged"))
    
    if closed_roads is not None or bridges_damaged is not None:
        # 使用数字计算（原有逻辑）
        score = 0
        if closed_roads and closed_roads >= 30:
            score += 9
        elif closed_roads and closed_roads >= 15:
            score += 7
        # ... 原有逻辑
        return min(10, max(1, score))
    
    # 策略2：如果没有数字，使用severity_inference
    severity = data.get("severity_inference", "").lower()
    if severity == "extreme":
        return 9
    elif severity == "high":
        return 7
    elif severity == "moderate":
        return 5
    elif severity == "low":
        return 2
    else:
        return 1
    
    # 策略3：如果都没有，使用description中的关键词
    description = data.get("description", "").lower()
    if any(word in description for word in ["severe", "extensive", "major", "massive"]):
        return 7
    elif any(word in description for word in ["some", "several", "moderate"]):
        return 5
    elif any(word in description for word in ["minor", "limited", "few"]):
        return 2
    else:
        return 1
```

---

## 优化后的完整流程

### 数据流转

```
LLM提取结果
    ↓
{
  "impact": {
    "transport": {
      "quantitative_data": {
        "closed_roads": 15,  // 有数字
        "severity_inference": "high",
        "description": "Multiple roads closed"
      }
    },
    "economy": {
      "quantitative_data": {
        "estimated_loss": null,  // 没有数字
        "severity_inference": "moderate",
        "description": "Significant economic losses"
      }
    }
  }
}
    ↓
应用层评分计算
    ↓
{
  "transport_impact_level": 7,  // 基于数字计算
  "economy_impact_level": 5   // 基于severity_inference
}
```

---

## 关键改进点

### 1. 三层提取策略

1. **数字优先**：提取明确数字
2. **描述补充**：提取描述性文本
3. **智能推断**：从关键词推断严重程度

### 2. 灵活的字段处理

- 有数字 → 使用数字
- 无数字 → 使用描述 + 推断
- 无信息 → 设为 null

### 3. 评分计算的三层策略

1. **数字计算**：基于明确数字
2. **推断计算**：基于 severity_inference
3. **关键词计算**：基于 description 中的关键词

---

## 实施建议

### 阶段1：优化Prompt（立即）

1. 修改 `build_extraction_prompt`，添加智能提取指导
2. 要求返回 `severity_inference` 和 `description` 字段
3. 明确说明：不强制要求数字，灵活处理

### 阶段2：优化评分逻辑（后续）

1. 实现三层评分策略
2. 优先使用数字，其次使用推断，最后使用关键词

### 阶段3：测试和调优

1. 使用真实数据测试
2. 验证缺失数据场景
3. 调整关键词匹配规则

