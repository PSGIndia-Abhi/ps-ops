import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCalendar, FiRepeat, FiX } from "react-icons/fi";
import DateInput from "./DateInput";
import { money } from "../../pages/accountant/format";
import { byDue, followUpIndex, groupByCustomer, showDate, todayYmd } from "../../pages/accountant/data";
import { createFollowUp, REPEATS, repeatText, showDue } from "../../pages/accountant/followups";
import "../../pages/accountant/accountant.css";

const PRIORITIES = [["LOW", "Low"], ["NORMAL", "Normal"], ["HIGH", "High"]];

// Create Payment Reminder dialog. The reminder is always assigned to the logged-in accountant.
//   invoices / followUps: the lists from useAccountantData()
//   customerId:  customer to start with (lockCustomer: true shows it read-only)
//   invoiceId / invoiceIds: start on "Specific Invoice" with these invoices ticked
//   onCreated(): called after saving (the dialog then closes itself)
// "Specific Invoice": tick one or several of the customer's unpaid invoices; each ticked
// invoice gets its own reminder (same date, time, priority and notes).
// Mount it with a `key` that changes per use, so it starts fresh each time it opens.
export default function FollowUpModal({
  open, onClose, onCreated, invoices = [], followUps = [],
  customerId = "", invoiceId = "", invoiceIds = [], lockCustomer = false, title = "Create Payment Reminder",
}) {
  const navigate = useNavigate();
  const startPicks = invoiceIds.length ? invoiceIds : invoiceId ? [invoiceId] : [];
  const [form, setForm] = useState(() => ({
    customer: customerId || invoices.find((i) => i.id === startPicks[0])?.customer_id || "",
    scope: startPicks.length ? "INVOICE" : "CUSTOMER",
    picks: startPicks,
    repeat: "ONCE",
    endDate: "",
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
  // Ticked invoices that don't already have an open reminder of their own.
  const picked = unpaid.filter((i) => form.picks.includes(i.id) && !index.byInvoice.has(i.id));
  const pickedPending = picked.reduce((s, i) => s + i.pending_amount, 0);
  const existing = form.scope === "CUSTOMER" ? index.byCustomer.get(form.customer) : null;

  const togglePick = (id) => setForm((f) => ({ ...f, picks: f.picks.includes(id) ? f.picks.filter((x) => x !== id) : [...f.picks, id] }));

  function problem() {
    if (!customer) return "Please select a customer.";
    if (form.scope === "INVOICE" && !picked.length) return "Please tick at least one invoice.";
    if (!form.date) return form.repeat !== "ONCE" ? "Please choose the start date." : "Please choose the next reminder date.";
    if (form.date < todayYmd()) return "The reminder date can't be in the past.";
    if (!form.time) return "Please choose a time.";
    if (form.repeat !== "ONCE" && form.endDate && form.endDate < form.date) return "The end date can't be before the start date.";
    return "";
  }

  async function submit(e) {
    e.preventDefault();
    const message = problem();
    if (message) return setError(message);
    setSaving(true);
    setError("");
    try {
      const common = { date: form.date, time: form.time, priority: form.priority, notes: form.notes, repeat: form.repeat, endDate: form.repeat !== "ONCE" ? form.endDate : "" };
      if (form.scope === "INVOICE") {
        for (const inv of picked) await createFollowUp({ ...common, scope: "INVOICE", customer, invoice: inv });
      } else {
        await createFollowUp({ ...common, scope: "CUSTOMER", customer });
      }
      await onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message || "The reminder could not be created. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const close = () => !saving && onClose();
  const count = form.scope === "INVOICE" ? picked.length : 1;
  const repeating = form.repeat !== "ONCE";

  return (
    <div className="ac-overlay" onMouseDown={close}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>{title}</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={close}><FiX /></button>
        </div>

        {error && (
          <div className="ac-info error" style={{ marginBottom: 12 }} role="alert">
            <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
          </div>
        )}

        <div className="ac-fu-form">
          <div className="ac-field">
            <label>Customer</label>
            {lockCustomer && customer ? (
              <div className="ac-fu-readonly">{customer.name}{customer.code ? ` (${customer.code})` : ""}</div>
            ) : (
              <select className="ac-select" value={form.customer}
                onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value, picks: [] }))}>
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
            <label>Reminder For</label>
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
            <div className="ac-field">
              <label>Select Invoices * <span className="ac-sub" style={{ fontWeight: 400 }}>(tick one or more)</span></label>
              {!customer ? (
                <div className="ac-fu-readonly" style={{ fontWeight: 400 }}>Select a customer first</div>
              ) : unpaid.length ? (
                <ul className="ac-pick-list">
                  {unpaid.map((i) => {
                    const has = index.byInvoice.get(i.id);
                    return (
                      <li key={i.id}>
                        <label className={has ? "disabled" : ""}>
                          <input type="checkbox" disabled={Boolean(has)} checked={!has && form.picks.includes(i.id)} onChange={() => togglePick(i.id)} />
                          <span className="ac-pick-main">
                            <strong>{i.invoice_number}</strong>
                            <span>{has ? `Reminder set · ${showDue(has.due_date, has.due_time)}` : `Due ${showDate(i.due_date) || "—"}`}</span>
                          </span>
                          <span className="ac-pick-amt">{money(i.pending_amount)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="ac-fu-readonly" style={{ fontWeight: 400 }}>No unpaid invoices</div>
              )}
              {picked.length === 1 && (
                <div className="ac-fu-stats three" style={{ marginTop: 8 }}>
                  <div><span>Invoice Amount</span><strong>{money(picked[0].invoice_amount)}</strong></div>
                  <div><span>Paid Amount</span><strong>{money(picked[0].paid_amount)}</strong></div>
                  <div><span>Pending Amount</span><strong className="red">{money(picked[0].pending_amount)}</strong></div>
                </div>
              )}
              {picked.length > 1 && (
                <div className="ac-note info" style={{ marginTop: 8 }}>
                  {picked.length} invoices selected · {money(pickedPending)} pending. One reminder is created for each.
                </div>
              )}
            </div>
          )}

          {existing && (
            <div className="ac-fu-exists" role="status">
              <FiCalendar />
              <div>
                <strong>An open reminder already exists</strong>
                <span>Next reminder: {showDue(existing.due_date, existing.due_time)}{existing.assigned_to_name ? ` · ${existing.assigned_to_name}` : ""}</span>
              </div>
              <button type="button" className="ac-btn" onClick={() => { onClose(); navigate(`/accountant/follow-ups/${existing.id}`); }}>Open Reminder</button>
            </div>
          )}

          <div className="ac-field">
            <label>Repeat</label>
            <select className="ac-select" value={form.repeat} onChange={(e) => set("repeat")(e.target.value)} aria-label="Repeat">
              {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="ac-grid-2">
            <div className="ac-field">
              <label>{repeating ? "Start Date *" : "Next Reminder Date *"}</label>
              <DateInput value={form.date} onChange={set("date")} ariaLabel="Next reminder date" />
            </div>
            <div className="ac-field">
              <label>Time *</label>
              <input className="ac-input" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} aria-label="Reminder time" />
            </div>
          </div>
          {form.date && form.date < todayYmd() && <div className="ac-note" style={{ color: "#b91c1c" }}>Pick today or a later date (not {showDate(form.date)}).</div>}
          {repeating && (
            <div className="ac-field">
              <label>End Date (optional)</label>
              <DateInput value={form.endDate} onChange={set("endDate")} ariaLabel="Repeat end date" />
            </div>
          )}
          {repeating && (
            <div className="ac-note info">
              <FiRepeat /> {form.date && form.time
                ? `${repeatText(form)}, from ${showDate(form.date)}${form.endDate ? ` to ${showDate(form.endDate)}` : " until you complete or stop it"}. It stays one reminder: you are alerted each time and no new reminder is made.`
                : "Choose the start date and time: it repeats on that day."}
            </div>
          )}

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
            {saving ? "Creating…" : count > 1 ? `Create ${count} Reminders` : "Create Reminder"}
          </button>
        </div>
      </form>
    </div>
  );
}
