from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError

from app.core.auth_rbac import Principal, require_admin_or_permission, require_permission
from app.core.permissions import (
    PERM_ALERTS,
    PERM_CONFIG_TREE,
    PERM_CONFIG_WRITE,
    PERM_DASHBOARD,
    PERM_K8,
    PERM_PATCHING,
    PERM_SERVICES,
    PERM_SETTINGS_FULL,
    PERM_SMOKE,
    PERM_SSL,
)
from app.models.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AppendKubernetesClusterRequest,
    AppendPatchingGroupRequest,
    AppendServiceRequest,
    KubernetesClusterCheck,
    KubernetesOverview,
    PatchingRunRequest,
    RecheckRequest,
    SslSummaryResponse,
    ServiceCheckResult,
    SmokeRunRequest,
    SslCertificateInfo,
    SmokeTestConfigPublic,
)
from app.monitoring.engine import MonitoringEngine
from app.core.security import (
    audit_log,
    get_recent_audit,
    issue_admin_token,
)
from app.core.runtime_settings import runtime_settings_manager
from app.tests.smoke_runner import smoke_manager
from app.tests.browser_smoke_runner import browser_smoke_manager
from app.tests.patching_runner import patching_manager
from app.core.config_loader import ServiceConfigStore
from app.monitoring.ssl_monitor import scan_ssl_certificates


router = APIRouter(prefix="", tags=["url-check"])


def get_engine() -> MonitoringEngine:
    from app.main import monitoring_engine

    return monitoring_engine


def get_config_store() -> ServiceConfigStore:
    from app.main import config_store

    return config_store


def get_runtime_cache():
    from app.main import runtime_cache
    return runtime_cache


@router.get("/status", response_model=list[ServiceCheckResult])
async def get_status(
    env: str | None = Query(default=None),
    region: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    category: str | None = Query(default=None),
    app_name: str | None = Query(default=None),
    _auth: Principal = Depends(require_permission(PERM_SERVICES)),
    engine: MonitoringEngine = Depends(get_engine),
):
    results = await engine.get_latest_results()
    if env and env.lower() != "all":
        results = [item for item in results if item.env.lower() == env.lower()]
    if region and region.lower() != "all":
        results = [item for item in results if item.region.lower() == region.lower()]
    if platform and platform.lower() != "all":
        results = [item for item in results if item.platform.lower() == platform.lower()]
    if category and category.lower() != "all":
        results = [item for item in results if item.category.lower() == category.lower()]
    if app_name and app_name.lower() != "all":
        results = [item for item in results if item.name.lower() == app_name.lower()]
    return results


@router.get("/summary")
async def get_summary(
    _auth: Principal = Depends(require_permission(PERM_DASHBOARD)),
    engine: MonitoringEngine = Depends(get_engine),
):
    return await engine.get_summary()


@router.get("/services")
async def get_services(
    _auth: Principal = Depends(require_permission(PERM_SERVICES)),
    engine: MonitoringEngine = Depends(get_engine),
):
    return await engine.get_services()


@router.get("/config/meta")
async def get_config_meta(
    _auth: Principal = Depends(require_permission(PERM_DASHBOARD)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    return await store.get_config_meta()


@router.get("/config/tree")
async def get_config_tree(
    _auth: Principal = Depends(require_permission(PERM_CONFIG_TREE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    return await store.get_config_tree()


@router.get("/admin/runtime-settings")
async def get_runtime_settings(_auth: Principal = Depends(require_admin_or_permission(PERM_SETTINGS_FULL))):
    return runtime_settings_manager.get()


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest):
    runtime = runtime_settings_manager.get()
    username = str(runtime.get("admin_username", "admin"))
    password = str(runtime.get("admin_password", "admin"))
    if body.username != username or body.password != password:
        raise HTTPException(status_code=401, detail="Invalid admin username/password")
    token, ttl = issue_admin_token(body.username)
    return AdminLoginResponse(token=token, expires_in_seconds=ttl)


@router.put("/admin/runtime-settings")
async def update_runtime_settings(
    body: dict,
    auth: Principal = Depends(require_admin_or_permission(PERM_SETTINGS_FULL)),
):
    before = runtime_settings_manager.get()
    updated = runtime_settings_manager.update(body or {})
    audit_log(
        "admin.runtime_settings.update",
        auth,
        "success",
        "runtime settings updated",
        snapshot={"before": before, "after": updated},
    )
    return updated


@router.get("/admin/audit/recent")
async def admin_audit_recent(
    limit: int = Query(default=100, ge=1, le=1000),
    _auth: Principal = Depends(require_admin_or_permission(PERM_SETTINGS_FULL)),
):
    return get_recent_audit(limit)


@router.post("/admin/config/service")
async def admin_append_service(
    body: AppendServiceRequest,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.append_service(body.target, body.service)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log(
        "admin.config.service.append",
        auth,
        "success",
        f"name={result.name} target={body.target}",
    )
    return result.model_dump()


@router.post("/admin/config/patching-group")
async def admin_append_patching_group(
    body: AppendPatchingGroupRequest,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.append_patching_group(body.group)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log("admin.config.patching.append", auth, "success", f"name={result.name}")
    return result.model_dump()


@router.post("/admin/config/kubernetes-cluster")
async def admin_append_kubernetes_cluster(
    body: AppendKubernetesClusterRequest,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.append_kubernetes_cluster(body.cluster)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log("admin.config.k8_cluster.append", auth, "success", f"name={result.name}")
    return result.model_dump()


@router.put("/admin/config/service/{target}/{name}")
async def admin_update_service(
    target: str,
    name: str,
    body: dict,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.update_service(target, name, body)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log("admin.config.service.update", auth, "success", f"name={result.name} target={target}")
    return result.model_dump()


@router.delete("/admin/config/service/{target}/{name}")
async def admin_delete_service(
    target: str,
    name: str,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        await store.delete_service(target, name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    audit_log("admin.config.service.delete", auth, "success", f"name={name} target={target}")
    return {"ok": True}


@router.put("/admin/config/patching-group/{name}")
async def admin_update_patching_group(
    name: str,
    body: dict,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.update_patching_group(name, body)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log("admin.config.patching.update", auth, "success", f"name={result.name}")
    return result.model_dump()


@router.delete("/admin/config/patching-group/{name}")
async def admin_delete_patching_group(
    name: str,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        await store.delete_patching_group(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    audit_log("admin.config.patching.delete", auth, "success", f"name={name}")
    return {"ok": True}


@router.put("/admin/config/kubernetes-cluster/{name}")
async def admin_update_kubernetes_cluster(
    name: str,
    body: dict,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        result = await store.update_kubernetes_cluster(name, body)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    audit_log("admin.config.k8_cluster.update", auth, "success", f"name={result.name}")
    return result.model_dump()


@router.delete("/admin/config/kubernetes-cluster/{name}")
async def admin_delete_kubernetes_cluster(
    name: str,
    auth: Principal = Depends(require_admin_or_permission(PERM_CONFIG_WRITE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    try:
        await store.delete_kubernetes_cluster(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    audit_log("admin.config.k8_cluster.delete", auth, "success", f"name={name}")
    return {"ok": True}


@router.get("/anomalies", response_model=list[ServiceCheckResult])
async def get_anomalies(
    _auth: Principal = Depends(require_permission(PERM_SERVICES)),
    engine: MonitoringEngine = Depends(get_engine),
):
    return await engine.get_anomalies()


@router.get("/sla")
async def get_sla(
    _auth: Principal = Depends(require_permission(PERM_SERVICES)),
    engine: MonitoringEngine = Depends(get_engine),
):
    return await engine.get_sla()


@router.post("/services/recheck")
async def services_recheck(body: RecheckRequest,
                           auth: Principal = Depends(require_permission(PERM_SERVICES)),
                           engine: MonitoringEngine = Depends(get_engine),
                           store: ServiceConfigStore = Depends(get_config_store)):
    all_services = await store.get_services()
    target_names = set(body.services)
    selected = [s for s in all_services if s.name in target_names]
    if not selected:
        audit_log("services.recheck", auth, "empty", "no selected services")
        return []
    result = await engine.recheck_services(selected)
    audit_log("services.recheck", auth, "success", f"services={len(result)}")
    return result


@router.get("/alerts")
async def get_alerts(
    _auth: Principal = Depends(require_permission(PERM_ALERTS)),
    engine: MonitoringEngine = Depends(get_engine),
):
    service_alerts = [alert.model_dump() for alert in await engine.get_alerts()]
    smoke_failed = smoke_manager.latest_failed_runs() + browser_smoke_manager.latest_failed_runs()
    patching_failed = [run for run in patching_manager.latest_status().values() if run.status == "FAIL"]
    smoke_alerts = [
        {
            "priority": "high",
            "type": "smoke_fail",
            "message": f"Smoke test FAILED for {run.brand} ({run.env}/{run.region}) at {run.timestamp.isoformat()}",
            "env": run.env,
            "region": run.region,
            "impacted": [run.brand],
        }
        for run in smoke_failed
    ]
    patching_alerts = [
        {
            "priority": "high",
            "type": "infra_issue",
            "message": f"Patching validation FAILED for {run.group} with {len(run.failed_hosts)} failed hosts",
            "env": "PATCHING",
            "region": "ALL",
            "impacted": run.failed_hosts,
        }
        for run in patching_failed
    ]
    ssl_alerts = []
    try:
        store = get_config_store()
        services = await store.get_services()
        certs = await scan_ssl_certificates(services, warning_days=15, critical_days=7, timeout_seconds=5.0)
        for cert in certs:
            if cert.status not in {"CRITICAL", "EXPIRING_SOON", "EXPIRED"}:
                continue
            priority = "high" if cert.status in {"CRITICAL", "EXPIRED"} else "medium"
            msg = (
                f"SSL certificate {cert.status} for {cert.domain}"
                f" (days remaining: {cert.days_remaining if cert.days_remaining is not None else 'N/A'})"
            )
            ssl_alerts.append(
                {
                    "priority": priority,
                    "type": "infra_issue",
                    "message": msg,
                    "env": "SSL",
                    "region": "GLOBAL",
                    "impacted": [cert.domain],
                }
            )
    except Exception:
        ssl_alerts = []

    all_alerts = service_alerts + smoke_alerts + patching_alerts + ssl_alerts

    deduped: dict[str, dict] = {}
    for alert in all_alerts:
        impacted = sorted(alert.get("impacted", []))
        key = f"{alert.get('type')}|{alert.get('env')}|{alert.get('region')}|{','.join(impacted)}"
        if key not in deduped:
            deduped[key] = {
                **alert,
                "id": key,
                "count": 1,
            }
        else:
            deduped[key]["count"] += 1
    return list(deduped.values())


@router.post("/smoke/run")
async def run_smoke_test(
    brand: str,
    env: str,
    region: str,
    body: SmokeRunRequest,
    auth: Principal = Depends(require_permission(PERM_SMOKE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    configs = await store.get_smoke_tests()
    cfg = next((c for c in configs if c.brand == brand and c.env == env and c.region == region), None)
    if not cfg:
        raise HTTPException(status_code=404, detail="Smoke test configuration not found")
    user_override = await store.resolve_smoke_user(brand=brand, env=env)
    effective_cfg = cfg.model_copy(update={"test_user": user_override}) if user_override else cfg
    # Start asynchronously so UI can show live RUNNING state and step-by-step progress.
    if body.mode == "browser":
        result = await browser_smoke_manager.start_run_for(effective_cfg, target_url=body.target_url)
    else:
        result = await smoke_manager.start_run_for(effective_cfg, target_url=body.target_url)
    audit_log("smoke.run", auth, "success", f"brand={brand} env={env} region={region} mode={body.mode}")
    return result


@router.get("/smoke/status")
async def smoke_status(_auth: Principal = Depends(require_permission(PERM_SMOKE))):
    merged = smoke_manager.latest_results() + browser_smoke_manager.latest_results()
    merged.sort(key=lambda r: r.timestamp, reverse=True)
    return merged


@router.get("/smoke/history/{brand}")
async def smoke_history(brand: str, _auth: Principal = Depends(require_permission(PERM_SMOKE))):
    merged = smoke_manager.history_for_brand(brand) + browser_smoke_manager.history_for_brand(brand)
    merged.sort(key=lambda r: r.timestamp, reverse=True)
    return merged


@router.get("/smoke/configs", response_model=list[SmokeTestConfigPublic])
async def smoke_configs(
    _auth: Principal = Depends(require_permission(PERM_SMOKE)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    configs = await store.get_smoke_tests()
    return [
        SmokeTestConfigPublic(
            brand=cfg.brand,
            env=cfg.env,
            region=cfg.region,
            base_url=cfg.base_url,
            vip_url=cfg.vip_url,
            server_urls=cfg.server_urls,
            step_paths=cfg.step_paths,
        )
        for cfg in configs
    ]


@router.get("/patching/groups")
async def patching_groups(
    _auth: Principal = Depends(require_permission(PERM_PATCHING)),
    store: ServiceConfigStore = Depends(get_config_store),
):
    return await store.get_patching_groups()


@router.post("/patching/run")
async def run_patching_test(
    body: PatchingRunRequest,
    auth: Principal = Depends(require_permission(PERM_PATCHING)),
    engine: MonitoringEngine = Depends(get_engine),
    store: ServiceConfigStore = Depends(get_config_store),
):
    groups = await store.get_patching_groups()
    group = next((g for g in groups if g.name == body.group), None)
    if not group:
        raise HTTPException(status_code=404, detail="Patching group not found")
    services = await store.get_services()
    run = await patching_manager.run_group(
        group,
        services,
        engine,
        selected_services=body.selected_services,
    )
    audit_log("patching.run", auth, "success", f"group={body.group} selected={len(body.selected_services)}")
    return run


@router.get("/patching/status")
async def patching_status(_auth: Principal = Depends(require_permission(PERM_PATCHING))):
    return patching_manager.latest_status()


@router.get("/patching/history/{group}")
async def patching_history(group: str, _auth: Principal = Depends(require_permission(PERM_PATCHING))):
    return patching_manager.history(group)


@router.get("/k8/clusters", response_model=list[KubernetesClusterCheck])
async def k8_clusters(
    _auth: Principal = Depends(require_permission(PERM_K8)),
    cache = Depends(get_runtime_cache),
):
    env = await cache.get_k8_clusters()
    if not env.updated_at:
        await cache.force_refresh_k8()
        env = await cache.get_k8_clusters()
    return env.data


@router.get("/k8/overview", response_model=KubernetesOverview)
async def k8_overview(
    _auth: Principal = Depends(require_permission(PERM_K8)),
    cache = Depends(get_runtime_cache),
):
    env = await cache.get_k8_overview()
    if not env.updated_at:
        await cache.force_refresh_k8()
        env = await cache.get_k8_overview()
    return env.data


@router.get("/ssl/certificates", response_model=list[SslCertificateInfo])
async def ssl_certificates(
    warning_days: int = Query(default=15, ge=1, le=90),
    critical_days: int = Query(default=7, ge=1, le=30),
    timeout_seconds: float = Query(default=5.0, ge=1.0, le=15.0),
    _auth: Principal = Depends(require_permission(PERM_SSL)),
    cache = Depends(get_runtime_cache),
):
    # Cache uses default thresholds (15/7). If custom thresholds are passed, compute live.
    if warning_days == 15 and critical_days == 7 and timeout_seconds == 5.0:
        env = await cache.get_ssl_certs()
        if not env.updated_at:
            await cache.force_refresh_ssl()
            env = await cache.get_ssl_certs()
        return env.data
    store = get_config_store()
    services = await store.get_services()
    return await scan_ssl_certificates(services, warning_days=warning_days, critical_days=critical_days, timeout_seconds=timeout_seconds)


@router.get("/ssl/summary", response_model=SslSummaryResponse)
async def ssl_summary(
    warning_days: int = Query(default=15, ge=1, le=90),
    critical_days: int = Query(default=7, ge=1, le=30),
    timeout_seconds: float = Query(default=5.0, ge=1.0, le=15.0),
    _auth: Principal = Depends(require_permission(PERM_SSL)),
    cache = Depends(get_runtime_cache),
):
    if warning_days == 15 and critical_days == 7 and timeout_seconds == 5.0:
        env = await cache.get_ssl_summary()
        if not env.updated_at:
            await cache.force_refresh_ssl()
            env = await cache.get_ssl_summary()
        return env.data
    store = get_config_store()
    services = await store.get_services()
    certs = await scan_ssl_certificates(services, warning_days=warning_days, critical_days=critical_days, timeout_seconds=timeout_seconds)
    return SslSummaryResponse(
        total_domains=len(certs),
        ok=sum(1 for c in certs if c.status == "OK"),
        expiring_15_days=sum(1 for c in certs if c.status == "EXPIRING_SOON"),
        expiring_7_days=sum(1 for c in certs if c.status == "CRITICAL"),
        expired=sum(1 for c in certs if c.status == "EXPIRED"),
        errors=sum(1 for c in certs if c.status == "ERROR"),
    )


@router.get("/drilldown/{service_name}")
async def get_drilldown(
    service_name: str,
    _auth: Principal = Depends(require_permission(PERM_SERVICES)),
    engine: MonitoringEngine = Depends(get_engine),
):
    history = await engine.get_history_for_service(service_name)
    latest = next((item for item in await engine.get_latest_results() if item.name == service_name), None)
    return {"service": service_name, "environment_history": history, "latest": latest}
