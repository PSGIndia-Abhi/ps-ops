import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import { EmptyRow, Pager } from "../accountant/ui";
import { billingDelete, qs, useBilling } from "./billingApi";
import { amount, periodLabel } from "./format";
import IssueDialog from "./IssueDialog";
import { Msg, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";

// Draft Invoices: drafts from the Bill Run. Open one to edit it, or issue several at once.

const PAGE_SIZE = 25;
const CHECK = {
  OK: <span className="ac-badge b-green">OK</span>,
  WARNINGS: <span className="ac-badge b-amber">Warnings</span>,
  ERRORS: <span className="ac-badge b-red">Needs input</span>,
};

export default function DraftInvoices() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/invoices${qs({ status: "DRAFT", q, type, page: page + 1, page_size: PAGE_SIZE })}`);
  const [selected, setSelected] = useState(new Set());
  const [issuing, setIssuing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState({});
  const rows = data?.rows || [];
  const issuable = rows.filter((r) => r.check !== "ERRORS");
  const picked = rows.filter((r) => selected.has(r.id));
  const allOn = issuable.length > 0 && issuable.every((r) => selected.has(r.id));

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  async function remove() {
    try {
      await billingDelete(`/invoices/${deleting.id}`);
      setMsg({ ok: `Draft for ${deleting.customer} deleted.` });
      reload();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Draft Invoices</h1>
          <p className="ac-sub">Check each draft, fill in quantities where needed, then issue. Numbers are given when issued.</p>
        </div>
        <div className="ac-actions">
          {me.can("ISSUE_INVOICE") && (
            <button type="button" className="ac-btn green" disabled={!picked.length} onClick={() => setIssuing(picked)}>
              Issue selected ({picked.length})
            </button>
          )}
        </div>
      </div>
      <Msg {...msg} />

      <div className="ac-card">
        <div className="ac-filters" style={{ marginBottom: 12 }}>
          <input className="ac-input" placeholder="Search customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="ac-select" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} aria-label="Billing type">
            <option value="">All billing types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <div />
          <div />
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th><input type="checkbox" className="bl-cb" checked={allOn} disabled={!issuable.length} onChange={() => setSelected(allOn ? new Set() : new Set(issuable.map((r) => r.id)))} aria-label="Select all" /></th>
                <th>Customer</th><th>Contract</th><th>Type</th><th>Period</th><th>Services</th>
                <th className="ac-num">Sub total (₹)</th><th className="ac-num">Total (₹)</th><th>Check</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={10} loading={loading} text="No drafts. Generate them from the Bill Run." />
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={`bl-click ${r.service_shortfall ? "bl-short" : ""}`} onClick={() => navigate(`/billing/drafts/${r.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="bl-cb" checked={selected.has(r.id)} disabled={r.check === "ERRORS"} onChange={() => toggle(r.id)} aria-label={`Select ${r.customer}`} />
                    </td>
                    <td><b>{r.customer}</b></td>
                    <td>{r.contract_code}</td>
                    <td><TypeBadge type={r.billing_type} /></td>
                    <td>{periodLabel(r.period_start, r.period_end)}</td>
                    <td>{r.service_shortfall ? <span className="bl-svc short">{r.service_shortfall} short ⚠</span> : <span className="ac-sub">—</span>}</td>
                    <td className="bl-num">{amount(r.subtotal)}</td>
                    <td className="bl-num"><b>{amount(r.total)}</b></td>
                    <td>{CHECK[r.check]}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="ac-actions">
                        <button type="button" className="ac-btn sm" onClick={() => navigate(`/billing/drafts/${r.id}`)}>Open</button>
                        {me.can("GENERATE_INVOICE") && <button type="button" className="ac-btn sm danger-text" onClick={() => setDeleting(r)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
      </div>

      {issuing && (
        <IssueDialog
          drafts={issuing}
          warnings={issuing.some((d) => d.service_shortfall) ? ["Some invoices have services short this period; they bill the services done."] : []}
          onDone={() => { setSelected(new Set()); reload(); }}
          onClose={() => setIssuing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title="Delete draft?"
          message={`The draft for ${deleting.customer} (${periodLabel(deleting.period_start, deleting.period_end)}) will be deleted. You can generate it again from the Bill Run.`}
          confirmLabel="Delete"
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
