"""YouTube 多媒体采集器。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class MediaYouTubeCollector(BaseCollector):
    channel_name = "media"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
        query_string: Optional[str] = None,
    ) -> Dict[str, Any]:
        api_key = context.metadata.get("youtube_api_key") or self.config.YOUTUBE_API_KEY
        if not api_key:
            raise RuntimeError("YouTube Data API Key 未配置")

        # 优先使用自然语言查询字符串，如果没有则使用关键词列表
        query = query_string if query_string else " ".join(keywords)
        
        # 确保查询包含时间信息（如果 query 中没有）
        event_time = context.rain_event.event_time
        if event_time and str(event_time.year) not in query:
            if language == "es":
                month_names = {
                    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
                    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
                    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
                }
                date_str = f"{event_time.day} {month_names.get(event_time.month, '')} {event_time.year}"
            else:
                month_names = {
                    1: "January", 2: "February", 3: "March", 4: "April",
                    5: "May", 6: "June", 7: "July", 8: "August",
                    9: "September", 10: "October", 11: "November", 12: "December"
                }
                date_str = f"{month_names.get(event_time.month, '')} {event_time.day}, {event_time.year}"
            query = f"{query} {date_str}"
        
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "order": "date",
            "maxResults": min(channel_config.get("max_results", 12), 50),
            "key": api_key,
        }

        if language:
            params["relevanceLanguage"] = language
        
        # YouTube API 支持 publishedAfter 参数（ISO 8601 格式）
        if event_time:
            from datetime import timedelta
            # 使用统一的时间窗口配置
            window_days = self.config.NEWS_SEARCH_WINDOW_DAYS
            params["publishedAfter"] = event_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            # 搜索事件当天及之后N天的内容
            params["publishedBefore"] = (event_time + timedelta(days=window_days + 1)).strftime("%Y-%m-%dT%H:%M:%SZ")

        return {
            "method": "GET",
            "url": channel_config["base_url"],
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("YouTube API 返回状态码 %s", response.status_code)
            return []

        data = response.json()
        items = data.get("items", [])

        for item in items:
            snippet = item.get("snippet", {})
            video_id = item.get("id", {}).get("videoId")
            if not video_id:
                continue
            yield {
                "channel": self.channel_name,
                "language": snippet.get("defaultAudioLanguage")
                or snippet.get("defaultLanguage")
                or language,
                "title": snippet.get("title"),
                "summary": snippet.get("description"),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "published_at": snippet.get("publishedAt"),
                "source": snippet.get("channelTitle"),
                "thumbnails": snippet.get("thumbnails"),
            }

    def collect(self, context: EventContext) -> List[Dict[str, Any]]:
        items = super().collect(context)
        plan = context.query_plan or {}
        hours = plan.get("time_window_hours", 72)
        return self.filter_by_time(items, hours + 24)

