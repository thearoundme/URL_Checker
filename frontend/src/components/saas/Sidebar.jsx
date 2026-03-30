import { useState } from "react";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "◆" },
  { id: "services", label: "Services", icon: "◎" },
  { id: "smoke", label: "Smoke Tests", icon: "◇" },
  { id: "patching", label: "Manual Testing", icon: "⚡" },
  { id: "k8", label: "Kubernetes", icon: "⎈" },
  { id: "ssl", label: "SSL Monitoring", icon: "🔒" },
  { id: "configTree", label: "Config Tree", icon: "🌳" },
  { id: "alerts", label: "Alerts", icon: "!" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse, canAccess }) {
  const navItems = canAccess ? NAV.filter((item) => canAccess(item.id)) : NAV;
  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-[#0065B3]/40 bg-[#0077C8] text-white backdrop-blur-md transition-all duration-250 ${
        collapsed ? "w-[72px]" : "w-[240px]"
      }`}
    >
      <div className={`flex h-14 items-center border-b border-white/20 px-3 ${collapsed ? "justify-center" : "gap-2 px-4"}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold text-white shadow-glow-sm">
          U
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">URL Checker</p>
            <p className="truncate text-[10px] text-white/80">URL Check</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-250 ${
                isActive
                  ? "border-l-2 border-white bg-white/20 text-white shadow-sm"
                  : "border-l-2 border-transparent text-white/90 hover:bg-white/10"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs">
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/20 p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-white/85 transition hover:bg-white/10"
        >
          {collapsed ? "→" : "← Collapse"}
        </button>
      </div>
    </aside>
  );
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("url-checker-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("url-checker-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return [collapsed, toggle];
}
