"""地理与语言识别模块。

参考 BettaFish 统一以配置驱动的做法，使用术语表映射国家与官方
语言，将降雨事件补全为后续流程所需的本地化信息。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..config.settings import Settings, settings
from ..watcher.rain_event_watcher import RainEvent

logger = logging.getLogger(__name__)


@dataclass
class LanguageProfile:
    """术语表中定义的语言信息。"""

    name: str
    code: str
    rain_term: str
    flood_term: str


class GeoLinguaResolver:
    """为降雨事件补充国家、语言与术语信息。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self._terminology_index: Optional[Dict[str, Dict[str, Any]]] = None

    def resolve(self, event: RainEvent) -> Dict[str, Any]:
        """根据降雨事件生成地理语言档案。"""

        terminology = self._load_terminology()
        country_record = self._match_country(event, terminology)
        language = self._select_language(country_record)

        profile = {
            "location_name": event.location_name,
            "country": country_record.get("primary_name")
            if country_record
            else event.country,
            "country_code": country_record.get("country_code") if country_record else None,
            "official_language": language.name if language else None,
            "language_code": language.code if language else None,
            "rain_term": language.rain_term if language else None,
            "flood_term": language.flood_term if language else None,
        }

        missing_fields = [k for k, v in profile.items() if v in (None, "")]
        if missing_fields:
            logger.debug(
                "GeoLinguaResolver: profile 不完整 (event=%s, 缺失=%s)",
                event.event_id,
                ",".join(missing_fields),
            )

        return profile

    # ------------------------------------------------------------------
    def _load_terminology(self) -> Dict[str, Dict[str, Any]]:
        if self._terminology_index is not None:
            return self._terminology_index

        path = self.config.TERMINOLOGY_FILE
        if not path.exists():
            logger.warning("术语表 %s 不存在，GeoLinguaResolver 将返回基础信息", path)
            self._terminology_index = {}
            return self._terminology_index

        try:
            with path.open("r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception:
            logger.exception("读取术语表 %s 失败", path)
            data = {}

        index: Dict[str, Dict[str, Any]] = {}
        for key, record in data.items():
            names = record.get("country_names", [])
            normalized = [self._normalize_country_name(name) for name in names]
            record["_normalized"] = normalized
            record["primary_name"] = record.get("primary_name") or names[0] if names else key
            index[key] = record

        self._terminology_index = index
        return index

    def _match_country(
        self,
        event: RainEvent,
        terminology: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Any]:
        candidate = event.country or event.extras.get("country") if event.extras else None
        if not candidate:
            return {}

        normalized_candidate = self._normalize_country_name(candidate)
        for record in terminology.values():
            if normalized_candidate in record.get("_normalized", []):
                return record

        logger.debug("术语表未命中国家: %s", candidate)
        return {}

    @staticmethod
    def _normalize_country_name(name: str) -> str:
        return "" if name is None else name.strip().lower()

    @staticmethod
    def _select_language(record: Optional[Dict[str, Any]]) -> Optional[LanguageProfile]:
        if not record:
            return None
        languages = record.get("languages") or []
        if not languages:
            return None
        first = languages[0]
        try:
            return LanguageProfile(
                name=first.get("name", ""),
                code=first.get("code", ""),
                rain_term=first.get("rain_term", ""),
                flood_term=first.get("flood_term", ""),
            )
        except Exception:
            logger.exception("解析语言配置失败: %s", first)
            return None

