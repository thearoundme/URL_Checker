function Card({ title, value, hint, onClick, active }) {
  const cls = `group rounded-2xl border p-4 shadow-sm transition-all duration-250 ${
    active
      ? "border-indigo-500/50 bg-indigo-500/10"
      : "border-slate-200/80 bg-white hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-saas-surface"
  }`;
  if (!onClick) {
    return (
      <div className={cls}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">{title}</p>
        <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-saas-fg">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-saas-muted">{hint}</p>}
      </div>
    );
  }
  return (
    <button type="button" className={`${cls} text-left`} onClick={onClick}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">{title}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-saas-fg">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-saas-muted">{hint}</p>}
    </button>
  );
}

export function SummaryBar({ summary, onStatusDrilldown, activeStatus }) {
  const safe = summary || {
    total: 0,
    up: 0,
    down: 0,
    degraded: 0,
    availability_pct: 0,
    average_latency_ms: 0,
    by_category: {},
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card title="Total" value={safe.total} onClick={() => onStatusDrilldown?.("ALL")} active={activeStatus === "ALL"} />
        <Card title="UP" value={safe.up} hint="Healthy" onClick={() => onStatusDrilldown?.("UP")} active={activeStatus === "UP"} />
        <Card
          title="DOWN"
          value={safe.down}
          hint="Needs attention"
          onClick={() => onStatusDrilldown?.("DOWN")}
          active={activeStatus === "DOWN"}
        />
        <Card title="Degraded" value={safe.degraded} onClick={() => onStatusDrilldown?.("DEGRADED")} active={activeStatus === "DEGRADED"} />
        <Card title="Availability" value={`${safe.availability_pct}%`} onClick={() => onStatusDrilldown?.("AVAILABLE")} active={activeStatus === "AVAILABLE"} />
        <Card title="Avg latency" value={`${safe.average_latency_ms} ms`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          title="Applications"
          value={`${safe.by_category?.application?.up || 0} / ${safe.by_category?.application?.total || 0}`}
          hint="UP / total"
        />
        <Card
          title="Tools"
          value={`${safe.by_category?.tool?.up || 0} / ${safe.by_category?.tool?.total || 0}`}
          hint="UP / total"
        />
      </div>
    </div>
  );
}
