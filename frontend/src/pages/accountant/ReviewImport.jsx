import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FiAlertCircle, FiArrowLeft, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClipboard,
  FiDownload, FiFileText, FiList, FiRefreshCw, FiSend, FiUploadCloud, FiX,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../../api";
import { money } from "./format";
import { EmptyRow, Skeleton } from "./ui";
import { downloadFile, recallImportId, rememberImportId } from "./download";
import "./accountant.css";

const PAGE_SIZE = 50;

// The reason(s) a row failed, exactly as returned by the server.
function Reasons({ errors, big }) {
  if (!errors.length) return null;
  return (
    <ul className={`rv-reasons ${big ? "big" : ""}`}>
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

// Builds the same error-rows CSV the server builds for a submitted import, but for a
// draft that hasn't been submitted yet -- there's nothing saved server-side to ask for.
function csvCell(v) {
  let text = String(v ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadDraftErrorsCsv(review) {
  const header = ["Row", "Invoice No", "Customer", "Site", "Invoice Date", "Due Date", "Amount", "Error Reason"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of review.rows.filter((row) => row.status === "error")) {
    lines.push(
      [r.rowNumber, r.invoiceNo, r.customer, r.site, r.invoiceDate, r.dueDate, r.amount, r.errors.join("; ")]
        .map(csvCell)
        .join(",")
    );
  }
  const content = `${String.fromCharCode(0xfeff)}${lines.join("\r\n")}\r\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${review.file_name.replace(/\.[^.]+$/, "")}-errors.csv`;
  link.click();
  URL.revokeObjectURL(href);
}

export default function ReviewImport() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  // A file was just checked and handed to us directly (nothing saved to the database yet).
  const draftReview = location.state?.review || null;
  // Set when we arrive straight after an upload: show a "file uploaded" notification.
  const [notice, setNotice] = useState(Boolean(location.state?.uploaded));

  const [review, setReview] = useState(draftReview); // response of the import preview/confirm API
  // True until this review has actually been submitted -- it lives only in this tab until then.
  const [isDraft, setIsDraft] = useState(Boolean(draftReview));
  const [loading, setLoading] = useState(!draftReview);

  // The upload to show when we're NOT holding a fresh draft: the one in the address, else the
  // last one opened, else (below) the most recent upload. These only ever point at a submitted
  // (CONFIRMED) import, since that's the only kind that's ever saved.
  // isDraft (state, not draftReview) gates this: clearing location.state right after mount
  // (below, so a refresh doesn't replay the toast) must not make this recompute and start
  // fetching an old confirmed import out from under the draft we're already showing.
  const requestedId = isDraft ? "" : params.get("import") || recallImportId();
  const [latestId, setLatestId] = useState("");
  const importId = requestedId || latestId;
  const [message, setMessage] = useState(
    location.state?.importError ? { type: "error", text: location.state.importError } : null
  ); // { type: "error" | "ok", text }
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(0);

  const loadReview = useCallback(async (id) => {
    const res = await apiFetch(`/api/invoices/import/${id}`);
    const data = res ? await safeJson(res) : null;
    if (!res?.ok || !data) {
      rememberImportId("");
      setReview(null);
      setMessage({ type: "error", text: data?.error || "Could not load this import. Please upload the file again." });
      return;
    }
    rememberImportId(id);
    setIsDraft(false);
    setReview(data);
  }, []);

  // Nothing specific was asked for: open the user's most recent upload, if they have one.
  useEffect(() => {
    if (isDraft || requestedId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/invoices/import");
        const list = res?.ok ? await safeJson(res) : null;
        if (cancelled) return;
        if (Array.isArray(list) && list.length) setLatestId(list[0].import_id);
        else setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId]);

  useEffect(() => {
    if (isDraft || !importId) return undefined;
    let cancelled = false;
    loadReview(importId).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, loadReview]);

  useEffect(() => {
    if (!notice) return undefined;
    // Forget the "just uploaded" flag so a page refresh does not show the notification again.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    const timer = setTimeout(() => setNotice(false), 7000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function backToUpload() {
    rememberImportId("");
    navigate("/accountant/invoices/upload");
  }

  async function downloadErrors() {
    if (isDraft) {
      downloadDraftErrorsCsv(review);
      return;
    }
    const error = await downloadFile(`/api/invoices/import/${review.import_id}/error-rows`, "invoice-import-errors.csv");
    if (error) setMessage({ type: "error", text: error });
  }

  async function importValid() {
    setBusy(true);
    setMessage(null);
    try {
      // Nothing about this file exists in the database yet -- Submit sends the whole checked
      // file back so it can be re-checked from scratch and, only now, actually saved.
      const res = await apiFetch("/api/invoices/import/confirm", {
        method: "POST",
        body: JSON.stringify({ file_name: review.file_name, rows: review.rows }),
      });
      const data = res ? await safeJson(res) : null;
      if (!res?.ok || !data) {
        setMessage({ type: "error", text: data?.error || "The invoices could not be submitted. Please try again." });
        return;
      }
      if (data.skipped?.length) {
        // Some rows were skipped at the last moment: show the updated list with the reason for each.
        await loadReview(data.import_id);
        setMessage({ type: "ok", text: `${data.imported} invoice(s) submitted. ${data.skipped.length} row(s) were skipped, see the reasons below.` });
        return;
      }
      rememberImportId("");
      navigate("/accountant/invoices/list");
    } catch {
      setMessage({ type: "error", text: "Network problem. Please check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="ac-page rv-page" aria-busy="true">
        <div className="rv-head">
          <div className="rv-head-left">
            <span className="rv-back" aria-hidden="true"><FiArrowLeft /></span>
            <div className="rv-head-text"><Skeleton width={260} height={24} /></div>
          </div>
        </div>
        <div className="rv-summary">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rv-summary-item">
              <Skeleton variant="circular" width={40} height={40} />
              <div style={{ flex: 1 }}>
                <Skeleton width="55%" height={22} />
                <Skeleton width="40%" style={{ marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rv-body">
          <div className="rv-table-wrap">
            <table className="rv-table"><tbody><EmptyRow cols={7} loading rows={6} /></tbody></table>
          </div>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="ac-page rv-page">
        <div className="rv-head">
          <div className="rv-head-left">
            <div className="rv-head-text">
              <h2 className="rv-title"><FiClipboard /> Review &amp; Validate Import</h2>
            </div>
          </div>
        </div>
        {message && (
          <div className="ac-info error"><FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{message.text}</span></div>
        )}
        <div className="rv-body">
          <div className="rv-empty-state">
            <span className="rv-empty-icon"><FiFileText /></span>
            <p className="rv-empty-title">Nothing to review yet</p>
            <p className="rv-empty-hint">Upload an Excel file (.xlsx) first. Its rows are checked and shown here.</p>
            <button type="button" className="ac-btn ac-btn-primary" onClick={backToUpload}><FiUploadCloud /> Go to Invoice Upload</button>
          </div>
        </div>
      </div>
    );
  }

  const rows = review.rows.filter((r) => tab === "all" || r.status === tab);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const imported = review.status === "CONFIRMED";
  const tabs = [
    ["all", `All (${review.total})`, <FiList />],
    ["valid", `Valid (${review.valid})`, <FiCheckCircle />],
    ["error", `Errors (${review.errors})`, <FiAlertCircle />],
  ];

  return (
    <div className="ac-page rv-page">
      <div className="rv-head">
        <div className="rv-head-left">
          <button type="button" className="rv-back" onClick={backToUpload} aria-label="Back to upload"><FiArrowLeft /></button>
          <div className="rv-head-text">
            <h2 className="rv-title"><FiClipboard /> Review &amp; Validate Import</h2>
            <p className="rv-subtitle">
              <FiFileText /> <strong>{review.file_name}</strong> · {review.total} record{review.total === 1 ? "" : "s"} checked
            </p>
          </div>
        </div>
        <div className="rv-actions">
          <button type="button" className="ac-btn" onClick={backToUpload}><FiRefreshCw /> Replace</button>
          {/* Submit stays in the header so it is never pushed below the visible screen (or under the taskbar) */}
          {/* Even a single error row blocks Submit -- everything must be valid before anything is imported. */}
          <button
            type="button"
            className="ac-btn ac-btn-primary"
            disabled={!review.valid || review.errors > 0 || imported || busy}
            title={review.errors > 0 ? `Fix ${review.errors} error row${review.errors === 1 ? "" : "s"} before you can submit` : ""}
            onClick={importValid}
          >
            <FiSend /> {busy ? "Submitting…" : imported ? "Submitted" : review.errors > 0 ? "Fix Errors to Submit" : `Submit ${review.valid} Record${review.valid === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {/* Pop-up shown once, right after a file is uploaded; it closes by itself */}
      {notice && (
        <div className={`ac-toast ${review.valid > 0 ? "ok" : "warn"}`} role="status" aria-live="polite">
          {review.valid > 0 ? <FiCheckCircle className="ac-toast-icon" /> : <FiAlertCircle className="ac-toast-icon" />}
          <div className="ac-toast-body">
            <strong>{review.valid > 0 ? "Successfully uploaded" : "Uploaded, but nothing can be imported"}</strong>
            <span>{review.file_name}</span>
            <span>
              {review.total} record{review.total === 1 ? "" : "s"} checked: {review.valid} valid
              {review.errors > 0 ? `, ${review.errors} with errors` : ""}.
              {review.errors > 0
                ? ` Fix all ${review.errors} error row${review.errors === 1 ? "" : "s"} before you can submit.`
                : review.valid > 0 ? " Review the rows, then click Submit." : ""}
            </span>
          </div>
          <button type="button" className="ac-toast-close" onClick={() => setNotice(false)} aria-label="Close notification"><FiX /></button>
        </div>
      )}

      {message && (
        <div className={`ac-info ${message.type}`}>
          {message.type === "ok" ? <FiCheckCircle style={{ flexShrink: 0, marginTop: 2 }} /> : <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="rv-summary">
        <div className="rv-summary-item total">
          <span className="rv-summary-icon"><FiList /></span>
          <div>
            <div className="rv-summary-value">{review.total}</div>
            <div className="rv-summary-label">Total Records</div>
          </div>
        </div>
        <div className="rv-summary-item valid">
          <span className="rv-summary-icon"><FiCheckCircle /></span>
          <div>
            <div className="rv-summary-value">{review.valid}</div>
            <div className="rv-summary-label">Valid</div>
          </div>
        </div>
        <div className="rv-summary-item error">
          <span className="rv-summary-icon"><FiAlertCircle /></span>
          <div>
            <div className="rv-summary-value">{review.errors}</div>
            <div className="rv-summary-label">Errors</div>
          </div>
        </div>
      </div>

      <div className="rv-body">
        <div className="rv-tabs">
          {tabs.map(([key, label, icon]) => (
            <button key={key} type="button" className={`rv-tab ${tab === key ? "active" : ""}`}
              onClick={() => { setTab(key); setPage(0); }}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="rv-table-wrap">
          <table className="rv-table">
            <thead>
              <tr>
                <th>#</th><th>Invoice No</th><th>Customer</th><th>Site</th><th className="ac-num">Amount</th>
                <th>Status</th><th>Error Reason</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? visible.map((r) => (
                <tr key={r.rowNumber} className={r.status === "error" ? "rv-row-error" : ""}>
                  <td className="rv-row-no">{r.rowNumber}</td>
                  <td>{r.invoiceNo || "—"}</td>
                  <td>{r.customer || "—"}</td>
                  <td>{r.site || "—"}</td>
                  <td className="ac-num">{typeof r.amount === "number" ? money(r.amount) : r.amount || "—"}</td>
                  <td>
                    {r.status === "valid"
                      ? <span className="rv-pill valid"><FiCheckCircle /> Valid</span>
                      : <span className="rv-pill error"><FiAlertCircle /> Error</span>}
                  </td>
                  <td><Reasons errors={r.errors} big={tab === "error"} /></td>
                </tr>
              )) : (
                <tr><td className="rv-empty" colSpan={7}>
                  {tab === "error" ? "No errors found" : tab === "valid" ? "No valid records" : "No records"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rv-footer">
          <span className="rv-pageinfo">Showing {rows.length ? current * PAGE_SIZE + 1 : 0}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}</span>
          <div className="rv-pagenav">
            <button type="button" className="rv-pagebtn" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page"><FiChevronLeft /></button>
            <span className="rv-pagecurrent">Page {current + 1} of {pages}</span>
            <button type="button" className="rv-pagebtn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page"><FiChevronRight /></button>
          </div>
        </div>

        <div className="ac-actions" style={{ marginTop: 16 }}>
          <button type="button" className="ac-btn" disabled={!review.errors} onClick={downloadErrors}>
            <FiDownload /> Download Error Rows
          </button>
        </div>
      </div>
    </div>
  );
}
