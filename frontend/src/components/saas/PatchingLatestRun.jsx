export function PatchingLatestRun({ latest, onViewDetails }) {
  if (!latest) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 dark:border-slate-700 dark:bg-saas-surface/50">
        <p className="text-sm font-medium text-slate-600 dark:text-saas-muted">No run yet</p>
        <p className="mt-1 text-center text-xs text-slate-500 dark:text-saas-muted">
          Select a group and run a patching test to see results here.
        </p>
      </div>
    );
  }

  const durationMs =
    latest.started_at && latest.completed_at
      ? new Date(latest.completed_at) - new Date(latest.started_at)
      : null;
  const failed = latest.failed_hosts?.length || 0;
  const previewLines = (latest.results || []).slice(0, 5).map((r) => {
    const line = `${r.service} | httpd:${r.httpd} tomcat:${r.tomcat} url:${r.url_status}`;
    return r.error_message ? `${line} | ${r.error_message}` : line;
  });

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
            Latest run
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-saas-fg">{latest.group}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            latest.status === "PASS"
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
              : "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
          }`}
        >
          {latest.status}
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-slate-500 dark:text-saas-muted">Execution time</dt>
          <dd className="mt-0.5 font-medium text-slate-900 dark:text-saas-fg">
            {durationMs != null ? `${durationMs} ms` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-saas-muted">Failures</dt>
          <dd className="mt-0.5 font-medium text-slate-900 dark:text-saas-fg">{failed} hosts</dd>
        </div>
      </dl>
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
          Logs preview
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-emerald-400/90 dark:border-slate-700">
          {previewLines.length ? previewLines.join("\n") : "No result rows."}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onViewDetails?.(latest)}
        className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-saas-fg dark:hover:bg-saas-elevated"
      >
        View details
      </button>
    </div>
  );
}
