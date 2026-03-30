/** Align with backend app/core/permissions.py */
export const PERM = {
  dashboard: "dashboard",
  services: "services",
  smoke: "smoke",
  patching: "patching",
  k8: "k8",
  ssl: "ssl",
  configTree: "configTree",
  alerts: "alerts",
  settingsAppearance: "settings_appearance",
  settingsFull: "settings_full",
  usersManage: "users_manage",
  configWrite: "config_write",
};

export const TAB_ORDER = [
  "dashboard",
  "services",
  "smoke",
  "patching",
  "k8",
  "ssl",
  "configTree",
  "alerts",
  "settings",
];

export function canAccessTab(user) {
  if (!user) return () => false;
  const { role, permissions = [] } = user;
  if (role === "admin" || permissions.includes("*")) return () => true;
  return (tabId) => {
    if (tabId === "settings") {
      return (
        permissions.includes(PERM.settingsAppearance) ||
        permissions.includes(PERM.settingsFull) ||
        permissions.includes(PERM.usersManage)
      );
    }
    return permissions.includes(tabId);
  };
}

export function firstAllowedTab(user) {
  const can = canAccessTab(user);
  for (const id of TAB_ORDER) {
    if (can(id)) return id;
  }
  return "settings";
}

export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "admin" || (user.permissions || []).includes("*")) return true;
  return (user.permissions || []).includes(key);
}

export const ALL_ASSIGNABLE_PERMISSIONS = [
  { key: PERM.dashboard, label: "Dashboard" },
  { key: PERM.services, label: "Services" },
  { key: PERM.smoke, label: "Smoke tests" },
  { key: PERM.patching, label: "Manual testing" },
  { key: PERM.k8, label: "Kubernetes" },
  { key: PERM.ssl, label: "SSL" },
  { key: PERM.configTree, label: "Config tree" },
  { key: PERM.alerts, label: "Alerts" },
  { key: PERM.settingsAppearance, label: "Settings · appearance only" },
  { key: PERM.settingsFull, label: "Settings · full (API, runtime, audit, registry)" },
  { key: PERM.usersManage, label: "User management" },
  { key: PERM.configWrite, label: "Config write (services / patching / K8)" },
];
