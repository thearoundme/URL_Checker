import { useSmokeTests } from "../hooks/useSmokeTests";

const REGION_OPTIONS = ["EAST", "WEST"];
const FLOW_STEPS = [
  "login",
  "search",
  "product_page",
  "add_to_cart",
  "checkout",
  "address",
  "payment",
  "confirmation",
];

export function SmokeTestsPanel() {
  const {
    brand,
    setBrand,
    env,
    setEnv,
    region,
    setRegion,
    running,
    error,
    latest,
    history,
    targets,
    brandOptions,
    envOptions,
    targetUrl,
    setTargetUrl,
    mode,
    setMode,
    canRun,
    run,
  } = useSmokeTests();

  const stepByName = new Map((latest?.steps || []).map((s) => [s.step, s]));
  const currentStep = latest?.current_step || "";
  const currentIndex = FLOW_STEPS.indexOf(currentStep);
  const failedIndex = latest?.failed_step ? FLOW_STEPS.indexOf(latest.failed_step) : -1;

  const stepState = (step, index) => {
    const row = stepByName.get(step);
    if (row?.status === "PASS") return "PASS";
    if (row?.status === "FAIL") return "FAIL";
    if (latest?.status === "RUNNING" && currentIndex === index) return "RUNNING";
    if (failedIndex >= 0 && index > failedIndex) return "SKIPPED";
    return "PENDING";
  };

  const badgeClass = (state) => {
    if (state === "PASS") return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25";
    if (state === "FAIL") return "bg-red-500/15 text-red-400 ring-1 ring-red-500/25";
    if (state === "RUNNING") return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25";
    if (state === "SKIPPED") return "bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20";
    return "bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20";
  };

  const selectCls =
    "mt-1 h-10 w-full min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-fg";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">Mode</p>
            <div className="mt-1 inline-flex rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode("api")}
                className={`h-10 px-3 text-xs font-semibold transition ${
                  mode === "api"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-slate-600 dark:text-saas-muted"
                }`}
              >
                API (may 403 on real sites)
              </button>
              <button
                type="button"
                onClick={() => setMode("browser")}
                className={`h-10 px-3 text-xs font-semibold transition ${
                  mode === "browser"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-600 dark:text-saas-muted"
                }`}
              >
                Browser (recommended for prod sites)
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">Brand</p>
            <select className={selectCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
              {brandOptions.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
              Environment
            </p>
            <select className={selectCls} value={env} onChange={(e) => setEnv(e.target.value)}>
              {envOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">Region</p>
            <select className={selectCls} value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGION_OPTIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`ml-auto flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-semibold transition duration-250 ${
              canRun
                ? "bg-indigo-600 text-white shadow-glow hover:scale-[1.02] hover:bg-indigo-500"
                : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-saas-elevated dark:text-saas-muted"
            }`}
            disabled={!canRun}
            onClick={run}
          >
            {running && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {running ? "Running…" : "Run smoke test"}
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        {targets.length > 0 ? (
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">Target URL</p>
            <div className="mt-2 space-y-2 text-xs">
              {targets.map((t) => (
                <label key={t.url} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 p-2 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-saas-elevated/50">
                  <input type="radio" className="h-3.5 w-3.5 accent-indigo-600" value={t.url} checked={targetUrl === t.url} onChange={(e) => setTargetUrl(e.target.value)} />
                  <span className="font-medium text-slate-800 dark:text-saas-fg">{t.label}</span>
                  <span className="truncate text-slate-500 dark:text-saas-muted">{t.url}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-amber-500">No smoke config for this brand / env / region.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Current run</h2>
          {latest ? (
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-saas-fg/90">
                  {latest.brand} / {latest.env} / {latest.region}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25">
                  {(latest.mode || "api").toUpperCase()}
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 text-[11px] font-semibold ${
                    latest.status === "PASS"
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25"
                      : latest.status === "RUNNING"
                        ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25"
                        : "bg-red-500/15 text-red-400 ring-1 ring-red-500/25"
                  }`}
                >
                  {latest.status}
                </span>
              </div>
              <div className="text-slate-600 dark:text-saas-muted">Total time: {latest.total_time} ms</div>
              {latest.current_step && (
                <div className="font-semibold text-amber-500">Current step: {latest.current_step}</div>
              )}
              {latest.failed_step && <div className="font-semibold text-red-400">Failed step: {latest.failed_step}</div>}
              {latest.debug_message && (
                <div className="rounded-lg border border-slate-200/80 bg-slate-950 p-2 font-mono text-[10px] text-emerald-400/90 dark:border-slate-800">
                  {latest.debug_message}
                </div>
              )}
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-saas-elevated dark:text-saas-muted">
                    <tr>
                      <th className="px-2 py-2">Step</th>
                      <th className="px-2 py-2">St</th>
                      <th className="px-2 py-2">HTTP</th>
                      <th className="px-2 py-2">ms</th>
                      <th className="px-2 py-2">URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {latest.steps.map((step) => (
                      <tr key={step.step}>
                        <td className="px-2 py-1.5 text-slate-800 dark:text-saas-fg">{step.step}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              step.status === "PASS"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-red-500/15 text-red-400"
                            }`}
                          >
                            {step.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono">{step.http_status || "-"}</td>
                        <td className="px-2 py-1.5 font-mono">{step.latency}</td>
                        <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[10px]" title={step.request_url}>
                          {step.request_url || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-saas-muted">No run yet for this selection.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Recent runs</h2>
          <div className="mt-3 max-h-80 overflow-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
                <tr>
                  <th className="py-2">Time</th>
                  <th className="py-2">Env</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Fail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((run) => (
                  <tr key={run.run_id} className="text-slate-700 dark:text-saas-muted">
                    <td className="py-2 font-mono text-[10px]">{new Date(run.timestamp).toLocaleString()}</td>
                    <td className="py-2">
                      {run.env}/{run.region}
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          run.status === "PASS"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2">{run.failed_step || "—"}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td className="py-6 text-center text-slate-500 dark:text-saas-muted" colSpan={4}>
                      No history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Live step monitor</h2>
          <span className="text-xs text-slate-500 dark:text-saas-muted">
            {latest?.target_url ? latest.target_url : "Select target"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">Ordered execution and failure point.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {FLOW_STEPS.map((step, index) => {
            const state = stepState(step, index);
            const detail = stepByName.get(step);
            return (
              <div
                key={step}
                className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs transition duration-250 hover:border-indigo-500/20 dark:border-slate-800 dark:bg-saas-bg"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 dark:text-saas-fg">
                    {index + 1}. {step}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass(state)}`}>{state}</span>
                </div>
                <div className="mt-2 space-y-1 text-slate-600 dark:text-saas-muted">
                  <div>HTTP: {detail?.http_status ?? "—"}</div>
                  <div>Latency: {detail?.latency ? `${detail.latency} ms` : "—"}</div>
                  <div className="truncate font-mono text-[10px]" title={detail?.request_url}>
                    {detail?.request_url || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {latest?.status === "FAIL" && (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">
            Failed at <span className="font-semibold">{latest.failed_step}</span>.{" "}
            {(latest.mode || mode) === "api"
              ? "External sites often return 403 to non-browser clients (bot protection). Switch to Browser mode."
              : "Browser mode failed; inspect URL/credentials/selectors and retry."}
          </div>
        )}
      </div>
    </div>
  );
}
