"""降雨事件监听器。

负责从 ``rain_events`` 表中拉取待处理的降雨记录，结合配置阈值过滤，
并在处理完成后回写状态。默认实现以 SQLite 为主，其他数据库类型
可在后续扩展对应适配器。
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from ..config.settings import Settings, settings

logger = logging.getLogger(__name__)


@dataclass
class RainEvent:
    """表示一条降雨事件记录。"""

    event_id: Any
    event_time: Optional[datetime] = None
    location_name: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rainfall_mm: Optional[float] = None
    severity: Optional[str] = None
    data_source: Optional[str] = None
    extras: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        base = {
            "event_id": self.event_id,
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "location_name": self.location_name,
            "country": self.country,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "rainfall_mm": self.rainfall_mm,
            "severity": self.severity,
            "data_source": self.data_source,
        }
        return {**base, **self.extras}

    def to_dict(self) -> Dict[str, Any]:
        return self.as_dict()


class RainEventWatcher:
    """轮询 ``rain_events`` 表并挑选需处理事件。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings

        if self.config.DB_DIALECT != "sqlite":
            logger.warning(
                "当前仅实现 SQLite 适配，%s 需要自行扩展数据库适配器",
                self.config.DB_DIALECT,
            )

    # ------------------------------------------------------------------
    # 对外接口
    # ------------------------------------------------------------------
    def fetch_pending_events(self) -> List[RainEvent]:
        """拉取符合阈值且未处理的事件。"""

        rows = list(self._iter_sqlite_rows())
        cutoff = datetime.utcnow() - timedelta(
            hours=self.config.MAX_EVENT_LOOKBACK_HOURS
        )

        filtered: List[RainEvent] = []
        for row in rows:
            event = self._row_to_event(row)

            if event.rainfall_mm is None or event.rainfall_mm < self.config.MIN_RAINFALL_MM:
                continue

            if event.event_time and event.event_time < cutoff:
                continue

            filtered.append(event)

        filtered.sort(
            key=lambda e: e.event_time or datetime.min,
        )

        if len(filtered) > self.config.BATCH_LIMIT:
            filtered = filtered[: self.config.BATCH_LIMIT]

        logger.debug("筛选待处理事件数量: %s", len(filtered))
        return filtered

    def mark_event_completed(
        self,
        event: RainEvent,
        processed_at: Optional[datetime] = None,
    ) -> None:
        """标记事件已处理完毕。"""

        processed_at = processed_at or datetime.utcnow()
        if self.config.DB_DIALECT != "sqlite":
            return

        try:
            with self._sqlite_connection() as conn:
                cursor = conn.cursor()
                query = (
                    f"UPDATE {self.config.RAIN_EVENTS_TABLE} "
                    f"SET {self.config.PROCESSED_FLAG_COLUMN} = 1, "
                    f"{self.config.PROCESSED_AT_COLUMN} = ? "
                    f"WHERE rain_event_id = ?"
                )
                cursor.execute(
                    query,
                    (
                        processed_at.isoformat(timespec="seconds"),
                        event.event_id,
                    ),
                )
                conn.commit()
        except sqlite3.OperationalError as exc:
            logger.warning("更新 processed 标记失败（可能列不存在）: %s", exc)
        except Exception:
            logger.exception("标记降雨事件 %s 为已处理时出错", event.event_id)

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------
    def _sqlite_connection(self) -> sqlite3.Connection:
        # 优先使用 DB_FILE，如果没有则使用默认路径（统一使用一个路径：apps/database/dev.db）
        db_file = self.config.DB_FILE
        if not db_file:
            # 默认使用 apps/database/dev.db（与Node.js API保持一致）
            db_file = "apps/database/dev.db"
        
        db_path = Path(db_file)
        if not db_path.is_absolute():
            # 相对于项目根目录
            # __file__ 是 search/watcher/rain_event_watcher.py
            # parents[2] 是项目根目录（europe）
            project_root = Path(__file__).resolve().parents[2]
            db_path = project_root / db_path

        # 确保目录存在
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        connection = sqlite3.connect(str(db_path))
        connection.row_factory = sqlite3.Row
        return connection

    def _iter_sqlite_rows(self) -> Iterable[sqlite3.Row]:
        if self.config.DB_DIALECT != "sqlite":
            return []

        try:
            with self._sqlite_connection() as conn:
                cursor = conn.cursor()
                query = (
                    f"SELECT * FROM {self.config.RAIN_EVENTS_TABLE} "
                    f"WHERE {self.config.PROCESSED_FLAG_COLUMN} IS NULL "
                    f"OR {self.config.PROCESSED_FLAG_COLUMN} = 0"
                )
                for row in cursor.execute(query):
                    yield row
        except sqlite3.OperationalError as exc:
            logger.error("查询 rain_events 表失败: %s", exc)
        except Exception:
            logger.exception("读取 rain_events 表发生未知错误")

    def _row_to_event(self, row: sqlite3.Row) -> RainEvent:
        data = dict(row)
        event_time = self._parse_datetime(data.get(self.config.EVENT_TIME_COLUMN))
        rainfall = self._parse_float(data.get(self.config.RAINFALL_COLUMN))
        
        # 获取 event_id，确保使用完整的 ID（包含 seq 部分）
        event_id = data.get("rain_event_id") or data.get("id") or data.get("event_id")
        if event_id:
            logger.debug("从数据库读取 event_id: %s (类型: %s)", event_id, type(event_id).__name__)
        else:
            logger.warning("未找到 event_id 字段，数据: %s", list(data.keys()))

        return RainEvent(
            event_id=event_id,
            event_time=event_time,
            location_name=data.get(self.config.LOCATION_COLUMN),
            country=data.get(self.config.COUNTRY_COLUMN),
            latitude=self._parse_float(data.get(self.config.LATITUDE_COLUMN)),
            longitude=self._parse_float(data.get(self.config.LONGITUDE_COLUMN)),
            rainfall_mm=rainfall,
            severity=self._safe_str(data.get(self.config.SEVERITY_COLUMN)),
            data_source=self._safe_str(data.get(self.config.DATA_SOURCE_COLUMN)),
            extras={k: v for k, v in data.items() if k not in {
                "rain_event_id",
                "id",
                "event_id",
                self.config.EVENT_TIME_COLUMN,
                self.config.LOCATION_COLUMN,
                self.config.COUNTRY_COLUMN,
                self.config.LATITUDE_COLUMN,
                self.config.LONGITUDE_COLUMN,
                self.config.RAINFALL_COLUMN,
                self.config.SEVERITY_COLUMN,
                self.config.DATA_SOURCE_COLUMN,
                self.config.PROCESSED_FLAG_COLUMN,
                self.config.PROCESSED_AT_COLUMN,
            }},
        )

    @staticmethod
    def _parse_datetime(value: Any) -> Optional[datetime]:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(value)
            except (TypeError, ValueError):
                return None
        if isinstance(value, str):
            candidate = value.strip()
            try:
                return datetime.fromisoformat(candidate)
            except ValueError:
                pass

            if candidate.endswith("Z"):
                try:
                    return datetime.fromisoformat(candidate[:-1])
                except ValueError:
                    pass

            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y/%m/%d %H:%M:%S",
            ):
                try:
                    return datetime.strptime(candidate, fmt)
                except ValueError:
                    continue
        return None

    @staticmethod
    def _parse_float(value: Any) -> Optional[float]:
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_str(value: Any) -> Optional[str]:
        if value is None:
            return None
        return str(value)

