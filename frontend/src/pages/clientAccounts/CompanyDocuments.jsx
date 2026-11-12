import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlineArrowUpTray, HiOutlineDocumentText, HiOutlineEye, HiOutlinePencilSquare, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import { apiFetch, safeJson } from "../../api";

// Admin > Client Accounts > company: documents shared with the client portal.
// "All outlets" documents are visible to every login of the company.

const DOC_TYPES = [
  { key: "CERTIFICATE", label: "Certificate" },
  { key: "CONTRACT", label: "Contract" },
  { key: "MSDS", label: "MSDS / Safety sheet" },
  { key: "REPORT", label: "Report" },
  { key: "OTHER", label: "Other" },
];
const typeLabel = (k) => DOC_TYPES.find((t) => t.key === k)?.label || "Other";

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CompanyDocuments({ companyId, sites, onStatus }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'upload' } | { mode: 'edit', doc }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/client-accounts/companies/${encodeURIComponent(companyId)}/documents`);
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to load documents");
      setDocs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function view(doc) {
    const win = window.open("", "_blank");
    try {
      const res = await apiFetch(`/api/client-accounts/documents/${doc.id}/file`);
      if (!res?.ok) throw new Error("Could not open the file");
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      if (win) win.close();
      onStatus({ type: "error", message: err.message });
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Remove "${doc.title}" from the client portal?`)) return;
    const res = await apiFetch(`/api/client-accounts/documents/${doc.id}`, { method: "DELETE" });
    const data = await safeJson(res);
    if (!res?.ok) return onStatus({ type: "error", message: data?.error || "Failed to remove document" });
    onStatus({ type: "success", message: `"${doc.title}" removed from the portal.` });
    load();
  }

  const today = new Date(new Date().toDateString());

  return (
    <>
      <div className="ca-section-row">
        <p className="ca-muted">Files here appear under <strong>Documents</strong> in the client’s portal.</p>
        <button className="ca-primary ca-small" onClick={() => setModal({ mode: "upload" })}><HiOutlineArrowUpTray /> Upload document</button>
      </div>

      {error && <div className="ca-error">{error} <button onClick={load}>Retry</button></div>}
      {loading && docs.length === 0 && <div className="ca-skel-block" />}
      {!loading && !error && docs.length === 0 && (
        <div className="ca-empty-state">
          <span><HiOutlineDocumentText /></span>
          <strong>No documents shared yet</strong>
          <p>Upload certificates, contracts, MSDS sheets or reports to show them in the client portal.</p>
          <button className="ca-primary" onClick={() => setModal({ mode: "upload" })}><HiOutlineArrowUpTray /> Upload first document</button>
        </div>
      )}

      {docs.length > 0 && (
        <div className="ca-doc-list">
          {docs.map((d) => {
            const expired = d.valid_until && new Date(d.valid_until) < today;
            const isPdf = /pdf/i.test(d.file_type || d.file_name || "");
            return (
              <article key={d.id} className="ca-doc">
                <span className={`ca-doc-icon ${isPdf ? "pdf" : ""}`}>{isPdf ? "PDF" : <HiOutlineDocumentText />}</span>
                <div className="ca-doc-main">
                  <strong>{d.title}</strong>
                  <span>{d.file_name} · {fmtDate(d.created_at)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ""}</span>
                  <div className="ca-login-access">
                    <span className="ca-tag">{typeLabel(d.doc_type)}</span>
                    <span className={`ca-tag ${d.site_id ? "" : "company"}`}>{d.site_id ? d.site_name || d.site_id : "All outlets"}</span>
                    {d.valid_until && <span className={`ca-tag ${expired ? "off" : ""}`}>{expired ? "Expired" : "Valid till"} {fmtDate(d.valid_until)}</span>}
                  </div>
                  {d.notes && <span className="ca-doc-notes">{d.notes}</span>}
                </div>
                <div className="ca-icon-actions">
                  <button onClick={() => view(d)} title="View" aria-label={`View ${d.title}`}><HiOutlineEye /></button>
                  <button onClick={() => setModal({ mode: "edit", doc: d })} title="Edit" aria-label={`Edit ${d.title}`}><HiOutlinePencilSquare /></button>
                  <button className="danger" onClick={() => remove(d)} title="Remove" aria-label={`Remove ${d.title}`}><HiOutlineTrash /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <DocumentModal
          mode={modal.mode}
          doc={modal.doc}
          companyId={companyId}
          sites={sites}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            onStatus({ type: "success", message });
            load();
          }}
        />
      )}
    </>
  );
}

function DocumentModal({ mode, doc, companyId, sites, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() => ({
    title: doc?.title || "",
    doc_type: doc?.doc_type || "CERTIFICATE",
    site_id: doc?.site_id || "",
    valid_until: toDateInput(doc?.valid_until),
    notes: doc?.notes || "",
  }));
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function pickFile(f) {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return setError("The file must be 20 MB or smaller.");
    setError(null);
    setFile(f);
    if (!form.title.trim()) set("title", f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e) {
    e.preventDefault();
    if (!isEdit && !file) return setError("Choose a file to upload.");
    if (!form.title.trim()) return setError("Title is required.");
    setSaving(true);
    setError(null);
    try {
      let res;
      if (isEdit) {
        res = await apiFetch(`/api/client-accounts/documents/${doc.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.set(k, v));
        fd.set("file", file, file.name);
        res = await apiFetch(`/api/client-accounts/companies/${encodeURIComponent(companyId)}/documents`, { method: "POST", body: fd });
      }
      const data = await safeJson(res);
      if (!res?.ok) throw new Error(data?.error || "Failed to save");
      onSaved(isEdit ? `"${form.title}" updated.` : `"${form.title}" is now in the client portal.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="ca-modal-backdrop" onClick={() => !saving && onClose()}>
      <form className="ca-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="ca-modal-head">
          <span className="ca-doc-icon"><HiOutlineDocumentText /></span>
          <div>
            <h3>{isEdit ? "Edit document" : "Upload document"}</h3>
            <p className="ca-muted">Clients see this under Documents in their portal.</p>
          </div>
          <button type="button" className="ca-x" onClick={onClose} disabled={saving} aria-label="Close"><HiOutlineXMark /></button>
        </header>
        {error && <div className="ca-error">{error}</div>}

        {!isEdit && (
          <label>File * (PDF, image, Word or Excel · max 20 MB)
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
        )}
        <label>Title *
          <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="e.g. Pest control certificate 2026" />
        </label>
        <label>Type
          <select value={form.doc_type} onChange={(e) => set("doc_type", e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label>Visible to
          <select value={form.site_id} onChange={(e) => set("site_id", e.target.value)}>
            <option value="">All outlets (every login of this company)</option>
            {sites.map((s) => <option key={s.id} value={s.id}>Only {s.name || s.id}</option>)}
          </select>
        </label>
        <label>Valid until (optional)
          <input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
        </label>
        <label>Note for the client (optional)
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </label>

        <div className="ca-modal-actions">
          <button type="button" className="ca-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ca-primary" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Upload"}</button>
        </div>
      </form>
    </div>
  );
}
