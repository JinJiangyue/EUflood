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
            # 没有数据时，跳过 LLM 处理，直接生成基础报告
            context.processed_summary = {}
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

