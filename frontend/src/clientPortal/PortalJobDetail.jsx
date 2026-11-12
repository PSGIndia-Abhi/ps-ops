import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiUser, FiRefreshCw, FiX, FiAlertCircle, FiCamera, FiCheckCircle, FiPlusCircle, FiActivity } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import PortalPhoto from "./PortalPhoto";
import { formatDate, formatDateTime, relativeDay, serviceLabel, statusInfo } from "./portalUtils";

// Turns raw history entries into short client-friendly text.
function describe(entry) {
  if (entry.action === "CREATED") return { text: "Job created", icon: <FiPlusCircle aria-hidden="true" /> };
  if (entry.action === "BEFORE_PHOTOS") return { text: "Before-work photos added", icon: <FiCamera aria-hidden="true" /> };
  if (entry.action === "AFTER_PHOTOS") return { text: "After-work photos added", icon: <FiCamera aria-hidden="true" /> };
  if (entry.action === "STATUS_CHANGED") {
    const m = /from\s+(\w+)\s+to\s+(\w+)/i.exec(entry.message || "");
    if (m) {
      const to = statusInfo(m[2]).label;
      return { text: `Status changed to ${to}`, icon: <FiCheckCircle aria-hidden="true" /> };
    }
  }
  return { text: entry.message || "Update", icon: <FiActivity aria-hidden="true" /> };
}

export default function PortalJobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewer, setViewer] = useState(null); // { url, name }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/client-portal/jobs/${encodeURIComponent(jobId)}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load job");
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
  }, [jobId, reloadKey]);

  // Close the photo viewer with Escape.
  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => e.key === "Escape" && setViewer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const back = (
    <button className="cp-back-link" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/client/jobs"))}>
      <FiArrowLeft aria-hidden="true" /> Back
    </button>
  );

  if (loading && !data) {
    return (
      <div className="cp-page">
        {back}
        <div className="cp-card cp-skeleton" style={{ minHeight: 160 }} />
        <div className="cp-card cp-skeleton" style={{ minHeight: 260 }} />
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

  const { job, visits, timeline } = data;
  const st = statusInfo(job.status);
  const done = visits.filter((v) => v.status === "COMPLETED").length;
  const pct = visits.length ? Math.round((done / visits.length) * 100) : 0;
  const nextVisit = visits.find((v) => v.status === "SCHEDULED" && new Date(v.scheduled_date) >= new Date(new Date().toDateString()));
  const photos = timeline.flatMap((e) => e.attachments.map((a) => ({ ...a, action: e.action })));

  const facts = [
    { label: "Start date", value: formatDate(job.start_date || job.created_at) },
    { label: "Due date", value: formatDate(job.due_date) },
    { label: "Completed", value: formatDate(job.completed_at) },
    { label: "Next visit", value: nextVisit ? `${formatDate(nextVisit.scheduled_date)} · ${relativeDay(nextVisit.scheduled_date)}` : "—" },
  ];

  return (
    <div className="cp-page">
      {back}

      <section className="cp-card cp-job-header">
        <div className="cp-job-header-top">
          <div>
            <small className="cp-muted">Job #{job.code || job.id}</small>
            <h2>{serviceLabel(job.service_type)}</h2>
            {job.sub_service && <p>{job.sub_service}</p>}
          </div>
          <span className={`cp-status lg ${st.className}`}>{st.label}</span>
        </div>
        <button className="cp-job-outlet" onClick={() => job.site_id && navigate(`/client/outlets/${encodeURIComponent(job.site_id)}`)}>
          <FiMapPin aria-hidden="true" />
          <span><strong>{job.site_name || "Outlet"}</strong>{(job.site_address || job.address) && <small>{job.site_address || job.address}</small>}</span>
        </button>
        <div className="cp-job-progress">
          <div className="cp-progress lg"><span style={{ width: `${pct}%` }} /></div>
          <small>{done} of {visits.length} visit{visits.length === 1 ? "" : "s"} completed</small>
        </div>
        <div className="cp-facts">
          {facts.map((f) => (
            <div key={f.label}><small>{f.label}</small><strong>{f.value}</strong></div>
          ))}
        </div>
        <div className="cp-actions">
          <button className="cp-btn cp-btn-ghost" onClick={() => navigate(`/client/complaints?job=${encodeURIComponent(job.id)}${job.site_id ? `&site=${encodeURIComponent(job.site_id)}` : ""}`)}>
            <FiAlertCircle /> Report an issue with this job
          </button>
        </div>
      </section>

      <div className="cp-grid-2 cp-grid-2-even">
        <section className="cp-card">
          <header className="cp-card-head"><h3>Visits</h3><small>{visits.length} total</small></header>
          {visits.length === 0 ? <div className="cp-empty">No visits planned yet.</div> : (
            <ol className="cp-visit-steps">
              {visits.map((v) => {
                const vs = statusInfo(v.status);
                return (
                  <li key={v.id} className={`step-${String(v.status).toLowerCase()}`}>
                    <span className="cp-step-dot" aria-hidden="true" />
                    <div className="cp-step-body">
                      <div className="cp-step-top">
                        <strong>Visit {v.visit_number || ""}</strong>
                        <span className={`cp-status ${vs.className}`}>{vs.label}</span>
                      </div>
                      <small>
                        {v.status === "COMPLETED" && v.completed_at
                          ? `Completed ${formatDateTime(v.completed_at)}`
                          : `${formatDate(v.scheduled_date)} · ${relativeDay(v.scheduled_date)}`}
                      </small>
                      {v.technicians.length > 0 && (
                        <small className="cp-step-tech"><FiUser aria-hidden="true" /> {v.technicians.join(", ")}</small>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="cp-card">
          <header className="cp-card-head"><h3>Service photos</h3><small>{photos.length} photo{photos.length === 1 ? "" : "s"}</small></header>
          {photos.length === 0 ? <div className="cp-empty">No photos shared for this job yet.</div> : (
            <div className="cp-photo-grid">
              {photos.map((p) => (
                <figure key={p.id} className="cp-photo-fig">
                  <PortalPhoto attachment={p} onOpen={(url) => setViewer({ url, name: p.file_name })} />
                  <figcaption>{p.action === "BEFORE_PHOTOS" ? "Before" : p.action === "AFTER_PHOTOS" ? "After" : "Photo"}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="cp-card">
        <header className="cp-card-head"><h3>Updates</h3><small>Newest first</small></header>
        {timeline.length === 0 ? <div className="cp-empty">No updates yet.</div> : (
          <ul className="cp-timeline cp-timeline-icons">
            {timeline.map((e) => {
              const d = describe(e);
              return (
                <li key={e.id}>
                  <span className="cp-timeline-icon">{d.icon}</span>
                  <div>
                    <p>{d.text}</p>
                    <small>
                      {formatDateTime(e.created_at)}
                      {e.attachments.length > 0 && ` · ${e.attachments.length} photo${e.attachments.length === 1 ? "" : "s"} (see Service photos)`}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {viewer && (
        <div className="cp-viewer" onClick={() => setViewer(null)} role="dialog" aria-label="Photo">
          <button className="cp-viewer-close" onClick={() => setViewer(null)} aria-label="Close photo"><FiX /></button>
          <img src={viewer.url} alt={viewer.name || "Service photo"} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
