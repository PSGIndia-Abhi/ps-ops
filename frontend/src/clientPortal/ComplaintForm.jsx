import { useEffect, useRef, useState } from "react";
import { FiPaperclip, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";

const PRIORITIES = [
  { key: "LOW", label: "Low" },
  { key: "MEDIUM", label: "Normal" },
  { key: "HIGH", label: "High" },
  { key: "URGENT", label: "Urgent" },
];
const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024;

// Modal form to raise a complaint. `initialSite` pre-fills the outlet. `initialJob` (when opened from
// a job page) silently links the complaint to that job; changing the outlet drops the link.
export default function ComplaintForm({ outlets, initialSite = "", initialJob = "", onClose, onCreated }) {
  const [siteId, setSiteId] = useState(initialSite || (outlets.length === 1 ? outlets[0].id : ""));
  const [jobId, setJobId] = useState(initialJob);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function addFiles(list) {
    const incoming = Array.from(list || []);
    const bad = incoming.find((f) => !(f.type.startsWith("image/") || f.type === "application/pdf"));
    if (bad) return setError("Only photos and PDF files can be attached.");
    const big = incoming.find((f) => f.size > MAX_SIZE);
    if (big) return setError(`${big.name} is larger than 10 MB.`);
    const next = [...files, ...incoming].slice(0, MAX_FILES);
    if (files.length + incoming.length > MAX_FILES) setError(`You can attach up to ${MAX_FILES} files.`);
    else setError(null);
    setFiles(next);
  }

  async function submit(e) {
    e.preventDefault();
    if (!siteId) return setError("Please choose the outlet.");
    if (!subject.trim()) return setError("Please add a short subject.");
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("site_id", siteId);
      if (jobId) fd.set("job_id", jobId);
      fd.set("subject", subject.trim());
      fd.set("message", message.trim());
      fd.set("priority", priority);
      files.forEach((f) => fd.append("files", f, f.name));
      const res = await apiFetch("/api/client-portal/complaints", { method: "POST", body: fd });
      const body = await safeJson(res);
      if (!res?.ok) throw new Error(body?.error || "Could not send your complaint");
      onCreated(body);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="cp-modal-backdrop" onClick={() => !saving && onClose()}>
      <form className="cp-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Raise a complaint">
        <header className="cp-modal-head">
          <div>
            <h3>Raise a complaint</h3>
            <p className="cp-muted">Our team will reply here. You’ll see every update on this page.</p>
          </div>
          <button type="button" className="cp-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><FiX /></button>
        </header>

        {error && <div className="cp-alert">{error}</div>}

        <label className="cp-field">Outlet *
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setJobId(""); }}>
            <option value="">Choose outlet</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>
        </label>

        <label className="cp-field">Subject *
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Cockroaches seen in the kitchen" />
        </label>

        <label className="cp-field">Details <small className="cp-muted">(optional)</small>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What happened, where, and since when?" />
        </label>

        <div className="cp-field">How urgent?
          <div className="cp-segment" role="radiogroup">
            {PRIORITIES.map((p) => (
              <button type="button" role="radio" aria-checked={priority === p.key} key={p.key} className={`${priority === p.key ? "active" : ""} prio-${p.key.toLowerCase()}`} onClick={() => setPriority(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cp-field">Photos or documents (optional, up to 5)
          <div
            className="cp-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          >
            <button type="button" className="cp-btn cp-btn-ghost" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
              <FiPaperclip /> Add photos
            </button>
            <span className="cp-muted">or drag them here · JPG, PNG, PDF · max 10 MB each</span>
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
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
        </div>

        <div className="cp-modal-actions">
          <button type="button" className="cp-btn cp-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="cp-btn" disabled={saving}>{saving ? "Sending…" : "Send complaint"}</button>
        </div>
      </form>
    </div>
  );
}
