// Dev: Vite proxies /api → backend (see vite.config.js). Override with VITE_API_BASE_URL if needed.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "/api" : "http://localhost:8000");
const BASE_URL = API_BASE_URL;
const API_KEY_STORAGE = "url-checker-api-key";
const ACCESS_TOKEN_STORAGE = "url-checker-access-token";
const ADMIN_TOKEN_STORAGE = "url-checker-admin-token";
const DEFAULT_API_KEY = import.meta.env.VITE_API_KEY || "local-dev-key";

function readApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || DEFAULT_API_KEY;
  } catch {
    return DEFAULT_API_KEY;
  }
}

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setAccessToken(value) {
  try {
    if (value) localStorage.setItem(ACCESS_TOKEN_STORAGE, value);
    else localStorage.removeItem(ACCESS_TOKEN_STORAGE);
  } catch {
    /* ignore */
  }
}

function readAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE) || "";
  } catch {
    return "";
  }
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  const jwt = getAccessToken();
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  } else {
    headers["X-API-Key"] = readApiKey();
  }
  const adminToken = readAdminToken();
  if (adminToken) headers["X-Admin-Token"] = adminToken;
  return headers;
}

async function parseError(response, path) {
  let detail = `HTTP ${response.status}`;
  try {
    const j = await response.json();
    if (j.detail !== undefined) {
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    }
  } catch {
    /* ignore */
  }
  throw new Error(detail || `Failed ${path}`);
}

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(),
  });
  if (response.status === 401) {
    setAccessToken("");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    await parseError(response, path);
  }
  return response.json();
}

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    setAccessToken("");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    await parseError(response, path);
  }
  return response.json();
}

async function put(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    setAccessToken("");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    await parseError(response, path);
  }
  return response.json();
}

async function del(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (response.status === 401) {
    setAccessToken("");
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    await parseError(response, path);
  }
  if (response.status === 204) return {};
  return response.json();
}

async function postAdmin(path, body) {
  return post(path, body);
}

export const api = {
  login: (username, password) =>
    fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      if (!res.ok) {
        await parseError(res, "/auth/login");
      }
      return res.json();
    }),
  getMe: () => get("/auth/me"),
  listUsers: () => get("/admin/users"),
  createUser: (body) => post("/admin/users", body),
  updateUser: (username, body) => put(`/admin/users/${encodeURIComponent(username)}`, body),
  deleteUser: (username) => del(`/admin/users/${encodeURIComponent(username)}`),

  getStatus: (params) => {
    const query = new URLSearchParams();
    if (params.env && params.env !== "ALL") query.set("env", params.env);
    if (params.region && params.region !== "ALL") query.set("region", params.region);
    if (params.platform && params.platform !== "ALL") query.set("platform", params.platform.toLowerCase());
    if (params.category && params.category !== "ALL") query.set("category", params.category.toLowerCase());
    if (params.appName && params.appName !== "ALL") query.set("app_name", params.appName);
    const qs = query.toString();
    return get(`/status${qs ? `?${qs}` : ""}`);
  },
  getSummary: () => get("/summary"),
  getConfigMeta: () => get("/config/meta"),
  getConfigTree: () => get("/config/tree"),
  getServices: () => get("/services"),
  getAnomalies: () => get("/anomalies"),
  getSla: () => get("/sla"),
  getAlerts: () => get("/alerts"),
  getDrilldown: (name) => get(`/drilldown/${encodeURIComponent(name)}`),
  recheckServices: (services) => post("/services/recheck", services),
  runSmoke: ({ brand, env, region, targetUrl, mode }) =>
    post(
      `/smoke/run?brand=${encodeURIComponent(brand)}&env=${encodeURIComponent(env)}&region=${encodeURIComponent(region)}`,
      { target_url: targetUrl || null, mode: mode || "api" }
    ),
  getSmokeStatus: () => get("/smoke/status"),
  getSmokeHistory: (brand) => get(`/smoke/history/${encodeURIComponent(brand)}`),
  getSmokeConfigs: () => get("/smoke/configs"),
  getPatchingGroups: () => get("/patching/groups"),
  runPatching: (group, selectedServices = []) => post("/patching/run", { group, selected_services: selectedServices }),
  getPatchingStatus: () => get("/patching/status"),
  getPatchingHistory: (group) => get(`/patching/history/${encodeURIComponent(group)}`),
  getSslCertificates: (params = {}) => {
    const query = new URLSearchParams();
    if (params.warningDays) query.set("warning_days", String(params.warningDays));
    if (params.criticalDays) query.set("critical_days", String(params.criticalDays));
    if (params.timeoutSeconds) query.set("timeout_seconds", String(params.timeoutSeconds));
    const qs = query.toString();
    return get(`/ssl/certificates${qs ? `?${qs}` : ""}`);
  },
  getSslSummary: (params = {}) => {
    const query = new URLSearchParams();
    if (params.warningDays) query.set("warning_days", String(params.warningDays));
    if (params.criticalDays) query.set("critical_days", String(params.criticalDays));
    if (params.timeoutSeconds) query.set("timeout_seconds", String(params.timeoutSeconds));
    const qs = query.toString();
    return get(`/ssl/summary${qs ? `?${qs}` : ""}`);
  },
  getK8Clusters: () => get("/k8/clusters"),
  getK8Overview: () => get("/k8/overview"),
  getRuntimeSettings: () => get("/admin/runtime-settings"),
  updateRuntimeSettings: (payload) => put("/admin/runtime-settings", payload),
  getRecentAudit: (limit = 100) => get(`/admin/audit/recent?limit=${encodeURIComponent(limit)}`),
  getCurrentApiKey: () => readApiKey(),
  setCurrentApiKey: (value) => {
    try {
      localStorage.setItem(API_KEY_STORAGE, value || "");
    } catch {
      /* ignore */
    }
  },
  getAccessToken,
  setAccessToken,
  appendConfigService: (target, service) => postAdmin("/admin/config/service", { target, service }),
  appendPatchingGroup: (group) => postAdmin("/admin/config/patching-group", { group }),
  appendKubernetesCluster: (cluster) => postAdmin("/admin/config/kubernetes-cluster", { cluster }),
  updateConfigService: (target, name, service) => put(`/admin/config/service/${encodeURIComponent(target)}/${encodeURIComponent(name)}`, service),
  deleteConfigService: (target, name) => del(`/admin/config/service/${encodeURIComponent(target)}/${encodeURIComponent(name)}`),
  updatePatchingGroup: (name, group) => put(`/admin/config/patching-group/${encodeURIComponent(name)}`, group),
  deletePatchingGroup: (name) => del(`/admin/config/patching-group/${encodeURIComponent(name)}`),
  updateKubernetesCluster: (name, cluster) => put(`/admin/config/kubernetes-cluster/${encodeURIComponent(name)}`, cluster),
  deleteKubernetesCluster: (name) => del(`/admin/config/kubernetes-cluster/${encodeURIComponent(name)}`),
  adminLogin: (username, password) =>
    fetch(`${BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Failed /admin/login: ${res.status}`);
      return res.json();
    }),
  getAdminToken: () => readAdminToken(),
  setAdminToken: (token) => {
    try {
      localStorage.setItem(ADMIN_TOKEN_STORAGE, token || "");
    } catch {
      /* ignore */
    }
  },
};
