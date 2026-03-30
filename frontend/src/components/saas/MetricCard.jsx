export function MetricCard({ label, value, hint, variant = "default" }) {
  const ring =
    variant === "success"
      ? "ring-1 ring-emerald-500/20"
      : variant === "error"
        ? "ring-1 ring-red-500/20"
        : variant === "warning"
          ? "ring-1 ring-amber-500/20"
          : "ring-1 ring-indigo-500/15";

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-250 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-saas-surface ${ring}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] to-transparent opacity-0 transition-opacity duration-250 group-hover:opacity-100 dark:from-indigo-400/[0.06]" />
      <p className="relative text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
        {label}
      </p>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-saas-fg">
        {value}
      </p>
      {hint && (
        <p className="relative mt-1 text-xs text-slate-500 dark:text-saas-muted">{hint}</p>
      )}
    </div>
  );
}
