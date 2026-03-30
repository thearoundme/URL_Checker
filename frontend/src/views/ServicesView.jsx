import { useState } from "react";
import { Filters } from "../components/Filters";
import { ServiceTable } from "../components/ServiceTable";
import { SummaryBar } from "../components/SummaryBar";
import { useObservability } from "../context/ObservabilityContext";

export function ServicesView({
  filters,
  setFilters,
  appOptions,
  refresh,
  resetFilters,
  liveMode,
  setLiveMode,
  incidentMode,
  setIncidentMode,
  loading,
  error,
  statusRows,
  summary,
  selectedNames,
  selectService,
  toggleRow,
  toggleSelectAllVisible,
  recheckSelected,
  searchQuery,
  setSearchQuery,
  retryFailedEndpoints,
  pollIntervalMs,
}) {
  const { allStatusRows } = useObservability();
  const [statusDrilldown, setStatusDrilldown] = useState("ALL");
  const downCount = allStatusRows.filter((r) => r.status === "DOWN").length;
  const tableRows =
    statusDrilldown === "ALL"
      ? statusRows
      : statusDrilldown === "AVAILABLE"
        ? statusRows.filter((r) => r.status !== "DOWN")
        : statusRows.filter((r) => r.status === statusDrilldown);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Services</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
            Auto-refresh every {pollIntervalMs ? pollIntervalMs / 1000 : 12}s · filter & search below
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!downCount || loading}
            onClick={retryFailedEndpoints}
            className="flex h-10 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-semibold text-amber-700 transition duration-250 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300"
          >
            Retry failed ({downCount})
          </button>
          <button
            type="button"
            disabled={!selectedNames.size || loading}
            onClick={recheckSelected}
            className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-glow-sm transition duration-250 hover:scale-[1.02] hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            Recheck selected
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search name, URL, env…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-fg"
        />
      </div>

      <Filters
        filters={filters}
        setFilters={setFilters}
        appOptions={appOptions}
        refresh={refresh}
        resetFilters={resetFilters}
        liveMode={liveMode}
        setLiveMode={setLiveMode}
        incidentMode={incidentMode}
        setIncidentMode={setIncidentMode}
      />

      <SummaryBar summary={summary} onStatusDrilldown={setStatusDrilldown} activeStatus={statusDrilldown} />

      {loading && (
        <p className="text-xs text-slate-500 dark:text-saas-muted">Refreshing data…</p>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <ServiceTable
        rows={tableRows}
        onSelect={selectService}
        selectedNames={selectedNames}
        onToggleRow={toggleRow}
        onToggleAll={toggleSelectAllVisible}
      />
    </div>
  );
}
