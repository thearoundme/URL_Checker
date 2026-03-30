import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import aiohttp

from app.models.schemas import ServiceCheckResult, ServiceConfig


@dataclass
class RawCheck:
    is_success: bool
    status_code: Optional[int]
    latency_ms: float
    body: str
    error_message: Optional[str] = None


class ServiceChecker:
    def __init__(
        self,
        timeout_seconds: float,
        retry_count: int,
        max_connections: int,
        max_keepalive_connections: int,
    ) -> None:
        self._timeout_seconds = timeout_seconds
        self._retry_count = retry_count
        self._timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        self._session: aiohttp.ClientSession | None = None
        self._connector = aiohttp.TCPConnector(
            limit=max_connections,
            limit_per_host=max(10, max_connections // 20),
            keepalive_timeout=30,
        )

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                connector=self._connector,
                raise_for_status=False,
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def check(self, service: ServiceConfig) -> RawCheck:
        session = await self._get_session()
        for attempt in range(self._retry_count + 1):
            try:
                start = time.perf_counter()
                async with session.get(service.url) as response:
                    body = await response.text()
                    latency = (time.perf_counter() - start) * 1000
                    return RawCheck(
                        is_success=self._validate_response(service, response.status, body),
                        status_code=response.status,
                        latency_ms=round(latency, 2),
                        body=body,
                    )
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                if attempt >= self._retry_count:
                    return RawCheck(
                        is_success=False,
                        status_code=None,
                        latency_ms=0.0,
                        body="",
                        error_message=f"{type(exc).__name__}: {str(exc)}",
                    )
                await asyncio.sleep(0.2 * (attempt + 1))

        return RawCheck(is_success=False, status_code=None, latency_ms=0.0, body="", error_message="Unknown error")

    @staticmethod
    def _validate_response(service: ServiceConfig, status_code: int, body: str) -> bool:
        if service.type == "https":
            return 200 <= status_code < 300
        if service.type == "tomcat":
            keyword = service.keyword or "running"
            return (200 <= status_code < 300) and (keyword.lower() in body.lower())
        if service.type == "heartbeat":
            expected = service.expected_response or "UP"
            return (200 <= status_code < 300) and (expected.lower() in body.lower())
        return False


def classify_status(is_success: bool, latency_ms: float, threshold_ms: float) -> str:
    if not is_success:
        return "DOWN"
    if latency_ms > threshold_ms:
        return "DEGRADED"
    return "UP"


def to_result(service: ServiceConfig, status: str, latency_ms: float, error_message: Optional[str]) -> ServiceCheckResult:
    return ServiceCheckResult(
        name=service.name,
        app_version=service.app_version,
        env=service.env,
        region=service.region,
        platform=service.platform_normalized,  # type: ignore[arg-type]
        category=service.category,
        critical=service.critical,
        status=status,  # type: ignore[arg-type]
        latency_ms=latency_ms,
        timestamp=datetime.now(timezone.utc),
        url=service.url,
        error_message=error_message,
    )
