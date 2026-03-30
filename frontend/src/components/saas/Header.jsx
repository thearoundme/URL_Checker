import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

function initials(name, username) {
  const s = (name || username || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function Header({ title, subtitle, onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0B0F19]/88">
      <div className="flex h-14 items-center justify-between px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-glow-sm sm:flex">
            UC
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-saas-fg">{title}</h1>
            {subtitle && <p className="truncate text-xs text-slate-500 dark:text-saas-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {user && (
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-xs font-medium text-slate-800 dark:text-saas-fg">{user.display_name || user.username}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-saas-muted">
                {user.role}
                {(user.permissions || []).includes("*") ? " · full access" : ""}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition duration-250 hover:scale-105 hover:border-indigo-500/30 hover:text-indigo-600 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-muted dark:hover:text-indigo-300"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            type="button"
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition duration-250 hover:bg-slate-50 dark:border-slate-700 dark:bg-saas-elevated dark:text-saas-muted dark:hover:bg-saas-surface"
            aria-label="Notifications"
          >
            <span className="text-sm">🔔</span>
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-saas-elevated" />
          </button>
          <div
            className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white shadow-glow-sm"
            title={user?.username}
          >
            {user ? initials(user.display_name, user.username) : "?"}
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-saas-muted dark:hover:bg-slate-800"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
