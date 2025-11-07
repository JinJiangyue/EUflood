"""LLM Prompt 模板。"""

from typing import Any, Dict, List


def build_validation_prompt(
    event_info: Dict[str, Any],
    search_results: List[Dict[str, Any]],
    time_window_days: int = 5,
) -> List[Dict[str, str]]:
    """构建事件验证和冲突解决的 Prompt（步骤1）。"""

    event_id = event_info.get("event_id", "")
    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    province = event_info.get("province", "")
    country = event_info.get("country", "")
    rainfall_mm = event_info.get("rainfall_mm", "")

    # 格式化搜索结果（限制摘要长度以节省token）
    results_text = ""
    for idx, item in enumerate(search_results):
        summary = item.get('summary', 'N/A') or item.get('description', 'N/A') or 'N/A'
        # 进一步缩短摘要长度：从100字符减少到80字符，节省更多token
        # 这样可以减少输入token，为输出留出更多空间
        summary_short = summary[:80] if summary != 'N/A' else 'N/A'
        results_text += f"\n[{idx}] {item.get('title', 'N/A')}\n"
        results_text += f"    摘要: {summary_short}\n"
        results_text += f"    URL: {item.get('url', 'N/A')}\n"
        results_text += f"    发布时间: {item.get('published_at', 'N/A')}\n"
        # 移除 source 字段以节省token（如果不需要）
        # results_text += f"    来源: {item.get('source', 'N/A')}\n"

    prompt = f"""你是一个信息验证专家。请分析以下搜索结果，判断它们是否属于指定的降雨事件，并验证信息的准确性。

事件信息:
- 事件ID: {event_id}
- 发生时间: {event_time}
- 地点: {location} ({province}, {country})

搜索结果:
{results_text}

请完成以下任务：

1. **事件相关性验证**：判断每个搜索结果是否属于这个特定事件
   - 时间是否匹配（事件时间 + {time_window_days}天）
   - 地点是否匹配（省级或市级）
   - 内容是否相关（降雨、洪水、灾害）

2. **信息验证和冲突解决**：
   - 哪些信息是多个来源一致的（更可信）
   - 哪些信息存在冲突（不同来源给出不同数据）
   - 哪些信息只有一个来源提到（需要验证）
   - 来源可信度（官方来源 > 新闻媒体 > 社交媒体）

请返回 JSON 格式（必须是有效的 JSON，不要包含任何其他文本或代码块标记）：
{{
  "relevant_items": [
    {{
      "index": 0,
      "title": "...",
      "url": "...",
      "relevance_score": 0.95,
      "reason": "时间匹配，地点匹配，内容高度相关"
    }}
  ],
  "irrelevant_items": [
    {{
      "index": 1,
      "title": "...",
      "url": "...",
      "reason": "时间不匹配（2025-11-03，事件是2025-10-11）"
    }}
  ],
  "verified_facts": [
    {{
      "fact": "Valencia 地区发生严重洪水",
      "sources": ["index0", "index2", "index3"],
      "confidence": "high"
    }}
  ],
  "conflicts": [
    {{
      "fact": "死亡人数",
      "sources": {{
        "index0": "10人死亡",
        "index2": "5人死亡"
      }},
      "recommendation": "信息冲突，建议使用官方数据"
    }}
  ],
  "unverified": [
    {{
      "fact": "经济损失达1亿欧元",
      "source": "index1",
      "confidence": "low"
    }}
  ]
}}

重要提示：
- 直接返回 JSON 对象，不要包含 ```json 或 ``` 代码块标记
- 确保所有字符串都使用双引号
- 确保 JSON 格式完全正确，可以直接被解析
"""

    return [
        {
            "role": "system",
            "content": "你是一个专业的信息验证专家，擅长分析多来源信息，判断事件相关性，并解决信息冲突。",
        },
        {"role": "user", "content": prompt},
    ]


def build_extraction_prompt(
    event_info: Dict[str, Any],
    verified_items: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """构建时间线和影响提取的 Prompt（步骤2）。"""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    rainfall_mm = event_info.get("rainfall_mm", "")

    # 格式化验证后的信息（缩短摘要以节省token）
    items_text = ""
    for idx, item in enumerate(verified_items):
        summary = item.get('summary', 'N/A') or item.get('description', 'N/A') or 'N/A'
        summary_short = summary[:150] if summary != 'N/A' else 'N/A'  # 限制摘要长度
        items_text += f"\n[{idx}] {item.get('title', 'N/A')}\n"
        items_text += f"    摘要: {summary_short}\n"
        items_text += f"    发布时间: {item.get('published_at', 'N/A')}\n"
        # 移除 source 字段以节省token
        # items_text += f"    来源: {item.get('source', 'N/A')}\n"

    prompt = f"""你是一个灾害信息提取专家。请根据以下验证后的信息，提取时间线和影响评估。

事件信息:
- 时间: {event_time}
- 地点: {location}

验证后的信息来源:
{items_text}

请完成以下任务：

1. **时间线提取**：
   - 从文本中提取具体时间点
   - 理解自然语言时间表达（"凌晨"、"上午"、"傍晚"）
   - 按时间段组织事件（00:00-06:00, 06:00-09:00等）

2. **影响评估**：
   - 从文本中提取量化数据（数字、金额、数量）
   - 理解上下文，准确分类影响类型
   - 标注数据来源和可信度

请返回 JSON 格式（必须是有效的 JSON，不要包含任何其他文本或代码块标记）：
{{
  "timeline": [
    {{
      "time_slot": "2025-10-11 00:00-06:00",
      "events": [
        "开始降雨",
        "气象局发布暴雨预警"
      ],
      "highlights": "降雨开始，预警发布",
      "references": ["index0", "index2"]
    }},
    {{
      "time_slot": "2025-10-11 06:00-09:00",
      "events": [
        "降雨量达到峰值",
        "部分地区开始积水"
      ],
      "highlights": "降雨加剧，开始出现积水",
      "references": ["index1"]
    }}
  ],
  "impact": {{
    "transport": {{
      "summary": "多条道路封闭，交通严重中断",
      "details": [
        "A-7 高速公路部分路段封闭",
        "Valencia 市区多条街道积水"
      ],
      "quantitative_data": {{
        "closed_roads": "15条",
        "source": "index0",
        "confidence": "high"
      }}
    }},
    "economy": {{
      "summary": "初步估计经济损失...",
      "quantitative_data": {{
        "estimated_loss": "5000万欧元",
        "source": "index2",
        "confidence": "medium"
      }}
    }},
    "safety": {{
      "summary": "无人员伤亡报告",
      "quantitative_data": {{
        "injured": 0,
        "deaths": 0,
        "source": "index1",
        "confidence": "high"
      }}
    }},
    "response": {{
      "summary": "启动应急响应...",
      "details": [
        "发布红色预警",
        "疏散低洼地区居民"
      ]
    }}
  }}
}}

重要提示：
- 直接返回 JSON 对象，不要包含 ```json 或 ``` 代码块标记
- 确保所有字符串都使用双引号
- 确保 JSON 格式完全正确，可以直接被解析
"""

    return [
        {
            "role": "system",
            "content": "你是一个专业的灾害信息提取专家，擅长从非结构化文本中提取时间线和影响评估信息。",
        },
        {"role": "user", "content": prompt},
    ]


def build_media_filter_prompt(
    event_info: Dict[str, Any],
    media_items: List[Dict[str, Any]],
    time_window_days: int = 5,
) -> List[Dict[str, str]]:
    """构建多媒体筛选的 Prompt（步骤3）。"""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    rainfall_mm = event_info.get("rainfall_mm", "")

    # 格式化多媒体内容（缩短描述以节省token）
    items_text = ""
    for idx, item in enumerate(media_items):
        summary = item.get('summary', 'N/A') or item.get('description', 'N/A') or 'N/A'
        summary_short = summary[:200] if summary != 'N/A' else 'N/A'  # 从300减少到200
        items_text += f"\n[{idx}] {item.get('title', 'N/A')}\n"
        items_text += f"    描述: {summary_short}\n"
        items_text += f"    URL: {item.get('url', 'N/A')}\n"
        items_text += f"    发布时间: {item.get('published_at', 'N/A')}\n"
        # 移除频道字段以节省token
        # items_text += f"    频道: {item.get('source', 'N/A')}\n"

    prompt = f"""你是一个多媒体内容筛选专家。请从以下视频/多媒体内容中，选择最相关、最有价值的5-10条。

事件信息:
- 时间: {event_time}
- 地点: {location}

多媒体内容:
{items_text}

请分析每个视频，考虑：
1. 标题是否包含事件相关信息（时间、地点、关键词）
2. 描述是否与事件相关
3. 发布时间是否接近事件时间（事件时间 + {time_window_days}天）
4. 频道可信度

请返回 JSON 格式（必须是有效的 JSON，不要包含任何其他文本或代码块标记）：
{{
  "selected_items": [
    {{
      "index": 0,
      "title": "...",
      "url": "...",
      "relevance_score": 0.95,
      "reason": "标题包含事件时间和地点，发布时间匹配，内容高度相关"
    }}
  ],
  "rejected_items": [
    {{
      "index": 1,
      "title": "...",
      "reason": "时间不匹配（2025-11-03，事件是2025-10-11），是回顾文章"
    }}
  ]
}}

重要提示：
- 直接返回 JSON 对象，不要包含 ```json 或 ``` 代码块标记
- 确保所有字符串都使用双引号
- 确保 JSON 格式完全正确，可以直接被解析
"""

    return [
        {
            "role": "system",
            "content": "你是一个专业的多媒体内容筛选专家，擅长判断视频内容与特定事件的相关性。",
        },
        {"role": "user", "content": prompt},
    ]


def build_report_prompt(
    event_info: Dict[str, Any],
    timeline: List[Dict[str, Any]],
    impact: Dict[str, Any],
    media: List[Dict[str, Any]],
    verified_facts: List[Dict[str, Any]],
    conflicts: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """构建报告生成的 Prompt（步骤4）。"""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    province = event_info.get("province", "")
    country = event_info.get("country", "")
    rainfall_mm = event_info.get("rainfall_mm", "")
    rain_term = event_info.get("rain_term", "rain")
    flood_term = event_info.get("flood_term", "flood")

    prompt = f"""你是一个专业报告撰写专家。请根据以下信息，生成一份完整的英文洪水事件报告。

事件信息:
- 时间: {event_time}
- 地点: {location} ({province}, {country})
- 本地术语: "{rain_term}" (rain), "{flood_term}" (flood)

时间线:
{_format_timeline(timeline)}

影响评估:
{_format_impact(impact)}

验证的事实:
{_format_verified_facts(verified_facts)}

信息冲突:
{_format_conflicts(conflicts)}

多媒体来源:
{_format_media(media)}

请生成一份结构化的 Markdown 报告，包含：
1. **Event Overview**（事件概述）
   - 简要介绍事件起因、受灾区域和核心影响
   - 包含"rain"和"flood"的本地语言翻译

2. **Flood Timeline**（洪水时间线）
   - 详细列出事件当天洪水从预警到救援的详细时间线
   - 使用时间段格式（例如：00:00-06:00, 06:00-09:00等）

3. **Multimedia & News Sources**（多媒体与新闻来源）
   - 如果提供了真实的多媒体来源，列出这些真实的链接和描述
   - 如果没有提供真实的多媒体来源，请明确说明"无可用多媒体内容"，不要生成占位符或假链接
   - 只使用提供的真实 URL，不要自己编造链接

4. **Impact Assessment**（影响评估）
   - 分析洪灾在交通、经济、居民安全和应急响应等方面的具体影响
   - 提供量化数据（如果可用）
   - 标注信息来源
   - 对于冲突信息，明确标注

5. **Summary**（总结）
   - 对此次事件进行简要总结
   - 阐述其重要性

要求：
- 使用英文
- 使用 Markdown 格式
- 提供量化数据（如果可用）
- 标注信息来源
- 对于冲突信息，明确标注（例如："Note: Different sources report different numbers"）
- 确保信息准确、客观
- **重要**：只使用提供的真实 URL，不要生成占位符、假链接或示例链接
- **重要**：如果某个部分没有真实数据，请明确说明"无可用数据"，不要编造内容

请直接返回 Markdown 格式的报告，不要包含代码块标记。
"""

    return [
        {
            "role": "system",
            "content": "你是一个专业的报告撰写专家，擅长生成结构清晰、信息准确的灾害事件报告。",
        },
        {"role": "user", "content": prompt},
    ]


def _format_timeline(timeline: List[Dict[str, Any]]) -> str:
    """格式化时间线。"""
    if not timeline:
        return "无时间线信息"
    text = ""
    for item in timeline:
        text += f"- {item.get('time_slot', 'N/A')}: {item.get('highlights', 'N/A')}\n"
    return text


def _format_impact(impact: Dict[str, Any]) -> str:
    """格式化影响评估。"""
    if not impact:
        return "无影响评估信息"
    text = ""
    for category, data in impact.items():
        text += f"- {category}: {data.get('summary', 'N/A')}\n"
    return text


def _format_verified_facts(facts: List[Dict[str, Any]]) -> str:
    """格式化验证的事实。"""
    if not facts:
        return "无验证事实"
    text = ""
    for fact in facts:
        text += f"- {fact.get('fact', 'N/A')} (来源: {', '.join(fact.get('sources', []))}, 可信度: {fact.get('confidence', 'N/A')})\n"
    return text


def _format_conflicts(conflicts: List[Dict[str, Any]]) -> str:
    """格式化冲突信息。"""
    if not conflicts:
        return "无信息冲突"
    text = ""
    for conflict in conflicts:
        text += f"- {conflict.get('fact', 'N/A')}: {conflict.get('recommendation', 'N/A')}\n"
    return text


def _format_media(media: List[Dict[str, Any]]) -> str:
    """格式化多媒体。"""
    if not media:
        return "无真实多媒体内容（请明确说明，不要生成占位符链接）"
    text = ""
    for idx, item in enumerate(media, 1):
        title = item.get('title', 'N/A')
        url = item.get('url', 'N/A')
        summary = item.get('summary', '')
        source = item.get('source', '')
        published_at = item.get('published_at', '')
        text += f"\n[{idx}] {title}\n"
        text += f"    URL: {url}\n"
        if summary:
            text += f"    描述: {summary[:200]}\n"
        if source:
            text += f"    来源: {source}\n"
        if published_at:
            text += f"    发布时间: {published_at}\n"
    return text

