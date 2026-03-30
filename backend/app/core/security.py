import asyncio
from datetime import datetime, timezone
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
import secrets
from typing import Union

from fastapi import Header, HTTPException, Request

from app.core.settings import settings
from app.core.runtime_settings import runtime_settings_manager

logger = logging.getLogger("url_check.security")


@dataclass
class AuthContext:
    api_key: str
    client_id: str
    role: str = "operator"


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, scope_key: str, window_seconds: int, max_requests: int) -> tuple[bool, int]:
        now = time.time()
        async with self._lock:
            dq = self._events[scope_key]
            while dq and (now - dq[0]) > window_seconds:
                dq.popleft()
            if len(dq) >= max_requests:
                retry_after = max(1, int(window_seconds - (now - dq[0])))
                return False, retry_after
            dq.append(now)
            return True, 0


rate_limiter = InMemoryRateLimiter()
audit_events: deque[dict] = deque(maxlen=1000)
audit_path = Path(settings.config_dir) / settings.audit_log_file
audit_path.parent.mkdir(parents=True, exist_ok=True)
admin_tokens: dict[str, float] = {}
ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60


def _resolve_client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def require_protected_access(
    request: Request,
    x_api_key: str | None = Header(default=None),
) -> AuthContext:
    runtime = runtime_settings_manager.get()
    keys = [k for k in runtime.get("api_keys", []) if k]
    if keys and (not x_api_key or x_api_key not in keys):
        raise HTTPException(status_code=401, detail="Invalid API key")

    client_id = _resolve_client_id(request)
    scope = f"{request.url.path}:{x_api_key or 'anon'}:{client_id}"
    allowed, retry_after = await rate_limiter.check(
        scope,
        int(runtime.get("rate_limit_window_seconds", settings.rate_limit_window_seconds)),
        int(runtime.get("rate_limit_max_requests", settings.rate_limit_max_requests)),
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Retry in {retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )
    return AuthContext(api_key=x_api_key or "anon", client_id=client_id, role="operator")


def issue_admin_token(username: str) -> tuple[str, int]:
    token = secrets.token_urlsafe(32)
    admin_tokens[token] = time.time() + ADMIN_TOKEN_TTL_SECONDS
    return token, ADMIN_TOKEN_TTL_SECONDS


def _is_valid_admin_token(token: str | None) -> bool:
    if not token:
        return False
    expiry = admin_tokens.get(token)
    if not expiry:
        return False
    if time.time() > expiry:
        admin_tokens.pop(token, None)
        return False
    return True


async def require_admin_access(
    request: Request,
    x_api_key: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> AuthContext:
    runtime = runtime_settings_manager.get()
    client_id = _resolve_client_id(request)

    # Admin token path
    if _is_valid_admin_token(x_admin_token):
        scope = f"admin:{request.url.path}:{client_id}"
        allowed, retry_after = await rate_limiter.check(
            scope,
            int(runtime.get("rate_limit_window_seconds", settings.rate_limit_window_seconds)),
            int(runtime.get("rate_limit_max_requests", settings.rate_limit_max_requests)),
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Retry in {retry_after}s",
                headers={"Retry-After": str(retry_after)},
            )
        return AuthContext(api_key="admin-token", client_id=client_id, role="admin")

    # Admin API key path
    admin_keys = [k for k in runtime.get("admin_api_keys", []) if k]
    if not x_api_key or x_api_key not in admin_keys:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    scope = f"admin:{request.url.path}:{x_api_key}:{client_id}"
    allowed, retry_after = await rate_limiter.check(
        scope,
        int(runtime.get("rate_limit_window_seconds", settings.rate_limit_window_seconds)),
        int(runtime.get("rate_limit_max_requests", settings.rate_limit_max_requests)),
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Retry in {retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )
    return AuthContext(api_key=x_api_key, client_id=client_id, role="admin")


def audit_log(
    action: str,
    auth: Union["AuthContext", "Principal"],
    status: str,
    detail: str | None = None,
    snapshot: dict | None = None,
) -> None:
    from app.core.auth_rbac import Principal

    if isinstance(auth, Principal):
        actor = auth.username
        api_key_field = f"jwt:{auth.username}"
        role = auth.role
        client = auth.client_id
    else:
        actor = auth.api_key
        api_key_field = auth.api_key
        role = auth.role
        client = auth.client_id
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "status": status,
        "api_key": api_key_field,
        "client": client,
        "role": role,
        "actor": actor,
        "detail": detail or "-",
        "snapshot": snapshot or {},
    }
    audit_events.appendleft(event)
    try:
        with audit_path.open("a", encoding="utf-8") as f:
            f.write(
                f"{event['timestamp']} action={event['action']} status={event['status']} "
                f"api_key={event['api_key']} role={event['role']} client={event['client']} detail={event['detail']} snapshot={event['snapshot']}\n"
            )
    except Exception:
        pass
    logger.info(
        "audit action=%s status=%s actor=%s client=%s detail=%s",
        action,
        status,
        actor,
        client,
        detail or "-",
    )


def get_recent_audit(limit: int = 100) -> list[dict]:
    return list(list(audit_events)[: max(1, min(limit, 1000))])

