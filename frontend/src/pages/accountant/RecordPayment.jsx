import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiAlertCircle, FiAlertTriangle, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiCreditCard, FiDollarSign, FiFileText, FiHash,
  FiInfo, FiList, FiMessageSquare, FiPieChart, FiPlus, FiShield, FiUser, FiX,
} from "react-icons/fi";
import { Badge, DataError, EmptyRow } from "./ui";
import { money } from "./format";
import { groupByCustomer, savePayment, showDate, todayYmd, useAccountantData } from "./data";

const MODES = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank Transfer"],
  ["NEFT", "NEFT"],
  ["CHEQUE", "Cheque"],
  ["CARD", "Card"],
  ["OTHER", "Other"],
];
const MODE_LABEL = Object.fromEntries(MODES);

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const amt = (v) => Number(v) || 0;
const inr = (n) => Number(n || 0).toLocaleString("en-IN");

// An invoice with a balance takes cash and TDS. A fully paid invoice can only take its pending ("previous") TDS.
const isOpen = (inv) => inv.pending_amount > 0;
const canPick = (inv) => isOpen(inv) || (inv.tds_applicable && inv.pending_tds > 0);

export default function RecordPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, payments, loading, error, reload } = useAccountantData();

  // Coming from an invoice or customer screen pre-selects that customer.
  const [customerId, setCustomerId] = useState(location.state?.customerId || "");
  const [showPaid, setShowPaid] = useState(false);
  const [selected, setSelected] = useState([]); // invoice ids, in the order they were ticked
  const [cash, setCash] = useState({}); // { [invoiceId]: string }
  const [tds, setTds] = useState({}); // { [invoiceId]: string }
  const [prevOpen, setPrevOpen] = useState(false);
  const [form, setForm] = useState({ date: todayYmd(), mode: "BANK_TRANSFER", reference: "", received: "", remarks: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Customers the accountant can record payments for: the ones that have invoices in their branch.
  const customers = useMemo(
    () => groupByCustomer(invoices, payments).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [invoices, payments]
  );
  const customer = customers.find((c) => c.id === customerId) || null;

  // The customer's invoices, oldest first.
  const allInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.customer_id === customerId && i.status !== "CANCELLED")
        .sort((a, b) => (a.due_date || a.invoice_date).localeCompare(b.due_date || b.invoice_date)),
    [invoices, customerId]
  );
  const visibleInvoices = allInvoices.filter((i) => showPaid || isOpen(i));
  const history = payments.filter((p) => p.customer_id === customerId && p.status !== "CANCELLED").slice(0, 5);

  // The customer's TDS setting, read from their newest invoice that has TDS.
  const tdsInvoice = [...allInvoices].reverse().find((i) => i.tds_applicable);
  const tdsOn = Boolean(tdsInvoice); // the TDS columns only show for customers with TDS
  const previousCandidates = allInvoices.filter((i) => !isOpen(i) && i.tds_applicable && i.pending_tds > 0);

  const received = amt(form.received);
  const selectedInvoices = selected.map((id) => allInvoices.find((i) => i.id === id)).filter(Boolean);
  const cashTotal = r2(selectedInvoices.reduce((s, i) => s + amt(cash[i.id]), 0));
  const tdsTotal = r2(selectedInvoices.reduce((s, i) => s + amt(tds[i.id]), 0));
  const settlement = r2(cashTotal + tdsTotal);
  const unallocated = r2(received - cashTotal);
  const allocatedCount = selectedInvoices.filter((i) => amt(cash[i.id]) + amt(tds[i.id]) > 0).length;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function changeCustomer(id) {
    setCustomerId(id);
    setSelected([]);
    setCash({});
    setTds({});
    setSaveError("");
  }

  // Suggested cash and TDS for an invoice: the customer's usual TDS, then as much cash as is left.
  function suggest(inv, room) {
    if (!isOpen(inv)) return { cash: 0, tds: inv.pending_tds };
    const t = inv.tds_applicable ? Math.min(inv.pending_tds, inv.pending_amount) : 0;
    return { cash: Math.min(r2(inv.pending_amount - t), Math.max(0, room)), tds: t };
  }

  function toggleInvoice(inv) {
    if (selected.includes(inv.id)) {
      setSelected((s) => s.filter((id) => id !== inv.id));
      setCash((c) => ({ ...c, [inv.id]: "" }));
      setTds((t) => ({ ...t, [inv.id]: "" }));
      return;
    }
    const s = suggest(inv, received - cashTotal);
    setSelected((list) => [...list, inv.id]);
    setCash((c) => ({ ...c, [inv.id]: s.cash ? String(s.cash) : "" }));
    setTds((t) => ({ ...t, [inv.id]: s.tds ? String(s.tds) : "" }));
  }

  const pickable = visibleInvoices.filter(canPick);
  function toggleAll() {
    if (pickable.length && pickable.every((i) => selected.includes(i.id))) {
      setSelected([]);
      setCash({});
      setTds({});
      return;
    }
    let room = received;
    const nextCash = {};
    const nextTds = {};
    pickable.forEach((inv) => {
      const s = suggest(inv, room);
      nextCash[inv.id] = s.cash ? String(s.cash) : "";
      nextTds[inv.id] = s.tds ? String(s.tds) : "";
      room -= s.cash;
    });
    setSelected(pickable.map((i) => i.id));
    setCash(nextCash);
    setTds(nextTds);
  }

  // "Add Previous TDS" dialog: adds TDS for already-paid invoices to this payment.
  function applyPrevious(entries) {
    setSelected((list) => [...list, ...entries.map((e) => e.id).filter((id) => !list.includes(id))]);
    setCash((c) => ({ ...c, ...Object.fromEntries(entries.map((e) => [e.id, ""])) }));
    setTds((t) => ({ ...t, ...Object.fromEntries(entries.map((e) => [e.id, String(e.amount)])) }));
    setPrevOpen(false);
  }

  const step1Done = Boolean(form.date && form.mode && received > 0);
  const step2Done = step1Done && allocatedCount > 0;
  const steps = [
    { label: "Payment Details", done: step1Done, active: !step1Done },
    { label: "Allocate Invoices", done: step2Done, active: step1Done && !step2Done },
    { label: "Confirm", done: false, active: step2Done },
  ];

  // Checks the form and returns a message for the first problem found.
  function problem() {
    if (!customerId) return "Please select a customer.";
    if (!form.date) return "Please choose the payment date.";
    if (!(received > 0)) return "Please enter the cash received.";
    if (!allocatedCount) return "Tick at least one invoice and enter an amount.";
    if (cashTotal > received + 0.005) return "The cash allocated is more than the cash received.";
    for (const inv of selectedInvoices) {
      const c = amt(cash[inv.id]);
      const t = amt(tds[inv.id]);
      if (c < 0 || t < 0) return "Amounts cannot be negative.";
      if (isOpen(inv)) {
        if (c + t > inv.pending_amount + 0.005) return `Cash plus TDS for ${inv.invoice_number} is more than its pending amount.`;
      } else {
        if (c > 0) return `${inv.invoice_number} is already paid. Only TDS can be added to it.`;
        if (t > inv.pending_tds + 0.005) return `The TDS for ${inv.invoice_number} is more than its pending TDS.`;
      }
      if (t > 0 && !inv.tds_applicable) return `TDS is not applicable for ${inv.invoice_number}.`;
    }
    return "";
  }

  async function save() {
    const message = problem();
    if (message) {
      setSaveError(message);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await savePayment({
        customer_id: customerId,
        payment_date: form.date,
        received_amount: received,
        payment_mode: form.mode,
        reference_number: form.reference.trim() || null,
        remarks: form.remarks.trim() || null,
        allocations: selectedInvoices
          .map((inv) => ({
            invoice_id: inv.id,
            cash_amount: amt(cash[inv.id]),
            tds_amount: amt(tds[inv.id]),
            tds_type: isOpen(inv) ? "CURRENT" : "PREVIOUS",
          }))
          .filter((a) => a.cash_amount > 0 || a.tds_amount > 0),
      });
      navigate("/accountant/payments/list");
    } catch (err) {
      setSaveError(err.message || "The payment could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title ac-title-icon"><FiCreditCard /> Record Payment</h2>
          <p className="ac-sub">Select customer, allocate payment to invoices and record TDS (if applicable)</p>
        </div>
      </div>

      <DataError error={error} onRetry={reload} />

      {/* 1. Customer */}
      <div className="ac-card">
        <div className="ac-rp-top">
          <div>
            <h3 className="ac-section-title"><span className="ac-sec-ic"><FiUser /></span>1. Select Customer</h3>
            <select className="ac-select" value={customerId} onChange={(e) => changeCustomer(e.target.value)}>
              <option value="">{loading ? "Loading customers…" : "Select customer"}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </select>
          </div>

          <div>
            <div className="ac-head" style={{ marginBottom: 0 }}>
              <div className="ac-mini-label" style={{ fontWeight: 600, color: "#0f172a" }}><span className="ac-lab-ic"><FiUser /></span>Customer Details</div>
              {customer && (
                <span className={`ac-badge ${tdsInvoice ? "paid" : "cancelled"}`}>
                  <FiShield style={{ verticalAlign: "-2px" }} /> {tdsInvoice ? `TDS Applicable (${tdsInvoice.tds_rate}%)` : "TDS not applicable"}
                </span>
              )}
            </div>
            {customer ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{customer.name}</div>
                <div className="ac-cust-line">Customer code: {customer.code || "—"}</div>
                <div className="ac-cust-line">Unpaid invoices: {customer.unpaid_count}</div>
              </>
            ) : (
              <p className="ac-sub" style={{ marginTop: 6 }}>Select a customer to see their details</p>
            )}
          </div>

          <div className="ac-mini-stats">
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiFileText /></span>Total Invoiced</div><div className="ac-mini-value">{customer ? money(customer.total_invoiced) : "—"}</div></div>
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiCheckCircle /></span>Total Paid</div><div className="ac-mini-value green">{customer ? money(customer.total_paid) : "—"}</div></div>
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiClock /></span>Outstanding</div><div className="ac-mini-value red">{customer ? money(customer.outstanding) : "—"}</div></div>
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiCalendar /></span>Oldest Due</div><div className="ac-mini-value red">{customer ? showDate(customer.oldest_due) || "—" : "—"}</div></div>
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiList /></span>Total Invoices</div><div className="ac-mini-value">{customer?.invoice_count ?? "—"}</div></div>
            <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiAlertTriangle /></span>Overdue Invoices</div><div className="ac-mini-value red">{customer?.overdue_count ?? "—"}</div></div>
          </div>
        </div>
      </div>

      <div className="ac-rp-main">
        {/* 2. Invoices */}
        <div className="ac-card ac-grow" style={{ minWidth: 0 }}>
          <h3 className="ac-section-title"><span className="ac-sec-ic"><FiFileText /></span>2. Select Invoices to Apply Payment</h3>
          <div className="ac-rp-tools">
            <span className="ac-note"><FiInfo /> Invoices are listed from oldest to newest. You can edit cash and TDS for each invoice.</span>
            <div className="ac-rp-tools-row">
              <label className="ac-checkline">
                <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Show fully paid invoices
              </label>
              <button type="button" className="ac-btn ac-btn-primary ac-prev-tds" disabled={!tdsOn || !previousCandidates.length} onClick={() => setPrevOpen(true)}
                title={!tdsOn ? "TDS is not applicable for this customer" : previousCandidates.length ? "" : "No earlier invoice has pending TDS"}>
                <FiPlus /> Add Previous TDS
              </button>
            </div>
          </div>
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select all"
                    checked={pickable.length > 0 && pickable.every((i) => selected.includes(i.id))} onChange={toggleAll} /></th>
                  <th>Invoice No</th><th className="ac-col-lo">Invoice Date</th><th>Due Date</th>
                  <th className="ac-num">Invoice Amount</th><th className="ac-num">Pending Amount</th>
                  {tdsOn && <><th className="ac-num ac-col-lo">TDS Rate</th><th className="ac-num">TDS Pending</th></>}
                  <th className="ac-num">Cash Amount</th>
                  {tdsOn && <><th className="ac-num">TDS Amount</th><th className="ac-num ac-col-lo">Total Allocation</th></>}
                  <th className="ac-col-lo">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.length ? visibleInvoices.map((inv) => {
                  const on = selected.includes(inv.id);
                  const c = amt(cash[inv.id]);
                  const t = amt(tds[inv.id]);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <input type="checkbox" aria-label={`Select ${inv.invoice_number}`} checked={on}
                          disabled={!canPick(inv)} onChange={() => toggleInvoice(inv)} />
                      </td>
                      <td>{inv.invoice_number}</td>
                      <td className="ac-col-lo">{showDate(inv.invoice_date)}</td>
                      <td className={inv.status === "OVERDUE" ? "ac-money-red" : ""}>{showDate(inv.due_date) || "—"}</td>
                      <td className="ac-num">{money(inv.invoice_amount)}</td>
                      <td className={`ac-num ${inv.pending_amount > 0 ? "ac-money-red" : ""}`}>{money(inv.pending_amount)}</td>
                      {tdsOn && (
                        <>
                          <td className="ac-num ac-col-lo">{inv.tds_applicable ? `${inv.tds_rate}%` : "—"}</td>
                          <td className="ac-num">{inv.tds_applicable ? money(inv.pending_tds) : "—"}</td>
                        </>
                      )}
                      <td className="ac-num">
                        <input className="ac-alloc-input" type="number" min="0" aria-label={`Cash for ${inv.invoice_number}`}
                          disabled={!on || !isOpen(inv)} value={on ? cash[inv.id] ?? "" : ""}
                          onChange={(e) => setCash((s) => ({ ...s, [inv.id]: e.target.value }))} />
                      </td>
                      {tdsOn && (
                        <>
                          <td className="ac-num">
                            <input className="ac-alloc-input" type="number" min="0" aria-label={`TDS for ${inv.invoice_number}`}
                              disabled={!on || !inv.tds_applicable} value={on ? tds[inv.id] ?? "" : ""}
                              onChange={(e) => setTds((s) => ({ ...s, [inv.id]: e.target.value }))} />
                          </td>
                          <td className="ac-num ac-col-lo">{on ? inr(r2(c + t)) : "0"}</td>
                        </>
                      )}
                      <td className="ac-col-lo"><Badge value={inv.status} /></td>
                    </tr>
                  );
                }) : <EmptyRow cols={tdsOn ? 12 : 8} text={customer ? "No invoices to show" : "Select a customer to see their invoices"} />}
                {selectedInvoices.length > 0 && (
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>Total ({selectedInvoices.length} selected)</td>
                    <td className="ac-col-lo" />
                    <td />
                    <td />
                    <td />
                    {tdsOn && (
                      <>
                        <td className="ac-col-lo" />
                        <td />
                      </>
                    )}
                    <td className="ac-num" style={{ fontWeight: 700 }}>{money(cashTotal)}</td>
                    {tdsOn && (
                      <>
                        <td className="ac-num" style={{ fontWeight: 700 }}>{money(tdsTotal)}</td>
                        <td className="ac-num ac-col-lo" style={{ fontWeight: 700 }}>{money(settlement)}</td>
                      </>
                    )}
                    <td className="ac-col-lo" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Payment details */}
        <div className="ac-card">
          <h3 className="ac-section-title"><span className="ac-sec-ic"><FiCreditCard /></span>3. Payment Details</h3>
          <div className="ac-fields-3" style={{ marginBottom: 14 }}>
            <div className="ac-field"><label><span className="ac-lab-ic"><FiCalendar /></span>Payment Date *</label><input className="ac-input" type="date" value={form.date} onChange={set("date")} /></div>
            <div className="ac-field">
              <label><span className="ac-lab-ic"><FiCreditCard /></span>Payment Mode *</label>
              <select className="ac-select" value={form.mode} onChange={set("mode")}>
                {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="ac-field"><label><span className="ac-lab-ic"><FiHash /></span>Reference No</label><input className="ac-input" value={form.reference} onChange={set("reference")} placeholder="UTR / cheque no" /></div>
          </div>
          <div className="ac-grid-2" style={{ alignItems: "end", marginBottom: 14 }}>
            <div className="ac-field">
              <label><span className="ac-lab-ic"><FiDollarSign /></span>Cash Received (₹) *</label>
              <input className="ac-input" type="number" min="0" value={form.received} onChange={set("received")} placeholder="0" />
            </div>
            {received > 0 && (
              <div className="ac-note ok">
                <FiCheckCircle /> Net payable after TDS: {money(settlement)} (allocated: {money(cashTotal)} cash + {money(tdsTotal)} TDS)
              </div>
            )}
          </div>
          <div className="ac-field">
            <label><span className="ac-lab-ic"><FiMessageSquare /></span>Remarks</label>
            <textarea className="ac-textarea" value={form.remarks} onChange={set("remarks")} placeholder="Add a remark for this payment" />
          </div>
          {unallocated < 0 && (
            <div className="ac-note" style={{ color: "#b91c1c", marginTop: 8 }}>
              <FiAlertTriangle /> The cash allocated is more than the cash received.
            </div>
          )}
          {saveError && (
            <div className="ac-info error" style={{ marginTop: 12 }} role="alert">
              <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{saveError}</span>
            </div>
          )}
          <div className="ac-rp-foot">
            <button type="button" className="ac-btn" onClick={() => navigate("/accountant/payments/list")} disabled={saving}>Cancel</button>
            <button type="button" className="ac-btn ac-btn-primary" onClick={save} disabled={saving}><FiCheck /> {saving ? "Saving…" : "Save Payment"}</button>
          </div>
        </div>
      </div>

      {/* 4. Summary */}
      <div className="ac-card">
        <h3 className="ac-section-title"><span className="ac-sec-ic"><FiPieChart /></span>4. Payment Summary</h3>
        <div className="ac-steps">
          {steps.map((s, i) => (
            <div key={s.label} className={`ac-step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}>
              <span className="ac-step-dot">{s.done ? "✓" : i + 1}</span>{s.label}
            </div>
          ))}
        </div>
        <div className="ac-sum-grid">
          <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiDollarSign /></span>Cash Received</div><div className="ac-sum-value">{money(received)}</div></div>
          <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiShield /></span>Total TDS Deducted</div><div className="ac-sum-value">{money(tdsTotal)}</div></div>
          <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiCheckCircle /></span>Total Settlement</div><div className="ac-sum-value">{money(settlement)}</div></div>
          <div><div className="ac-mini-label"><span className="ac-lab-ic"><FiFileText /></span>Invoices Allocated</div><div className="ac-sum-value">{allocatedCount}</div></div>
        </div>
        <div className="ac-note info" style={{ marginTop: 12 }}>
          <FiInfo /> TDS is recorded against each invoice at the rate saved when the invoice was created. You can adjust the TDS amount, and add TDS from earlier invoices with Add Previous TDS.
        </div>
      </div>

      {/* 5. Recent payments */}
      <div className="ac-card">
        <div className="ac-card-head">
          <h3 className="ac-section-title" style={{ margin: 0 }}><span className="ac-sec-ic"><FiClock /></span>5. Recent Payments for this Customer</h3>
          <button type="button" className="ac-link" onClick={() => navigate("/accountant/payments/list")}>View All Payments &rsaquo;</button>
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr><th>Date</th><th>Reference No</th><th className="ac-num">Cash (₹)</th><th className="ac-num">TDS (₹)</th><th>Mode</th><th className="ac-num">Allocated Cash (₹)</th><th>Remarks</th><th>Created By</th></tr>
            </thead>
            <tbody>
              {history.length ? history.map((p) => (
                <tr key={p.id}>
                  <td>{showDate(p.payment_date)}</td><td>{p.reference_number || "—"}</td>
                  <td className="ac-num">{inr(p.received_amount)}</td>
                  <td className="ac-num">{inr(p.tds_amount)}</td>
                  <td>{MODE_LABEL[p.payment_mode] || p.payment_mode}</td>
                  <td className="ac-num">{inr(p.allocated_amount)}</td>
                  <td>{p.remarks || "—"}</td><td>{p.created_by || "—"}</td>
                </tr>
              )) : <EmptyRow cols={8} text={customer ? "No payments recorded for this customer" : "Select a customer to see their payments"} />}
            </tbody>
          </table>
        </div>
      </div>

      {prevOpen && <PreviousTdsModal invoices={previousCandidates} current={tds} onClose={() => setPrevOpen(false)} onApply={applyPrevious} />}
    </div>
  );
}

// Lists paid invoices that still have TDS pending, so the accountant can include it in this payment.
function PreviousTdsModal({ invoices, current, onClose, onApply }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(invoices.map((i) => [i.id, { on: amt(current[i.id]) > 0, amount: current[i.id] || String(i.pending_tds) }]))
  );
  const [error, setError] = useState("");

  const chosen = invoices.filter((i) => rows[i.id]?.on);
  const total = r2(chosen.reduce((s, i) => s + amt(rows[i.id].amount), 0));
  const patch = (id, change) => setRows((r) => ({ ...r, [id]: { ...r[id], ...change } }));

  function apply() {
    for (const inv of chosen) {
      const a = amt(rows[inv.id].amount);
      if (!(a > 0)) return setError(`Enter the amount to deduct for ${inv.invoice_number}.`);
      if (a > inv.pending_tds + 0.005) return setError(`The amount for ${inv.invoice_number} is more than its pending TDS.`);
    }
    if (!chosen.length) return setError("Tick at least one invoice.");
    onApply(chosen.map((i) => ({ id: i.id, amount: amt(rows[i.id].amount) })));
  }

  return (
    <div className="ac-overlay" onMouseDown={onClose}>
      <div className="ac-modal" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ac-head" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Add Previous TDS</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={onClose}><FiX /></button>
        </div>
        <p className="ac-sub" style={{ marginBottom: 12 }}>Select invoices with pending TDS to include in this payment.</p>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead><tr><th /><th>Invoice No</th><th>Invoice Date</th><th className="ac-num">Pending TDS</th><th className="ac-num">Amount to Deduct</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><input type="checkbox" aria-label={`Select ${inv.invoice_number}`} checked={Boolean(rows[inv.id]?.on)} onChange={(e) => patch(inv.id, { on: e.target.checked })} /></td>
                  <td>{inv.invoice_number}</td>
                  <td>{showDate(inv.invoice_date)}</td>
                  <td className="ac-num ac-money-red">{money(inv.pending_tds)}</td>
                  <td className="ac-num">
                    <input className="ac-alloc-input" type="number" min="0" max={inv.pending_tds} disabled={!rows[inv.id]?.on}
                      value={rows[inv.id]?.amount ?? ""} onChange={(e) => patch(inv.id, { amount: e.target.value })} />
                  </td>
                </tr>
              ))}
              <tr><td colSpan={4} style={{ fontWeight: 700 }}>Total Previous TDS</td><td className="ac-num" style={{ fontWeight: 700 }}>{money(total)}</td></tr>
            </tbody>
          </table>
        </div>
        {error && <div className="ac-info error" style={{ marginTop: 12 }} role="alert"><FiAlertCircle /><span>{error}</span></div>}
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="ac-btn ac-btn-primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
