import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo } from "react-icons/fi";
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

export default function RecordPayment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { invoices, payments, loading, error, reload } = useAccountantData();

  // Coming from an invoice or customer screen pre-selects that customer.
  const [customerId, setCustomerId] = useState(location.state?.customerId || "");
  const [showPaid, setShowPaid] = useState(false);
  const [selected, setSelected] = useState([]); // invoice ids, in the order they were ticked
  const [alloc, setAlloc] = useState({}); // { [invoiceId]: string }
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
  const visibleInvoices = allInvoices.filter((i) => showPaid || i.pending_amount > 0);
  const history = payments.filter((p) => p.customer_id === customerId && p.status !== "CANCELLED").slice(0, 5);

  const received = Number(form.received) || 0;
  const allocatedTotal = selected.reduce((s, id) => s + (Number(alloc[id]) || 0), 0);
  const unallocated = received - allocatedTotal;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function changeCustomer(id) {
    setCustomerId(id);
    setSelected([]);
    setAlloc({});
    setSaveError("");
  }

  // Ticking an invoice allocates as much of the unallocated amount as it needs (oldest first).
  function toggleInvoice(inv) {
    if (selected.includes(inv.id)) {
      setSelected((s) => s.filter((id) => id !== inv.id));
      setAlloc((a) => ({ ...a, [inv.id]: "" }));
      return;
    }
    const room = Math.max(0, received - allocatedTotal);
    const amount = Math.min(inv.pending_amount, room);
    setSelected((s) => [...s, inv.id]);
    setAlloc((a) => ({ ...a, [inv.id]: amount ? String(amount) : "" }));
  }

  function toggleAll() {
    const payable = visibleInvoices.filter((i) => i.pending_amount > 0);
    if (selected.length === payable.length) {
      setSelected([]);
      setAlloc({});
      return;
    }
    let room = received;
    const nextAlloc = {};
    payable.forEach((inv) => {
      const amount = Math.min(inv.pending_amount, Math.max(0, room));
      nextAlloc[inv.id] = amount ? String(amount) : "";
      room -= amount;
    });
    setSelected(payable.map((i) => i.id));
    setAlloc(nextAlloc);
  }

  const selectedInvoices = selected.map((id) => allInvoices.find((i) => i.id === id)).filter(Boolean);
  const payableCount = visibleInvoices.filter((i) => i.pending_amount > 0).length;

  const step1Done = Boolean(form.date && form.mode && received > 0);
  const step2Done = step1Done && selected.length > 0 && allocatedTotal > 0;
  const steps = [
    { label: "Payment Details", done: step1Done, active: !step1Done },
    { label: "Allocate Invoices", done: step2Done, active: step1Done && !step2Done },
    { label: "Confirm", done: false, active: step2Done },
  ];

  // Checks the form and returns a message for the first problem found.
  function problem() {
    if (!customerId) return "Please select a customer.";
    if (!form.date) return "Please choose the payment date.";
    if (!(received > 0)) return "Please enter the received amount.";
    if (allocatedTotal > received) return "The allocated amount is more than the received amount.";
    for (const inv of selectedInvoices) {
      if ((Number(alloc[inv.id]) || 0) > inv.pending_amount) return `The amount for ${inv.invoice_number} is more than its pending amount.`;
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
          .map((inv) => ({ invoice_id: inv.id, allocated_amount: Number(alloc[inv.id]) || 0 }))
          .filter((a) => a.allocated_amount > 0),
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
          <h2 className="ac-title">Record Payment</h2>
          <p className="ac-sub">Select customer, allocate payment to invoices (oldest first)</p>
        </div>
        <div className="ac-crumb">Home &rsaquo; Payments &rsaquo; <strong>Record Payment</strong></div>
      </div>

      <DataError error={error} onRetry={reload} />

      {/* 1. Customer */}
      <div className="ac-card">
        <div className="ac-rp-top">
          <div>
            <h3 className="ac-section-title">1. Select Customer</h3>
            <select className="ac-select" value={customerId} onChange={(e) => changeCustomer(e.target.value)}>
              <option value="">{loading ? "Loading customers…" : "Select customer"}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </select>
          </div>

          <div>
            <div className="ac-mini-label" style={{ fontWeight: 600, color: "#0f172a" }}>Customer Details</div>
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
            <div><div className="ac-mini-label">Total Invoiced</div><div className="ac-mini-value">{customer ? money(customer.total_invoiced) : "—"}</div></div>
            <div><div className="ac-mini-label">Total Paid</div><div className="ac-mini-value green">{customer ? money(customer.total_paid) : "—"}</div></div>
            <div><div className="ac-mini-label">Outstanding</div><div className="ac-mini-value red">{customer ? money(customer.outstanding) : "—"}</div></div>
            <div><div className="ac-mini-label">Oldest Due</div><div className="ac-mini-value red">{customer ? showDate(customer.oldest_due) || "—" : "—"}</div></div>
            <div><div className="ac-mini-label">Total Invoices</div><div className="ac-mini-value">{customer?.invoice_count ?? "—"}</div></div>
            <div><div className="ac-mini-label">Overdue Invoices</div><div className="ac-mini-value red">{customer?.overdue_count ?? "—"}</div></div>
          </div>
        </div>
      </div>

      <div className="ac-rp-main">
        <div className="ac-rp-col">
          {/* 2. Invoices */}
          <div className="ac-card ac-grow">
            <h3 className="ac-section-title">2. Select Invoices to Apply Payment</h3>
            <div className="ac-head" style={{ marginBottom: 10 }}>
              <span className="ac-note"><FiInfo /> Invoices are listed from oldest to newest. Clear older invoices first.</span>
              <label className="ac-checkline">
                <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Show fully paid invoices
              </label>
            </div>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label="Select all"
                      checked={payableCount > 0 && selected.length === payableCount} onChange={toggleAll} /></th>
                    <th>Invoice No</th><th>Invoice Date</th><th>Due Date</th>
                    <th className="ac-num">Invoice Amount</th><th className="ac-num">Paid Amount</th><th className="ac-num">Pending Amount</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.length ? visibleInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <input type="checkbox" aria-label={`Select ${inv.invoice_number}`} checked={selected.includes(inv.id)}
                          disabled={inv.pending_amount <= 0} onChange={() => toggleInvoice(inv)} />
                      </td>
                      <td>{inv.invoice_number}</td>
                      <td>{showDate(inv.invoice_date)}</td>
                      <td className={inv.status === "OVERDUE" ? "ac-money-red" : ""}>{showDate(inv.due_date) || "—"}</td>
                      <td className="ac-num">{money(inv.invoice_amount)}</td>
                      <td className="ac-num">{money(inv.paid_amount)}</td>
                      <td className="ac-num ac-money-red">{money(inv.pending_amount)}</td>
                      <td><Badge value={inv.status} /></td>
                    </tr>
                  )) : <EmptyRow cols={8} text={customer ? "No invoices to show" : "Select a customer to see their invoices"} />}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Preview */}
          <div className="ac-card">
            <h3 className="ac-section-title">5. Payment Allocation Preview</h3>
            <div className="ac-steps">
              {steps.map((s, i) => (
                <div key={s.label} className={`ac-step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}>
                  <span className="ac-step-dot">{s.done ? "✓" : i + 1}</span>{s.label}
                </div>
              ))}
            </div>
            <div className="ac-sum-grid">
              <div><div className="ac-mini-label">Received Amount</div><div className="ac-sum-value">{money(received)}</div></div>
              <div><div className="ac-mini-label">Allocated Amount</div><div className="ac-sum-value">{money(allocatedTotal)}</div></div>
              <div><div className="ac-mini-label">Unallocated Amount</div><div className="ac-sum-value">{money(unallocated)}</div></div>
              <div><div className="ac-mini-label">Invoices Selected</div><div className="ac-sum-value">{selected.length}</div></div>
            </div>
          </div>
        </div>

        <div className="ac-rp-col">
          {/* 3. Payment details */}
          <div className="ac-card">
            <h3 className="ac-section-title">3. Payment Details</h3>
            <div className="ac-fields-3" style={{ marginBottom: 14 }}>
              <div className="ac-field"><label>Payment Date *</label><input className="ac-input" type="date" value={form.date} onChange={set("date")} /></div>
              <div className="ac-field">
                <label>Payment Mode *</label>
                <select className="ac-select" value={form.mode} onChange={set("mode")}>
                  {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="ac-field"><label>UTR No</label><input className="ac-input" value={form.reference} onChange={set("reference")} placeholder="UTR / cheque no" /></div>
            </div>
            <div className="ac-grid-2" style={{ alignItems: "end", marginBottom: 14 }}>
              <div className="ac-field">
                <label>Received Amount (₹) *</label>
                <input className="ac-input" type="number" min="0" value={form.received} onChange={set("received")} placeholder="0" />
              </div>
              {received > 0 && <div className="ac-note ok"><FiCheckCircle /> You can allocate up to {money(received)}</div>}
            </div>
            <div className="ac-field">
              <label>Remarks</label>
              <textarea className="ac-textarea" value={form.remarks} onChange={set("remarks")} placeholder="Add a remark for this payment" />
            </div>
          </div>

          {/* 4. Allocation */}
          <div className="ac-card ac-grow">
            <h3 className="ac-section-title">4. Allocate Payment to Selected Invoices</h3>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr><th>Invoice No</th><th className="ac-num">Pending Amount (₹)</th><th className="ac-num">Allocate Amount (₹)</th><th className="ac-num">Balance (₹)</th><th /></tr>
                </thead>
                <tbody>
                  {selectedInvoices.length ? selectedInvoices.map((inv) => {
                    const a = Number(alloc[inv.id]) || 0;
                    const balance = inv.pending_amount - a;
                    return (
                      <tr key={inv.id}>
                        <td>{inv.invoice_number}</td>
                        <td className="ac-num">{inv.pending_amount.toLocaleString("en-IN")}</td>
                        <td className="ac-num">
                          <input className="ac-alloc-input" type="number" min="0" max={inv.pending_amount} value={alloc[inv.id] ?? ""}
                            onChange={(e) => setAlloc((s) => ({ ...s, [inv.id]: e.target.value }))} />
                        </td>
                        <td className={`ac-num ${balance > 0 ? "ac-money-red" : ""}`}>{balance.toLocaleString("en-IN")}</td>
                        <td>{balance <= 0 ? <FiCheckCircle color="#16a34a" /> : <FiAlertTriangle color="#f59e0b" />}</td>
                      </tr>
                    );
                  }) : <EmptyRow cols={5} text="Tick invoices above to allocate the payment" />}
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>Total Allocated</td>
                    <td className="ac-num" style={{ fontWeight: 700 }}>{allocatedTotal.toLocaleString("en-IN")}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="ac-note info" style={{ marginTop: 12 }}>
              <FiInfo /> Allocation is applied to oldest invoices first. Newer invoices can be cleared only after older invoices are fully paid.
            </div>
            {unallocated < 0 && (
              <div className="ac-note" style={{ color: "#b91c1c", marginTop: 8 }}>
                <FiAlertTriangle /> Allocated amount is more than the received amount.
              </div>
            )}
            {saveError && (
              <div className="ac-info error" style={{ marginTop: 12 }} role="alert">
                <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{saveError}</span>
              </div>
            )}
            <div className="ac-rp-foot">
              <button type="button" className="ac-btn" onClick={() => navigate("/accountant/payments/list")} disabled={saving}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Payment"}</button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Recent payments */}
      <div className="ac-card">
        <div className="ac-card-head">
          <h3 className="ac-section-title" style={{ margin: 0 }}>6. Recent Payments for this Customer</h3>
          <button type="button" className="ac-link" onClick={() => navigate("/accountant/payments/list")}>View All Payments &rsaquo;</button>
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr><th>Date</th><th>UTR No</th><th className="ac-num">Amount (₹)</th><th>Mode</th><th className="ac-num">Allocated (₹)</th><th>Remarks</th><th>Created By</th></tr>
            </thead>
            <tbody>
              {history.length ? history.map((p) => (
                <tr key={p.id}>
                  <td>{showDate(p.payment_date)}</td><td>{p.reference_number || "—"}</td>
                  <td className="ac-num">{p.received_amount.toLocaleString("en-IN")}</td>
                  <td>{MODE_LABEL[p.payment_mode] || p.payment_mode}</td>
                  <td className="ac-num">{p.allocated_amount.toLocaleString("en-IN")}</td>
                  <td>{p.remarks || "—"}</td><td>{p.created_by || "—"}</td>
                </tr>
              )) : <EmptyRow cols={7} text={customer ? "No payments recorded for this customer" : "Select a customer to see their payments"} />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
