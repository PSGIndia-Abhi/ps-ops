// The dialogs that move a lead along: verify a call, schedule, move or cancel
// a meeting, record a visit, upload a quotation, edit the lead and close it.

import { useEffect, useMemo, useState } from "react";
import { FiBriefcase, FiCalendar, FiCheck, FiChevronDown, FiSave, FiSend, FiThumbsDown, FiThumbsUp, FiUploadCloud, FiXCircle } from "react-icons/fi";
import {
  addFollowUp,
  cancelMeeting,
  cancelQuotation,
  FOLLOW_UP_OUTCOMES,
  sendProviderUpdate,
  closeLead,
  completeVisit,
  findDuplicates,
  getOpenMeeting,
  loadWorkspace,
  lossReasons,
  providerSources,
  request,
  rescheduleMeeting,
  salesTeam,
  saveCall,
  scheduleMeeting,
  submitLead,
  updateLead,
  uploadQuotation,
} from "./leadsApi";
import PlacesSearchInput from "../../components/maps/PlacesSearchInput";
import { COMMERCIAL_SERVICES, FORM_SOURCES, INDUSTRY_TYPES, REASONS, VISIT_OUTCOMES } from "./constants";
import { dateTime, toLocalInput, tomorrowInput } from "./format";
import { clashesAt, kindLabel, myReminders, openFollowUpsFor, showReminderCard } from "./remindersApi";
import { useToast } from "./hooks";
import { Button, Field, Modal, Note, StageBadge } from "./ui";
import { assigneeRole, assignLead, fetchAssignees } from "./leadsApi";
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

const BLANK_LEAD = {
  company: "", contact: "", phone: "", altPhone: "", email: "", address: "", area: "", source: "", quote: "", requirement: "",
  industry: "", services: [],
  competitorName: "", competitorAmount: "", competitorEnd: "", competitorNotes: "",
};

/**
 * The optional Competitor block of the lead forms (add and edit): who serves the customer now,
 * their price, when the contract ends, and notes. `set(key)` is the form's own change handler.
 */
/**
 * Industry type and the services asked for (both optional) - the same choices as the Android
 * form, so a lead added or edited on either shows them on both.
 */
function IndustryServiceFields({ values, setValues }) {
  const toggle = (code) =>
    setValues((v) => ({ ...v, services: v.services.includes(code) ? v.services.filter((s) => s !== code) : [...v.services, code] }));
  return (
    <>
      <Field label="Industry Type">
        <select className="lm-select" value={values.industry} onChange={(e) => setValues((v) => ({ ...v, industry: e.target.value }))}>
          <option value="">Select industry</option>
          {INDUSTRY_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Services Requested" wide>
        <div className="lm-svc-grid">
          {COMMERCIAL_SERVICES.map((o) => (
            <label key={o.value} className={`lm-svc${values.services.includes(o.value) ? " on" : ""}`}>
              <input type="checkbox" checked={values.services.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}

// Folds away: closed on a new lead, open when editing one that already has competitor details.
function CompetitorFields({ values, set }) {
  const filled = !!(values.competitorName || values.competitorAmount || values.competitorEnd || values.competitorNotes);
  const [open, setOpen] = useState(filled);
  const summary = [values.competitorName, values.competitorAmount && `₹${Number(values.competitorAmount).toLocaleString("en-IN")}`].filter(Boolean).join("  ·  ");
  return (
    <>
      <button type="button" className={`lm-collapse wide${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="lm-collapse-text">
          <strong>Competitor</strong>
          <span>{open ? "Optional - who looks after the customer today. It helps price and time the offer." : summary || "Optional - click to add the current service provider"}</span>
        </span>
        <FiChevronDown className="lm-collapse-icon" />
      </button>
      {open && (
        <>
      <Field label="Current Service Provider">
        <input className="lm-input" value={values.competitorName} onChange={set("competitorName")} placeholder="e.g. ABC Pest Control" maxLength={150} />
      </Field>
      <Field label="Their Price / Contract Amount (₹)">
        <input className="lm-input" value={values.competitorAmount} onChange={set("competitorAmount")} inputMode="numeric" placeholder="What the customer pays them" />
      </Field>
      <Field label="Contract Ends On">
        <input className="lm-input" type="date" value={values.competitorEnd} onChange={set("competitorEnd")} />
      </Field>
      <Field label="Notes on the Competitor" wide>
        <textarea className="lm-textarea" value={values.competitorNotes} onChange={set("competitorNotes")} placeholder="What the customer likes or dislikes about them" maxLength={500} />
      </Field>
        </>
      )}
    </>
  );
}

/**
 * The commercial lead form. Used as the provider's "Submit New Lead" page and
 * inside the Add Lead dialog. `onSaved(lead)` runs after a successful save.
 */
export function LeadForm({ onSaved, onCancel, submitLabel = "Submit Lead", fixedSource }) {
  const viewer = useViewer();
  const toast = useToast();
  // The sales manager decides who a new lead goes to - themselves unless they pick someone.
  const canAssign = viewer.persona === "sales_manager" && !!viewer.me.id;
  const [people, setPeople] = useState([]);
  const [assignTo, setAssignTo] = useState(() => String(viewer.me.id || ""));
  useEffect(() => {
    if (!canAssign) return undefined;
    let alive = true;
    fetchAssignees()
      .then((list) => alive && setPeople(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canAssign]);
  const [values, setValues] = useState({ ...BLANK_LEAD, source: fixedSource || "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    const value = key === "phone" || key === "altPhone" ? digits(e.target.value) : key === "quote" || key === "competitorAmount" ? e.target.value.replace(/\D/g, "").slice(0, 9) : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((er) => ({ ...er, [key]: "" }));
  };

  const duplicates = useMemo(() => findDuplicates(values), [values]);
  // Everyone picks from the lead source master; staff fall back to the fixed codes if it could not be read.
  const master = providerSources().map((name) => ({ value: name, label: name }));
  const sources = master.length > 0 || viewer.persona === "lead_provider" ? master : FORM_SOURCES;

  function validate() {
    const found = {};
    if (values.company.trim().length < 2) found.company = "Enter the company or customer name.";
    if (values.contact.trim().length < 2) found.contact = "Enter the contact person's name.";
    if (phoneProblem(values.phone)) found.phone = phoneProblem(values.phone);
    if (values.altPhone && phoneProblem(values.altPhone)) found.altPhone = phoneProblem(values.altPhone);
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) found.email = "That email looks incomplete.";
    if (!values.address.trim()) found.address = "Enter the address.";
    if (!values.source) found.source = "Choose the source of this lead.";
    // The quote must be more than 0.
    if (!(Number(values.quote) > 0)) found.quote = "Enter the approximate quote (more than 0).";
    if (values.requirement.trim().length < 5) found.requirement = "Describe what the customer needs.";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  // An admin looking at the provider portal is not a provider: a lead saved here would be an
  // ordinary staff lead under the admin, and would never reach any provider's list.
  const providerPreview = viewer.persona === "lead_provider" && !viewer.me.providerId;

  async function save(e) {
    e.preventDefault();
    if (providerPreview) return;
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const lead = await submitLead({ ...values, assignTo: canAssign ? assignTo : undefined }, viewer.me);
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
      {providerPreview && (
        <Note tone="info">
          <b>Preview only.</b> Leads are submitted from a lead provider&apos;s own login, so they appear in that provider&apos;s list.
        </Note>
      )}
      {duplicates.length > 0 && (
        <Note tone="warn">
          <b>Possible duplicate.</b> {duplicates[0].company} ({duplicates[0].phone}) is already a lead, {duplicates[0].number}. You can still submit if this is a different enquiry.
        </Note>
      )}
      <div className="lm-form">
        <Field label="Company / Customer Name" required error={errors.company}>
          <input className={cls("company")} value={values.company} onChange={set("company")} placeholder="e.g. ABC Pharma Pvt Ltd" maxLength={150} />
        </Field>
        <Field label="Contact Person" required error={errors.contact}>
          <input className={cls("contact")} value={values.contact} onChange={set("contact")} placeholder="Who should we speak to?" maxLength={120} />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" placeholder="10-digit mobile number" />
        </Field>
        <Field label="Alternate Phone" error={errors.altPhone}>
          <input className={cls("altPhone")} value={values.altPhone} onChange={set("altPhone")} inputMode="numeric" placeholder="Optional" />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="name@company.com (optional)" />
        </Field>
        <Field label="Address" required error={errors.address}>
          {/* Google suggestions while typing; a picked place fills in its full address. Typed text is kept as it is too. */}
          <PlacesSearchInput
            value={values.address}
            onInput={(text) => set("address")({ target: { value: text } })}
            onSelect={(place) => set("address")({ target: { value: place.address.slice(0, 255) } })}
            inputProps={{ className: cls("address"), placeholder: "Start typing - pick the address from Google", maxLength: 255 }}
          />
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
        {viewer.persona !== "lead_provider" && <IndustryServiceFields values={values} setValues={setValues} />}
        {canAssign && (
          <Field label="Assign To" required hint="Only this person (and the managers) will see the lead.">
            <select className="lm-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value={String(viewer.me.id)}>Myself</option>
              {people
                .filter((p) => p.id !== String(viewer.me.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {assigneeRole(p.role)}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Approximate Quote (₹)" required error={errors.quote}>
          <input className={cls("quote")} value={values.quote} onChange={set("quote")} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="Requirement / Description" required error={errors.requirement} wide>
          <textarea className={`lm-textarea${errors.requirement ? " bad" : ""}`} value={values.requirement} onChange={set("requirement")} placeholder="e.g. Need pest control contract for factory and warehouse." />
        </Field>
        {viewer.persona !== "lead_provider" && <CompetitorFields values={values} set={set} />}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={providerPreview} icon={<FiSend />}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AddLeadModal({ onClose }) {
  const { persona } = useViewer();
  const sub =
    persona === "sales"
      ? "Your own commercial lead - it is verified and assigned to you straight away"
      : "Commercial lead - it joins the telecaller queue for verification";
  return (
    <Modal title="Add New Lead" sub={sub} onClose={onClose} wide>
      {(close) => <LeadForm submitLabel="Add Lead" onSaved={close} onCancel={close} />}
    </Modal>
  );
}

/* ------------------------------------------------------------ call & verify */

const OUTCOMES = [
  { value: "GENUINE", label: "Genuine Lead", sub: "Requirement confirmed - ready for a sales meeting", tone: "success" },
  { value: "NEED_MORE_INFO", label: "Need More Information", sub: "Follow up again before deciding", tone: "violet" },
  { value: "CALL_BACK", label: "Call Back Later", sub: "The customer asked to be called at another time", tone: "warn" },
  { value: "NO_ANSWER", label: "No Response", sub: "Rang, but nobody picked up - try again later", tone: "warn" },
  { value: "INVALID_NUMBER", label: "Invalid Number", sub: "Wrong or unreachable number - only logs the call", tone: "neutral" },
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
  const needsFollowUp = FOLLOW_UP_OUTCOMES.includes(outcome);

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
  const [remindAt, setRemindAt] = useState("");
  const [locationType, setLocationType] = useState("CUSTOMER");
  const [address, setAddress] = useState(lead.address);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // A lead has one open meeting at a time: if it has one, say so instead of offering a second.
  const [open, setOpen] = useState(undefined); // undefined = still checking, null = none

  useEffect(() => {
    let alive = true;
    getOpenMeeting(lead.id)
      .then((m) => alive && setOpen(m))
      .catch(() => alive && setOpen(null)); // the server still refuses a second one
    return () => {
      alive = false;
    };
  }, [lead.id]);

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
        { salesId, scheduledAt: new Date(when).toISOString(), locationType, address, notes, remindAt, type: locationType === "CUSTOMER" ? "SITE_VISIT" : "MEETING" },
        viewer.me,
      );
      toast("Meeting scheduled and task created for the sales person");
      close();
    } catch (err) {
      toast(err.message || "Could not schedule the meeting.", true);
      if (err.status === 409 && err.data?.meeting) {
        const m = err.data.meeting;
        setOpen({ scheduledAt: String(m.scheduled_at || "").replace(" ", "T"), type: m.meeting_type === "OFFICE" ? "MEETING" : "SITE_VISIT", salesName: m.sales_employee_name || "", started: !!m.check_in_at });
      }
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
          <Button busy={busy} disabled={!!open} icon={<FiCalendar />} onClick={() => save(close)}>
            Schedule Meeting
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      {!!open && (
        <Note tone="warn">
          A {open.type === "MEETING" ? "meeting" : "site visit"} is already scheduled for this lead
          {open.salesName ? ` with ${open.salesName}` : ""}
          {open.scheduledAt ? ` on ${dateTime(open.scheduledAt)}` : ""}
          {open.started ? " and has started" : ""}. Reschedule, cancel or complete it before setting another.
        </Note>
      )}
      <div className="lm-form">
        <Field label="Meeting Date & Time" required>
          <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Assign to Sales Person" required hint={lead.salesId ? "Pre-filled with the sales person already on this lead." : undefined}>
          <select className="lm-select" value={salesId} onChange={(e) => setSalesId(e.target.value)}>
            <option value="">Select sales person</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title ? `${u.name} (${u.title})` : u.name}
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
          {/* Filled in from the lead (or our office) and editable; Google suggests addresses while typing. */}
          <PlacesSearchInput
            value={address}
            onInput={setAddress}
            onSelect={(place) => setAddress(place.address.slice(0, 255))}
            inputProps={{ className: "lm-input", placeholder: "Start typing - pick the address from Google", maxLength: 255 }}
          />
        </Field>
        <Field label="Meeting Notes" wide>
          <textarea className="lm-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Discuss annual pest control contract and site visit." />
        </Field>
        <ReminderInput value={remindAt} onChange={setRemindAt} suggest={when} />
      </div>
    </Modal>
  );
}

/**
 * "Set a reminder" on a meeting / follow-up: off by default - nothing rings unless it is turned on.
 * `value` is '' (off) or 'YYYY-MM-DDTHH:MM'; turning it on starts from `suggest`.
 */
/** An hour before `at` ('YYYY-MM-DDTHH:MM') - or the next full hour from now when that is past. */
function hourBefore(at) {
  const d = at ? new Date(at) : new Date(NaN);
  if (!Number.isNaN(d.getTime())) d.setHours(d.getHours() - 1);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return toLocalInput(next);
  }
  return toLocalInput(d);
}

function ReminderInput({ value, onChange, suggest }) {
  return (
    <Field label="Reminder" wide hint={value ? "It rings only at this date and time - on the phone and here." : "Off - nothing will ring for this."}>
      <div className="lm-reminder-row">
        <label className="lm-check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? hourBefore(suggest) : "")} />
          Set a reminder
        </label>
        {!!value && <input className="lm-input" type="datetime-local" value={value} min={toLocalInput()} onChange={(e) => onChange(e.target.value)} aria-label="Reminder date and time" />}
      </div>
    </Field>
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
    quote: lead.quote !== null && lead.quote !== undefined && Number.isFinite(Number(lead.quote)) ? String(Math.round(lead.quote)) : "",
    requirement: lead.requirement,
    competitorName: lead.competitorName || "",
    competitorAmount: lead.competitorAmount || "",
    competitorEnd: lead.competitorEnd || "",
    competitorNotes: lead.competitorNotes || "",
    industry: lead.industry || "",
    services: lead.services || [],
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => {
    const value = key === "phone" || key === "altPhone" ? digits(e.target.value) : key === "quote" || key === "competitorAmount" ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value;
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
    // The quote must be more than 0.
    if (!(Number(values.quote) > 0)) found.quote = "Enter the approximate quote (more than 0).";
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
        <Field label="Company / Customer Name" required error={errors.company}>
          <input className={cls("company")} value={values.company} onChange={set("company")} maxLength={150} />
        </Field>
        <Field label="Contact Person" required error={errors.contact}>
          <input className={cls("contact")} value={values.contact} onChange={set("contact")} maxLength={150} />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input className={cls("phone")} value={values.phone} onChange={set("phone")} inputMode="numeric" />
        </Field>
        <Field label="Alternate Phone" error={errors.altPhone}>
          <input className={cls("altPhone")} value={values.altPhone} onChange={set("altPhone")} inputMode="numeric" placeholder="Optional" />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={cls("email")} value={values.email} onChange={set("email")} type="email" placeholder="Optional" maxLength={150} />
        </Field>
        <Field label="Approximate Quote (₹)" required error={errors.quote}>
          <input className={cls("quote")} value={values.quote} onChange={set("quote")} inputMode="numeric" />
        </Field>
        <Field label="Address" required error={errors.address} wide>
          <input className={cls("address")} value={values.address} onChange={set("address")} maxLength={255} />
        </Field>
        <IndustryServiceFields values={values} setValues={setValues} />
        <Field label="Requirement / Description" required error={errors.requirement} wide>
          <textarea className={`lm-textarea${errors.requirement ? " bad" : ""}`} value={values.requirement} onChange={set("requirement")} />
        </Field>
        <CompetitorFields values={values} set={set} />
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

/* ------------------------------------------------------------ cancel a quotation */

/** Takes a quotation back. It is not deleted: it stays on the lead, marked Cancelled, with its PDF. */
export function CancelQuotationModal({ lead, quotation, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await cancelQuotation(lead.id, quotation.id, reason);
      toast(`Quotation ${quotation.number} cancelled`);
      close();
    } catch (err) {
      toast(err.message || "Could not cancel the quotation.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Cancel Quotation"
      sub={`${quotation.number} - it stays on the lead, marked Cancelled`}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Back
          </Button>
          <Button variant="danger" busy={busy} icon={<FiXCircle />} onClick={() => save(close)}>
            Cancel Quotation
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <Note tone="warn">
        The quotation and its PDF are kept for the record but no longer count as sent. If no other quotation is left on this lead, it goes back to its earlier stage.
      </Note>
      <Field label="Reason" required>
        <textarea className="lm-textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Wrong amount - a corrected quotation will be sent." />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------ follow-up at any time */

/**
 * Plans the next call or check-in on a lead, outside a verification call - after a visit, a
 * quotation, or whenever it is needed. A lead manager may give it to someone else.
 */
/**
 * The sales manager gives a lead to a sales executive (or another sales manager) to work, or keeps
 * it ("Myself"). Only that person - and the
 * managers - then see it.
 */
export function AssignLeadModal({ lead, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const myId = String(viewer.me.id || "");
  const [people, setPeople] = useState(null);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAssignees()
      .then((list) => alive && setPeople(list))
      .catch((err) => {
        if (!alive) return;
        setPeople([]);
        setError(err.message || "Could not load the team.");
      });
    return () => {
      alive = false;
    };
  }, []);
  const current = String(lead.salesId || lead.telecallerId || "");
  const currentName = current === myId ? "you" : people?.find((p) => p.id === current)?.name;
  const groups = people
    ? [
        { title: "Sales Executives", list: people.filter((p) => p.role === "Sales Executive") },
        { title: "Sales Managers", list: people.filter((p) => p.role === "sales_manager" && p.id !== myId) },
      ].filter((g) => g.list.length > 0)
    : [];

  async function save(close) {
    if (!picked) return setError("Choose who this lead goes to.");
    if (picked === current) return setError("This lead is already with them.");
    setBusy(true);
    setError("");
    try {
      await assignLead(lead.id, picked);
      const who = picked === myId ? "you" : people.find((p) => p.id === picked)?.name || "them";
      toast(`Lead assigned to ${who}`);
      close();
    } catch (err) {
      setError(err.message || "Could not assign the lead.");
      setBusy(false);
    }
  }

  const option = (id, label, sub) => (
    <label key={id} className={`lm-assign-opt${picked === id ? " on" : ""}`}>
      <input type="radio" name="assignee" checked={picked === id} onChange={() => setPicked(id)} />
      <span>
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </label>
  );

  return (
    <Modal
      title="Assign lead"
      sub={lead.company}
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiCheck />} onClick={() => save(close)}>
            Assign lead
          </Button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {error && <Note tone="warn">{error}</Note>}
        <p className="lm-hint" style={{ margin: 0 }}>
          {currentName ? `Now with ${currentName}. ` : "Not assigned to anyone yet. "}Only the person you choose (and the managers) will see this lead.
        </p>
        {!people ? (
          <p className="lm-hint">Loading the team...</p>
        ) : (
          <>
            <div className="lm-assign-group">{option(myId, current === myId ? "Myself (now)" : "Myself", "Keep this lead with you")}</div>
            {groups.map((g) => (
              <div key={g.title} className="lm-assign-group">
                <h4>{g.title}</h4>
                {g.list.map((p) => option(p.id, p.id === current ? `${p.name} (now)` : p.name, assigneeRole(p.role)))}
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Add a follow-up - or, with `task` (a work task row), change that one follow-up's date, time and note. */
export function FollowUpModal({ lead, task, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const canAssign = viewer.persona === "sales_manager";
  const team = canAssign ? salesTeam() : [];
  const [when, setWhen] = useState(() => (task?.due_date ? `${task.due_date}T${String(task.due_time || "09:00").slice(0, 5)}` : tomorrowInput()));
  // Your own task by default (it shows in your Task Management); a manager can give it to someone else.
  const [assignedTo, setAssignedTo] = useState(() => viewer.me.id);
  const [note, setNote] = useState(task?.description || "");
  const [remindAt, setRemindAt] = useState("");
  const [busy, setBusy] = useState(false);
  // Follow-ups already open on this lead (undefined while checking). A lead keeps ONE follow-up
  // task per person: when that person already has one, the form moves it (the server keeps every
  // earlier time and note in its history) - the same as the Android app.
  const [existing, setExisting] = useState(undefined);
  const [mine, setMine] = useState([]); // my other reminders, for the same-time warning

  useEffect(() => {
    let alive = true;
    openFollowUpsFor(lead.id)
      .then((list) => {
        if (!alive) return;
        setExisting(list);
        const own = list.find((f) => f.forId === String(viewer.me.id));
        if (own && !task) setWhen(`${own.date}T${own.time || "09:00"}`);
      })
      .catch(() => alive && setExisting([]));
    myReminders(viewer.me.id)
      .then((list) => alive && setMine(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, viewer.me.id]);

  // The follow-up this one would join: the chosen person's own open one on this lead.
  const current = existing?.find((f) => f.forId === String(assignedTo)) || null;
  const [date, time] = when.split("T");
  // The same-time warning only makes sense for a follow-up that lands on my own list.
  const clash = String(assignedTo) === String(viewer.me.id) ? clashesAt(mine, date, time, current ? `task:${current.id}` : undefined) : [];

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await addFollowUp(lead.id, { at: new Date(when).toISOString(), note, assignedTo, remindAt });
      const forMe = String(assignedTo) === String(viewer.me.id);
      const who = forMe ? "For you" : `For ${team.find((u) => u.id === String(assignedTo))?.name || "the team"}`;
      showReminderCard({ kind: "followup", title: "Follow-up added", text: lead.company, sub: `${who} · ${dateTime(when)}`, leadId: lead.id });
      close();
    } catch (err) {
      toast(err.message || "Could not add the follow-up.", true);
      setBusy(false);
    }
  }

  /** Moves the follow-up that is already there (the server keeps the old time and the note in its history). */
  async function move(close) {
    if (busy) return;
    if (new Date(when) <= new Date()) return toast("Choose a follow-up time in the future.", true);
    setBusy(true);
    try {
      await addFollowUp(lead.id, { at: new Date(when).toISOString(), note, assignedTo, remindAt });
      toast("Follow-up moved");
      close();
    } catch (err) {
      toast(err.message || "Could not change the follow-up.", true);
      setBusy(false);
    }
  }

  const clashNote = clash.length > 0 && (
    <Note tone="warn">
      You already have {clash.length === 1 ? `"${clash[0].title}" (${kindLabel(clash[0].kind).toLowerCase()})` : `${clash.length} things`} at this time. You can still save.
    </Note>
  );

  /** Changes the one follow-up picked (`task`); the server keeps its earlier time in the history. */
  async function change(close) {
    if (busy) return;
    if (new Date(when) <= new Date()) return toast("Choose a follow-up time in the future.", true);
    setBusy(true);
    try {
      await addFollowUp(lead.id, { at: new Date(when).toISOString(), note, assignedTo: task.assigned_to, remindAt, taskId: task.id });
      toast("Follow-up changed");
      close();
    } catch (err) {
      toast(err.message || "Could not change the follow-up.", true);
      setBusy(false);
    }
  }

  if (task) {
    return (
      <Modal
        title="Change Follow-up"
        sub={`Now due ${dateTime(`${task.due_date}T${String(task.due_time || "09:00").slice(0, 5)}`)}`}
        onClose={onClose}
        footer={(close) => (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button busy={busy} icon={<FiCalendar />} onClick={() => change(close)}>
              Save Changes
            </Button>
          </>
        )}
      >
        <LeadBar lead={lead} />
        <div className="lm-form">
          <Field label="New Date & Time" required>
            <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Note" wide>
            <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What should the call cover?" />
          </Field>
          <ReminderInput value={remindAt} onChange={setRemindAt} suggest={when} />
        </div>
        {clashNote}
      </Modal>
    );
  }

  if (current) {
    return (
      <Modal
        title="Add Follow-up"
        sub="A follow-up is already set on this lead"
        onClose={onClose}
        footer={(close) => (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button busy={busy} icon={<FiCalendar />} onClick={() => move(close)}>
              Change Date / Time
            </Button>
          </>
        )}
      >
        <LeadBar lead={lead} />
        <Note tone="warn">
          A follow-up is already set for {dateTime(`${current.date}T${current.time || "09:00"}`)}
          {current.forName ? ` for ${current.forName}` : ""}
          {current.note ? ` - "${current.note}"` : ""}. A lead keeps one follow-up: set its next date and time here - the earlier ones stay in its history.
        </Note>
        <div className="lm-form">
          <Field label="New Date & Time" required>
            <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Note" wide>
            <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the next call cover?" />
          </Field>
          <ReminderInput value={remindAt} onChange={setRemindAt} suggest={when} />
        </div>
        {clashNote}
      </Modal>
    );
  }

  return (
    <Modal
      title="Add Follow-up"
      sub="Plan the next call or check-in on this lead"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} disabled={existing === undefined} icon={<FiCalendar />} onClick={() => save(close)}>
            Add Follow-up
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <div className="lm-form">
        <Field label="Follow-up Date & Time" required>
          <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        {canAssign ? (
          <Field label="Assign to" required>
            <select className="lm-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === String(viewer.me.id) ? " (me)" : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Assign to" hint="Follow-ups you add are yours.">
            <input className="lm-input" value={viewer.me.name || "Me"} disabled />
          </Field>
        )}
        <Field label="What to follow up on" wide>
          <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Ask whether the quotation was reviewed by their finance team." />
        </Field>
        <ReminderInput value={remindAt} onChange={setRemindAt} suggest={when} />
      </div>
      {clashNote}
      <Note tone="info">It appears in Follow-ups and Reminders on that day.</Note>
    </Modal>
  );
}

/* ------------------------------------------------------------ follow-up call */

const CALL_RESULTS = [
  { value: "DONE", label: "Done", sub: "Nothing more to follow up", tone: "success" },
  { value: "AGAIN", label: "Call Again", sub: "Set the next date and time", tone: "warn" },
];

/**
 * The call on a follow-up of a lead that is already past verification. It never qualifies the
 * lead again: the follow-up is either done (closed in Task Management) or set for a later time.
 */
export function FollowUpCallModal({ lead, onClose }) {
  const viewer = useViewer();
  const toast = useToast();
  const [result, setResult] = useState("DONE");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(tomorrowInput);
  const [remindAt, setRemindAt] = useState("");
  const [busy, setBusy] = useState(false);
  // The follow-up this call answers: my own open one on the lead, else the first open one (undefined while checking).
  const [current, setCurrent] = useState(undefined);

  useEffect(() => {
    let alive = true;
    openFollowUpsFor(lead.id)
      .then((list) => alive && setCurrent(list.find((f) => f.forId === String(viewer.me.id)) || list[0] || null))
      .catch(() => alive && setCurrent(null));
    return () => {
      alive = false;
    };
  }, [lead.id, viewer.me.id]);

  // Only the person a follow-up is for can close it (the server's rule), so anyone else can only move it.
  const mine = !!current && current.forId === String(viewer.me.id);
  const choice = mine ? result : "AGAIN";

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      if (choice === "DONE") {
        await request(`/api/work-tasks/${current.id}/complete`, { method: "POST", body: { completion_note: note.trim() || undefined } });
        await loadWorkspace();
        toast("Follow-up done");
      } else {
        const assignedTo = viewer.persona === "sales_manager" && current ? current.forId : viewer.me.id;
        await addFollowUp(lead.id, { at: new Date(when).toISOString(), note, assignedTo, remindAt });
        toast("Next follow-up set");
      }
      close();
    } catch (err) {
      toast(err.message || "Could not save the follow-up.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Follow-up Call"
      sub="Record how this follow-up call went"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} disabled={current === undefined} icon={choice === "DONE" ? <FiCheck /> : <FiCalendar />} onClick={() => save(close)}>
            {choice === "DONE" ? "Mark Done" : "Set Next Follow-up"}
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      {current && (
        <Note tone="info">
          Follow-up due {dateTime(`${current.date}T${current.time || "09:00"}`)}
          {current.forName ? ` for ${current.forName}` : ""}
          {current.note ? ` - "${current.note}"` : ""}
        </Note>
      )}
      {mine ? (
        <Field label="Result" required>
          <Choice name="result" value={result} onChange={setResult} options={CALL_RESULTS} />
        </Field>
      ) : (
        current !== undefined && (
          <Note tone="warn">{current ? `Only ${current.forName || "the person it is for"} can mark this follow-up done. You can set its next date and time.` : "This lead has no open follow-up. Set one below."}</Note>
        )
      )}
      <Field label="Call Notes" hint="Internal only - the lead provider never sees these.">
        <textarea className="lm-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Customer will confirm after their board meeting." />
      </Field>
      {choice === "AGAIN" && (
        <>
          <Field label="Next Follow-up" required hint="The lead stays in Follow-ups until then.">
            <input className="lm-input" type="datetime-local" value={when} min={toLocalInput()} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <ReminderInput value={remindAt} onChange={setRemindAt} suggest={when} />
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ update for the lead provider */

/** A short update the lead provider sees next to their lead - never internal notes. */
export function ProviderUpdateModal({ lead, onClose }) {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(close) {
    if (busy) return;
    setBusy(true);
    try {
      await sendProviderUpdate(lead.id, message);
      toast("Update sent to the lead provider");
      close();
    } catch (err) {
      toast(err.message || "Could not send the update.", true);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Update Lead Provider"
      sub="A short note the provider sees on their lead"
      onClose={onClose}
      footer={(close) => (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button busy={busy} icon={<FiSend />} onClick={() => save(close)}>
            Send Update
          </Button>
        </>
      )}
    >
      <LeadBar lead={lead} />
      <Note tone="warn">The lead provider sees exactly this text, and is notified. Keep internal details out of it.</Note>
      <Field label="Update" required hint={`${message.length}/300`}>
        <textarea className="lm-textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="e.g. Site visit done - the customer is reviewing our quotation." />
      </Field>
    </Modal>
  );
}
