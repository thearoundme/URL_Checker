import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function LoginView() {
  const { login, loading, error, setError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const err = {};
    const u = username.trim();
    if (!u) err.username = "Username is required";
    else if (u.length < 2) err.username = "Username must be at least 2 characters";
    if (!password) err.password = "Password is required";
    else if (password.length < 1) err.password = "Password is required";
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    try {
      await login(username.trim(), password);
    } catch {
      /* error surfaced via context */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white shadow-lg">
            UC
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">URL Check</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to continue. Access is controlled by your role.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="login-username" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Username
              </label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFieldErrors((f) => ({ ...f, username: undefined }));
                }}
                className={`mt-1.5 w-full rounded-xl border bg-white/10 px-4 py-3 text-sm text-white outline-none ring-2 ring-transparent transition placeholder:text-slate-500 focus:ring-indigo-500/50 ${
                  fieldErrors.username ? "border-red-400/60" : "border-white/10"
                }`}
                placeholder="e.g. admin or user1"
              />
              {fieldErrors.username && <p className="mt-1 text-xs text-red-300">{fieldErrors.username}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((f) => ({ ...f, password: undefined }));
                }}
                className={`mt-1.5 w-full rounded-xl border bg-white/10 px-4 py-3 text-sm text-white outline-none ring-2 ring-transparent transition placeholder:text-slate-500 focus:ring-indigo-500/50 ${
                  fieldErrors.password ? "border-red-400/60" : "border-white/10"
                }`}
                placeholder="••••••••"
              />
              {fieldErrors.password && <p className="mt-1 text-xs text-red-300">{fieldErrors.password}</p>}
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 border-t border-white/10 pt-6 text-center text-[11px] leading-relaxed text-slate-500">
            Default dev accounts (after fresh <code className="rounded bg-white/10 px-1">users.json</code> bootstrap):{" "}
            <span className="text-slate-400">admin</span> / <span className="text-slate-400">admin</span>
            {" · "}
            <span className="text-slate-400">user1</span> / <span className="text-slate-400">user1</span>
          </p>
        </div>
      </div>
    </div>
  );
}
