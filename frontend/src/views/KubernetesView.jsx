import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

function statusTone(status) {
  if (status === "DOWN") return "bg-red-500/15 text-red-500";
  if (status === "DEGRADED") return "bg-amber-500/15 text-amber-500";
  return "bg-emerald-500/15 text-emerald-500";
}

export function KubernetesView() {
  const [overview, setOverview] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, cls] = await Promise.all([api.getK8Overview(), api.getK8Clusters()]);
      setOverview(ov);
      setClusters(cls);
    } catch (err) {
      setError(err.message || "Failed to load Kubernetes health");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clusters.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (!q) return true;
      return `${c.name || ""} ${c.environment || ""} ${c.region || ""}`.toLowerCase().includes(q);
    });
  }, [clusters, statusFilter, search]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Kubernetes external monitoring</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
          Cluster/API/ingress health checks without node login. Built for 1000+ apps with external probes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Clusters</p>
          <p className="mt-1 text-lg font-semibold">{overview?.total_clusters ?? 0}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">UP</p>
          <p className="mt-1 text-lg font-semibold text-emerald-500">{overview?.up ?? 0}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">DEGRADED</p>
          <p className="mt-1 text-lg font-semibold text-amber-500">{overview?.degraded ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">DOWN</p>
          <p className="mt-1 text-lg font-semibold text-red-500">{overview?.down ?? 0}</p>
        </div>
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Availability</p>
          <p className="mt-1 text-lg font-semibold text-indigo-500">{overview?.availability_pct ?? 0}%</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cluster/env/region..."
            className="h-9 w-full max-w-sm rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-saas-elevated"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-saas-elevated"
          >
            {["ALL", "UP", "DEGRADED", "DOWN"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-saas-surface">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-saas-elevated/95 dark:text-saas-muted">
              <tr>
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2">Env</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Checks</th>
                <th className="px-3 py-2">Avg Latency</th>
                <th className="px-3 py-2">Checked At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => (
                <tr key={r.name} className={i % 2 ? "bg-slate-50/40 dark:bg-slate-900/20" : ""}>
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2">{r.environment || "-"}</td>
                  <td className="px-3 py-2">{r.region || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.checks_total - r.checks_failed}/{r.checks_total}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.average_latency_ms} ms</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{new Date(r.timestamp).toLocaleString()}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500 dark:text-saas-muted">
                    No Kubernetes clusters configured or matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

