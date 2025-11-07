"""Tavily 官方渠道采集器。

支持两种方式：
1. 官方 Python SDK (tavily-python) - 推荐
2. REST API (requests) - 备选
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List

from ..base import BaseCollector
from ...orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class OfficialTavilyCollector(BaseCollector):
    channel_name = "official"
    _client = None

    def __init__(self, config=None):
        super().__init__(config)
        # 尝试导入官方 SDK
        try:
            from tavily import TavilyClient
            self._has_sdk = True
            self._TavilyClient = TavilyClient
        except ImportError:
            self._has_sdk = False
            logger.debug("tavily-python SDK 未安装，将使用 REST API 方式")

    def _get_client(self):
        """获取或创建 Tavily 客户端。"""
        if not self._has_sdk:
            return None
        
        if self._client is None:
            api_key = self.config.TAVILY_API_KEY
            if not api_key:
                raise RuntimeError("Tavily API Key 未配置")
            self._client = self._TavilyClient(api_key)
        return self._client

    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
        query_string: Optional[str] = None,
    ) -> Dict[str, Any]:
        api_key = context.metadata.get("tavily_api_key") or self.config.TAVILY_API_KEY
        if not api_key:
            raise RuntimeError("Tavily API Key 未配置")

        # 优先使用自然语言查询字符串，如果没有则使用关键词列表
        query = query_string if query_string else " ".join(keywords)
        
        # 确保查询包含时间信息（如果 keywords 中没有）
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
        
        return {
            "method": "POST",
            "url": channel_config["base_url"],
            "headers": {"Content-Type": "application/json", "x-api-key": api_key},
            "data": {
                "query": query,
                "search_depth": "advanced",
                "include_domains": [],
                "language": language,
                "max_results": channel_config.get("max_results", 8),
            },
            "timeout": 30,
        }

    def parse_response(self, response, language: str) -> Iterable[Dict[str, Any]]:
        if response.status_code != 200:
            logger.warning("Tavily 返回状态码 %s", response.status_code)
            return []

        data = response.json()
        results = data.get("results", [])
        for item in results:
            yield {
                "channel": self.channel_name,
                "language": language,
                "title": item.get("title"),
                "summary": item.get("content"),
                "url": item.get("url"),
                "published_at": item.get("published_date"),
                "source": item.get("site_name"),
            }

    def collect(self, context: EventContext) -> List[Dict[str, Any]]:
        """使用官方 SDK 或 REST API 采集数据。"""
        plan = context.query_plan or {}
        channel_config = (plan.get("channels") or {}).get(self.channel_name)
        if not channel_config or not channel_config.get("enabled", True):
            logger.debug("%s 渠道未启用，跳过", self.channel_name)
            return []

        keywords_map = plan.get("keywords") or {}
        items: List[Dict[str, Any]] = []
        
        # 优先使用官方 SDK
        if self._has_sdk:
            try:
                client = self._get_client()
                query_strings_map = plan.get("query_strings") or {}
                for language, keywords in keywords_map.items():
                    if not keywords:
                        continue
                    # 优先使用自然语言查询字符串
                    query = query_strings_map.get(language) or " ".join(keywords)
                    
                    # 时间信息已经在 keywords 中（通过 KeywordPlanner 添加）
                    # 但可以在这里确保查询包含时间
                    event_time = context.rain_event.event_time
                    if event_time and event_time.strftime("%Y") not in query:
                        # 如果查询中没有年份，添加日期
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
                    
                    try:
                        response = client.search(
                            query=query,
                            search_depth="advanced",
                            max_results=channel_config.get("max_results", 8),
                        )
                        
                        # 解析 SDK 响应
                        results = response.get("results", [])
                        for item in results:
                            items.append({
                                "channel": self.channel_name,
                                "language": language,
                                "title": item.get("title"),
                                "summary": item.get("content"),
                                "url": item.get("url"),
                                "published_at": item.get("published_date"),
                                "source": item.get("site_name"),
                            })
                    except Exception as e:
                        logger.exception("Tavily SDK 采集失败: %s", e)
            except Exception as e:
                logger.warning("使用 Tavily SDK 失败，回退到 REST API: %s", e)
                # 回退到 REST API
                items = super().collect(context)
        else:
            # 使用 REST API
            items = super().collect(context)
        
        # 时间过滤
        hours = plan.get("time_window_hours", 48)
        return self.filter_by_time(items, hours)

