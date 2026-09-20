import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiCheckSquare, FiPhone, FiPlusCircle } from "react-icons/fi";
import SetReminderModal from "../../components/accountant/SetReminderModal";
import { Badge, DataError, EmptyRow } from "./ui";
import { money } from "./format";
import { createReminder, fetchInvoice, showDate, ymd, useAccountantData } from "./data";

const dash = (v) => (v == null || v === "" ? "—" : v);
const MODE_LABEL = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", NEFT: "NEFT", CHEQUE: "Cheque", CARD: "Card", OTHER: "Other" };

export default function InvoiceDetails() {
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const { tasks, reload: reloadTasks } = useAccountantData();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);

  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to load the invoice again

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchInvoice(invoiceId);
        if (!cancelled) {
          setInvoice(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this invoice");
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId, attempt]);

  const total = Number(invoice?.invoice_amount) || 0;
  const paid = Number(invoice?.paid_amount) || 0;
  const pending = Number(invoice?.pending_amount) || 0;
  const status = invoice?.display_status || invoice?.status;

  // Payment history comes from the payments applied to this invoice.
  const payments = (invoice?.allocations || []).map((a) => ({
    id: a.id,
    date: ymd(a.payment_date),
    amount: Number(a.allocated_amount) || 0,
    mode: MODE_LABEL[a.payment_mode] || a.payment_mode,
    reference: a.reference_number || "",
    received_by: a.received_by || "",
  }));

  // Follow-ups are the reminder tasks set on this invoice.
  const followUps = tasks
    .filter((t) => t.reference_id === invoiceId)
    .sort((a, b) => (b.due_date || "").localeCompare(a.due_date || ""));

  const info = [
    ["Invoice Date", showDate(invoice?.invoice_date)],
    ["Due Date", showDate(invoice?.due_date)],
    ["Customer", invoice?.customer_name],
    ["Site", invoice?.site_name],
    ["Invoice Amount", invoice ? money(total) : null],
    ["Remarks", invoice?.remarks],
    ["Created On", showDate(invoice?.created_at)],
  ];

  async function saveReminder(form) {
    await createReminder(form, { id: invoiceId, invoice_number: invoice?.invoice_number });
    await reloadTasks();
  }

  return (
    <div className="ac-page">
      <div className="ac-crumb">
        <button type="button" onClick={() => navigate("/accountant/invoices/list")}>Invoices</button>
        {" / "}{dash(invoice?.invoice_number)}
      </div>

      <DataError error={error} onRetry={() => setAttempt((n) => n + 1)} />

      <div className="ac-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 className="ac-title">{dash(invoice?.invoice_number)}</h2>
          {invoice && <Badge value={status} />}
        </div>
        <div className="ac-actions">
          <button type="button" className="ac-btn ac-btn-primary" disabled={!invoice || pending <= 0 || status === "CANCELLED"}
            onClick={() => navigate("/accountant/payments/record", { state: { customerId: invoice.customer_id } })}>
            <FiPlusCircle /> Record Payment
          </button>
          <button type="button" className="ac-btn" disabled={!invoice} onClick={() => setReminderOpen(true)}>
            <FiCheckSquare /> Add Task
          </button>
          <button type="button" className="ac-btn" disabled title="No phone number is stored for customers"><FiPhone /> Call Customer</button>
        </div>
      </div>

      <div className="ac-stats">
        <div className="ac-stat blue"><div className="ac-stat-label">Invoice Amount</div><div className="ac-stat-value">{invoice ? money(total) : "—"}</div></div>
        <div className="ac-stat green"><div className="ac-stat-label">Paid Amount</div><div className="ac-stat-value">{invoice ? money(paid) : "—"}</div></div>
        <div className="ac-stat orange"><div className="ac-stat-label">Pending Amount</div><div className="ac-stat-value">{invoice ? money(pending) : "—"}</div></div>
        <div className="ac-stat red"><div className="ac-stat-label">Due Date</div><div className="ac-stat-value">{dash(showDate(invoice?.due_date))}</div></div>
      </div>

      <div className="ac-detail-grid">
        <div className="ac-card">
          <h3 className="ac-card-title">Invoice Information</h3>
          <dl className="ac-kv">
            {info.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{dash(v)}</dd></div>
            ))}
          </dl>
          <p className="ac-sub" style={{ marginTop: 14 }}>No invoice file attached</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ac-card">
            <h3 className="ac-card-title">Payment History</h3>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead><tr><th>Date</th><th className="ac-num">Amount</th><th>Mode</th><th>UTR No</th><th>Received By</th></tr></thead>
                <tbody>
                  {payments.length ? payments.map((p) => (
                    <tr key={p.id}>
                      <td>{showDate(p.date)}</td><td className="ac-num">{money(p.amount)}</td><td>{p.mode}</td>
                      <td>{dash(p.reference)}</td><td>{dash(p.received_by)}</td>
                    </tr>
                  )) : <EmptyRow cols={5} text="No payments recorded" />}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ac-card">
            <h3 className="ac-card-title">Follow-up History</h3>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead><tr><th>Due</th><th>Action</th><th>Remarks</th><th>Status</th></tr></thead>
                <tbody>
                  {followUps.length ? followUps.map((f) => (
                    <tr key={f.id}>
                      <td>{showDate(f.due_date)}{f.due_time && <div className="ac-sub">{f.due_time}</div>}</td>
                      <td>{f.task_type}</td>
                      <td>{dash(f.notes)}</td>
                      <td><Badge value={f.display_status} /></td>
                    </tr>
                  )) : <EmptyRow cols={4} text="No follow-ups yet" />}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <SetReminderModal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        invoices={invoice ? [{ id: invoiceId, invoice_number: invoice.invoice_number }] : []}
        defaultInvoiceId={invoiceId}
        onSave={saveReminder}
      />
    </div>
  );
}
