import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { ALL_ASSIGNABLE_PERMISSIONS } from "../lib/permissions";

export function UserManagementPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.listUsers();
      setUsers(list || []);
    } catch (e) {
      setError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await api.updateUser(editing.username, {
        display_name: editing.display_name,
        role: editing.role,
        permissions: editing.permissions,
        password: editing.newPassword || undefined,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (key) => {
    if (!editing) return;
    const set = new Set(editing.permissions || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setEditing({ ...editing, permissions: [...set] });
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-saas-surface">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Users &amp; permissions</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-saas-muted">Grant access to tools and settings. Admins have full access.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-saas-muted dark:hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {loading ? (
        <p className="mt-4 text-xs text-slate-500">Loading users…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-saas-muted">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Permissions</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.username}>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-saas-fg">
                    {u.display_name}
                    <span className="ml-2 font-mono text-[10px] text-slate-400">({u.username})</span>
                  </td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="max-w-md truncate px-3 py-2 font-mono text-[10px] text-slate-500" title={(u.permissions || []).join(", ")}>
                    {(u.permissions || []).includes("*") ? "*" : (u.permissions || []).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...u,
                          newPassword: "",
                          permissions: [...(u.permissions || [])],
                        })
                      }
                      className="text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-saas-fg">Edit {editing.username}</h4>
            <label className="mt-3 block text-xs text-slate-500">
              Display name
              <input
                value={editing.display_name}
                onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="mt-3 block text-xs text-slate-500">
              Role
              <select
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="mt-3 block text-xs text-slate-500">
              New password (optional)
              <input
                type="password"
                value={editing.newPassword || ""}
                onChange={(e) => setEditing({ ...editing, newPassword: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Permissions</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-100 p-2 dark:border-slate-700">
              {ALL_ASSIGNABLE_PERMISSIONS.map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={(editing.permissions || []).includes(key) || (editing.permissions || []).includes("*")}
                    disabled={(editing.permissions || []).includes("*")}
                    onChange={() => togglePerm(key)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    <span className="font-mono text-[10px] text-slate-500">{key}</span>
                    <span className="ml-1 text-slate-700 dark:text-slate-300">{label}</span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={(editing.permissions || []).includes("*")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      permissions: e.target.checked ? ["*"] : ALL_ASSIGNABLE_PERMISSIONS.map((x) => x.key),
                    })
                  }
                  className="rounded border-slate-300"
                />
                <span className="font-semibold text-violet-600 dark:text-violet-400">Full access (*)</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold dark:border-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
