import { useEffect, useState } from "react";
import { FiClipboard, FiMail, FiPhone, FiUsers } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import "./StaffHome.css";

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export default function StaffHome() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/users/me/hierarchy");
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load your details");
        if (!cancelled) setData(body);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err.message || "Failed to load your details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="staff-empty">Loading...</div>;
  if (error) return <div className="staff-error">{error}</div>;
  if (!data) return null;

  return (
    <div className="staff-home">
      <div className="staff-card staff-me">
        <span className="staff-avatar">{initials(data.user.name)}</span>
        <div>
          <h2>{data.user.name}</h2>
          <div className="staff-muted">{data.designation?.name || data.user.role}</div>
          {data.user.email && (
            <div className="staff-contact">
              <FiMail /> {data.user.email}
            </div>
          )}
          {data.user.phone && (
            <div className="staff-contact">
              <FiPhone /> {data.user.phone}
            </div>
          )}
        </div>
      </div>

      <div className="staff-grid">
        <div className="staff-card">
          <h3>Department</h3>
          {data.unit ? (
            <div className="staff-crumbs">{data.unit.path.map((p) => p.name).join(" › ")}</div>
          ) : (
            <div className="staff-muted">Not assigned to a department yet.</div>
          )}
        </div>

        <div className="staff-card">
          <h3>Reports to</h3>
          {data.managers.length === 0 ? (
            <div className="staff-muted">No manager assigned.</div>
          ) : (
            data.managers.map((m) => (
              <div key={m.line_id} className="staff-person-row">
                <span className="staff-avatar sm">{initials(m.name)}</span>
                <div>
                  <div className="staff-name">{m.name}</div>
                  <div className="staff-muted">{[m.designation, m.unit_name].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {data.direct_reports.length > 0 && (
          <div className="staff-card">
            <h3>
              <FiUsers /> My team ({data.direct_reports.length})
            </h3>
            {data.direct_reports.map((r) => (
              <div key={r.line_id} className="staff-person-row">
                <span className="staff-avatar sm">{initials(r.name)}</span>
                <div>
                  <div className="staff-name">{r.name}</div>
                  <div className="staff-muted">{[r.designation, r.unit_name].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="staff-card staff-tasks">
          <h3>
            <FiClipboard /> My Tasks
          </h3>
          <div className="staff-empty-state">
            Task assignment isn&apos;t set up yet. Once it is, tasks assigned to you will show up here.
          </div>
        </div>
      </div>
    </div>
  );
}
