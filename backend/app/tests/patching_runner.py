from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict
import time
import aiohttp

from app.models.schemas import (
    PatchingCheckResult,
    PatchingGroupConfig,
    PatchingRunResult,
    ServiceConfig,
)
from app.monitoring.engine import MonitoringEngine


class PatchingManager:
    def __init__(self, history_size: int = 20) -> None:
        self._history: Dict[str, deque[PatchingRunResult]] = defaultdict(lambda: deque(maxlen=history_size))

    @staticmethod
    def _matches(service: ServiceConfig, group: PatchingGroupConfig) -> bool:
        if service.category != group.targets.category:
            return False
        if service.platform.lower() != group.targets.platform.lower():
            return False
        if group.targets.region and service.region != group.targets.region:
            return False
        return True

    async def run_group(
        self,
        group: PatchingGroupConfig,
        services: list[ServiceConfig],
        engine: MonitoringEngine,
        selected_services: list[str] | None = None,
    ) -> PatchingRunResult:
        selected_set = set(selected_services or [])
        targets = [s for s in services if self._matches(s, group)]
        if selected_set:
            targets = [s for s in targets if s.name in selected_set]
        started = datetime.now(timezone.utc)

        results: list[PatchingCheckResult] = []
        failed_hosts: list[str] = []

        for service in targets:
            checked = await engine.recheck_services([service])
            current = checked[0]
            httpd_status = "N/A"
            tomcat_status = "N/A"
            url_status = "N/A"
            error_messages: list[str] = []

            if "httpd" in group.checks:
                httpd_url = service.heartbeat_url or service.url
                httpd_ok, httpd_error = await self._probe_url(httpd_url)
                httpd_status = "UP" if httpd_ok else "DOWN"
                if httpd_error:
                    error_messages.append(f"httpd: {httpd_error}")
            if "tomcat" in group.checks:
                tomcat_url = service.summary_url or service.url
                tomcat_ok, tomcat_error = await self._probe_url(tomcat_url)
                tomcat_status = "UP" if tomcat_ok else "DOWN"
                if tomcat_error:
                    error_messages.append(f"tomcat: {tomcat_error}")
            if "url" in group.checks:
                url_status = current.status

            failed = (
                (httpd_status == "DOWN")
                or (tomcat_status == "DOWN")
                or (url_status == "DOWN")
            )
            if failed:
                failed_hosts.append(service.name)

            results.append(
                PatchingCheckResult(
                    service=service.name,
                    env=service.env,
                    region=service.region,
                    httpd=httpd_status,  # type: ignore[arg-type]
                    tomcat=tomcat_status,  # type: ignore[arg-type]
                    url_status=url_status,  # type: ignore[arg-type]
                    latency_ms=current.latency_ms,
                    timestamp=current.timestamp,
                    error_message=" | ".join(error_messages) or current.error_message,
                )
            )

        completed = datetime.now(timezone.utc)
        run_result = PatchingRunResult(
            group=group.name,
            description=group.description,
            status="FAIL" if failed_hosts else "PASS",
            started_at=started,
            completed_at=completed,
            failed_hosts=failed_hosts,
            results=results,
        )
        self._history[group.name].appendleft(run_result)
        return run_result

    @staticmethod
    async def _probe_url(url: str) -> tuple[bool, str | None]:
        started = time.perf_counter()
        timeout = aiohttp.ClientTimeout(total=5.0)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if 200 <= response.status < 300:
                        return True, None
                    elapsed = round((time.perf_counter() - started) * 1000, 2)
                    return False, f"status={response.status}, latency_ms={elapsed}"
        except Exception as exc:  # noqa: BLE001
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            return False, f"{type(exc).__name__}: {exc}, latency_ms={elapsed}"

    def latest_status(self) -> dict[str, PatchingRunResult]:
        return {group: runs[0] for group, runs in self._history.items() if runs}

    def history(self, group: str) -> list[PatchingRunResult]:
        return list(self._history.get(group, []))


patching_manager = PatchingManager()

