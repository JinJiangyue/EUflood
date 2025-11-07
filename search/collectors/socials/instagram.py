"""Instagram 社交媒体采集器（Meta Graph API）。"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class SocialInstagramCollector(BaseCollector):
    channel_name = "social_instagram"

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
    ) -> Dict[str, Any]:
        access_token = (
            context.metadata.get("instagram_access_token")
            or self.config.INSTAGRAM_ACCESS_TOKEN
        )
        if not access_token:
            raise RuntimeError("Instagram Access Token 未配置")

        # Instagram Graph API - 通过 hashtag 搜索
        # 步骤：1. 搜索 hashtag ID  2. 获取该 hashtag 的最近媒体
        # 注意：需要 Instagram Business 或 Creator 账户，且 App 需通过审核
        query = " ".join(keywords)
        # 提取可能的 hashtag（去除 # 符号）
        hashtag = query.replace("#", "").strip().split()[0] if query else ""

        # 第一步：搜索 hashtag ID
        params = {
            "q": hashtag,
            "access_token": access_token,
        }

        return {
            "method": "GET",
            "url": f"{channel_config['base_url']}/ig_hashtag_search",
            "params": params,
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("Instagram Graph API 返回状态码 %s", response.status_code)
            try:
                error_data = response.json()
                logger.warning("Instagram 错误详情: %s", error_data)
            except Exception:
                pass
            return []

        data = response.json()
        # Instagram Graph API 返回 hashtag 搜索结果
        hashtags = data.get("data", [])

        if not hashtags:
            return []

        # 注意：实际使用中需要两步：
        # 1. 获取 hashtag_id（当前返回）
        # 2. 调用 /{hashtag_id}/recent_media 获取实际内容
        # 这里简化处理，返回 hashtag 信息
        for item in hashtags:
            yield {
                "channel": self.channel_name,
                "language": language,
                "title": f"#{item.get('name', '')}",
                "summary": f"Hashtag: {item.get('name', '')}",
                "url": f"https://www.instagram.com/explore/tags/{item.get('name', '')}/",
                "published_at": None,
                "source": "Instagram",
                "hashtag_id": item.get("id"),
            }

