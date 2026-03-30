import json
from pathlib import Path
from typing import Any

from app.core.settings import settings


DEFAULT_RUNTIME_SETTINGS = {
    "api_keys": settings.api_keys,
    "admin_api_keys": ["admin-local-key"],
    "admin_username": "admin",
    "admin_password": "admin",
    "allowed_origins": settings.allowed_origins,
    "rate_limit_window_seconds": settings.rate_limit_window_seconds,
    "rate_limit_max_requests": settings.rate_limit_max_requests,
    "k8_cache_refresh_seconds": settings.k8_cache_refresh_seconds,
    "ssl_cache_refresh_seconds": settings.ssl_cache_refresh_seconds,
}


class RuntimeSettingsManager:
    def __init__(self) -> None:
        self._path = Path(settings.config_dir) / settings.runtime_settings_file
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._settings: dict[str, Any] = dict(DEFAULT_RUNTIME_SETTINGS)
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            self._save()
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                self._settings = {**DEFAULT_RUNTIME_SETTINGS, **data}
        except Exception:
            self._settings = dict(DEFAULT_RUNTIME_SETTINGS)
            self._save()

    def _save(self) -> None:
        self._path.write_text(json.dumps(self._settings, indent=2), encoding="utf-8")

    def get(self) -> dict[str, Any]:
        return dict(self._settings)

    def update(self, updates: dict[str, Any]) -> dict[str, Any]:
        clean = dict(self._settings)
        for key in DEFAULT_RUNTIME_SETTINGS:
            if key in updates:
                clean[key] = updates[key]

        clean["api_keys"] = [k for k in clean.get("api_keys", []) if isinstance(k, str) and k.strip()]
        clean["admin_api_keys"] = [k for k in clean.get("admin_api_keys", []) if isinstance(k, str) and k.strip()]
        clean["admin_username"] = str(clean.get("admin_username", "admin") or "admin")
        clean["admin_password"] = str(clean.get("admin_password", "admin") or "admin")
        clean["allowed_origins"] = [o for o in clean.get("allowed_origins", []) if isinstance(o, str) and o.strip()]
        clean["rate_limit_window_seconds"] = max(1, int(clean.get("rate_limit_window_seconds", 60)))
        clean["rate_limit_max_requests"] = max(1, int(clean.get("rate_limit_max_requests", 30)))
        clean["k8_cache_refresh_seconds"] = max(5, int(clean.get("k8_cache_refresh_seconds", 20)))
        clean["ssl_cache_refresh_seconds"] = max(10, int(clean.get("ssl_cache_refresh_seconds", 60)))

        self._settings = clean
        self._save()
        return self.get()


runtime_settings_manager = RuntimeSettingsManager()

