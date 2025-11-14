"""数据库写入模块 - 准备表2（rain_flood_impact）数据（不写入数据库，返回给 Node.js）。"""

import json
import logging
from typing import Any, Dict, Optional

from .scoring import (
    calculate_economy_impact_level,
    calculate_overall_level,
    calculate_safety_impact_level,
    calculate_transport_impact_level,
)

logger = logging.getLogger(__name__)


def prepare_rain_flood_impact_data(
    rain_event: Dict[str, Any],
    llm_result: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """准备表2（rain_flood_impact）数据（不写入数据库，只返回数据）。
    
    Args:
        rain_event: 表1数据（必需，包含完整的 rain_event_id 字段）
        llm_result: LLM处理结果
        
    Returns:
        成功返回表2数据字典，失败返回None
    """
    try:
        # 从 rain_event 中获取 rain_event_id
        rain_event_id = rain_event.get("rain_event_id")
        if not rain_event_id:
            logger.error("表1记录中没有 rain_event_id 字段: %s", rain_event)
            return None
        
        logger.debug("准备表2数据: %s", rain_event_id)
        
        # 2. 提取LLM结果
        validation = llm_result.get("validation", {})
        extraction = llm_result.get("extraction", {})
        impact = extraction.get("impact", {})
        timeline = extraction.get("timeline", [])
        
        # 3. 计算基础字段（从表1直接复制）
        country = rain_event.get("country")
        province = rain_event.get("province")
        city = rain_event.get("city")
        
        # 4. 日期字段：直接复制自表1的 date
        date = rain_event.get("date", "")
        
        # 5. 计算影响程度
        transport_level = calculate_transport_impact_level(impact.get("transport"))
        economy_level = calculate_economy_impact_level(impact.get("economy"))
        safety_level = calculate_safety_impact_level(impact.get("safety"))
        
        # 6. 计算整体级别
        level = calculate_overall_level(transport_level, economy_level, safety_level)
        
        # 7. 时间线数据（JSON字符串）
        timeline_data = json.dumps(timeline, ensure_ascii=False)
        
        # 8. 来源数量
        source_count = len(validation.get("relevant_items", []))
        
        # 9. 文件路径：search_outputs/YYYYMMDD/完整ID_report.md
        # 例如：search_outputs/20251011/20251011_Valencia_1_report.md
        date_dir = date.replace("-", "") if date else ""  # YYYY-MM-DD -> YYYYMMDD
        if date_dir and rain_event_id:
            detail_file = f"search_outputs/{date_dir}/{rain_event_id}_report.md"
        else:
            detail_file = None
        
        # 10. 准备数据（返回给 Node.js，由 Node.js 写入数据库）
        record_data = {
            "rain_event_id": rain_event_id,
            "date": date,
            "level": level,
            "country": country,
            "province": province,
            "city": city,
            "transport_impact_level": transport_level,
            "economy_impact_level": economy_level,
            "safety_impact_level": safety_level,
            "timeline_data": timeline_data,
            "source_count": source_count,
            "detail_file": detail_file,
        }
        
        logger.info(
            "✅ 表2数据已准备: rain_event_id=%s, level=%s, transport=%s, economy=%s, safety=%s, sources=%s",
            rain_event_id, level, transport_level, economy_level, safety_level, source_count
        )
        
        return record_data
        
    except Exception as e:
        logger.exception("准备表2数据失败: rain_event_id=%s, error=%s", rain_event_id if 'rain_event_id' in locals() else 'unknown', e)
        return None
