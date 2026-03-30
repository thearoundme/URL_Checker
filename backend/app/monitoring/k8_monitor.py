import asyncio
import time
from datetime import datetime, timezone

import aiohttp

from app.models.schemas import KubernetesClusterCheck, KubernetesClusterConfig, KubernetesOverview


class KubernetesMonitor:
    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self._timeout = aiohttp.ClientTimeout(total=timeout_seconds)

    async def _probe(self, session: aiohttp.ClientSession, url: str, token: str | None = None) -> dict:
        started = time.perf_counter()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            async with session.get(url, headers=headers, ssl=False) as resp:
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                ok = 200 <= resp.status < 300
                return {
                    "url": url,
                    "status_code": resp.status,
                    "ok": ok,
                    "latency_ms": latency_ms,
                    "error": None if ok else f"HTTP {resp.status}",
                }
        except Exception as exc:  # noqa: BLE001
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            return {
                "url": url,
                "status_code": None,
                "ok": False,
                "latency_ms": latency_ms,
                "error": f"{type(exc).__name__}: {exc}",
            }

    async def check_cluster(self, cluster: KubernetesClusterConfig) -> KubernetesClusterCheck:
        urls: list[str] = []
        if cluster.api_server_url:
            base = cluster.api_server_url.rstrip("/")
            urls.append(f"{base}/readyz" if not base.endswith("/readyz") else base)
        if cluster.metrics_url:
            urls.append(cluster.metrics_url)
        urls.extend(cluster.health_urls or [])
        urls.extend(cluster.ingress_urls or [])

        if not urls:
            return KubernetesClusterCheck(
                name=cluster.name,
                environment=cluster.environment,
                region=cluster.region,
                status="DOWN",
                checks_total=0,
                checks_failed=0,
                average_latency_ms=0.0,
                timestamp=datetime.now(timezone.utc),
                details={"error": "No URLs configured"},
            )

        async with aiohttp.ClientSession(timeout=self._timeout) as session:
            probes = await asyncio.gather(*(self._probe(session, url, cluster.bearer_token) for url in urls))

        total = len(probes)
        failed = sum(1 for p in probes if not p["ok"])
        avg_latency = round(sum(p["latency_ms"] for p in probes) / total, 2) if total else 0.0
        if failed == 0:
            status = "UP"
        elif failed < total:
            status = "DEGRADED"
        else:
            status = "DOWN"

        return KubernetesClusterCheck(
            name=cluster.name,
            environment=cluster.environment,
            region=cluster.region,
            status=status,
            checks_total=total,
            checks_failed=failed,
            average_latency_ms=avg_latency,
            timestamp=datetime.now(timezone.utc),
            details={"probes": probes},
        )

    async def check_all(self, clusters: list[KubernetesClusterConfig]) -> list[KubernetesClusterCheck]:
        results = await asyncio.gather(*(self.check_cluster(c) for c in clusters))
        return sorted(results, key=lambda r: (r.status != "DOWN", r.name))

    @staticmethod
    def summarize(results: list[KubernetesClusterCheck]) -> KubernetesOverview:
        total = len(results)
        up = sum(1 for r in results if r.status == "UP")
        degraded = sum(1 for r in results if r.status == "DEGRADED")
        down = sum(1 for r in results if r.status == "DOWN")
        avail = 100.0 if total == 0 else round(((up + degraded) / total) * 100.0, 2)
        return KubernetesOverview(
            total_clusters=total,
            up=up,
            degraded=degraded,
            down=down,
            availability_pct=avail,
        )

