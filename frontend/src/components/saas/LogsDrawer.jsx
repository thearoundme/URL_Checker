export function LogsDrawer({ open, onClose, title, subtitle, content }) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-250 dark:bg-black/70"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-[60] flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-[#0a0e14] shadow-2xl duration-250"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-emerald-400/90">
            {content || "—"}
          </pre>
        </div>
      </aside>
    </>
  );
}
