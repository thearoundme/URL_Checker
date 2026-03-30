const ENV_OPTIONS = ["ALL", "prod", "UAT", "UAT2", "UAT3"];
const REGION_OPTIONS = ["ALL", "EAST", "WEST"];
const PLATFORM_OPTIONS = ["ALL", "VM", "K8"];
const CATEGORY_OPTIONS = ["ALL", "application", "tool"];

function ToggleGroup({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-saas-elevated">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition duration-200 ${
              value === option
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-saas-surface dark:text-saas-muted dark:hover:bg-slate-800/70"
            }`}
            onClick={() => onChange(option)}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Filters({
  filters,
  setFilters,
  appOptions,
  refresh,
  resetFilters,
  liveMode,
  setLiveMode,
  incidentMode,
  setIncidentMode,
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            label="Environment"
            value={filters.env}
            options={ENV_OPTIONS}
            onChange={(env) => setFilters((prev) => ({ ...prev, env }))}
          />
          <ToggleGroup
            label="Platform"
            value={filters.platform}
            options={PLATFORM_OPTIONS}
            onChange={(platform) => setFilters((prev) => ({ ...prev, platform }))}
          />
          <ToggleGroup
            label="Region"
            value={filters.region}
            options={REGION_OPTIONS}
            onChange={(region) => setFilters((prev) => ({ ...prev, region }))}
          />
          <ToggleGroup
            label="Category"
            value={filters.category}
            options={CATEGORY_OPTIONS}
            onChange={(category) => setFilters((prev) => ({ ...prev, category }))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-saas-elevated">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
              Application
            </span>
            <select
              className="h-8 min-w-[150px] rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-saas-surface dark:text-saas-fg"
              value={filters.appName}
              onChange={(event) => setFilters((prev) => ({ ...prev, appName: event.target.value }))}
            >
              {appOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-8 rounded-lg bg-indigo-600 px-3.5 text-[11px] font-semibold text-white shadow-glow-sm transition duration-200 hover:bg-indigo-500"
            onClick={refresh}
          >
            Refresh
          </button>
          <button
            type="button"
            className="h-8 rounded-lg border border-slate-200 px-3.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-saas-fg dark:hover:bg-saas-elevated"
            onClick={resetFilters}
          >
            Reset filters
          </button>
          <button
            type="button"
            className={`h-8 rounded-lg border px-3.5 text-[11px] font-semibold transition ${
              liveMode
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-saas-muted"
            }`}
            onClick={() => setLiveMode((prev) => !prev)}
          >
            Live {liveMode ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={`h-8 rounded-lg border px-3.5 text-[11px] font-semibold transition ${
              incidentMode
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400"
                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-saas-muted"
            }`}
            onClick={() => setIncidentMode((prev) => !prev)}
          >
            Incident {incidentMode ? "ON" : "OFF"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
