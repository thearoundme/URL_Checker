import logging
from dataclasses import dataclass
from typing import Literal, Optional

from fastapi import Header, HTTPException, Request

from app.core.permissions import WILDCARD, has_permission
from app.core.runtime_settings import runtime_settings_manager
from app.core.security import _resolve_client_id, rate_limiter
from app.core.settings import settings
from app.core.user_store import user_store

logger = logging.getLogger("url_check.auth")


@dataclass
class Principal:
    kind: Literal["jwt", "api_key"]
    username: str
    role: str
    permissions: list[str]
    client_id: str


async def resolve_principal(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_api_key: Optional[str] = Header(default=None),
) -> Principal:
    # Prefer JWT when present so browser sessions are not overridden by a static dev API key.
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if not token:
            raise HTTPException(status_code=401, detail="Missing bearer token")
        claims = user_store.decode_token(token)
        if not claims:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        sub = claims.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid token subject")
        user = user_store.get_by_username(str(sub))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        client_id = _resolve_client_id(request)
        return Principal(
            kind="jwt",
            username=user.username,
            role=user.role,
            permissions=user.permissions,
            client_id=client_id,
        )

    runtime = runtime_settings_manager.get()
    keys = [k for k in runtime.get("api_keys", []) if k]
    if keys and x_api_key and x_api_key in keys:
        client_id = _resolve_client_id(request)
        return Principal(
            kind="api_key",
            username="api-key",
            role="service",
            permissions=[WILDCARD],
            client_id=client_id,
        )

    raise HTTPException(status_code=401, detail="Authentication required")


async def _apply_rate_limit(request: Request, principal: Principal) -> None:
    runtime = runtime_settings_manager.get()
    scope = f"{request.url.path}:{principal.username}:{principal.client_id}"
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


def require_permission(perm: str):
    async def _dep(
        request: Request,
        authorization: Optional[str] = Header(default=None),
        x_api_key: Optional[str] = Header(default=None),
    ) -> Principal:
        p = await resolve_principal(request, authorization, x_api_key)
        if not has_permission(p.role, p.permissions, perm):
            raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")
        await _apply_rate_limit(request, p)
        return p

    return _dep


def require_authenticated():
    async def _dep(
        request: Request,
        authorization: Optional[str] = Header(default=None),
        x_api_key: Optional[str] = Header(default=None),
    ) -> Principal:
        p = await resolve_principal(request, authorization, x_api_key)
        await _apply_rate_limit(request, p)
        return p

    return _dep


def principal_to_audit_actor(p: Principal) -> tuple[str, str]:
    return p.username, p.role


def require_admin_or_permission(perm: str):
    from app.core.security import require_admin_access

    async def _dep(
        request: Request,
        authorization: Optional[str] = Header(default=None),
        x_api_key: Optional[str] = Header(default=None),
        x_admin_token: Optional[str] = Header(default=None),
    ) -> Principal:
        try:
            p = await resolve_principal(request, authorization, x_api_key)
            if has_permission(p.role, p.permissions, perm):
                await _apply_rate_limit(request, p)
                return p
        except HTTPException as e:
            if e.status_code != 401:
                raise
        try:
            ctx = await require_admin_access(request, x_api_key, x_admin_token)
        except HTTPException as exc:
            raise HTTPException(status_code=403, detail=f"Missing permission: {perm}") from exc
        return Principal(
            kind="jwt",
            username="legacy-admin",
            role="admin",
            permissions=[WILDCARD],
            client_id=ctx.client_id,
        )

    return _dep
