import asyncio
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Callable, Dict, List, Optional, Tuple

import aiohttp

from app.models.schemas import SmokeRunResult, SmokeStepResult, SmokeTestConfig


class SmokeManager:
    def __init__(self, history_size: int = 20) -> None:
        self._history: Dict[str, deque[SmokeRunResult]] = defaultdict(lambda: deque(maxlen=history_size))
        self._active_runs: Dict[str, SmokeRunResult] = {}
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @staticmethod
    def _key(brand: str, env: str, region: str) -> str:
        return f"{brand}:{env}:{region}"

    async def start_run_for(self, config: SmokeTestConfig, target_url: Optional[str] = None) -> SmokeRunResult:
        key = self._key(config.brand, config.env, config.region)
        if key in self._active_runs:
            return self._active_runs[key]
        asyncio.create_task(self.run_for(config, target_url=target_url))
        # Small yield so active run is visible to immediate /status polling.
        await asyncio.sleep(0)
        return self._active_runs.get(key) or SmokeRunResult(
            brand=config.brand,
            env=config.env,
            region=config.region,
            status="RUNNING",
            steps=[],
            total_time=0.0,
            failed_step=None,
            current_step="queued",
            target_url=target_url,
            debug_message="Queued for execution",
            timestamp=datetime.now(timezone.utc),
            run_id=f"queued-{uuid.uuid4()}",
        )

    async def run_for(self, config: SmokeTestConfig, target_url: Optional[str] = None) -> SmokeRunResult:
        key = self._key(config.brand, config.env, config.region)
        lock = self._locks[key]

        if key in self._active_runs:
            return self._active_runs[key]

        async with lock:
            if key in self._active_runs:
                return self._active_runs[key]

            run_id = str(uuid.uuid4())
            result = SmokeRunResult(
                brand=config.brand,
                env=config.env,
                region=config.region,
                status="RUNNING",
                steps=[],
                total_time=0.0,
                failed_step=None,
                current_step="starting",
                target_url=target_url,
                debug_message="Smoke run started",
                timestamp=datetime.now(timezone.utc),
                run_id=run_id,
            )
            self._active_runs[key] = result

            start_all = time.perf_counter()
            try:
                steps: List[Tuple[str, Callable]] = [
                    ("login", self._step_login),
                    ("search", self._step_search),
                    ("product_page", self._step_product_page),
                    ("add_to_cart", self._step_add_to_cart),
                    ("checkout", self._step_checkout),
                    ("address", self._step_address),
                    ("payment", self._step_payment),
                    ("confirmation", self._step_confirmation),
                ]

                timeout = aiohttp.ClientTimeout(total=config.request_timeout_seconds)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    for step_name, func in steps:
                        result.current_step = step_name
                        result.timestamp = datetime.now(timezone.utc)
                        step_result = await self._run_single_step(session, config, target_url, step_name, func)
                        result.steps.append(step_result)
                        if step_result.status == "FAIL":
                            result.status = "FAIL"
                            result.failed_step = step_name
                            result.debug_message = step_result.error or "Step failed"
                            break

                if result.status == "RUNNING":
                    result.status = "PASS"
                    result.debug_message = "All smoke steps passed"

            finally:
                result.total_time = round((time.perf_counter() - start_all) * 1000, 2)
                result.timestamp = datetime.now(timezone.utc)
                result.current_step = None
                self._history[key].appendleft(result)
                self._active_runs.pop(key, None)

            return result

    async def _run_single_step(
        self,
        session: aiohttp.ClientSession,
        config: SmokeTestConfig,
        target_url: Optional[str],
        step_name: str,
        func,
    ) -> SmokeStepResult:
        started = datetime.now(timezone.utc)
        start_perf = time.perf_counter()
        error: Optional[str] = None
        error_type: Optional[str] = None
        debug: Optional[str] = None
        request_url: Optional[str] = None
        http_status: Optional[int] = None
        response_excerpt: Optional[str] = None
        try:
            ok, detail = await func(session, config, target_url)
            status = "PASS" if ok else "FAIL"
            request_url = detail.get("url")
            http_status = detail.get("http_status")
            response_excerpt = detail.get("response_excerpt")
            debug = detail.get("debug")
            if status == "FAIL":
                error = detail.get("error") or "Step returned failure"
                error_type = detail.get("error_type")
        except Exception as exc:  # noqa: BLE001
            status = "FAIL"
            error = f"{type(exc).__name__}: {exc}"
            error_type = type(exc).__name__
        completed = datetime.now(timezone.utc)
        latency = round((time.perf_counter() - start_perf) * 1000, 2)
        return SmokeStepResult(
            step=step_name,
            status=status,
            latency=latency,
            request_url=request_url,
            http_status=http_status,
            started_at=started,
            completed_at=completed,
            response_excerpt=response_excerpt,
            error_type=error_type,
            debug=debug,
            error=error,
        )

    @staticmethod
    def _is_local_mock_target(base_url: str) -> bool:
        host = (urlparse(base_url).hostname or "").lower()
        return host in {"localhost", "127.0.0.1", "0.0.0.0"}

    @staticmethod
    def _build_step_url(base_url: str, live_path: str, mock_path: str) -> str:
        base = base_url.rstrip("/")
        if SmokeManager._is_local_mock_target(base):
            return f"{base}{mock_path}"
        return f"{base}{live_path}"

    @staticmethod
    def _build_configured_step_url(
        config: SmokeTestConfig,
        target_url: str,
        step_name: str,
        default_live_path: str,
        default_mock_path: str,
    ) -> str:
        configured_path = (config.step_paths or {}).get(step_name)
        if configured_path:
            return f"{target_url.rstrip('/')}/{configured_path.lstrip('/')}"
        return SmokeManager._build_step_url(target_url, default_live_path, default_mock_path)

    @staticmethod
    async def _request_step(
        session: aiohttp.ClientSession,
        config: SmokeTestConfig,
        method: str,
        url: str,
        payload: Optional[dict] = None,
    ) -> tuple[bool, dict]:
        kwargs = {"json": payload} if payload is not None else {}
        attempts = max(1, config.step_retry_count + 1)
        last_detail: dict = {}

        for attempt in range(1, attempts + 1):
            try:
                async with session.request(method, url, **kwargs) as resp:
                    body = await resp.text()
                    excerpt = body[:200] if body else ""
                    ok = 200 <= resp.status < 300
                    detail = {
                        "url": url,
                        "http_status": resp.status,
                        "response_excerpt": excerpt,
                        "debug": f"{method} {url} -> {resp.status} (attempt {attempt}/{attempts})",
                    }
                    if ok:
                        return True, detail
                    detail["error"] = f"HTTP {resp.status}"
                    detail["error_type"] = "http_5xx" if resp.status >= 500 else "http_error"
                    last_detail = detail
                    if resp.status < 500 or attempt == attempts:
                        return False, detail
            except Exception as exc:  # noqa: BLE001
                last_detail = {
                    "url": url,
                    "http_status": None,
                    "response_excerpt": None,
                    "debug": f"{method} {url} exception on attempt {attempt}/{attempts}",
                    "error": f"{type(exc).__name__}: {exc}",
                    "error_type": type(exc).__name__,
                }
                if attempt == attempts:
                    return False, last_detail

        return False, last_detail

    @staticmethod
    async def _step_login(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "login", "/account/login.html", "/smoke/login")
        return await SmokeManager._request_step(
            session,
            config,
            "POST",
            url,
            {"username": config.test_user.username, "password": config.test_user.password},
        )

    @staticmethod
    async def _step_search(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(
            config,
            base,
            "search",
            f"/search?q={config.product_search_term}",
            f"/smoke/search?q={config.product_search_term}",
        )
        return await SmokeManager._request_step(session, config, "GET", url)

    @staticmethod
    async def _step_product_page(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "product_page", "/product", "/smoke/product")
        return await SmokeManager._request_step(session, config, "GET", url)

    @staticmethod
    async def _step_add_to_cart(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "add_to_cart", "/cart", "/smoke/cart")
        return await SmokeManager._request_step(session, config, "POST", url, {"action": "add"})

    @staticmethod
    async def _step_checkout(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "checkout", "/checkout", "/smoke/checkout")
        return await SmokeManager._request_step(session, config, "POST", url, {"stage": "start"})

    @staticmethod
    async def _step_address(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "address", "/address", "/smoke/address")
        return await SmokeManager._request_step(session, config, "POST", url, config.address.model_dump())

    @staticmethod
    async def _step_payment(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "payment", "/payment", "/smoke/payment")
        return await SmokeManager._request_step(session, config, "POST", url, {"mode": "sandbox", "amount": 10.0})

    @staticmethod
    async def _step_confirmation(session: aiohttp.ClientSession, config: SmokeTestConfig, target_url: Optional[str]) -> tuple[bool, dict]:
        base = target_url or getattr(config, "vip_url", config.base_url)
        url = SmokeManager._build_configured_step_url(config, base, "confirmation", "/confirmation", "/smoke/confirmation")
        return await SmokeManager._request_step(session, config, "GET", url)

    def latest_results(self) -> list[SmokeRunResult]:
        items: list[SmokeRunResult] = []
        for runs in self._history.values():
            if runs:
                items.append(runs[0])
        items.extend(self._active_runs.values())
        items.sort(key=lambda r: r.timestamp, reverse=True)
        return items

    def history_for_brand(self, brand: str) -> list[SmokeRunResult]:
        items: list[SmokeRunResult] = []
        for key, runs in self._history.items():
            if not runs:
                continue
            b, _env, _region = key.split(":", 2)
            if b != brand:
                continue
            items.extend(runs)
        items.sort(key=lambda r: r.timestamp, reverse=True)
        return items

    def latest_failed_runs(self) -> list[SmokeRunResult]:
        return [run for run in self.latest_results() if run.status == "FAIL"]


smoke_manager = SmokeManager()

