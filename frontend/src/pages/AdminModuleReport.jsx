import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiDownload, FiRefreshCw, FiUsers, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { downloadFile } from "./accountant/download";

// Module report (admin -> User Activity -> Module report): every module built into the system,
// how many people can use it and how many actually did in the chosen days, and the work it holds -
// assigned / open / completed. Days: a preset or a From-To calendar range. Downloads (PDF / Excel)
// carry the module figures only, never the list of users.
// Data: GET /api/user-activity/modules  (backend/src/services/moduleUsageReport.service.js).

const PRESETS = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = (d) => (d ? new Date(`${d}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never");
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function UsersDialog({ module: m, daysLabel, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mr-overlay" onClick={onClose}>
      <div className="mr-dialog" role="dialog" aria-modal="true" aria-label={`${m.name} users`} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3>{m.name}</h3>
            <p>
              {m.users.with_access} users with access · {m.users.active} used it ({daysLabel})
            </p>
          </div>
          <button type="button" className="mr-close" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </header>
        <div className="mr-dialog-body">
          <table className="ua-table mr-user-table">
            <colgroup>
              <col className="mr-col-name" />
              <col className="mr-col-role" />
              <col className="mr-col-date" />
              <col className="mr-col-status" />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Last active</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {m.users.list.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="ua-name" title={u.name}>{u.name}</div>
                    <div className="ua-sub" title={u.email}>{u.email}</div>
                  </td>
                  <td>{u.role}</td>
                  <td>{fmtDay(u.last_active)}</td>
                  <td>
                    <span className={`ua-status ${u.active ? "on" : "off"}`}>{u.active ? "Active" : "Inactive"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ module: m, daysLabel, onShowUsers }) {
  const usage = pct(m.users.active, m.users.with_access);
  return (
    <section className={`mr-card ${m.set_up ? "" : "mr-off"}`}>
      <header className="mr-card-head">
        <div>
          <h3>{m.name}</h3>
          <p>{m.description}</p>
        </div>
        {!m.set_up && <span className="mr-tag">Not set up</span>}
      </header>

      <div className="mr-users">
        <div className="mr-users-figs">
          <div>
            <strong>{m.users.with_access}</strong>
            <span>users with access</span>
          </div>
          <div>
            <strong className="mr-good">{m.users.active}</strong>
            <span>used it · {daysLabel}</span>
          </div>
        </div>
        <div className="mr-bar" role="img" aria-label={`${usage}% of users active`}>
          <span style={{ width: `${usage}%` }} />
        </div>
        <small>{m.users.with_access ? `${usage}% of the users with access were active` : "No user accounts in this module's roles yet"}</small>
      </div>

      <div className="mr-work">
        {m.work.map((w) => (
          <div key={w.label} className={`mr-fig ${w.tone ? `mr-${w.tone}` : ""}`}>
            <strong>{w.value === null ? "—" : w.value.toLocaleString("en-IN")}</strong>
            <span>{w.label}</span>
          </div>
        ))}
      </div>

      {/* Footer pinned to the bottom, so every card in a row lines up. */}
      <footer className="mr-card-foot">
        <button type="button" className="mr-toggle" onClick={onShowUsers} disabled={!m.users.with_access}>
          <FiUsers /> View users ({m.users.with_access})
        </button>
        <div className="mr-roles" title={m.roles.join(", ")}>
          Roles: {m.roles.join(", ")}
        </div>
      </footer>
    </section>
  );
}

export default function AdminModuleReport({ onBack }) {
  const today = dayKey(new Date());
  const [preset, setPreset] = useState("30"); // "" when a calendar range is used
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [downloading, setDownloading] = useState(null); // null | "pdf" | "xlsx"
  const [usersOf, setUsersOf] = useState(null); // the module whose users are open

  // The days, as the API takes them: a preset, or a From-To range.
  const query = useMemo(() => {
    if (!preset && from && to) return `from=${from}&to=${to}`;
    return `period=${preset || "30"}`;
  }, [preset, from, to]);

  // Which request the figures on screen came from; until it matches, the report is loading.
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${query}:${reload}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/user-activity/modules?${query}`)
      .then(async (res) => {
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load the module report");
        if (alive) {
          setData(body);
          setError("");
        }
      })
      .catch((err) => alive && setError(err.message || "Failed to load the module report"))
      .finally(() => alive && setLoadedKey(`${query}:${reload}`));
    return () => {
      alive = false;
    };
  }, [query, reload]);

  function pickPreset(k) {
    setPreset(k);
    setFrom("");
    setTo("");
  }

  function pickDate(which, value) {
    setPreset("");
    if (which === "from") {
      setFrom(value);
      if (!to || value > to) setTo(value); // a single day until a To date is chosen
    } else {
      setTo(value);
      if (!from || value < from) setFrom(value);
    }
  }

  async function download(format) {
    setDownloading(format);
    setError("");
    const err = await downloadFile(`/api/user-activity/modules/export?format=${format}&${query}`, `module-report.${format}`);
    setDownloading(null);
    if (err) setError(err);
  }

  const daysLabel = data?.period?.label || PRESETS.find(([k]) => k === preset)?.[1] || "";
  const shortLabel = data?.period?.key === "custom" ? daysLabel : daysLabel.toLowerCase();

  return (
    <div className="ua-page">
      <div className="ua-header">
        <div>
          <button type="button" className="mr-back" onClick={onBack}>
            <FiArrowLeft /> User Activity
          </button>
          <h2>Module report</h2>
          <p>Every module in the system: who can use it, who used it, and the work assigned in it — {daysLabel}.</p>
        </div>
        <div className="ua-actions">
          <button className="ua-secondary" onClick={() => setReload((n) => n + 1)} disabled={loading}>
            <FiRefreshCw /> Refresh
          </button>
          <button className="ua-primary" onClick={() => download("pdf")} disabled={!!downloading || !data}>
            <FiDownload /> {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
          <button className="ua-primary" onClick={() => download("xlsx")} disabled={!!downloading || !data}>
            <FiDownload /> {downloading === "xlsx" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </div>

      <div className="ua-filters">
        <div className="ua-day" role="tablist" aria-label="Days">
          {PRESETS.map(([k, text]) => (
            <button key={k} type="button" role="tab" aria-selected={preset === k} className={preset === k ? "active" : ""} onClick={() => pickPreset(k)}>
              {text}
            </button>
          ))}
        </div>
        <label>
          From
          <input type="date" value={from} max={today} onChange={(e) => e.target.value && pickDate("from", e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => e.target.value && pickDate("to", e.target.value)} />
        </label>
        {!preset && (
          <button type="button" className="mr-clear" onClick={() => pickPreset("30")}>
            Clear dates
          </button>
        )}
      </div>

      {error && <div className="ua-error">{error}</div>}
      {loading && !data && <div className="ua-empty">Building the report…</div>}

      {data && (
        <div className={loading ? "mr-loading" : undefined}>
          <div className="ua-cards">
            <div className="ua-card">
              <span>Modules</span>
              <strong>{data.totals.modules}</strong>
            </div>
            <div className="ua-card ua-card-good">
              <span>Modules in use</span>
              <strong>{data.totals.in_use}</strong>
            </div>
            <div className="ua-card">
              <span>Users with access</span>
              <strong>{data.totals.users}</strong>
            </div>
            <div className="ua-card ua-card-good">
              <span>Active users · {shortLabel}</span>
              <strong>{data.totals.active_users}</strong>
            </div>
          </div>

          <p className="mr-note">
            "Used it" = signed in or used the website or an app in these days. Assigned, added and completed are for these days; "open", "unpaid" and
            "overdue" are as of now. Admins can open every module and are not counted.
          </p>

          <div className="mr-grid">
            {data.modules.map((m) => (
              <ModuleCard key={m.key} module={m} daysLabel={shortLabel} onShowUsers={() => setUsersOf(m)} />
            ))}
          </div>
        </div>
      )}

      {usersOf && <UsersDialog module={usersOf} daysLabel={shortLabel} onClose={() => setUsersOf(null)} />}
    </div>
  );
}
