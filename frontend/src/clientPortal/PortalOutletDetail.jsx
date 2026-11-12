import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiMapPin, FiNavigation, FiBarChart2, FiPlusCircle, FiAlertCircle, FiPhone, FiMail, FiRefreshCw,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, relativeDay, RISK_STYLE, serviceLabel, statusInfo } from "./portalUtils";

export default function PortalOutletDetail() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const { setOutletId } = useOutletContext();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/client-portal/outlets/${encodeURIComponent(siteId)}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load outlet");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadKey]);

  const back = (
    <button className="cp-back-link" onClick={() => navigate("/client/outlets")}>
      <FiArrowLeft aria-hidden="true" /> All outlets
    </button>
  );

  if (loading && !data) {
    return (
      <div className="cp-page">
        {back}
        <div className="cp-card cp-skeleton" style={{ minHeight: 140 }} />
        <div className="cp-card cp-skeleton" style={{ minHeight: 240 }} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="cp-page">
        {back}
        <div className="cp-alert">
          {error}
          <button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button>
        </div>
      </div>
    );
  }

  const { outlet, stats, services, upcoming_visits: upcoming, recent_visits: recent, recent_jobs: jobs, complaints, audits, contacts } = data;
  const risk = RISK_STYLE[String(stats.audit_risk || "").toUpperCase()];
  const mapsUrl = outlet.latitude != null && outlet.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`
    : outlet.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(outlet.address)}` : null;

  const statCards = [
    { label: "Active jobs", value: stats.active_jobs },
    { label: "Services done", value: stats.visits_done },
    { label: "Next visit", value: stats.next_visit ? formatDate(stats.next_visit, { day: "2-digit", month: "short" }) : "—", sub: stats.next_visit ? relativeDay(stats.next_visit) : "Not scheduled" },
    { label: "Last visit", value: stats.last_visit ? formatDate(stats.last_visit, { day: "2-digit", month: "short" }) : "—", sub: stats.last_visit ? relativeDay(stats.last_visit) : "No visits yet" },
    { label: "Open complaints", value: stats.open_complaints, warn: stats.open_complaints > 0 },
    { label: "Audit risk", value: risk ? risk.label : "—", sub: stats.audit_date ? `Audited ${formatDate(stats.audit_date)}` : "No audit yet", riskClass: risk?.className },
  ];

  return (
    <div className="cp-page">
      {back}

      <section className="cp-card cp-outlet-header">
        <div className="cp-outlet-header-main">
          <span className="cp-outlet-icon lg"><FiMapPin aria-hidden="true" /></span>
          <div>
            <h2>{outlet.name || outlet.id}</h2>
            <p>{outlet.address || "No address on file"}</p>
            {outlet.branch_name && <small className="cp-muted">Served by {outlet.branch_name}</small>}
          </div>
        </div>
        <div className="cp-actions">
          {mapsUrl && (
            <a className="cp-btn cp-btn-ghost" href={mapsUrl} target="_blank" rel="noreferrer"><FiNavigation /> Open in Maps</a>
          )}
          <button className="cp-btn cp-btn-ghost" onClick={() => { setOutletId(outlet.id); navigate("/client"); }}>
            <FiBarChart2 /> Outlet dashboard
          </button>
          <button className="cp-btn cp-btn-ghost" onClick={() => navigate(`/client/complaints?site=${encodeURIComponent(outlet.id)}`)}>
            <FiAlertCircle /> Raise complaint
          </button>
          <button className="cp-btn" onClick={() => navigate(`/client/request-service?site=${encodeURIComponent(outlet.id)}`)}>
            <FiPlusCircle /> Request service
          </button>
        </div>
      </section>

      <div className="cp-stat-row">
        {statCards.map((s) => (
          <div key={s.label} className={`cp-stat ${s.warn ? "warn" : ""}`}>
            <small>{s.label}</small>
            {s.riskClass ? <span className={`cp-risk ${s.riskClass}`}>{s.value}</span> : <strong>{s.value}</strong>}
            {s.sub && <span>{s.sub}</span>}
          </div>
        ))}
      </div>

      <section className="cp-card">
        <header className="cp-card-head"><h3>Services at this outlet</h3></header>
        {services.length === 0 ? (
          <div className="cp-empty">No services yet. Use “Request service” to book one.</div>
        ) : (
          <div className="cp-table-wrap">
            <table className="cp-table cp-table-static">
              <thead>
                <tr><th>Service</th><th>Jobs</th><th>Active</th><th>Last done</th><th>Next due</th></tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.service_type || "none"}>
                    <td><strong>{serviceLabel(s.service_type)}</strong></td>
                    <td>{s.jobs}</td>
                    <td>{s.active_jobs}</td>
                    <td>{formatDate(s.last_done)}</td>
                    <td>{s.next_due ? `${formatDate(s.next_due)} · ${relativeDay(s.next_due)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cp-grid-2">
        <section className="cp-card">
          <header className="cp-card-head"><h3>Upcoming visits</h3></header>
          {upcoming.length === 0 ? <div className="cp-empty">No visits scheduled.</div> : (
            <ul className="cp-list">
              {upcoming.map((v) => (
                <li key={v.id} className="cp-visit cp-clickable" onClick={() => navigate(`/client/jobs/${encodeURIComponent(v.job_id)}`)}>
                  <div className="cp-visit-date">
                    <strong>{formatDate(v.scheduled_date, { day: "2-digit" })}</strong>
                    <small>{formatDate(v.scheduled_date, { month: "short" })}</small>
                  </div>
                  <div className="cp-visit-text">
                    <strong>{serviceLabel(v.service_type)}</strong>
                    <small>Visit {v.visit_number || ""} · {v.job_code || "—"}</small>
                  </div>
                  <span className="cp-pill">{relativeDay(v.scheduled_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cp-card">
          <header className="cp-card-head"><h3>Recent visits</h3></header>
          {recent.length === 0 ? <div className="cp-empty">No past visits yet.</div> : (
            <ul className="cp-rows">
              {recent.map((v) => {
                const st = statusInfo(v.status);
                return (
                  <li key={v.id}>
                    <div>
                      <strong>{serviceLabel(v.service_type)}</strong>
                      <small>{formatDate(v.completed_at || v.scheduled_date)} · {v.job_code || "—"}</small>
                    </div>
                    <span className={`cp-status ${st.className}`}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="cp-card">
        <header className="cp-card-head"><h3>Recent jobs</h3><small>Latest 10</small></header>
        {jobs.length === 0 ? <div className="cp-empty">No jobs yet.</div> : (
          <div className="cp-table-wrap">
            <table className="cp-table cp-table-static">
              <thead><tr><th>Job</th><th>Service</th><th>Created</th><th>Completed</th><th>Status</th></tr></thead>
              <tbody>
                {jobs.map((j) => {
                  const st = statusInfo(j.status);
                  return (
                    <tr key={j.id} className="cp-clickable" onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
                      <td><strong>{j.code || "—"}</strong></td>
                      <td>{serviceLabel(j.service_type)}{j.sub_service && <small>{j.sub_service}</small>}</td>
                      <td>{formatDate(j.created_at)}</td>
                      <td>{formatDate(j.completed_at)}</td>
                      <td><span className={`cp-status ${st.className}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cp-grid-2">
        <section className="cp-card">
          <header className="cp-card-head">
            <h3>Complaints</h3>
            <button className="cp-link" onClick={() => navigate(`/client/complaints?site=${encodeURIComponent(outlet.id)}`)}>View all</button>
          </header>
          {complaints.length === 0 ? <div className="cp-empty">No complaints raised for this outlet.</div> : (
            <ul className="cp-rows">
              {complaints.map((c) => {
                const st = statusInfo(c.status);
                return (
                  <li key={c.id} className="cp-clickable" onClick={() => navigate(`/client/complaints/${encodeURIComponent(c.id)}`)}>
                    <div><strong>{c.subject}</strong><small>{formatDate(c.created_at)}{c.priority ? ` · ${String(c.priority).toLowerCase()} priority` : ""}</small></div>
                    <span className={`cp-status ${st.className}`}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="cp-card">
          <header className="cp-card-head">
            <h3>Audits</h3>
            <button className="cp-link" onClick={() => navigate("/client/audits")}>View all</button>
          </header>
          {audits.length === 0 ? <div className="cp-empty">No audits for this outlet yet.</div> : (
            <ul className="cp-rows">
              {audits.map((a) => {
                const r = RISK_STYLE[String(a.risk || "").toUpperCase()];
                return (
                  <li key={a.id}>
                    <div><strong>{a.audit_number || "Audit"}</strong><small>{formatDate(a.audit_date)}{a.audit_type ? ` · ${a.audit_type}` : ""}</small></div>
                    {r ? <span className={`cp-risk ${r.className}`}>{r.label}</span> : <span className="cp-muted">—</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {contacts.length > 0 && (
        <section className="cp-card">
          <header className="cp-card-head"><h3>Your contacts at this outlet</h3></header>
          <div className="cp-contacts">
            {contacts.map((c) => (
              <div key={c.id} className="cp-contact">
                <div className="cp-contact-avatar">{(c.name || "?").charAt(0).toUpperCase()}</div>
                <div className="cp-contact-text">
                  <strong>{c.name}{c.is_primary && <span className="cp-tag">Primary</span>}</strong>
                  {c.role && <small>{c.role}</small>}
                  <div className="cp-contact-links">
                    {c.phone && <a href={`tel:${c.phone}`}><FiPhone aria-hidden="true" /> {c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`}><FiMail aria-hidden="true" /> {c.email}</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
