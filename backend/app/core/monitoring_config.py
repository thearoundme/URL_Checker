"""Load engine tuning from config/monitoring_settings.json (data-driven)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.settings import settings

_UNSET = object()


def _defaults() -> dict[str, Any]:
    return {
        "check_interval_seconds": settings.check_interval_seconds,
        "check_timeout_seconds": settings.check_timeout_seconds,
        "retry_count": settings.retry_count,
        "degraded_latency_ms": settings.degraded_latency_ms,
        "batch_size": settings.batch_size,
        "max_outbound_connections": settings.max_outbound_connections,
        "max_keepalive_connections": settings.max_keepalive_connections,
        "latency_history_size": settings.latency_history_size,
        "intermittent_failure_window": settings.intermittent_failure_window,
        "intermittent_failure_threshold": settings.intermittent_failure_threshold,
        "ui_poll_interval_ms": 12000,
    }


def _coerce(data: dict[str, Any]) -> dict[str, Any]:
    d = {**_defaults(), **data}
    out: dict[str, Any] = {}
    out["check_interval_seconds"] = max(5, int(d.get("check_interval_seconds", 30)))
    out["check_timeout_seconds"] = max(0.5, float(d.get("check_timeout_seconds", 5.0)))
    out["retry_count"] = max(0, int(d.get("retry_count", 2)))
    out["degraded_latency_ms"] = max(1.0, float(d.get("degraded_latency_ms", 1000.0)))
    out["batch_size"] = max(1, int(d.get("batch_size", 100)))
    out["max_outbound_connections"] = max(10, int(d.get("max_outbound_connections", 2000)))
    out["max_keepalive_connections"] = max(10, int(d.get("max_keepalive_connections", 400)))
    out["latency_history_size"] = max(5, int(d.get("latency_history_size", 30)))
    out["intermittent_failure_window"] = max(2, int(d.get("intermittent_failure_window", 10)))
    out["intermittent_failure_threshold"] = max(1, int(d.get("intermittent_failure_threshold", 3)))
    out["ui_poll_interval_ms"] = max(2000, int(d.get("ui_poll_interval_ms", 12000)))
    return out


class MonitoringConfigFile:
    """Reads monitoring_settings.json; reloads when file mtime changes."""

    def __init__(self) -> None:
        self._path = Path(settings.config_dir) / settings.monitoring_settings_file
        self._cached_mtime: float | None | object = _UNSET  # type: ignore[assignment]
        self._data: dict[str, Any] = _coerce({})

    def path(self) -> Path:
        return self._path

    def _read_file(self) -> dict[str, Any]:
        raw = json.loads(self._path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return _coerce({})
        return _coerce(raw)

    def reload_if_changed(self) -> bool:
        current: float | None = self._path.stat().st_mtime if self._path.exists() else None
        if self._cached_mtime is not _UNSET and current == self._cached_mtime:
            return False
        self._cached_mtime = current
        if self._path.exists():
            try:
                self._data = self._read_file()
            except Exception:
                self._data = _coerce({})
        else:
            self._data = _coerce({})
        return True

    def get(self) -> dict[str, Any]:
        self.reload_if_changed()
        return dict(self._data)

    def meta(self) -> dict[str, Any]:
        self.reload_if_changed()
        exists = self._path.exists()
        last_updated = None
        if exists:
            last_updated = datetime.fromtimestamp(self._path.stat().st_mtime, tz=timezone.utc).isoformat()
        return {
            "file": settings.monitoring_settings_file,
            "exists": exists,
            "last_updated": last_updated,
            "effective": dict(self._data),
        }


monitoring_config_file = MonitoringConfigFile()
