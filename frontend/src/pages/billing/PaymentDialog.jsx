import { useState } from "react";
import { FiUploadCloud, FiX } from "react-icons/fi";
import { billingUpload } from "./billingApi";
import { rupees, today } from "./format";
import { Field, Modal, Msg } from "./ui";
import { PAY_MODES } from "./payModes";

// Record a payment received against an issued invoice (part payments allowed). What is asked
// follows how it was paid: the UTR for NEFT / RTGS / IMPS / UPI, the cheque or DD number, date and
// bank for a cheque or DD, and a typed description for "Other". TDS deducted by the customer and a
// proof file (receipt, screenshot, cheque photo) are optional.

const REF = ["NEFT", "RTGS", "IMPS", "UPI"];
const INSTRUMENT = ["CHEQUE", "DD"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function PaymentDialog({ invoice, balance, onClose, onSaved }) {
  const [f, setF] = useState({ amount: String(balance || ""), tds_amount: "", paid_on: today(), mode: "NEFT", mode_other: "", reference_no: "", cheque_no: "", cheque_date: "", bank_name: "", received_in: "", remarks: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const settles = (Number(f.amount) || 0) + (Number(f.tds_amount) || 0);
  const left = Math.max(0, Math.round((balance - settles) * 100) / 100);
  const isRef = REF.includes(f.mode);
  const isInst = INSTRUMENT.includes(f.mode);

  function pickFile(e) {
    const picked = e.target.files?.[0] || null;
    e.target.value = "";
    if (!picked) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(picked.type)) { setError("The proof must be a PDF, JPG or PNG"); return; }
    if (picked.size > MAX_BYTES) { setError("The proof file is too large (max 5 MB)"); return; }
    setError("");
    setFile(picked);
  }

  async function save() {
    if (settles <= 0) { setError("Enter the amount received"); return; }
    if (settles > balance + 0.005) { setError(`That is more than the balance of ${rupees(balance)}`); return; }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => { if (v !== "" && v !== null) fd.append(k, v); });
      if (file) fd.append("proof", file);
      await billingUpload(`/invoices/${invoice.id}/payments`, fd);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={() => !busy && onClose()} label="Record payment">
      <div className="bl-m-head">
        <div style={{ flex: 1 }}>
          <h3>Record payment</h3>
          <div className="ac-sub">{invoice.invoice_number} · {invoice.customer} · balance <b>{rupees(balance)}</b></div>
        </div>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="bl-m-body">
        <div className="pd-modes" role="group" aria-label="How it was paid">
          {PAY_MODES.map(([v, l]) => (
            <button key={v} type="button" className={f.mode === v ? "active" : ""} aria-pressed={f.mode === v} onClick={() => set({ mode: v })}>{l}</button>
          ))}
        </div>
        <div className="bl-grid pd-grid">
          {f.mode === "OTHER" && (
            <Field label="How it was paid" required className="bl-span2">
              <input className="ac-input" autoFocus value={f.mode_other} maxLength={60} placeholder="e.g. Adjusted against credit note, Paid to field staff…" onChange={(e) => set({ mode_other: e.target.value })} />
            </Field>
          )}
          <Field label="Amount received (₹)" required>
            <input type="number" min="0" step="0.01" className="ac-input" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="TDS deducted (₹)" hint="If the customer paid less and deducted TDS">
            <input type="number" min="0" step="0.01" className="ac-input" value={f.tds_amount} placeholder="0" onChange={(e) => set({ tds_amount: e.target.value })} />
          </Field>
          <Field label="Payment date" required>
            <input type="date" className="ac-input" value={f.paid_on} max={today()} onChange={(e) => set({ paid_on: e.target.value })} />
          </Field>
          {isRef ? (
            <Field label="UTR / transaction ID" required>
              <input className="ac-input" value={f.reference_no} maxLength={60} placeholder={f.mode === "UPI" ? "UPI ref. no." : "e.g. HDFCN52026112012345"} onChange={(e) => set({ reference_no: e.target.value.trim() })} />
            </Field>
          ) : !isInst && (
            <Field label="Reference" hint="Receipt no. or any reference (optional)">
              <input className="ac-input" value={f.reference_no} maxLength={60} onChange={(e) => set({ reference_no: e.target.value })} />
            </Field>
          )}
          {isInst && (
            <>
              <Field label={f.mode === "DD" ? "DD number" : "Cheque number"} required>
                <input className="ac-input" value={f.cheque_no} maxLength={30} onChange={(e) => set({ cheque_no: e.target.value })} />
              </Field>
              <Field label={f.mode === "DD" ? "DD date" : "Cheque date"} required>
                <input type="date" className="ac-input" value={f.cheque_date} onChange={(e) => set({ cheque_date: e.target.value })} />
              </Field>
              <Field label="Bank" required className="bl-span2">
                <input className="ac-input" value={f.bank_name} maxLength={100} placeholder="Customer's bank, e.g. SBI, Jayanagar" onChange={(e) => set({ bank_name: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Received in" hint="Our account it came into (optional)">
            <input className="ac-input" value={f.received_in} maxLength={100} placeholder="e.g. HDFC current a/c" onChange={(e) => set({ received_in: e.target.value })} />
          </Field>
          <Field label="Remarks">
            <input className="ac-input" value={f.remarks} maxLength={500} placeholder="Optional" onChange={(e) => set({ remarks: e.target.value })} />
          </Field>
          <Field label="Proof" className="bl-span2" hint="Receipt, payment screenshot or cheque photo - PDF, JPG or PNG, up to 5 MB (optional)">
            {file ? (
              <div className="pd-file"><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><button type="button" className="sos-rm" onClick={() => setFile(null)} aria-label="Remove file"><FiX /></button></div>
            ) : (
              <label className="pd-drop"><FiUploadCloud /><span>Choose a file</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} /></label>
            )}
          </Field>
        </div>
        <div className={`pd-after ${left <= 0.005 && settles > 0 ? "paid" : ""}`}>
          {settles > balance + 0.005 ? `More than the balance of ${rupees(balance)}`
            : settles > 0 ? (left <= 0.005 ? "✓ This settles the invoice in full" : `Balance after this payment: ${rupees(left)} (part payment)`)
              : "Enter the amount received"}
        </div>
        <Msg error={error} />
      </div>
      <div className="bl-m-foot">
        <span />
        <div className="ac-actions">
          <button type="button" className="ac-btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save payment"}</button>
        </div>
      </div>
    </Modal>
  );
}
