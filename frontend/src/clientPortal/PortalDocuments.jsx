import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  FiSearch, FiRefreshCw, FiDownload, FiEye, FiFileText, FiShield, FiCamera, FiFile, FiX, FiAlertTriangle, FiChevronRight,
} from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { formatDate, formatMoney, RISK_STYLE, statusInfo } from "./portalUtils";
import { getPortalFile } from "./portalFiles";

const KINDS = [
  { key: "", label: "All", count: "all" },
  { key: "shared", label: "Shared by us", count: "shared" },
  { key: "invoice", label: "Invoices", count: "invoice" },
  { key: "audit", label: "Audit reports", count: "audit" },
  { key: "photos", label: "Service photos", count: "photos" },
];

const DOC_TYPE_LABELS = {
  CERTIFICATE: "Certificate",
  CONTRACT: "Contract",
  MSDS: "MSDS / Safety sheet",
  REPORT: "Report",
  OTHER: "Document",
};

const INVOICE_STATUS = {
  PAID: { label: "Paid", className: "st-green" },
  PENDING: { label: "Pending", className: "st-amber" },
  OVERDUE: { label: "Overdue", className: "st-red" },
};

function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KindIcon({ kind }) {
  if (kind === "invoice") return <FiFileText aria-hidden="true" />;
  if (kind === "audit") return <FiShield aria-hidden="true" />;
  if (kind === "photos") return <FiCamera aria-hidden="true" />;
  return <FiFile aria-hidden="true" />;
}

export default function PortalDocuments() {
  const navigate = useNavigate();
  const { portal, outletId } = useOutletContext();
  const [params] = useSearchParams();

  const [kind, setKind] = useState(() => (KINDS.some((k) => k.key === params.get("kind")) ? params.get("kind") : ""));
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, counts: {}, expiring_soon: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterKey = `${kind}|${search}|${from}|${to}|${outletId}|${reloadKey}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q = new URLSearchParams({ page: String(page), page_size: "30" });
        if (kind) q.set("kind", kind);
        if (outletId) q.set("site_id", outletId);
        if (search) q.set("search", search);
        if (from) q.set("from", from);
        if (to) q.set("to", to);
        const res = await apiFetch(`/api/client-portal/documents?${q}`);
        const body = await safeJson(res);
        if (!res?.ok) throw new Error(body?.error || "Failed to load documents");
        if (cancelled) return;
        setItems((prev) => (page === 1 ? body.documents : [...prev, ...body.documents]));
        setMeta({ total: body.total, counts: body.counts || {}, expiring_soon: body.expiring_soon || 0 });
        setError(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  async function openFile(doc, download) {
    setBusy(`${doc.key}:${download ? "d" : "v"}`);
    setFileError(null);
    try {
      const name = doc.file_name || `${doc.title.replace(/[^\w.-]+/g, "_")}.pdf`;
      await getPortalFile(doc.download, { download, name });
    } catch (err) {
      setFileError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const outletName = outletId ? portal.outlets.find((o) => o.id === outletId)?.name : null;
  const today = new Date(new Date().toDateString());

  return (
    <div className="cp-page">
      <section className="cp-hero">
        <div>
          <h2>Documents</h2>
          <p>{outletName ? `Showing ${outletName}` : "All outlets"} · certificates, invoices, audit reports and service photos</p>
        </div>
      </section>

      {meta.expiring_soon > 0 && (
        <div className="cp-notice warn">
          <span><FiAlertTriangle aria-hidden="true" /> {meta.expiring_soon} shared document{meta.expiring_soon === 1 ? "" : "s"} expire{meta.expiring_soon === 1 ? "s" : ""} within 30 days or already expired.</span>
          <button className="cp-link" onClick={() => setKind("shared")}>View</button>
        </div>
      )}

      <div className="cp-toolbar">
        <label className="cp-search">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search documents" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="cp-daterange cp-select">
          <span>Date</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span>to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {(from || to) && <button className="cp-icon-btn cp-clear" onClick={() => { setFrom(""); setTo(""); }} aria-label="Clear dates"><FiX /></button>}
        </div>
      </div>

      <div className="cp-chips cp-chips-wide" role="tablist" aria-label="Document type">
        {KINDS.map((k) => (
          <button key={k.key || "all"} role="tab" aria-selected={kind === k.key} className={`cp-chip ${kind === k.key ? "active" : ""}`} onClick={() => setKind(k.key)}>
            {k.label} <span className="cp-chip-count">{meta.counts[k.count] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="cp-alert">{error}<button className="cp-btn cp-btn-ghost" onClick={() => setReloadKey((n) => n + 1)}><FiRefreshCw /> Retry</button></div>
      )}
      {fileError && <div className="cp-alert">{fileError}<button className="cp-icon-btn" onClick={() => setFileError(null)} aria-label="Dismiss"><FiX /></button></div>}

      <section className="cp-card cp-card-flush">
        {loading && page === 1 && items.length === 0 ? (
          <div className="cp-rowlist">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="cp-row-skel cp-skeleton" />)}</div>
        ) : items.length === 0 ? (
          <div className="cp-empty-state">
            <FiFile aria-hidden="true" />
            <strong>No documents found</strong>
            <span>{search || from || to || kind ? "Try another filter." : "Documents shared with you will appear here."}</span>
          </div>
        ) : (
          <div className="cp-rowlist">
            {items.map((d) => {
              const expired = d.valid_until && new Date(d.valid_until) < today;
              const expiringSoon = d.valid_until && !expired && (new Date(d.valid_until) - today) / 86400000 <= 30;
              const risk = d.kind === "audit" ? RISK_STYLE[String(d.risk || "").toUpperCase()] : null;
              const inv = d.kind === "invoice" ? (INVOICE_STATUS[d.status] || statusInfo(d.status)) : null;
              return (
                <div key={d.key} className={`cp-docrow kind-${d.kind}`}>
                  <span className="cp-doc-icon"><KindIcon kind={d.kind} /></span>
                  <div className="cp-jobrow-main">
                    <strong>{d.title}</strong>
                    <small>
                      {d.kind === "shared" && (DOC_TYPE_LABELS[d.doc_type] || "Document")}
                      {d.kind === "invoice" && `${formatMoney(d.amount)}${d.pending ? ` · ${formatMoney(d.pending)} due` : ""}${d.due_date && d.status !== "PAID" ? ` by ${formatDate(d.due_date)}` : ""}`}
                      {d.kind === "audit" && `${d.audit_type || "Audit"}${d.page_count ? ` · ${d.page_count} pages` : ""}`}
                      {d.kind === "photos" && `${d.photos} photo${d.photos === 1 ? "" : "s"}${d.sub_service ? ` · ${d.sub_service}` : ""}`}
                      {` · ${d.site_name || (d.kind === "shared" ? "All outlets" : "—")} · ${formatDate(d.date)}`}
                      {d.size_bytes ? ` · ${fileSize(d.size_bytes)}` : ""}
                    </small>
                    {d.notes && <small className="cp-doc-notes">{d.notes}</small>}
                  </div>
                  <div className="cp-doc-badges">
                    {d.valid_until && (
                      <span className={`cp-status ${expired ? "st-red" : expiringSoon ? "st-amber" : "st-slate"}`}>
                        {expired ? "Expired" : "Valid till"} {formatDate(d.valid_until)}
                      </span>
                    )}
                    {risk && <span className={`cp-risk ${risk.className}`}>{risk.label} risk</span>}
                    {inv && <span className={`cp-status ${inv.className}`}>{inv.label}</span>}
                  </div>
                  <div className="cp-doc-actions">
                    {d.download && (
                      <>
                        <button className="cp-btn cp-btn-ghost" onClick={() => openFile(d, false)} disabled={!!busy}>
                          <FiEye /> {busy === `${d.key}:v` ? "Opening…" : "View"}
                        </button>
                        <button className="cp-btn cp-btn-ghost" onClick={() => openFile(d, true)} disabled={!!busy} aria-label={`Download ${d.title}`}>
                          <FiDownload /> {busy === `${d.key}:d` ? "…" : ""}
                        </button>
                      </>
                    )}
                    {d.kind === "photos" && (
                      <button className="cp-btn cp-btn-ghost" onClick={() => navigate(d.link)}>View photos <FiChevronRight /></button>
                    )}
                    {d.kind === "invoice" && !d.download && <span className="cp-muted cp-doc-nofile">PDF not available online</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {items.length > 0 && (
        <div className="cp-loadmore">
          <span className="cp-muted">Showing {items.length} of {meta.total}</span>
          {items.length < meta.total && (
            <button className="cp-btn cp-btn-ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>{loading ? "Loading…" : "Load more"}</button>
          )}
        </div>
      )}
    </div>
  );
}
