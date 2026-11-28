import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiBriefcase, FiPaperclip, FiSend, FiX, FiRefreshCw, FiCheckCircle } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import PortalPhoto from "./PortalPhoto";
import { formatDateTime, serviceLabel, statusInfo } from "./portalUtils";
import PortalLoader from "./PortalLoader";

// Complaint stages, in order, with a one-line explanation of the current one.
const STAGES = [
  { key: "OPEN", label: "Raised", note: "We have your complaint. Our team will pick it up shortly." },
  { key: "IN_PROGRESS", label: "In progress", note: "Our team is working on it." },
  { key: "VISIT_SCHEDULED", label: "Visit scheduled", note: "Our team will visit your outlet to fix it." },
  { key: "RESOLVED", label: "Resolved", note: "Marked as fixed by our team. Reply if the problem is still there." },
  { key: "CLOSED", label: "Closed", note: "Closed by our team. Raise a new complaint if the issue comes back." },
];

const PRIORITY_LABEL = { LOW: "Low", MEDIUM: "Normal", HIGH: "High", URGENT: "Urgent" };
const CATEGORY_LABEL = { SERVICE: "Service", ACCOUNTS: "Accounts" };

// Stages box on the right side: ✓ Raised │ ● In progress │ ○ Visit scheduled │ ○ Resolved │ ○ Closed
function StageCard({ status, createdAt, visitText }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.key === String(status || "").toUpperCase()));
  const allDone = idx === STAGES.length - 1;
  return (
    <section className="cp-card cp-cd-card">
      <h3>Stages</h3>
      <ol className="cp-vstages" aria-label="Complaint stages">
        {STAGES.map((s, i) => {
          const state = i < idx || allDone ? "done" : i === idx ? "now" : "next";
          return (
            <li key={s.key} className={state} aria-current={i === idx ? "step" : undefined}>
              <span className="cp-vstage-dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
              <span className="cp-vstage-text">
                <strong>{s.label}</strong>
                {i === 0 && <em>{formatDateTime(createdAt)}</em>}
                {s.key === "VISIT_SCHEDULED" && visitText && i <= idx && <em className="visit">{visitText}</em>}
                {i === idx && !allDone && <small>{s.note}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const MAX_FILES = 10; // per reply; the server allows the same (MAX_COMPLAINT_FILES)
const MAX_SIZE = 10 * 1024 * 1024;

export default function PortalComplaintDetail() {
  const { complaintId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState(() =>
    location.state?.justCreated
      ? { type: location.state.warning ? "warn" : "ok", text: location.state.warning || "Complaint sent. Our team has been notified." }
      : null
  );

  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState(null);
  const [viewer, setViewer] = useState(null);
  const fileInput = useRef(null);
  const threadEnd = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/client-portal/complaints/${encodeURIComponent(complaintId)}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load complaint");
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
  }, [complaintId, reloadKey]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [data?.messages?.length]);

  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => e.key === "Escape" && setViewer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  function addFiles(list) {
    const incoming = Array.from(list || []);
    if (incoming.some((f) => !(f.type.startsWith("image/") || f.type === "application/pdf"))) return setReplyError("Only photos and PDF files can be attached.");
    if (incoming.some((f) => f.size > MAX_SIZE)) return setReplyError("Each file must be 10 MB or smaller.");
    setReplyError(files.length + incoming.length > MAX_FILES ? `You can attach up to ${MAX_FILES} files.` : null);
    setFiles([...files, ...incoming].slice(0, MAX_FILES));
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim() && files.length === 0) return;
    setSending(true);
    setReplyError(null);
    try {
      const fd = new FormData();
      fd.set("message", reply.trim());
      files.forEach((f) => fd.append("files", f, f.name));
      const res = await apiFetch(`/api/client-portal/complaints/${encodeURIComponent(complaintId)}/messages`, { method: "POST", body: fd });
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Could not send your message");
      setReply("");
      setFiles([]);
      if (body.warning) setNotice({ type: "warn", text: body.warning });
      else if (body.reopened) setNotice({ type: "ok", text: "Message sent. Our team will take another look." });
      setReloadKey((n) => n + 1);
    } catch (err) {
      setReplyError(err.message);
    } finally {
      setSending(false);
    }
  }

  const back = (
    <button className="cp-back-link" onClick={() => navigate("/client/complaints")}>
      <FiArrowLeft aria-hidden="true" /> All complaints
    </button>
  );

  if (loading && !data) {
    return <div className="cp-page">{back}<PortalLoader label="Loading complaint…" /></div>;
  }
  if (error && !data) {
    return (
      <div className="cp-page">
        {back}
        <div className="cp-alert">{error}<button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button></div>
      </div>
    );
  }

  const { complaint: c, jobs, messages } = data;
  const st = statusInfo(c.status);
  const isDone = ["RESOLVED", "CLOSED"].includes(c.status);
  const visitText = [
    c.visit_date ? new Date(c.visit_date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) : "",
    c.visit_slot,
  ].filter(Boolean).join(", ");

  return (
    <div className="cp-page">
      {back}

      {notice && (
        <div className={`cp-notice ${notice.type}`}>
          <span>{notice.text}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><FiX /></button>
        </div>
      )}

      {/* One card: blue header (subject, tags, stage bar), the conversation, then the reply box. */}
      <div className="cp-cd-layout">
      <section className="cp-card cp-cx">
        <header className="cp-cx-head">
          {/* Subject with the status beside it (raised date / by are in Details). */}
          <div className="cp-cx-top">
            <h2>{c.subject}</h2>
            <span className="cp-cx-status">{st.label}</span>
          </div>
          <div className="cp-cx-tags">
            {c.site_name && (
              <button type="button" onClick={() => c.site_id && navigate(`/client/outlets/${encodeURIComponent(c.site_id)}`)}>
                <FiMapPin aria-hidden="true" /> {c.site_name}
              </button>
            )}
            {jobs.map((j) => (
              <button type="button" key={j.id} onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
                <FiBriefcase aria-hidden="true" /> #{j.code} · {serviceLabel(j.service_type)}
              </button>
            ))}
            {(c.category || ["SERVICE"]).map((k) => <span key={k}>{CATEGORY_LABEL[k] || k}</span>)}
            {["HIGH", "URGENT"].includes(c.priority) && <span className="prio">● {c.priority === "URGENT" ? "Urgent" : "High priority"}</span>}
          </div>
        </header>

        <div className="cp-cx-thread">
          {messages.map((m) => (
            <div key={m.id} className={`cp-cx-msg ${m.mine ? "mine" : m.auto ? "auto" : m.from_team ? "team" : "colleague"}`}>
              <span className="cp-cx-who">
                {m.mine ? "You" : m.auto || m.from_team ? "BestServe" : m.author} · {formatDateTime(m.created_at)}
              </span>
              <div className="cp-cx-bubble">
                {m.message && m.message !== "(attachment)" && <p>{m.message}</p>}
                {m.attachments.length > 0 && (
                  <div className="cp-msg-files">
                    {m.attachments.map((a) => (
                      <PortalPhoto
                        key={a.id}
                        attachment={{ ...a, path: `/api/client-portal/complaint-files/${encodeURIComponent(a.id)}` }}
                        onOpen={(url) => setViewer({ url, name: a.file_name })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* The client only views and replies; BestServe moves the complaint through its stages. */}
          {isDone && (
            <p className={`cp-cd-donenote ${c.status === "CLOSED" ? "closed" : ""}`}>
              <FiCheckCircle aria-hidden="true" />
              {c.status === "CLOSED" ? "BestServe has closed this complaint." : "BestServe has marked this complaint as resolved. Reply if the problem is still there."}
            </p>
          )}
          <div ref={threadEnd} />
        </div>

        {c.status === "CLOSED" ? (
          <div className="cp-cx-closed">This complaint is closed, so replies are turned off. If the problem comes back, please raise a new complaint.</div>
        ) : (
          <form className="cp-cx-reply" onSubmit={sendReply}>
            {replyError && <div className="cp-alert">{replyError}</div>}
            {files.length > 0 && (
              <ul className="cp-file-list">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <span>{f.name}</span>
                    <button type="button" className="cp-icon-btn" onClick={() => setFiles(files.filter((_, x) => x !== i))} aria-label={`Remove ${f.name}`}><FiX /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cp-cx-bar">
              <button type="button" className="cp-cx-attach" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES} aria-label="Attach photos" title="Attach photos">
                <FiPaperclip />
              </button>
              <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <textarea
                rows={1}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…  (Enter to send, Shift + Enter for a new line)"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) sendReply(e); }}
                aria-label="Reply"
              />
              <button type="submit" className="cp-cx-send" disabled={sending || (!reply.trim() && files.length === 0)} aria-label="Send">
                <FiSend />
              </button>
            </div>
          </form>
        )}
      </section>

      <aside className="cp-cd-side">
        <StageCard status={c.status} createdAt={c.created_at} visitText={visitText} />
        <section className="cp-card cp-cd-card">
          <h3>Details</h3>
          <dl className="cp-cd-details">
            <div><dt>Status</dt><dd><span className={`cp-status ${st.className}`}>{st.label}</span></dd></div>
            <div><dt>Complaint about</dt><dd>{(c.category || ["SERVICE"]).map((k) => CATEGORY_LABEL[k] || k).join(" + ")}</dd></div>
            <div><dt>Priority</dt><dd className={`prio-${String(c.priority || "").toLowerCase()}`}>{PRIORITY_LABEL[c.priority] || c.priority || "—"}</dd></div>
            <div><dt>Outlet</dt><dd>{c.site_name || "—"}</dd></div>
            <div><dt>Raised by</dt><dd>{c.raised_by_name || "—"}</dd></div>
            {jobs.length > 0 && (
              <div><dt>Linked job</dt><dd>{jobs.map((j) => `#${j.code}`).join(", ")}</dd></div>
            )}
            {visitText && <div><dt>Scheduled visit</dt><dd>{visitText}</dd></div>}
            <div><dt>Raised on</dt><dd>{formatDateTime(c.created_at)}</dd></div>
            {c.updated_at && <div><dt>Last updated</dt><dd>{formatDateTime(c.updated_at)}</dd></div>}
          </dl>
        </section>
      </aside>
      </div>

      {viewer && (
        <div className="cp-viewer" onClick={() => setViewer(null)} role="dialog" aria-label="Photo">
          <button className="cp-viewer-close" onClick={() => setViewer(null)} aria-label="Close photo"><FiX /></button>
          <img src={viewer.url} alt={viewer.name || "Attachment"} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
