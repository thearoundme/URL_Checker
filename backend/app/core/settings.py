from pydantic import BaseModel


class AppSettings(BaseModel):
    config_dir: str = "config"
    services_vm_file: str = "services_vm.json"
    services_k8_file: str = "services_k8.json"
    services_tools_file: str = "services_tools.json"
    smoke_tests_file: str = "smoke_tests.json"
    smoke_users_file: str = "service_smoketest_user.json"
    patching_tests_file: str = "patching_tests.json"
    kubernetes_monitoring_file: str = "kubernetes_monitoring.json"
    runtime_settings_file: str = "runtime_settings.json"
    audit_log_file: str = "audit.log"
    users_file: str = "users.json"
    monitoring_settings_file: str = "monitoring_settings.json"
    check_interval_seconds: int = 30
    check_timeout_seconds: float = 5.0
    retry_count: int = 2
    degraded_latency_ms: float = 1000.0
    batch_size: int = 100
    max_outbound_connections: int = 2000
    max_keepalive_connections: int = 400
    latency_history_size: int = 30
    intermittent_failure_window: int = 10
    intermittent_failure_threshold: int = 3
    # Security defaults: update in production.
    api_keys: list[str] = ["local-dev-key"]
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # Protected endpoint guardrails
    rate_limit_window_seconds: int = 60
    rate_limit_max_requests: int = 30
    # Background cache refresh intervals
    k8_cache_refresh_seconds: int = 20
    ssl_cache_refresh_seconds: int = 60


settings = AppSettings()
