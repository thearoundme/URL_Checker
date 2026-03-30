/**
 * Pure functions for metrics, error classification, insights, and service breakdown.
 */

/** Default until `/config/meta` returns `monitoring.effective.ui_poll_interval_ms`. */
export const DEFAULT_POLL_INTERVAL_MS = 12_000;
export const POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_MS;

const LS_METRICS_HISTORY = "url-check-metrics-history-v1";
const LS_SERVICE_STREAKS = "url-check-service-streaks-v1";

export function loadMetricsHistory() {
  try {
    const raw = localStorage.getItem(LS_METRICS_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMetricsHistory(rows) {
  try {
    localStorage.setItem(LS_METRICS_HISTORY, JSON.stringify(rows.slice(-60)));
  } catch {
    /* ignore */
  }
}

export function loadServiceStreaks() {
  try {
    const raw = localStorage.getItem(LS_SERVICE_STREAKS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveServiceStreaks(map) {
  try {
    localStorage.setItem(LS_SERVICE_STREAKS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function classifyError(errorMessage, status) {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("ssl") || msg.includes("certificate") || msg.includes("tls")) return "ssl";
  if (msg.includes("dns") || msg.includes("getaddrinfo") || msg.includes("enotfound") || msg.includes("name or service not known"))
    return "dns";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return "http_5xx";
  if (msg.includes("403") || status === 403) return "http_403";
  if (msg.includes("404") || status === 404) return "http_404";
  if (status >= 500) return "http_5xx";
  return "other";
}

export function computeDashboardMetrics(summary) {
  const total = summary?.total ?? 0;
  const up = summary?.up ?? 0;
  const degraded = summary?.degraded ?? 0;
  const down = summary?.down ?? 0;
  const healthy = up + degraded;
  const successRate = total ? Math.round((healthy / total) * 100) : 0;
  return {
    total,
    successRate,
    avgLatencyMs: Math.round((summary?.average_latency_ms ?? 0) * 100) / 100,
    totalFailures: down,
    healthy,
  };
}

export function extractFailureRecords(statusRows) {
  return (statusRows || [])
    .filter((r) => r.status === "DOWN")
    .map((r) => ({
      id: `${r.name}-${r.env}-${r.region}-${r.timestamp || Date.now()}`,
      service: r.name,
      url: r.url,
      env: r.env,
      region: r.region,
      errorType: classifyError(r.error_message, undefined),
      message: r.error_message || "DOWN",
      latencyMs: r.latency_ms,
      at: r.timestamp || new Date().toISOString(),
    }));
}

export function failureDistribution(failureRecords) {
  const dist = { timeout: 0, dns: 0, ssl: 0, http_5xx: 0, http_403: 0, http_404: 0, other: 0 };
  for (const f of failureRecords) {
    const k = dist[f.errorType] !== undefined ? f.errorType : "other";
    dist[k] = (dist[k] || 0) + 1;
  }
  return dist;
}

export function computeServiceBreakdown(statusRows) {
  const byName = new Map();
  for (const r of statusRows || []) {
    const key = r.name;
    if (!byName.has(key)) {
      byName.set(key, { name: key, total: 0, up: 0, down: 0, degraded: 0 });
    }
    const agg = byName.get(key);
    agg.total += 1;
    if (r.status === "UP") agg.up += 1;
    else if (r.status === "DOWN") agg.down += 1;
    else if (r.status === "DEGRADED") agg.degraded += 1;
  }
  return Array.from(byName.values())
    .map((s) => ({
      ...s,
      successRate: s.total ? Math.round(((s.up + s.degraded) / s.total) * 100) : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function updateServiceStreaks(statusRows, previousStreaks) {
  const byName = new Map();
  for (const r of statusRows || []) {
    const cur = byName.get(r.name) || { anyDown: false };
    if (r.status === "DOWN") cur.anyDown = true;
    byName.set(r.name, cur);
  }
  const next = {};
  for (const [name, { anyDown }] of byName.entries()) {
    next[name] = anyDown ? (previousStreaks[name] || 0) + 1 : 0;
  }
  return next;
}

export function buildInsights({ summary, prevSnapshot, metricsHistory, serviceStreaks }) {
  const insights = [];
  if (!summary) return insights;

  const rateNow = computeDashboardMetrics(summary).successRate;
  const ratePrev = prevSnapshot?.successRate ?? rateNow;
  if (prevSnapshot && ratePrev - rateNow > 20) {
    insights.push({
      id: "success-rate-drop",
      severity: "critical",
      title: "Success rate dropped sharply",
      message: `Availability fell from ~${ratePrev}% to ${rateNow}% (threshold −20%).`,
    });
  }

  const latNow = summary.average_latency_ms ?? 0;
  const latPrev = prevSnapshot?.avgLatencyMs ?? latNow;
  if (prevSnapshot && latPrev > 0 && latNow > latPrev * 1.3) {
    insights.push({
      id: "latency-spike",
      severity: "warning",
      title: "Response time elevated",
      message: `Average latency ${Math.round(latNow)}ms is >30% above previous ${Math.round(latPrev)}ms.`,
    });
  }

  for (const [name, streak] of Object.entries(serviceStreaks || {})) {
    if (streak >= 2) {
      insights.push({
        id: `repeat-${name}`,
        severity: "critical",
        title: "Repeated check failures",
        message: `Service "${name}" failed ${streak} consecutive poll(s).`,
      });
    }
  }

  const recent = metricsHistory.slice(-5);
  if (recent.length >= 3) {
    const fails = recent.map((m) => m.failureCount || 0);
    if (fails.every((f, i) => i === 0 || f >= fails[i - 1]) && fails[fails.length - 1] > fails[0]) {
      insights.push({
        id: "failure-trend-up",
        severity: "warning",
        title: "Failure count trending up",
        message: "Down endpoints are increasing over recent polls.",
      });
    }
  }

  return insights;
}

export function mergeAlerts(apiAlerts, insights) {
  const mapped = (apiAlerts || []).map((a, idx) => ({
    ...a,
    id: a.id || `api-${a.type}-${a.env}-${a.region}-${idx}`,
    severity: a.severity || (a.priority === "high" ? "critical" : "warning"),
    source: "api",
  }));
  const synthetic = (insights || []).map((i) => ({
    id: i.id,
    type: "insight",
    priority: i.severity === "critical" ? "high" : "medium",
    severity: i.severity,
    message: `${i.title}: ${i.message}`,
    env: "—",
    region: "—",
    impacted: [],
    source: "insight",
  }));
  return [...synthetic, ...mapped];
}

export function appendPatchingRunLog(run) {
  const lines = [];
  const push = (s) => lines.push(s);
  push(`[PATCH] group=${run.group} status=${run.status}`);
  push(`started=${run.started_at} completed=${run.completed_at}`);
  (run.results || []).forEach((r, i) => {
    push(
      `[${i}] ${r.service} url=${r.url_status} httpd=${r.httpd} tomcat=${r.tomcat} ${r.latency_ms != null ? `${r.latency_ms}ms` : ""}`
    );
    if (r.error_message) push(`    err: ${r.error_message}`);
  });
  return lines.join("\n");
}
