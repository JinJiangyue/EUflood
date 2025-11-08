"""搜索流程编排器。

参考 BettaFish 中各 Agent 的 orchestrate 思路，将地理识别、关键词
规划、数据采集、处理融合、报告生成等步骤串联成统一工作流。

当前阶段仅实现主流程的骨架，具体模块随后在对应目录中逐步完善。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..config.settings import Settings, settings
from ..watcher.rain_event_watcher import RainEvent, RainEventWatcher

logger = logging.getLogger(__name__)


@dataclass
class EventContext:
    """贯穿整个搜索流程的上下文数据。"""

    rain_event: RainEvent
    location_profile: Dict[str, Any] = field(default_factory=dict)
    query_plan: Dict[str, Any] = field(default_factory=dict)
    raw_contents: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    processed_summary: Dict[str, Any] = field(default_factory=dict)
    reports: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    started_at: datetime = field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None


class SearchWorkflow:
    """处理降雨事件并生成报告的 orchestrator。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.watcher = RainEventWatcher(self.config)
        self._geo_resolver = None
        self._keyword_planner = None
        self._collectors = None
        self._processor = None
        self._reporter = None

    # ------------------------------------------------------------------
    # 公开接口
    # ------------------------------------------------------------------
    def process_pending_events(self) -> List[EventContext]:
        """从 watcher 拉取事件并依次处理。"""

        contexts: List[EventContext] = []
        for event in self.watcher.fetch_pending_events():
            try:
                context = self.run_for_event(event)
                contexts.append(context)
                self.watcher.mark_event_completed(event, processed_at=context.finished_at)
            except Exception:
                logger.exception("处理降雨事件 %s 时出错", event.event_id)
        return contexts

    def run_for_event(self, event: RainEvent) -> EventContext:
        """针对单个降雨事件执行完整流程。"""
        from ..utils.detailed_logger import get_detailed_logger
        
        detailed_logger = get_detailed_logger()
        context = EventContext(rain_event=event)
        logger.info("开始处理降雨事件 %s", event.event_id)

        context.location_profile = self._resolve_location(event)
        detailed_logger.log_processing_step(
            "地理信息解析",
            {"event_id": event.event_id, "location": event.location_name},
            context.location_profile,
            "解析事件的地理位置和语言信息"
        )
        
        context.query_plan = self._build_query_plan(context)
        detailed_logger.log_processing_step(
            "查询计划生成",
            context.location_profile,
            context.query_plan,
            "生成多语言关键词和搜索渠道配置"
        )
        
        context.raw_contents = self._collect_sources(context)
        
        # 检查是否采集到数据
        total_items = sum(len(items) for items in context.raw_contents.values())
        if total_items == 0:
            logger.warning("⚠️  未采集到任何数据！跳过 LLM 处理以节省成本")
            logger.warning("可能的原因：")
            logger.warning("   1. API Key 未配置或无效（检查 .env 文件）")
            logger.warning("   2. 事件时间太早或太晚，找不到相关新闻")
            logger.warning("   3. 关键词搜索无结果")
            # 没有数据时，仍然需要填充表2（使用空数据）
            # 创建一个空的LLM结果结构，确保表2能被填充
            context.processed_summary = {
                "validation": {"relevant_items": []},
                "extraction": {"timeline": [], "impact": {}},
                "media": {"selected_items": []},
                "report": self._generate_minimal_report(context).get("english", "")
            }
            # 即使没有数据，也要填充表2
            self._fill_table2_with_empty_data(context, context.processed_summary)
            context.reports = self._generate_minimal_report(context)
        else:
            logger.info("✓ 采集到 %s 条数据（来源：%s）", total_items, list(context.raw_contents.keys()))
            context.processed_summary = self._process_contents(context)
        
        # 从 LLM 处理结果中提取报告
        llm_result = context.processed_summary
        if llm_result and "report" in llm_result:
            context.reports = {"english": llm_result["report"]}
        else:
            context.reports = self._generate_reports(context)

        context.finished_at = datetime.utcnow()
        logger.info("完成降雨事件 %s 的处理", event.event_id)
        return context

    # ------------------------------------------------------------------
    # 阶段性处理
    # ------------------------------------------------------------------
    def _resolve_location(self, event: RainEvent) -> Dict[str, Any]:
        try:
            if self._geo_resolver is None:
                from ..geolingua.resolver import GeoLinguaResolver

                self._geo_resolver = GeoLinguaResolver(self.config)
            return self._geo_resolver.resolve(event)
        except ImportError:
            logger.warning("GeoLinguaResolver 未实现，返回基础位置信息")
        except Exception:
            logger.exception("解析事件 %s 地理信息失败", event.event_id)
        return {
            "location_name": event.location_name,
            "country": event.country,
            "latitude": event.latitude,
            "longitude": event.longitude,
        }

    def _build_query_plan(self, context: EventContext) -> Dict[str, Any]:
        try:
            if self._keyword_planner is None:
                from ..query.keyword_planner import KeywordPlanner

                self._keyword_planner = KeywordPlanner(self.config)
            return self._keyword_planner.plan(context)
        except ImportError:
            logger.warning("KeywordPlanner 未实现，返回空查询计划")
        except Exception:
            logger.exception("生成查询计划失败: %s", context.rain_event.event_id)
        return {}

    def _collect_sources(self, context: EventContext) -> Dict[str, List[Dict[str, Any]]]:
        try:
            if self._collectors is None:
                from ..collectors.loader import CollectorLoader

                loader = CollectorLoader(self.config)
                self._collectors = loader.load_all()

            results: Dict[str, List[Dict[str, Any]]] = {}
            for name, collector in self._collectors.items():
                try:
                    results[name] = collector.collect(context)
                except Exception:
                    logger.exception("采集器 %s 执行失败", name)
            return results
        except ImportError:
            logger.warning("数据采集器尚未全部实现，返回空数据")
        except Exception:
            logger.exception("采集数据源失败: %s", context.rain_event.event_id)
        return {}

    def _process_contents(self, context: EventContext) -> Dict[str, Any]:
        """使用 LLM 处理内容（完全 LLM 驱动）。"""
        try:
            from ..llm.processor import LLMProcessor

            processor = LLMProcessor(self.config)
            result = processor.process(context)

            # 填充表2（rain_flood_impact）
            # 无论是否有extraction结果，都要填充表2（即使没有相关内容，也要记录）
            try:
                from ..llm.db_writer import fill_rain_flood_impact_table
                from pathlib import Path
                
                # 获取数据库路径（统一使用一个路径：apps/database/dev.db）
                db_file = self.config.DB_FILE
                if not db_file:
                    # 如果未配置，使用默认路径（与Node.js API保持一致）
                    project_root = Path(__file__).resolve().parents[2]
                    db_file = str(project_root / "apps" / "database" / "dev.db")
                elif not Path(db_file).is_absolute():
                    # 如果是相对路径，转换为绝对路径（相对于项目根目录）
                    project_root = Path(__file__).resolve().parents[2]
                    db_file = str(project_root / db_file)
                
                # 从数据库表1（rain_event）获取完整的表1数据（包含 id 字段）
                # 深度搜索只处理表1中已存在的事件，所以事件一定在表1中
                event_id_from_context = context.rain_event.event_id
                from ..llm.db_writer import get_rain_event_from_db
                rain_event_data = get_rain_event_from_db(db_file, event_id_from_context)
                
                if not rain_event_data:
                    logger.error("无法从数据库表1（rain_event）获取事件数据: %s。深度搜索只处理表1中已存在的事件。", event_id_from_context)
                else:
                    # 确保 result 中有 extraction 字段（如果没有，创建空结构）
                    if not result.get("extraction"):
                        logger.warning("LLM结果中没有extraction字段，使用空结构填充表2")
                        result["extraction"] = {
                            "timeline": [],
                            "impact": {}
                        }
                    
                    # 直接传入表1的完整数据，函数会使用其中的 id（直接复制，确保完全匹配）
                    success = fill_rain_flood_impact_table(
                        db_path=db_file,
                        rain_event=rain_event_data,  # 传入表1的完整数据
                        llm_result=result,
                    )
                    
                    table1_id = rain_event_data.get("id")
                    if success:
                        logger.info("✅ 表2数据填充成功: rain_event_id=%s (直接复制自表1)", table1_id)
                    else:
                        logger.warning("⚠️  表2数据填充失败: %s", table1_id)
                        # 表2填充失败，更新表1的searched字段为2（需重搜）
                        try:
                            import sqlite3
                            conn = sqlite3.connect(db_file)
                            cursor = conn.cursor()
                            cursor.execute("UPDATE rain_event SET searched = 2 WHERE id = ?", (table1_id,))
                            conn.commit()
                            conn.close()
                            logger.warning("⚠️ 已更新表1的searched字段为2（需重搜）: rain_event_id=%s", table1_id)
                        except Exception as update_error:
                            logger.warning("⚠️ 更新表1的searched字段失败: rain_event_id=%s, error=%s", table1_id, update_error)
            except Exception as e:
                logger.exception("填充表2数据时出错: %s", e)
                # 填充表2时发生异常，更新表1的searched字段为2（需重搜）
                try:
                    table1_id = rain_event_data.get("id") if 'rain_event_data' in locals() else None
                    if table1_id:
                        import sqlite3
                        conn = sqlite3.connect(db_file)
                        cursor = conn.cursor()
                        cursor.execute("UPDATE rain_event SET searched = 2 WHERE id = ?", (table1_id,))
                        conn.commit()
                        conn.close()
                        logger.warning("⚠️ 已更新表1的searched字段为2（需重搜，异常）: rain_event_id=%s", table1_id)
                except Exception as update_error:
                    logger.warning("⚠️ 更新表1的searched字段失败: error=%s", update_error)
                # 不中断主流程，继续返回LLM结果

            # 转换为兼容格式，并包含报告
            return {
                "validation": result.get("validation", {}),
                "extraction": result.get("extraction", {}),
                "media": result.get("media", {}),
                "timeline": result.get("extraction", {}).get("timeline", []),
                "impact": result.get("extraction", {}).get("impact", {}),
                "relevant": {
                    "news_thenewsapi": result.get("validation", {}).get("relevant_items", []),
                    "official": result.get("validation", {}).get("relevant_items", []),
                },
                "report": result.get("report", ""),  # LLM 生成的报告
            }
        except ImportError as e:
            logger.warning("LLM 处理模块未就绪: %s", e)
            logger.warning("请安装 LLM 依赖: pip install openai 或 pip install google-generativeai")
        except Exception:
            logger.exception("LLM 处理内容失败: %s", context.rain_event.event_id)
        return {}
    
    def _fill_table2_with_empty_data(self, context: EventContext, llm_result: Dict[str, Any]) -> None:
        """即使没有采集到数据，也要填充表2（使用空数据）。"""
        try:
            from ..llm.db_writer import fill_rain_flood_impact_table
            from pathlib import Path
            
            # 获取数据库路径（统一使用一个路径：apps/database/dev.db）
            db_file = self.config.DB_FILE
            if not db_file:
                # 如果未配置，使用默认路径（与Node.js API保持一致）
                project_root = Path(__file__).resolve().parents[2]
                db_file = str(project_root / "apps" / "database" / "dev.db")
            elif not Path(db_file).is_absolute():
                # 如果是相对路径，转换为绝对路径（相对于项目根目录）
                project_root = Path(__file__).resolve().parents[2]
                db_file = str(project_root / db_file)
            
            # 从数据库表1（rain_event）获取完整的表1数据（包含 id 字段）
            event_id_from_context = context.rain_event.event_id
            from ..llm.db_writer import get_rain_event_from_db
            rain_event_data = get_rain_event_from_db(db_file, event_id_from_context)
            
            if not rain_event_data:
                logger.error("无法从数据库表1（rain_event）获取事件数据: %s。深度搜索只处理表1中已存在的事件。", event_id_from_context)
            else:
                # 确保 result 中有 extraction 字段（如果没有，创建空结构）
                if not llm_result.get("extraction"):
                    llm_result["extraction"] = {
                        "timeline": [],
                        "impact": {}
                    }
                
                # 直接传入表1的完整数据，函数会使用其中的 id（直接复制，确保完全匹配）
                success = fill_rain_flood_impact_table(
                    db_path=db_file,
                    rain_event=rain_event_data,  # 传入表1的完整数据
                    llm_result=llm_result,
                )
                
                table1_id = rain_event_data.get("id")
                if success:
                    logger.info("✅ 表2数据填充成功（无数据情况）: rain_event_id=%s (直接复制自表1)", table1_id)
                else:
                    logger.warning("⚠️  表2数据填充失败（无数据情况）: %s", table1_id)
        except Exception as e:
            logger.exception("填充表2数据时出错（无数据情况）: %s", e)

    def _generate_reports(self, context: EventContext) -> Dict[str, str]:
        """生成报告（LLM 处理失败时的备选方案）。"""
        # LLM 处理应该已经在 _process_contents 中生成报告
        # 如果到达这里，说明 LLM 处理失败，返回空报告
        logger.warning("LLM 报告生成失败，返回空报告")
        return {"english": "# Report Generation Failed\n\nLLM processing failed. Please check your API keys and configuration."}
    
    def _generate_minimal_report(self, context: EventContext) -> Dict[str, str]:
        """生成最小报告（没有搜索结果时）。"""
        event = context.rain_event
        profile = context.location_profile or {}
        rain_term = profile.get("rain_term", "rain")
        flood_term = profile.get("flood_term", "flood")
        
        report = f"""# Flood Event Report: {event.location_name}, {event.country}

## 1. Event Overview

On {event.event_time.strftime('%B %d, %Y') if event.event_time else 'N/A'}, {event.location_name}, located in {event.extras.get('province', '')}, {event.country}, experienced a rainfall event with {event.rainfall_mm}mm of precipitation.

*   **Local Terminology:**
    *   Rain: "{rain_term}"
    *   Flood: "{flood_term}"

## 2. Flood Timeline

No timeline information is available as no relevant news or media sources were found for this event.

## 3. Multimedia & News Sources

No multimedia content or news sources were found for this event. This may be due to:
- The event date being too recent or too far in the past
- Limited media coverage of the event
- Search API limitations or configuration issues

## 4. Impact Assessment

No impact assessment data is available as no relevant sources were found for this event.

## 5. Summary

This rainfall event in {event.location_name}, {event.country}, recorded {event.rainfall_mm}mm of precipitation. However, no additional information, news coverage, or media sources were found to provide a detailed analysis of the event's impact, timeline, or consequences. Further investigation may be required to obtain comprehensive information about this event.
"""
        return {"english": report}

