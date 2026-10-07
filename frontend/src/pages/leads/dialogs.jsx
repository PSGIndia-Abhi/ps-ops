// The dialogs that move a lead along: verify a call, schedule a meeting,
// record a visit, close the lead, and add or edit a provider.

import { useMemo, useState } from "react";
import { FiBriefcase, FiCalendar, FiCheck, FiSend, FiThumbsDown, FiThumbsUp } from "react-icons/fi";
import { closeLead, completeVisit, findDuplicates, salesTeam, saveCall, saveProvider, scheduleMeeting, submitLead } from "./leadsApi";
import { REASONS, SOURCES, VISIT_OUTCOMES } from "./mockData";
import { toLocalInput, tomorrowInput } from "./format";
import { useToast } from "./hooks";
import { Button, Field, Modal, Note, StageBadge } from "./ui";
import { useViewer } from "./viewer";

const digits = (text) => text.replace(/\D/g, "").slice(0, 10);
const phoneProblem = (value) => (!value ? "Enter the phone number." : value.length !== 10 ? "Enter a 10-digit number." : !/^[6-9]/.test(value) ? "Mobile numbers start with 6, 7, 8 or 9." : "");

function LeadBar({ lead }) {
  return (
    <div className="lm-leadbar">
      <span className="lm-leadbar-icon">
        <FiBriefcase />
      </span>
      <span className="lm-who-text" style={{ flex: 1 }}>
        <strong>{lead.company}</strong>
        <small>
          {lead.contact} · {lead.phone}
        </small>
      </span>
      <StageBadge stage={lead.stage} />
    </div>
  );
}

/** A choice shown as a row of large radio cards. */
function Choice({ name, value, onChange, options }) {
  return (
    <div className="lm-choice" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={`lm-radio tone-${o.tone || "info"}${value === o.value ? " on" : ""}`}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="lm-radio-mark" />
          <span className="lm-radio-text">
            <strong>{o.label}</strong>
            {!!o.sub && <small>{o.sub}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ lead form */

const BLANK_LEAD = { company: "", contact: "", phone: "", altPhone: "", email: "", address: "", area: "", source: "", quote: "", requirement: "" };

/**
 * The commercial lead form. Used as the provider's "Submit New Lead" page and
 * inside the Add Lead dialog. `onSaved(lead)` runs after a successful save.
 */
export function LeadForm({ onSaved, onCancel, submitLabel = "Submit Lead", fixedSource }) {
  const viewer = useViewer();
  const toast = useToast();
  const [values, setValues] = useState({ ...BLANK_LEAD, source: fixedSource || "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    const value = key === "phone" || key === "altPhone" ? digits(e.target.value) : key === "quote" ? e.target.value.replace(/\D/g, "").slice(0, 9) : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  const duplicates = useMemo(() => findDuplicates(values), [values]);

  function validate() {
    const found = {};
    if (values.company.trim().length < 2) found.company = "Enter the company or customer name.";
    if (values.contact.trim().length < 2) found.contact = "Enter the contact person's name.";
    if (phoneProblem(values.phone)) found.phone = phoneProblem(values.phone);
    if (values.altPhone && phoneProblem(values.altPhone)) found.altPhone = phoneProblem(values.altPhone);
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "That email looks incomplete.";
    if (!values.address.trim()) found.address = "Enter the address.";
    if (!values.source) found.source = "Choose the source of this lead.";
    if (!(Number(values.quote) > 0)) found.quote = "Enter the approximate quote.";
    if (values.requirement.trim().length < 5) found.requirement = "Describe what the customer needs.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(e) {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const lead = await submitLead(values, viewer.me);
      toast(`Lead ${lead.number} submitted`);
      setValues({ ...BLANK_LEAD, source: fixedSource || "" });
      onSaved?.(lead);
    } catch (err) {
      toast(err.message || "Could not submit the lead.", true);
    } finally {
      setBusy(false);
    }
  }

  const cls = (key) => `lm-input${errors[key] ? " bad" : ""}`;

  return (
    <form onSubmit={save} noValidate style={{ display: "grid", gap: 16 }}>
      {duplicates.length > 0 && (
        <Note tone="warn">
          <b>Possible duplicate.</b> {duplicates[0].company} ({duplicates[0].phone}) is already a lead, {duplicates[0].number}. You can still submit if this is a different enquiry.
        </Note>
      )}
      <div className="lm-form">
        <Field label="Company / Customer Name" required error={errors.company} wide>
          <input className={cls("company")} value={values.company} onChange={set("company")} placeholder="e.g. ABC Pharma Pvt Ltd" maxLength={150} />
        </Field>
        <Field label="Contact Person" required error={errors.contact} wide>
          <input className={cls("contact")} value={values.contact} onChange={set("contact")} placeholder="Who should we speak to?" maxLength={120} />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" placeholder="10-digit mobile number" />
        </Field>
        <Field label="Alternate Phone" error={errors.altPhone}>
          <input className={cls("altPhone")} value={values.altPhone} onChange={set("altPhone")} inputMode="numeric" placeholder="Optional" />
        </Field>
        <Field label="Email" error={errors.email} wide>
          <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="name@company.com (optional)" />
        </Field>
        <Field label="Address" required error={errors.address} wide>
          <input className={cls("address")} value={values.address} onChange={set("address")} placeholder="Plot / building, area, city" maxLength={255} />
        </Field>
        <Field label="Source of Lead" required error={errors.source}>
          <select className={`lm-select${errors.source ? " bad" : ""}`} value={values.source} onChange={set("source")} disabled={!!fixedSource}>
            <option value="">Select source</option>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Approximate Quote (₹)" required error={errors.quote}>
          <input className={cls("quote")} value={values.quote} onChange={set("quote")} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="Requirement / Description" required error={errors.requirement} wide>
          <textarea className={`lm-textarea${errors.requirement ? " bad" : ""}`} value={values.requirement} onChange={set("requirement")} placeholder="e.g. Need pest control contract for factory and warehouse." />
        </Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={busy} icon={<FiSend />}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddLeadModal({ onClose }) {
  return (
    <Modal title="Add New Lead" sub="Commercial lead - it joins the telecaller queue for verification" onClose={onClose} wide>
      {(close) => <LeadForm submitLabel="Add Lead" onSaved={close} onCancel={close} />}
    </Modal>
  );
}

/* ------------------------------------------------------------ call & verify */

const OUTCOMES = [
  { value: "GENUINE", label: "Genuine Lead", sub: "Requirement confirmed - ready for a sales meeting", tone: "success" },
  { value: "NEED_MORE_INFO", label: "Need More Information", sub: "Follow up again before deciding", tone: "violet" },
  { value: "CALL_BACK", label: "Call Back Later", sub: "No answer, or the customer asked for another time", tone: "warn" },
  { value: "NOT_GENUINE", label: "Not Genuine", sub: "Invalid, duplicate or not a real enquiry", tone: "danger" },
];

/** Telecaller records the result of a call. `onScheduleMeeting` is offered straight after a Genuine result. */
export function CallVerifyModal({ lead, onClose, onScheduleMeeting }) {
  const viewer = useViewer();
  const toast = useToast();
  const [outcome, setOutcome] = useState("GENUINE");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [followUpAt, setFollowUpAt] = useState(tomorrowInput);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const needsFollowUp = outcome === "NEED_MORE_INFO" || outcome === "CALL_BACK";

  async function save(close, thenSchedule) {
    if (busy) return;
    setBusy(true);
    try {
      await saveCall(lead.id, { outcome, notes, reason, feedback, followUpAt: needsFollowUp ? new Date(followUpAt).toISOString() : null }, viewer.me);
      toast("Call details saved");
      close();
      if (thenSchedule) setTimeout(() => onScheduleMeeting?.(lead), 240);
    } catch (err) {
      toast(err.message || "Could not save the call.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Update Lead - Call Details"
      sub="Record what the customer said on this call"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {outcome === "GENUINE" && onScheduleMeeting ? (
            <Button busy={busy} icon={<FiCalendar />} onClick={() => save(close, true)}>
              Save &amp; Schedule Meeting
            </Button>
          ) : (
            <Button busy={busy} icon={<FiCheck />} onClick={() => save(close, false)}>
              Save
            </Button>
          )}
        </>
      )}
    >
      <LeadBar lead={lead} />
      <Field label="Call Outcome" required>
        <Choice name="outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} />
      </Field>
      {outcome === "NOT_GENUINE" && (
        <Field label="Reason" required>
          <select className="lm-select" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select a reason</option>
            {REASONS.NOT_GENUINE.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Call Notes" hint="Internal only - the lead provider never sees these.">
        <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Spoke to Mr. Ravi. Interested in annual contract. Request for site visit next week." />
      </Field>
      {needsFollowUp && (
        <Field label="Next Follow-up" required hint="This lead appears in Follow-ups on that day.">
          <input className="lm-input" type="datetime-local" value={followUpAt} min={toLocalInput()} onChange={(e) => setFollowUpAt(e.target.value)} />
        </Field>
      )}
      {!!lead.providerId && (
        <Field label="Feedback for the Lead Provider" hint="Optional. Shown to the provider next to this lead's status.">
          <input className="lm-input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. Meeting being scheduled" maxLength={120} />
        </Field>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ schedule meeting */

export function ScheduleMeetingModal({ lead, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const team = salesTeam();
  const [salesId, setSalesId] = useState(lead.salesId || "");
  const [when, setWhen] = useState(tomorrowInput);
  const [locationType, setLocationType] = useState("CUSTOMER");
  const [address, setAddress] = useState(lead.address);
  const [notes, setNotes] = useState("");
  const [createTask, setCreateTask] = useState(true);
  const [busy, setBusy] = useState(false);

  function pickLocation(type) {
    setLocationType(type);
    setAddress(type === "CUSTOMER" ? lead.address : "BestServe Office, Jayanagar, Bengaluru");
  }

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await scheduleMeeting(
        lead.id,
        { salesId, scheduledAt: new Date(when).toISOString(), locationType, address, notes, type: locationType === "CUSTOMER" ? "SITE_VISIT" : "MEETING" },
        viewer.me,
      );
      toast(createTask ? "Meeting scheduled and task created for the sales person" : "Meeting scheduled");
      close();
    } catch (err) {
      toast(err.message || "Could not schedule the meeting.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Schedule Meeting"
      sub="Assign a sales person and a time for the visit"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiCalendar />} onClick={() => save(close)}>
            Schedule Meeting
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <div className="lm-form">
        <Field label="Meeting Date & Time" required wide>
          <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Assign to Sales Person" required wide hint={lead.salesId ? "Defaults to the sales person who brought in this lead." : undefined}>
          <select className="lm-select" value={salesId} onChange={(e) => setSalesId(e.target.value)}>
            <option value="">Select sales person</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Meeting Location" required wide>
          <div className="lm-seg" role="radiogroup">
            <button type="button" className={locationType === "CUSTOMER" ? "on" : ""} onClick={() => pickLocation("CUSTOMER")}>
              Customer Address
            </button>
            <button type="button" className={locationType === "OFFICE" ? "on" : ""} onClick={() => pickLocation("OFFICE")}>
              Our Office
            </button>
          </div>
        </Field>
        <Field label="Address" required wide>
          <input className="lm-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Meeting Notes" wide>
          <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Discuss annual pest control contract and site visit." />
        </Field>
      </div>
      <label className="lm-check">
        <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
        Create a task for the sales visit
      </label>
    </Modal>
  );
}

/* ------------------------------------------------------------ visit outcome */

export function VisitModal({ meeting, lead, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const [outcome, setOutcome] = useState(VISIT_OUTCOMES[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await completeVisit(meeting.id, { outcome, notes }, viewer.me);
      toast("Visit updated");
      close();
    } catch (err) {
      toast(err.message || "Could not update the visit.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Update After Visit"
      sub="What happened at the meeting?"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>
            Save Visit
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <Note tone="info">
        Visit check-in with location is done from the mobile app. Here you record the outcome.
      </Note>
      <Field label="Visit Outcome" required>
        <Choice name="visit" value={outcome} onChange={setOutcome} options={VISIT_OUTCOMES.map((o) => ({ value: o, label: o, tone: o === "Not interested" ? "danger" : "info" }))} />
      </Field>
      <Field label="Notes">
        <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Site visited, requirement confirmed. Quotation will be sent tomorrow." />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------ won / lost */

export function CloseLeadModal({ lead, won, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await closeLead(lead.id, { won, reason, notes }, viewer.me);
      toast(won ? `${lead.company} converted to a customer` : "Lead marked as lost");
      close();
    } catch (err) {
      toast(err.message || "Could not update the lead.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={won ? "Convert to Customer" : "Mark as Lost"}
      sub={won ? "The deal is won - this lead becomes a customer" : "Close this lead without a deal"}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant={won ? "success" : "danger"} busy={busy} icon={won ? <FiThumbsUp /> : <FiThumbsDown />} onClick={() => save(close)}>
            {won ? "Convert to Customer" : "Mark as Lost"}
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      {won ? (
        <Note tone="success">
          A customer record is created for <b>{lead.company}</b> and the lead's full history is kept. A lead can be converted only once.
        </Note>
      ) : (
        <Field label="Reason" required>
          <select className="lm-select" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select a reason</option>
            {REASONS.LOST.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes">
        <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={won ? "e.g. Annual contract signed, service to start next month." : "Anything worth remembering about this lead."} />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------ provider */

export function ProviderModal({ provider, onClose }) {
  const toast = useToast();
  const editing = !!provider;
  const [values, setValues] = useState(provider || { name: "", contact: "", phone: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: key === "phone" ? digits(e.target.value) : e.target.value }));
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  async function save(close) {
    const found = {};
    if (values.name.trim().length < 2) found.name = "Enter the provider's company name.";
    if (values.contact.trim().length < 2) found.contact = "Enter the contact person.";
    if (phoneProblem(values.phone)) found.phone = phoneProblem(values.phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "Enter the login email address.";
    if (!editing && (values.password || "").length < 8) found.password = "Use at least 8 characters.";
    setErrors(found);
    if (busy || Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await saveProvider({ ...values, name: values.name.trim(), contact: values.contact.trim(), email: values.email.trim() });
      toast(editing ? "Provider updated" : "Provider created - they can now sign in");
      close();
    } catch (err) {
      toast(err.message || "Could not save the provider.", true);
      setBusy(false);
    }
  }

  const cls = (key) => `lm-input${errors[key] ? " bad" : ""}`;

  return (
    <Modal
      title={editing ? "Edit Lead Provider" : "Add Lead Provider"}
      sub="A provider signs in to the restricted portal and sees only their own leads"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>
            {editing ? "Save Changes" : "Create Provider"}
          </Button>
        </>
      )}
    >
      <div className="lm-form">
        <Field label="Provider / Company Name" required error={errors.name} wide>
          <input className={cls("name")} value={values.name} onChange={set("name")} placeholder="e.g. Surya Marketing" />
        </Field>
        <Field label="Contact Person" required error={errors.contact}>
          <input className={cls("contact")} value={values.contact} onChange={set("contact")} />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" />
        </Field>
        <Field label="Login Email" required error={errors.email} wide>
          <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="They sign in with this" />
        </Field>
        {!editing && (
          <Field label="Password" required error={errors.password} wide hint="Share this with the provider; they can change it after signing in.">
            <input className={cls("password")} value={values.password} onChange={set("password")} type="password" autoComplete="new-password" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
