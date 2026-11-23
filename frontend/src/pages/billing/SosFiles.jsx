import { useRef, useState } from "react";
import { FiDownload, FiExternalLink, FiFile, FiFileText, FiImage, FiPaperclip, FiX } from "react-icons/fi";
import { billingDelete, billingUpload, downloadFile, openPdf, qs, useBilling } from "./billingApi";
import { monthLabel } from "./format";
import { Msg } from "./ui";

// Files attached to the monthly SOS (optional). Two uses:
//   <SosFiles companyId month editable />  the SOS page: the Service Coordinator attaches / removes
//   <SosFiles invoiceId />                  draft and issued invoice: read-only, every month of the period
// They go with the invoice email (see backend services/billing/sosFiles.service.js).

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
// Any file format; PDFs and images open in a new tab, everything else downloads.
const VIEWABLE = /^(application\/pdf|image\/)/;

const size = (b) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iconOf = (type) => (/^image\//.test(type || "") ? FiImage : /pdf/.test(type || "") ? FiFileText : FiFile);

export default function SosFiles({ companyId, month, invoiceId, editable = false }) {
  const path = invoiceId
    ? `/invoices/${invoiceId}/sos-files`
    : `/sos/${encodeURIComponent(companyId)}/files${qs({ month })}`;
  const { data, error, setData } = useBilling(path);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({});
  const input = useRef(null);
  const files = data || [];
  const multiMonth = Boolean(invoiceId) && new Set(files.map((f) => f.month)).size > 1;

  // Read-only and nothing attached (Accounts, a submitted SOS, the invoice pages): nothing to show.
  if (!editable && !files.length) return null;

  async function attach(list) {
    const chosen = [...(list || [])];
    if (!chosen.length) return;
    setMsg({});
    const room = MAX_FILES - files.length;
    if (chosen.length > room) {
      setMsg({ error: room > 0 ? `You can attach ${room} more file${room === 1 ? "" : "s"} (${MAX_FILES} at most).` : `At most ${MAX_FILES} files per SOS.` });
      return;
    }
    const tooBig = chosen.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setMsg({ error: `${tooBig.name} is too large (10 MB at most).` });
      return;
    }
    setBusy("upload");
    try {
      for (const f of chosen) {
        const form = new FormData();
        form.append("file", f);
        setData(await billingUpload(`/sos/${encodeURIComponent(companyId)}/files${qs({ month })}`, form));
      }
      setMsg({ ok: `${chosen.length} file${chosen.length === 1 ? "" : "s"} attached.` });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  async function remove(f) {
    if (!window.confirm(`Remove ${f.file_name}?`)) return;
    setMsg({});
    setBusy(f.id);
    try {
      setData(await billingDelete(`/sos/${encodeURIComponent(companyId)}/files/${f.id}${qs({ month })}`));
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy("");
    }
  }

  function open(f) {
    setMsg({});
    const p = `/sos-files/${f.id}`;
    (VIEWABLE.test(f.file_type || "") ? openPdf(p) : downloadFile(p, f.file_name)).catch((err) => setMsg({ error: err.message }));
  }

  return (
    <div className="ac-card sosf-card">
      <div className="sosf-head">
        <div>
          <h3 className="ac-card-title"><FiPaperclip /> {invoiceId ? "SOS attachments" : "Attachments"}{!invoiceId && <span className="sosf-opt"> (optional)</span>}</h3>
          <div className="ac-sub">
            {invoiceId
              ? "From the Service Coordinator's SOS. Sent with the invoice email."
              : editable
                ? "Any file - service reports, job sheets, photos (10 MB each, up to 10). Accounts see them and they go with the invoice email."
                : "Sent with the invoice email."}
          </div>
        </div>
        {editable && (
          <>
            <input ref={input} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
            <button type="button" className="ac-btn" disabled={Boolean(busy) || files.length >= MAX_FILES} onClick={() => input.current?.click()}>
              <FiPaperclip /> {busy === "upload" ? "Attaching…" : "Attach files"}
            </button>
          </>
        )}
      </div>

      {error && !msg.error && <Msg error={error} />}
      {files.length > 0 ? (
        <ul className="sosf-list">
          {files.map((f) => {
            const Icon = iconOf(f.file_type);
            return (
              <li key={f.id} className="sosf-item">
                <Icon className="sosf-ic" />
                <button type="button" className="sosf-name" onClick={() => open(f)} title="Open">{f.file_name}</button>
                <span className="sosf-meta">
                  {multiMonth && <>{monthLabel(f.month.slice(0, 7))} · </>}
                  {size(f.file_size)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""}
                </span>
                <span className="sosf-acts">
                  <button type="button" className="bl-link" onClick={() => open(f)}>
                    {VIEWABLE.test(f.file_type || "") ? <><FiExternalLink /> View</> : <><FiDownload /> Download</>}
                  </button>
                  {editable && (
                    <button type="button" className="sos-iconbtn red" disabled={Boolean(busy)} onClick={() => remove(f)} title="Remove" aria-label={`Remove ${f.file_name}`}><FiX /></button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        data && <div className="sosf-empty">No files attached.</div>
      )}
      <Msg {...msg} />
    </div>
  );
}
