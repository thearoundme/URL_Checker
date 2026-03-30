import { useEffect, useMemo, useState } from "react";

export function ToastStack({ toasts, onDismiss }) {
  const [renderedToasts, setRenderedToasts] = useState([]);

  const tone = (kind) => {
    if (kind === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    if (kind === "error") return "border-red-500/30 bg-red-500/10 text-red-300";
    return "border-indigo-500/30 bg-indigo-500/10 text-indigo-300";
  };
  const icon = (kind) => {
    if (kind === "success") return "✓";
    if (kind === "error") return "⚠";
    return "ℹ";
  };
  const priority = (kind) => {
    if (kind === "error") return 0;
    if (kind === "info") return 1;
    return 2;
  };

  const orderedToasts = useMemo(() => {
    return [...(toasts || [])].sort((a, b) => {
      const byPriority = priority(a.kind) - priority(b.kind);
      if (byPriority !== 0) return byPriority;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [toasts]);

  useEffect(() => {
    setRenderedToasts((prev) => {
      const nextById = new Map(prev.map((t) => [t.id, t]));
      const incomingIds = new Set(orderedToasts.map((t) => t.id));

      orderedToasts.forEach((t) => {
        const current = nextById.get(t.id);
        if (current) {
          nextById.set(t.id, { ...current, ...t, leaving: false });
        } else {
          nextById.set(t.id, { ...t, leaving: false });
        }
      });

      for (const [id, toast] of nextById.entries()) {
        if (!incomingIds.has(id)) nextById.set(id, { ...toast, leaving: true });
      }

      return Array.from(nextById.values()).sort((a, b) => {
        const byPriority = priority(a.kind) - priority(b.kind);
        if (byPriority !== 0) return byPriority;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    });
  }, [orderedToasts]);

  useEffect(() => {
    const leaving = renderedToasts.filter((t) => t.leaving);
    if (!leaving.length) return undefined;
    const timer = window.setTimeout(() => {
      setRenderedToasts((prev) => prev.filter((t) => !t.leaving));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [renderedToasts]);

  if (!renderedToasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-[340px] max-w-[90vw] flex-col gap-2">
      {renderedToasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-3 py-2 text-xs shadow-lg backdrop-blur ${
            t.leaving ? "toast-exit" : "toast-enter"
          } ${tone(t.kind)}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/30 text-[10px]">
                {icon(t.kind)}
              </span>
              <span className="leading-relaxed">
                {t.message}
                {(t.count || 1) > 1 && (
                  <span className="ml-2 rounded-full border border-current/30 px-1.5 py-0.5 text-[10px]">
                    x{t.count}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="rounded p-1 text-[10px] opacity-70 hover:opacity-100"
              onClick={() => onDismiss?.(t.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

