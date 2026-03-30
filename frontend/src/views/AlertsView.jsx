import { AlertPanel } from "../components/AlertPanel";

export function AlertsView({ alerts }) {
  const critical = (alerts || []).filter((a) => a.severity === "critical" || a.priority === "high").length;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Alerts</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
            API signals + rule-based insights · {alerts?.length ?? 0} total · {critical} high/critical
          </p>
        </div>
      </div>
      <AlertPanel alerts={alerts} />
    </div>
  );
}
