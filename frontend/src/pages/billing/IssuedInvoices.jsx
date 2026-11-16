import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow, Pager } from "../accountant/ui";
import { exportCsv } from "../accountant/exportCsv";
import { billingPost, openPdf, qs, useBilling } from "./billingApi";
import { amount, dmy, periodLabel, thisMonth, typeLabel } from "./format";
import ShareDialog from "./ShareDialog";
import { Modal, Msg, StatusBadge, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";

// Issued Invoices: numbered invoices with their collection status (from the receivables in the
// Accountant Panel), PDF, Print / Share and Cancel.

const PAGE_SIZE = 25;

export default function IssuedInvoices() {
  const { me } = useOutletContext();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [type, setType] = useState("");
  const [status, setStatus] = useState("ISSUED,CANCELLED");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/invoices${qs({ status, month, type, q, page: page + 1, page_size: PAGE_SIZE })}`);
  const [shareId, setShareId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [msg, setMsg] = useState({});
  const rows = data?.rows || [];

  const pdf = (id) => openPdf(`/invoices/${id}/pdf`).catch((err) => setMsg({ error: err.message }));
  const exportRows = () =>
    exportCsv(`issued-invoices-${month || "all"}.csv`, [
      { header: "Invoice No", value: (r) => r.invoice_number },
      { header: "Date", value: (r) => dmy(r.invoice_date) },
      { header: "Customer", value: (r) => r.customer },
      { header: "Type", value: (r) => typeLabel(r.billing_type) },
      { header: "Period", value: (r) => periodLabel(r.period_start, r.period_end) },
      { header: "Total", value: (r) => r.total },
      { header: "Advance adjusted", value: (r) => r.advance_adjusted },
      { header: "Receivable", value: (r) => (r.status === "CANCELLED" ? "Cancelled" : r.receivable_status) },
      { header: "PO", value: (r) => r.po_numbers.join(", ") },
    ], rows);

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Issued Invoices</h1>
          <p className="ac-sub">Final, numbered invoices. They also flow to the Accountant Panel (Invoice List, Outstanding, Payments) for collection.</p>
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn" disabled={!rows.length} onClick={exportRows}>Export</button>
        </div>
      </div>
      <Msg {...msg} />

      <div className="ac-card">
        <div className="ac-filters-5" style={{ marginBottom: 12 }}>
          <input className="ac-input" placeholder="Search invoice no. or customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <input type="month" className="ac-input" value={month} onChange={(e) => { setMonth(e.target.value); setPage(0); }} aria-label="Month" title="Clear for all months" />
          <select className="ac-select" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} aria-label="Type">
            <option value="">All types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <select className="ac-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Status">
            <option value="ISSUED,CANCELLED">All statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <div />
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Invoice no.</th><th>Date</th><th>Customer</th><th>Type</th><th>Period</th>
                <th className="ac-num">Total (₹)</th><th className="ac-num">Advance adjusted (₹)</th><th>Receivable</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={9} loading={loading} text="No issued invoices for these filters." />
              ) : (
                rows.map((r) => {
                  const cancelled = r.status === "CANCELLED";
                  const paidSomething = ["PAID", "PARTIAL"].includes(r.receivable_status) && !(r.advance_adjusted > 0);
                  return (
                    <tr key={r.id} className={cancelled ? "bl-muted" : ""}>
                      <td><b>{r.invoice_number}</b></td>
                      <td>{dmy(r.invoice_date)}</td>
                      <td>{r.customer}{r.po_numbers.length > 0 && <div className="bl-sub">PO {r.po_numbers.join(", ")}</div>}</td>
                      <td><TypeBadge type={r.billing_type} /></td>
                      <td>{periodLabel(r.period_start, r.period_end)}</td>
                      <td className="bl-num">{cancelled ? <s>{amount(r.total)}</s> : amount(r.total)}</td>
                      <td className="bl-num">{r.advance_adjusted ? amount(r.advance_adjusted) : "—"}</td>
                      <td>{cancelled ? <StatusBadge value="CANCELLED" /> : <StatusBadge value={r.receivable_status || "PENDING"} />}</td>
                      <td>
                        <div className="ac-actions">
                          <button type="button" className="ac-btn sm" onClick={() => pdf(r.id)}>PDF</button>
                          {!cancelled && me.can("SHARE_INVOICE") && <button type="button" className="ac-btn sm share" onClick={() => setShareId(r.id)}>Share</button>}
                          {!cancelled && me.can("CANCEL_INVOICE") && (
                            <button type="button" className="ac-btn sm danger-text" disabled={paidSomething} title={paidSomething ? "A payment has been received against this invoice" : undefined} onClick={() => setCancelling(r)}>
                              Cancel
                            </button>
                          )}
                        </div>
                        {r.last_shared && <div className="bl-sub">Last {r.last_shared.channel.toLowerCase()} by {r.last_shared.by || "—"}</div>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} pageSize={PAGE_SIZE} page={page} onPage={setPage} />}
      </div>

      {shareId && <ShareDialog invoiceId={shareId} onClose={() => { setShareId(null); reload(); }} />}
      {cancelling && (
        <CancelDialog
          invoice={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setMsg({ ok: `Invoice ${cancelling.invoice_number} cancelled.` });
            setCancelling(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CancelDialog({ invoice, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await billingPost(`/invoices/${invoice.id}/cancel`, { reason });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose} narrow label="Cancel invoice">
      <div className="bl-m-head">
        <div><h3>Cancel invoice {invoice.invoice_number}?</h3><div className="ac-sub">{invoice.customer} · ₹{amount(invoice.total)}</div></div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="bl-m-body">
        <div className="ac-info">ⓘ The receivable is cancelled too, any advance used goes back to the PO, and shared links stop working. The period can be billed again from the Bill Run.</div>
        <div className="ac-field">
          <label>Reason <span className="bl-req">*</span></label>
          <textarea className="ac-textarea" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong quantity – will re-issue" />
        </div>
        <Msg error={error} />
      </div>
      <div className="bl-m-foot">
        <span />
        <div className="ac-actions">
          <button type="button" className="ac-btn" onClick={onClose}>Keep invoice</button>
          <button type="button" className="ac-btn ac-btn-primary" style={{ background: "#dc2626", borderColor: "#dc2626" }} disabled={busy || !reason.trim()} onClick={submit}>
            {busy ? "Cancelling…" : "Cancel invoice"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
