import asyncio
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.models.schemas import SmokeRunResult, SmokeStepResult, SmokeTestConfig
from app.tests.smoke_runner import SmokeManager


class BrowserSmokeManager:
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
        await asyncio.sleep(0)
        return self._active_runs.get(key) or SmokeRunResult(
            brand=config.brand,
            env=config.env,
            region=config.region,
            mode="browser",
            status="RUNNING",
            steps=[],
            total_time=0.0,
            failed_step=None,
            current_step="queued",
            target_url=target_url,
            debug_message="Queued for browser execution",
            timestamp=datetime.now(timezone.utc),
            run_id=f"queued-browser-{uuid.uuid4()}",
        )

    async def run_for(self, config: SmokeTestConfig, target_url: Optional[str] = None) -> SmokeRunResult:
        key = self._key(config.brand, config.env, config.region)
        lock = self._locks[key]
        if key in self._active_runs:
            return self._active_runs[key]

        async with lock:
            if key in self._active_runs:
                return self._active_runs[key]

            run = SmokeRunResult(
                brand=config.brand,
                env=config.env,
                region=config.region,
                mode="browser",
                status="RUNNING",
                steps=[],
                total_time=0.0,
                failed_step=None,
                current_step="starting",
                target_url=target_url,
                debug_message="Browser smoke run started",
                timestamp=datetime.now(timezone.utc),
                run_id=str(uuid.uuid4()),
            )
            self._active_runs[key] = run
            started_all = time.perf_counter()

            try:
                try:
                    from playwright.async_api import async_playwright  # type: ignore
                except Exception as exc:  # noqa: BLE001
                    run.status = "FAIL"
                    run.failed_step = "login"
                    run.debug_message = f"Playwright unavailable: {type(exc).__name__}: {exc}"
                    run.steps.append(
                        SmokeStepResult(
                            step="login",
                            status="FAIL",
                            latency=0.0,
                            error=run.debug_message,
                            error_type=type(exc).__name__,
                        )
                    )
                    return run

                base = target_url or config.vip_url or config.base_url
                step_defs: List[Tuple[str, str, str]] = [
                    ("login", "/account/login.html", "/smoke/login"),
                    ("search", f"/search?q={config.product_search_term}", f"/smoke/search?q={config.product_search_term}"),
                    ("product_page", "/product", "/smoke/product"),
                    ("add_to_cart", "/cart", "/smoke/cart"),
                    ("checkout", "/checkout", "/smoke/checkout"),
                    ("address", "/address", "/smoke/address"),
                    ("payment", "/payment", "/smoke/payment"),
                    ("confirmation", "/confirmation", "/smoke/confirmation"),
                ]

                async with async_playwright() as pw:
                    browser = await pw.chromium.launch(headless=True)
                    context = await browser.new_context(ignore_https_errors=True)
                    page = await context.new_page()

                    for step_name, live_path, mock_path in step_defs:
                        run.current_step = step_name
                        run.timestamp = datetime.now(timezone.utc)

                        step_url = SmokeManager._build_configured_step_url(config, base, step_name, live_path, mock_path)
                        step_started = time.perf_counter()
                        started_at = datetime.now(timezone.utc)

                        try:
                            response = await page.goto(step_url, wait_until="domcontentloaded", timeout=int(config.request_timeout_seconds * 1000))
                            http_status = response.status if response else None
                            ok = http_status is not None and 200 <= http_status < 400
                            body = await page.content()
                            latency = round((time.perf_counter() - step_started) * 1000, 2)
                            step_result = SmokeStepResult(
                                step=step_name,
                                status="PASS" if ok else "FAIL",
                                latency=latency,
                                request_url=step_url,
                                http_status=http_status,
                                started_at=started_at,
                                completed_at=datetime.now(timezone.utc),
                                response_excerpt=(body or "")[:200],
                                debug=f"BROWSER GET {step_url} -> {http_status}",
                                error=None if ok else f"HTTP {http_status}",
                            )
                        except Exception as exc:  # noqa: BLE001
                            latency = round((time.perf_counter() - step_started) * 1000, 2)
                            step_result = SmokeStepResult(
                                step=step_name,
                                status="FAIL",
                                latency=latency,
                                request_url=step_url,
                                started_at=started_at,
                                completed_at=datetime.now(timezone.utc),
                                debug=f"BROWSER GET {step_url} failed",
                                error=f"{type(exc).__name__}: {exc}",
                                error_type=type(exc).__name__,
                            )

                        run.steps.append(step_result)
                        if step_result.status == "FAIL":
                            run.status = "FAIL"
                            run.failed_step = step_name
                            run.debug_message = step_result.error or "Browser step failed"
                            break

                    await context.close()
                    await browser.close()

                if run.status == "RUNNING":
                    run.status = "PASS"
                    run.debug_message = "All browser smoke steps passed"

            finally:
                run.total_time = round((time.perf_counter() - started_all) * 1000, 2)
                run.timestamp = datetime.now(timezone.utc)
                run.current_step = None
                self._history[key].appendleft(run)
                self._active_runs.pop(key, None)

            return run

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


browser_smoke_manager = BrowserSmokeManager()

