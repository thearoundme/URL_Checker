function severityStyle(sev) {
  if (sev === "critical") return "border-red-500/35 bg-red-500/8";
  if (sev === "warning") return "border-amber-500/35 bg-amber-500/8";
  return "border-slate-500/25 bg-slate-500/5";
}

export function AlertPanel({ alerts }) {
  if (!alerts?.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">No active alerts</h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-saas-muted">Systems look clear.</p>
      </div>
    );
  }

  const limited = alerts.slice(0, 80);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-saas-surface">
      <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-saas-elevated/90">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Alerts</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-saas-muted">{limited.length} shown</p>
      </div>
      <div className="max-h-[min(70vh,520px)] space-y-2 overflow-auto p-4">
        {limited.map((alert, idx) => {
          const sev = alert.severity || (alert.priority === "high" ? "critical" : "warning");
          const dedupCount = alert.count && alert.count > 1 ? ` ×${alert.count}` : "";
          return (
            <div
              key={alert.id || `${alert.type}-${alert.env}-${alert.region}-${idx}`}
              className={`rounded-xl border p-4 text-xs transition duration-250 hover:opacity-95 ${severityStyle(sev)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold uppercase tracking-wide text-slate-800 dark:text-saas-fg">
                  {String(alert.type || "alert").replace(/_/g, " ")}
                  {dedupCount}
                </span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-white/10 dark:text-saas-muted">
                  {sev}
                </span>
              </div>
              <p className="mt-2 text-slate-700 dark:text-saas-fg/90">{alert.message}</p>
              <p className="mt-2 font-mono text-[10px] text-slate-500 dark:text-saas-muted">
                {alert.env} / {alert.region}
                {alert.impacted?.length ? ` · ${alert.impacted.join(", ")}` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
