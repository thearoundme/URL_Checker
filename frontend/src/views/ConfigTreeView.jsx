import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useObservability } from "../context/ObservabilityContext";

function formatPathPart(part, parentIsArray) {
  if (parentIsArray) return `[${part}]`;
  return part;
}

function normalizePath(parentPath, part, parentIsArray) {
  const next = formatPathPart(part, parentIsArray);
  if (!parentPath) return next;
  if (next.startsWith("[")) return `${parentPath}${next}`;
  return `${parentPath}.${next}`;
}

function matchesQuickFilter(path, label, value, quickFilter) {
  if (quickFilter === "all") return true;
  const key = String(label || "").toLowerCase();
  const fullPath = String(path || "").toLowerCase();
  const text = typeof value === "string" ? value.toLowerCase() : "";

  if (quickFilter === "urls") {
    return key.includes("url") || fullPath.includes("url") || text.startsWith("http://") || text.startsWith("https://");
  }
  if (quickFilter === "servers") {
    const hostKey =
      key === "host" ||
      key.endsWith("_host") ||
      key.includes("hostname") ||
      key.includes("host_name");
    return (
      key.includes("server") ||
      hostKey ||
      fullPath.includes("server") ||
      fullPath.includes("hostname") ||
      text.includes("server") ||
      text.includes(".internal")
    );
  }
  if (quickFilter === "namespaces") {
    return key.includes("namespace") || key === "ns" || fullPath.includes("namespace") || fullPath.endsWith(".ns");
  }
  return true;
}

function collectStats(root) {
  const stats = {
    urls: 0,
    servers: 0,
    namespaces: 0,
    leaves: 0,
    objects: 0,
    arrays: 0,
  };

  function walk(value, label = "", path = "") {
    const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (type === "array") stats.arrays += 1;
    if (type === "object" && value) stats.objects += 1;
    if (type !== "array" && type !== "object") stats.leaves += 1;

    const key = String(label).toLowerCase();
    const fullPath = String(path).toLowerCase();
    const text = typeof value === "string" ? value.toLowerCase() : "";

    if (key.includes("url") || fullPath.includes("url") || text.startsWith("http://") || text.startsWith("https://")) {
      stats.urls += 1;
    }
    const hostKey =
      key === "host" ||
      key.endsWith("_host") ||
      key.includes("hostname") ||
      key.includes("host_name");
    if (
      key.includes("server") ||
      hostKey ||
      fullPath.includes("server") ||
      fullPath.includes("hostname") ||
      text.includes("server") ||
      text.includes(".internal")
    ) {
      stats.servers += 1;
    }
    if (key.includes("namespace") || key === "ns" || fullPath.includes("namespace") || fullPath.endsWith(".ns")) {
      stats.namespaces += 1;
    }

    if (type === "array") {
      value.forEach((v, i) => {
        const childPath = normalizePath(path, String(i), true);
        walk(v, String(i), childPath);
      });
      return;
    }
    if (type === "object" && value) {
      Object.entries(value).forEach(([k, v]) => {
        const childPath = normalizePath(path, k, false);
        walk(v, k, childPath);
      });
    }
  }

  walk(root, "config", "config");
  return stats;
}

/**
 * Paths that should render: this node or any descendant matches the quick filter + text query.
 * (Previously only direct children were checked, so nested URLs/servers hid the whole tree.)
 */
function computeVisiblePathsSet(root, quickFilter, query) {
  const visible = new Set();
  const q = query.trim().toLowerCase();

  function walk(value, parentPath, label, parentIsArray) {
    const currentPath = normalizePath(parentPath, label, parentIsArray);
    const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const isLeaf = type !== "object" && type !== "array";

    const quickMatch = matchesQuickFilter(currentPath, label, value, quickFilter);
    const selfMatch =
      quickMatch &&
      (!q || String(label).toLowerCase().includes(q) || (isLeaf && String(value).toLowerCase().includes(q)));

    let anyDescendant = false;
    if (type === "array") {
      value.forEach((v, i) => {
        if (walk(v, currentPath, String(i), true)) anyDescendant = true;
      });
    } else if (type === "object" && value) {
      Object.entries(value).forEach(([k, v]) => {
        if (walk(v, currentPath, k, false)) anyDescendant = true;
      });
    }

    const show = selfMatch || anyDescendant;
    if (show) visible.add(currentPath);
    return show;
  }

  walk(root, "", "config", false);
  return visible;
}

/** Human-readable role from JSON path + key (heartbeat, summary, health, server, etc.) */
function inferSemanticRole(fullPath, label) {
  const p = `${fullPath}`.toLowerCase();
  const l = String(label).toLowerCase();
  if (l.includes("heartbeat") || p.includes("heartbeat")) return { role: "Heartbeat URL", tone: "amber" };
  if (l.includes("summary") || p.includes("summary_url") || /\.summary\b/.test(p)) return { role: "Summary URL", tone: "violet" };
  if (l.includes("health_check") || l.includes("healthcheck") || (l.includes("health") && l.includes("url")))
    return { role: "Health check URL", tone: "emerald" };
  if (l.includes("smoke") && (l.includes("url") || p.includes("smoke"))) return { role: "Smoke test URL", tone: "sky" };
  if (l.includes("server") || l.includes("hostname") || l.includes("host") || p.includes(".server")) {
    if (l.includes("url") || p.includes("url")) return { role: "Server endpoint", tone: "slate" };
    return { role: "Server / host name", tone: "slate" };
  }
  if (l.includes("base_url") || l === "url" || l.endsWith("_url")) return { role: "Base / service URL", tone: "indigo" };
  return null;
}

function looksLikeUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.startsWith("http://") || t.startsWith("https://");
}

function parseUrlBreakdown(raw) {
  try {
    const u = new URL(String(raw).trim());
    const port =
      u.port ||
      (u.protocol === "https:" ? "443 (default)" : u.protocol === "http:" ? "80 (default)" : "—");
    return [
      { k: "Scheme", v: u.protocol.replace(":", "") },
      { k: "Host", v: u.hostname },
      { k: "Port", v: port },
      { k: "Path + query", v: `${u.pathname}${u.search}` || "/" },
    ];
  } catch {
    return null;
  }
}

function looksLikeHostname(s) {
  if (typeof s !== "string" || !s.trim()) return false;
  const t = s.trim();
  if (t.includes(" ") || t.includes("\n")) return false;
  if (looksLikeUrl(t)) return false;
  return /^[a-z0-9][-a-z0-9.]*[a-z0-9]$/i.test(t) && (t.includes(".") || t === "localhost");
}

function buildInsightRows(path, label, value, isLeaf, nodeType) {
  const rows = [];
  const semantic = inferSemanticRole(path, label);
  if (semantic) rows.push({ k: "Meaning", v: semantic.role, highlight: semantic.tone });

  if (isLeaf && typeof value === "string") {
    const s = value.trim();
    if (looksLikeUrl(s)) {
      const parts = parseUrlBreakdown(s);
      if (parts) {
        rows.push({ k: "", v: "URL breakdown", section: true });
        parts.forEach((p) => rows.push({ k: p.k, v: p.v }));
      }
    } else if (looksLikeHostname(s)) {
      rows.push({ k: "", v: "Host / server", section: true });
      rows.push({ k: "Name", v: s });
    }
  }

  if (!isLeaf) {
    rows.push({
      k: "Structure",
      v: `${nodeType} · ${Array.isArray(value) ? value.length : Object.keys(value || {}).length} entries`,
    });
  }

  return rows;
}

function NodeDetailPanel({ node, onClose }) {
  if (!node) return null;
  const { path, label, value, isLeaf, nodeType } = node;
  const insightRows = buildInsightRows(path, label, value, isLeaf, nodeType);

  return (
    <>
      <button
        type="button"
        aria-label="Close detail panel"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/50"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Config node
              </p>
              <h3 className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{path}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {insightRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Summary</p>
              <div className="space-y-2">
                {insightRows.map((row, i) =>
                  row.section ? (
                    <p key={`s-${i}`} className="pt-2 text-[10px] font-semibold uppercase text-slate-400">
                      {row.v}
                    </p>
                  ) : (
                    <div
                      key={`r-${i}`}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        row.highlight === "amber"
                          ? "border-amber-200/80 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/40"
                          : row.highlight === "violet"
                            ? "border-violet-200/80 bg-violet-50/90 dark:border-violet-900/50 dark:bg-violet-950/40"
                            : row.highlight === "emerald"
                              ? "border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/40"
                              : row.highlight === "sky"
                                ? "border-sky-200/80 bg-sky-50/90 dark:border-sky-900/50 dark:bg-sky-950/40"
                                : row.highlight === "indigo"
                                  ? "border-indigo-200/80 bg-indigo-50/90 dark:border-indigo-900/50 dark:bg-indigo-950/40"
                                  : row.highlight === "slate"
                                    ? "border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-900/50"
                                    : "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50"
                      }`}
                    >
                      <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">{row.k}</p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-800 dark:text-slate-200">{row.v}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Raw value</p>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {isLeaf ? (typeof value === "string" ? value : JSON.stringify(value)) : JSON.stringify(value, null, 2)}
            </pre>
          </div>
        </div>
      </aside>
    </>
  );
}

async function copyWithToast(text, message, pushToast) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast("success", message);
  } catch {
    pushToast("error", "Copy failed — check permissions");
  }
}

function TreeNode({
  nodeKey,
  label,
  value,
  level = 0,
  path = "",
  parentIsArray = false,
  pushToast,
  selectedPath,
  onSelectNode,
  visiblePathsSet,
}) {
  const [open, setOpen] = useState(level < 2);

  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const isLeaf = type !== "object" && type !== "array";
  const currentPath = normalizePath(path, label, parentIsArray);
  const isSelected = selectedPath === currentPath;

  const children = useMemo(() => {
    if (type === "array") return value.map((v, i) => [String(i), v]);
    if (type === "object" && value) return Object.entries(value);
    return [];
  }, [type, value]);

  if (!visiblePathsSet.has(currentPath)) return null;

  const copyPath = (e) => {
    e.stopPropagation();
    copyWithToast(currentPath, "Copied path", pushToast);
  };
  const copyValue = (e) => {
    e.stopPropagation();
    copyWithToast(isLeaf ? String(value) : JSON.stringify(value, null, 2), "Copied value", pushToast);
  };
  const copyJson = (e) => {
    e.stopPropagation();
    copyWithToast(JSON.stringify(value, null, 2), "Copied JSON", pushToast);
  };

  const handleRowClick = () => {
    onSelectNode({
      path: currentPath,
      label,
      value,
      isLeaf,
      nodeType: type,
    });
  };

  const leftPad = 12 + level * 14;
  const semantic = inferSemanticRole(currentPath, label);

  return (
    <div className="text-xs">
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 ${
          isSelected ? "border-indigo-300/80 bg-indigo-50/90 dark:border-indigo-600/50 dark:bg-indigo-950/40" : ""
        }`}
        style={{ paddingLeft: leftPad }}
      >
        {!isLeaf ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-[11px] shadow-sm dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((s) => !s);
            }}
            title={open ? "Collapse" : "Expand"}
          >
            {open ? "−" : "+"}
          </button>
        ) : (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-[10px] text-slate-300 dark:text-slate-600">
            ●
          </span>
        )}
        <span className="shrink-0 font-mono text-slate-800 dark:text-slate-100">{label}</span>
        <span className="shrink-0 text-slate-400">:</span>
        {isLeaf ? (
          <span className="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-300" title={String(value)}>
            {type === "string" ? `"${value}"` : String(value)}
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            {type} ({children.length})
          </span>
        )}
        {semantic && isLeaf && (
          <span
            className={`hidden max-w-[140px] shrink-0 truncate rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:inline-block ${
              semantic.tone === "amber"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200"
                : semantic.tone === "violet"
                  ? "bg-violet-100 text-violet-800 dark:bg-violet-950/80 dark:text-violet-200"
                  : semantic.tone === "emerald"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200"
                    : semantic.tone === "sky"
                      ? "bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-200"
                      : semantic.tone === "indigo"
                        ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
            title={semantic.role}
          >
            {semantic.role}
          </span>
        )}
        <div className="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex">
          <button
            type="button"
            onClick={copyPath}
            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            title={`Copy path: ${currentPath}`}
          >
            path
          </button>
          {isLeaf && (
            <button
              type="button"
              onClick={copyValue}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
              title="Copy leaf value"
            >
              value
            </button>
          )}
          <button
            type="button"
            onClick={copyJson}
            className="rounded-md border border-indigo-500/30 bg-indigo-500/5 px-2 py-0.5 font-mono text-[10px] text-indigo-700 dark:text-indigo-300"
            title="Copy full node JSON"
          >
            json
          </button>
        </div>
      </div>
      {!isLeaf && open && (
        <div>
          {children.map(([k, v]) => (
            <TreeNode
              key={`${nodeKey}.${k}`}
              nodeKey={`${nodeKey}.${k}`}
              label={k}
              value={v}
              level={level + 1}
              path={currentPath}
              parentIsArray={type === "array"}
              pushToast={pushToast}
              selectedPath={selectedPath}
              onSelectNode={onSelectNode}
              visiblePathsSet={visiblePathsSet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigTreeView() {
  const { pushToast } = useObservability();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const d = await api.getConfigTree();
        if (mounted) setData(d);
      } catch (err) {
        if (mounted) setError(err.message || "Unable to load config tree");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const downloadJson = () => {
    if (!data) return;
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `config-tree-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast("success", "Download started");
  };

  const stats = useMemo(() => (data ? collectStats(data) : null), [data]);

  const quickFilterCounts = useMemo(() => {
    if (!stats) return { all: 0, urls: 0, servers: 0, namespaces: 0 };
    return {
      all: stats.leaves + stats.objects + stats.arrays,
      urls: stats.urls,
      servers: stats.servers,
      namespaces: stats.namespaces,
    };
  }, [stats]);

  const selectedPath = selectedNode?.path ?? null;

  const visiblePathsSet = useMemo(
    () => (data ? computeVisiblePathsSet(data, quickFilter, query) : new Set()),
    [data, quickFilter, query]
  );

  return (
    <div className="relative space-y-4 p-6 lg:p-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 px-5 py-4 dark:border-slate-800 dark:from-slate-900/50 dark:to-indigo-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-saas-fg">Config Tree</h2>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-saas-muted">
                Browse all JSON config in one place. Click a row for a readable summary (URLs, servers). Use path / value /
                json for clipboard — confirmations appear as toasts.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[240px]">
              <label className="sr-only" htmlFor="config-tree-filter">
                Filter keys and values
              </label>
              <input
                id="config-tree-filter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter keys / values..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {[
            ["all", "All"],
            ["urls", "URLs"],
            ["servers", "Servers"],
            ["namespaces", "Namespaces"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQuickFilter(id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                quickFilter === id
                  ? "border-indigo-500 bg-indigo-500 text-white shadow-sm dark:bg-indigo-600"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600"
              }`}
            >
              {label}{" "}
              <span className={quickFilter === id ? "text-indigo-100" : "text-slate-400"}>
                {quickFilterCounts[id] ?? 0}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={downloadJson}
            className="ml-auto rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold text-emerald-800 shadow-sm hover:bg-emerald-500/20 dark:text-emerald-200"
          >
            Download JSON
          </button>
        </div>
        {stats && (
          <div className="grid gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["URLs", stats.urls],
              ["Servers", stats.servers],
              ["Namespaces", stats.namespaces],
              ["Leaf values", stats.leaves],
              ["Objects + arrays", stats.objects + stats.arrays],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-saas-surface">
        <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Tree — click any row for details</p>
        </div>
        {loading && <p className="p-6 text-xs text-slate-500">Loading config tree...</p>}
        {error && <p className="p-6 text-xs text-red-500">{error}</p>}
        {!loading && !error && data && (
          <div className="max-h-[70vh] overflow-auto p-3 pr-2">
            <TreeNode
              nodeKey="root"
              label="config"
              value={data}
              pushToast={pushToast}
              selectedPath={selectedPath}
              onSelectNode={setSelectedNode}
              visiblePathsSet={visiblePathsSet}
            />
          </div>
        )}
      </div>

      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
