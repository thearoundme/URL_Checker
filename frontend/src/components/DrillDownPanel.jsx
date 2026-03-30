export function DrillDownPanel({ selectedService, drilldown, anomalies }) {
  const latest = drilldown?.latest || null;
  const versionInfo = (() => {
    if (!drilldown?.environment_history) return null;
    const versionsByEnv = {};
    Object.entries(drilldown.environment_history).forEach(([envKey, rows]) => {
      const versions = Array.from(new Set(rows.map((r) => r.app_version).filter(Boolean)));
      versionsByEnv[envKey] = versions;
    });
    const allVersions = Array.from(
      new Set(
        Object.values(versionsByEnv)
          .flat()
          .filter(Boolean)
      )
    );
    if (!allVersions.length) return null;
    const mismatch = allVersions.length > 1;
    return { versionsByEnv, mismatch };
  })();
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Drill-Down</h2>
      {!selectedService ? (
        <p className="mt-2 text-sm text-slate-400">Select a service from the table to view trend and history.</p>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-cyan-300">{selectedService}</p>
          {latest && (
            <div className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300 space-y-1">
              <div>URL: {latest.url}</div>
              <div>Status: {latest.status}</div>
              {latest.app_version && <div>Version: {latest.app_version}</div>}
              {latest.category === "tool" && <div className="text-blue-300">Infrastructure Tool</div>}
            </div>
          )}
          {versionInfo && (
            <div className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <span>Version by Env/Region</span>
                {versionInfo.mismatch && (
                  <span className="rounded bg-amber-600/30 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                    VERSION MISMATCH
                  </span>
                )}
              </div>
              {Object.entries(versionInfo.versionsByEnv).map(([envKey, versions]) => (
                <div key={envKey}>
                  {envKey}: {versions.length ? versions.join(", ") : "N/A"}
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Environment comparison</p>
            <div className="mt-1 text-xs text-slate-300">
              {drilldown?.environment_history
                ? Object.keys(drilldown.environment_history).map((env) => (
                    <div key={env}>
                      {env}: {drilldown.environment_history[env].length} recent samples
                    </div>
                  ))
                : "No history yet"}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Last failures</p>
            <div className="mt-1 text-xs text-slate-300">
              {(drilldown?.environment_history &&
                Object.values(drilldown.environment_history)
                  .flat()
                  .filter((item) => item.status === "DOWN")
                  .slice(-5)
                  .map((item, idx) => (
                    <div key={idx}>
                      {item.env} at {item.timestamp}: {item.error_message || "No message"}
                    </div>
                  ))) || "No failures in current window"}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Latency trend (recent)</p>
            <div className="mt-1 text-xs text-slate-300">
              {(drilldown?.environment_history &&
                Object.entries(drilldown.environment_history).map(([envKey, rows]) => {
                  const values = rows.slice(-5).map((entry) => `${entry.latency_ms}ms`).join(", ");
                  return (
                    <div key={envKey}>
                      {envKey}: {values || "-"}
                    </div>
                  );
                })) ||
                "No trend data yet"}
            </div>
          </div>
        </div>
      )}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Current anomalies</p>
        <p className="text-sm text-amber-300">{anomalies.length} anomalous services</p>
      </div>
    </div>
  );
}
