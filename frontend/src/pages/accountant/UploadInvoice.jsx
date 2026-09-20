import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiDownload, FiFileText, FiInfo, FiUploadCloud, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../../api";
import { downloadFile, recallImportId, rememberImportId } from "./download";
import "./accountant.css";

const MAX_MB = 5;

export default function UploadInvoice() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { text }
  const inputRef = useRef(null);
  const [history, setHistory] = useState(null); // null while loading, then the list of recent uploads
  const [removing, setRemoving] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/invoices/import");
        const data = res?.ok ? await safeJson(res) : null;
        if (!cancelled) setHistory(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Removes one upload from the history. Invoices already imported from it stay.
  async function removeUpload(item) {
    const text = item.status === "CONFIRMED"
      ? `Remove "${item.file_name}" from the history?

The invoices already imported from it will stay.`
      : `Remove "${item.file_name}"?

It has not been imported yet, so its records will be discarded.`;
    if (!window.confirm(text)) return;
    setRemoving(item.import_id);
    try {
      const res = await apiFetch(`/api/invoices/import/${item.import_id}`, { method: "DELETE" });
      const data = res ? await safeJson(res) : null;
      if (!res?.ok) {
        setMessage({ text: data?.error || "The upload could not be removed. Please try again." });
        return;
      }
      if (recallImportId() === item.import_id) rememberImportId("");
      setHistory((list) => list.filter((h) => h.import_id !== item.import_id));
    } catch {
      setMessage({ text: "Network problem. Please check your connection and try again." });
    } finally {
      setRemoving("");
    }
  }

  // Only Excel (.xlsx) files are accepted. Dragged-in files skip the file picker's filter, so check here too.
  function pick(f) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setFile(null);
      setMessage({ text: "Only Excel files (.xlsx) can be uploaded. Please choose an Excel file." });
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setMessage({ text: `The file is too large (maximum ${MAX_MB} MB).` });
      return;
    }
    setFile(f);
    setMessage(null);
  }

  // Sends the file to be checked, then opens the Review & Validate tab. Nothing is saved yet:
  // the accountant reviews the rows there and clicks Submit to save the valid ones.
  async function upload() {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/api/invoices/import/preview", { method: "POST", body: form });
      const data = res ? await safeJson(res) : null;
      if (!res?.ok || !data) {
        setMessage({ text: data?.error || "The file could not be checked. Please try again." });
        return;
      }
      rememberImportId(data.import_id);

      window.dispatchEvent(new Event("focus")); // makes the Notifications bell refresh right away
      navigate(`/accountant/invoices/review?import=${data.import_id}`, { state: { uploaded: true } });
    } catch {
      setMessage({ text: "Network problem. Please check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    const error = await downloadFile("/api/invoices/import/template", "invoice-import-template.xlsx");
    if (error) setMessage({ text: error });
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">Upload Invoices</h2>
          <p className="ac-sub">Upload your invoices in an Excel file (.xlsx) using the template</p>
        </div>
        <button type="button" className="ac-btn" onClick={downloadTemplate}><FiDownload /> Download Template</button>
      </div>

      <div className="ac-card">
        {message && (
          <div className="ac-info error" style={{ marginBottom: 16 }}>
            <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{message.text}</span>
          </div>
        )}

        <div
          className={`ac-dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        >
          <FiUploadCloud className="ac-drop-icon" />
          <p className="ac-drop-title">Drag and drop your Excel file here</p>
          <p className="ac-drop-hint">or</p>
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => inputRef.current?.click()}>Select Excel File</button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
          />
          <p className="ac-drop-hint" style={{ marginTop: 14 }}>
            <strong>Only Excel files (.xlsx) are allowed.</strong> PDF, images and other file types are not supported (max {MAX_MB} MB).
          </p>

          {file && (
            <div className="ac-filechip">
              {file.name}
              <button type="button" onClick={() => setFile(null)} aria-label="Remove file" style={{ background: "none", border: 0, cursor: "pointer", display: "flex" }}>
                <FiX />
              </button>
            </div>
          )}
        </div>

        <div className="ac-info" style={{ marginTop: 16 }}>
          <FiInfo style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Use the template: each row needs Invoice No, Customer, Site, Invoice Date and Amount. The file is checked
            first and nothing is saved yet. On the next screen you can review every row, then click Submit to save the valid ones. Rows with errors are not saved; you can see the reason for each there.
          </span>
        </div>

        <div className="ac-actions" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="ac-btn ac-btn-primary" disabled={!file || busy} onClick={upload}>
            {busy ? "Checking file…" : "Upload & Validate"}
          </button>
        </div>
      </div>

      <div className="ac-card">
        <h3 className="ac-card-title">Recent Uploads</h3>
        {history === null && <p className="ac-sub">Loading…</p>}
        {history?.length === 0 && <p className="ac-sub">No uploads yet</p>}
        {history?.length > 0 && (
          <ul className="ac-recent-list">
            {history.map((h) => (
              <li key={h.import_id} className="ac-recent-item">
                <FiFileText className="ac-recent-icon" />
                <button type="button" className="ac-link ac-recent-name" title={h.file_name}
                  onClick={() => navigate(`/accountant/invoices/review?import=${h.import_id}`)}>
                  {h.file_name}
                </button>
                <button
                  type="button"
                  className="ac-remove"
                  title="Remove"
                  aria-label={`Remove ${h.file_name}`}
                  disabled={removing === h.import_id}
                  onClick={() => removeUpload(h)}
                >
                  <FiX />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
