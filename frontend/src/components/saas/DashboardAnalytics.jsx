import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { stroke: "#475569", fontSize: 10 };
const grid = { stroke: "#1e293b", strokeDasharray: "3 3" };

export function InsightsPanel({ insights }) {
  if (!insights?.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Smart insights</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-saas-muted">No rule-based signals right now.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Smart insights (AIOps lite)</h3>
      <ul className="mt-3 space-y-2">
        {insights.map((ins) => (
          <li
            key={ins.id}
            className={`rounded-xl border px-3 py-2 text-xs ${
              ins.severity === "critical"
                ? "border-red-500/30 bg-red-500/5 text-red-200"
                : ins.severity === "warning"
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
                  : "border-slate-600/40 bg-slate-500/5 text-slate-300"
            }`}
          >
            <span className="font-semibold">{ins.title}</span>
            <span className="mt-0.5 block text-[11px] opacity-90">{ins.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FailureSection({ failureRecords, distribution }) {
  const entries = Object.entries(distribution || {}).filter(([, v]) => v > 0);
  const chartData = entries.map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Recent failures</h3>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
          {(failureRecords || []).slice(0, 12).map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200/80 px-2 py-1.5 dark:border-slate-700">
              <div className="font-medium text-slate-800 dark:text-saas-fg">{f.service}</div>
              <div className="font-mono text-[10px] text-slate-500 dark:text-saas-muted">{f.errorType}</div>
              <div className="truncate text-[10px] text-slate-500">{f.message}</div>
            </div>
          ))}
          {!failureRecords?.length && (
            <p className="text-slate-500 dark:text-saas-muted">No failing checks in current view.</p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Failure distribution</h3>
        <div className="mt-2 h-48 w-full">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" tick={axis} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={axis} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="pt-8 text-center text-xs text-slate-500">No failure data</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServiceBreakdownChart({ breakdown }) {
  const data = (breakdown || []).slice(0, 20).map((s) => ({
    name: s.name.length > 14 ? `${s.name.slice(0, 12)}…` : s.name,
    full: s.name,
    rate: s.successRate,
  }));

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Service success rate</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-saas-muted">Per service (aggregated across env/region rows)</p>
      <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
        {data.map((s) => (
          <div key={s.full} className="flex items-center gap-2 text-xs" title={s.full}>
            <span className="w-28 shrink-0 truncate font-mono text-[10px] text-slate-500 dark:text-saas-muted">{s.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  s.rate >= 95 ? "bg-emerald-500" : s.rate >= 80 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${s.rate}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-[10px]">{s.rate}%</span>
          </div>
        ))}
        {!data.length && <p className="text-xs text-slate-500">No data</p>}
      </div>
    </div>
  );
}

export function MetricsTrendCharts({ metricsHistory }) {
  const trend = (metricsHistory || []).map((m, idx) => ({
    n: idx + 1,
    time: new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    successRate: m.successRate,
    avgLatency: m.avgLatency,
    failures: m.failureCount,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Success rate trend</h3>
        <div className="mt-2 h-52 w-full">
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="n" tick={axis} />
                <YAxis domain={[0, 100]} tick={axis} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                  labelFormatter={(_, p) => (p?.[0] ? `Poll #${p[0].payload.n} @ ${p[0].payload.time}` : "")}
                />
                <Line type="monotone" dataKey="successRate" stroke="#22c55e" strokeWidth={2} dot={false} name="%" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="pt-16 text-center text-xs text-slate-500">Collecting polls… (needs 2+ data points)</p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Response time trend</h3>
        <div className="mt-2 h-52 w-full">
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="n" tick={axis} />
                <YAxis tick={axis} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                />
                <Line type="monotone" dataKey="avgLatency" stroke="#6366f1" strokeWidth={2} dot={false} name="ms" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="pt-16 text-center text-xs text-slate-500">Collecting polls…</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PatchingRunTimeline({ runs }) {
  const list = [...(runs || [])].slice(0, 10);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Patching run timeline</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-saas-muted">Last 10 runs (green = pass, red = fail)</p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {list.map((r, i) => (
          <div
            key={`${r.completed_at}-${i}`}
            className={`h-8 w-8 rounded-lg transition hover:scale-110 ${
              r.status === "PASS" ? "bg-emerald-500/80 shadow-[0_0_12px_rgba(34,197,94,0.35)]" : "bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.35)]"
            }`}
            title={`${r.status} @ ${r.completed_at ? new Date(r.completed_at).toLocaleString() : ""}`}
          />
        ))}
        {!list.length && <span className="text-xs text-slate-500">No runs yet — run a patching test.</span>}
      </div>
    </div>
  );
}
