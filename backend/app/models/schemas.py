from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


ServiceStatus = Literal["UP", "DOWN", "DEGRADED"]
ServiceCategory = Literal["application", "tool"]


class ServiceConfig(BaseModel):
    name: str
    env: str
    region: Literal["EAST", "WEST"]
    platform: Literal["vm", "k8", "VM", "K8"]
    category: ServiceCategory
    type: Literal["https", "tomcat", "heartbeat"]
    url: str
    summary_url: Optional[str] = None
    heartbeat_url: Optional[str] = None
    app_version: Optional[str] = None
    team: str = "platform"
    critical: bool = True
    sla: float = Field(default=99.9, ge=0, le=100)
    expected_response: Optional[str] = None
    keyword: Optional[str] = None
    degraded_threshold_ms: Optional[float] = Field(default=None, ge=0)

    @property
    def platform_normalized(self) -> str:
        return self.platform.lower()


class ServiceCheckResult(BaseModel):
    name: str
    app_version: Optional[str] = None
    env: str
    region: Literal["EAST", "WEST"]
    platform: Literal["vm", "k8"]
    category: ServiceCategory
    critical: bool
    status: ServiceStatus
    summary_status: Optional[ServiceStatus] = None
    heartbeat_status: Optional[Literal["HEALTHY", "UNHEALTHY", "NO_DATA"]] = None
    latency_ms: float
    timestamp: datetime
    url: str
    error_message: Optional[str] = None
    anomaly: bool = False


class SummaryResponse(BaseModel):
    total: int
    up: int
    down: int
    degraded: int
    availability_pct: float
    average_latency_ms: float
    by_env: dict
    by_category: dict
    by_region: dict


class ServiceSla(BaseModel):
    name: str
    env: str
    region: Literal["EAST", "WEST"]
    category: ServiceCategory
    sla_target_pct: float
    current_availability_pct: float
    error_budget_remaining_pct: float


class AlertItem(BaseModel):
    priority: Literal["high", "medium"]
    type: Literal["tool_down", "infra_issue", "smoke_fail"]
    message: str
    env: str
    region: str
    impacted: list[str]


class SmokeTestUser(BaseModel):
    username: str
    password: str


class SmokeTestAddress(BaseModel):
    name: str
    city: str
    zip: str


class SmokeTestConfig(BaseModel):
    brand: str
    env: str
    region: Literal["EAST", "WEST"]
    base_url: str
    vip_url: str
    server_urls: list[str] = []
    test_user: SmokeTestUser
    product_search_term: str
    address: SmokeTestAddress
    step_paths: dict[str, str] = {}
    request_timeout_seconds: float = Field(default=10.0, ge=1, le=60)
    step_retry_count: int = Field(default=1, ge=0, le=5)


class SmokeTestConfigPublic(BaseModel):
    brand: str
    env: str
    region: Literal["EAST", "WEST"]
    base_url: str
    vip_url: str
    server_urls: list[str] = []
    step_paths: dict[str, str] = {}


class SmokeStepResult(BaseModel):
    step: str
    status: Literal["PASS", "FAIL"]
    latency: float
    request_url: Optional[str] = None
    http_status: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    response_excerpt: Optional[str] = None
    error_type: Optional[str] = None
    debug: Optional[str] = None
    error: Optional[str] = None


class SmokeRunResult(BaseModel):
    brand: str
    env: str
    region: Literal["EAST", "WEST"]
    mode: Literal["api", "browser"] = "api"
    status: Literal["PASS", "FAIL", "RUNNING"]
    steps: list[SmokeStepResult]
    total_time: float
    failed_step: Optional[str]
    current_step: Optional[str] = None
    target_url: Optional[str] = None
    debug_message: Optional[str] = None
    timestamp: datetime
    run_id: str


class SmokeRunRequest(BaseModel):
    target_url: Optional[str] = None
    mode: Literal["api", "browser"] = "api"


class RecheckRequest(BaseModel):
    services: list[str]


class PatchingGroupTarget(BaseModel):
    category: Literal["application", "tool"]
    platform: Literal["vm", "k8"] = "vm"
    region: Optional[Literal["EAST", "WEST"]] = None


class PatchingGroupConfig(BaseModel):
    name: str
    description: str
    targets: PatchingGroupTarget
    checks: list[Literal["httpd", "tomcat", "url"]]


class PatchingCheckResult(BaseModel):
    service: str
    env: str
    region: str
    httpd: Optional[Literal["UP", "DOWN", "N/A"]] = "N/A"
    tomcat: Optional[Literal["UP", "DOWN", "N/A"]] = "N/A"
    url_status: Optional[Literal["UP", "DOWN", "DEGRADED", "N/A"]] = "N/A"
    latency_ms: float = 0.0
    timestamp: datetime
    error_message: Optional[str] = None


class PatchingRunResult(BaseModel):
    group: str
    description: str
    status: Literal["PASS", "FAIL"]
    started_at: datetime
    completed_at: datetime
    failed_hosts: list[str]
    results: list[PatchingCheckResult]


class PatchingRunRequest(BaseModel):
    group: str
    selected_services: list[str] = []


class SslCertificateInfo(BaseModel):
    domain: str
    issuer: Optional[str] = None
    tls_version: Optional[str] = None
    expiry_date: Optional[datetime] = None
    days_remaining: Optional[int] = None
    status: Literal["OK", "EXPIRING_SOON", "CRITICAL", "EXPIRED", "ERROR"]
    source_urls: list[str] = []
    error_message: Optional[str] = None


class SslSummaryResponse(BaseModel):
    total_domains: int
    ok: int
    expiring_15_days: int
    expiring_7_days: int
    expired: int
    errors: int


class KubernetesClusterConfig(BaseModel):
    name: str
    api_server_url: Optional[str] = None
    ingress_urls: list[str] = []
    health_urls: list[str] = []
    metrics_url: Optional[str] = None
    bearer_token: Optional[str] = None
    region: Optional[str] = None
    environment: Optional[str] = None
    namespaces: list[str] = Field(default_factory=list)


class AppendServiceRequest(BaseModel):
    target: Literal["vm", "k8", "tools"]
    service: dict


class AppendPatchingGroupRequest(BaseModel):
    group: dict


class AppendKubernetesClusterRequest(BaseModel):
    cluster: dict


class KubernetesClusterCheck(BaseModel):
    name: str
    environment: Optional[str] = None
    region: Optional[str] = None
    status: Literal["UP", "DEGRADED", "DOWN"]
    checks_total: int
    checks_failed: int
    average_latency_ms: float
    timestamp: datetime
    details: dict


class KubernetesOverview(BaseModel):
    total_clusters: int
    up: int
    degraded: int
    down: int
    availability_pct: float


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    expires_in_seconds: int


class LoginRequest(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    username: str
    display_name: str
    role: str
    permissions: list[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class UserCreateBody(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "user"
    permissions: list[str] = []


class UserUpdateBody(BaseModel):
    password: str | None = None
    display_name: str | None = None
    role: str | None = None
    permissions: list[str] | None = None
