import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FiSearch } from "react-icons/fi";
import ConfirmDialog from "../../components/ConfirmDialog";
import { EmptyRow, Pager } from "../accountant/ui";
import { billingDelete, billingGet, qs, useBilling, useCustomerOptions } from "./billingApi";
import { amount, periodLabel } from "./format";
import IssueDialog from "./IssueDialog";
import { Msg, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";
import CustomerFilter from "./CustomerFilter";

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
  const [customers, setCustomers] = useState([]); // customer filter: [] = all
  const customerOptions = useCustomerOptions();
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/invoices${qs({ status: "DRAFT", q, type, company_ids: customers.join(","), page: page + 1, page_size: PAGE_SIZE })}`);
  const [selected, setSelected] = useState(new Set());
  const [issuing, setIssuing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState({});
  const rows = data?.rows || [];
  const issuable = rows.filter((r) => r.check !== "ERRORS");
  const picked = rows.filter((r) => selected.has(r.id));
  const allOn = issuable.length > 0 && issuable.every((r) => selected.has(r.id));
  const [loadingAll, setLoadingAll] = useState(false);
  async function issueAll() {
    setLoadingAll(true);
    setMsg({});
    try {
      const all = await billingGet(`/invoices${qs({ status: "DRAFT", page_size: 200, company_ids: customers.join(",") })}`);
      const ok = all.rows.filter((r) => r.check !== "ERRORS");
      if (!ok.length) setMsg({ error: "Every draft still needs input (quantities or rates). Open them first." });
      else setIssuing(ok);
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setLoadingAll(false);
    }
  }

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
          <p className="ac-sub">Check each draft before issuing: an issued invoice gets its number and cannot be edited.</p>
        </div>
        <div className="ac-actions">
          {/* One button: with drafts ticked it issues those (count = ticked); with none ticked it issues
              every draft (all pages, up to 200) without errors. All are checked again in the dialog. */}
          {me.can("ISSUE_INVOICE") && (picked.length ? (
            <button type="button" className="ac-btn green" onClick={() => setIssuing(picked)}>
              Issue selected ({picked.length})
            </button>
          ) : (
            <button type="button" className="ac-btn green" disabled={!data?.total || loadingAll} onClick={issueAll}>
              {loadingAll ? "Loading…" : "Issue all"}
            </button>
          ))}
        </div>
      </div>
      <Msg {...msg} />

      <div className="ac-card">
        <div className="bl-filterbar">
          <div className="bl-search">
            <FiSearch aria-hidden="true" />
            <input className="ac-input" placeholder="Search customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label="Search" />
          </div>
          <CustomerFilter options={customerOptions} value={customers} onChange={(v) => { setCustomers(v); setPage(0); }} />
          <select className="ac-select" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} aria-label="Billing type">
            <option value="">All billing types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
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
