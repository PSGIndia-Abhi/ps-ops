import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClipboard, FiDownload, FiFileText, FiList, FiRefreshCw, FiSend, FiUploadCloud, FiX } from "react-icons/fi";
import { apiFetch, safeJson } from "../../api";
import { money } from "./format";
import { EmptyRow, Skeleton } from "./ui";
import { downloadFile, recallImportId, rememberImportId } from "./download";
import "./accountant.css";

const PAGE_SIZE = 50;

// Page title with a clipboard icon.
function Title() {
  return (
    <h2 className="ac-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <FiClipboard style={{ color: "#2563eb" }} /> Review &amp; Validate Import
    </h2>
  );
}

// A stat tile label with its icon.
const StatLabel = ({ icon, children }) => (
  <div className="ac-stat-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>{icon} {children}</div>
);

// The reason(s) a row failed, exactly as returned by the server.
function Reasons({ errors, big }) {
  if (!errors.length) return null;
  return (
    <ul className={`ac-reason ${errors.length > 1 ? "many" : ""} ${big ? "big" : ""}`}>
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

export default function ReviewImport() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  // Set when we arrive straight after an upload: show a "file uploaded" notification.
  const [notice, setNotice] = useState(Boolean(location.state?.uploaded));
  // The upload to show: the one in the address, else the last one opened, else (below) the most recent upload.
  const requestedId = params.get("import") || recallImportId();
  const [latestId, setLatestId] = useState("");
  const importId = requestedId || latestId;

  const [review, setReview] = useState(null); // response of the import preview API
  const [loading, setLoading] = useState(true);
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
    setReview(data);
  }, []);

  // Nothing specific was asked for: open the user's most recent upload, if they have one.
  useEffect(() => {
    if (requestedId) return undefined;
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
  }, [requestedId]);

  useEffect(() => {
    if (!importId) return undefined;
    let cancelled = false;
    loadReview(importId).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [importId, loadReview]);

  useEffect(() => {
    if (!notice) return undefined;
    // Forget the "just uploaded" flag so a page refresh does not show the notification again.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    const timer = setTimeout(() => setNotice(false), 8000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function backToUpload() {
    rememberImportId("");
    navigate("/accountant/invoices/upload");
  }

  async function downloadErrors() {
    const error = await downloadFile(`/api/invoices/import/${review.import_id}/error-rows`, "invoice-import-errors.csv");
    if (error) setMessage({ type: "error", text: error });
  }

  async function importValid() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/invoices/import/${review.import_id}/confirm`, { method: "POST" });
      const data = res ? await safeJson(res) : null;
      if (!res?.ok || !data) {
        setMessage({ type: "error", text: data?.error || "The invoices could not be submitted. Please try again." });
        return;
      }
      if (data.skipped?.length) {
        // Some rows were skipped at the last moment: show the updated list with the reason for each.
        await loadReview(review.import_id);
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
      <div className="ac-page" aria-busy="true">
        <Skeleton width={280} height={28} />
        <div className="ac-stats-3">
          {[0, 1, 2].map((i) => <div key={i} className="ac-stat"><Skeleton width="50%" /><Skeleton width="35%" height={26} style={{ marginTop: 10 }} /></div>)}
        </div>
        <div className="ac-card">
          <table className="ac-table"><tbody><EmptyRow cols={7} loading rows={6} /></tbody></table>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="ac-page">
        <Title />
        {message && (
          <div className="ac-info error"><FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{message.text}</span></div>
        )}
        <div className="ac-card" style={{ textAlign: "center", padding: 40 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: "50%", background: "#eff6ff", color: "#2563eb", fontSize: 32 }}>
            <FiFileText />
          </span>
          <p className="ac-drop-title">Nothing to review yet</p>
          <p className="ac-drop-hint">Upload an Excel file (.xlsx) first. Its rows are checked and shown here.</p>
          <button type="button" className="ac-btn ac-btn-primary" onClick={backToUpload}><FiUploadCloud /> Go to Invoice Upload</button>
        </div>
      </div>
    );
  }

  const rows = review.rows.filter((r) => tab === "all" || r.status === tab);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const imported = review.status === "CONFIRMED";
  const importedCount = review.rows.filter((r) => r.imported).length;
  const tabs = [
    ["all", `All (${review.total})`, <FiList />],
    ["valid", `Valid (${review.valid})`, <FiCheckCircle />],
    ["error", `Errors (${review.errors})`, <FiAlertCircle />],
  ];

  return (
    <div className="ac-page">
      <div className="ac-review-head">
        <div style={{ display: "flex", alignItems: "center" }}>
          <button type="button" className="ac-back" onClick={backToUpload} aria-label="Back to upload"><FiArrowLeft /></button>
          <Title />
        </div>
        <div className="ac-actions">
          <span className="ac-filechip" style={{ marginTop: 0 }}><FiFileText /> {review.file_name}</span>
          <button type="button" className="ac-btn" onClick={backToUpload}><FiRefreshCw /> Replace</button>
        </div>
      </div>

      {notice && (
        <div className="ac-info ok" role="status">
          <FiCheckCircle style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>
            <strong>{review.file_name}</strong> uploaded. {review.total} record{review.total === 1 ? "" : "s"} checked.{" "}
            {importedCount > 0
              ? `${importedCount} invoice${importedCount === 1 ? "" : "s"} imported.`
              : review.valid > 0
                ? `Review the rows, then click Submit to save the ${review.valid} valid invoice${review.valid === 1 ? "" : "s"}.`
                : "No invoices can be imported from this file."}
            {review.errors > 0 && ` ${review.errors} row${review.errors === 1 ? "" : "s"} with errors will not be imported.`}
          </span>
          <button type="button" className="ac-remove" onClick={() => setNotice(false)} aria-label="Dismiss notification"><FiX /></button>
        </div>
      )}

      {message && (
        <div className={`ac-info ${message.type}`}>
          {message.type === "ok" ? <FiCheckCircle style={{ flexShrink: 0, marginTop: 2 }} /> : <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ac-stats-3">
        <div className="ac-stat blue"><StatLabel icon={<FiList />}>Total Records</StatLabel><div className="ac-stat-value">{review.total}</div></div>
        <div className="ac-stat green"><StatLabel icon={<FiCheckCircle />}>Valid</StatLabel><div className="ac-stat-value">{review.valid}</div></div>
        <div className="ac-stat red"><StatLabel icon={<FiAlertCircle />}>Errors</StatLabel><div className="ac-stat-value">{review.errors}</div></div>
      </div>

      <div className="ac-card">
        <div className="ac-tabs" style={{ marginBottom: 14 }}>
          {tabs.map(([key, label, icon]) => (
            <button key={key} type="button" className={`ac-tab ${tab === key ? "active" : ""}`}
              onClick={() => { setTab(key); setPage(0); }}>
              <span style={{ verticalAlign: "-2px", marginRight: 6, display: "inline-flex" }}>{icon}</span>{label}
            </button>
          ))}
        </div>

        <div className="ac-table-wrap ac-scroll-y">
          <table className="ac-table">
            <thead>
              <tr>
                <th>#</th><th>Invoice No</th><th>Customer</th><th>Site</th><th className="ac-num">Amount</th>
                <th>Status</th><th>Error Reason</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? visible.map((r) => (
                <tr key={r.rowNumber} className={r.status === "error" ? "ac-row-error" : ""}>
                  <td>{r.rowNumber}</td>
                  <td>{r.invoiceNo || "—"}</td>
                  <td>{r.customer || "—"}</td>
                  <td>{r.site || "—"}</td>
                  <td className="ac-num">{typeof r.amount === "number" ? money(r.amount) : r.amount || "—"}</td>
                  <td>
                    {r.status === "valid"
                      ? <span className="ac-status-pill valid"><FiCheckCircle /> Valid</span>
                      : <span className="ac-status-pill error"><FiAlertCircle /> Error</span>}
                  </td>
                  <td><Reasons errors={r.errors} big={tab === "error"} /></td>
                </tr>
              )) : (
                <tr><td className="ac-empty" colSpan={7}>
                  {tab === "error" ? "No errors found" : tab === "valid" ? "No valid records" : "No records"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ac-pager">
          <span>Showing {rows.length ? current * PAGE_SIZE + 1 : 0} to {Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}</span>
          <div className="ac-pager-btns">
            <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>&lsaquo;</button>
            <button type="button" className="active">{current + 1}</button>
            <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>&rsaquo;</button>
          </div>
        </div>

        <div className="ac-actions" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <button type="button" className="ac-btn" disabled={!review.errors} onClick={downloadErrors}>
            <FiDownload /> Download Error Rows
          </button>
          <button type="button" className="ac-btn ac-btn-primary" disabled={!review.valid || imported || busy} onClick={importValid}>
            <FiSend /> {busy ? "Submitting…" : imported ? "Submitted" : `Submit ${review.valid} Record${review.valid === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
