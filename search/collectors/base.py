"""采集器基础抽象。"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

import requests
from requests import Response

from ..config.settings import Settings, settings
from ..orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class BaseCollector:
    """统一处理请求、错误与结果格式。"""

    channel_name: str = "base"

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.session = requests.Session()

    def collect(self, context: EventContext) -> List[Dict[str, Any]]:
        from ..utils.detailed_logger import get_detailed_logger
        
        detailed_logger = get_detailed_logger()
        plan = context.query_plan or {}
        channel_config = (plan.get("channels") or {}).get(self.channel_name)
        if not channel_config or not channel_config.get("enabled", True):
            logger.debug("%s 渠道未启用，跳过", self.channel_name)
            return []

        keywords_map = plan.get("keywords") or {}
        query_strings_map = plan.get("query_strings") or {}  # 新增：自然语言查询字符串
        items: List[Dict[str, Any]] = []
        for language, keywords in keywords_map.items():
            if not keywords:
                continue
            
            # 获取自然语言查询字符串（如果可用）
            query_string = query_strings_map.get(language)
            if not query_string:
                # 如果没有提供，使用关键词列表组合（但会有重复问题）
                query_string = " ".join(keywords)
            
            try:
                payload = self.build_payload(
                    context=context,
                    channel_config=channel_config,
                    language=language,
                    keywords=keywords,  # 保留原始列表（用于日志）
                    query_string=query_string,  # 自然语言查询字符串（用于实际搜索）
                )
                # 记录搜索请求
                detailed_logger.log_search_request(
                    collector_name=self.__class__.__name__,
                    channel=self.channel_name,
                    language=language,
                    keywords=keywords,
                    payload=payload,
                    query_string=query_string,
                )
                
                response = self.dispatch(payload)
                chunk = list(self.parse_response(response, language))
                items.extend(chunk)
                
                # 记录搜索响应
                detailed_logger.log_search_response(
                    collector_name=self.__class__.__name__,
                    channel=self.channel_name,
                    language=language,
                    response_data=chunk,
                    items_count=len(chunk),
                )
            except Exception:
                logger.exception("%s 渠道采集失败", self.channel_name)
        return self.post_process(items, channel_config)

    # ------------------------------------------------------------------
    def build_payload(
        self,
        context: EventContext,
        channel_config: Dict[str, Any],
        language: str,
        keywords: List[str],
        query_string: Optional[str] = None,
    ) -> Dict[str, Any]:
        """构建 API 请求负载。
        
        Args:
            keywords: 原始关键词列表（用于日志）
            query_string: 自然语言查询字符串（用于实际搜索，如果提供则优先使用）
        """
        raise NotImplementedError

    def dispatch(self, payload: Dict[str, Any]) -> Response:
        method = payload.get("method", "GET")
        url = payload["url"]
        headers = payload.get("headers")
        params = payload.get("params")
        data = payload.get("data")
        timeout = payload.get("timeout", 20)

        logger.debug("%s 请求 %s", self.channel_name, url)
        if method.upper() == "POST":
            return self.session.post(url, headers=headers, params=params, json=data, timeout=timeout)
        return self.session.get(url, headers=headers, params=params, timeout=timeout)

    def parse_response(self, response: Response, language: str) -> Iterable[Dict[str, Any]]:
        raise NotImplementedError

    def post_process(
        self, items: List[Dict[str, Any]], channel_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        max_results = channel_config.get("max_results")
        if max_results:
            items = items[: max_results]
        return self.deduplicate(items)

    @staticmethod
    def deduplicate(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        result: List[Dict[str, Any]] = []
        for item in items:
            url = item.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            result.append(item)
        return result

    @staticmethod
    def filter_by_time(
        items: Iterable[Dict[str, Any]],
        hours: int,
        timestamp_key: str = "published_at",
    ) -> List[Dict[str, Any]]:
        if hours <= 0:
            return list(items)
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        filtered: List[Dict[str, Any]] = []
        for item in items:
            value = item.get(timestamp_key)
            if not value:
                filtered.append(item)
                continue
            if isinstance(value, str):
                try:
                    value_dt = datetime.fromisoformat(value.replace("Z", ""))
                except ValueError:
                    filtered.append(item)
                    continue
            else:
                value_dt = value
            if value_dt >= cutoff:
                filtered.append(item)
        return filtered

