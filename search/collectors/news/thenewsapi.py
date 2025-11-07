"""The News API 新闻采集器（支持历史数据）。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class NewsTheNewsAPICollector(BaseCollector):
    channel_name = "news_thenewsapi"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
        query_string: Optional[str] = None,
    ) -> Dict[str, Any]:
        api_key = context.metadata.get("thenewsapi_key") or self.config.THENEWSAPI_KEY
        if not api_key:
            raise RuntimeError("The News API Key 未配置")

        # 优先使用自然语言查询字符串，如果没有则使用关键词列表
        query = query_string if query_string else " ".join(keywords)
        lang_map = {
            "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it", "pt": "pt",
            "nl": "nl", "pl": "pl", "ro": "ro", "cs": "cs", "hu": "hu", "sk": "sk",
            "sl": "sl", "bg": "bg", "hr": "hr", "da": "da", "sv": "sv", "fi": "fi",
            "et": "et", "lv": "lv", "lt": "lt", "el": "el", "mt": "mt", "ga": "ga",
        }
        thenewsapi_lang = lang_map.get(language, "en")

        country_map = {
            "Spain": "es", "France": "fr", "Germany": "de", "Italy": "it", "Portugal": "pt",
            "Netherlands": "nl", "Poland": "pl", "Romania": "ro", "Czechia": "cz", "Hungary": "hu",
            "Slovakia": "sk", "Slovenia": "si", "Bulgaria": "bg", "Croatia": "hr", "Denmark": "dk",
            "Sweden": "se", "Finland": "fi", "Estonia": "ee", "Latvia": "lv", "Lithuania": "lt",
            "Greece": "gr", "Malta": "mt", "Ireland": "ie",
        }
        country_code = country_map.get(context.rain_event.country or "", "")

        params = {
            "api_token": api_key,
            "search": query,
            "language": thenewsapi_lang,
            "limit": min(channel_config.get("max_results", 15), 50),
        }

        if country_code:
            params["locale"] = country_code
        
        # 添加时间过滤（如果事件时间可用）
        event_time = context.rain_event.event_time
        if event_time:
            from datetime import timedelta
            # The News API 支持 published_after 和 published_before
            # 使用统一的时间窗口配置
            window_days = self.config.NEWS_SEARCH_WINDOW_DAYS
            params["published_after"] = event_time.strftime("%Y-%m-%d")
            # 搜索事件当天及之后N天的内容
            params["published_before"] = (event_time + timedelta(days=window_days + 1)).strftime("%Y-%m-%d")

        return {
            "method": "GET",
            "url": channel_config["base_url"],
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("The News API 返回状态码 %s", response.status_code)
            try:
                error_data = response.json()
                logger.warning("The News API 错误详情: %s", error_data)
            except Exception:
                pass
            return []

        data = response.json()
        articles = data.get("data", [])

        for item in articles:
            yield {
                "channel": self.channel_name,
                "language": language,
                "title": item.get("title", ""),
                "summary": item.get("description", ""),
                "url": item.get("url", ""),
                "published_at": item.get("published_at"),
                "source": item.get("source", ""),
            }

    def post_process(
        self, items: List[Dict[str, Any]], channel_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        items = super().post_process(items, channel_config)
        plan_limit = channel_config.get("max_results")
        if plan_limit and len(items) > plan_limit:
            items = items[:plan_limit]
        return items

