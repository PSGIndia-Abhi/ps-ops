import { createElement, useEffect, useRef, useState } from "react";
import { FiBriefcase, FiCheck, FiChevronDown, FiFileText, FiTool } from "react-icons/fi";
import { ACTIONS, OPERATIONS, PRIORITIES, PRIORITY, RAISE_ACTIONS, departmentHint, endOfDay, formatDay, getCallInvoices, getIssueTypes, getPeople, rupees } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { ErrorBox, Modal } from "./ui";

const deptIcon = (d) => (d.kind === OPERATIONS ? FiTool : d.with_invoices ? FiFileText : FiBriefcase);

/**
 * Raise a ticket for a problem the customer reported. A new ticket reaches every operations
 * manager and admin. Site audit, Supervisor visit and Sales are assigned to one supervisor /
 * salesperson, picked here (action_owner_user_id).
 * onSubmit(ticket) gets the API's ticket fields { issue_summary, visit_id, priority, action,
 * action_due_at, action_note } and returns a promise. The collector ticks services (each service
 * once, from the month's visits); the ticket stores one visit - the first visit of the first ticked
 * service (its technician) - and all ticked services are listed in the problem text.
 */
export default function RaiseTicketModal({ callId, title, visits, suggested, defaultSummary, submitLabel = "Raise ticket", note, onSubmit, onClose }) {
  // Departments: which teams get the ticket (several can be ticked; each has its own section).
  const { departmentList } = useFeedbackAccess();
  const departments = departmentList?.length ? departmentList : [{ kind: OPERATIONS, name: "Operations Team", label: "Operations" }];
  const [depts, setDepts] = useState([OPERATIONS].filter((k) => departments.some((d) => d.kind === k)));
  const forOps = depts.includes(OPERATIONS);
  // The other ticked departments, each with its own part: { issue_summary, priority, invoice_ids }.
  const others = departments.filter((d) => d.kind !== OPERATIONS && depts.includes(d.kind));
  const blankPart = { issue_summary: "", priority: suggested || "MEDIUM", invoice_ids: [] };
  const [parts, setParts] = useState({});
  const partOf = (kind) => parts[kind] || blankPart;
  const setPart = (kind, patch) => setParts((p) => ({ ...p, [kind]: { ...(p[kind] || blankPart), ...patch } }));
  const needInvoices = others.some((d) => d.with_invoices);
  const [invoices, setInvoices] = useState(null);
  useEffect(() => {
    if (!needInvoices || invoices || !callId) return;
    getCallInvoices(callId)
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]));
  }, [needInvoices, invoices, callId]);
  const toggleDept = (kind) => setDepts((d) => (d.includes(kind) ? d.filter((x) => x !== kind) : [...d, kind]));
  // Each department's issues (Feedback Desk › Issues). ticked: { [kind]: { [issueId]: text } }.
  const [issueTypes, setIssueTypes] = useState([]);
  useEffect(() => {
    getIssueTypes()
      .then((d) => setIssueTypes(d.issue_types || []))
      .catch(() => setIssueTypes([]));
  }, []);
  const typesOf = (kind) => issueTypes.filter((t) => t.department === kind);
  const [ticked, setTicked] = useState({});
  const tickedOf = (kind) => ticked[kind] || {};
  const isTicked = (kind, id) => Object.prototype.hasOwnProperty.call(tickedOf(kind), id);
  const toggleIssue = (kind, id) =>
    setTicked((t) => {
      const mine = { ...(t[kind] || {}) };
      if (Object.prototype.hasOwnProperty.call(mine, id)) delete mine[id];
      else mine[id] = "";
      return { ...t, [kind]: mine };
    });
  const issuesBody = (kind) => typesOf(kind).filter((t) => isTicked(kind, t.id)).map((t) => ({ id: t.id, text: null }));
  // Operations: the services list shows when "Services" is ticked (or Operations has no such issue).
  const opsServiceType = typesOf(OPERATIONS).find((t) => t.is_service);
  const showServices = !opsServiceType || isTicked(OPERATIONS, opsServiceType.id);
  const toggleInvoice = (kind, id) => {
    const ids = partOf(kind).invoice_ids;
    setPart(kind, { invoice_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };
  const [form, setForm] = useState({
    issue_summary: defaultSummary || "",
    priority: suggested || "MEDIUM",
    action: "SCHEDULE_REVISIT", // the visit itself is booked on the ticket page
    due: "",
    action_note: "",
    owner: "", // Site audit / Supervisor visit / Sales: the person it is assigned to
  });
  // Who a Site audit, Supervisor visit or Sales step can be assigned to.
  const [people, setPeople] = useState({ supervisors: [], sales: [] });
  useEffect(() => {
    getPeople()
      .then((p) => setPeople({ supervisors: p.supervisors || [], sales: p.sales || [] }))
      .catch(() => {});
  }, []);
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
  const assignMeta = ACTIONS[form.action]?.assign ? ACTIONS[form.action] : null;
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
    if (!depts.length) {
      setError("Choose at least one department");
      return;
    }
    if (forOps && isOther && !form.action_note.trim()) {
      setError("Type what will be done for Other");
      return;
    }
    if (forOps && assignMeta && !form.owner) {
      setError(`Choose the ${assignMeta.who.toLowerCase()} for the ${assignMeta.label.toLowerCase()}`);
      return;
    }
    const noIssue = departments.filter((d) => depts.includes(d.kind)).find((d) => typesOf(d.kind).length && !issuesBody(d.kind).length);
    if (noIssue) {
      setError(`Tick at least one issue for ${noIssue.name}`);
      return;
    }
    const missing = others.find((d) => !typesOf(d.kind).length && !partOf(d.kind).issue_summary.trim());
    if (missing) {
      setError(`Describe the issue for ${missing.name}`);
      return;
    }
    setSaving(true);
    setError("");
    const summary = form.issue_summary.trim();
    const servicesNow = showServices ? chosenServices : [];
    const servicesLine = servicesNow.length > 1 ? `Services: ${servicesNow.join(", ")}` : "";
    const ops = forOps
      ? {
          issue_summary: [summary, servicesLine].filter(Boolean).join("\n").slice(0, 500) || null,
          visit_id: visits.find((v) => v.service === servicesNow[0])?.id || null,
          priority: form.priority,
          action: form.action,
          action_due_at: closesNow ? null : endOfDay(form.due),
          action_note: form.action_note.trim() || null,
          ...(assignMeta ? { action_owner_user_id: Number(form.owner) } : {}),
        }
      : {};
    const partBody = Object.fromEntries(
      others.map((d) => {
        const p = partOf(d.kind);
        return [d.kind, { issue_summary: p.issue_summary.trim(), issues: issuesBody(d.kind), priority: p.priority, invoice_ids: d.with_invoices ? p.invoice_ids : [] }];
      }),
    );
    if (forOps) partBody[OPERATIONS] = { issues: issuesBody(OPERATIONS) };
    try {
      await onSubmit({ departments: depts, ...ops, parts: partBody });
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
      <div className="fb-field">
        <span>
          Departments <span className="fb-req">*</span> <span className="fb-small fb-muted">(choose one or more)</span>
        </span>
        <div className="fb-dept-pick" role="group" aria-label="Departments">
          {departments.map((d) => {
            const on = depts.includes(d.kind);
            const Icon = deptIcon(d);
            return (
              <button key={d.kind} type="button" className={`fb-dept-opt ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => toggleDept(d.kind)}>
                <span className="fb-dept-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="fb-dept-text">
                  <b>{d.name}</b>
                  <small>{departmentHint(d)}</small>
                </span>
                <span className="fb-dept-check" aria-hidden="true">
                  {on && <FiCheck />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {forOps && (
      <section className="fb-rt-sec">
      {departments.length > 1 && <DeptHead d={departments.find((d) => d.kind === OPERATIONS) || { kind: OPERATIONS, name: "Operations" }} />}
      <IssuePicker kind={OPERATIONS} types={typesOf(OPERATIONS)} isTicked={isTicked} onToggle={toggleIssue} />

      <div className={showServices ? "fb-form-grid" : "fb-rt-prio-only"}>
        {showServices ? (
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
        ) : null}
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

      <label className="fb-field" htmlFor="fb-rt-summary">
        {typesOf(OPERATIONS).length ? "Details (in the customer's words)" : "What is the problem? (in the customer's words)"}
        <textarea id="fb-rt-summary" className="fb-textarea" rows={3} maxLength={500} placeholder="The bad answers are attached to the ticket already" value={form.issue_summary} onChange={set("issue_summary")} />
      </label>

      <div className="fb-field" role="radiogroup" aria-label="What happens next?">
        What happens next?
        <div className="fb-radio-grid">
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
      </div>

      {assignMeta && (
        <label className="fb-field" htmlFor="fb-rt-owner" style={{ maxWidth: 420 }}>
          <span>
            Assign to ({assignMeta.who.toLowerCase()}) <span className="fb-req">*</span>
          </span>
          <select id="fb-rt-owner" className="fb-select" value={form.owner} onChange={set("owner")}>
            <option value="">Choose the {assignMeta.who.toLowerCase()}</option>
            {(people[assignMeta.assign] || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role ? ` · ${u.role}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

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
      </section>
      )}

      {others.map((d) => {
        const p = partOf(d.kind);
        const id = `fb-rt-${d.kind.toLowerCase()}`;
        return (
          <section key={d.kind} className="fb-rt-sec">
            <DeptHead d={d} />
            <IssuePicker kind={d.kind} types={typesOf(d.kind)} isTicked={isTicked} onToggle={toggleIssue} />
            <div className="fb-rt-row">
            <label className="fb-field" htmlFor={`${id}-summary`}>
              <span>
                {typesOf(d.kind).length ? (
                  "Details (optional)"
                ) : (
                  <>
                    {d.with_invoices ? "What is the invoice issue?" : `What should ${d.name} look into?`} <span className="fb-req">*</span>
                  </>
                )}
              </span>
              <textarea
                id={`${id}-summary`}
                className="fb-textarea"
                rows={typesOf(d.kind).length ? 1 : 2}
                maxLength={500}
                placeholder={typesOf(d.kind).length ? "What happened - for all the ticked issues" : d.with_invoices ? "e.g. Invoice for October not received, please send a copy" : "Describe the issue for this team"}
                value={p.issue_summary}
                onChange={(e) => setPart(d.kind, { issue_summary: e.target.value })}
              />
            </label>
            <label className="fb-field" htmlFor={`${id}-priority`}>
              Priority
              <select id={`${id}-priority`} className="fb-select" value={p.priority} onChange={(e) => setPart(d.kind, { priority: e.target.value })}>
                {PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {PRIORITY[x].label}
                  </option>
                ))}
              </select>
            </label>
            </div>
            {d.with_invoices && (
              <div className="fb-field">
                <span>Related invoices (optional)</span>
                {!invoices ? (
                  <span className="fb-field-hint">Loading invoices…</span>
                ) : !invoices.length ? (
                  <span className="fb-field-hint">No invoices found for this customer.</span>
                ) : (
                  <div className="fb-inv-list">
                    {invoices.map((i) => (
                      <label key={i.id} className={`fb-inv-opt ${p.invoice_ids.includes(i.id) ? "is-on" : ""}`}>
                        <input type="checkbox" checked={p.invoice_ids.includes(i.id)} onChange={() => toggleInvoice(d.kind, i.id)} />
                        <span className="fb-strong">{i.number}</span>
                        <span className="fb-small fb-muted">{formatDay(i.date)}</span>
                        <span className="fb-small">{rupees(i.amount)}</span>
                        <span className={`fb-small ${i.pending > 0 ? "fb-danger-text" : "fb-muted"}`}>{i.pending > 0 ? `${rupees(i.pending)} due` : "Paid"}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="fb-small fb-muted">{d.name} sees this part and marks it done; then you call the customer back.</div>
          </section>
        );
      })}
    </Modal>
  );
}

/**
 * A department's issues as chips (one or more). One Details box below covers them all; "Services"
 * (Operations) also shows the month's services to pick.
 */
function IssuePicker({ kind, types, isTicked, onToggle }) {
  if (!types.length) return null;
  return (
    <div className="fb-field">
      <span>
        What are the issues? <span className="fb-req">*</span> <span className="fb-small fb-muted">(one or more)</span>
      </span>
      <div className="fb-issue-pick" role="group" aria-label="Issues">
        {types.map((t) => {
          const on = isTicked(kind, t.id);
          return (
            <button key={t.id} type="button" className={`fb-issue-chip ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => onToggle(kind, t.id)}>
              {on && <FiCheck aria-hidden="true" />} {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A department section's header: icon, name and what happens there. */
function DeptHead({ d }) {
  return (
    <div className="fb-rt-sec-head">
      <span className="fb-dept-icon" aria-hidden="true">
        {createElement(deptIcon(d))}
      </span>
      <span>
        <b>{d.name}</b>
        <small>{departmentHint(d)}</small>
      </span>
    </div>
  );
}
