import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auditsApi, downloadAuditPdf } from "./auditsApi";
import StartAuditModal from "./StartAuditModal";
import { StatusPill } from "./shared";
import { fmtDate, useAuditBase } from "./format";
import "./audits.css";

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "IN_PROGRESS,AMENDING", label: "In Progress" },
  { value: "SUBMITTED", label: "Completed" },
];

// Audits dashboard: search + filters + one table of all audits the user can see.
export default function AuditsList() {
  const navigate = useNavigate();
  const [pdfBusy, setPdfBusy] = useState(null);
  const [pdfError, setPdfError] = useState("");
  async function downloadPdf(a) {
    setPdfBusy(a.id);
    setPdfError("");
    try {
      await downloadAuditPdf(a.id, a.companyName, a.auditDate);
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setPdfBusy(null);
    }
  }
  const base = useAuditBase();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const [data, setData] = useState({ items: [], total: 0, pageSize: 20 });
  const [auditors, setAuditors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", from: "", to: "", auditorId: "", page: 1 });
  const [search, setSearch] = useState("");
  const [showStart, setShowStart] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await auditsApi.list({ ...filters, status, pageSize: 20 }));
      setError("");
    } catch (err) {
      setError(err.status === 403 ? "You do not have access to Site Audits." : err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { auditsApi.auditors().then((r) => setAuditors(r.items)).catch(() => {}); }, []);

  // Debounced search box
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [search]);

  const setStatus = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("status", value); else next.delete("status");
    setParams(next, { replace: true });
    setFilters((f) => ({ ...f, page: 1 }));
  };

  const pages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 20)));
  const open = (a) => navigate(`${base}/${a.id}`);

  return (
    <div className="au-page">
      <div className="au-header">
        <div>
          <h2>Audits</h2>
          <div className="au-subtitle">Create and manage site audits</div>
        </div>
        <button type="button" className="au-btn au-btn-primary au-btn-lg" onClick={() => setShowStart(true)}>+ New Audit</button>
      </div>

      <div className="au-card">
        <div className="au-toolbar">
          <input
            className="au-input au-search"
            placeholder="Search customer, site or report no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="au-datebox">
            <span>From</span>
            <input type="date" className="au-input" aria-label="From date" value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))} />
          </label>
          <label className="au-datebox">
            <span>To</span>
            <input type="date" className="au-input" aria-label="To date" value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))} />
          </label>
          <select className="au-input au-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="au-input au-select" value={filters.auditorId} aria-label="Auditor"
            onChange={(e) => setFilters((f) => ({ ...f, auditorId: e.target.value, page: 1 }))}>
            <option value="">All Auditors</option>
            {auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {error && <div className="au-error au-m12">{error}</div>}
        {pdfError && <div className="au-error au-m12">{pdfError}</div>}

        <div className="au-table-fit">
          <table className="au-table au-list-table">
            <colgroup>
              <col className="au-col-no" />
              <col />
              <col className="au-col-date" />
              <col className="au-col-auditor" />
              <col className="au-col-areas" />
              <col className="au-col-status" />
              <col className="au-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Report No.</th>
                <th>Customer / Site</th>
                <th>Audit Date</th>
                <th>Auditor</th>
                <th>Areas</th>
                <th>Status</th>
                <th className="au-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="au-empty">Loading audits…</td></tr>}
              {!loading && !data.items.length && !error && (
                <tr><td colSpan={7} className="au-empty">No audits found. Click “+ New Audit” to start one.</td></tr>
              )}
              {!loading && data.items.map((a) => {
                const draft = a.status !== "SUBMITTED";
                return (
                  <tr key={a.id} className="au-row" onClick={() => open(a)}>
                    <td className="au-nowrap au-reportno">{a.auditNumber}</td>
                    <td className="au-cust">
                      <div className="au-strong au-ellipsis">{a.companyName}</div>
                      <div className="au-muted au-ellipsis" title={a.siteAddress || ""}>
                        {a.siteName}{a.siteAddress ? ` · ${a.siteAddress}` : ""}
                      </div>
                    </td>
                    <td className="au-nowrap">{fmtDate(a.auditDate)}</td>
                    <td className="au-ellipsis" title={a.auditorName || ""}>{a.auditorName || "—"}</td>
                    <td className="au-nowrap">{a.areasCompleted} / {a.areasTotal}</td>
                    <td><StatusPill status={a.status} /></td>
                    <td className="au-right">
                      <div className="au-row-actions">
                        <button type="button"
                          className={`au-btn au-btn-small ${draft ? "au-btn-primary" : "au-btn-outline"}`}
                          onClick={(e) => { e.stopPropagation(); open(a); }}>
                          {draft ? "Continue" : "View"}
                        </button>
                        <button type="button"
                          className="au-btn au-btn-small au-btn-outline"
                          disabled={pdfBusy === a.id}
                          title={draft ? "Download a draft PDF (not submitted yet)" : "Download the report PDF"}
                          onClick={(e) => { e.stopPropagation(); downloadPdf(a); }}>
                          {pdfBusy === a.id ? "…" : draft ? "↓ Draft PDF" : "↓ PDF"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="au-pager">
            <button type="button" className="au-btn au-btn-small" disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
            <span>Page {filters.page} of {pages} · {data.total} audits</span>
            <button type="button" className="au-btn au-btn-small" disabled={filters.page >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
          </div>
        )}
      </div>

      {showStart && (
        <StartAuditModal onClose={() => setShowStart(false)} onCreated={(id) => navigate(`${base}/${id}`)} />
      )}
    </div>
  );
}
