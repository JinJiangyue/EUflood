"""LLM Prompt 模板。"""

from typing import Any, Dict, List


def build_validation_prompt(
    event_info: Dict[str, Any],
    search_results: List[Dict[str, Any]],
    time_window_days: int = 5,
) -> List[Dict[str, str]]:
    """Build validation prompt for LLM1 (Step 1): Simple relevance judgment with short information only."""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    province = event_info.get("province", "")
    country = event_info.get("country", "")
    rain_term = event_info.get("rain_term", "rain")
    flood_term = event_info.get("flood_term", "flood")

    # Format search results with short information only (title + date + summary 200 chars)
    results_text = ""
    for idx, item in enumerate(search_results):
        title = item.get('title', 'N/A')
        published_at = item.get('published_at', 'N/A')
        summary = item.get('summary', 'N/A') or item.get('description', 'N/A') or 'N/A'
        summary_short = summary[:200] if summary != 'N/A' else 'N/A'  # Limit to 200 characters
        channel = item.get('channel', 'N/A')
        
        results_text += f"\n[{idx}] {title}\n"
        results_text += f"    Published: {published_at}\n"
        results_text += f"    Summary: {summary_short}\n"
        results_text += f"    Channel: {channel}\n"

    prompt = f"""You are an information validation expert. Analyze the following search results and judge their relevance to the specified flood event.

Event Information:
- Time: {event_time}
- Location: {location} ({province}, {country})
- Local terms: "{rain_term}" (rain), "{flood_term}" (flood)

Search Results:
{results_text}

Your Task:
1. **Relevance Judgment**: For each search result, determine if it belongs to this specific event
   - Time match: within event time + {time_window_days} days
   - Location match: province or country level
   - Content relevance: related to rain, flood, or disaster

2. **Scoring and Ranking**: 
   - Assign a relevance_score (0.0 to 1.0) for each relevant item
   - Higher score = more relevant
   - Sort relevant items by relevance_score in descending order
   - Select top 10 most relevant items

3. **Media Priority**: 
   - Media items (channel: "media" or "social") should be prioritized
   - Even if a media item has a lower score, prioritize it (max 3 media items)
   - If media items are in top 10, keep them; otherwise skip (don't force)

Return JSON format (must be valid JSON, no code block markers):
{{
  "relevant_items": [
    {{
      "index": 0,
      "relevance_score": 0.95,
      "reason": "Time matches, location matches, highly relevant content"
    }},
    {{
      "index": 5,
      "relevance_score": 0.88,
      "reason": "Time matches, location matches, relevant but less detailed"
    }}
  ],
  "irrelevant_items": [
    {{
      "index": 1,
      "reason": "Time doesn't match (2025-11-03, event is 2025-10-11)"
    }},
    {{
      "index": 3,
      "reason": "Location doesn't match (Madrid, event is Valencia)"
    }}
  ]
}}

Important Notes:
- Return only JSON object, no ```json or ``` code block markers
- Use double quotes for all strings
- Ensure JSON is valid and parseable
- relevant_items should be sorted by relevance_score (descending)
- Maximum 10 items in relevant_items
- Media items should be prioritized if they are in top 10
"""

    return [
        {
            "role": "system",
            "content": "You are a professional information validation expert, skilled at analyzing multi-source information and judging event relevance. Keep responses simple and focused on relevance scoring.",
        },
        {"role": "user", "content": prompt},
    ]


def build_extraction_prompt(
    event_info: Dict[str, Any],
    verified_items: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """Build extraction prompt for LLM2 (Step 2): Extract timeline and impact from verified items."""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    rainfall_mm = event_info.get("rainfall_mm", "")

    # Format verified items (use full content for extraction)
    items_text = ""
    for idx, item in enumerate(verified_items):
        title = item.get('title', 'N/A')
        published_at = item.get('published_at', 'N/A')
        summary = item.get('summary', 'N/A') or item.get('description', 'N/A') or 'N/A'
        # Use full summary for extraction (not limited)
        items_text += f"\n[{idx}] {title}\n"
        items_text += f"    Published: {published_at}\n"
        items_text += f"    Summary: {summary}\n"
        if item.get('url'):
            items_text += f"    URL: {item.get('url')}\n"

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
   - Format: "YYYY-MM-DD HH:MM-HH:MM" (if exact time is unknown, use "YYYY-MM-DD")

2. **Impact Assessment** (智能提取，灵活处理):

   **Extraction Strategy - Three Levels:**
   - **Level 1 (Best)**: Extract explicit numbers if available (e.g., "15 roads closed", "50 million EUR")
   - **Level 2 (Good)**: If no numbers, extract descriptive text and infer severity level from keywords
   - **Level 3 (Acceptable)**: If no information about a category, set quantitative_data to null
   
   **For each impact category, extract intelligently:**
   
   **Transport Impact:**
   - Look for: road closures, traffic disruptions, bridge damage, highway closures
   - Extract numbers if available: closed_roads (integer), bridges_damaged (integer)
   - If no numbers: extract descriptive text (e.g., "multiple roads", "several highways")
   - Infer severity from keywords:
     * "severe", "extensive", "major", "massive" → severity_inference: "high"
     * "some", "several", "a few", "moderate" → severity_inference: "moderate"
     * "minor", "limited", "few" → severity_inference: "low"
     * "no", "none" → severity_inference: "very_low"
   
   **Economy Impact:**
   - Look for: economic loss, damage estimates, business impact, agricultural damage
   - Extract numbers if available: estimated_loss (string with unit, e.g., "50 million EUR")
   - If no numbers: extract descriptive text (e.g., "significant losses", "millions in damage")
   - Infer severity from keywords:
     * "millions", "billions", "significant", "major" → severity_inference: "high"
     * "thousands", "moderate", "some" → severity_inference: "moderate"
     * "minor", "limited", "minimal" → severity_inference: "low"
   
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
     * "no casualties", "no injuries", "no deaths" → severity_inference: "very_low" (set injured=0, deaths=0)
     * "several", "a few", "some" → severity_inference: "low"
     * "many", "dozens", "hundreds" → severity_inference: "moderate"
     * "massive", "extensive", "hundreds of" → severity_inference: "high"

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
        "closed_roads": 15,
        "bridges_damaged": null,
        "description": "Multiple roads closed, severe disruption",
        "severity_inference": "high",
        "source": "index0",
        "confidence": "high"
      }}
    }},
    "economy": {{
      "summary": "Preliminary economic loss estimates...",
      "quantitative_data": {{
        "estimated_loss": "50 million EUR",
        "description": "Significant economic losses reported",
        "severity_inference": "high",
        "source": "index2",
        "confidence": "medium"
      }}
    }},
    "safety": {{
      "summary": "No casualties reported",
      "quantitative_data": {{
        "injured": 0,
        "deaths": 0,
        "evacuated": null,
        "houses_damaged": null,
        "description": "No casualties reported",
        "severity_inference": "very_low",
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

**Critical Extraction Rules:**
1. **Numbers First**: If text contains explicit numbers, extract them as integers or strings with units
2. **Descriptive Fallback**: If no numbers, extract descriptive text in "description" field
3. **Severity Inference**: Always provide "severity_inference" based on keywords and context (very_low, low, moderate, high, extreme)
4. **Null for Missing**: If a category is not mentioned at all, set quantitative_data to null (not empty object)
5. **Confidence Levels**: 
   - "high": explicit numbers or official sources
   - "medium": descriptive text with clear context
   - "low": vague descriptions or conflicting information
6. **Flexibility is Key**: Don't force numbers if they don't exist - use descriptions and inferences instead. It's better to have a good description with severity_inference than to guess numbers.

Important Notes:
- Return only JSON object, no ```json or ``` code block markers
- Use double quotes for all strings
- Ensure JSON is valid and parseable
- Use English for all extracted content
- Time slots should be in format: "YYYY-MM-DD HH:MM-HH:MM" or "YYYY-MM-DD" if time is unknown
- If a field is not mentioned in the text, set it to null (not 0, not empty string)
"""

    return [
        {
            "role": "system",
            "content": "You are a professional disaster information extraction expert. You excel at extracting both quantitative and qualitative information from unstructured text. You can intelligently infer impact severity from descriptive language when explicit numbers are not available. You are flexible and don't force data that doesn't exist - it's better to have a good description with severity inference than to guess numbers.",
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
    """Build report generation prompt for LLM3 (Step 4): Generate comprehensive flood event report in ArcGIS StoryMaps style."""

    event_time = event_info.get("event_time", "")
    location = event_info.get("location", "")
    province = event_info.get("province", "")
    country = event_info.get("country", "")
    rainfall_mm = event_info.get("rainfall_mm", "")
    rain_term = event_info.get("rain_term", "rain")
    flood_term = event_info.get("flood_term", "flood")

    prompt = f"""You are a professional story map writer, skilled at creating immersive narrative reports similar to ArcGIS StoryMaps style. Generate a complete English flood event report based on the following information, using a storytelling narrative approach.

Event Information:
- Time: {event_time}
- Location: {location} ({province}, {country})
- Local terms: "{rain_term}" (rain), "{flood_term}" (flood)

Timeline:
{_format_timeline(timeline)}

Impact Assessment:
{_format_impact(impact)}

Multimedia & News Sources:
{_format_media(media)}

Generate a structured Markdown report in ArcGIS StoryMaps narrative style, including the following sections:

## Report Structure (StoryMaps Style):

1. **Title & Introduction**
   - Use an engaging title, e.g., "Flood Event in [Location]: A Timeline of Impact"
   - Opening paragraph should read like a story, describing when and where the event occurred, creating a sense of scene
   - Include basic event information: time, location, rainfall amount
   - Naturally incorporate local terms ("{rain_term}" and "{flood_term}")

2. **Event Overview**
   - Describe the event's cause and development process using narrative language
   - Describe the geographical location and characteristics of the affected area
   - Highlight core impacts, but use descriptive language rather than simple lists
   - Each paragraph should flow naturally, like telling a story

3. **Timeline**
   - Use clear section separators (use `---` or `##` headings)
   - Organize by time slots, each time slot as a sub-section
   - Use descriptive language, e.g., "As dawn broke on [date], the situation began to escalate..."
   - Timeline should read like a continuous story, not a simple list
   - If there are specific time points, use format: **Time** - Event description

4. **Impact Assessment**
   - Divide into sub-sections: transport impact, economic impact, safety, emergency response, etc.
   - Each sub-section uses sub-headings (`###`)
   - Use descriptive paragraphs rather than bullet points
   - Naturally incorporate quantitative data (if available)
   - Annotate information sources, but integrate them naturally into the text
   - For conflicting information, use footnotes or parentheses, e.g., "(Note: Different sources report varying numbers)"

5. **Multimedia & News Sources**
   - If real multimedia sources are provided, create a paragraph for each source
   - Describe the content and importance of each multimedia item
   - Use Markdown link format: `[description text](URL)`
   - If no real multimedia sources are provided, clearly state: "No multimedia content is available for this event."
   - **Important**: Only use provided real URLs, do not generate placeholders, fake links, or example links

6. **Conclusion**
   - Use a summary paragraph to review the entire event
   - Explain the importance and impact of the event
   - May include thoughts or recommendations for future similar events

## Format Requirements:

- **Language Style**: Use English, adopt narrative and descriptive language, like telling a story
- **Markdown Format**:
  - Use `#` for main title
  - Use `##` for main section headings
  - Use `###` for sub-section headings
  - Use `---` as separators between sections
  - Use `**bold**` to emphasize important information
  - Use paragraphs rather than lists (unless necessary)
- **Data Presentation**:
  - Quantitative data should be naturally integrated into paragraphs
  - Use descriptive language, e.g., "The flood affected approximately 15 roads..."
  - Annotate information sources, but in a natural way
- **Authenticity**:
  - **Important**: Only use provided real URLs, do not generate placeholders, fake links, or example links
  - **Important**: If a section has no real data, clearly state it, but use descriptive language
  - Do not fabricate any content
- **Fluidity**:
  - Each section should have natural transitions
  - Paragraphs should have logical connections
  - The whole report should read like a coherent story

Return the Markdown format report directly, without code block markers. The report should read as fluently and engagingly as ArcGIS StoryMaps, while maintaining accuracy and objectivity.
"""

    return [
        {
            "role": "system",
            "content": "You are a professional story map writer, skilled at creating immersive narrative reports similar to ArcGIS StoryMaps style. You can transform technical data and facts into engaging stories while maintaining accuracy and objectivity. Your reports read naturally and fluently, like telling a real story.",
        },
        {"role": "user", "content": prompt},
    ]


def _format_timeline(timeline: List[Dict[str, Any]]) -> str:
    """Format timeline for prompt."""
    if not timeline:
        return "No timeline information available"
    text = ""
    for item in timeline:
        text += f"- {item.get('time_slot', 'N/A')}: {item.get('highlights', 'N/A')}\n"
    return text


def _format_impact(impact: Dict[str, Any]) -> str:
    """Format impact assessment for prompt."""
    if not impact:
        return "No impact assessment information available"
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
    """Format media sources for prompt."""
    if not media:
        return "No real multimedia content available (please clearly state this, do not generate placeholder links)"
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
            text += f"    Description: {summary[:200]}\n"
        if source:
            text += f"    Source: {source}\n"
        if published_at:
            text += f"    Published: {published_at}\n"
    return text

