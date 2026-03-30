import asyncio
import contextlib
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.api.auth_routes import router as auth_router
from app.api.routes import router
from app.api.users_routes import router as users_router
from app.core.config_loader import ServiceConfigStore
from app.core.runtime_settings import runtime_settings_manager
from app.core.user_store import user_store
from app.core.settings import settings
from app.monitoring.engine import MonitoringEngine
from app.monitoring.runtime_cache import RuntimeCache
from app.tests.smoke_runner import smoke_manager

config_store = ServiceConfigStore(settings.config_dir)
monitoring_engine = MonitoringEngine(config_store)
runtime_cache = RuntimeCache(config_store)
monitoring_task: asyncio.Task | None = None
flaky_counters: dict[str, int] = defaultdict(int)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global monitoring_task
    await user_store.load()
    await config_store.load()
    await monitoring_engine.run_once()
    await runtime_cache.start()
    monitoring_task = asyncio.create_task(monitoring_engine.run_forever())
    try:
        yield
    finally:
        if monitoring_task:
            monitoring_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await monitoring_task
        await runtime_cache.stop()
        await monitoring_engine.close()


app = FastAPI(title="URL Check", lifespan=lifespan)
_cors_origins = runtime_settings_manager.get().get("allowed_origins") or settings.allowed_origins
if not _cors_origins:
    _cors_origins = settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_cors_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {
        "service": "url-check",
        "phase": "phase-1",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/mock/up")
async def mock_up():
    return {"status": "UP"}


@app.get("/mock/tomcat/running")
async def mock_tomcat_running():
    return Response(content="tomcat running", media_type="text/plain")


@app.get("/mock/heartbeat")
async def mock_heartbeat(value: str = "UP"):
    return Response(content=f"heartbeat={value}", media_type="text/plain")


@app.get("/mock/slow")
async def mock_slow(ms: int = 1200):
    await asyncio.sleep(max(ms, 1) / 1000)
    return {"status": "UP", "delay_ms": ms}


@app.get("/mock/down")
async def mock_down():
    return Response(content='{"status":"DOWN"}', status_code=503, media_type="application/json")


@app.get("/mock/flaky/{service_key}")
async def mock_flaky(service_key: str):
    flaky_counters[service_key] += 1
    # Alternates success/failure to emulate intermittent outages.
    if flaky_counters[service_key] % 2 == 0:
        return Response(content='{"status":"DOWN"}', status_code=503, media_type="application/json")
    return {"status": "UP", "service_key": service_key}


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# --- Mock e-commerce endpoints for synthetic smoke tests (sandbox only) ---

@app.post("/smoke/login")
async def smoke_login():
    await asyncio.sleep(0.05)
    return {"status": "ok"}


@app.get("/smoke/search")
async def smoke_search():
    await asyncio.sleep(0.05)
    return {"results": ["product-1", "product-2"]}


@app.get("/smoke/product")
async def smoke_product():
    await asyncio.sleep(0.05)
    return {"id": "product-1", "name": "Sample Product"}


@app.post("/smoke/cart")
async def smoke_cart():
    await asyncio.sleep(0.05)
    return {"cart_id": "cart-123", "items": 1}


@app.post("/smoke/checkout")
async def smoke_checkout():
    await asyncio.sleep(0.05)
    return {"checkout_id": "chk-123"}


@app.post("/smoke/address")
async def smoke_address():
    await asyncio.sleep(0.05)
    return {"status": "ok"}


@app.post("/smoke/payment")
async def smoke_payment():
    await asyncio.sleep(0.05)
    return {"status": "sandbox_approved"}


@app.get("/smoke/confirmation")
async def smoke_confirmation():
    await asyncio.sleep(0.05)
    return {"status": "confirmed", "order_id": "order-123"}
