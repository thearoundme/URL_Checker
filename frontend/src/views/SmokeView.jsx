import { SmokeTestsPanel } from "../components/SmokeTestsPanel";

export function SmokeView() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-saas-fg">Smoke tests</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-saas-muted">
          Synthetic flows per brand, environment, and target URL.
        </p>
      </div>
      <SmokeTestsPanel />
    </div>
  );
}
