from fastapi import APIRouter, Depends, HTTPException

from app.core.auth_rbac import Principal, require_admin_or_permission
from app.core.permissions import PERM_USERS_MANAGE
from app.models.schemas import UserCreateBody, UserPublic, UserUpdateBody
from app.core.user_store import user_store

router = APIRouter(tags=["users"])


@router.get("/admin/users", response_model=list[UserPublic])
async def list_users(_auth: Principal = Depends(require_admin_or_permission(PERM_USERS_MANAGE))):
    return [UserPublic(**u) for u in user_store.list_public()]


@router.post("/admin/users", response_model=UserPublic)
async def create_user(
    body: UserCreateBody,
    _auth: Principal = Depends(require_admin_or_permission(PERM_USERS_MANAGE)),
):
    try:
        rec = await user_store.upsert_user(
            body.username,
            body.password,
            body.display_name or body.username,
            body.role,
            body.permissions,
            allow_create=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return UserPublic(**rec.to_public())


@router.put("/admin/users/{username}", response_model=UserPublic)
async def update_user(
    username: str,
    body: UserUpdateBody,
    _auth: Principal = Depends(require_admin_or_permission(PERM_USERS_MANAGE)),
):
    existing = user_store.get_by_username(username)
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        rec = await user_store.upsert_user(
            username,
            body.password,
            body.display_name if body.display_name is not None else existing.display_name,
            body.role if body.role is not None else existing.role,
            body.permissions if body.permissions is not None else existing.permissions,
            allow_create=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return UserPublic(**rec.to_public())


@router.delete("/admin/users/{username}")
async def delete_user(
    username: str,
    _auth: Principal = Depends(require_admin_or_permission(PERM_USERS_MANAGE)),
):
    try:
        await user_store.delete_user(username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}
