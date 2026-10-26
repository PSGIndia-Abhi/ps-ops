import { useEffect, useMemo, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { downloadFile } from "./accountant/download";
import "./AdminUserActivity.css";

// Admin-only list of who used the website / apps today.
// Data: /api/user-activity (backend/src/routes/user-activity.routes.js).

const PLATFORMS = [
  { value: "web", label: "Website" },
  { value: "android_app", label: "BestServe App" },
  { value: "old_android_app", label: "Old Android App" },
];
const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.value, p.label]));

function fmtTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminUserActivity() {
  const [platform, setPlatform] = useState("");
  const [role, setRole] = useState("");
  const [showOnly, setShowOnly] = useState("all"); // all | active | inactive
  const [search, setSearch] = useState("");

  const [roles, setRoles] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null); // null | "pdf" | "xlsx"

  useEffect(() => {
    apiFetch("/api/user-activity/roles")
      .then((res) => (res?.ok ? res.json() : []))
      .then((list) => setRoles(Array.isArray(list) ? list : []))
      .catch(() => setRoles([]));
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (role) params.set("role", role);
    return params.toString();
  }, [platform, role]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/user-activity/today?${query}`);
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Failed to load user activity");
      setData(body);
    } catch (err) {
      setData(null);
      setError(err.message || "Failed to load user activity");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleDownload(format) {
    setDownloading(format);
    setError(null);
    const err = await downloadFile(`/api/user-activity/export?format=${format}&${query}`, `user-activity.${format}`);
    setDownloading(null);
    if (err) setError(err);
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (showOnly === "all" || (showOnly === "active" ? r.active : !r.active)) &&
        (!needle || [r.name, r.email, r.role, r.branch].some((v) => String(v || "").toLowerCase().includes(needle)))
    );
  }, [data, showOnly, search]);

  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="ua-page">
      <div className="ua-header">
        <div>
          <h2>User Activity</h2>
          <p>Who used the website or the Android apps today — {todayLabel}</p>
        </div>
        <div className="ua-actions">
          <button className="ua-secondary" onClick={load} disabled={loading}>
            <FiRefreshCw /> Refresh
          </button>
          <button className="ua-primary" onClick={() => handleDownload("pdf")} disabled={!!downloading}>
            <FiDownload /> {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
          <button className="ua-primary" onClick={() => handleDownload("xlsx")} disabled={!!downloading}>
            <FiDownload /> {downloading === "xlsx" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </div>

      <div className="ua-filters">
        <label>
          App
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All apps</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="ua-search">
          Search
          <span>
            <FiSearch />
            <input type="search" placeholder="Name, email, role…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
      </div>

      {error && <div className="ua-error">{error}</div>}
      {loading && !data && <div className="ua-empty">Loading…</div>}

      {data && (
        <>
          <div className="ua-cards">
            <button className={`ua-card ${showOnly === "all" ? "selected" : ""}`} onClick={() => setShowOnly("all")}>
              <span>Total users</span>
              <strong>{data.totals.users}</strong>
            </button>
            <button className={`ua-card ua-card-good ${showOnly === "active" ? "selected" : ""}`} onClick={() => setShowOnly("active")}>
              <span>Active today</span>
              <strong>{data.totals.active}</strong>
            </button>
            <button className={`ua-card ua-card-muted ${showOnly === "inactive" ? "selected" : ""}`} onClick={() => setShowOnly("inactive")}>
              <span>Not active</span>
              <strong>{data.totals.inactive}</strong>
            </button>
            {PLATFORMS.map((p) => (
              <div key={p.value} className="ua-card">
                <span>{p.label}</span>
                <strong>{data.totals.by_platform[p.value]}</strong>
              </div>
            ))}
          </div>

          <div className="ua-table-wrap">
            <table className="ua-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>App</th>
                  <th>Login time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="ua-name">{r.name}</div>
                      <div className="ua-sub">{r.email}</div>
                    </td>
                    <td>{r.role}</td>
                    <td>{r.branch || "—"}</td>
                    <td>
                      <span className={`ua-status ${r.active ? "on" : "off"}`}>{r.active ? "Active" : "Not active"}</span>
                    </td>
                    <td>
                      <div className="ua-badges">
                        {r.platforms.length
                          ? r.platforms.map((p) => (
                              <span key={p} className={`ua-badge ua-badge-${p}`}>
                                {PLATFORM_LABEL[p] || p}
                              </span>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td>{fmtTime(r.login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="ua-empty">No users match these filters.</div>}
          </div>
        </>
      )}
    </div>
  );
}
