import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiArrowDown, FiArrowUp, FiCheck, FiEye, FiMinus, FiPlus, FiSend, FiUploadCloud, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";

// "How urgent?" colour tiles: green Low, blue Normal, orange High, red Urgent.
const PRIORITIES = [
  { key: "LOW", label: "Low", hint: "Not pressing", Icon: FiArrowDown },
  { key: "MEDIUM", label: "Normal", hint: "Usual priority", Icon: FiMinus },
  { key: "HIGH", label: "High", hint: "Needs attention soon", Icon: FiArrowUp },
  { key: "URGENT", label: "Urgent", hint: "Needs action now", Icon: FiAlertTriangle },
];
function fileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One attached file: photo thumbnail (or a PDF icon), name, size and a remove button.
function FileTile({ file, onRemove }) {
  const isImage = file.type.startsWith("image/");
  const imgRef = useRef(null);
  // Point the thumbnail at a temporary local URL for the file; free it when the tile goes away.
  useEffect(() => {
    if (!isImage || !imgRef.current) return undefined;
    const url = URL.createObjectURL(file);
    imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  // Open the file (still on the client's computer) in a new tab: photo full size, PDF in the browser viewer.
  function view() {
    const url = URL.createObjectURL(file);
    // Never navigate this page away (the form would be lost); if a pop-up blocker stops the tab, nothing happens.
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <li className="cp-attach-tile">
      <button type="button" className="cp-attach-view" onClick={view} aria-label={`View ${file.name}`}>
        <span className={`cp-attach-thumb ${isImage ? "" : "pdf"}`}>
          {isImage
            ? <img ref={imgRef} alt="" />
            : <span className="cp-attach-pdf"><b>PDF</b></span>}
          <span className="cp-attach-eye" aria-hidden="true"><FiEye /> View</span>
        </span>
        <span className="cp-attach-meta">
          <strong title={file.name}>{file.name}</strong>
          <small>{isImage ? "Photo" : "PDF"} · {fileSize(file.size)}</small>
        </span>
      </button>
      <button type="button" className="cp-attach-remove" onClick={onRemove} aria-label={`Remove ${file.name}`}><FiX /></button>
    </li>
  );
}

const MAX_FILES = 10; // per message; the server allows the same (MAX_COMPLAINT_FILES)
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
  const [dragOver, setDragOver] = useState(false);
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
          <div className="cp-prio-tiles" role="radiogroup" aria-label="How urgent?">
            {PRIORITIES.map((p) => {
              const { key, label, hint } = p;
              const Icon = p.Icon;
              const on = priority === key;
              return (
                <button
                  type="button" role="radio" aria-checked={on} key={key}
                  className={`cp-prio-tile prio-${key.toLowerCase()} ${on ? "active" : ""}`}
                  onClick={() => setPriority(key)}
                >
                  {on && <span className="cp-prio-check" aria-hidden="true"><FiCheck /></span>}
                  <span className="cp-prio-icon" aria-hidden="true"><Icon /></span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cp-field">
          <span className="cp-attach-label">
            Photos or documents (optional)
            <span className="cp-attach-count">{files.length} of {MAX_FILES} added</span>
          </span>
          {files.length < MAX_FILES && (
            <button
              type="button"
              className={`cp-attach-drop ${dragOver ? "over" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <span className="cp-attach-up" aria-hidden="true"><FiUploadCloud /></span>
              <strong><em>Click to add photos</em> or drag them here</strong>
              <small>Up to {MAX_FILES} files · max 10 MB each</small>
              <span className="cp-attach-types" aria-hidden="true"><b>JPG</b><b>PNG</b><b>PDF</b></span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          {files.length > 0 && (
            <ul className="cp-attach-grid">
              {files.map((f, i) => (
                <FileTile key={`${f.name}-${f.size}-${i}`} file={f} onRemove={() => setFiles(files.filter((_, x) => x !== i))} />
              ))}
              {files.length < MAX_FILES && (
                <li>
                  <button type="button" className="cp-attach-more" onClick={() => fileInput.current?.click()}>
                    <FiPlus aria-hidden="true" /> Add more
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="cp-modal-actions">
          <button type="button" className="cp-btn cp-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="cp-btn" disabled={saving}><FiSend aria-hidden="true" /> {saving ? "Sending…" : "Send complaint"}</button>
        </div>
      </form>
    </div>
  );
}
