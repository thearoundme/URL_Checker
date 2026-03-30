import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Type

from pydantic import BaseModel, ValidationError
from app.models.schemas import KubernetesClusterConfig, PatchingGroupConfig, ServiceConfig, SmokeTestConfig, SmokeTestUser
from app.core.monitoring_config import monitoring_config_file
from app.core.settings import settings


class ServiceConfigStore:
    def __init__(self, config_dir: str) -> None:
        self._config_dir = Path(config_dir)
        self._services_vm_path = self._config_dir / settings.services_vm_file
        self._services_k8_path = self._config_dir / settings.services_k8_file
        self._services_tools_path = self._config_dir / settings.services_tools_file
        self._smoke_tests_path = self._config_dir / settings.smoke_tests_file
        self._smoke_users_path = self._config_dir / settings.smoke_users_file
        self._patching_tests_path = self._config_dir / settings.patching_tests_file
        self._kubernetes_monitoring_path = self._config_dir / settings.kubernetes_monitoring_file
        self._services: List[ServiceConfig] = []
        self._smoke_tests: List[SmokeTestConfig] = []
        self._patching_groups: List[PatchingGroupConfig] = []
        self._kubernetes_clusters: List[KubernetesClusterConfig] = []
        self._smoke_user_config: dict = {}
        self._mtimes: dict[str, float] = {}
        self._last_loaded_at: Optional[datetime] = None
        self._validation_issues: list[dict] = []
        self._entry_counts: dict[str, int] = {"services": 0, "smoke_tests": 0, "patching_groups": 0}
        self._lock = asyncio.Lock()

    async def load(self) -> List[ServiceConfig]:
        async with self._lock:
            await self._load_all_files()
            return list(self._services)

    async def get_services(self) -> List[ServiceConfig]:
        await self._reload_if_changed()
        return list(self._services)

    async def get_smoke_tests(self) -> List[SmokeTestConfig]:
        await self._reload_if_changed()
        return list(self._smoke_tests)

    async def get_patching_groups(self) -> List[PatchingGroupConfig]:
        await self._reload_if_changed()
        return list(self._patching_groups)

    async def resolve_smoke_user(self, brand: str, env: str) -> Optional[SmokeTestUser]:
        await self._reload_if_changed()
        return self._resolve_smoke_user_from_config(brand, env)

    async def get_config_meta(self) -> dict:
        await self._reload_if_changed()
        files = {
            "services_vm": self._services_vm_path,
            "services_k8": self._services_k8_path,
            "services_tools": self._services_tools_path,
            "smoke_tests": self._smoke_tests_path,
            "smoke_users": self._smoke_users_path,
            "patching_tests": self._patching_tests_path,
            "kubernetes_monitoring": self._kubernetes_monitoring_path,
        }
        file_info = {}
        for key, path in files.items():
            if not path.exists():
                file_info[key] = {"exists": False, "last_updated": None}
            else:
                ts = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
                file_info[key] = {"exists": True, "last_updated": ts}

        return {
            "last_loaded_at": self._last_loaded_at.isoformat() if self._last_loaded_at else None,
            "entry_counts": self._entry_counts,
            "validation_issue_count": len(self._validation_issues),
            "validation_issues": list(self._validation_issues[-50:]),
            "files": file_info,
            "monitoring": monitoring_config_file.meta(),
        }

    async def get_config_tree(self) -> dict:
        await self._reload_if_changed()
        files = {
            "services_vm.json": self._services_vm_path,
            "services_k8.json": self._services_k8_path,
            "services_tools.json": self._services_tools_path,
            "smoke_tests.json": self._smoke_tests_path,
            "service_smoketest_user.json": self._smoke_users_path,
            "patching_tests.json": self._patching_tests_path,
            "kubernetes_monitoring.json": self._kubernetes_monitoring_path,
            "runtime_settings.json": self._config_dir / settings.runtime_settings_file,
            "monitoring_settings.json": self._config_dir / settings.monitoring_settings_file,
        }
        tree: dict = {
            "last_loaded_at": self._last_loaded_at.isoformat() if self._last_loaded_at else None,
            "files": {},
        }
        for name, path in files.items():
            if not path.exists():
                tree["files"][name] = {
                    "exists": False,
                    "last_updated": None,
                    "data": None,
                }
                continue
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                last_updated = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
                tree["files"][name] = {
                    "exists": True,
                    "last_updated": last_updated,
                    "data": raw,
                }
            except Exception as exc:
                tree["files"][name] = {
                    "exists": True,
                    "last_updated": None,
                    "data": {"_error": f"Unable to parse JSON: {type(exc).__name__}"},
                }
        return tree

    async def _reload_if_changed(self) -> None:
        async with self._lock:
            current_mtimes = self._current_mtimes()
            same_keys = set(current_mtimes.keys()) == set(self._mtimes.keys())
            unchanged = all(
                current_mtimes.get(key, 0) <= self._mtimes.get(key, 0) for key in current_mtimes
            )
            if self._mtimes and same_keys and unchanged:
                return

            await self._load_all_files()

    def _current_mtimes(self) -> dict[str, float]:
        paths = {
            "vm": self._services_vm_path,
            "k8": self._services_k8_path,
            "tools": self._services_tools_path,
            "smoke": self._smoke_tests_path,
            "smoke_users": self._smoke_users_path,
            "patching": self._patching_tests_path,
            "kubernetes": self._kubernetes_monitoring_path,
        }
        mtimes: dict[str, float] = {}
        for key, path in paths.items():
            if path.exists():
                mtimes[key] = path.stat().st_mtime
        return mtimes

    async def _load_all_files(self) -> None:
        vm_raw = json.loads(self._services_vm_path.read_text(encoding="utf-8")) if self._services_vm_path.exists() else {}
        k8_raw = json.loads(self._services_k8_path.read_text(encoding="utf-8")) if self._services_k8_path.exists() else {}
        tools_raw = json.loads(self._services_tools_path.read_text(encoding="utf-8")) if self._services_tools_path.exists() else {}
        smoke_raw = json.loads(self._smoke_tests_path.read_text(encoding="utf-8")) if self._smoke_tests_path.exists() else {}
        smoke_users_raw = (
            json.loads(self._smoke_users_path.read_text(encoding="utf-8"))
            if self._smoke_users_path.exists()
            else {}
        )
        patching_raw = (
            json.loads(self._patching_tests_path.read_text(encoding="utf-8"))
            if self._patching_tests_path.exists()
            else {}
        )
        k8_monitoring_raw = (
            json.loads(self._kubernetes_monitoring_path.read_text(encoding="utf-8"))
            if self._kubernetes_monitoring_path.exists()
            else {}
        )

        merged_services = (
            vm_raw.get("services_vm", [])
            + k8_raw.get("services_k8", [])
            + tools_raw.get("services_tools", [])
        )

        issues: list[dict] = []
        self._services = self._parse_entries(ServiceConfig, merged_services, "services", issues)
        self._smoke_tests = self._parse_entries(SmokeTestConfig, smoke_raw.get("smoke_tests", []), "smoke_tests", issues)
        self._patching_groups = self._parse_entries(
            PatchingGroupConfig, patching_raw.get("patching_groups", []), "patching_groups", issues
        )
        self._kubernetes_clusters = self._parse_entries(
            KubernetesClusterConfig, k8_monitoring_raw.get("kubernetes_clusters", []), "kubernetes_clusters", issues
        )
        self._smoke_user_config = smoke_users_raw
        self._mtimes = self._current_mtimes()
        self._last_loaded_at = datetime.now(timezone.utc)
        self._validation_issues = issues
        self._entry_counts = {
            "services": len(self._services),
            "smoke_tests": len(self._smoke_tests),
            "patching_groups": len(self._patching_groups),
            "kubernetes_clusters": len(self._kubernetes_clusters),
        }

    async def get_kubernetes_clusters(self) -> List[KubernetesClusterConfig]:
        await self._reload_if_changed()
        return list(self._kubernetes_clusters)

    def _service_path_and_key(self, target: str) -> tuple[Path, str]:
        if target == "vm":
            return self._services_vm_path, "services_vm"
        if target == "k8":
            return self._services_k8_path, "services_k8"
        if target == "tools":
            return self._services_tools_path, "services_tools"
        raise ValueError(f"Invalid service target: {target}")

    async def append_service(self, target: str, payload: dict) -> ServiceConfig:
        model = ServiceConfig(**payload)
        path, arr_key = self._service_path_and_key(target)
        if target == "vm" and model.platform_normalized != "vm":
            raise ValueError("For target 'vm', service.platform must be vm")
        if target == "k8" and model.platform_normalized != "k8":
            raise ValueError("For target 'k8', service.platform must be k8")
        async with self._lock:
            await self._load_all_files()
            if any(s.name == model.name for s in self._services):
                raise ValueError(f"Service name already exists: {model.name}")
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get(arr_key, []))
            arr.append(json.loads(model.model_dump_json()))
            raw[arr_key] = arr
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def append_patching_group(self, payload: dict) -> PatchingGroupConfig:
        model = PatchingGroupConfig(**payload)
        path = self._patching_tests_path
        async with self._lock:
            await self._load_all_files()
            if any(g.name == model.name for g in self._patching_groups):
                raise ValueError(f"Patching group name already exists: {model.name}")
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get("patching_groups", []))
            arr.append(json.loads(model.model_dump_json()))
            raw["patching_groups"] = arr
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def append_kubernetes_cluster(self, payload: dict) -> KubernetesClusterConfig:
        model = KubernetesClusterConfig(**payload)
        path = self._kubernetes_monitoring_path
        async with self._lock:
            await self._load_all_files()
            if any(c.name == model.name for c in self._kubernetes_clusters):
                raise ValueError(f"Cluster name already exists: {model.name}")
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get("kubernetes_clusters", []))
            arr.append(json.loads(model.model_dump_json()))
            raw["kubernetes_clusters"] = arr
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def update_service(self, target: str, name: str, payload: dict) -> ServiceConfig:
        model = ServiceConfig(**payload)
        path, arr_key = self._service_path_and_key(target)
        if model.name != name:
            raise ValueError("Payload name must match URL name")
        if target == "vm" and model.platform_normalized != "vm":
            raise ValueError("For target 'vm', service.platform must be vm")
        if target == "k8" and model.platform_normalized != "k8":
            raise ValueError("For target 'k8', service.platform must be k8")
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get(arr_key, []))
            idx = next((i for i, x in enumerate(arr) if isinstance(x, dict) and x.get("name") == name), -1)
            if idx < 0:
                raise ValueError(f"Service not found: {name}")
            arr[idx] = json.loads(model.model_dump_json())
            raw[arr_key] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def delete_service(self, target: str, name: str) -> None:
        path, arr_key = self._service_path_and_key(target)
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = [x for x in raw.get(arr_key, []) if not (isinstance(x, dict) and x.get("name") == name)]
            if len(arr) == len(raw.get(arr_key, [])):
                raise ValueError(f"Service not found: {name}")
            raw[arr_key] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()

    async def update_patching_group(self, group_name: str, payload: dict) -> PatchingGroupConfig:
        model = PatchingGroupConfig(**payload)
        if model.name != group_name:
            raise ValueError("Payload name must match URL name")
        path = self._patching_tests_path
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get("patching_groups", []))
            idx = next((i for i, x in enumerate(arr) if isinstance(x, dict) and x.get("name") == group_name), -1)
            if idx < 0:
                raise ValueError(f"Patching group not found: {group_name}")
            arr[idx] = json.loads(model.model_dump_json())
            raw["patching_groups"] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def delete_patching_group(self, group_name: str) -> None:
        path = self._patching_tests_path
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = [x for x in raw.get("patching_groups", []) if not (isinstance(x, dict) and x.get("name") == group_name)]
            if len(arr) == len(raw.get("patching_groups", [])):
                raise ValueError(f"Patching group not found: {group_name}")
            raw["patching_groups"] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()

    async def update_kubernetes_cluster(self, cluster_name: str, payload: dict) -> KubernetesClusterConfig:
        model = KubernetesClusterConfig(**payload)
        if model.name != cluster_name:
            raise ValueError("Payload name must match URL name")
        path = self._kubernetes_monitoring_path
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = list(raw.get("kubernetes_clusters", []))
            idx = next((i for i, x in enumerate(arr) if isinstance(x, dict) and x.get("name") == cluster_name), -1)
            if idx < 0:
                raise ValueError(f"Cluster not found: {cluster_name}")
            arr[idx] = json.loads(model.model_dump_json())
            raw["kubernetes_clusters"] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()
        return model

    async def delete_kubernetes_cluster(self, cluster_name: str) -> None:
        path = self._kubernetes_monitoring_path
        async with self._lock:
            await self._load_all_files()
            raw: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
            arr = [x for x in raw.get("kubernetes_clusters", []) if not (isinstance(x, dict) and x.get("name") == cluster_name)]
            if len(arr) == len(raw.get("kubernetes_clusters", [])):
                raise ValueError(f"Cluster not found: {cluster_name}")
            raw["kubernetes_clusters"] = arr
            path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
            await self._load_all_files()

    @staticmethod
    def _parse_entries(
        model: Type[BaseModel], entries: list, source: str, issues: list[dict]
    ) -> list:
        parsed = []
        for idx, entry in enumerate(entries):
            try:
                parsed.append(model(**entry))
            except ValidationError as exc:
                issues.append(
                    {
                        "source": source,
                        "index": idx,
                        "error": exc.errors(),
                    }
                )
        return parsed

    def _resolve_smoke_user_from_config(self, brand: str, env: str) -> Optional[SmokeTestUser]:
        config = self._smoke_user_config or {}
        env_aliases = {str(k).lower(): str(v).lower() for k, v in config.get("env_aliases", {}).items()}
        normalized_env = env_aliases.get(env.lower(), env.lower())
        normalized_brand = self._normalize_brand(brand)

        for entry in config.get("brand_user_map", []):
            entry_brand = self._normalize_brand(str(entry.get("brand", "")))
            if entry_brand != normalized_brand:
                continue
            users_by_env = entry.get("users_by_env", {})
            candidate = users_by_env.get(normalized_env)
            if candidate:
                user = self._to_smoke_user(candidate)
                if user:
                    return user

        default_user = config.get("default_user")
        if default_user:
            return self._to_smoke_user(default_user)
        return None

    @staticmethod
    def _to_smoke_user(raw_user: dict) -> Optional[SmokeTestUser]:
        username = raw_user.get("username") or raw_user.get("email")
        password = raw_user.get("password")
        if not username or not password:
            return None
        return SmokeTestUser(username=str(username), password=str(password))

    @staticmethod
    def _normalize_brand(value: str) -> str:
        # Handles WS_US, WS US, ws-us as same brand key.
        return re.sub(r"[^A-Za-z0-9]", "", value).upper()
