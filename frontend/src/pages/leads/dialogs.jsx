// The dialogs that move a lead along: verify a call, schedule, move or cancel
// a meeting, record a visit, upload a quotation, edit the lead and close it.

import { useMemo, useState } from "react";
import { FiBriefcase, FiCalendar, FiCheck, FiSave, FiSend, FiThumbsDown, FiThumbsUp, FiUploadCloud, FiXCircle } from "react-icons/fi";
import {
  cancelMeeting,
  closeLead,
  completeVisit,
  findDuplicates,
  lossReasons,
  providerSources,
  rescheduleMeeting,
  salesTeam,
  saveCall,
  scheduleMeeting,
  submitLead,
  updateLead,
  uploadQuotation,
} from "./leadsApi";
import { FORM_SOURCES, REASONS, VISIT_OUTCOMES } from "./constants";
import { toLocalInput, tomorrowInput } from "./format";
import { useToast } from "./hooks";
import { Button, Field, Modal, Note, StageBadge } from "./ui";
import { useViewer } from "./viewer";

/** The reasons offered when a lead is closed: the server's list, or ours if it could not be read. */
const reasonChoices = (kind) => {
  const fromServer = lossReasons();
  return fromServer.length > 0 ? fromServer : REASONS[kind];
};

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
  // Staff pick from the sources the lead API accepts; a provider from the list the portal is given.
  const sources = viewer.persona === "lead_provider" ? providerSources().map((name) => ({ value: name, label: name })) : FORM_SOURCES;

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
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
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
            {reasonChoices("NOT_GENUINE").map((r) => (
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
      toast("Meeting scheduled and task created for the sales person");
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
      <Note tone="info">A task for this visit is added to the sales person&apos;s Task Management list.</Note>
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
            {reasonChoices("LOST").map((r) => (
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

/* ------------------------------------------------------------ quotation */

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Upload a quotation as a PDF with its total. The lead moves to Quotation Sent. */
export function QuotationModal({ lead, onClose }) {
  const toast = useToast();
  const [amount, setAmount] = useState(lead.quote ? String(Math.round(lead.quote)) : "");
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function pick(e) {
    const picked = e.target.files?.[0] || null;
    setFile(picked);
    setErrors((er) => ({ ...er, file: "" }));
  }

  async function save(close) {
    const found = {};
    if (!(Number(amount) > 0)) found.amount = "Enter the quotation amount.";
    if (!file) found.file = "Attach the quotation PDF.";
    else if (file.type !== "application/pdf") found.file = "The quotation must be a PDF file.";
    else if (file.size > MAX_PDF_BYTES) found.file = "That file is too large. The limit is 10 MB.";
    setErrors(found);
    if (busy || Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const quotation = await uploadQuotation(lead.id, { file, totalAmount: Number(amount), notes });
      toast(`Quotation ${quotation.number} uploaded`);
      close();
    } catch (err) {
      toast(err.message || "Could not upload the quotation.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create Quotation"
      sub="Upload the quotation PDF - it is saved as sent to the customer"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiUploadCloud />} onClick={() => save(close)}>
            Upload Quotation
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <div className="lm-form">
        <Field label="Quotation No" hint="Assigned automatically when uploaded">
          <input className="lm-input" value="Auto" disabled />
        </Field>
        <Field label="Total Amount (₹)" required error={errors.amount}>
          <input className={`lm-input${errors.amount ? " bad" : ""}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="Upload Quotation (PDF)" required error={errors.file} hint={file ? `${file.name} - choose again to replace` : "PDF only, up to 10 MB"} wide>
          <input className={`lm-input${errors.file ? " bad" : ""}`} type="file" accept="application/pdf" onChange={pick} />
        </Field>
        <Field label="Notes" wide>
          <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. Sent quotation by email. Follow up after 1 week." />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ edit lead */

/** Corrects a lead's contact and requirement details. The stage, people and source are not edited here. */
export function EditLeadModal({ lead, onClose }) {
  const toast = useToast();
  const [values, setValues] = useState({
    company: lead.company,
    contact: lead.contact,
    phone: lead.phone,
    altPhone: lead.altPhone,
    email: lead.email,
    address: lead.address,
    quote: lead.quote ? String(Math.round(lead.quote)) : "",
    requirement: lead.requirement,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    const value = key === "phone" || key === "altPhone" ? digits(e.target.value) : key === "quote" ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  function validate() {
    const found = {};
    if (values.company.trim().length < 2) found.company = "Enter the company or customer name.";
    if (values.contact.trim().length < 2) found.contact = "Enter the contact person's name.";
    if (phoneProblem(values.phone)) found.phone = phoneProblem(values.phone);
    if (values.altPhone && phoneProblem(values.altPhone)) found.altPhone = phoneProblem(values.altPhone);
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "That email looks incomplete.";
    if (!values.address.trim()) found.address = "Enter the address.";
    if (!(Number(values.quote) > 0)) found.quote = "Enter the approximate quote.";
    if (values.requirement.trim().length < 5) found.requirement = "Describe what the customer needs.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(close) {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      await updateLead(lead.id, values);
      toast("Lead details saved");
      close();
    } catch (err) {
      toast(err.message || "Could not save the lead.", true);
      setBusy(false);
    }
  }

  const cls = (key) => `lm-input${errors[key] ? " bad" : ""}`;

  return (
    <Modal
      title="Edit Lead"
      sub={`${lead.number} - correct the customer's details`}
      onClose={onClose}
      wide
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiSave />} onClick={() => save(close)}>
            Save Changes
          </Button>
        </>
      )}
    >
      <div className="lm-form">
        <Field label="Company / Customer Name" required error={errors.company} wide>
          <input className={cls("company")} value={values.company} onChange={set("company")} maxLength={150} />
        </Field>
        <Field label="Contact Person" required error={errors.contact} wide>
          <input className={cls("contact")} value={values.contact} onChange={set("contact")} maxLength={150} />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" />
        </Field>
        <Field label="Alternate Phone" error={errors.altPhone}>
          <input className={cls("altPhone")} value={values.altPhone} onChange={set("altPhone")} inputMode="numeric" placeholder="Optional" />
        </Field>
        <Field label="Email" error={errors.email} wide>
          <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="Optional" maxLength={150} />
        </Field>
        <Field label="Address" required error={errors.address} wide>
          <input className={cls("address")} value={values.address} onChange={set("address")} maxLength={255} />
        </Field>
        <Field label="Approximate Quote (₹)" required error={errors.quote}>
          <input className={cls("quote")} value={values.quote} onChange={set("quote")} inputMode="numeric" />
        </Field>
        <Field label="Requirement / Description" required error={errors.requirement} wide>
          <textarea className={`lm-textarea${errors.requirement ? " bad" : ""}`} value={values.requirement} onChange={set("requirement")} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ move / cancel a meeting */

/** Reschedules (`mode="move"`) or cancels (`mode="cancel"`) a meeting. The sales person's task follows it. */
export function MeetingChangeModal({ meeting, lead, mode, onClose }) {
  const toast = useToast();
  const cancelling = mode === "cancel";
  const [when, setWhen] = useState(() => (new Date(meeting.scheduledAt).getTime() > Date.now() ? toLocalInput(meeting.scheduledAt) : tomorrowInput()));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      if (cancelling) await cancelMeeting(meeting.id, { reason });
      else await rescheduleMeeting(meeting.id, { scheduledAt: new Date(when).toISOString(), reason });
      toast(cancelling ? "Meeting cancelled" : "Meeting moved");
      close();
    } catch (err) {
      toast(err.message || "Could not update the meeting.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={cancelling ? "Cancel Meeting" : "Reschedule Meeting"}
      sub={cancelling ? "The sales person's task for it is cancelled too" : "The sales person's task moves to the new time"}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Back
          </Button>
          <Button variant={cancelling ? "danger" : "primary"} busy={busy} icon={cancelling ? <FiXCircle /> : <FiCalendar />} onClick={() => save(close)}>
            {cancelling ? "Cancel Meeting" : "Reschedule"}
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      {!cancelling && (
        <Field label="New Date & Time" required>
          <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
      <Field label="Reason" required={cancelling} hint={cancelling ? undefined : "Optional. Kept in the lead's history."}>
        <textarea
          className="lm-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={cancelling ? "e.g. Customer postponed the requirement." : "e.g. Customer asked for Monday instead."}
        />
      </Field>
    </Modal>
  );
}
