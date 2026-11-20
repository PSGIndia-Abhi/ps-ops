import { useState } from "react";
import { billingPost } from "./billingApi";
import { amount } from "./format";
import { Modal, Msg } from "./ui";

// Cancel an issued invoice (reason required). Used by Issued Invoices and the invoice page.
// invoice: { id, invoice_number, customer, total }

export default function CancelDialog({ invoice, onClose, onDone }) {
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
