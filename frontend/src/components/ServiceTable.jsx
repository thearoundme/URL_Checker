import { useEffect, useMemo, useState } from "react";

function statusPill(status) {
  if (status === "UP") return "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25";
  if (status === "DEGRADED") return "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/25";
  if (status === "DOWN") return "bg-red-500/15 text-red-400 ring-1 ring-red-500/25";
  return "bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20";
}

function summaryTone(s) {
  if (s === "UP") return "text-emerald-500";
  if (s === "DEGRADED") return "text-amber-500";
  if (s === "DOWN") return "text-red-400";
  return "text-slate-500 dark:text-saas-muted";
}

function heartbeatTone(hb) {
  if (hb === "HEALTHY") return "text-emerald-500";
  if (hb === "UNHEALTHY") return "text-red-400";
  return "text-slate-500 dark:text-saas-muted";
}

const SORTABLE_COLUMNS = [
  "name",
  "app_version",
  "env",
  "region",
  "platform",
  "status",
  "summary_status",
  "heartbeat_status",
  "timestamp",
];

const DEFAULT_COLUMN_FILTERS = {
  name: "",
  env: "ALL",
  region: "ALL",
  platform: "ALL",
  status: "ALL",
  summary_status: "ALL",
  heartbeat_status: "ALL",
  version: "",
  url: "",
};

const TABLE_STATE_KEY = "url-check-service-table-state-v1";
const TABLE_PRESETS_KEY = "url-check-service-table-presets-v1";

function safeParseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function ServiceTable({ rows, onSelect, selectedNames, onToggleRow, onToggleAll }) {
  const [sortRules, setSortRules] = useState([{ col: "name", dir: "asc" }]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [compact, setCompact] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState(DEFAULT_COLUMN_FILTERS);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [savedPresets, setSavedPresets] = useState([]);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    const storedState = safeParseJson(window.localStorage.getItem(TABLE_STATE_KEY), null);
    if (storedState) {
      if (Array.isArray(storedState.sortRules) && storedState.sortRules.length) setSortRules(storedState.sortRules);
      if (storedState.statusFilter) setStatusFilter(storedState.statusFilter);
      if (storedState.columnFilters) setColumnFilters({ ...DEFAULT_COLUMN_FILTERS, ...storedState.columnFilters });
      if (typeof storedState.compact === "boolean") setCompact(storedState.compact);
      if (typeof storedState.showFilters === "boolean") setShowFilters(storedState.showFilters);
      if (storedState.pageSize) setPageSize(storedState.pageSize);
    }
    const presets = safeParseJson(window.localStorage.getItem(TABLE_PRESETS_KEY), []);
    if (Array.isArray(presets)) setSavedPresets(presets);
  }, []);

  useEffect(() => {
    const state = {
      sortRules,
      statusFilter,
      compact,
      showFilters,
      columnFilters,
      pageSize,
    };
    window.localStorage.setItem(TABLE_STATE_KEY, JSON.stringify(state));
  }, [sortRules, statusFilter, compact, showFilters, columnFilters, pageSize]);

  const filteredRows = useMemo(() => {
    return (rows || []).filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (columnFilters.name && !item.name?.toLowerCase().includes(columnFilters.name.toLowerCase())) return false;
      if (columnFilters.version && !String(item.app_version || "").toLowerCase().includes(columnFilters.version.toLowerCase())) return false;
      if (columnFilters.url && !String(item.url || "").toLowerCase().includes(columnFilters.url.toLowerCase())) return false;
      if (columnFilters.env !== "ALL" && item.env !== columnFilters.env) return false;
      if (columnFilters.region !== "ALL" && item.region !== columnFilters.region) return false;
      if (columnFilters.platform !== "ALL" && item.platform !== columnFilters.platform) return false;
      if (columnFilters.status !== "ALL" && item.status !== columnFilters.status) return false;
      if (columnFilters.summary_status !== "ALL" && (item.summary_status || "N/A") !== columnFilters.summary_status) return false;
      if (columnFilters.heartbeat_status !== "ALL" && (item.heartbeat_status || "N/A") !== columnFilters.heartbeat_status) return false;
      return true;
    });
  }, [rows, statusFilter, columnFilters]);

  const sortedRows = useMemo(() => {
    const data = [...filteredRows];
    data.sort((a, b) => {
      for (const rule of sortRules) {
        const dir = rule.dir === "asc" ? 1 : -1;
        if (rule.col === "timestamp") {
          const av = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const bv = b.timestamp ? new Date(b.timestamp).getTime() : 0;
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
  }, [filteredRows, sortRules]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const envOptions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.env).filter(Boolean))], [rows]);
  const regionOptions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.region).filter(Boolean))], [rows]);
  const platformOptions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.platform).filter(Boolean))], [rows]);

  const selectedVisibleCount = pagedRows.filter((r) => selectedNames?.has(r.name)).length;
  const allVisibleSelected = Boolean(pagedRows.length) && selectedVisibleCount === pagedRows.length;

  const onSort = (col, multi = false) => {
    if (!SORTABLE_COLUMNS.includes(col)) return;
    setSortRules((prev) => {
      const existingIdx = prev.findIndex((r) => r.col === col);
      if (multi) {
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], dir: next[existingIdx].dir === "asc" ? "desc" : "asc" };
          return next;
        }
        return [...prev, { col, dir: "asc" }];
      }
      if (existingIdx === 0 && prev.length === 1) {
        return [{ col, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
      }
      if (existingIdx >= 0) {
        return [{ col, dir: prev[existingIdx].dir }];
      }
      return [{ col, dir: "asc" }];
    });
  };

  const sortIndicator = (col) => {
    const idx = sortRules.findIndex((r) => r.col === col);
    if (idx < 0) return "↕";
    const arrow = sortRules[idx].dir === "asc" ? "↑" : "↓";
    return sortRules.length > 1 ? `${arrow}${idx + 1}` : arrow;
  };

  const exportCsv = () => {
    const header = [
      "name",
      "env",
      "region",
      "platform",
      "url",
      "status",
      "summary_status",
      "heartbeat_status",
      "app_version",
      "timestamp",
    ];
    const lines = sortedRows.map((r) =>
      header
        .map((k) => {
          const cell = String(r?.[k] ?? "");
          return `"${cell.replaceAll('"', '""')}"`;
        })
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `services-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const rowPad = compact ? "py-1.5" : "py-2.5";

  const clearAllFilters = () => {
    setColumnFilters(DEFAULT_COLUMN_FILTERS);
    setStatusFilter("ALL");
    setPage(1);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      config: {
        sortRules,
        statusFilter,
        columnFilters,
        compact,
        showFilters,
        pageSize,
      },
    };
    setSavedPresets((prev) => {
      const withoutSameName = prev.filter((p) => p.name !== name);
      const next = [...withoutSameName, payload].slice(-20);
      window.localStorage.setItem(TABLE_PRESETS_KEY, JSON.stringify(next));
      return next;
    });
    setPresetName("");
  };

  const applyPreset = (presetId) => {
    const preset = savedPresets.find((p) => p.id === presetId);
    if (!preset) return;
    const c = preset.config || {};
    if (Array.isArray(c.sortRules) && c.sortRules.length) setSortRules(c.sortRules);
    setStatusFilter(c.statusFilter || "ALL");
    setColumnFilters({ ...DEFAULT_COLUMN_FILTERS, ...(c.columnFilters || {}) });
    setCompact(Boolean(c.compact));
    setShowFilters(Boolean(c.showFilters));
    setPageSize(c.pageSize || 25);
    setPage(1);
  };

  const deletePreset = (presetId) => {
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== presetId);
      window.localStorage.setItem(TABLE_PRESETS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-saas-surface">
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-saas-elevated/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full border border-slate-300 px-2 py-0.5 font-semibold text-slate-600 dark:border-slate-600 dark:text-saas-muted">
              Rows: {sortedRows.length}/{rows.length}
            </span>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                statusFilter === "ALL"
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setStatusFilter("ALL")}
            >
              All
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                statusFilter === "UP"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setStatusFilter("UP")}
            >
              UP
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                statusFilter === "DEGRADED"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setStatusFilter("DEGRADED")}
            >
              DEGRADED
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                statusFilter === "DOWN"
                  ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-saas-muted"
              }`}
              onClick={() => setStatusFilter("DOWN")}
            >
              DOWN
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? "Hide filters" : "Column filters"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
              onClick={() => setCompact((v) => !v)}
            >
              Density: {compact ? "Compact" : "Comfort"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-saas-fg dark:hover:bg-slate-800"
              onClick={() => {
                clearAllFilters();
              }}
            >
              Clear filters
            </button>
            <button
              type="button"
              className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 dark:text-saas-muted">Sort tip: Shift + click for multi-sort</span>
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
              onChange={(e) => deletePreset(e.target.value)}
              defaultValue=""
            >
              <option value="">Delete preset...</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="max-h-[min(70vh,520px)] overflow-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-saas-elevated/95 dark:text-saas-muted">
            <tr>
              <th className="w-10 px-2 py-3">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 dark:border-slate-600"
                  checked={allVisibleSelected}
                  onChange={onToggleAll}
                />
              </th>
              <th className="w-56 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("name", e.shiftKey)}
                >
                  App <span>{sortIndicator("name")}</span>
                </button>
              </th>
              <th className="w-28 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("app_version", e.shiftKey)}
                >
                  Version <span>{sortIndicator("app_version")}</span>
                </button>
              </th>
              <th className="w-16 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("env", e.shiftKey)}
                >
                  Env <span>{sortIndicator("env")}</span>
                </button>
              </th>
              <th className="w-20 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("region", e.shiftKey)}
                >
                  Region <span>{sortIndicator("region")}</span>
                </button>
              </th>
              <th className="w-20 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("platform", e.shiftKey)}
                >
                  Platform <span>{sortIndicator("platform")}</span>
                </button>
              </th>
              <th className="w-[360px] px-2 py-3 text-left">URL</th>
              <th className="w-24 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("status", e.shiftKey)}
                >
                  Status <span>{sortIndicator("status")}</span>
                </button>
              </th>
              <th className="w-40 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("summary_status", e.shiftKey)}
                >
                  Summary <span>{sortIndicator("summary_status")}</span>
                </button>
              </th>
              <th className="w-40 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("heartbeat_status", e.shiftKey)}
                >
                  Heartbeat <span>{sortIndicator("heartbeat_status")}</span>
                </button>
              </th>
              <th className="w-32 px-2 py-3 text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={(e) => onSort("timestamp", e.shiftKey)}
                >
                  Checked <span>{sortIndicator("timestamp")}</span>
                </button>
              </th>
            </tr>
            {showFilters && (
              <tr className="border-t border-slate-200/80 bg-white/95 dark:border-slate-800 dark:bg-saas-surface/95">
                <th className="px-2 py-2" />
                <th className="px-2 py-2">
                  <input
                    className="h-7 w-full rounded border border-slate-300 px-2 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    placeholder="Filter app..."
                    value={columnFilters.name}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, name: e.target.value }))}
                  />
                </th>
                <th className="px-2 py-2">
                  <input
                    className="h-7 w-full rounded border border-slate-300 px-2 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    placeholder="Version..."
                    value={columnFilters.version}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, version: e.target.value }))}
                  />
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.env}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, env: e.target.value }))}
                  >
                    {envOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.region}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, region: e.target.value }))}
                  >
                    {regionOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.platform}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, platform: e.target.value }))}
                  >
                    {platformOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2">
                  <input
                    className="h-7 w-full rounded border border-slate-300 px-2 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    placeholder="Filter URL..."
                    value={columnFilters.url}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, url: e.target.value }))}
                  />
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.status}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    {["ALL", "UP", "DEGRADED", "DOWN"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.summary_status}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, summary_status: e.target.value }))}
                  >
                    {["ALL", "UP", "DEGRADED", "DOWN", "N/A"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2">
                  <select
                    className="h-7 w-full rounded border border-slate-300 px-1 text-[11px] normal-case dark:border-slate-600 dark:bg-saas-bg dark:text-saas-fg"
                    value={columnFilters.heartbeat_status}
                    onChange={(e) => setColumnFilters((p) => ({ ...p, heartbeat_status: e.target.value }))}
                  >
                    {["ALL", "HEALTHY", "UNHEALTHY", "N/A"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2" />
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedRows.map((item, idx) => {
              const isSelected = selectedNames?.has(item.name);
              const lastChecked = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "-";
              const tooltip = [
                item.error_message && `Last error: ${item.error_message}`,
                item.timestamp && `Last checked: ${new Date(item.timestamp).toLocaleString()}`,
              ]
                .filter(Boolean)
                .join("\n");

              return (
                <tr
                  key={item.name}
                  className={`transition duration-250 hover:bg-slate-50 dark:hover:bg-saas-elevated/40 ${
                    item.status === "DOWN" ? "bg-red-500/[0.04]" : ""
                  } ${item.anomaly ? "bg-indigo-500/[0.04]" : ""} ${idx % 2 === 1 ? "bg-slate-50/40 dark:bg-slate-900/20" : ""}`}
                >
                  <td className={`w-10 px-2 ${rowPad}`}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600"
                      checked={isSelected}
                      onChange={() => onToggleRow?.(item.name)}
                    />
                  </td>
                  <td className={`w-56 px-2 ${rowPad}`}>
                    <span
                      className={`mr-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        item.category === "tool"
                          ? "bg-violet-500/15 text-violet-400"
                          : "bg-indigo-500/15 text-indigo-300"
                      }`}
                    >
                      {item.category === "tool" ? "TOOL" : "APP"}
                    </span>
                    <button
                      type="button"
                      className="text-left font-medium text-slate-900 underline-offset-2 hover:underline dark:text-saas-fg"
                      onClick={() => onSelect?.(item.name)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className={`w-28 px-2 ${rowPad}`}>
                    {item.app_version && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-saas-bg">
                        {item.app_version}
                      </span>
                    )}
                  </td>
                  <td className={`w-16 px-2 ${rowPad} text-slate-600 dark:text-saas-muted`}>{item.env}</td>
                  <td className={`w-20 px-2 ${rowPad} text-slate-600 dark:text-saas-muted`}>{item.region}</td>
                  <td className={`w-20 px-2 ${rowPad} text-xs uppercase text-slate-600 dark:text-saas-muted`}>
                    {item.platform}
                  </td>
                  <td
                    className={`w-[360px] truncate px-2 ${rowPad} font-mono text-[11px] text-slate-600 dark:text-saas-muted`}
                    title={[
                      `Health: ${item.url}`,
                      item.summary_url && `Summary: ${item.summary_url}`,
                      item.heartbeat_url && `Heartbeat: ${item.heartbeat_url}`,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  >
                    {item.url}
                  </td>
                  <td className={`w-24 px-2 ${rowPad}`} title={tooltip}>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className={`w-40 px-2 ${rowPad} text-xs ${summaryTone(item.summary_status)}`}>
                    {item.summary_status || "N/A"}
                  </td>
                  <td className={`w-40 px-2 ${rowPad} text-xs ${heartbeatTone(item.heartbeat_status)}`}>
                    {item.heartbeat_status === "HEALTHY" && "❤ OK"}
                    {item.heartbeat_status === "UNHEALTHY" && "✕ Fail"}
                    {!item.heartbeat_status && "N/A"}
                  </td>
                  <td className={`w-32 px-2 ${rowPad} font-mono text-[11px] text-slate-500 dark:text-saas-muted`}>
                    {lastChecked}
                  </td>
                </tr>
              );
            })}
            {!pagedRows.length && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-saas-muted">
                  No rows match current filters. Try clearing table filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-slate-500 dark:text-saas-muted">
            Showing {(currentPage - 1) * pageSize + (pagedRows.length ? 1 : 0)}-
            {(currentPage - 1) * pageSize + pagedRows.length} of {sortedRows.length}
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
