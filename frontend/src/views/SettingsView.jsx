import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useObservability } from "../context/ObservabilityContext";
import { useAuth } from "../context/AuthContext";
import { UserManagementPanel } from "../components/UserManagementPanel";
import { api, API_BASE_URL } from "../lib/api";
import { PERM, hasPermission } from "../lib/permissions";

function splitLinesOrCommas(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { pushToast } = useObservability();
  const { user } = useAuth();
  const showAppearance = hasPermission(user, PERM.settingsAppearance);
  const showFull = hasPermission(user, PERM.settingsFull);
  const showUsers = hasPermission(user, PERM.usersManage);
  const [apiKey, setApiKey] = useState(() => api.getCurrentApiKey());
  const [runtime, setRuntime] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [svcTarget, setSvcTarget] = useState("vm");
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcForm, setSvcForm] = useState({
    name: "",
    env: "UAT",
    region: "EAST",
    platform: "vm",
    category: "application",
    type: "https",
    url: "",
    team: "platform",
    critical: true,
    sla: 99.9,
  });

  const [patchSaving, setPatchSaving] = useState(false);
  const [patchForm, setPatchForm] = useState({
    name: "",
    description: "",
    category: "application",
    platform: "vm",
    region: "",
    checksHttpd: true,
    checksTomcat: false,
    checksUrl: true,
  });

  const [k8Saving, setK8Saving] = useState(false);
  const [k8Form, setK8Form] = useState({
    name: "",
    api_server_url: "",
    ingress_urls: "",
    health_urls: "",
    metrics_url: "",
    environment: "",
    region: "",
    namespaces: "",
  });

  const maskKey = (k) => {
    if (!k) return "****";
    if (k.length <= 4) return `****${k}`;
    return `${"*".repeat(Math.max(4, k.length - 4))}${k.slice(-4)}`;
  };

  const loadAdmin = async () => {
    setLoading(true);
    setError("");
    try {
      const [rt, logs] = await Promise.all([api.getRuntimeSettings(), api.getRecentAudit(50)]);
      setRuntime(rt);
      setAudit(logs || []);
    } catch (err) {
      setError(err.message || "Failed to load admin settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showFull) loadAdmin();
  }, [showFull]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRuntime = async () => {
    if (!runtime) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateRuntimeSettings(runtime);
      setRuntime(updated);
      await loadAdmin();
    } catch (err) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 p-6 lg:p-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Settings</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">Appearance and integration.</p>
      </div>

      {showAppearance && (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Appearance</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">Dark mode is default; choice is saved locally.</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              theme === "dark"
                ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-saas-muted"
            }`}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              theme === "light"
                ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-saas-muted"
            }`}
          >
            Light
          </button>
        </div>
      </div>
      )}

      {showFull && (
      <>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">API</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">Frontend can use runtime API key from local storage.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-10 w-full max-w-sm rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
            placeholder="X-API-Key"
          />
          <button
            type="button"
            onClick={() => api.setCurrentApiKey(apiKey)}
            className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Save API key
          </button>
        </div>
        <code className="mt-3 block rounded-xl bg-slate-950 px-4 py-3 font-mono text-xs text-emerald-400/90">
          {API_BASE_URL}
        </code>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Config registry (admin)</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">
          Append entries to the JSON files on the API host (<code className="rounded bg-slate-100 px-1 dark:bg-slate-800">services_*.json</code>,{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">patching_tests.json</code>,{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">kubernetes_monitoring.json</code>). Requires an account with config write
          permission. Names must be unique.
        </p>

        <div className="mt-6 space-y-8 border-t border-slate-100 pt-6 dark:border-slate-800">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-saas-muted">Monitored service</h4>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-saas-muted">
              VM / K8 / tools buckets match <code className="text-[10px]">services_vm.json</code>, <code className="text-[10px]">services_k8.json</code>,{" "}
              <code className="text-[10px]">services_tools.json</code>. Platform must match vm or k8 when using those buckets.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                File bucket
                <select
                  value={svcTarget}
                  onChange={(e) => {
                    const t = e.target.value;
                    setSvcTarget(t);
                    if (t === "vm") setSvcForm((p) => ({ ...p, platform: "vm" }));
                    if (t === "k8") setSvcForm((p) => ({ ...p, platform: "k8" }));
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="vm">services_vm.json</option>
                  <option value="k8">services_k8.json</option>
                  <option value="tools">services_tools.json</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Name (unique)
                <input
                  value={svcForm.name}
                  onChange={(e) => setSvcForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                URL
                <input
                  value={svcForm.url}
                  onChange={(e) => setSvcForm((p) => ({ ...p, url: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Env
                <input
                  value={svcForm.env}
                  onChange={(e) => setSvcForm((p) => ({ ...p, env: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Region
                <select
                  value={svcForm.region}
                  onChange={(e) => setSvcForm((p) => ({ ...p, region: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="EAST">EAST</option>
                  <option value="WEST">WEST</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Platform
                <select
                  value={svcForm.platform}
                  onChange={(e) => setSvcForm((p) => ({ ...p, platform: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="vm">vm</option>
                  <option value="k8">k8</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Category
                <select
                  value={svcForm.category}
                  onChange={(e) => setSvcForm((p) => ({ ...p, category: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="application">application</option>
                  <option value="tool">tool</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Check type
                <select
                  value={svcForm.type}
                  onChange={(e) => setSvcForm((p) => ({ ...p, type: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="https">https</option>
                  <option value="tomcat">tomcat</option>
                  <option value="heartbeat">heartbeat</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Team
                <input
                  value={svcForm.team}
                  onChange={(e) => setSvcForm((p) => ({ ...p, team: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                SLA %
                <input
                  type="number"
                  step="0.1"
                  value={svcForm.sla}
                  onChange={(e) => setSvcForm((p) => ({ ...p, sla: Number(e.target.value) }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={svcSaving || !svcForm.name.trim() || !svcForm.url.trim()}
              onClick={async () => {
                setSvcSaving(true);
                setError("");
                try {
                  await api.appendConfigService(svcTarget, {
                    name: svcForm.name.trim(),
                    env: svcForm.env.trim(),
                    region: svcForm.region,
                    platform: svcForm.platform,
                    category: svcForm.category,
                    type: svcForm.type,
                    url: svcForm.url.trim(),
                    team: svcForm.team.trim(),
                    critical: svcForm.critical,
                    sla: svcForm.sla,
                  });
                  pushToast("success", `Service “${svcForm.name.trim()}” saved to config`);
                  await loadAdmin();
                } catch (err) {
                  setError(err.message || "Failed to add service");
                } finally {
                  setSvcSaving(false);
                }
              }}
              className="mt-4 h-9 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {svcSaving ? "Saving…" : "Add monitored service"}
            </button>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-saas-muted">Patching group</h4>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-saas-muted">
              Defines which services are included in a manual patching validation run (category / region filters).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Group id (unique)
                <input
                  value={patchForm.name}
                  onChange={(e) => setPatchForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                  placeholder="day4-east-vm"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                Description
                <input
                  value={patchForm.description}
                  onChange={(e) => setPatchForm((p) => ({ ...p, description: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Targets · category
                <select
                  value={patchForm.category}
                  onChange={(e) => setPatchForm((p) => ({ ...p, category: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="application">application</option>
                  <option value="tool">tool</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Targets · platform
                <select
                  value={patchForm.platform}
                  onChange={(e) => setPatchForm((p) => ({ ...p, platform: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="vm">vm</option>
                  <option value="k8">k8</option>
                </select>
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Targets · region (optional)
                <select
                  value={patchForm.region}
                  onChange={(e) => setPatchForm((p) => ({ ...p, region: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                >
                  <option value="">All regions</option>
                  <option value="EAST">EAST</option>
                  <option value="WEST">WEST</option>
                </select>
              </label>
              <div className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                Checks
                <div className="mt-2 flex flex-wrap gap-3">
                  {[
                    ["checksHttpd", "httpd"],
                    ["checksTomcat", "tomcat"],
                    ["checksUrl", "url"],
                  ].map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={patchForm[key]}
                        onChange={(e) => setPatchForm((p) => ({ ...p, [key]: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={patchSaving || !patchForm.name.trim()}
              onClick={async () => {
                setPatchSaving(true);
                setError("");
                const checks = [];
                if (patchForm.checksHttpd) checks.push("httpd");
                if (patchForm.checksTomcat) checks.push("tomcat");
                if (patchForm.checksUrl) checks.push("url");
                if (checks.length === 0) {
                  setError("Select at least one check");
                  setPatchSaving(false);
                  return;
                }
                const targets = { category: patchForm.category, platform: patchForm.platform };
                if (patchForm.region) targets.region = patchForm.region;
                try {
                  await api.appendPatchingGroup({
                    name: patchForm.name.trim(),
                    description: patchForm.description.trim() || patchForm.name.trim(),
                    targets,
                    checks,
                  });
                  pushToast("success", `Patching group “${patchForm.name.trim()}” saved`);
                  await loadAdmin();
                } catch (err) {
                  setError(err.message || "Failed to add patching group");
                } finally {
                  setPatchSaving(false);
                }
              }}
              className="mt-4 h-9 rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {patchSaving ? "Saving…" : "Add patching group"}
            </button>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-saas-muted">Kubernetes cluster</h4>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-saas-muted">
              External probe targets for the K8 dashboard. Optional <strong>namespaces</strong> list is stored for documentation; wire your probes to real
              endpoints below.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Cluster name (unique)
                <input
                  value={k8Form.name}
                  onChange={(e) => setK8Form((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                API server URL
                <input
                  value={k8Form.api_server_url}
                  onChange={(e) => setK8Form((p) => ({ ...p, api_server_url: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                Ingress URLs (comma or newline separated)
                <textarea
                  value={k8Form.ingress_urls}
                  onChange={(e) => setK8Form((p) => ({ ...p, ingress_urls: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                Health URLs
                <textarea
                  value={k8Form.health_urls}
                  onChange={(e) => setK8Form((p) => ({ ...p, health_urls: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Metrics URL
                <input
                  value={k8Form.metrics_url}
                  onChange={(e) => setK8Form((p) => ({ ...p, metrics_url: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Environment label
                <input
                  value={k8Form.environment}
                  onChange={(e) => setK8Form((p) => ({ ...p, environment: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                  placeholder="prod"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted">
                Region label
                <input
                  value={k8Form.region}
                  onChange={(e) => setK8Form((p) => ({ ...p, region: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
                  placeholder="EAST"
                />
              </label>
              <label className="text-xs text-slate-500 dark:text-saas-muted sm:col-span-2">
                Namespaces (comma separated, optional)
                <input
                  value={k8Form.namespaces}
                  onChange={(e) => setK8Form((p) => ({ ...p, namespaces: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm dark:border-slate-700 dark:bg-saas-elevated"
                  placeholder="kube-system, monitoring, app-prod"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={k8Saving || !k8Form.name.trim()}
              onClick={async () => {
                setK8Saving(true);
                setError("");
                try {
                  await api.appendKubernetesCluster({
                    name: k8Form.name.trim(),
                    api_server_url: k8Form.api_server_url.trim() || null,
                    ingress_urls: splitLinesOrCommas(k8Form.ingress_urls),
                    health_urls: splitLinesOrCommas(k8Form.health_urls),
                    metrics_url: k8Form.metrics_url.trim() || null,
                    environment: k8Form.environment.trim() || null,
                    region: k8Form.region.trim() || null,
                    namespaces: k8Form.namespaces
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                  pushToast("success", `Cluster “${k8Form.name.trim()}” saved`);
                  await loadAdmin();
                } catch (err) {
                  setError(err.message || "Failed to add cluster");
                } finally {
                  setK8Saving(false);
                }
              }}
              className="mt-4 h-9 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {k8Saving ? "Saving…" : "Add Kubernetes cluster"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Runtime security & cache settings</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">
              Update API keys, rate limits, allowed origins, and cache intervals without code changes.
            </p>
          </div>
          <button
            type="button"
            onClick={saveRuntime}
            disabled={saving || !runtime}
            className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save runtime settings"}
          </button>
        </div>
        {runtime ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-700 dark:bg-saas-elevated">
              <p className="font-semibold text-slate-700 dark:text-saas-fg">Masked keys preview</p>
              <p className="mt-1 text-slate-500 dark:text-saas-muted">
                API keys: {(runtime.api_keys || []).map(maskKey).join(", ") || "—"}
              </p>
              <p className="mt-1 text-slate-500 dark:text-saas-muted">
                Admin API keys: {(runtime.admin_api_keys || []).map(maskKey).join(", ") || "—"}
              </p>
            </div>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              API Keys (comma separated)
              <input
                type="text"
                value={(runtime.api_keys || []).join(",")}
                onChange={(e) => setRuntime((p) => ({ ...p, api_keys: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Admin API Keys (comma separated)
              <input
                type="text"
                value={(runtime.admin_api_keys || []).join(",")}
                onChange={(e) => setRuntime((p) => ({ ...p, admin_api_keys: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Admin Username
              <input
                type="text"
                value={runtime.admin_username ?? "admin"}
                onChange={(e) => setRuntime((p) => ({ ...p, admin_username: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Admin Password
              <input
                type="password"
                value={runtime.admin_password ?? "admin"}
                onChange={(e) => setRuntime((p) => ({ ...p, admin_password: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Allowed Origins (comma separated)
              <input
                type="text"
                value={(runtime.allowed_origins || []).join(",")}
                onChange={(e) => setRuntime((p) => ({ ...p, allowed_origins: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Rate Limit Window (s)
              <input
                type="number"
                value={runtime.rate_limit_window_seconds ?? 60}
                onChange={(e) => setRuntime((p) => ({ ...p, rate_limit_window_seconds: Number(e.target.value) || 60 }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              Rate Limit Max Requests
              <input
                type="number"
                value={runtime.rate_limit_max_requests ?? 30}
                onChange={(e) => setRuntime((p) => ({ ...p, rate_limit_max_requests: Number(e.target.value) || 30 }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              K8 Cache Refresh (s)
              <input
                type="number"
                value={runtime.k8_cache_refresh_seconds ?? 20}
                onChange={(e) => setRuntime((p) => ({ ...p, k8_cache_refresh_seconds: Number(e.target.value) || 20 }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-saas-muted">
              SSL Cache Refresh (s)
              <input
                type="number"
                value={runtime.ssl_cache_refresh_seconds ?? 60}
                onChange={(e) => setRuntime((p) => ({ ...p, ssl_cache_refresh_seconds: Number(e.target.value) || 60 }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700 dark:bg-saas-elevated"
              />
            </label>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500 dark:text-saas-muted">{loading ? "Loading..." : "No runtime settings loaded."}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Audit logs</h3>
          <button
            type="button"
            onClick={loadAdmin}
            className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-saas-fg dark:hover:bg-saas-elevated"
          >
            Refresh logs
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-3 max-h-[260px] overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-saas-elevated/95 dark:text-saas-muted">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(audit || []).map((a, i) => (
                <tr key={`${a.timestamp}-${i}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{a.timestamp ? new Date(a.timestamp).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">{a.action || "-"}</td>
                  <td className="px-3 py-2">{a.status || "-"}</td>
                  <td className="px-3 py-2">{a.role || "-"}</td>
                  <td className="px-3 py-2">{a.client || "-"}</td>
                  <td className="max-w-[320px] truncate px-3 py-2" title={a.detail || ""}>
                    {a.detail || "-"}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 font-mono text-[11px]" title={a.snapshot ? JSON.stringify(a.snapshot) : ""}>
                    {a.snapshot ? "before/after saved" : "-"}
                  </td>
                </tr>
              ))}
              {!audit?.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500 dark:text-saas-muted">
                    No audit entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {showUsers && <UserManagementPanel />}
    </div>
  );
}
