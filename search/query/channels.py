"""搜索渠道定义。

参照 BettaFish QueryEngine 的做法，将可用信息源集中在配置文件中，
方便动态调整权重与请求参数。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Channel:
    """描述单个搜索渠道的配置。"""

    name: str
    provider: str
    base_url: str
    enabled: bool = True
    languages: Optional[List[str]] = None
    max_results: int = 10
    notes: str | None = None


def default_channels() -> Dict[str, Channel]:
    """提供默认渠道列表。"""

    return {
        "official": Channel(
            name="official",
            provider="tavily",
            base_url="https://api.tavily.com/search",
            notes="政府、气象等官方网站优先",
            max_results=8,
        ),
        # 新闻渠道 - 多个可选 provider
        "news_thenewsapi": Channel(
            name="news_thenewsapi",
            provider="thenewsapi",
            base_url="https://api.thenewsapi.com/v1/news/all",
            notes="The News API - 支持历史数据（免费层每日50次，最多50条/次）",
            max_results=50,
            enabled=True,
        ),
        "news_gnews": Channel(
            name="news_gnews",
            provider="gnews",
            base_url="https://gnews.io/api/v4/search",
            notes="GNews API - 免费层每日100次，最多10条/次（仅限30天内）",
            max_results=10,
            enabled=False,  # 默认禁用，按需启用
        ),
        "news_serpapi": Channel(
            name="news_serpapi",
            provider="serpapi",
            base_url="https://serpapi.com/search",
            notes="SerpAPI Google News - 免费层100次，需付费升级",
            max_results=15,
            enabled=False,  # 默认禁用，按需启用
        ),
        "social": Channel(
            name="social",
            provider="x",
            base_url="https://api.twitter.com/2",
            notes="X (Twitter) - 社交媒体搜索（付费 $200/月）",
            max_results=20,
            enabled=False,
        ),
        "social_instagram": Channel(
            name="social_instagram",
            provider="instagram",
            base_url="https://graph.facebook.com/v21.0",
            notes="Instagram Graph API - Meta 官方 API（需 App 审核）",
            max_results=25,
            enabled=True,
        ),
        "media": Channel(
            name="media",
            provider="youtube",
            base_url="https://www.googleapis.com/youtube/v3/search",
            notes="视频平台搜索，选取至少5条",
            max_results=12,
        ),
    }

