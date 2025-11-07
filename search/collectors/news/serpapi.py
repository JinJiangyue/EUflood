"""SerpAPI 新闻采集器。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class NewsSerpAPICollector(BaseCollector):
    channel_name = "news_serpapi"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
    ) -> Dict[str, Any]:
        api_key = context.metadata.get("serpapi_key") or self.config.SERPAPI_KEY
        if not api_key:
            raise RuntimeError("SerpAPI Key 未配置")

        query = " ".join(keywords)
        params = {
            "engine": "google_news",
            "q": query,
            "gl": "us",
            "hl": language,
            "api_key": api_key,
            "num": channel_config.get("max_results", 15),
        }

        return {
            "method": "GET",
            "url": channel_config["base_url"],
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("SerpAPI 返回状态码 %s", response.status_code)
            return []

        data = response.json()
        results = data.get("articles") or data.get("news_results") or []

        for item in results:
            yield {
                "channel": self.channel_name,
                "language": language,
                "title": item.get("title"),
                "summary": item.get("snippet") or item.get("content"),
                "url": item.get("link"),
                "published_at": item.get("date") or item.get("published_at"),
                "source": (item.get("source") or {}).get("name") if isinstance(item.get("source"), dict) else item.get("source"),
            }

