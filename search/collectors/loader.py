"""采集器动态加载器。"""

from __future__ import annotations

import importlib
import logging
from typing import Any, Dict, Type

from .base import BaseCollector
from .config_loader import CollectorConfigLoader
from ..config.settings import Settings, settings

logger = logging.getLogger(__name__)


class CollectorLoader:
    """根据配置动态加载采集器。"""

    # 采集器类映射表
    COLLECTOR_REGISTRY: Dict[str, Dict[str, str]] = {
        "news": {
            "news_thenewsapi": "search.collectors.news.thenewsapi.NewsTheNewsAPICollector",
            "news_gnews": "search.collectors.news.gnews.NewsGNewsCollector",
            "news_serpapi": "search.collectors.news.serpapi.NewsSerpAPICollector",
        },
        "officials": {
            "official": "search.collectors.officials.tavily.OfficialTavilyCollector",
        },
        "medias": {
            "media": "search.collectors.medias.youtube.MediaYouTubeCollector",
        },
        "socials": {
            "social": "search.collectors.socials.x_twitter.SocialXTwitterCollector",
            "social_instagram": "search.collectors.socials.instagram.SocialInstagramCollector",
        },
    }

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.config_loader = CollectorConfigLoader(self.config)

    def load_all(self) -> Dict[str, BaseCollector]:
        """根据配置加载所有启用的采集器。"""
        enabled = self.config_loader.get_enabled_collectors()
        collectors: Dict[str, BaseCollector] = {}

        for category, collector_names in enabled.items():
            for collector_name in collector_names:
                try:
                    collector_class = self._load_collector_class(category, collector_name)
                    if collector_class:
                        collectors[collector_name] = collector_class(self.config)
                        logger.debug("已加载采集器: %s", collector_name)
                except Exception:
                    logger.exception("加载采集器 %s 失败", collector_name)

        return collectors

    def _load_collector_class(
        self, category: str, collector_name: str
    ) -> Type[BaseCollector] | None:
        """动态加载采集器类。"""
        registry = self.COLLECTOR_REGISTRY.get(category, {})
        class_path = registry.get(collector_name)

        if not class_path:
            logger.warning("未找到采集器 %s 的注册信息", collector_name)
            return None

        try:
            module_path, class_name = class_path.rsplit(".", 1)
            module = importlib.import_module(module_path)
            collector_class = getattr(module, class_name)
            if not issubclass(collector_class, BaseCollector):
                logger.error("%s 不是 BaseCollector 的子类", class_path)
                return None
            return collector_class
        except Exception:
            logger.exception("导入采集器类 %s 失败", class_path)
            return None

