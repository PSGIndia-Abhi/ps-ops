import { useEffect, useMemo, useState } from "react";
import { FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { downloadFile } from "./accountant/download";
import "./AdminUserActivity.css";

// Admin-only report of who signed in and who actually used the website / apps.
// Data: /api/user-activity (backend/src/routes/user-activity.routes.js).

const PLATFORMS = [
  { value: "web", label: "Website", short: "W" },
  { value: "android_app", label: "BestServe App", short: "A" },
  { value: "old_android_app", label: "Old Android App", short: "O" },
];
const PLATFORM_BY_VALUE = Object.fromEntries(PLATFORMS.map((p) => [p.value, p]));

const FAILURE_LABELS = {
  unknown_email: "Unknown email",
  not_activated: "Account not activated",
  inactive: "Account inactive",
  wrong_password: "Wrong password",
  error: "Server error",
};

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBefore(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - n);
  return localDate(d);
}
function fmtTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function dayHeader(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
  };
}

function PlatformBadge({ platform }) {
  const p = PLATFORM_BY_VALUE[platform];
  return <span className={`ua-badge ua-badge-${platform}`}>{p ? p.label : platform}</span>;
}

export default function AdminUserActivity() {
  const today = localDate();
  const [tab, setTab] = useState("today"); // today | daywise | logins
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(daysBefore(today, 6));
  const [to, setTo] = useState(today);
  const [platform, setPlatform] = useState("");
  const [role, setRole] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [showOnly, setShowOnly] = useState("all"); // all | active | inactive (Today tab)
  const [search, setSearch] = useState("");

  const [roles, setRoles] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null); // null | "pdf" | "xlsx"
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    apiFetch("/api/user-activity/roles")
      .then((res) => (res?.ok ? res.json() : []))
      .then((list) => setRoles(Array.isArray(list) ? list : []))
      .catch(() => setRoles([]));
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (tab === "today") params.set("date", date);
    else {
      params.set("from", from);
      params.set("to", to);
    }
    if (platform) params.set("platform", platform);
    if (role) params.set("role", role);
    if (tab === "logins" && loginStatus) params.set("status", loginStatus);
    return params.toString();
  }, [tab, date, from, to, platform, role, loginStatus]);

  const rangeError = tab !== "today" && to < from ? "The end date can't be before the start date." : null;

  async function load() {
    if (rangeError) return;
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/user-activity/${tab}?${query}`);
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Failed to load user activity");
      setData({ tab, ...body });
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
    setDownloadError(null);
    const err = await downloadFile(
      `/api/user-activity/export?view=${tab}&format=${format}&${query}`,
      `user-activity.${format}`
    );
    setDownloading(null);
    if (err) setDownloadError(err);
  }

  const current = data?.tab === tab ? data : null;
  const needle = search.trim().toLowerCase();
  const matches = (r) =>
    !needle || [r.name, r.email, r.role, r.branch].some((v) => String(v || "").toLowerCase().includes(needle));

  const todayRows = useMemo(() => {
    if (!current || tab !== "today") return [];
    return current.rows.filter(
      (r) => matches(r) && (showOnly === "all" || (showOnly === "active" ? r.active : !r.active))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, tab, showOnly, needle]);

  const daywiseRows = useMemo(
    () => (current && tab === "daywise" ? current.rows.filter(matches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, tab, needle]
  );

  const loginRows = useMemo(
    () => (current && tab === "logins" ? current.rows.filter(matches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, tab, needle]
  );

  return (
    <div className="ua-page">
      <div className="ua-header">
        <div>
          <h2>User Activity</h2>
          <p>Who signed in, and who used the website or the Android apps. Recording started when this report went live.</p>
        </div>
        <div className="ua-actions">
          <button className="ua-secondary" onClick={load} disabled={loading} title="Refresh">
            <FiRefreshCw /> Refresh
          </button>
          <button className="ua-primary" onClick={() => handleDownload("pdf")} disabled={!!downloading || !!rangeError}>
            <FiDownload /> {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
          <button className="ua-primary" onClick={() => handleDownload("xlsx")} disabled={!!downloading || !!rangeError}>
            <FiDownload /> {downloading === "xlsx" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </div>

      <div className="ua-tabs" role="tablist">
        {[
          ["today", "Today"],
          ["daywise", "Day-wise"],
          ["logins", "Login history"],
        ].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ua-filters">
        {tab === "today" ? (
          <label>
            Date
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        ) : (
          <>
            <label>
              From
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </>
        )}
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
        {tab === "logins" && (
          <label>
            Result
            <select value={loginStatus} onChange={(e) => setLoginStatus(e.target.value)}>
              <option value="">All</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        )}
        <label className="ua-search">
          Search
          <span>
            <FiSearch />
            <input type="search" placeholder="Name, email, role…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
      </div>

      {(rangeError || downloadError) && <div className="ua-error">{rangeError || downloadError}</div>}
      {error && <div className="ua-error">{error}</div>}
      {loading && !current && <div className="ua-empty">Loading…</div>}

      {current && tab === "today" && (
        <>
          <div className="ua-cards">
            <div className="ua-card">
              <span>Total users</span>
              <strong>{current.totals.users}</strong>
            </div>
            <button className={`ua-card ua-card-good ${showOnly === "active" ? "selected" : ""}`} onClick={() => setShowOnly(showOnly === "active" ? "all" : "active")}>
              <span>Active</span>
              <strong>{current.totals.active}</strong>
            </button>
            <button className={`ua-card ua-card-muted ${showOnly === "inactive" ? "selected" : ""}`} onClick={() => setShowOnly(showOnly === "inactive" ? "all" : "inactive")}>
              <span>Not active</span>
              <strong>{current.totals.inactive}</strong>
            </button>
            {PLATFORMS.map((p) => (
              <div key={p.value} className="ua-card">
                <span>{p.label}</span>
                <strong>{current.totals.by_platform[p.value]}</strong>
              </div>
            ))}
            <div className="ua-card">
              <span>Logins</span>
              <strong>{current.totals.logins}</strong>
            </div>
            <div className={`ua-card ${current.totals.failed_logins ? "ua-card-bad" : ""}`}>
              <span>Failed logins</span>
              <strong>{current.totals.failed_logins}</strong>
            </div>
          </div>

          <div className="ua-table-wrap">
            <table className="ua-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Apps used</th>
                  <th>First used</th>
                  <th>Last used</th>
                  <th className="num">Logins</th>
                  <th className="num">Failed</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map((r) => (
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
                        {r.platforms.length ? r.platforms.map((p) => <PlatformBadge key={p} platform={p} />) : "—"}
                      </div>
                    </td>
                    <td>{fmtTime(r.first_seen_at)}</td>
                    <td>{fmtTime(r.last_seen_at)}</td>
                    <td className="num">{r.logins}</td>
                    <td className={`num ${r.failed_logins ? "ua-bad" : ""}`}>{r.failed_logins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!todayRows.length && <div className="ua-empty">No users match these filters.</div>}
          </div>
        </>
      )}

      {current && tab === "daywise" && (
        <>
          <div className="ua-legend">
            {PLATFORMS.map((p) => (
              <span key={p.value}>
                <b className={`ua-letter ua-badge-${p.value}`}>{p.short}</b> {p.label}
              </span>
            ))}
            <span>Blank = not active that day</span>
          </div>
          <div className="ua-table-wrap">
            <table className="ua-table ua-grid">
              <thead>
                <tr>
                  <th className="ua-sticky">Name</th>
                  <th>Role</th>
                  {current.dates.map((d) => {
                    const h = dayHeader(d);
                    return (
                      <th key={d} className="ua-day" title={d}>
                        <div>{h.day}</div>
                        <div className="ua-sub">{h.weekday}</div>
                      </th>
                    );
                  })}
                  <th className="num">Active days</th>
                </tr>
              </thead>
              <tbody>
                {daywiseRows.map((r) => (
                  <tr key={r.id}>
                    <td className="ua-sticky">
                      <div className="ua-name">{r.name}</div>
                      <div className="ua-sub">{r.branch || r.email}</div>
                    </td>
                    <td>{r.role}</td>
                    {current.dates.map((d) => {
                      const used = r.days[d];
                      return (
                        <td
                          key={d}
                          className={`ua-day ${used ? "on" : ""}`}
                          title={used ? used.map((p) => PLATFORM_BY_VALUE[p]?.label || p).join(", ") : "Not active"}
                        >
                          {used ? used.map((p) => PLATFORM_BY_VALUE[p]?.short || "?").join(" ") : ""}
                        </td>
                      );
                    })}
                    <td className="num">
                      {r.active_days} / {current.dates.length}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="ua-sticky">Active users</td>
                  <td></td>
                  {current.dates.map((d) => (
                    <td key={d} className="ua-day">
                      {current.active_per_day[d]}
                    </td>
                  ))}
                  <td></td>
                </tr>
              </tfoot>
            </table>
            {!daywiseRows.length && <div className="ua-empty">No users match these filters.</div>}
          </div>
        </>
      )}

      {current && tab === "logins" && (
        <>
          {current.truncated && (
            <div className="ua-note">Showing the latest {current.rows.length} logins. Pick a shorter period to see older ones.</div>
          )}
          <div className="ua-table-wrap">
            <table className="ua-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>App</th>
                  <th>Result</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {loginRows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.created_at)}</td>
                    <td>
                      <div className="ua-name">{r.name || "(no account)"}</div>
                      <div className="ua-sub">{r.email}</div>
                    </td>
                    <td>{r.role || "—"}</td>
                    <td>
                      <PlatformBadge platform={r.platform} />
                    </td>
                    <td>
                      {r.success ? (
                        <span className="ua-status on">Success</span>
                      ) : (
                        <span className="ua-status bad">{FAILURE_LABELS[r.failure_reason] || "Failed"}</span>
                      )}
                    </td>
                    <td className="ua-sub" title={r.user_agent}>
                      {r.ip_address || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loginRows.length && <div className="ua-empty">No logins in this period.</div>}
          </div>
        </>
      )}
    </div>
  );
}
