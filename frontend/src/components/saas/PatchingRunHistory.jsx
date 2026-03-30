import { useEffect, useMemo, useState } from "react";

const TABLE_STATE_KEY = "manual-testing-history-table-state-v1";
const TABLE_PRESETS_KEY = "manual-testing-history-table-presets-v1";
const TABLE_DEFAULT_PRESET_KEY = "manual-testing-history-default-preset-v1";

const DEFAULT_FILTERS = {
  status: "ALL",
  group: "",
  minFailures: "",
};

function safeParseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function computeDurationMs(run) {
  return run.started_at && run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : 0;
}

export function PatchingRunHistory({ history, onRowClick }) {
  const [sortRules, setSortRules] = useState([
    { col: "completed_at", dir: "desc" },
    { col: "status", dir: "asc" },
  ]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState([]);
  const [defaultPresetId, setDefaultPresetId] = useState("");
  const [compact, setCompact] = useState(false);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    timeFrom: "",
    timeTo: "",
    status: "ALL",
    failuresMin: "",
    failuresMax: "",
    durationMin: "",
    durationMax: "",
    group: "",
  });

  useEffect(() => {
    const storedState = safeParseJson(window.localStorage.getItem(TABLE_STATE_KEY), null);
    if (storedState) {
      if (Array.isArray(storedState.sortRules) && storedState.sortRules.length) setSortRules(storedState.sortRules);
      if (storedState.filters) setFilters({ ...DEFAULT_FILTERS, ...storedState.filters });
      if (storedState.pageSize) setPageSize(storedState.pageSize);
      if (typeof storedState.compact === "boolean") setCompact(storedState.compact);
      if (typeof storedState.showColumnFilters === "boolean") setShowColumnFilters(storedState.showColumnFilters);
      if (storedState.columnFilters) {
        setColumnFilters((prev) => ({ ...prev, ...storedState.columnFilters }));
      }
    }
    const presets = safeParseJson(window.localStorage.getItem(TABLE_PRESETS_KEY), []);
    if (Array.isArray(presets)) setSavedPresets(presets);
    const defaultPreset = window.localStorage.getItem(TABLE_DEFAULT_PRESET_KEY) || "";
    setDefaultPresetId(defaultPreset);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      TABLE_STATE_KEY,
      JSON.stringify({ sortRules, filters, pageSize, compact, showColumnFilters, columnFilters })
    );
  }, [sortRules, filters, pageSize, compact, showColumnFilters, columnFilters]);

  useEffect(() => {
    if (!defaultPresetId || !savedPresets.length) return;
    const preset = savedPresets.find((p) => p.id === defaultPresetId);
    if (!preset) return;
    setSortRules(preset.config?.sortRules || [{ col: "completed_at", dir: "desc" }]);
    setFilters({ ...DEFAULT_FILTERS, ...(preset.config?.filters || {}) });
    setPageSize(preset.config?.pageSize || 10);
    setCompact(Boolean(preset.config?.compact));
    setShowColumnFilters(Boolean(preset.config?.showColumnFilters));
    setColumnFilters((prev) => ({ ...prev, ...(preset.config?.columnFilters || {}) }));
    setPage(1);
  }, [defaultPresetId, savedPresets]);

  const filteredRuns = useMemo(() => {
    const q = filters.group.trim().toLowerCase();
    const minFailures = filters.minFailures.trim() ? Number(filters.minFailures) : null;
    return (history || []).filter((run) => {
      if (filters.status !== "ALL" && run.status !== filters.status) return false;
      if (q && !String(run.group || "").toLowerCase().includes(q)) return false;
      if (minFailures != null && Number.isFinite(minFailures) && (run.failed_hosts?.length || 0) < minFailures) return false;
      const completedAtMs = run.completed_at ? new Date(run.completed_at).getTime() : 0;
      const failCount = run.failed_hosts?.length || 0;
      const durationMs = computeDurationMs(run);
      if (columnFilters.status !== "ALL" && run.status !== columnFilters.status) return false;
      if (columnFilters.group && !String(run.group || "").toLowerCase().includes(columnFilters.group.toLowerCase())) return false;
      if (columnFilters.timeFrom) {
        const fromMs = new Date(columnFilters.timeFrom).getTime();
        if (Number.isFinite(fromMs) && completedAtMs < fromMs) return false;
      }
      if (columnFilters.timeTo) {
        const toMs = new Date(columnFilters.timeTo).getTime();
        if (Number.isFinite(toMs) && completedAtMs > toMs) return false;
      }
      if (columnFilters.failuresMin !== "") {
        const v = Number(columnFilters.failuresMin);
        if (Number.isFinite(v) && failCount < v) return false;
      }
      if (columnFilters.failuresMax !== "") {
        const v = Number(columnFilters.failuresMax);
        if (Number.isFinite(v) && failCount > v) return false;
      }
      if (columnFilters.durationMin !== "") {
        const v = Number(columnFilters.durationMin);
        if (Number.isFinite(v) && durationMs < v) return false;
      }
      if (columnFilters.durationMax !== "") {
        const v = Number(columnFilters.durationMax);
        if (Number.isFinite(v) && durationMs > v) return false;
      }
      return true;
    });
  }, [history, filters, columnFilters]);

  const sortedRuns = useMemo(() => {
    const data = [...filteredRuns];
    data.sort((a, b) => {
      for (const rule of sortRules) {
        const dir = rule.dir === "asc" ? 1 : -1;
        if (rule.col === "completed_at") {
          const av = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bv = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          if (av !== bv) return (av - bv) * dir;
          continue;
        }
        if (rule.col === "duration_ms") {
          const av = computeDurationMs(a);
          const bv = computeDurationMs(b);
          if (av !== bv) return (av - bv) * dir;
          continue;
        }
        if (rule.col === "failures") {
          const av = a.failed_hosts?.length || 0;
          const bv = b.failed_hosts?.length || 0;
          if (av !== bv) return (av - bv) * dir;
          continue;
        }
        const av = String(a?.[rule.col] ?? "").toLowerCase();
        const bv = String(b?.[rule.col] ?? "").toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      }
      return 0;
    });
    return data;
  }, [filteredRuns, sortRules]);

  const totalPages = Math.max(1, Math.ceil(sortedRuns.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRuns.slice(start, start + pageSize);
  }, [sortedRuns, currentPage, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const onSort = (col, multi = false) => {
    setSortRules((prev) => {
      const idx = prev.findIndex((r) => r.col === col);
      if (multi) {
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], dir: next[idx].dir === "asc" ? "desc" : "asc" };
          return next;
        }
        return [...prev, { col, dir: "asc" }];
      }
      if (idx === 0 && prev.length === 1) {
        return [{ col, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
      }
      if (idx >= 0) return [{ col, dir: prev[idx].dir }];
      return [{ col, dir: "asc" }];
    });
  };

  const sortIndicator = (col) => {
    const idx = sortRules.findIndex((r) => r.col === col);
    if (idx < 0) return "↕";
    const arrow = sortRules[idx].dir === "asc" ? "↑" : "↓";
    return sortRules.length > 1 ? `${arrow}${idx + 1}` : arrow;
  };

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setColumnFilters({
      timeFrom: "",
      timeTo: "",
      status: "ALL",
      failuresMin: "",
      failuresMax: "",
      durationMin: "",
      durationMax: "",
      group: "",
    });
    setPage(1);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      config: { sortRules, filters, pageSize, compact, showColumnFilters, columnFilters },
    };
    setSavedPresets((prev) => {
      const withoutSame = prev.filter((p) => p.name !== name);
      const next = [...withoutSame, preset].slice(-20);
      window.localStorage.setItem(TABLE_PRESETS_KEY, JSON.stringify(next));
      return next;
    });
    setPresetName("");
  };

  const applyPreset = (presetId) => {
    const preset = savedPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setSortRules(preset.config?.sortRules || [{ col: "completed_at", dir: "desc" }]);
    setFilters({ ...DEFAULT_FILTERS, ...(preset.config?.filters || {}) });
    setPageSize(preset.config?.pageSize || 10);
    setCompact(Boolean(preset.config?.compact));
    setShowColumnFilters(Boolean(preset.config?.showColumnFilters));
    setColumnFilters((prev) => ({ ...prev, ...(preset.config?.columnFilters || {}) }));
    setPage(1);
  };

  const deletePreset = (presetId) => {
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== presetId);
      window.localStorage.setItem(TABLE_PRESETS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const exportCsv = () => {
    const header = ["group", "completed_at", "status", "failures", "duration_ms", "started_at"];
    const lines = sortedRuns.map((run) => {
      const row = {
        group: run.group || "",
        completed_at: run.completed_at || "",
        status: run.status || "",
        failures: run.failed_hosts?.length || 0,
        duration_ms: computeDurationMs(run),
        started_at: run.started_at || "",
      };
      return header
        .map((k) => `"${String(row[k]).replaceAll('"', '""')}"`)
        .join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manual-testing-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-saas-surface">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Manual testing history</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-saas-muted">Click a row for full logs · Shift+click headers for multi-sort</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-saas-muted">
              Rows: {sortedRuns.length}/{history.length}
            </span>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                filters.status === "ALL"
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setFilters((p) => ({ ...p, status: "ALL" }))}
            >
              All
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                filters.status === "PASS"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setFilters((p) => ({ ...p, status: "PASS" }))}
            >
              PASS
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                filters.status === "FAIL"
                  ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setFilters((p) => ({ ...p, status: "FAIL" }))}
            >
              FAIL
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowColumnFilters((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
            >
              {showColumnFilters ? "Hide column filters" : "Column filters"}
            </button>
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
            >
              Density: {compact ? "Compact" : "Comfort"}
            </button>
            <input
              type="search"
              value={filters.group}
              onChange={(e) => setFilters((p) => ({ ...p, group: e.target.value }))}
              placeholder="Filter group..."
              className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
            />
            <input
              type="number"
              min="0"
              value={filters.minFailures}
              onChange={(e) => setFilters((p) => ({ ...p, minFailures: e.target.value }))}
              placeholder="Min fail"
              className="h-7 w-20 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
            />
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 dark:text-saas-muted">Sort rules:</span>
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-600 dark:border-slate-600 dark:text-saas-muted">
              {sortRules.map((r) => `${r.col}:${r.dir}`).join(" , ")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
            />
            <button
              type="button"
              onClick={savePreset}
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
            >
              Save preset
            </button>
            <select
              className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) applyPreset(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Apply preset...</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) deletePreset(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Delete preset...</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
              value={defaultPresetId}
              onChange={(e) => {
                const v = e.target.value;
                setDefaultPresetId(v);
                window.localStorage.setItem(TABLE_DEFAULT_PRESET_KEY, v);
              }}
            >
              <option value="">Default preset: none</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  Default: {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur dark:bg-saas-elevated/95 dark:text-saas-muted">
            <tr>
              <th className="px-5 py-3">
                <button type="button" className="inline-flex items-center gap-1" onClick={(e) => onSort("completed_at", e.shiftKey)}>
                  Time <span>{sortIndicator("completed_at")}</span>
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" className="inline-flex items-center gap-1" onClick={(e) => onSort("status", e.shiftKey)}>
                  Status <span>{sortIndicator("status")}</span>
                </button>
              </th>
              <th className="px-3 py-3">
                <button type="button" className="inline-flex items-center gap-1" onClick={(e) => onSort("failures", e.shiftKey)}>
                  Failures <span>{sortIndicator("failures")}</span>
                </button>
              </th>
              <th className="px-5 py-3">
                <button type="button" className="inline-flex items-center gap-1" onClick={(e) => onSort("duration_ms", e.shiftKey)}>
                  Duration <span>{sortIndicator("duration_ms")}</span>
                </button>
              </th>
              <th className="px-5 py-3">Group</th>
            </tr>
            {showColumnFilters && (
              <tr className="border-t border-slate-200/80 bg-white/95 dark:border-slate-800 dark:bg-saas-surface/95">
                <th className="px-5 py-2">
                  <div className="flex gap-1">
                    <input
                      type="datetime-local"
                      value={columnFilters.timeFrom}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, timeFrom: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                    <input
                      type="datetime-local"
                      value={columnFilters.timeTo}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, timeTo: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                  </div>
                </th>
                <th className="px-3 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.status}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    {["ALL", "PASS", "FAIL"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={columnFilters.failuresMin}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, failuresMin: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={columnFilters.failuresMax}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, failuresMax: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                  </div>
                </th>
                <th className="px-5 py-2">
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min ms"
                      value={columnFilters.durationMin}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, durationMin: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Max ms"
                      value={columnFilters.durationMax}
                      onChange={(e) => setColumnFilters((p) => ({ ...p, durationMax: e.target.value }))}
                      className="h-7 w-full rounded border border-slate-300 px-1 text-[10px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    />
                  </div>
                </th>
                <th className="px-5 py-2">
                  <input
                    type="text"
                    placeholder="Group..."
                    value={columnFilters.group}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, group: e.target.value }))}
                    className="h-7 w-full rounded border border-slate-300 px-2 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                  />
                </th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedRuns.map((run, idx) => {
              const dur = computeDurationMs(run);
              return (
                <tr
                  key={`${run.group}-${run.completed_at}-${idx}`}
                  onClick={() => onRowClick?.(run)}
                  className={`cursor-pointer text-slate-700 transition hover:bg-slate-50 dark:text-saas-muted dark:hover:bg-saas-elevated/60 ${
                    idx % 2 === 1 ? "bg-slate-50/40 dark:bg-slate-900/20" : ""
                  }`}
                >
                  <td className={`whitespace-nowrap px-5 ${compact ? "py-1.5" : "py-3"} font-mono text-[11px] text-slate-600 dark:text-saas-fg/80`}>
                    {run.completed_at ? new Date(run.completed_at).toLocaleString() : "—"}
                  </td>
                  <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        run.status === "PASS"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>{run.failed_hosts?.length ?? 0}</td>
                  <td className={`px-5 ${compact ? "py-1.5" : "py-3"} font-mono text-[11px]`}>{dur ? `${dur} ms` : "—"}</td>
                  <td className={`px-5 ${compact ? "py-1.5" : "py-3"} font-mono text-[11px] text-slate-600 dark:text-saas-muted`}>
                    {run.group || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pagedRuns.length && (
          <p className="px-5 py-8 text-center text-xs text-slate-500 dark:text-saas-muted">No history yet.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[11px] dark:border-slate-800 dark:bg-saas-elevated/60">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-saas-muted">Page size</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-7 rounded border border-slate-300 px-2 dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
          >
            {[5, 10, 25, 50].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-slate-500 dark:text-saas-muted">
            Showing {(currentPage - 1) * pageSize + (pagedRuns.length ? 1 : 0)}-
            {(currentPage - 1) * pageSize + pagedRuns.length} of {sortedRuns.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            « First
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            ‹ Prev
          </button>
          <span className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600">
            Page {currentPage}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            Next ›
          </button>
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
          >
            Last »
          </button>
        </div>
      </div>
    </div>
  );
}
