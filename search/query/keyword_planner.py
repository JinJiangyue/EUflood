"""关键词与搜索计划生成。

借鉴 BettaFish KeywordOptimizer 的思路，根据事件、地点信息以及术语
表生成多语言关键词组合，同时整理后续采集所需的渠道列表。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..config.settings import Settings, settings
from ..query.channels import Channel, default_channels
from ..watcher.rain_event_watcher import RainEvent
from ..orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


@dataclass
class KeywordBundle:
    """单一语言的关键词集合。"""

    language: str
    base_terms: List[str]
    location_terms: List[str]
    disaster_terms: List[str]
    extra_terms: List[str] = field(default_factory=list)

    def expanded(self) -> List[str]:
        parts = self.base_terms + self.location_terms + self.disaster_terms + self.extra_terms
        deduped: List[str] = []
        seen = set()
        for item in parts:
            normalized = item.strip()
            if normalized and normalized not in seen:
                deduped.append(normalized)
                seen.add(normalized)
        return deduped


@dataclass
class QueryPlan:
    """最终输出给采集器使用的搜索计划。"""

    channels: Dict[str, Channel]
    keywords: Dict[str, KeywordBundle]
    time_window_hours: int
    rainfall_mm: Optional[float]
    severity: Optional[str]

    def to_dict(self) -> Dict[str, Dict]:
        return {
            "channels": {
                name: {
                    "provider": channel.provider,
                    "base_url": channel.base_url,
                    "max_results": channel.max_results,
                    "enabled": channel.enabled,
                    "languages": channel.languages,
                    "notes": channel.notes,
                }
                for name, channel in self.channels.items()
            },
            "keywords": {
                lang: bundle.expanded() if isinstance(bundle, KeywordBundle) else bundle
                for lang, bundle in self.keywords.items()
            },
            "time_window_hours": self.time_window_hours,
            "rainfall_mm": self.rainfall_mm,
            "severity": self.severity,
        }


class KeywordPlanner:
    """结合地理信息生成多语言搜索关键字。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self._channels = default_channels()

    def plan(self, context: EventContext) -> Dict[str, Dict]:
        rain_event = context.rain_event
        profile = context.location_profile or {}

        primary_language = profile.get("language_code") or profile.get("official_language") or "en"
        rain_term = profile.get("rain_term", "rain")
        flood_term = profile.get("flood_term", "flood")

        english_bundle = self._build_keywords_for_language(
            event=rain_event,
            language="en",
            rain_term="rain",
            flood_term="flood",
        )

        native_bundle = self._build_keywords_for_language(
            event=rain_event,
            language=primary_language,
            rain_term=rain_term,
            flood_term=flood_term,
        ) if primary_language != "en" else None

        bundles: Dict[str, KeywordBundle] = {"en": english_bundle}
        if native_bundle:
            bundles[primary_language] = native_bundle

        plan = QueryPlan(
            channels=self._channels,
            keywords=bundles,
            time_window_hours=self.config.MAX_EVENT_LOOKBACK_HOURS,
            rainfall_mm=rain_event.rainfall_mm,
            severity=rain_event.severity,
        )

        result = plan.to_dict()
        
        # 手动生成 query_strings（因为 _build_query_string 是 KeywordPlanner 的方法）
        query_strings = {}
        for lang, bundle in bundles.items():
            if isinstance(bundle, KeywordBundle):
                query_strings[lang] = self._build_query_string(bundle)
            else:
                query_strings[lang] = " ".join(bundle) if isinstance(bundle, list) else str(bundle)
        
        result["query_strings"] = query_strings
        logger.debug("KeywordPlanner 生成查询计划: %s", result)
        return result

    # ------------------------------------------------------------------
    def _build_keywords_for_language(
        self,
        event: RainEvent,
        language: str,
        rain_term: str,
        flood_term: str,
    ) -> KeywordBundle:
        """生成关键词，策略：以省级为主，忽略城市（雨量站位置），添加时间信息，移除具体数值。"""
        
        location_terms: List[str] = []
        
        # 获取地点信息
        province = event.extras.get("province")  # 省（主要）
        city = event.location_name                # 市（雨量站位置，通常太小，忽略）
        country = event.country                   # 国家（英语名称，如 "Spain"）
        
        # 获取国家本地名称（用于非英语搜索）
        country_native = self._get_country_native_name(country, language) if country else None
        
        # 策略：以省级为主（雨量站位置不代表实际受灾区域）
        if province:
            location_terms.append(province)  # "Valencia" (主要)
            # 组合：省 + 国家（使用本地名称）
            if country_native:
                location_terms.append(f"{province} {country_native}")  # "Valencia España" (es) 或 "Valencia Spain" (en)
            elif country:
                location_terms.append(f"{province} {country}")  # "Valencia Spain" (fallback)
        
        # 国家作为备选（使用本地名称）
        if country_native and country_native not in location_terms:
            location_terms.append(country_native)  # "España" (es) 或 "Spain" (en)
        elif country and country not in location_terms:
            location_terms.append(country)  # "Spain" (fallback)
        
        # 注意：不包含 city（雨量站位置），因为太小且不代表实际受灾区域
        
        base_terms = [term for term in location_terms]
        disaster_terms = [rain_term, flood_term]

        if event.severity:
            disaster_terms.append(event.severity)

        extra_terms: List[str] = []
        
        # 添加时间信息（自然语言格式）
        if event.event_time:
            if language == "es":
                # 西班牙语格式：11 octubre 2025
                month_names_es = {
                    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
                    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
                    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
                }
                month = month_names_es.get(event.event_time.month, "")
                date_str = f"{event.event_time.day} {month} {event.event_time.year}"
            else:
                # 英语格式：October 11, 2025
                month_names_en = {
                    1: "January", 2: "February", 3: "March", 4: "April",
                    5: "May", 6: "June", 7: "July", 8: "August",
                    9: "September", 10: "October", 11: "November", 12: "December"
                }
                month = month_names_en.get(event.event_time.month, "")
                date_str = f"{month} {event.event_time.day}, {event.event_time.year}"
            extra_terms.append(date_str)
        
        # ❌ 不再包含 rainfall_mm（太具体，限制搜索结果）

        return KeywordBundle(
            language=language,
            base_terms=base_terms,
            location_terms=location_terms,
            disaster_terms=disaster_terms,
            extra_terms=extra_terms,
        )
    
    def _build_query_string(self, bundle: KeywordBundle) -> str:
        """将关键词组合成自然语言查询字符串。"""
        # 策略：地点 + 灾害术语 + 时间
        # 例如：Valencia lluvia inundación 11 octubre 2025
        # 或：Valencia rain flood October 11, 2025
        
        parts = []
        
        # 1. 地点（去重处理）
        if bundle.location_terms:
            # 优先使用省+国家的组合（如果有），否则只用省
            province_country = None
            province_only = None
            
            for term in bundle.location_terms:
                if " " in term:  # 包含空格的，通常是 "省 国家" 的组合
                    province_country = term
                elif not province_only:  # 第一个单独的省名
                    province_only = term
            
            # 优先使用省+国家组合，如果没有则使用单独的省
            if province_country:
                parts.append(province_country)
            elif province_only:
                parts.append(province_only)
        
        # 2. 灾害术语（去重）
        seen_disaster = set()
        for term in bundle.disaster_terms:
            if term and term not in seen_disaster:
                parts.append(term)
                seen_disaster.add(term)
        
        # 3. 时间（如果有）
        if bundle.extra_terms:
            parts.extend(bundle.extra_terms)
        
        return " ".join(parts)
    
    def _get_country_native_name(self, country_english: str, language: str) -> Optional[str]:
        """获取国家的本地名称。"""
        if not country_english or language == "en":
            return country_english
        
        try:
            from ..geolingua.resolver import GeoLinguaResolver
            resolver = GeoLinguaResolver(self.config)
            terminology = resolver._load_terminology()
            
            # 查找国家记录
            for key, record in terminology.items():
                country_names = record.get("country_names", [])
                if country_english in country_names:
                    # 找到匹配的国家，返回本地名称
                    # 优先返回与语言匹配的名称，如果没有则返回第一个非英语名称
                    for name in country_names:
                        if name != country_english:
                            # 简单判断：如果语言是es，优先返回"España"等
                            if language == "es" and "España" in country_names:
                                return "España"
                            return name
                    return country_english
        except Exception:
            logger.debug("无法获取国家本地名称，使用英语名称: %s", country_english)
        
        return country_english

