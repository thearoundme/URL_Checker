import asyncio
import json
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import bcrypt as bcrypt_lib
from jose import JWTError, jwt as jose_jwt

from app.core.permissions import DEFAULT_USER_PERMISSIONS, WILDCARD
from app.core.settings import settings

JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24


def _hash_password(plain: str) -> str:
    return bcrypt_lib.hashpw(plain.encode("utf-8"), bcrypt_lib.gensalt()).decode("ascii")


def _verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt_lib.checkpw(plain.encode("utf-8"), password_hash.encode("ascii"))
    except Exception:
        return False


@dataclass
class UserRecord:
    username: str
    password_hash: str
    display_name: str
    role: str
    permissions: list[str]

    def to_public(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
            "permissions": list(self.permissions),
        }


class UserStore:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = asyncio.Lock()
        self._jwt_secret: str = ""
        self._users: dict[str, UserRecord] = {}

    async def load(self) -> None:
        async with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            if not self._path.exists():
                self._bootstrap_default_file()
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            self._jwt_secret = str(raw.get("jwt_secret") or "").strip()
            if not self._jwt_secret:
                self._jwt_secret = secrets.token_urlsafe(48)
                raw["jwt_secret"] = self._jwt_secret
                self._path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            self._users = {}
            for u in raw.get("users", []):
                rec = UserRecord(
                    username=str(u["username"]),
                    password_hash=str(u["password_hash"]),
                    display_name=str(u.get("display_name") or u["username"]),
                    role=str(u.get("role") or "user"),
                    permissions=list(u.get("permissions") or []),
                )
                self._users[rec.username.lower()] = rec

    def _bootstrap_default_file(self) -> None:
        secret = secrets.token_urlsafe(48)
        users: list[dict[str, Any]] = []
        users.append(
            {
                "username": "admin",
                "password_hash": _hash_password("admin"),
                "display_name": "Administrator",
                "role": "admin",
                "permissions": [WILDCARD],
            }
        )
        for i in range(1, 6):
            uname = f"user{i}"
            users.append(
                {
                    "username": uname,
                    "password_hash": _hash_password(uname),
                    "display_name": f"User {i}",
                    "role": "user",
                    "permissions": DEFAULT_USER_PERMISSIONS,
                }
            )
        payload = {"jwt_secret": secret, "users": users}
        self._path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    async def _save_unlocked(self) -> None:
        raw = {
            "jwt_secret": self._jwt_secret,
            "users": [
                {
                    "username": u.username,
                    "password_hash": u.password_hash,
                    "display_name": u.display_name,
                    "role": u.role,
                    "permissions": u.permissions,
                }
                for u in sorted(self._users.values(), key=lambda x: x.username.lower())
            ],
        }
        self._path.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    def get_by_username(self, username: str) -> Optional[UserRecord]:
        return self._users.get(username.lower())

    def verify_password(self, user: UserRecord, password: str) -> bool:
        return _verify_password(password, user.password_hash)

    def issue_token(self, user: UserRecord) -> str:
        claims: dict[str, Any] = {
            "sub": user.username,
            "role": user.role,
            "perms": user.permissions,
            "name": user.display_name,
        }
        claims["exp"] = int(time.time()) + JWT_EXPIRE_HOURS * 3600
        return jose_jwt.encode(claims, self._jwt_secret, algorithm=JWT_ALG)

    def decode_token(self, token: str) -> Optional[dict[str, Any]]:
        try:
            return jose_jwt.decode(token, self._jwt_secret, algorithms=[JWT_ALG])
        except JWTError:
            return None

    async def authenticate(self, username: str, password: str) -> Optional[UserRecord]:
        await self.load()
        user = self.get_by_username(username)
        if not user or not self.verify_password(user, password):
            return None
        return user

    def list_public(self) -> list[dict[str, Any]]:
        return [u.to_public() for u in sorted(self._users.values(), key=lambda x: x.username.lower())]

    async def upsert_user(
        self,
        username: str,
        password: Optional[str],
        display_name: str,
        role: str,
        permissions: list[str],
        allow_create: bool,
    ) -> UserRecord:
        async with self._lock:
            key = username.lower()
            existing = self._users.get(key)
            if not existing and not allow_create:
                raise ValueError("User not found")
            if not existing:
                if not password:
                    raise ValueError("Password required for new user")
                pwd_hash = _hash_password(password)
            else:
                pwd_hash = _hash_password(password) if password else existing.password_hash
            rec = UserRecord(
                username=username.strip(),
                password_hash=pwd_hash,
                display_name=display_name.strip() or username,
                role=role,
                permissions=list(permissions),
            )
            self._users[rec.username.lower()] = rec
            await self._save_unlocked()
            return rec

    async def delete_user(self, username: str) -> None:
        async with self._lock:
            key = username.lower()
            if key not in self._users:
                raise ValueError("User not found")
            if self._users[key].role == "admin" and sum(1 for u in self._users.values() if u.role == "admin") <= 1:
                raise ValueError("Cannot delete the last admin user")
            del self._users[key]
            await self._save_unlocked()


user_store = UserStore(Path(settings.config_dir) / settings.users_file)
