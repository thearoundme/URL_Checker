import { useEffect, useState } from "react";
import { Sidebar, useSidebarCollapsed } from "./components/saas/Sidebar";
import { Header } from "./components/saas/Header";
import { ToastStack } from "./components/saas/ToastStack";
import { DashboardView } from "./views/DashboardView";
import { ServicesView } from "./views/ServicesView";
import { SmokeView } from "./views/SmokeView";
import { PatchingView } from "./views/PatchingView";
import { KubernetesView } from "./views/KubernetesView";
import { SslView } from "./views/SslView";
import { ConfigTreeView } from "./views/ConfigTreeView";
import { AlertsView } from "./views/AlertsView";
import { SettingsView } from "./views/SettingsView";
import { LoginView } from "./views/LoginView";
import { useAuth } from "./context/AuthContext";
import { ObservabilityProvider, useObservability } from "./context/ObservabilityContext";
import { canAccessTab, firstAllowedTab } from "./lib/permissions";

const TITLES = {
  dashboard: { title: "URL Check", subtitle: "Health & monitoring" },
  services: { title: "Services", subtitle: "Health, latency, and recheck" },
  smoke: { title: "Smoke tests", subtitle: "Synthetic journeys" },
  patching: { title: "Manual testing", subtitle: "Post-patch VM validation" },
  k8: { title: "Kubernetes monitoring", subtitle: "External cluster probes" },
  ssl: { title: "SSL monitoring", subtitle: "Certificates, expiry, TLS" },
  configTree: { title: "Config Tree", subtitle: "All JSON config data in tree view" },
  alerts: { title: "Alerts", subtitle: "Active signals" },
  settings: { title: "Settings", subtitle: "Preferences" },
};

function AppShell() {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem("url-checker-active-tab") || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { user, logout } = useAuth();
  const live = useObservability();

  const can = canAccessTab(user);
  useEffect(() => {
    if (user && !can(active)) {
      setActive(firstAllowedTab(user));
    }
  }, [user, active, can]);

  const headerMeta = TITLES[active] || TITLES.dashboard;
  const mainPad = collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]";

  useEffect(() => {
    try {
      localStorage.setItem("url-checker-active-tab", active);
    } catch {
      /* ignore */
    }
  }, [active]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-[#0B0F19] dark:text-[#E5E7EB]">
      <Sidebar active={active} onNavigate={setActive} collapsed={collapsed} onToggleCollapse={toggleCollapsed} canAccess={can} />

      <div className={`min-h-screen transition-[padding] duration-250 ${mainPad}`}>
        <Header title={headerMeta.title} subtitle={headerMeta.subtitle} onLogout={logout} />
        <div className="sticky top-14 z-10 border-b border-slate-200/80 bg-white/85 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-[#0B0F19]/85 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
              Success: {live.metrics?.successRate ?? 0}%
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
              Alerts: {live.combinedAlerts?.length ?? 0}
            </span>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
              Config issues: {live.configMeta?.validation_issue_count ?? 0}
            </span>
            <span className="font-mono text-slate-500 dark:text-saas-muted">
              Last sync: {live.lastPollAt ? new Date(live.lastPollAt).toLocaleString() : "—"}
            </span>
            <span className="font-mono text-slate-500 dark:text-saas-muted">
              Config loaded: {live.configMeta?.last_loaded_at ? new Date(live.configMeta.last_loaded_at).toLocaleString() : "—"}
            </span>
          </div>
        </div>

        <main className="min-h-[calc(100vh-3.5rem)]">
          {active === "dashboard" && can("dashboard") && <DashboardView onNavigate={setActive} />}
          {active === "services" && can("services") && (
            <ServicesView
              filters={live.filters}
              setFilters={live.setFilters}
              appOptions={live.appOptions}
              refresh={live.refresh}
              resetFilters={live.resetFilters}
              liveMode={live.liveMode}
              setLiveMode={live.setLiveMode}
              incidentMode={live.incidentMode}
              setIncidentMode={live.setIncidentMode}
              loading={live.loading}
              error={live.error}
              statusRows={live.statusRows}
              summary={live.summary}
              selectedNames={live.selectedNames}
              selectService={live.selectService}
              toggleRow={live.toggleRow}
              toggleSelectAllVisible={live.toggleSelectAllVisible}
              recheckSelected={live.recheckSelected}
              searchQuery={live.searchQuery}
              setSearchQuery={live.setSearchQuery}
              retryFailedEndpoints={live.retryFailedEndpoints}
              pollIntervalMs={live.pollIntervalMs}
            />
          )}
          {active === "smoke" && can("smoke") && <SmokeView />}
          {active === "patching" && can("patching") && <PatchingView />}
          {active === "k8" && can("k8") && <KubernetesView />}
          {active === "ssl" && can("ssl") && <SslView />}
          {active === "configTree" && can("configTree") && <ConfigTreeView />}
          {active === "alerts" && can("alerts") && <AlertsView alerts={live.combinedAlerts} />}
          {active === "settings" && can("settings") && <SettingsView />}
        </main>

        <footer className="border-t border-slate-200/80 px-6 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-saas-muted lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>URL Checker Platform · v1.0</span>
            <span className="font-mono text-[10px] opacity-80">Live polling · metrics · insights</span>
          </div>
        </footer>
      </div>
      <ToastStack toasts={live.toasts} onDismiss={live.dismissToast} />
    </div>
  );
}

export default function App() {
  const { token, user, loading, logout } = useAuth();

  if (!token) {
    return <LoginView />;
  }
  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-[#0B0F19] dark:text-saas-muted">
        Restoring session…
      </div>
    );
  }
  if (!user) {
    return <LoginView />;
  }

  return (
    <ObservabilityProvider>
      <AppShell />
    </ObservabilityProvider>
  );
}
