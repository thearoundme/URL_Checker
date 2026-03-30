import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { MetricCard } from "../components/saas/MetricCard";
import {
  FailureSection,
  InsightsPanel,
  MetricsTrendCharts,
  PatchingRunTimeline,
  ServiceBreakdownChart,
} from "../components/saas/DashboardAnalytics";
import { LogsDrawer } from "../components/saas/LogsDrawer";
import { useObservability } from "../context/ObservabilityContext";
import { api } from "../lib/api";

function MiniSparkline({ points, color = "#67e8f9" }) {
  const data = (points || []).map((v, i) => ({ i, v }));
  if (!data.length) return <div className="h-10 w-full rounded bg-white/10" />;
  return (
    <div className="h-10 w-full opacity-90">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardView({ onNavigate = () => {} }) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [dashboardPack, setDashboardPack] = useState({
    smoke: [],
    k8: null,
    ssl: null,
  });
  const [packLoading, setPackLoading] = useState(false);
  const [activeModule, setActiveModule] = useState("all");
  const [alertPriorityFilter, setAlertPriorityFilter] = useState("all");
  const [miniHistory, setMiniHistory] = useState({
    services: [],
    smoke: [],
    k8: [],
    ssl: [],
    alerts: [],
  });
  const {
    metrics,
    combinedAlerts,
    loading,
    lastPollAt,
    configMeta,
    pollIntervalMs,
    metricsHistory,
    failureRecords,
    failureDistribution,
    serviceBreakdown,
    insights,
    patching,
  } = useObservability();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPackLoading(true);
      try {
        const [smoke, k8, ssl] = await Promise.all([
          api.getSmokeStatus(),
          api.getK8Overview(),
          api.getSslSummary(),
        ]);
        if (!cancelled) {
          setDashboardPack({
            smoke: smoke || [],
            k8: k8 || null,
            ssl: ssl || null,
          });
        }
      } catch {
        if (!cancelled) {
          setDashboardPack((prev) => ({ ...prev }));
        }
      } finally {
        if (!cancelled) setPackLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [lastPollAt]);

  const issuesText = useMemo(() => {
    const issues = configMeta?.validation_issues || [];
    if (!issues.length) return "No validation issues found.";
    return issues
      .map((it) => {
        const detail = Array.isArray(it.error) && it.error[0] ? JSON.stringify(it.error[0]) : String(it.error);
        return `[${it.source}] index=${it.index} ${detail}`;
      })
      .join("\n");
  }, [configMeta]);

  const cards = [
    {
      label: "Success rate",
      value: `${metrics.successRate}%`,
      hint: `${metrics.healthy} healthy / ${metrics.total} total`,
      variant: metrics.successRate >= 95 ? "success" : metrics.successRate >= 80 ? "warning" : "error",
    },
    {
      label: "Avg response time",
      value: `${metrics.avgLatencyMs} ms`,
      hint: "From live summary",
      variant: "default",
    },
    {
      label: "Total failures",
      value: String(metrics.totalFailures),
      hint: "DOWN endpoints (current poll)",
      variant: metrics.totalFailures > 0 ? "error" : "success",
    },
    {
      label: "Active alerts",
      value: String(combinedAlerts?.length ?? 0),
      hint: "API + insights",
      variant: (combinedAlerts?.length ?? 0) > 0 ? "warning" : "success",
    },
    {
      label: "Config issues",
      value: String(configMeta?.validation_issue_count ?? 0),
      hint: "Invalid rows skipped on load",
      variant: (configMeta?.validation_issue_count ?? 0) > 0 ? "warning" : "success",
    },
  ];

  const smokeStats = useMemo(() => {
    const rows = dashboardPack.smoke || [];
    const running = rows.filter((r) => r.status === "RUNNING").length;
    const pass = rows.filter((r) => r.status === "PASS").length;
    const fail = rows.filter((r) => r.status === "FAIL").length;
    return { total: rows.length, running, pass, fail };
  }, [dashboardPack.smoke]);

  const k8Stats = useMemo(() => {
    const d = dashboardPack.k8;
    return {
      total: d?.total_clusters ?? 0,
      up: d?.up ?? 0,
      degraded: d?.degraded ?? 0,
      down: d?.down ?? 0,
      availability: d?.availability_pct ?? 0,
    };
  }, [dashboardPack.k8]);

  const sslStats = useMemo(() => {
    const d = dashboardPack.ssl;
    return {
      total: d?.total_domains ?? 0,
      ok: d?.ok ?? 0,
      expiring15: d?.expiring_15_days ?? 0,
      critical7: d?.expiring_7_days ?? 0,
      expired: d?.expired ?? 0,
      errors: d?.errors ?? 0,
    };
  }, [dashboardPack.ssl]);

  const alertPriority = useMemo(() => {
    const all = combinedAlerts || [];
    const high = all.filter((a) => a.priority === "high").length;
    const medium = all.filter((a) => a.priority === "medium").length;
    const low = all.length - high - medium;
    return { total: all.length, high, medium, low };
  }, [combinedAlerts]);

  const filteredAlerts = useMemo(() => {
    const list = combinedAlerts || [];
    if (alertPriorityFilter === "all") return list;
    return list.filter((a) => (a.priority || "low") === alertPriorityFilter);
  }, [combinedAlerts, alertPriorityFilter]);

  const moduleCards = [
    {
      id: "services",
      tab: "services",
      title: "Services",
      subtitle: `${metrics.healthy}/${metrics.total} healthy`,
      tone:
        metrics.successRate >= 95
          ? "border-emerald-500/40 bg-emerald-500/10"
          : metrics.successRate >= 80
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-red-500/40 bg-red-500/10",
      value: `${metrics.successRate}%`,
      accent: `${Math.max(3, Math.min(100, metrics.successRate))}%`,
      sparkColor: "#34d399",
      spark: miniHistory.services,
    },
    {
      id: "smoke",
      tab: "smoke",
      title: "Smoke tests",
      subtitle: `${smokeStats.running} running · ${smokeStats.fail} failed`,
      tone:
        smokeStats.fail > 0
          ? "border-rose-500/40 bg-rose-500/10"
          : "border-cyan-500/40 bg-cyan-500/10",
      value: String(smokeStats.total),
      accent: `${smokeStats.total ? Math.max(8, Math.round((smokeStats.pass / smokeStats.total) * 100)) : 8}%`,
      sparkColor: "#22d3ee",
      spark: miniHistory.smoke,
    },
    {
      id: "k8",
      tab: "k8",
      title: "Kubernetes",
      subtitle: `${k8Stats.up} up · ${k8Stats.degraded} degraded · ${k8Stats.down} down`,
      tone:
        k8Stats.down > 0
          ? "border-orange-500/40 bg-orange-500/10"
          : "border-indigo-500/40 bg-indigo-500/10",
      value: `${k8Stats.availability}%`,
      accent: `${Math.max(8, k8Stats.availability)}%`,
      sparkColor: "#818cf8",
      spark: miniHistory.k8,
    },
    {
      id: "ssl",
      tab: "ssl",
      title: "SSL monitoring",
      subtitle: `${sslStats.expiring15 + sslStats.critical7} expiring soon · ${sslStats.expired} expired`,
      tone:
        sslStats.expired > 0 || sslStats.critical7 > 0
          ? "border-red-500/40 bg-red-500/10"
          : "border-lime-500/40 bg-lime-500/10",
      value: String(sslStats.total),
      accent: `${sslStats.total ? Math.max(8, Math.round((sslStats.ok / sslStats.total) * 100)) : 8}%`,
      sparkColor: "#84cc16",
      spark: miniHistory.ssl,
    },
    {
      id: "alerts",
      tab: "alerts",
      title: "Alerts",
      subtitle: `${alertPriority.high} high · ${alertPriority.medium} medium`,
      tone:
        alertPriority.high > 0
          ? "border-red-500/40 bg-red-500/10"
          : "border-amber-500/40 bg-amber-500/10",
      value: String(alertPriority.total),
      accent: `${Math.max(8, Math.min(100, alertPriority.total * 4))}%`,
      sparkColor: "#f59e0b",
      spark: miniHistory.alerts,
    },
  ];

  const showModule = (id) => activeModule === "all" || activeModule === id;

  useEffect(() => {
    setMiniHistory((prev) => ({
      services: [...prev.services, Number(metrics.successRate) || 0].slice(-20),
      smoke: [...prev.smoke, smokeStats.total ? Math.round((smokeStats.pass / smokeStats.total) * 100) : 0].slice(-20),
      k8: [...prev.k8, Number(k8Stats.availability) || 0].slice(-20),
      ssl: [...prev.ssl, sslStats.total ? Math.round((sslStats.ok / sslStats.total) * 100) : 0].slice(-20),
      alerts: [...prev.alerts, Math.min(100, alertPriority.total)].slice(-20),
    }));
  }, [metrics.successRate, smokeStats.total, smokeStats.pass, k8Stats.availability, sslStats.total, sslStats.ok, alertPriority.total]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
            Live metrics from backend · poll every {pollIntervalMs / 1000}s
          </p>
          {lastPollAt && (
            <p className="mt-1 font-mono text-[10px] text-slate-500 dark:text-saas-muted">
              Last sync: {new Date(lastPollAt).toLocaleString()}
            </p>
          )}
          {configMeta?.last_loaded_at && (
            <p className="mt-1 font-mono text-[10px] text-slate-500 dark:text-saas-muted">
              Config loaded at: {new Date(configMeta.last_loaded_at).toLocaleString()}
            </p>
          )}
        </div>
        {loading && (
          <span className="flex items-center gap-2 text-xs text-indigo-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-400" />
            Syncing…
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <MetricCard key={c.label} label={c.label} value={c.value} hint={c.hint} variant={c.variant} />
        ))}
      </div>

      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#0F172A] via-[#111827] to-[#1E1B4B] p-5 shadow-[0_10px_35px_rgba(56,189,248,0.15)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Unified Monitoring Command Center</h3>
            <p className="mt-1 text-xs text-slate-300/90">
              Interactive live snapshot across services, smoke, kubernetes, SSL, and alerts.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-200">
            <span className="inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-400/10 px-2 py-0.5">
              Alerts: {alertPriority.total}
            </span>
            <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5">
              Sync: {packLoading ? "Running" : "Live"}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {moduleCards.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setActiveModule((curr) => (curr === m.id ? "all" : m.id));
                onNavigate(m.tab);
              }}
              className={`group relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${m.tone} ${activeModule === m.id ? "ring-2 ring-cyan-300/60" : ""}`}
            >
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
                <div className="h-full bg-white/50 transition-all duration-700" style={{ width: m.accent }} />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-100">{m.title}</p>
                  <p className="mt-1 text-[11px] text-slate-300">{m.subtitle}</p>
                </div>
                <p className="text-lg font-semibold text-white">{m.value}</p>
              </div>
              <div className="mt-2">
                <MiniSparkline points={m.spark} color={m.sparkColor} />
              </div>
              <p className="mt-1 text-[10px] text-slate-300">Click to open {m.title} tab</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Data source stats</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700">
            <p className="text-slate-500 dark:text-saas-muted">Services loaded</p>
            <p className="mt-1 text-lg font-semibold">{configMeta?.entry_counts?.services ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700">
            <p className="text-slate-500 dark:text-saas-muted">Smoke configs loaded</p>
            <p className="mt-1 text-lg font-semibold">{configMeta?.entry_counts?.smoke_tests ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700">
            <p className="text-slate-500 dark:text-saas-muted">Patching groups loaded</p>
            <p className="mt-1 text-lg font-semibold">{configMeta?.entry_counts?.patching_groups ?? 0}</p>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500 dark:text-saas-muted">
          Last file updates:
          {" "}
          VM: {configMeta?.files?.services_vm?.last_updated ? new Date(configMeta.files.services_vm.last_updated).toLocaleString() : "N/A"}
          {" | "}
          K8: {configMeta?.files?.services_k8?.last_updated ? new Date(configMeta.files.services_k8.last_updated).toLocaleString() : "N/A"}
          {" | "}
          Tools: {configMeta?.files?.services_tools?.last_updated ? new Date(configMeta.files.services_tools.last_updated).toLocaleString() : "N/A"}
          {" | "}
          Smoke: {configMeta?.files?.smoke_tests?.last_updated ? new Date(configMeta.files.smoke_tests.last_updated).toLocaleString() : "N/A"}
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIssuesOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-saas-fg dark:hover:bg-saas-elevated"
          >
            View validation issues
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MetricsTrendCharts metricsHistory={metricsHistory} />
        </div>
        <InsightsPanel insights={insights} />
      </div>

      {showModule("smoke") && (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.06] p-5 transition-all duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-cyan-100">Smoke Test Live Stats</h3>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">PASS {smokeStats.pass}</span>
              <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300">FAIL {smokeStats.fail}</span>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">RUNNING {smokeStats.running}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-cyan-100/80">Latest runs are aggregated from both API and Browser smoke modes.</p>
        </div>
      )}

      {showModule("k8") && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.07] p-5 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-indigo-100">Kubernetes Health Overview</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            {[
              ["Clusters", k8Stats.total],
              ["UP", k8Stats.up],
              ["DEGRADED", k8Stats.degraded],
              ["DOWN", k8Stats.down],
              ["Availability", `${k8Stats.availability}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-3">
                <p className="text-[11px] text-slate-600 dark:text-indigo-100/80">{k}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-indigo-100">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModule("ssl") && (
        <div className="rounded-2xl border border-lime-500/30 bg-lime-500/[0.06] p-5 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-lime-100">SSL Certificate Risk Board</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-6">
            {[
              ["Domains", sslStats.total, "text-slate-900 dark:text-lime-100"],
              ["OK", sslStats.ok, "text-emerald-700 dark:text-emerald-300"],
              ["Expiring 15d", sslStats.expiring15, "text-amber-700 dark:text-amber-300"],
              ["Critical 7d", sslStats.critical7, "text-orange-700 dark:text-orange-300"],
              ["Expired", sslStats.expired, "text-rose-700 dark:text-rose-300"],
              ["Errors", sslStats.errors, "text-red-700 dark:text-red-300"],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-xl border border-lime-400/30 bg-lime-400/10 p-3">
                <p className="text-[11px] text-slate-600 dark:text-lime-100/80">{k}</p>
                <p className={`mt-1 text-lg font-semibold ${tone}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-amber-100">Alerts Console</h3>
          <div className="flex items-center gap-2">
            {[
              ["all", `All (${alertPriority.total})`],
              ["high", `High (${alertPriority.high})`],
              ["medium", `Medium (${alertPriority.medium})`],
              ["low", `Low (${alertPriority.low})`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAlertPriorityFilter(id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  alertPriorityFilter === id
                    ? "border-amber-500 bg-amber-500/20 text-amber-800 dark:border-amber-300 dark:text-amber-100"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-800/90 hover:bg-amber-500/15 dark:border-amber-300/30 dark:text-amber-100/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
          {filteredAlerts.slice(0, 20).map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border px-3 py-2 text-xs transition duration-300 hover:translate-x-0.5 ${
                a.priority === "high"
                  ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-100"
                  : a.priority === "medium"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-100"
                    : "border-slate-500/40 bg-slate-500/10 text-slate-800 dark:text-slate-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold">{a.type || "alert"}</p>
                <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] uppercase">{a.priority || "low"}</span>
              </div>
              <p className="mt-1 line-clamp-2 opacity-90">{a.message}</p>
            </div>
          ))}
          {!filteredAlerts.length && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
              No alerts for the selected priority.
            </p>
          )}
        </div>
      </div>

      <FailureSection failureRecords={failureRecords} distribution={failureDistribution} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ServiceBreakdownChart breakdown={serviceBreakdown} />
        <PatchingRunTimeline runs={patching.timeline} />
      </div>
      <LogsDrawer
        open={issuesOpen}
        onClose={() => setIssuesOpen(false)}
        title="Config Validation Issues"
        subtitle={`Count: ${configMeta?.validation_issue_count ?? 0}`}
        content={issuesText}
      />
    </div>
  );
}
