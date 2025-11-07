"""采集器配置加载器。"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List

from ..config.settings import Settings, settings

logger = logging.getLogger(__name__)


class CollectorConfigLoader:
    """加载和管理采集器配置。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.config_path = Path(__file__).parent / "collector_config.json"
        self._config_data: Dict | None = None

    def load(self) -> Dict:
        """加载配置文件。"""
        if self._config_data is not None:
            return self._config_data

        if not self.config_path.exists():
            logger.warning("采集器配置文件不存在: %s，使用默认配置", self.config_path)
            return self._get_default_config()

        try:
            with self.config_path.open("r", encoding="utf-8") as fp:
                self._config_data = json.load(fp)
            return self._config_data
        except Exception:
            logger.exception("加载采集器配置失败，使用默认配置")
            return self._get_default_config()

    def get_enabled_collectors(self) -> Dict[str, List[str]]:
        """获取启用的采集器列表。"""
        config = self.load()
        enabled: Dict[str, List[str]] = {}
        for category, category_config in config.get("collectors", {}).items():
            enabled[category] = category_config.get("enabled", [])
        return enabled

    def is_collector_enabled(self, category: str, collector_name: str) -> bool:
        """检查指定采集器是否启用。"""
        config = self.load()
        category_config = config.get("collectors", {}).get(category, {})
        enabled = category_config.get("enabled", [])
        disabled = category_config.get("disabled", [])
        return collector_name in enabled and collector_name not in disabled

    @staticmethod
    def _get_default_config() -> Dict:
        """返回默认配置。"""
        return {
            "collectors": {
                "news": {
                    "enabled": ["news_thenewsapi"],
                    "disabled": ["news_gnews", "news_serpapi"],
                },
                "officials": {
                    "enabled": ["official"],
                    "disabled": [],
                },
                "medias": {
                    "enabled": ["media"],
                    "disabled": [],
                },
                "socials": {
                    "enabled": ["social"],
                    "disabled": [],
                },
            },
        }

