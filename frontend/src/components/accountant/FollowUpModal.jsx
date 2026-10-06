import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCalendar, FiX } from "react-icons/fi";
import DateInput from "./DateInput";
import { money } from "../../pages/accountant/format";
import { byDue, followUpIndex, groupByCustomer, showDate, todayYmd } from "../../pages/accountant/data";
import { createFollowUp, showDue } from "../../pages/accountant/followups";
import "../../pages/accountant/accountant.css";

const PRIORITIES = [["LOW", "Low"], ["NORMAL", "Normal"], ["HIGH", "High"]];

// Create Payment Follow-up dialog. The follow-up is always assigned to the logged-in accountant.
//   invoices / followUps: the lists from useAccountantData()
//   customerId:  customer to start with (lockCustomer: true shows it read-only)
//   invoiceId:   start on "Specific Invoice" with this invoice picked
//   invoiceIds:  several invoices at once (Outstanding's bulk action) -- one follow-up per invoice
//   onCreated(): called after saving (the dialog then closes itself)
// Mount it with a `key` that changes per use, so it starts fresh each time it opens.
export default function FollowUpModal({
  open, onClose, onCreated, invoices = [], followUps = [],
  customerId = "", invoiceId = "", invoiceIds = [], lockCustomer = false,
}) {
  const navigate = useNavigate();
  const bulk = invoiceIds.length > 1;
  const [form, setForm] = useState(() => ({
    customer: customerId || invoices.find((i) => i.id === invoiceId)?.customer_id || "",
    scope: invoiceId || bulk ? "INVOICE" : "CUSTOMER",
    invoice: invoiceId,
    date: "",
    time: "10:00",
    priority: "NORMAL",
    notes: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const live = useMemo(() => invoices.filter((i) => i.status !== "CANCELLED"), [invoices]);
  const customers = useMemo(
    () => groupByCustomer(live).filter((c) => c.outstanding > 0 || c.id === form.customer).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [live, form.customer]
  );
  const index = useMemo(() => followUpIndex(followUps), [followUps]);
  if (!open) return null;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const customer = customers.find((c) => c.id === form.customer) || null;
  const unpaid = live.filter((i) => i.customer_id === form.customer && i.pending_amount > 0).sort((a, b) => byDue(
    { due_date: a.due_date || a.invoice_date }, { due_date: b.due_date || b.invoice_date }
  ));
  const invoice = unpaid.find((i) => i.id === form.invoice) || live.find((i) => i.id === form.invoice) || null;

  // Bulk: invoices that already have an open follow-up of their own are skipped.
  const bulkTargets = bulk ? live.filter((i) => invoiceIds.includes(i.id)) : [];
  const bulkNew = bulkTargets.filter((i) => !index.byInvoice.has(i.id));

  const existing = bulk ? null : form.scope === "CUSTOMER" ? index.byCustomer.get(form.customer) : index.byInvoice.get(form.invoice);

  function problem() {
    if (!bulk && !customer) return "Please select a customer.";
    if (!bulk && form.scope === "INVOICE" && !invoice) return "Please select an invoice.";
    if (bulk && !bulkNew.length) return "Every selected invoice already has an open follow-up.";
    if (!form.date) return "Please choose the next follow-up date.";
    if (form.date < todayYmd()) return "The follow-up date can't be in the past.";
    if (!form.time) return "Please choose a time.";
    return "";
  }

  async function submit(e) {
    e.preventDefault();
    const message = problem();
    if (message) return setError(message);
    setSaving(true);
    setError("");
    try {
      const common = { date: form.date, time: form.time, priority: form.priority, notes: form.notes };
      if (bulk) {
        for (const inv of bulkNew) {
          await createFollowUp({ ...common, scope: "INVOICE", customer: { id: inv.customer_id, name: inv.customer_name }, invoice: inv });
        }
      } else {
        await createFollowUp({ ...common, scope: form.scope, customer, invoice });
      }
      await onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || "The follow-up could not be created. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const close = () => !saving && onClose();

  return (
    <div className="ac-overlay" onMouseDown={close}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>Create Payment Follow-up</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={close}><FiX /></button>
        </div>

        {error && (
          <div className="ac-info error" style={{ marginBottom: 12 }} role="alert">
            <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
          </div>
        )}

        <div className="ac-fu-form">
          {bulk ? (
            <div className="ac-note info">
              One follow-up will be created for each of the {bulkNew.length} selected invoice{bulkNew.length === 1 ? "" : "s"}
              {bulkTargets.length > bulkNew.length ? ` (${bulkTargets.length - bulkNew.length} already have one and will be skipped)` : ""}.
            </div>
          ) : (
            <>
              <div className="ac-field">
                <label>Customer</label>
                {lockCustomer && customer ? (
                  <div className="ac-fu-readonly">{customer.name}{customer.code ? ` (${customer.code})` : ""}</div>
                ) : (
                  <select className="ac-select" value={form.customer}
                    onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value, invoice: "" }))}>
                    <option value="">Select customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
                  </select>
                )}
              </div>

              {customer && (
                <div className="ac-fu-stats">
                  <div><span>Outstanding Amount</span><strong className="red">{money(customer.outstanding)}</strong></div>
                  <div><span>Pending Invoices</span><strong>{customer.unpaid_count} invoice{customer.unpaid_count === 1 ? "" : "s"}</strong></div>
                </div>
              )}

              <div className="ac-field">
                <label>Follow-up For</label>
                <div className="ac-radio-row">
                  <label className="ac-radio">
                    <input type="radio" name="fu-scope" checked={form.scope === "CUSTOMER"} onChange={() => set("scope")("CUSTOMER")} />
                    Entire Customer Outstanding
                  </label>
                  <label className="ac-radio">
                    <input type="radio" name="fu-scope" checked={form.scope === "INVOICE"} onChange={() => set("scope")("INVOICE")} />
                    Specific Invoice
                  </label>
                </div>
              </div>

              {form.scope === "INVOICE" && (
                <>
                  <div className="ac-field">
                    <label>Select Invoice *</label>
                    <select className="ac-select" value={form.invoice} onChange={(e) => set("invoice")(e.target.value)} disabled={!customer}>
                      <option value="">{customer ? "Select invoice" : "Select a customer first"}</option>
                      {unpaid.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} - Pending {money(i.pending_amount)}</option>)}
                    </select>
                  </div>
                  {invoice && (
                    <div className="ac-fu-stats three">
                      <div><span>Invoice Amount</span><strong>{money(invoice.invoice_amount)}</strong></div>
                      <div><span>Paid Amount</span><strong>{money(invoice.paid_amount)}</strong></div>
                      <div><span>Pending Amount</span><strong className="red">{money(invoice.pending_amount)}</strong></div>
                    </div>
                  )}
                </>
              )}

              {existing && (
                <div className="ac-fu-exists" role="status">
                  <FiCalendar />
                  <div>
                    <strong>An open follow-up already exists</strong>
                    <span>Next follow-up: {showDue(existing.due_date, existing.due_time)}{existing.assigned_to_name ? ` · ${existing.assigned_to_name}` : ""}</span>
                  </div>
                  <button type="button" className="ac-btn" onClick={() => { onClose(); navigate(`/accountant/follow-ups/${existing.id}`); }}>Open Follow-up</button>
                </div>
              )}
            </>
          )}

          <div className="ac-grid-2">
            <div className="ac-field">
              <label>Next Follow-up Date *</label>
              <DateInput value={form.date} onChange={set("date")} ariaLabel="Next follow-up date" />
            </div>
            <div className="ac-field">
              <label>Time *</label>
              <input className="ac-input" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} aria-label="Follow-up time" />
            </div>
          </div>
          {form.date && form.date < todayYmd() && <div className="ac-note" style={{ color: "#b91c1c" }}>Pick today or a later date (not {showDate(form.date)}).</div>}

          <div className="ac-field">
            <label>Priority</label>
            <select className="ac-select" value={form.priority} onChange={(e) => set("priority")(e.target.value)}>
              {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="ac-field">
            <label>Notes (optional)</label>
            <textarea className="ac-textarea" value={form.notes} maxLength={2000} onChange={(e) => set("notes")(e.target.value)}
              placeholder="e.g. Customer asked to call back about the pending amount" />
          </div>
        </div>

        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={close} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving || Boolean(existing)}>
            {saving ? "Creating…" : bulk ? `Create ${bulkNew.length || ""} Follow-up${bulkNew.length === 1 ? "" : "s"}` : "Create Follow-up"}
          </button>
        </div>
      </form>
    </div>
  );
}
