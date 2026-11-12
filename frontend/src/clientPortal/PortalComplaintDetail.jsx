import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiMapPin, FiBriefcase, FiPaperclip, FiSend, FiX, FiRefreshCw, FiCheckCircle, FiRotateCcw } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import PortalPhoto from "./PortalPhoto";
import { formatDateTime, serviceLabel, statusInfo } from "./portalUtils";

const MAX_FILES = 5;
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
      else if (body.reopened) setNotice({ type: "ok", text: "Complaint reopened. Our team will take another look." });
      setReloadKey((n) => n + 1);
    } catch (err) {
      setReplyError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(next) {
    if (next === "CLOSED" && !window.confirm("Close this complaint? You can reopen it later if the problem comes back.")) return;
    const res = await apiFetch(`/api/client-portal/complaints/${encodeURIComponent(complaintId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    const body = await safeJson(res);
    if (!res?.ok) return setNotice({ type: "warn", text: body?.error || "Could not update the complaint" });
    setNotice({ type: "ok", text: next === "CLOSED" ? "Complaint closed. Thank you!" : "Complaint reopened." });
    setReloadKey((n) => n + 1);
  }

  const back = (
    <button className="cp-back-link" onClick={() => navigate("/client/complaints")}>
      <FiArrowLeft aria-hidden="true" /> All complaints
    </button>
  );

  if (loading && !data) {
    return <div className="cp-page">{back}<div className="cp-card cp-skeleton" style={{ minHeight: 320 }} /></div>;
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

  return (
    <div className="cp-page">
      {back}

      {notice && (
        <div className={`cp-notice ${notice.type}`}>
          <span>{notice.text}</span>
          <button className="cp-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><FiX /></button>
        </div>
      )}

      <section className="cp-card cp-complaint-head">
        <div className="cp-job-header-top">
          <div>
            <small className="cp-muted">Raised {formatDateTime(c.created_at)} by {c.raised_by_name}</small>
            <h2>{c.subject}</h2>
          </div>
          <span className={`cp-status lg ${st.className}`}>{st.label}</span>
        </div>
        <div className="cp-tags">
          {c.site_name && (
            <button className="cp-tag cp-tag-link" onClick={() => c.site_id && navigate(`/client/outlets/${encodeURIComponent(c.site_id)}`)}>
              <FiMapPin aria-hidden="true" /> {c.site_name}
            </button>
          )}
          {jobs.map((j) => (
            <button key={j.id} className="cp-tag cp-tag-link" onClick={() => navigate(`/client/jobs/${encodeURIComponent(j.id)}`)}>
              <FiBriefcase aria-hidden="true" /> #{j.code} · {serviceLabel(j.service_type)}
            </button>
          ))}
          {["HIGH", "URGENT"].includes(c.priority) && (
            <span className={`cp-status ${c.priority === "URGENT" ? "st-red" : "st-amber"}`}>{c.priority === "URGENT" ? "Urgent" : "High priority"}</span>
          )}
        </div>
        <div className="cp-actions">
          {c.status === "RESOLVED" && (
            <span className="cp-muted">Our team marked this resolved. Happy with the fix?</span>
          )}
          {!isDone || c.status === "RESOLVED" ? (
            <button className="cp-btn cp-btn-ghost" onClick={() => changeStatus("CLOSED")}><FiCheckCircle /> {c.status === "RESOLVED" ? "Yes, close it" : "Close complaint"}</button>
          ) : null}
          {isDone && (
            <button className="cp-btn cp-btn-ghost" onClick={() => changeStatus("OPEN")}><FiRotateCcw /> Reopen</button>
          )}
        </div>
      </section>

      <section className="cp-card cp-thread">
        {messages.map((m) => (
          <div key={m.id} className={`cp-msg ${m.mine ? "mine" : m.from_team ? "team" : "colleague"}`}>
            <div className="cp-msg-meta">
              <strong>{m.mine ? "You" : m.from_team ? `${m.author} · BestServe` : m.author}</strong>
              <small>{formatDateTime(m.created_at)}</small>
            </div>
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
        ))}
        <div ref={threadEnd} />
      </section>

      <form className="cp-card cp-reply" onSubmit={sendReply}>
        {replyError && <div className="cp-alert">{replyError}</div>}
        {c.status === "CLOSED" && <p className="cp-muted cp-reply-hint">This complaint is closed. Sending a message will reopen it.</p>}
        <textarea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply…"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply(e); }}
        />
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
        <div className="cp-reply-actions">
          <button type="button" className="cp-btn cp-btn-ghost" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
            <FiPaperclip /> Attach
          </button>
          <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="submit" className="cp-btn" disabled={sending || (!reply.trim() && files.length === 0)}>
            <FiSend /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>

      {viewer && (
        <div className="cp-viewer" onClick={() => setViewer(null)} role="dialog" aria-label="Photo">
          <button className="cp-viewer-close" onClick={() => setViewer(null)} aria-label="Close photo"><FiX /></button>
          <img src={viewer.url} alt={viewer.name || "Attachment"} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
