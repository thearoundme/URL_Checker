import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { firstAllowedTab } from "../lib/permissions";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => api.getAccessToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!api.getAccessToken());
  const [error, setError] = useState("");

  const refreshMe = useCallback(async () => {
    const t = api.getAccessToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      api.setAccessToken("");
      setToken("");
      setUser(null);
      setError("Session expired. Please sign in again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) refreshMe();
    else {
      setUser(null);
      setLoading(false);
    }
  }, [token, refreshMe]);

  const login = useCallback(async (username, password) => {
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username, password);
      api.setAccessToken(res.access_token);
      setToken(res.access_token);
      setUser(res.user);
      return res.user;
    } catch (e) {
      const raw = e?.message || String(e);
      const unreachable =
        /failed to fetch|networkerror|load failed|network request failed/i.test(raw);
      setError(
        unreachable
          ? "Cannot reach the API. Start the backend on port 8000 (e.g. uvicorn app.main:app) and reload, or set VITE_API_BASE_URL to your API URL."
          : raw || "Login failed"
      );
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.setAccessToken("");
    setToken("");
    setUser(null);
    setError("");
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      error,
      setError,
      login,
      logout,
      refreshMe,
      isAuthenticated: !!user && !!token,
      initialTab: user ? firstAllowedTab(user) : "dashboard",
    }),
    [token, user, loading, error, login, logout, refreshMe]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
