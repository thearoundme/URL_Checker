from fastapi import APIRouter, Depends

from app.core.auth_rbac import Principal, require_authenticated
from app.models.schemas import LoginRequest, LoginResponse, UserPublic
from app.core.user_store import user_store

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    user = await user_store.authenticate(body.username, body.password)
    if not user:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = user_store.issue_token(user)
    pub = user.to_public()
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserPublic(**pub),
    )


@router.get("/auth/me", response_model=UserPublic)
async def me(auth: Principal = Depends(require_authenticated())):
    u = user_store.get_by_username(auth.username)
    if not u:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="User not found")
    return UserPublic(**u.to_public())
