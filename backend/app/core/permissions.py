"""RBAC permission keys — align with frontend tab ids and admin capabilities."""

# Tool / navigation
PERM_DASHBOARD = "dashboard"
PERM_SERVICES = "services"
PERM_SMOKE = "smoke"
PERM_PATCHING = "patching"
PERM_K8 = "k8"
PERM_SSL = "ssl"
PERM_CONFIG_TREE = "configTree"
PERM_ALERTS = "alerts"

# Settings: appearance (theme) only — typical users
PERM_SETTINGS_APPEARANCE = "settings_appearance"
# Full settings: API keys, runtime, audit, legacy admin login, config registry
PERM_SETTINGS_FULL = "settings_full"
# Create/update/delete users and assign permissions
PERM_USERS_MANAGE = "users_manage"
# Add/update/delete monitored services, patching groups, K8 clusters in JSON
PERM_CONFIG_WRITE = "config_write"

ALL_TOOL_PERMISSIONS = [
    PERM_DASHBOARD,
    PERM_SERVICES,
    PERM_SMOKE,
    PERM_PATCHING,
    PERM_K8,
    PERM_SSL,
    PERM_CONFIG_TREE,
    PERM_ALERTS,
]

DEFAULT_USER_PERMISSIONS = ALL_TOOL_PERMISSIONS + [PERM_SETTINGS_APPEARANCE]

WILDCARD = "*"


def has_permission(role: str, permissions: list[str], required: str) -> bool:
    if role == "admin":
        return True
    if WILDCARD in permissions:
        return True
    return required in permissions


def has_any_tool(permissions: list[str], role: str) -> bool:
    if role == "admin" or WILDCARD in permissions:
        return True
    return any(p in permissions for p in ALL_TOOL_PERMISSIONS)
