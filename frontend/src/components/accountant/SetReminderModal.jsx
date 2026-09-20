import { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";
import "../../pages/accountant/accountant.css";

const TASK_TYPES = ["Payment Follow-up", "Call Customer", "Send Invoice", "Send Reminder", "Other"];
const PRIORITIES = ["Low", "Normal", "High"];

const blank = (invoiceId) => ({
  related_to: "Invoice",
  invoice_id: invoiceId || "",
  task_type: TASK_TYPES[0],
  date: "",
  time: "",
  priority: "Normal",
  notes: "",
});

// Set Reminder dialog.
//   invoices: options for the Invoice dropdown ({ id, invoice_number })
//   defaultInvoiceId: invoice to pre-select
//   note: optional line shown under the title (e.g. "This will be added to 3 invoices")
//   onSave(form): saves the reminder; return a promise. If it throws, the message is shown and the dialog stays open.
export default function SetReminderModal({ open, onClose, onSave, invoices = [], defaultInvoiceId = "", note = "" }) {
  const [form, setForm] = useState(() => blank(defaultInvoiceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Until the user picks one, the pre-selected invoice is used.
  const invoiceId = form.invoice_id || defaultInvoiceId;

  function close() {
    setForm(blank(defaultInvoiceId));
    setError("");
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave?.({ ...form, invoice_id: invoiceId });
      close();
    } catch (err) {
      setError(err.message || "The reminder could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-overlay" onMouseDown={close}>
      <form className="ac-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Set Reminder</h3>
        {note && <p className="ac-sub" style={{ marginTop: -8, marginBottom: 12 }}>{note}</p>}

        {error && (
          <div className="ac-info error" style={{ marginBottom: 12 }}>
            <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ac-grid-2">
            <div className="ac-field">
              <label>Related To</label>
              <select className="ac-select" value={form.related_to} onChange={set("related_to")}>
                <option>Invoice</option>
              </select>
            </div>
            <div className="ac-field">
              <label>Invoice</label>
              <select className="ac-select" value={invoiceId} onChange={set("invoice_id")} required>
                <option value="">Select invoice</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.invoice_number}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-field">
              <label>Task Type</label>
              <select className="ac-select" value={form.task_type} onChange={set("task_type")}>
                {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="ac-field">
              <label>Assign To</label>
              <select className="ac-select" value="" disabled>
                <option value="">Myself</option>
              </select>
            </div>
          </div>

          <div className="ac-grid-2">
            <div className="ac-field">
              <label>Reminder Date</label>
              <input className="ac-input" type="date" value={form.date} onChange={set("date")} required />
            </div>
            <div className="ac-field">
              <label>Time</label>
              <input className="ac-input" type="time" value={form.time} onChange={set("time")} />
            </div>
          </div>

          <div className="ac-field">
            <label>Priority</label>
            <select className="ac-select" value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div className="ac-field">
            <label>Notes / Remarks</label>
            <textarea className="ac-textarea" value={form.notes} onChange={set("notes")} placeholder="Add a note for this reminder" />
          </div>
        </div>

        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={close} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}>{saving ? "Saving…" : "Set Reminder"}</button>
        </div>
      </form>
    </div>
  );
}
