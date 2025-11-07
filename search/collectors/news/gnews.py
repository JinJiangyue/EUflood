"""GNews 新闻采集器。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class NewsGNewsCollector(BaseCollector):
    channel_name = "news_gnews"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
    ) -> Dict[str, Any]:
        api_key = context.metadata.get("gnews_api_key") or self.config.GNEWS_API_KEY
        if not api_key:
            raise RuntimeError("GNews API Key 未配置")

        query = " ".join(keywords)
        lang_map = {
            "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it", "pt": "pt",
            "nl": "nl", "pl": "pl", "ro": "ro", "cs": "cs", "hu": "hu", "sk": "sk",
            "sl": "sl", "bg": "bg", "hr": "hr", "da": "da", "sv": "sv", "fi": "fi",
            "et": "et", "lv": "lv", "lt": "lt", "el": "el", "mt": "mt", "ga": "ga",
        }
        gnews_lang = lang_map.get(language, "en")

        params = {
            "q": query,
            "token": api_key,
            "lang": gnews_lang,
            "max": min(channel_config.get("max_results", 10), 10),
        }

        return {
            "method": "GET",
            "url": channel_config["base_url"],
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("GNews API 返回状态码 %s", response.status_code)
            return []

        data = response.json()
        articles = data.get("articles", [])

        for item in articles:
            yield {
                "channel": self.channel_name,
                "language": language,
                "title": item.get("title", ""),
                "summary": item.get("description", ""),
                "url": item.get("url", ""),
                "published_at": item.get("publishedAt"),
                "source": item.get("source", {}).get("name") if isinstance(item.get("source"), dict) else item.get("source"),
            }

