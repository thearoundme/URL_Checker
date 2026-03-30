import asyncio
import contextlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.config_loader import ServiceConfigStore
from app.core.runtime_settings import runtime_settings_manager
from app.core.settings import settings
from app.monitoring.k8_monitor import KubernetesMonitor
from app.monitoring.ssl_monitor import scan_ssl_certificates

logger = logging.getLogger("url_check.runtime_cache")


@dataclass
class CacheEnvelope:
    data: object
    updated_at: datetime | None


class RuntimeCache:
    def __init__(self, config_store: ServiceConfigStore) -> None:
        self._store = config_store
        self._k8_monitor = KubernetesMonitor()
        self._lock = asyncio.Lock()
        self._k8_clusters = CacheEnvelope(data=[], updated_at=None)
        self._k8_overview = CacheEnvelope(data=None, updated_at=None)
        self._ssl_certs = CacheEnvelope(data=[], updated_at=None)
        self._ssl_summary = CacheEnvelope(data=None, updated_at=None)
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._run_k8_refresh_loop()),
            asyncio.create_task(self._run_ssl_refresh_loop()),
        ]

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await t
        self._tasks = []

    async def force_refresh_k8(self) -> None:
        clusters = await self._store.get_kubernetes_clusters()
        checks = await self._k8_monitor.check_all(clusters)
        overview = self._k8_monitor.summarize(checks)
        now = datetime.now(timezone.utc)
        async with self._lock:
            self._k8_clusters = CacheEnvelope(data=checks, updated_at=now)
            self._k8_overview = CacheEnvelope(data=overview, updated_at=now)

    async def force_refresh_ssl(
        self,
        warning_days: int = 15,
        critical_days: int = 7,
        timeout_seconds: float = 5.0,
    ) -> None:
        services = await self._store.get_services()
        certs = await scan_ssl_certificates(
            services,
            warning_days=warning_days,
            critical_days=critical_days,
            timeout_seconds=timeout_seconds,
        )
        summary = {
            "total_domains": len(certs),
            "ok": sum(1 for c in certs if c.status == "OK"),
            "expiring_15_days": sum(1 for c in certs if c.status == "EXPIRING_SOON"),
            "expiring_7_days": sum(1 for c in certs if c.status == "CRITICAL"),
            "expired": sum(1 for c in certs if c.status == "EXPIRED"),
            "errors": sum(1 for c in certs if c.status == "ERROR"),
        }
        now = datetime.now(timezone.utc)
        async with self._lock:
            self._ssl_certs = CacheEnvelope(data=certs, updated_at=now)
            self._ssl_summary = CacheEnvelope(data=summary, updated_at=now)

    async def get_k8_clusters(self) -> CacheEnvelope:
        async with self._lock:
            return self._k8_clusters

    async def get_k8_overview(self) -> CacheEnvelope:
        async with self._lock:
            return self._k8_overview

    async def get_ssl_certs(self) -> CacheEnvelope:
        async with self._lock:
            return self._ssl_certs

    async def get_ssl_summary(self) -> CacheEnvelope:
        async with self._lock:
            return self._ssl_summary

    async def _run_k8_refresh_loop(self) -> None:
        while True:
            try:
                await self.force_refresh_k8()
            except Exception as exc:  # noqa: BLE001
                logger.warning("k8 cache refresh failed: %s", exc)
            runtime = runtime_settings_manager.get()
            await asyncio.sleep(int(runtime.get("k8_cache_refresh_seconds", settings.k8_cache_refresh_seconds)))

    async def _run_ssl_refresh_loop(self) -> None:
        while True:
            try:
                await self.force_refresh_ssl()
            except Exception as exc:  # noqa: BLE001
                logger.warning("ssl cache refresh failed: %s", exc)
            runtime = runtime_settings_manager.get()
            await asyncio.sleep(int(runtime.get("ssl_cache_refresh_seconds", settings.ssl_cache_refresh_seconds)))

