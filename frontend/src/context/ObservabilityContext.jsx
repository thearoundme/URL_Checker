import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api";
import {
  DEFAULT_POLL_INTERVAL_MS,
  appendPatchingRunLog,
  buildInsights,
  computeDashboardMetrics,
  computeServiceBreakdown,
  extractFailureRecords,
  failureDistribution,
  loadMetricsHistory,
  loadServiceStreaks,
  mergeAlerts,
  saveMetricsHistory,
  saveServiceStreaks,
  updateServiceStreaks,
} from "../lib/dashboardEngine";

const Ctx = createContext(null);

export function ObservabilityProvider({ children }) {
  const [filters, setFilters] = useState({
    env: "ALL",
    region: "ALL",
    platform: "ALL",
    category: "ALL",
    appName: "ALL",
  });
  const [liveMode, setLiveMode] = useState(true);
  const [incidentMode, setIncidentMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusRows, setStatusRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [configMeta, setConfigMeta] = useState(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_POLL_INTERVAL_MS);
  const [services, setServices] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [sla, setSla] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [selectedNames, setSelectedNames] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const [metricsHistory, setMetricsHistory] = useState(loadMetricsHistory);
  const [serviceStreaks, setServiceStreaks] = useState(loadServiceStreaks);
  const previousSummaryRef = useRef(null);
  const [insightsState, setInsightsState] = useState([]);
  const [lastPollAt, setLastPollAt] = useState(null);

  const [patchingGroups, setPatchingGroups] = useState([]);
  const [patchingGroupName, setPatchingGroupName] = useState("");
  const [patchingHistory, setPatchingHistory] = useState([]);
  const [patchingLatestByGroup, setPatchingLatestByGroup] = useState({});
  const [patchingRunning, setPatchingRunning] = useState(false);
  const [patchingError, setPatchingError] = useState("");
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef({});

  const appOptions = useMemo(() => {
    const names = [...new Set(services.map((entry) => entry.name))];
    return ["ALL", ...names.sort()];
  }, [services]);

  const refreshPatching = useCallback(async (group) => {
    if (!group) return;
    try {
      const [status, runs] = await Promise.all([api.getPatchingStatus(), api.getPatchingHistory(group)]);
      setPatchingLatestByGroup((prev) => ({ ...prev, ...(status || {}) }));
      setPatchingHistory(runs || []);
    } catch {
      /* ignore */
    }
  }, []);

  const pushToast = useCallback((kind, message) => {
    setToasts((prev) => {
      const existing = prev.find((t) => t.kind === kind && t.message === message);
      if (existing) {
        const next = prev.map((t) =>
          t.id === existing.id
            ? { ...t, count: (t.count || 1) + 1, updatedAt: Date.now() }
            : t
        );
        if (toastTimersRef.current[existing.id]) window.clearTimeout(toastTimersRef.current[existing.id]);
        toastTimersRef.current[existing.id] = window.setTimeout(() => {
          setToasts((curr) => curr.filter((t) => t.id !== existing.id));
          delete toastTimersRef.current[existing.id];
        }, 4500);
        return next;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const created = { id, kind, message, count: 1, updatedAt: Date.now() };
      toastTimersRef.current[id] = window.setTimeout(() => {
        setToasts((curr) => curr.filter((t) => t.id !== id));
        delete toastTimersRef.current[id];
      }, 4500);
      return [...prev, created].slice(-5);
    });
  }, []);

  const dismissToast = useCallback((id) => {
    if (toastTimersRef.current[id]) {
      window.clearTimeout(toastTimersRef.current[id]);
      delete toastTimersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      toastTimersRef.current = {};
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const prevSnap = previousSummaryRef.current ? computeDashboardMetrics(previousSummaryRef.current) : null;
    try {
      const [statusData, summaryData, servicesData, anomaliesData, slaData, alertsData, configMetaData] = await Promise.all([
        api.getStatus(filters),
        api.getSummary(),
        api.getServices(),
        api.getAnomalies(),
        api.getSla(),
        api.getAlerts(),
        api.getConfigMeta(),
      ]);
      setStatusRows(statusData);
      setSummary(summaryData);
      setServices(servicesData);
      setAnomalies(anomaliesData);
      setSla(slaData);
      setAlerts(alertsData);
      setConfigMeta(configMetaData);
      const uiPoll = configMetaData?.monitoring?.effective?.ui_poll_interval_ms;
      if (typeof uiPoll === "number" && uiPoll >= 2000) {
        setPollIntervalMs(uiPoll);
      }
      setLastPollAt(new Date().toISOString());

      const metrics = computeDashboardMetrics(summaryData);
      const point = {
        t: Date.now(),
        successRate: metrics.successRate,
        avgLatency: metrics.avgLatencyMs,
        failureCount: metrics.totalFailures,
        activeAlerts: alertsData?.length ?? 0,
      };

      let nextHist = [];
      setMetricsHistory((hist) => {
        nextHist = [...hist, point].slice(-60);
        saveMetricsHistory(nextHist);
        return nextHist;
      });

      let nextStreaks = {};
      setServiceStreaks((prev) => {
        nextStreaks = updateServiceStreaks(statusData, prev);
        saveServiceStreaks(nextStreaks);
        return nextStreaks;
      });

      setInsightsState(
        buildInsights({
          summary: summaryData,
          prevSnapshot: prevSnap,
          metricsHistory: nextHist,
          serviceStreaks: nextStreaks,
        })
      );

      previousSummaryRef.current = summaryData;

      if (selectedService) {
        const drilldownData = await api.getDrilldown(selectedService);
        setDrilldown(drilldownData);
      }
    } catch (err) {
      setError(err.message || "Unable to fetch monitoring data");
    } finally {
      setLoading(false);
    }
  }, [filters, selectedService]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!liveMode) return;
    const t = setInterval(() => refresh(), pollIntervalMs);
    return () => clearInterval(t);
  }, [liveMode, refresh, pollIntervalMs]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPatchingGroups();
        setPatchingGroups(data);
        if (data.length) setPatchingGroupName(data[0].name);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!patchingGroupName) return;
    refreshPatching(patchingGroupName);
  }, [patchingGroupName, refreshPatching]);

  const selectService = useCallback(async (serviceName) => {
    setSelectedService(serviceName);
    const data = await api.getDrilldown(serviceName);
    setDrilldown(data);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ env: "ALL", region: "ALL", platform: "ALL", category: "ALL", appName: "ALL" });
  }, []);

  const visibleRows = useMemo(() => {
    let rows = statusRows;
    if (incidentMode) {
      rows = rows.filter((row) => row.status === "DOWN" || (row.category === "tool" && row.critical));
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.url || "").toLowerCase().includes(q) ||
        (r.env || "").toLowerCase().includes(q)
    );
  }, [incidentMode, statusRows, searchQuery]);

  const toggleRow = useCallback((name) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedNames((prev) => {
      const allVisible = visibleRows.map((r) => r.name);
      const allSelected = allVisible.every((n) => prev.has(n));
      if (allSelected) {
        const next = new Set(prev);
        allVisible.forEach((n) => next.delete(n));
        return next;
      }
      return new Set(allVisible);
    });
  }, [visibleRows]);

  const recheckSelected = useCallback(async () => {
    if (!selectedNames.size) return;
    setLoading(true);
    try {
      const body = { services: Array.from(selectedNames) };
      const updated = await api.recheckServices(body);
      setStatusRows((rows) => {
        const map = new Map(rows.map((r) => [r.name, r]));
        updated.forEach((u) => map.set(u.name, u));
        return Array.from(map.values());
      });
      pushToast("success", `Rechecked ${updated.length} selected service(s)`);
    } catch (err) {
      setError(err.message || "Unable to recheck services");
      pushToast("error", err.message || "Unable to recheck services");
    } finally {
      setLoading(false);
    }
  }, [selectedNames, pushToast]);

  const retryFailedEndpoints = useCallback(async () => {
    const down = statusRows.filter((r) => r.status === "DOWN").map((r) => r.name);
    const unique = [...new Set(down)];
    if (!unique.length) return;
    setLoading(true);
    try {
      const updated = await api.recheckServices({ services: unique });
      setStatusRows((rows) => {
        const map = new Map(rows.map((r) => [r.name, r]));
        updated.forEach((u) => map.set(u.name, u));
        return Array.from(map.values());
      });
      pushToast("success", `Retried ${updated.length} failed service(s)`);
    } catch (err) {
      setError(err.message || "Retry failed");
      pushToast("error", err.message || "Retry failed");
    } finally {
      setLoading(false);
    }
  }, [statusRows, pushToast]);

  const runPatchingTest = useCallback(async (targetGroupName, selectedServices = []) => {
    const groupToRun = targetGroupName || patchingGroupName;
    if (!groupToRun) return;
    setPatchingRunning(true);
    setPatchingError("");
    pushToast("info", `Manual test started for ${groupToRun}`);
    try {
      const result = await api.runPatching(groupToRun, selectedServices);
      const enriched = { ...result, _logText: appendPatchingRunLog(result) };
      setPatchingLatestByGroup((prev) => ({ ...prev, [groupToRun]: enriched }));
      const runs = await api.getPatchingHistory(groupToRun);
      setPatchingHistory(runs || []);
      pushToast(
        result.status === "PASS" ? "success" : "error",
        `Manual test ${result.status} for ${groupToRun}`
      );
    } catch (err) {
      setPatchingError(err.message || "Patching run failed");
      pushToast("error", err.message || "Manual test failed");
    } finally {
      setPatchingRunning(false);
    }
  }, [patchingGroupName, pushToast]);

  const metrics = useMemo(() => computeDashboardMetrics(summary), [summary]);
  const failureRecords = useMemo(() => extractFailureRecords(statusRows), [statusRows]);
  const serviceBreakdown = useMemo(() => computeServiceBreakdown(statusRows), [statusRows]);
  const dist = useMemo(() => failureDistribution(failureRecords), [failureRecords]);

  const combinedAlerts = useMemo(() => mergeAlerts(alerts, insightsState), [alerts, insightsState]);

  const patchingLatest = patchingLatestByGroup[patchingGroupName] || null;
  const patchingMetrics = useMemo(() => {
    const runs = patchingHistory || [];
    const pass = runs.filter((r) => r.status === "PASS").length;
    const total = runs.length;
    const successRate = total ? Math.round((pass / total) * 100) : null;
    const last = patchingLatest;
    let avgMs = null;
    if (last?.results?.length) {
      const sum = last.results.reduce((a, r) => a + (Number(r.latency_ms) || 0), 0);
      avgMs = Math.round(sum / last.results.length);
    }
    return {
      successRate,
      lastStatus: last?.status ?? "—",
      avgMs,
      totalFailures: last?.failed_hosts?.length ?? 0,
      historyCount: total,
    };
  }, [patchingHistory, patchingLatest]);

  const patchTimeline = useMemo(() => {
    return [...(patchingHistory || [])]
      .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))
      .slice(0, 10);
  }, [patchingHistory]);

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      liveMode,
      setLiveMode,
      incidentMode,
      setIncidentMode,
      loading,
      error,
      statusRows: visibleRows,
      allStatusRows: statusRows,
      summary,
      configMeta,
      anomalies,
      sla,
      alerts,
      combinedAlerts,
      appOptions,
      selectedService,
      drilldown,
      selectedNames,
      refresh,
      selectService,
      resetFilters,
      toggleRow,
      toggleSelectAllVisible,
      recheckSelected,
      searchQuery,
      setSearchQuery,
      metrics,
      metricsHistory,
      failureRecords,
      failureDistribution: dist,
      serviceBreakdown,
      insights: insightsState,
      lastPollAt,
      pollIntervalMs,
      retryFailedEndpoints,
      toasts,
      dismissToast,
      pushToast,
      patching: {
        groups: patchingGroups,
        groupName: patchingGroupName,
        setGroupName: setPatchingGroupName,
        selectedGroup: patchingGroups.find((g) => g.name === patchingGroupName),
        latest: patchingLatest,
        history: patchingHistory,
        running: patchingRunning,
        error: patchingError,
        metrics: patchingMetrics,
        runPatchingTest,
        timeline: patchTimeline,
        refresh: () => refreshPatching(patchingGroupName),
      },
    }),
    [
      filters,
      liveMode,
      incidentMode,
      loading,
      error,
      visibleRows,
      statusRows,
      summary,
      configMeta,
      anomalies,
      sla,
      alerts,
      combinedAlerts,
      appOptions,
      selectedService,
      drilldown,
      selectedNames,
      refresh,
      selectService,
      resetFilters,
      toggleRow,
      toggleSelectAllVisible,
      recheckSelected,
      searchQuery,
      metrics,
      metricsHistory,
      failureRecords,
      dist,
      serviceBreakdown,
      insightsState,
      lastPollAt,
      pollIntervalMs,
      retryFailedEndpoints,
      toasts,
      dismissToast,
      pushToast,
      patchingGroups,
      patchingGroupName,
      patchingLatest,
      patchingHistory,
      patchingRunning,
      patchingError,
      patchingMetrics,
      runPatchingTest,
      patchTimeline,
      refreshPatching,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useObservability() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useObservability must be used within ObservabilityProvider");
  return v;
}
