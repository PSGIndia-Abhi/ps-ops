import { useEffect, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { ACTIONS, PRIORITIES, PRIORITY, RAISE_ACTIONS, endOfDay } from "./feedbackApi";
import { ErrorBox, Modal } from "./ui";

/**
 * Raise a ticket for a problem the customer reported. A new ticket reaches every operations
 * manager and admin, so there is no owner to pick here.
 * onSubmit(ticket) gets the API's ticket fields { issue_summary, visit_id, priority, action,
 * action_due_at, action_note } and returns a promise. The collector ticks services (each service
 * once, from the month's visits); the ticket stores one visit - the first visit of the first ticked
 * service (its technician) - and all ticked services are listed in the problem text.
 */
export default function RaiseTicketModal({ title, visits, suggested, defaultSummary, submitLabel = "Raise ticket", note, onSubmit, onClose }) {
  const [form, setForm] = useState({
    issue_summary: defaultSummary || "",
    priority: suggested || "MEDIUM",
    action: "SCHEDULE_REVISIT", // the visit itself is booked on the ticket page
    due: "",
    action_note: "",
  });
  // each service once, in visit date order
  const services = [...new Set(visits.map((v) => v.service).filter(Boolean))];
  const [picked, setPicked] = useState(() => (services.length === 1 ? [services[0]] : []));
  const [menuOpen, setMenuOpen] = useState(false);
  const pickRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const closesNow = form.action === "RESOLVED_ON_CALL";
  const isOther = form.action === "OTHER";
  const chosenServices = services.filter((s) => picked.includes(s)); // in visit order
  const chosen = visits.filter((v) => picked.includes(v.service));
  const technicians = [...new Set(chosen.map((v) => v.technicians).filter(Boolean))].join(", ");

  function toggle(service) {
    setPicked((p) => (p.includes(service) ? p.filter((x) => x !== service) : [...p, service]));
  }

  // close the services list on a click outside it or Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (pickRef.current && !pickRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  async function submit() {
    if (isOther && !form.action_note.trim()) {
      setError("Type what will be done for Other");
      return;
    }
    setSaving(true);
    setError("");
    const summary = form.issue_summary.trim();
    const servicesLine = chosenServices.length > 1 ? `Services: ${chosenServices.join(", ")}` : "";
    try {
      await onSubmit({
        issue_summary: [summary, servicesLine].filter(Boolean).join("\n").slice(0, 500) || null,
        visit_id: visits.find((v) => v.service === chosenServices[0])?.id || null,
        priority: form.priority,
        action: form.action,
        action_due_at: closesNow ? null : endOfDay(form.due),
        action_note: form.action_note.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <span className="fb-small fb-muted fb-spacer">{note}</span>
          <button type="button" className="fb-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="fb-btn fb-btn-danger" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      <label className="fb-field" htmlFor="fb-rt-summary">
        What is the problem? (in the customer's words)
        <textarea id="fb-rt-summary" className="fb-textarea" rows={3} maxLength={500} placeholder="The bad answers are attached to the ticket already" value={form.issue_summary} onChange={set("issue_summary")} />
      </label>

      <div className="fb-form-grid">
        <div className="fb-field">
          <span id="fb-rt-svc-label">Which services?</span>
          {services.length ? (
            <div className="fb-svc-pick" ref={pickRef}>
              <button
                type="button"
                className="fb-select fb-svc-toggle"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-labelledby="fb-rt-svc-label"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span>{chosenServices.length ? chosenServices.join(", ") : "Choose services"}</span>
                <FiChevronDown aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="fb-svc-menu" role="listbox" aria-multiselectable="true" aria-labelledby="fb-rt-svc-label">
                  {services.map((s) => (
                    <label key={s} className={`fb-svc-opt ${picked.includes(s) ? "is-on" : ""}`}>
                      <input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="fb-field-hint">No services this month.</span>
          )}
          <span className="fb-field-hint">
            {chosen.length ? `Technician: ${technicians || "not recorded"}` : "None ticked = not about one particular service."}
          </span>
        </div>
        <label className="fb-field" htmlFor="fb-rt-priority">
          Priority
          <select id="fb-rt-priority" className="fb-select" value={form.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p].label}
                {p === suggested ? " (suggested)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fb-field" role="radiogroup" aria-label="What happens next?">
        What happens next?
        {RAISE_ACTIONS.map((value) => [value, ACTIONS[value]]).map(([value, a]) => (
          <button key={value} type="button" role="radio" aria-checked={form.action === value} className={`fb-radio ${form.action === value ? "is-on" : ""}`} onClick={() => set("action")(value)}>
            <span className="fb-radio-dot" />
            <span>
              <span className="fb-strong">{a.label}</span>
              <br />
              <span className="fb-small fb-muted" style={{ fontWeight: 400 }}>
                {a.hint}
              </span>
            </span>
          </button>
        ))}
      </div>

      {isOther ? (
        <label className="fb-field" htmlFor="fb-rt-note">
          <span>
            What will be done? <span className="fb-req">*</span>
          </span>
          <textarea id="fb-rt-note" className="fb-textarea" rows={3} maxLength={2000} placeholder="e.g. Supervisor to inspect the drains with the customer" value={form.action_note} onChange={set("action_note")} />
        </label>
      ) : (
        <label className="fb-field" htmlFor="fb-rt-note">
          {closesNow ? "What did you tell the customer? (optional)" : "Note for the team (optional)"}
          <input id="fb-rt-note" className="fb-input" maxLength={2000} value={form.action_note} onChange={set("action_note")} />
        </label>
      )}
      {!closesNow && (
        <label className="fb-field" htmlFor="fb-rt-due" style={{ maxWidth: 260 }}>
          Action due by (optional)
          <input id="fb-rt-due" type="date" className="fb-input" value={form.due} onChange={set("due")} />
        </label>
      )}
      {!closesNow && <div className="fb-small fb-muted">The ticket appears in the Tickets list for operations managers and admin.</div>}
    </Modal>
  );
}
