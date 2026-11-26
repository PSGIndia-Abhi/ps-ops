import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiMapPin, FiNavigation, FiBarChart2, FiPlusCircle, FiAlertCircle, FiPhone, FiMail, FiRefreshCw,
  FiClipboard, FiCheckCircle, FiCalendar, FiClock, FiShield, FiTool, FiDroplet, FiChevronRight, FiHome,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, relativeDay, RISK_STYLE, serviceLabel } from "./portalUtils";
import PortalLoader from "./PortalLoader";

// "OPERATION" -> "Operation"; known codes (PEST, DEEP...) keep their nice label.
function niceService(code) {
  const label = serviceLabel(code);
  return /^[A-Z_]+$/.test(label) ? label.charAt(0) + label.slice(1).toLowerCase().replace(/_/g, " ") : label;
}

// Icon + colour per service type.
function serviceIcon(code) {
  const c = String(code || "").toUpperCase();
  if (c === "PEST" || c === "BOTH") return { tone: "green", Icon: FiShield };
  if (c === "DEEP") return { tone: "violet", Icon: FiDroplet };
  return { tone: "blue", Icon: FiTool };
}

// Status pill label + colour for visits, jobs and complaints.
const PILLS = {
  SCHEDULED: { label: "Scheduled", tone: "blue" },
  NOT_STARTED: { label: "Scheduled", tone: "blue" },
  CREATED: { label: "Scheduled", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  AWAITING_APPROVAL: { label: "Under review", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  MISSED: { label: "Missed", tone: "red" },
  CANCELED: { label: "Cancelled", tone: "slate" },
  PAUSED: { label: "Paused", tone: "slate" },
  OPEN: { label: "Open", tone: "orange" },
  RESOLVED: { label: "Resolved", tone: "green" },
  CLOSED: { label: "Closed", tone: "slate" },
};
const pillFor = (s) => PILLS[String(s || "").toUpperCase()] || { label: s || "—", tone: "slate" };

export default function PortalOutletDetail() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const { setOutletId } = useOutletContext();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Activity card: which tab is open, and whether all loaded items are shown (first 5 otherwise).
  const [activityTab, setActivityTab] = useState("recent");
  const [showAll, setShowAll] = useState(false);

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
        <PortalLoader label="Loading outlet…" />
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
  const site = encodeURIComponent(outlet.id);
  const risk = RISK_STYLE[String(stats.audit_risk || "").toUpperCase()];
  const mapsUrl = outlet.latitude != null && outlet.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`
    : outlet.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(outlet.address)}` : null;
  const short = { day: "2-digit", month: "short" };

  const tiles = [
    { label: "Active jobs", value: stats.active_jobs, sub: "in progress or scheduled", tone: "blue", Icon: FiClipboard },
    { label: "Services done", value: stats.visits_done, sub: "all time", tone: "green", Icon: FiCheckCircle },
    { label: "Next visit", value: stats.next_visit ? formatDate(stats.next_visit, short) : "—", sub: stats.next_visit ? relativeDay(stats.next_visit) : "not scheduled", tone: "slate", Icon: FiCalendar },
    { label: "Last visit", value: stats.last_visit ? formatDate(stats.last_visit, short) : "—", sub: stats.last_visit ? relativeDay(stats.last_visit) : "no visits yet", tone: "violet", Icon: FiClock },
    { label: "Open complaints", value: stats.open_complaints, sub: stats.open_complaints ? "needs attention" : "all clear", tone: "orange", Icon: FiAlertCircle },
    { label: "Audit risk", value: risk ? risk.label : "—", sub: stats.audit_date ? `audited ${formatDate(stats.audit_date, short)}` : "no audit yet", tone: "teal", Icon: FiShield },
  ];


  return (
    <div className="cp-page cp-od">
      {back}

      {/* Header banner */}
      <section className="cp-od-hero">
        <svg className="cp-od-rings" viewBox="0 0 460 460" aria-hidden="true">
          <circle cx="230" cy="230" r="220" /><circle cx="230" cy="230" r="160" /><circle cx="230" cy="230" r="100" />
        </svg>
        <div className="cp-od-hero-main">
          <span className="cp-od-pin" aria-hidden="true"><FiMapPin /></span>
          <div>
            <h2>{outlet.name || outlet.id}</h2>
            <p>{outlet.address || "No address on file"}</p>
            <div className="cp-od-chips">
              {outlet.branch_name && <span className="cp-od-chip"><FiHome aria-hidden="true" /> Served by {outlet.branch_name}</span>}
              {stats.open_complaints > 0 && (
                <span className="cp-od-chip red">{stats.open_complaints} open complaint{stats.open_complaints === 1 ? "" : "s"}</span>
              )}
            </div>
          </div>
        </div>
        <div className="cp-od-actions">
          {mapsUrl && (
            <a className="cp-od-btn" href={mapsUrl} target="_blank" rel="noreferrer"><FiNavigation aria-hidden="true" /> Open in Maps</a>
          )}
          <button className="cp-od-btn" onClick={() => { setOutletId(outlet.id); navigate("/client"); }}>
            <FiBarChart2 aria-hidden="true" /> Outlet dashboard
          </button>
          <button className="cp-od-btn" onClick={() => navigate(`/client/complaints?site=${site}`)}>
            <FiAlertCircle aria-hidden="true" /> Raise complaint
          </button>
          <button className="cp-od-btn primary" onClick={() => navigate(`/client/request-service?site=${site}`)}>
            <FiPlusCircle aria-hidden="true" /> Request service
          </button>
        </div>
      </section>

      {/* Coloured stat tiles */}
      <div className="cp-od-tiles">
        {tiles.map((t) => {
          const Icon = t.Icon;
          return (
            <div key={t.label} className={`cp-od-tile tone-${t.tone}`}>
              <span className="cp-od-tile-icon" aria-hidden="true"><Icon /></span>
              <span className="cp-od-tile-label">{t.label}</span>
              <strong>{t.value}</strong>
              <small>{t.sub}</small>
            </div>
          );
        })}
      </div>

      {/* Services */}
      <section className="cp-card cp-od-card">
        <header className="cp-od-head"><h3>Services at this outlet</h3></header>
        {services.length === 0 ? (
          <div className="cp-od-empty">No services yet. Use “Request service” to book one.</div>
        ) : (
          <div className="cp-od-services">
            {services.map((s) => {
              const svc = serviceIcon(s.service_type);
              const Icon = svc.Icon;
              return (
                <div key={s.service_type || "none"} className="cp-od-service">
                  <span className={`cp-od-svc-icon tone-${svc.tone}`} aria-hidden="true"><Icon /></span>
                  <span className="cp-od-service-text">
                    <strong>{niceService(s.service_type)}</strong>
                    <small>
                      Last done {formatDate(s.last_done)} · {s.next_due ? `next ${formatDate(s.next_due, short)} (${relativeDay(s.next_due)})` : "next not scheduled"}
                    </small>
                  </span>
                  <span className="cp-od-mini">
                    <span className="slate">{s.jobs} job{s.jobs === 1 ? "" : "s"}</span>
                    {s.active_jobs > 0 && <span className="blue">{s.active_jobs} active</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="cp-od-cols">
        <div className="cp-od-col">
          {/* Activity: Recent visits / Upcoming / Jobs as a timeline (first 5, then "Show all"). */}
          {(() => {
            const lists = { recent, upcoming, jobs };
            const list = lists[activityTab] || [];
            const shownItems = showAll ? list : list.slice(0, 5);
            const tabs = [
              { key: "recent", label: "Recent visits", count: recent.length },
              { key: "upcoming", label: "Upcoming", count: upcoming.length },
              { key: "jobs", label: "Jobs", count: jobs.length },
            ];
            const empty = { recent: "No past visits yet.", upcoming: "No visits scheduled.", jobs: "No jobs yet." }[activityTab];
            return (
              <section className="cp-card cp-od-card">
                <header className="cp-od-head">
                  <h3>Activity</h3>
                  <button className="cp-link" onClick={() => navigate(activityTab === "jobs" ? "/client/jobs" : "/client/jobs?tab=visits")}>
                    All jobs &amp; visits <FiChevronRight aria-hidden="true" />
                  </button>
                </header>
                <div className="cp-od-switch" role="tablist" aria-label="Activity">
                  {tabs.map((t) => (
                    <button
                      key={t.key} role="tab" aria-selected={activityTab === t.key} className={activityTab === t.key ? "active" : ""}
                      onClick={() => { setActivityTab(t.key); setShowAll(false); }}
                    >
                      {t.label} <i>{t.count}</i>
                    </button>
                  ))}
                </div>
                {list.length === 0 ? (
                  <div className="cp-od-empty">{empty}</div>
                ) : (
                  <ul className="cp-od-tl">
                    {shownItems.map((item) => {
                      const isJob = activityTab === "jobs";
                      const when = isJob ? item.completed_at || item.created_at : activityTab === "recent" ? item.completed_at || item.scheduled_date : item.scheduled_date;
                      const pill = activityTab === "upcoming" ? { label: relativeDay(item.scheduled_date), tone: "blue" } : pillFor(item.status);
                      const target = isJob ? item.id : item.job_id;
                      return (
                        <li key={item.id}>
                          <button className="cp-od-tl-row" onClick={() => navigate(`/client/jobs/${encodeURIComponent(target)}`)}>
                            <span className="cp-od-tl-date">
                              <strong>{formatDate(when, { day: "2-digit" })}</strong>
                              <small>{formatDate(when, { month: "short", year: "numeric" })}</small>
                            </span>
                            <span className={`cp-od-tl-dot tone-${pill.tone}`} aria-hidden="true" />
                            <span className="cp-od-row-text">
                              <strong>
                                {niceService(item.service_type)}
                                {isJob && item.sub_service && <span className="cp-od-tl-sub">{item.sub_service}</span>}
                              </strong>
                              <small>
                                {isJob
                                  ? `Job #${item.code || "—"} · created ${formatDate(item.created_at, short)}`
                                  : `${item.visit_number ? `Visit ${item.visit_number} · ` : ""}Job #${item.job_code || "—"}`}
                              </small>
                            </span>
                            <span className={`cp-od-pill tone-${pill.tone}`}>{pill.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {list.length > 5 && (
                  <button className="cp-od-more" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show less ▴" : `Show all ${list.length} ▾`}
                  </button>
                )}
              </section>
            );
          })()}
        </div>

        <div className="cp-od-col">
          {/* Complaints */}
          <section className="cp-card cp-od-card">
            <header className="cp-od-head">
              <h3>Complaints</h3>
              <button className="cp-link" onClick={() => navigate(`/client/complaints?site=${site}`)}>View all <FiChevronRight aria-hidden="true" /></button>
            </header>
            {complaints.length === 0 ? <div className="cp-od-empty">No complaints raised for this outlet.</div> : (
              <ul className="cp-od-list">
                {complaints.map((c) => {
                  const pill = pillFor(c.status);
                  const open = ["OPEN", "IN_PROGRESS"].includes(String(c.status || "").toUpperCase());
                  return (
                    <li key={c.id}>
                      <button className={`cp-od-row ${open ? "warn" : ""}`} onClick={() => navigate(`/client/complaints/${encodeURIComponent(c.id)}`)}>
                        <span className={`cp-od-svc-icon sm tone-${open ? "orange" : "slate"}`} aria-hidden="true"><FiAlertCircle /></span>
                        <span className="cp-od-row-text">
                          <strong>{c.subject}</strong>
                          <small>Raised {formatDate(c.created_at, short)}{c.priority ? ` · ${String(c.priority).charAt(0)}${String(c.priority).slice(1).toLowerCase()} priority` : ""}</small>
                        </span>
                        <span className={`cp-od-pill tone-${pill.tone}`}>{pill.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Audits */}
          <section className="cp-card cp-od-card">
            <header className="cp-od-head">
              <h3>Audit reports</h3>
              <button className="cp-link" onClick={() => navigate("/client/audits")}>View all <FiChevronRight aria-hidden="true" /></button>
            </header>
            {audits.length === 0 ? <div className="cp-od-empty">No audits for this outlet yet.</div> : (
              <ul className="cp-od-list">
                {audits.map((a) => {
                  const r = RISK_STYLE[String(a.risk || "").toUpperCase()];
                  return (
                    <li key={a.id} className="cp-od-row static">
                      <span className="cp-od-svc-icon sm tone-teal" aria-hidden="true"><FiShield /></span>
                      <span className="cp-od-row-text">
                        <strong>{a.audit_number || "Audit"}</strong>
                        <small>{formatDate(a.audit_date)}{a.audit_type ? ` · ${a.audit_type}` : ""}</small>
                      </span>
                      {r ? <span className={`cp-risk ${r.className}`}>{r.label}</span> : <span className="cp-muted">—</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Contacts */}
          <section className="cp-card cp-od-card">
            <header className="cp-od-head"><h3>Your contacts here</h3></header>
            {contacts.length === 0 ? <div className="cp-od-empty">No contacts linked to this outlet yet.</div> : (
              <div className="cp-contacts cp-od-contacts">
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
                    {c.phone && (
                      <a className="cp-od-call" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}><FiPhone aria-hidden="true" /> Call</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
