import { useCallback, useEffect, useMemo, useState } from "react";
import { useObservability } from "../context/ObservabilityContext";
import { MetricCard } from "../components/saas/MetricCard";
import { PatchingActionPanel } from "../components/saas/PatchingActionPanel";
import { PatchingLatestRun } from "../components/saas/PatchingLatestRun";
import { PatchingRunHistory } from "../components/saas/PatchingRunHistory";
import { LogsDrawer } from "../components/saas/LogsDrawer";

function formatRunLog(run) {
  if (!run) return "";
  if (run._logText) return run._logText;
  const lines = [
    `group: ${run.group}`,
    `status: ${run.status}`,
    `started_at: ${run.started_at}`,
    `completed_at: ${run.completed_at}`,
    `failed_hosts: ${JSON.stringify(run.failed_hosts || [])}`,
    "--- results ---",
  ];
  (run.results || []).forEach((r, i) => {
    lines.push(
      `[${i}] ${r.service} (${r.env}/${r.region}) httpd=${r.httpd} tomcat=${r.tomcat} url=${r.url_status} latency_ms=${r.latency_ms ?? "-"}`
    );
    if (r.error_message) lines.push(`    error: ${r.error_message}`);
  });
  return lines.join("\n");
}

const ENV_OPTIONS = ["ALL", "PROD", "UAT", "UAT2", "UAT3"];
const REGION_OPTIONS = ["ALL", "EAST", "WEST"];
const PLATFORM_OPTIONS = ["ALL", "VM", "K8"];
const CATEGORY_OPTIONS = ["ALL", "APPLICATION", "TOOL"];

function FilterChips({ label, value, options, onChange }) {
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
            onClick={() => onChange(option)}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
              value === option
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-saas-surface dark:text-saas-muted dark:hover:bg-slate-800/70"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PatchingView() {
  const { patching, allStatusRows } = useObservability();
  const {
    groups,
    groupName,
    setGroupName,
    selectedGroup,
    latest,
    history,
    running,
    error,
    metrics,
    runPatchingTest,
    timeline,
  } = patching;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRun, setDrawerRun] = useState(null);
  const [checkedServers, setCheckedServers] = useState({});
  const [runSelectedOnly, setRunSelectedOnly] = useState(false);
  const [groupFilters, setGroupFilters] = useState({
    env: "ALL",
    region: "ALL",
    platform: "ALL",
    category: "ALL",
    query: "",
  });

  const filteredGroups = useMemo(() => {
    const q = groupFilters.query.trim().toLowerCase();
    return (groups || []).filter((g) => {
      const targets = g.targets || {};
      const env = String(targets.env || "").toUpperCase();
      const region = String(targets.region || "").toUpperCase();
      const platform = String(targets.platform || "").toUpperCase();
      const category = String(targets.category || "").toUpperCase();
      if (groupFilters.env !== "ALL" && env !== groupFilters.env) return false;
      if (groupFilters.region !== "ALL" && region !== groupFilters.region) return false;
      if (groupFilters.platform !== "ALL" && platform !== groupFilters.platform) return false;
      if (groupFilters.category !== "ALL" && category !== groupFilters.category) return false;
      if (!q) return true;
      const hay = `${g.name || ""} ${g.description || ""} ${(g.checks || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [groups, groupFilters]);

  const selectedFilteredGroup = useMemo(
    () => filteredGroups.find((g) => g.name === groupName) || null,
    [filteredGroups, groupName]
  );
  const activeGroup = selectedFilteredGroup || selectedGroup || null;

  const groupServers = useMemo(() => {
    const targets = activeGroup?.targets || {};
    const targetCategory = String(targets.category || "").toLowerCase();
    const targetPlatform = String(targets.platform || "").toLowerCase();
    const targetRegion = String(targets.region || "").toLowerCase();
    const targetEnv = String(targets.env || "").toLowerCase();

    return (allStatusRows || []).filter((s) => {
      if (targetCategory && String(s.category || "").toLowerCase() !== targetCategory) return false;
      if (targetPlatform && String(s.platform || "").toLowerCase() !== targetPlatform) return false;
      if (targetRegion && String(s.region || "").toLowerCase() !== targetRegion) return false;
      if (targetEnv && String(s.env || "").toLowerCase() !== targetEnv) return false;
      return true;
    });
  }, [allStatusRows, activeGroup]);

  const checklistKey = useMemo(() => activeGroup?.name || "__none__", [activeGroup]);
  const checkedForGroup = checkedServers[checklistKey] || {};
  const checkedCount = Object.values(checkedForGroup).filter(Boolean).length;
  const selectedServerNames = useMemo(
    () => groupServers.filter((s) => checkedForGroup[s.name]).map((s) => s.name),
    [groupServers, checkedForGroup]
  );
  const scopeSelectedCount = runSelectedOnly ? selectedServerNames.length : groupServers.length;
  const runScopeLabel = `Scope: ${scopeSelectedCount} selected / ${groupServers.length} eligible`;

  useEffect(() => {
    if (!filteredGroups.length) {
      if (groupName) setGroupName("");
      return;
    }
    if (!filteredGroups.some((g) => g.name === groupName)) {
      setGroupName(filteredGroups[0].name);
    }
  }, [filteredGroups, groupName, setGroupName]);

  const openDrawer = useCallback((runRow) => {
    setDrawerRun(runRow);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const toggleServerCheck = useCallback((serverName) => {
    setCheckedServers((prev) => {
      const mapForGroup = { ...(prev[checklistKey] || {}) };
      mapForGroup[serverName] = !mapForGroup[serverName];
      return { ...prev, [checklistKey]: mapForGroup };
    });
  }, [checklistKey]);

  const toggleAllServers = useCallback(() => {
    setCheckedServers((prev) => {
      const current = { ...(prev[checklistKey] || {}) };
      const allSelected = groupServers.length > 0 && groupServers.every((s) => current[s.name]);
      if (allSelected) {
        groupServers.forEach((s) => {
          current[s.name] = false;
        });
      } else {
        groupServers.forEach((s) => {
          current[s.name] = true;
        });
      }
      return { ...prev, [checklistKey]: current };
    });
  }, [checklistKey, groupServers]);

  const getMatchedServerNamesForGroup = useCallback(
    (group) => {
      const targets = group?.targets || {};
      const targetCategory = String(targets.category || "").toLowerCase();
      const targetPlatform = String(targets.platform || "").toLowerCase();
      const targetRegion = String(targets.region || "").toLowerCase();
      const targetEnv = String(targets.env || "").toLowerCase();
      return (allStatusRows || [])
        .filter((s) => {
          if (targetCategory && String(s.category || "").toLowerCase() !== targetCategory) return false;
          if (targetPlatform && String(s.platform || "").toLowerCase() !== targetPlatform) return false;
          if (targetRegion && String(s.region || "").toLowerCase() !== targetRegion) return false;
          if (targetEnv && String(s.env || "").toLowerCase() !== targetEnv) return false;
          return true;
        })
        .map((s) => s.name);
    },
    [allStatusRows]
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Manual testing</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
          Manually executes backend checks for selected targets; results update metrics and history.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            label="Environment"
            value={groupFilters.env}
            options={ENV_OPTIONS}
            onChange={(env) => setGroupFilters((p) => ({ ...p, env }))}
          />
          <FilterChips
            label="Region"
            value={groupFilters.region}
            options={REGION_OPTIONS}
            onChange={(region) => setGroupFilters((p) => ({ ...p, region }))}
          />
          <FilterChips
            label="Platform"
            value={groupFilters.platform}
            options={PLATFORM_OPTIONS}
            onChange={(platform) => setGroupFilters((p) => ({ ...p, platform }))}
          />
          <FilterChips
            label="Category"
            value={groupFilters.category}
            options={CATEGORY_OPTIONS}
            onChange={(category) => setGroupFilters((p) => ({ ...p, category }))}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            value={groupFilters.query}
            onChange={(e) => setGroupFilters((p) => ({ ...p, query: e.target.value }))}
            placeholder="Search manual test groups..."
            className="h-9 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-fg"
          />
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-saas-muted">
              Groups: {filteredGroups.length}/{groups.length}
            </span>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
              onClick={() =>
                setGroupFilters({ env: "ALL", region: "ALL", platform: "ALL", category: "ALL", query: "" })
              }
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Manual test groups</h3>
          <span className="text-[11px] text-slate-500 dark:text-saas-muted">
            Select one group, then run manual test
          </span>
        </div>
        {filteredGroups.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((g) => {
              const isSelected = g.name === groupName;
              const targets = g.targets || {};
              return (
                <div
                  key={g.name}
                  onClick={() => setGroupName(g.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setGroupName(g.name);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-saas-elevated"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-saas-fg">{g.name}</p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 rounded-full ${isSelected ? "bg-indigo-500 ring-2 ring-indigo-500/30" : "bg-slate-300 dark:bg-slate-600"}`}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (groupName !== g.name) setGroupName(g.name);
                          const checkedForCard = checkedServers[g.name] || {};
                          const eligibleNames = getMatchedServerNamesForGroup(g);
                          const selectedForCard = runSelectedOnly
                            ? eligibleNames.filter((name) => checkedForCard[name])
                            : [];
                          runPatchingTest(g.name, selectedForCard);
                        }}
                        disabled={running}
                        className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-300"
                      >
                        {running && groupName === g.name ? "Running..." : "Run"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-saas-muted">{g.description || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded-md border border-slate-300 px-1.5 py-0.5 dark:border-slate-600">
                      {String(targets.category || "any").toUpperCase()}
                    </span>
                    <span className="rounded-md border border-slate-300 px-1.5 py-0.5 dark:border-slate-600">
                      {String(targets.platform || "any").toUpperCase()}
                    </span>
                    <span className="rounded-md border border-slate-300 px-1.5 py-0.5 dark:border-slate-600">
                      {String(targets.region || "any").toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
            No groups match current filters. Clear filters to see selectable groups.
            <button
              type="button"
              className="ml-2 rounded-md border border-amber-500/40 px-2 py-1 font-semibold hover:bg-amber-500/10"
              onClick={() =>
                setGroupFilters({ env: "ALL", region: "ALL", platform: "ALL", category: "ALL", query: "" })
              }
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Success rate"
          value={metrics.successRate != null ? `${metrics.successRate}%` : "—"}
          hint={`${metrics.historyCount} runs`}
          variant={metrics.successRate != null && metrics.successRate < 80 ? "warning" : "success"}
        />
        <MetricCard
          label="Last run status"
          value={metrics.lastStatus}
          hint={latest?.group || "—"}
          variant={metrics.lastStatus === "FAIL" ? "error" : metrics.lastStatus === "PASS" ? "success" : "default"}
        />
        <MetricCard
          label="Avg response time"
          value={metrics.avgMs != null ? `${metrics.avgMs} ms` : "—"}
          hint="Latest run"
          variant="default"
        />
        <MetricCard
          label="Failures (latest)"
          value={String(metrics.totalFailures)}
          hint="Failed hosts"
          variant={metrics.totalFailures > 0 ? "error" : "success"}
        />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Individual servers checklist</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-saas-muted">
              Server list for selected manual test group: {activeGroup?.name || "N/A"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-saas-muted">
              Checked: {checkedCount}/{groupServers.length}
            </span>
            <button
              type="button"
              onClick={toggleAllServers}
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
            >
              {groupServers.length > 0 && checkedCount === groupServers.length ? "Uncheck all" : "Check all"}
            </button>
            <button
              type="button"
              onClick={() => setRunSelectedOnly((v) => !v)}
              className={`rounded-md border px-2 py-1 font-semibold transition ${
                runSelectedOnly
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                  : "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-saas-fg"
              }`}
            >
              Mode: {runSelectedOnly ? "Run selected only" : "Run full group"}
            </button>
            {runSelectedOnly && (
              <button
                type="button"
                disabled={running || !selectedServerNames.length}
                onClick={() => runPatchingTest(groupName, selectedServerNames)}
                className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-300"
              >
                Run selected now ({selectedServerNames.length})
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[260px] overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-saas-elevated/95 dark:text-saas-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600"
                    checked={groupServers.length > 0 && checkedCount === groupServers.length}
                    onChange={toggleAllServers}
                  />
                </th>
                <th className="px-3 py-2">Server</th>
                <th className="px-3 py-2">Env</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupServers.map((s, i) => (
                <tr key={s.name} className={i % 2 ? "bg-slate-50/40 dark:bg-slate-900/20" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600"
                      checked={Boolean(checkedForGroup[s.name])}
                      onChange={() => toggleServerCheck(s.name)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-saas-fg">{s.name}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-saas-muted">{s.env || "-"}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-saas-muted">{s.region || "-"}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-saas-muted">{s.platform || "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        s.status === "UP"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : s.status === "DEGRADED"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {s.status || "N/A"}
                    </span>
                  </td>
                  <td className="max-w-[380px] truncate px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-saas-muted" title={s.url}>
                    {s.url || "-"}
                  </td>
                </tr>
              ))}
              {!groupServers.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-500 dark:text-saas-muted">
                    No servers found for selected group targets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PatchingActionPanel
        groups={filteredGroups}
        groupName={groupName}
        onGroupChange={setGroupName}
        selectedDescription={selectedFilteredGroup?.description || selectedGroup?.description}
        running={running}
        onRun={() => runPatchingTest(groupName, runSelectedOnly ? selectedServerNames : [])}
        runScopeLabel={runScopeLabel}
        error={error}
      />

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-saas-muted">
          Last 10 runs
        </span>
        <div className="flex flex-wrap gap-1">
          {timeline.map((r, i) => (
            <button
              key={`${r.completed_at}-${i}`}
              type="button"
              onClick={() => openDrawer(r)}
              className={`h-6 w-6 rounded-md transition hover:scale-110 ${
                r.status === "PASS" ? "bg-emerald-500/80" : "bg-red-500/80"
              }`}
              title={r.completed_at ? new Date(r.completed_at).toLocaleString() : r.status}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PatchingLatestRun latest={latest} onViewDetails={openDrawer} />
        <PatchingRunHistory history={history} onRowClick={openDrawer} />
      </div>

      <LogsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerRun ? `Run · ${drawerRun.group}` : "Run details"}
        subtitle={drawerRun?.completed_at ? new Date(drawerRun.completed_at).toLocaleString() : undefined}
        content={formatRunLog(drawerRun)}
      />
    </div>
  );
}
