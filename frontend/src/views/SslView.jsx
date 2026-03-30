import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

function statusTone(status) {
  if (status === "CRITICAL" || status === "EXPIRED") return "bg-red-500/15 text-red-500";
  if (status === "EXPIRING_SOON") return "bg-amber-500/15 text-amber-500";
  if (status === "OK") return "bg-emerald-500/15 text-emerald-500";
  return "bg-slate-500/15 text-slate-500";
}

export function SslView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [certs, setCerts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [warningDays, setWarningDays] = useState(15);
  const [criticalDays, setCriticalDays] = useState(7);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { warningDays, criticalDays };
      const [sum, list] = await Promise.all([api.getSslSummary(params), api.getSslCertificates(params)]);
      setSummary(sum);
      setCerts(list);
    } catch (err) {
      setError(err.message || "Failed to load SSL data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return certs.filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (!q) return true;
      return `${c.domain || ""} ${c.issuer || ""}`.toLowerCase().includes(q);
    });
  }, [certs, search, statusFilter]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">SSL certificate monitoring</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
          Tracks expiry date, issuer, TLS version, and raises early warnings for 7/15 day windows.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Domains</p>
          <p className="mt-1 text-lg font-semibold">{summary?.total_domains ?? 0}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">OK</p>
          <p className="mt-1 text-lg font-semibold text-emerald-500">{summary?.ok ?? 0}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Expiring in 15d</p>
          <p className="mt-1 text-lg font-semibold text-amber-500">{summary?.expiring_15_days ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Critical in 7d</p>
          <p className="mt-1 text-lg font-semibold text-red-500">{summary?.expiring_7_days ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Expired</p>
          <p className="mt-1 text-lg font-semibold text-red-500">{summary?.expired ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-300/50 p-3">
          <p className="text-[10px] uppercase text-slate-500 dark:text-saas-muted">Errors</p>
          <p className="mt-1 text-lg font-semibold">{summary?.errors ?? 0}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search domain or issuer..."
            className="h-9 w-full max-w-sm rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-saas-elevated"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700 dark:bg-saas-elevated"
          >
            {["ALL", "OK", "EXPIRING_SOON", "CRITICAL", "EXPIRED", "ERROR"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="text-xs text-slate-500 dark:text-saas-muted">
            Warn
            <input
              type="number"
              value={warningDays}
              onChange={(e) => setWarningDays(Math.max(1, Number(e.target.value) || 15))}
              className="ml-1 h-9 w-16 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-saas-elevated"
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-saas-muted">
            Critical
            <input
              type="number"
              value={criticalDays}
              onChange={(e) => setCriticalDays(Math.max(1, Number(e.target.value) || 7))}
              className="ml-1 h-9 w-16 rounded-lg border border-slate-200 px-2 dark:border-slate-700 dark:bg-saas-elevated"
            />
          </label>
          <button
            type="button"
            onClick={refresh}
            className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            {loading ? "Refreshing..." : "Refresh SSL"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-saas-surface">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-saas-elevated/95 dark:text-saas-muted">
              <tr>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Days Left</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2">TLS</th>
                <th className="px-3 py-2">Issuer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c, i) => (
                <tr key={c.domain} className={i % 2 ? "bg-slate-50/40 dark:bg-slate-900/20" : ""}>
                  <td className="px-3 py-2 font-mono text-[11px]">{c.domain}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.days_remaining ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {c.expiry_date ? new Date(c.expiry_date).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">{c.tls_version || "-"}</td>
                  <td className="px-3 py-2 max-w-[320px] truncate" title={c.issuer || c.error_message || ""}>
                    {c.issuer || c.error_message || "-"}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500 dark:text-saas-muted">
                    No SSL certificate rows to display.
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

