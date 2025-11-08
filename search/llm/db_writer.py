"""数据库写入模块 - 将LLM处理结果写入表2（rain_flood_impact）。"""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

from .scoring import (
    calculate_economy_impact_level,
    calculate_overall_level,
    calculate_safety_impact_level,
    calculate_transport_impact_level,
)

logger = logging.getLogger(__name__)


def get_rain_event_from_db(db_path: str, rain_event_id: str) -> Optional[Dict[str, Any]]:
    """从数据库获取表1（rain_event）数据。
    
    Args:
        db_path: 数据库文件路径
        rain_event_id: 事件ID
        
    Returns:
        事件数据字典，如果不存在则返回None
    """
    try:
        from pathlib import Path
        
        # 确保数据库路径正确（统一使用一个路径：apps/database/dev.db）
        db_file = Path(db_path)
        if not db_file.is_absolute():
            # 如果是相对路径，从项目根目录解析
            project_root = Path(__file__).resolve().parents[2]
            db_file = project_root / db_path
        
        if not db_file.exists():
            logger.error("数据库文件不存在: %s (原始路径: %s)", db_file, db_path)
            return None
        
        conn = sqlite3.connect(str(db_file))
        conn.row_factory = sqlite3.Row  # 返回字典格式
        cursor = conn.cursor()
        
        # 先尝试精确匹配
        cursor.execute("SELECT * FROM rain_event WHERE id = ?", (rain_event_id,))
        row = cursor.fetchone()
        
        # 如果精确匹配失败，尝试模糊匹配（去掉可能的 seq 部分）
        if not row and rain_event_id and '_' in rain_event_id:
            # 尝试去掉最后一个下划线后的数字（seq 部分）
            parts = rain_event_id.rsplit('_', 1)
            if len(parts) == 2 and parts[1].isdigit():
                base_id = parts[0]
                logger.debug("精确匹配失败，尝试查找基础ID: %s (原始: %s)", base_id, rain_event_id)
                cursor.execute("SELECT * FROM rain_event WHERE id LIKE ?", (f"{base_id}_%",))
                rows = cursor.fetchall()
                if rows:
                    # 如果有多个匹配，返回第一个
                    row = rows[0]
                    logger.warning("使用模糊匹配找到记录: %s (查找: %s)", row['id'], rain_event_id)
        
        conn.close()
        
        if row:
            return dict(row)
        
        # 如果还是没找到，记录详细信息用于调试
        logger.error("未找到rain_event记录: %s (数据库: %s)", rain_event_id, db_file)
        # 列出一些相似的ID用于调试
        try:
            conn = sqlite3.connect(str(db_file))
            cursor = conn.cursor()
            if '_' in rain_event_id:
                base_part = rain_event_id.rsplit('_', 1)[0]
                cursor.execute("SELECT id FROM rain_event WHERE id LIKE ? LIMIT 5", (f"{base_part}%",))
                similar = cursor.fetchall()
                if similar:
                    logger.debug("相似的ID: %s", [r[0] for r in similar])
            conn.close()
        except:
            pass
        
        return None
    except Exception as e:
        logger.error("获取rain_event数据失败: %s (数据库: %s, ID: %s)", e, db_path, rain_event_id)
        return None


def fill_rain_flood_impact_table(
    db_path: str,
    rain_event: Dict[str, Any],
    llm_result: Dict[str, Any],
    rain_event_id: Optional[str] = None,  # 已废弃，保留用于向后兼容
) -> bool:
    """填充表2（rain_flood_impact）数据。
    
    Args:
        db_path: 数据库文件路径
        rain_event: 表1数据（必需，包含完整的 id 字段）
        llm_result: LLM处理结果
        rain_event_id: 事件ID（已废弃，不再使用，直接从 rain_event 中获取 id）
        
    Returns:
        成功返回True，失败返回False
    """
    try:
        # 重要：表2的 rain_event_id 必须直接使用表1的 id（确保完全匹配）
        # 直接从 rain_event 中获取 id，不使用任何传入的 ID 参数
        table1_id = rain_event.get("id")
        if not table1_id:
            logger.error("表1记录中没有 id 字段: %s", rain_event)
            return False
        
        # 如果传入了 rain_event_id 参数（向后兼容），检查是否与表1的 ID 一致
        if rain_event_id and table1_id != rain_event_id:
            logger.warning("传入的 rain_event_id 参数 (%s) 与表1的 ID (%s) 不一致，使用表1的 ID", rain_event_id, table1_id)
        
        # 使用表1的实际 ID 作为表2的 rain_event_id
        rain_event_id = table1_id
        logger.debug("使用表1的 ID 填充表2: %s", rain_event_id)
        
        # 2. 提取LLM结果
        validation = llm_result.get("validation", {})
        extraction = llm_result.get("extraction", {})
        impact = extraction.get("impact", {})
        timeline = extraction.get("timeline", [])
        
        # 3. 计算基础字段（从表1直接复制）
        country = rain_event.get("country")
        province = rain_event.get("province")
        city = rain_event.get("city")
        
        # 4. 时间字段：直接复制自表1的 date
        time = rain_event.get("date")
        
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
        date = rain_event.get("date", "")
        date_dir = date.replace("-", "") if date else ""  # YYYY-MM-DD -> YYYYMMDD
        if date_dir and rain_event_id:
            detail_file = f"search_outputs/{date_dir}/{rain_event_id}_report.md"
        else:
            detail_file = None
        
        # 10. 连接数据库并插入或更新
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
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
                country = excluded.country,
                province = excluded.province,
                city = excluded.city,
                transport_impact_level = excluded.transport_impact_level,
                economy_impact_level = excluded.economy_impact_level,
                safety_impact_level = excluded.safety_impact_level,
                timeline_data = excluded.timeline_data,
                source_count = excluded.source_count,
                detail_file = excluded.detail_file,
                updated_at = datetime('now')
        """, (
            rain_event_id, time, level,
            country, province, city,
            transport_level, economy_level, safety_level,
            timeline_data, source_count, detail_file
        ))
        
        conn.commit()
        
        # 更新表1的searched字段为1（已搜索）
        try:
            cursor.execute("UPDATE rain_event SET searched = 1 WHERE id = ?", (rain_event_id,))
            conn.commit()
            logger.info("✅ 已更新表1的searched字段为1: rain_event_id=%s", rain_event_id)
        except Exception as update_error:
            logger.warning("⚠️ 更新表1的searched字段失败: rain_event_id=%s, error=%s", rain_event_id, update_error)
            # 不中断流程，表2数据已成功创建
        
        conn.close()
        
        logger.info(
            "✅ 表2数据已填充: rain_event_id=%s, level=%s, transport=%s, economy=%s, safety=%s, sources=%s",
            rain_event_id, level, transport_level, economy_level, safety_level, source_count
        )
        
        return True
        
    except Exception as e:
        logger.exception("填充表2数据失败: rain_event_id=%s, error=%s", rain_event_id, e)
        
        # 填充表2失败，更新表1的searched字段为2（需重搜）
        try:
            if 'rain_event_id' in locals() and rain_event_id:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("UPDATE rain_event SET searched = 2 WHERE id = ?", (rain_event_id,))
                conn.commit()
                conn.close()
                logger.warning("⚠️ 已更新表1的searched字段为2（需重搜）: rain_event_id=%s", rain_event_id)
        except Exception as update_error:
            logger.warning("⚠️ 更新表1的searched字段失败: rain_event_id=%s, error=%s", rain_event_id if 'rain_event_id' in locals() else 'unknown', update_error)
        
        return False

