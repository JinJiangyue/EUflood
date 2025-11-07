"""X (Twitter) 社交媒体采集器。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class SocialXTwitterCollector(BaseCollector):
    channel_name = "social"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
    ) -> Dict[str, Any]:
        token = context.metadata.get("x_bearer_token") or self.config.X_BEARER_TOKEN
        if not token:
            raise RuntimeError("X(Twitter) Bearer Token 未配置")

        query = " OR ".join(f"\"{term}\"" for term in keywords)
        params = {
            "query": query,
            "max_results": min(channel_config.get("max_results", 20), 100),
            "sort_order": "recency",
            "tweet.fields": "created_at,lang,public_metrics",
        }
        return {
            "method": "GET",
            "url": f"{channel_config['base_url']}/tweets/search/recent",
            "headers": {"Authorization": f"Bearer {token}"},
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("X API 返回状态码 %s", response.status_code)
            return []

        data = response.json()
        tweets = data.get("data", [])
        for tweet in tweets:
            metrics = tweet.get("public_metrics", {})
            yield {
                "channel": self.channel_name,
                "language": tweet.get("lang") or language,
                "title": tweet.get("text"),
                "summary": tweet.get("text"),
                "url": f"https://twitter.com/i/web/status/{tweet.get('id')}",
                "published_at": tweet.get("created_at"),
                "source": "X",
                "engagement": {
                    "retweet": metrics.get("retweet_count"),
                    "reply": metrics.get("reply_count"),
                    "like": metrics.get("like_count"),
                    "quote": metrics.get("quote_count"),
                },
            }

    def collect(self, context: EventContext) -> List[Dict[str, Any]]:
        items = super().collect(context)
        plan = context.query_plan or {}
        hours = plan.get("time_window_hours", 48)
        return self.filter_by_time(items, hours)

