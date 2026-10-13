import { useState } from "react";
import { FiAlertCircle, FiInfo, FiX } from "react-icons/fi";
import DateInput from "./DateInput";
import { todayYmd } from "../../pages/accountant/data";
import { OUTCOMES, recordOutcome } from "../../pages/accountant/followups";
import "../../pages/accountant/accountant.css";

// Update Follow-up (after the call): the call outcome, an optional/required next
// follow-up date, and remarks. The outcome is saved on the same task as a progress
// update; a new date reschedules that same task (no new task is created).
//   task: the follow-up (cleaned, see cleanFollowUp)
//   onSaved({ outcome, rescheduled }): called after saving
export default function FollowUpOutcomeModal({ task, onClose, onSaved }) {
  const [form, setForm] = useState({ outcome: "", date: "", time: task?.due_time || "10:00", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!task) return null;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const outcome = OUTCOMES.find((o) => o.key === form.outcome);
  const askDate = outcome && outcome.date;
  const willReschedule = Boolean(askDate && form.date);

  function problem() {
    if (!outcome) return "Please choose the call outcome.";
    if (outcome.date === "required" && !form.date) return "Please choose the next follow-up date.";
    if (form.date && form.date < todayYmd()) return "The next follow-up date can't be in the past.";
    if (form.date && !form.time) return "Please choose a time for the next follow-up.";
    return "";
  }

  async function submit(e) {
    e.preventDefault();
    const message = problem();
    if (message) return setError(message);
    setSaving(true);
    setError("");
    try {
      const result = await recordOutcome(task, {
        outcome: form.outcome,
        notes: form.notes,
        date: askDate ? form.date : "",
        time: askDate ? form.time : "",
      });
      await onSaved?.({ outcome: form.outcome, ...result });
    } catch (err) {
      setError(err.message || "The update could not be saved. Please try again.");
      setSaving(false);
    }
  }

  const close = () => !saving && onClose();

  return (
    <div className="ac-overlay" onMouseDown={close}>
      <form className="ac-modal ac-fu-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="ac-fu-modal-head">
          <h3>Update Follow-up</h3>
          <button type="button" className="ac-link" aria-label="Close" onClick={close}><FiX /></button>
        </div>

        {error && (
          <div className="ac-info error" style={{ marginBottom: 12 }} role="alert">
            <FiAlertCircle style={{ flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
          </div>
        )}

        <div className="ac-fu-form">
          <div className="ac-field">
            <label>Call Outcome *</label>
            <div className="ac-radio-col">
              {OUTCOMES.map((o) => (
                <label key={o.key} className="ac-radio">
                  <input type="radio" name="fu-outcome" checked={form.outcome === o.key} onChange={() => set("outcome")(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          {form.outcome === "PAYMENT_RECEIVED" && (
            <div className="ac-note info">
              <FiInfo /> After saving, Record Payment opens for this customer. The follow-up closes by itself once the outstanding is cleared.
            </div>
          )}

          {askDate && (
            <div className="ac-grid-2">
              <div className="ac-field">
                <label>Next Follow-up Date{askDate === "required" ? " *" : ""}</label>
                <DateInput value={form.date} onChange={set("date")} ariaLabel="Next follow-up date" />
              </div>
              <div className="ac-field">
                <label>Time{form.date ? " *" : ""}</label>
                <input className="ac-input" type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} aria-label="Next follow-up time" />
              </div>
            </div>
          )}

          <div className="ac-field">
            <label>Notes / Remarks</label>
            <textarea className="ac-textarea" value={form.notes} maxLength={1500} onChange={(e) => set("notes")(e.target.value)}
              placeholder="What did the customer say?" />
          </div>
        </div>

        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" onClick={close} disabled={saving}>Cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary" disabled={saving}>
            {saving ? "Saving…" : willReschedule ? "Save & Reschedule" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
