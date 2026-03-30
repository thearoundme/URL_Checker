import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

export function useSmokeTests() {
  const [brand, setBrand] = useState("");
  const [env, setEnv] = useState("prod");
  const [region, setRegion] = useState("EAST");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [mode, setMode] = useState("browser");

  const currentConfig = useMemo(
    () => configs.find((c) => c.brand === brand && c.env === env && c.region === region) || null,
    [configs, brand, env, region]
  );
  const brandOptions = useMemo(
    () => Array.from(new Set(configs.map((c) => c.brand))).sort(),
    [configs]
  );
  const envOptions = useMemo(
    () => Array.from(new Set(configs.map((c) => c.env))).sort(),
    [configs]
  );

  const targets = useMemo(() => {
    if (!currentConfig) return [];
    const urls = new Map();
    if (currentConfig.base_url) {
      urls.set(currentConfig.base_url, { label: "Main URL", url: currentConfig.base_url });
    }
    if (currentConfig.vip_url) {
      urls.set(currentConfig.vip_url, { label: "VIP URL", url: currentConfig.vip_url });
    }
    (currentConfig.server_urls || []).forEach((u, idx) => {
      if (!urls.has(u)) {
        urls.set(u, { label: `Server ${idx + 1}`, url: u });
      }
    });
    return Array.from(urls.values());
  }, [currentConfig]);

  const canRun = useMemo(
    () => Boolean(brand && env && region && currentConfig && targetUrl && !running),
    [brand, env, region, currentConfig, targetUrl, running]
  );

  const refreshStatus = useCallback(async () => {
    try {
      const [status, historyData] = await Promise.all([api.getSmokeStatus(), api.getSmokeHistory(brand)]);
      const candidate =
        status.find((r) => r.brand === brand && r.env === env && r.region === region && (r.mode || "api") === mode) ||
        historyData.find((r) => r.brand === brand && r.env === env && r.region === region && (r.mode || "api") === mode) ||
        null;
      setLatest(candidate);
      setHistory((historyData || []).filter((r) => (r.mode || "api") === mode));
      if (candidate && candidate.status !== "RUNNING") {
        setRunning(false);
      }
    } catch (err) {
      setError(err.message || "Unable to fetch smoke test status");
    }
  }, [brand, env, region, mode]);

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setError("");
    try {
      await api.runSmoke({ brand, env, region, targetUrl, mode });
      await refreshStatus();
    } catch (err) {
      setError(err.message || "Failed to start smoke test");
      setRunning(false);
    }
  }, [brand, env, region, targetUrl, mode, canRun, refreshStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => refreshStatus(), 1000);
    return () => clearInterval(timer);
  }, [running, refreshStatus]);

  useEffect(() => {
    (async () => {
      try {
        const cfgs = await api.getSmokeConfigs();
        setConfigs(cfgs);
        if (cfgs.length) {
          setBrand((prev) => prev || cfgs[0].brand);
          setEnv((prev) => (cfgs.some((c) => c.env === prev) ? prev : cfgs[0].env));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentConfig) {
      setTargetUrl("");
      return;
    }
    setTargetUrl(currentConfig.vip_url || currentConfig.base_url);
  }, [currentConfig]);

  return {
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
  };
}
