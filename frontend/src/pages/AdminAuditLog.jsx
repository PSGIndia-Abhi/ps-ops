import { Fragment, useCallback, useEffect, useState } from "react";
import { FiDownload, FiInfo, FiShield } from "react-icons/fi";
import { apiFetch, safeJson } from "../api";
import { DataError, EmptyRow, Pager } from "./accountant/ui";
import { AUDIT_ACTIONS, AUDIT_MODULES, actionLabel, fieldLabel, moduleBadge, moduleLabel, showValue, showWhen } from "./accountant/auditLabels";
import "./accountant/accountant.css";

// Admin -> Audit Log: who changed what in the Accountant Panel. Read only.
// Uses the accountant panel's styles so both panels look the same.

const PAGE_SIZE = 25;
const EMPTY_FILTERS = { from: "", to: "", user_id: "", module: "", action: "", q: "" };

function toQuery(filters, extra = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== "" && v != null) params.set(k, v);
  return params.toString();
}

const SOURCE_BADGE = { WEB: "partial", IMPORT: "pending", SYSTEM: "upcoming", DATABASE: "void" };
const SOURCE_LABEL = { WEB: "Web", IMPORT: "Import", SYSTEM: "System", DATABASE: "Database" };

// The customer's name without its code: "COMP117 · Cadabam's ..." -> "Cadabam's ...".
const stripCode = (label) => String(label || "").replace(/^[A-Z]+\d+\s*·\s*/, "");
const customerOf = (entry) => entry.customer_name || entry.details?.customer_name || (entry.entity_type === "CUSTOMER" ? stripCode(entry.entity_label) : "");
// What the Record column shows: for a customer-level change, its name (no code).
const recordOf = (entry) => (entry.entity_type === "CUSTOMER" ? customerOf(entry) : entry.entity_label) || "—";

// Extra lines under an expanded row: customer, invoice numbers with their amounts, reason.
function DetailBox({ entry }) {
  const d = entry.details || {};
  const items = [];
  const customer = customerOf(entry);
  if (customer) items.push({ label: "Customer", value: customer });
  if ((d.records || []).length > 1) {
    items.push({ label: `${d.records.length} customer records`, value: d.records.map((r) => r.name).join(" · ") });
  }
  if (entry.module === "INVOICE" && entry.entity_label) items.push({ label: "Invoice No", value: entry.entity_label });
  for (const inv of d.invoices || []) {
    items.push({ label: inv.invoice_number, value: <>TDS <span className="ac-audit-old">₹{inv.tds_before}</span> → <span className="ac-audit-new">₹{inv.tds_after}</span></> });
  }
  for (const a of d.allocations || []) {
    items.push({
      label: a.invoice_number,
      value: `₹${a.cash} cash${a.tds ? ` + ₹${a.tds} TDS${a.tds_type === "PREVIOUS" ? " (previous)" : ""}` : ""} · pending ₹${a.pending_before} → ₹${a.pending_after}`,
    });
  }
  if (d.payment_date) items.push({ label: "Payment date", value: showValue("due_date", String(d.payment_date).slice(0, 10)) });
  if (d.remarks) items.push({ label: "Remarks", value: d.remarks });
  if (d.file_name && entry.module !== "EXPORT") items.push({ label: "File", value: d.file_name });
  if (entry.module === "EXPORT" && d.filters && Object.keys(d.filters).length) {
    items.push({ label: "Filters", value: Object.entries(d.filters).map(([k, v]) => `${k}: ${v}`).join(", ") });
  }
  for (const s of d.skipped || []) items.push({ label: `Row ${s.rowNumber} skipped`, value: (s.errors || []).join("; ") });
  if (entry.reason) items.push({ label: "Reason", value: entry.reason });

  return (
    <div className="ac-audit-detail">
      {items.map((it, i) => (
        <div key={i}><b>{it.label}</b>{it.value}</div>
      ))}
    </div>
  );
}

function ChangeText({ entry }) {
  if (!entry.changes?.length) return <>{entry.summary || "—"}</>;
  return (
    <>
      {entry.changes.map((c, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {fieldLabel(c.field)} <span className="ac-audit-old">{showValue(c.field, c.from)}</span> → <span className="ac-audit-new">{showValue(c.field, c.to)}</span>
        </span>
      ))}
      {entry.module === "TDS" && entry.details?.invoices?.length ? ` · ${entry.details.invoices.length} invoice(s) updated` : ""}
    </>
  );
}

export default function AdminAuditLog() {
  const [draft, setDraft] = useState(EMPTY_FILTERS); // what is typed in the filter boxes
  const [filters, setFilters] = useState(EMPTY_FILTERS); // what was applied
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0, summary: {}, users: [], ready: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // expanded row id
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/audit-logs?${toQuery(filters, { page: page + 1, page_size: PAGE_SIZE })}`);
      const body = await safeJson(res);
      if (!res.ok) throw new Error(body?.error || "Could not load the audit log");
      setData(body);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const apply = () => { setPage(0); setOpen(null); setFilters(draft); };
  const reset = () => { setDraft(EMPTY_FILTERS); setPage(0); setOpen(null); setFilters(EMPTY_FILTERS); };

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await apiFetch(`/api/audit-logs/export?${toQuery(filters)}`);
      if (!res.ok) throw new Error((await safeJson(res))?.error || "Could not export the audit log");
      const href = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const s = data.summary || {};
  const actions = Object.keys(AUDIT_ACTIONS);

  return (
    <div className="ac-page ac-audit-page">
      <div className="ac-head ac-audit-head">
        <div>
          <h2 className="ac-title ac-audit-title"><FiShield className="ac-title-icon" /><span>Audit Log</span></h2>
          <p className="ac-sub">Who changed what in the Accountant Panel — invoices, payments, TDS, imports, contacts and exports. Read only.</p>
        </div>
        <button type="button" className="ac-btn ac-btn-primary" onClick={exportCsv} disabled={exporting || !data.ready}>
          <FiDownload /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {!data.ready && (
        <div className="ac-info"><FiInfo /><span>{data.message || "The audit log is not set up yet."}</span></div>
      )}
      <DataError error={error} onRetry={load} />

      <div className="ac-audit-filters">
        <label className="ac-date-field"><span>From</span><input className="ac-input" type="date" value={draft.from} max={draft.to || undefined} onChange={set("from")} /></label>
        <label className="ac-date-field"><span>To</span><input className="ac-input" type="date" value={draft.to} min={draft.from || undefined} onChange={set("to")} /></label>
        <select className="ac-select" value={draft.user_id} onChange={set("user_id")} aria-label="User">
          <option value="">User: All</option>
          {(data.users || []).map((u) => <option key={u.id} value={u.id}>{u.name || `User ${u.id}`}{u.role ? ` (${u.role})` : ""}</option>)}
        </select>
        <select className="ac-select" value={draft.module} onChange={set("module")} aria-label="Module">
          <option value="">Module: All</option>
          {AUDIT_MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select className="ac-select" value={draft.action} onChange={set("action")} aria-label="Action">
          <option value="">Action: All</option>
          {actions.map((a) => <option key={a} value={a}>{AUDIT_ACTIONS[a]}</option>)}
        </select>
        <input className="ac-input ac-audit-search" placeholder="Search invoice no, customer, UTR, user" value={draft.q} onChange={set("q")}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }} aria-label="Search" />
        <div className="ac-audit-filter-btns">
          <button type="button" className="ac-btn ac-btn-primary" onClick={apply}>Apply</button>
          <button type="button" className="ac-btn" onClick={reset}>Reset</button>
        </div>
      </div>

      <div className="ac-stats">
        <div className="ac-stat blue"><div className="ac-stat-label">Actions in range</div><div className="ac-stat-value">{loading ? "…" : (s.total || 0).toLocaleString("en-IN")}</div></div>
        <div className="ac-stat green"><div className="ac-stat-label">Payments recorded</div><div className="ac-stat-value">{loading ? "…" : (s.payments || 0).toLocaleString("en-IN")}</div></div>
        <div className="ac-stat orange"><div className="ac-stat-label">TDS setting changes</div><div className="ac-stat-value">{loading ? "…" : (s.tds_changes || 0).toLocaleString("en-IN")}</div></div>
        <div className="ac-stat red"><div className="ac-stat-label">Cancellations / reversals</div><div className="ac-stat-value">{loading ? "…" : (s.cancellations || 0).toLocaleString("en-IN")}</div></div>
      </div>

      <div className="ac-card ac-audit-card">
        <div className="ac-table-wrap">
          <table className="ac-table ac-audit-table">
            <thead>
              <tr><th>Date &amp; Time</th><th>Record</th><th>Module</th><th>Action</th><th>User</th><th>Change</th><th>Source</th></tr>
            </thead>
            <tbody>
              {!loading && data.rows.length ? data.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="ac-audit-row" onClick={() => setOpen(open === r.id ? null : r.id)} title="Click for details">
                    <td data-label="Date & Time" style={{ whiteSpace: "nowrap" }}>{showWhen(r.created_at)}</td>
                    <td data-label="Record"><div>{recordOf(r)}{r.entity_type !== "CUSTOMER" && customerOf(r) && <div className="ac-audit-muted">{customerOf(r)}</div>}{(r.details?.records || []).length > 1 && <div className="ac-audit-muted">{r.details.records.length} customer records</div>}</div></td>
                    <td data-label="Module"><span><span className={`ac-badge ${moduleBadge(r.module, r.action)}`}>{moduleLabel(r.module)}</span></span></td>
                    <td data-label="Action" style={{ whiteSpace: "nowrap" }}><span>{actionLabel(r.action)} <span className="ac-audit-muted">{open === r.id ? "▴" : "▾"}</span></span></td>
                    <td data-label="User"><div>{r.user_name || "—"}{r.user_role && <div className="ac-audit-muted">{r.user_role}</div>}</div></td>
                    <td data-label="Change" className="ac-audit-change"><span><ChangeText entry={r} /></span></td>
                    <td data-label="Source"><span><span className={`ac-badge ${SOURCE_BADGE[r.source] || "void"}`}>{SOURCE_LABEL[r.source] || r.source}</span></span></td>
                  </tr>
                  {open === r.id && (
                    <tr className="ac-audit-expand"><td colSpan={7}><DetailBox entry={r} /></td></tr>
                  )}
                </Fragment>
              )) : (
                <EmptyRow cols={7} loading={loading} text={data.ready ? "No audit entries for these filters" : "Nothing recorded yet"} />
              )}
            </tbody>
          </table>
        </div>
        <Pager total={data.total || 0} pageSize={PAGE_SIZE} page={page} onPage={(p) => { setOpen(null); setPage(p); }} />
      </div>
    </div>
  );
}
