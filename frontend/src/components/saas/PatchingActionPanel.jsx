export function PatchingActionPanel({
  groups,
  groupName,
  onGroupChange,
  selectedDescription,
  running,
  onRun,
  error,
  runScopeLabel,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm dark:border-slate-800 dark:from-saas-surface dark:to-saas-bg">
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Control center
          </p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Run manual validation</h2>
          <p className="max-w-xl text-sm text-slate-500 dark:text-saas-muted">
            Execute httpd, tomcat, and URL checks for selected targets as part of manual testing.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-saas-muted">
              Manual test group
            </label>
            <select
              className="h-11 min-w-[200px] rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-fg"
              value={groupName}
              onChange={(e) => onGroupChange(e.target.value)}
            >
              {groups.length ? (
                groups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))
              ) : (
                <option value="">No matching groups</option>
              )}
            </select>
          </div>
          {runScopeLabel && (
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {runScopeLabel}
            </span>
          )}
          <button
            type="button"
            disabled={!groupName || running || !groups.length}
            onClick={onRun}
            className="group flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-glow transition duration-250 hover:scale-[1.02] hover:bg-indigo-500 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {running ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running…
              </>
            ) : (
              <>
                <span className="text-base transition group-hover:scale-110">▶</span>
                Run Manual Test
              </>
            )}
          </button>
        </div>
      </div>
      {selectedDescription && (
        <p className="relative mt-4 text-xs text-slate-600 dark:text-saas-muted">{selectedDescription}</p>
      )}
      <div className="relative mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-saas-muted dark:hover:bg-saas-elevated"
        >
          Schedule
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-saas-muted dark:hover:bg-saas-elevated"
        >
          Configure
        </button>
      </div>
      {error && (
        <p className="relative mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
