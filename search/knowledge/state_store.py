"""知识存储层占位实现。"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from ..config.settings import Settings, settings
from ..orchestrator.workflow import EventContext

logger = logging.getLogger(__name__)


class StateStore:
    """将处理结果持久化（当前使用 JSON 文件占位）。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.output_dir = Path(self.config.PROJECT_ROOT) / "search_outputs"
        self.output_dir.mkdir(exist_ok=True)

    def save_event(self, context: EventContext) -> Path:
        payload = self._serialize_context(context)
        output_path = self.output_dir / f"event_{context.rain_event.event_id}.json"
        with output_path.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, indent=2, default=str)
        logger.info("已保存事件结果：%s", output_path)
        return output_path

    def _serialize_context(self, context: EventContext) -> Dict[str, Any]:
        return {
            "rain_event": context.rain_event.to_dict(),
            "location_profile": context.location_profile,
            "query_plan": context.query_plan,
            "raw_contents": context.raw_contents,
            "processed_summary": context.processed_summary,
            "reports": context.reports,
            "metadata": context.metadata,
            "started_at": context.started_at,
            "finished_at": context.finished_at,
        }

