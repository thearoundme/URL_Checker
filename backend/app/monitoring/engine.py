import asyncio
from collections import defaultdict, deque
from typing import Dict, List

from prometheus_client import Counter, Histogram
import aiohttp

from app.core.config_loader import ServiceConfigStore
from app.core.monitoring_config import monitoring_config_file
from app.core.settings import settings
from app.models.schemas import AlertItem, ServiceCheckResult, ServiceConfig, ServiceStatus, SummaryResponse
from app.monitoring.anomaly import AnomalyDetector
from app.monitoring.checkers import ServiceChecker, classify_status, to_result
from app.monitoring.sla import SlaTracker

CHECKS_EXECUTED = Counter("service_checks_total", "Total number of service checks executed")
CHECKS_FAILED = Counter("service_checks_failed_total", "Total number of failed service checks")
CHECK_DURATION = Histogram("service_check_duration_ms", "Service check latency in milliseconds")


class MonitoringEngine:
    def __init__(self, config_store: ServiceConfigStore) -> None:
        self._config_store = config_store
        self._sla = SlaTracker()
        self._latest_results: Dict[str, ServiceCheckResult] = {}
        self._history: Dict[str, deque[ServiceCheckResult]] = defaultdict(self._new_history_deque)
        self._lock = asyncio.Lock()
        self._apply_monitoring_components()

    def _new_history_deque(self) -> deque[ServiceCheckResult]:
        mon = monitoring_config_file.get()
        return deque(maxlen=max(10, int(mon["latency_history_size"])))

    def _apply_monitoring_components(self) -> None:
        mon = monitoring_config_file.get()
        self._checker = ServiceChecker(
            float(mon["check_timeout_seconds"]),
            int(mon["retry_count"]),
            int(mon["max_outbound_connections"]),
            int(mon["max_keepalive_connections"]),
        )
        self._anomaly = AnomalyDetector(
            history_size=int(mon["latency_history_size"]),
            failure_window=int(mon["intermittent_failure_window"]),
            intermittent_threshold=int(mon["intermittent_failure_threshold"]),
        )

    async def _reload_monitoring_if_changed(self) -> None:
        if monitoring_config_file.reload_if_changed():
            await self._checker.close()
            self._history.clear()
            self._apply_monitoring_components()

    async def run_forever(self) -> None:
        while True:
            await self._reload_monitoring_if_changed()
            await self.run_once()
            mon = monitoring_config_file.get()
            await asyncio.sleep(float(mon["check_interval_seconds"]))

    async def run_once(self) -> None:
        await self._reload_monitoring_if_changed()
        mon = monitoring_config_file.get()
        services = await self._config_store.get_services()
        if not services:
            return

        tasks: List[asyncio.Task[ServiceCheckResult]] = []
        batch_size = int(mon["batch_size"])
        for start in range(0, len(services), batch_size):
            batch_services = services[start : start + batch_size]
            tasks = [asyncio.create_task(self._check_single(service)) for service in batch_services]
            await asyncio.gather(*tasks, return_exceptions=False)

    async def close(self) -> None:
        await self._checker.close()

    async def _check_single(self, service: ServiceConfig) -> ServiceCheckResult:
        mon = monitoring_config_file.get()
        # main, summary, heartbeat in parallel (separate sessions for simplicity)
        main_task = self._checker.check(service)
        summary_task = self._check_summary(service)
        heartbeat_task = self._check_heartbeat(service)

        raw, summary_status, heartbeat_status = await asyncio.gather(main_task, summary_task, heartbeat_task)

        threshold = service.degraded_threshold_ms or float(mon["degraded_latency_ms"])
        status = classify_status(raw.is_success, raw.latency_ms, threshold)
        result = to_result(service, status, raw.latency_ms, raw.error_message)
        result.summary_status = summary_status
        result.heartbeat_status = heartbeat_status

        key = f"{service.name}:{service.env}:{service.region}"
        anomaly, _avg = self._anomaly.record(key, raw.latency_ms, status == "DOWN")
        result.anomaly = anomaly

        CHECKS_EXECUTED.inc()
        CHECK_DURATION.observe(raw.latency_ms)
        if status == "DOWN":
            CHECKS_FAILED.inc()

        self._sla.record(result)

        async with self._lock:
            self._latest_results[key] = result
            self._history[key].append(result)
        return result

    async def check_service(self, service: ServiceConfig) -> ServiceCheckResult:
        # Public method for on-demand checks used by APIs/runners.
        return await self._check_single(service)

    async def recheck_services(self, services: list[ServiceConfig]) -> list[ServiceCheckResult]:
        if not services:
            return []
        return await asyncio.gather(*(self.check_service(service) for service in services))

    async def _check_summary(self, service: ServiceConfig) -> ServiceStatus | None:
        if not service.summary_url:
            return None
        try:
            timeout = aiohttp.ClientTimeout(total=settings.check_timeout_seconds)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(service.summary_url) as resp:
                    if 200 <= resp.status < 300:
                        return "UP"
                    return "DOWN"
        except Exception:
            return "DOWN"

    async def _check_heartbeat(self, service: ServiceConfig) -> str | None:
        if not service.heartbeat_url:
            return "NO_DATA"
        try:
            timeout = aiohttp.ClientTimeout(total=float(monitoring_config_file.get()["check_timeout_seconds"]))
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(service.heartbeat_url) as resp:
                    body = await resp.text()
                    if 200 <= resp.status < 300 and "UP" in body.upper():
                        return "HEALTHY"
                    return "UNHEALTHY"
        except Exception:
            return "UNHEALTHY"

    async def get_latest_results(self) -> list[ServiceCheckResult]:
        async with self._lock:
            return list(self._latest_results.values())

    async def get_history_for_service(self, name: str) -> dict[str, list[ServiceCheckResult]]:
        async with self._lock:
            grouped: dict[str, list[ServiceCheckResult]] = {}
            for key, items in self._history.items():
                service_name, env, region = key.split(":", 2)
                if service_name != name:
                    continue
                grouped[f"{env}:{region}"] = list(items)
            return grouped

    async def get_anomalies(self) -> list[ServiceCheckResult]:
        results = await self.get_latest_results()
        return [item for item in results if item.anomaly]

    async def get_summary(self) -> SummaryResponse:
        results = await self.get_latest_results()
        total = len(results)
        up = sum(1 for item in results if item.status == "UP")
        down = sum(1 for item in results if item.status == "DOWN")
        degraded = sum(1 for item in results if item.status == "DEGRADED")

        availability = 100.0 if total == 0 else round(((up + degraded) / total) * 100.0, 2)
        avg_latency = 0.0 if total == 0 else round(sum(item.latency_ms for item in results) / total, 2)

        by_env: dict = {}
        for env in sorted(set(item.env for item in results)):
            env_items = [item for item in results if item.env == env]
            app_items = [item for item in env_items if item.category == "application"]
            tool_items = [item for item in env_items if item.category == "tool"]
            env_total = len(env_items)
            env_healthy = sum(1 for item in env_items if item.status in ("UP", "DEGRADED"))
            by_env[env] = {
                "applications": {
                    "total": len(app_items),
                    "up": sum(1 for item in app_items if item.status in ("UP", "DEGRADED")),
                    "down": sum(1 for item in app_items if item.status == "DOWN"),
                },
                "tools": {
                    "total": len(tool_items),
                    "up": sum(1 for item in tool_items if item.status in ("UP", "DEGRADED")),
                    "down": sum(1 for item in tool_items if item.status == "DOWN"),
                },
                "availability_pct": 100.0 if env_total == 0 else round((env_healthy / env_total) * 100.0, 2),
            }

        categories = {"application": [], "tool": []}
        for item in results:
            categories[item.category].append(item)
        by_category = {}
        for category, items in categories.items():
            total_cat = len(items)
            healthy_cat = sum(1 for item in items if item.status in ("UP", "DEGRADED"))
            by_category[category] = {
                "total": total_cat,
                "up": sum(1 for item in items if item.status in ("UP", "DEGRADED")),
                "down": sum(1 for item in items if item.status == "DOWN"),
                "availability_pct": 100.0 if total_cat == 0 else round((healthy_cat / total_cat) * 100.0, 2),
            }

        by_region: dict = {}
        for region in sorted(set(item.region for item in results)):
            region_items = [item for item in results if item.region == region]
            total_region = len(region_items)
            healthy_region = sum(1 for item in region_items if item.status in ("UP", "DEGRADED"))
            by_region[region] = {
                "total": total_region,
                "up": healthy_region,
                "down": sum(1 for item in region_items if item.status == "DOWN"),
                "availability_pct": 100.0 if total_region == 0 else round((healthy_region / total_region) * 100.0, 2),
            }

        return SummaryResponse(
            total=total,
            up=up,
            down=down,
            degraded=degraded,
            availability_pct=availability,
            average_latency_ms=avg_latency,
            by_env=by_env,
            by_category=by_category,
            by_region=by_region,
        )

    async def get_sla(self):
        services = await self._config_store.get_services()
        return self._sla.get_sla_snapshot(services)

    async def get_services(self):
        return await self._config_store.get_services()

    async def get_alerts(self) -> list[AlertItem]:
        results = await self.get_latest_results()
        down_tools = [item for item in results if item.category == "tool" and item.status == "DOWN"]
        alerts: list[AlertItem] = []

        for tool in down_tools:
            alerts.append(
                AlertItem(
                    priority="high",
                    type="tool_down",
                    message=f"Infrastructure tool DOWN: {tool.name}",
                    env=tool.env,
                    region=tool.region,
                    impacted=[tool.name],
                )
            )

        grouped: dict[str, list[ServiceCheckResult]] = defaultdict(list)
        for tool in down_tools:
            grouped[f"{tool.env}:{tool.region}"].append(tool)

        for key, items in grouped.items():
            if len(items) < 2:
                continue
            env, region = key.split(":", 1)
            alerts.append(
                AlertItem(
                    priority="high",
                    type="infra_issue",
                    message=f"Possible infra issue in {env}/{region}: multiple tools failing",
                    env=env,
                    region=region,
                    impacted=[item.name for item in items],
                )
            )
        return alerts
