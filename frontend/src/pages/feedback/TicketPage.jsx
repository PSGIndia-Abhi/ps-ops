import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiCheck, FiChevronDown, FiInbox, FiMail, FiPhoneCall, FiTool, FiTrash2, FiUser, FiPaperclip } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { FEEDBACK_HOME } from "./access";
import {
  ACTIONS,
  OPERATIONS,
  otherParts,
  hasOpsPart,
  markPartDone,
  openPartAttachment,
  markActionDone,
  isAssignedAction,
  getPeople,
  rupees,
  formatDay,
  TICKET_ACTIONS,
  problemNote,
  PRIORITIES,
  PRIORITY,
  endOfDay,
  followUpReady,
  formatDate,
  formatDateTime,
  getRevisitOptions,
  getTicket,
  historyItems,
  isPast,
  monthLabel,
  emailTemplateFor,
  getEmailTemplates,
  openCustomerEmail,
  pendingTab,
  prepareWhatsapp,
  closeTicket,
  deleteTicket,
  ticketStages,
  toLocalInput,
  updateTicket,
} from "./feedbackApi";
import useMe from "../../hooks/useMe";
import { useFeedbackAccess } from "./feedbackContext";
import BookVisitButton from "./BookVisitButton";
import ReopenTicketModal from "./ReopenTicketModal";
import PartFeedbackModal from "./PartFeedbackModal";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";
import { Card, Chip, CustomerCard, ErrorBox, Loading, Modal, PageHead, PriorityChip, Steps, SubmissionAnswers, TicketStatusChip, Timeline, Toast } from "./ui";

const SERVICES = [...pestServices, ...deepCleaningServices];

function formFrom(t) {
  return {
    issue_summary: t.issue_summary || "",
    priority: t.priority,
    // Older next steps are worked as "Book a re-visit" (saved as that once the visit is booked).
    action: t.action === "OTHER" || isAssignedAction(t.action) ? t.action : "SCHEDULE_REVISIT",
    // Site audit / Supervisor visit / Sales: who it is assigned to.
    owner: isAssignedAction(t.action) && t.action_owner ? String(t.action_owner.id) : "",
    due: t.action_due_at ? toLocalInput(t.action_due_at).slice(0, 10) : "",
    note: t.action_note || "",
  };
}

/** The linked re-visit: "Mosquito Fogging, Ant Treatment · Job 2026-871 · Ravi · Scheduled". */
function revisitText(v) {
  const status = v.status ? v.status.charAt(0) + v.status.slice(1).toLowerCase().replace(/_/g, " ") : "";
  return [v.services, `Job ${v.job_code}`, v.technicians || "no technician assigned yet", status].filter(Boolean).join(" · ");
}

/** Services to re-visit: a dropdown of checkboxes (more than one can be ticked). */
function ServicePicker({ picked, onChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);
  const toggle = (s) => onChange(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s]);

  // close the list on a click outside it or Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="fb-svc-pick" ref={ref}>
      <button type="button" className="fb-select fb-svc-toggle" aria-haspopup="listbox" aria-expanded={menuOpen} aria-labelledby="fb-t-svc-label" onClick={() => setMenuOpen((o) => !o)}>
        <span>{picked.length ? picked.join(", ") : "Choose services"}</span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="fb-svc-menu" role="listbox" aria-multiselectable="true" aria-labelledby="fb-t-svc-label">
          {SERVICES.map((s) => (
            <label key={s} className={`fb-svc-opt ${picked.includes(s) ? "is-on" : ""}`}>
              <input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} />
              <span>{s}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
/**
 * The call back to the customer after the work. It is done on the ticket's call page with the same
 * questions ("Open the call"): all answers good closes the ticket (only this closes one); a bad
 * answer keeps the same ticket open and a new re-visit is booked on it. Lists the calls made so far.
 */
function FollowUpCard({ ticket, deptOnly, canClose, onClose }) {
  const done = ticket.history.filter((h) => h.event === "FOLLOWUP_CALL");
  const open = ticket.status === "ACTION_PENDING";
  const ready = followUpReady(ticket);
  const ops = hasOpsPart(ticket);
  const assigned = isAssignedAction(ticket.action);
  const opsWaiting = ops && ticket.action !== "OTHER" && (assigned ? !ticket.action_done : ticket.revisit?.status !== "COMPLETED");
  const waitingFor = [
    opsWaiting
      ? assigned
        ? `${ticket.action_owner?.name || "the assigned person"} to finish the ${ACTIONS[ticket.action].label.toLowerCase()}`
        : ticket.revisit
          ? "the technician to complete the re-visit"
          : "the re-visit to be booked and completed"
      : null,
    ...otherParts(ticket).filter((p) => p.status !== "DONE").map((p) => `${p.label} to finish their part`),
  ].filter(Boolean);
  if (!open && !done.length) return null;

  return (
    <Card title="Follow-up call" aside={open ? "Closes the ticket when the customer is satisfied" : null}>
      <div className="fb-stack" style={{ gap: 14 }}>
        {done.length > 0 && (
          <div className="fb-stack" style={{ gap: 8 }}>
            {done.map((h) => (
              <div key={h.id} className="fb-row" style={{ gap: 8, alignItems: "baseline" }}>
                {(h.note || "").startsWith("Closed with issues") ? (
                  <Chip tone="warn">Closed with issues</Chip>
                ) : (
                  <Chip tone={h.to_status === "CLOSED" ? "ok" : "danger"}>{h.to_status === "CLOSED" ? "Resolved" : "Not resolved"}</Chip>
                )}
                <span className="fb-small">
                  {(h.note || "").replace(/^(Not resolved|Resolved|Closed with issues)( · )?/, "") || "—"}
                  <span className="fb-muted"> · {[formatDateTime(h.created_at), h.changed_by?.name].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {open && (
          <div className="fb-row" style={{ justifyContent: "space-between" }}>
            <span className="fb-small fb-muted" style={{ maxWidth: 440 }}>
              {ready
                ? "The action is taken. Call the customer and ask the feedback questions again (satisfied: the ticket closes), or close the ticket without the call."
                : `Waiting for ${waitingFor.join(" and ") || "the work"}. Then the collector calls the customer and asks the feedback questions again.`}
            </span>
            {deptOnly ? null : ready ? (
              <span className="fb-row" style={{ gap: 8 }}>
                {canClose && (
                  <button type="button" className="fb-btn" onClick={onClose} title="Close without the follow-up call">
                    <FiCheck aria-hidden="true" /> Close the ticket
                  </button>
                )}
                <Link className="fb-btn fb-btn-primary" to={`${FEEDBACK_HOME}/calls/${ticket.request_id}`}>
                  Open the call
                </Link>
              </span>
            ) : (
              <button type="button" className="fb-btn fb-btn-primary" disabled title="Opens when the technician completes the re-visit">
                Open the call
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function TicketPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, userId, departments, deptOnly, ticketsBase } = useFeedbackAccess();
  const canManage = can("FEEDBACK_MANAGE");
  const [partNotes, setPartNotes] = useState({});
  const [partFiles, setPartFiles] = useState({}); // a file attached when a department marks its part done
  const [actionDoneNote, setActionDoneNote] = useState("");
  const [people, setPeople] = useState({ supervisors: [], sales: [] }); // who a step can be assigned to

  const [ticket, setTicket] = useState(null);
  const [form, setForm] = useState(null);
  const [services, setServices] = useState([]); // ticked for the re-visit booking
  const [revisitError, setRevisitError] = useState(""); // shown under the Book a visit button
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clearNotice = useCallback(() => setNotice(""), []);
  const [saving, setSaving] = useState(false);
  // "reopen"; ?reopen=1 (from the call page: the customer has the problem again) opens it at once.
  const [searchParams] = useSearchParams();
  const [modal, setModal] = useState(searchParams.get("reopen") === "1" ? "reopen" : null); // "reopen" | "delete"
  const [modalNote, setModalNote] = useState("");
  const [askPart, setAskPart] = useState(null); // a finished department part: its optional customer feedback
  const [waContact, setWaContact] = useState("");
  const { user } = useMe();
  const [emailTemplates, setEmailTemplates] = useState([]);

  const show = useCallback((t) => {
    setTicket(t);
    setForm(formFrom(t));
    setWaContact((c) => c || t.contacts[0]?.id || "");
  }, []);

  const load = useCallback(() => {
    return getTicket(id)
      .then(show)
      .catch((err) => setError(err.message));
  }, [id, show]);

  useEffect(() => {
    if (!canManage) return;
    getPeople()
      .then((p) => setPeople({ supervisors: p.supervisors || [], sales: p.sales || [] }))
      .catch(() => {});
  }, [canManage]);

  useEffect(() => {
    load();
    getEmailTemplates()
      .then((d) => setEmailTemplates(d.templates))
      .catch(() => {});
  }, [load]);

  // Start with the ticket's own service ticked, when it is one that can be booked.
  const ticketService = ticket?.service_label;
  useEffect(() => {
    if (ticketService && SERVICES.includes(ticketService)) setServices([ticketService]);
  }, [ticketService]);

  if (!ticket || !form) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;

  const open = ticket.status === "ACTION_PENDING";
  const ops = hasOpsPart(ticket);
  // Each other department's team (or a desk manager) finishes its own part.
  const others = otherParts(ticket);
  const canFinish = (p) => open && p.status !== "DONE" && (canManage || departments.includes(p.kind));
  const editable = canManage && open;
  const late = open && ticket.action_due_at && isPast(ticket.action_due_at);
  const canMessage = canManage || ticket.raised_by?.id === userId;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function changes() {
    const before = formFrom(ticket);
    const body = {};
    if (form.issue_summary.trim() !== before.issue_summary.trim()) body.issue_summary = form.issue_summary.trim() || null;
    if (form.priority !== ticket.priority) body.priority = form.priority;
    if (form.action !== before.action) body.action = form.action;
    if (isAssignedAction(form.action) && (form.owner !== before.owner || form.action !== before.action)) body.action_owner_user_id = form.owner ? Number(form.owner) : null;
    if (form.due !== before.due) body.action_due_at = endOfDay(form.due);
    if (form.note.trim() !== before.note.trim()) body.action_note = form.note.trim() || null;
    return body;
  }
  const dirty = Object.keys(changes()).length > 0;
  // "Book a re-visit" needs the visit booked (booking it links it and saves the step).
  const revisitMissing = form.action === "SCHEDULE_REVISIT" && !ticket.revisit_visit_id;
  // Site audit / Supervisor visit / Sales need the person chosen.
  const assignMeta = ACTIONS[form.action]?.assign ? ACTIONS[form.action] : null;
  const ownerMissing = Boolean(assignMeta) && !form.owner;
  // The saved step's assigned person (or a desk manager) marks it done.
  const savedAssigned = isAssignedAction(ticket.action);
  const canFinishAction = open && savedAssigned && !ticket.action_done && (canManage || ticket.action_owner?.id === userId);

  // A visit was just booked from this ticket: link its first visit at the ticket's site as the
  // re-visit. Unsaved edits in the form stay as they are.
  async function linkBooking(jobs) {
    const jobIds = new Set(jobs.map((j) => String(j.id)));
    setRevisitError("");
    try {
      const { visits } = await getRevisitOptions(ticket.id);
      const visit = visits.find((v) => jobIds.has(String(v.job_id)));
      if (!visit) {
        setRevisitError(`That visit was booked for another site, not ${ticket.site.name}, so it isn't linked. Book it again with a ${ticket.site.name} contact.`);
        return;
      }
      const fresh = await getTicket(ticket.id);
      setTicket(await updateTicket(ticket.id, { row_version: fresh.row_version, action: "SCHEDULE_REVISIT", revisit_visit_id: visit.id }));
      setForm((f) => ({ ...f, action: "SCHEDULE_REVISIT" }));
      setNotice(`Re-visit booked and linked: Job ${visit.job_code}.`);
    } catch (err) {
      setRevisitError(`The visit was booked but couldn't be linked: ${err.message}`);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      show(await updateTicket(ticket.id, { row_version: ticket.row_version, ...changes() }));
      setNotice("Changes saved.");
    } catch (err) {
      setError(err.message);
      if (err.status === 409) load();
    } finally {
      setSaving(false);
    }
  }

  async function finishAction() {
    setSaving(true);
    setError("");
    try {
      await markActionDone(ticket.id, actionDoneNote.trim());
      setActionDoneNote("");
      setNotice(`${ACTIONS[ticket.action].label} marked done. The collector can call the customer back once all the work is done.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // A ticket closes only on the follow-up call (the customer confirms); a desk manager can reopen it.
  async function finishPart(p) {
    setSaving(true);
    setError("");
    try {
      const file = partFiles[p.kind] || null;
      if (file && file.size > 10 * 1024 * 1024) throw new Error("The file is too big - up to 10 MB");
      await markPartDone(ticket.id, p.kind, (partNotes[p.kind] || "").trim(), file);
      setPartNotes((n) => ({ ...n, [p.kind]: "" }));
      setPartFiles((f) => ({ ...f, [p.kind]: null }));
      setNotice(`${p.label} part marked done. The collector can call the customer back once all the work is done.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // The action is taken: close without the follow-up call (modalNote = optional note).
  async function closeIt() {
    setSaving(true);
    setError("");
    try {
      show(await closeTicket(ticket.id, ticket.row_version, modalNote.trim() || null));
      setNotice(`${ticket.ticket_number} is closed.`);
      setModal(null);
      setModalNote("");
    } catch (err) {
      setError(err.message);
      setModal(null);
      if (err.status === 409) load();
    } finally {
      setSaving(false);
    }
  }

  // Reopened (with the customer's answers) in ReopenTicketModal.
  function reopened(t) {
    show(t);
    setNotice("Ticket reopened with the customer's answers. Plan the next step on it.");
    setModal(null);
  }

  // A ticket raised by mistake: delete it and go back to its call.
  async function remove() {
    setSaving(true);
    setError("");
    try {
      await deleteTicket(ticket.id, modalNote.trim() || null);
      navigate(`${FEEDBACK_HOME}/calls/${ticket.request_id}`);
    } catch (err) {
      setError(err.message);
      setModal(null);
      setSaving(false);
    }
  }

  async function whatsapp(body, label) {
    const tab = pendingTab();
    setError("");
    try {
      const res = await prepareWhatsapp(ticket.request_id, { ticket_id: ticket.id, ...body });
      tab.go(res.wa_me_url);
      setNotice(`WhatsApp opened for ${label}. Press Send there.`);
      load();
    } catch (err) {
      tab.cancel();
      setError(err.message);
    }
  }

  const fb = ticket.feedback;
  const note = problemNote(ticket.issue_summary, fb?.responses || []);
  // Text written on the ticket beyond the answers and the customer's words (shown in the table).
  const extraNote = note && note.replace(/^["“]|["”]$/g, "").trim() !== (fb?.other_feedback || "").trim() ? note : "";

  return (
    <>
      <PageHead
        title={ticket.ticket_number}
        back={ticketsBase}
        after={
          <>
            <TicketStatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
            {(ticket.parts || []).length > 0 && (
              <span className="fb-dept-chips">
                {ticket.parts.map((p) => (
                  <span key={p.kind} className={`fb-dept-chip ${p.kind === OPERATIONS ? "is-ops" : p.kind === "ACCOUNTS" ? "is-acc" : p.kind === "SALES" ? "is-sales" : "is-other"} ${p.status === "DONE" && p.kind !== OPERATIONS ? "is-done" : ""}`}>
                    {p.label || p.kind}
                    {p.kind !== OPERATIONS && p.status === "DONE" ? " ✓" : ""}
                  </span>
                ))}
              </span>
            )}
          </>
        }
        sub={
          <>
            {ticket.customer.name} · <span className="fb-site-name">{ticket.site.name}</span>
            {ticket.site.city ? `, ${ticket.site.city}` : ""} · {monthLabel(ticket.month)} · raised by {ticket.raised_by?.name || "—"} on {formatDate(ticket.created_at)}
          </>
        }
        actions={
          <>
            {!deptOnly && (
              <Link className="fb-btn" to={`${FEEDBACK_HOME}/calls/${ticket.request_id}`}>
                Open the call
              </Link>
            )}
            {canMessage && !open && (
              <button type="button" className="fb-btn" onClick={() => setModal("reopen")}>
                Reopen
              </button>
            )}
            {canMessage && (
              <button type="button" className="fb-btn fb-btn-danger-outline" onClick={() => setModal("delete")}>
                <FiTrash2 aria-hidden="true" /> Delete
              </button>
            )}
          </>
        }
      />

      <div className="fb-progress-card">
        <Steps steps={ticketStages(ticket)} label="Ticket progress" />
      </div>

      <Toast notice={notice ? { text: notice } : null} onClose={clearNotice} />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}

      <div className="fb-grid-side">
        <div className="fb-stack">
          <Card title="Problem">
            <div className="fb-stack" style={{ gap: 14 }}>
              {/* The service, technician and feedback as small tiles with icons. */}
              <div className="fb-facts">
                <div className="fb-fact">
                  <span className="fb-fact-icon is-blue" aria-hidden="true">
                    <FiTool />
                  </span>
                  <span>
                    <small>Service</small>
                    <b>{ticket.service_label || "Not linked to one visit"}</b>
                  </span>
                </div>
                <div className="fb-fact">
                  <span className="fb-fact-icon is-violet" aria-hidden="true">
                    <FiUser />
                  </span>
                  <span>
                    <small>Technician</small>
                    <b>{ticket.technician?.name || "—"}</b>
                  </span>
                </div>
                <div className="fb-fact">
                  <span className="fb-fact-icon is-green" aria-hidden="true">
                    {fb?.source === "FORM" ? <FiInbox /> : <FiPhoneCall />}
                  </span>
                  <span>
                    <small>Feedback from</small>
                    <b>{fb ? [fb.source === "FORM" ? "Customer form" : "Call", fb.spoke_with_name].filter(Boolean).join(" · ") : "—"}</b>
                    {fb && <em>{formatDateTime(fb.submitted_at)}</em>}
                  </span>
                </div>
                {!open && (
                  <div className="fb-fact">
                    <span className="fb-fact-icon is-green" aria-hidden="true">
                      <FiCheck />
                    </span>
                    <span>
                      <small>Closed</small>
                      <b>{[formatDateTime(ticket.closed_at), ticket.closed_by?.name].filter(Boolean).join(" · ")}</b>
                      {ticket.close_note && <em>“{ticket.close_note}”</em>}
                    </span>
                  </div>
                )}
              </div>
              {fb && (fb.responses.some((r) => r.is_bad) || fb.other_feedback) && <div className="fb-section-label">What the customer reported</div>}
              {/* The answers that show the issue, and the customer's own words. */}
              {fb && (fb.responses.some((r) => r.is_bad) || fb.other_feedback) && <SubmissionAnswers submission={fb} onlyBad />}
              {extraNote && <div style={{ whiteSpace: "pre-line" }}>{extraNote}</div>}
              {!fb && !extraNote && <div className="fb-muted">No details written.</div>}
            </div>
          </Card>

          {others.map((p) => (
            <Card key={p.kind} title={`${p.label}${p.with_invoices ? " · invoice issue" : ""}`} aside={<PriorityChip priority={p.priority || ticket.priority} />}>
              <div className="fb-stack" style={{ gap: 12 }}>
                {(p.issues || []).length > 0 && (
                  <ul className="fb-part-issues">
                    {p.issues.map((i) => (
                      <li key={i.id}>
                        <span className="fb-strong">{i.name}</span>
                        {i.text ? ` - ${i.text}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {(p.issue_summary || !(p.issues || []).length) && <div style={{ whiteSpace: "pre-line" }}>{p.issue_summary || <span className="fb-muted">No details written.</span>}</div>}
                {p.invoices.length > 0 && (
                  <div className="fb-table-wrap">
                    <table className="fb-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.invoices.map((i) => (
                          <tr key={i.id}>
                            <td className="fb-strong">{i.number}</td>
                            <td>{formatDay(i.date)}</td>
                            <td>{rupees(i.amount)}</td>
                            <td className={i.pending > 0 ? "fb-danger-text" : "fb-muted"}>{i.pending > 0 ? rupees(i.pending) : "Paid"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {p.status === "DONE" ? (
                  <div className="fb-part-done">
                    <FiCheck aria-hidden="true" style={{ color: "#16a34a", marginTop: 2 }} />
                    <span>
                      <span className="fb-strong">Done</span> · {p.done_note}
                      <span className="fb-small fb-muted"> · {[formatDateTime(p.done_at), p.done_by?.name].filter(Boolean).join(" · ")}</span>
                      {p.attachment && (
                        <button type="button" className="fb-part-file" onClick={() => openPartAttachment(ticket.id, p.kind).catch((err) => setError(err.message))}>
                          <FiPaperclip aria-hidden="true" /> {p.attachment.name}
                        </button>
                      )}
                    </span>
                  </div>
                ) : canFinish(p) ? (
                  <div className="fb-stack" style={{ gap: 8 }}>
                    <label className="fb-field" htmlFor={`fb-t-part-${p.kind}`}>
                      What was done? <span className="fb-req">*</span>
                      <input
                        id={`fb-t-part-${p.kind}`}
                        className="fb-input"
                        maxLength={500}
                        placeholder={p.with_invoices ? "e.g. Invoice copy sent by email" : "e.g. Spoke to the customer and sorted it out"}
                        value={partNotes[p.kind] || ""}
                        onChange={(e) => setPartNotes((n) => ({ ...n, [p.kind]: e.target.value }))}
                      />
                    </label>
                    <div className="fb-field">
                      <span>
                        Attach a file <span className="fb-small fb-muted">(optional, up to 10 MB)</span>
                      </span>
                      <label className={`fb-file-pick ${partFiles[p.kind] ? "has-file" : ""}`}>
                        <FiPaperclip aria-hidden="true" />
                        <span>{partFiles[p.kind] ? partFiles[p.kind].name : p.with_invoices ? "Choose a file, e.g. the invoice copy sent" : "Choose a file (photo, PDF, document)"}</span>
                        <input type="file" onChange={(e) => setPartFiles((f) => ({ ...f, [p.kind]: e.target.files?.[0] || null }))} />
                        {partFiles[p.kind] && (
                          <button
                            type="button"
                            className="fb-file-x"
                            aria-label="Remove the file"
                            onClick={(e) => {
                              e.preventDefault();
                              setPartFiles((f) => ({ ...f, [p.kind]: null }));
                            }}
                          >
                            ×
                          </button>
                        )}
                      </label>
                    </div>
                    <div>
                      <button type="button" className="fb-btn fb-btn-primary" disabled={saving || !(partNotes[p.kind] || "").trim()} onClick={() => finishPart(p)}>
                        <FiCheck aria-hidden="true" /> {saving ? "Saving…" : `Mark ${p.label} done`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="fb-small fb-muted">{open ? `Waiting for ${p.label}.` : "Closed."}</div>
                )}
                {/* Optional: once the department is done, ask the customer how it went. */}
                {p.status === "DONE" && p.kind !== OPERATIONS && (
                  p.customer_feedback ? (
                    <div className={`fb-part-fb ${p.customer_feedback.has_issue ? "is-bad" : "is-good"}`}>
                      <div className="fb-part-fb-head">
                        <b>Customer feedback · {p.customer_feedback.has_issue ? "Not happy" : "All good"}</b>
                        <span className="fb-small fb-muted">
                          {[p.customer_feedback.spoke_with_name, formatDateTime(p.customer_feedback.submitted_at)].filter(Boolean).join(" · ")}
                        </span>
                        {canMessage && (
                          <button type="button" className="fb-btn fb-btn-sm" onClick={() => setAskPart(p)}>
                            Ask again
                          </button>
                        )}
                      </div>
                      <SubmissionAnswers submission={p.customer_feedback} />
                    </div>
                  ) : (
                    canMessage && (
                      <button type="button" className="fb-part-ask" onClick={() => setAskPart(p)}>
                        <FiPhoneCall aria-hidden="true" />
                        <span>
                          <b>Call the customer about {p.label}</b>
                          <small>Optional · ask how it went with {p.label}'s questions</small>
                        </span>
                      </button>
                    )
                  )
                )}
              </div>
            </Card>
          ))}

          {ops && (
          <Card title="Action" aside={editable ? null : open ? "Only the desk managers can change this" : "Reopen the ticket to change it"}>
            {editable ? (
              <div className="fb-stack" style={{ gap: 14 }}>
                <div className={`fb-action-grid ${assignMeta ? "has-owner" : ""}`}>
                  <label className="fb-field" htmlFor="fb-t-priority">
                    Priority
                    <select id="fb-t-priority" className="fb-select" value={form.priority} onChange={set("priority")}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY[p].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fb-field" htmlFor="fb-t-action">
                    Next step
                    <select id="fb-t-action" className="fb-select" value={form.action} onChange={set("action")}>
                      {TICKET_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {ACTIONS[a].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fb-field" htmlFor="fb-t-due">
                    Due by {late && <span className="fb-danger-text">· overdue</span>}
                    <input id="fb-t-due" type="date" className="fb-input" value={form.due} onChange={set("due")} />
                  </label>
                {assignMeta && (
                  <label className="fb-field" htmlFor="fb-t-owner">
                    <span>
                      Assign to ({assignMeta.who.toLowerCase()}) <span className="fb-req">*</span>
                    </span>
                    <select id="fb-t-owner" className="fb-select" value={form.owner} onChange={set("owner")}>
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
                </div>
                {assignMeta && <div className="fb-small fb-muted" style={{ marginTop: -6 }}>The {assignMeta.who.toLowerCase()} sees this ticket in their Feedback tickets and marks it done; then the customer is called back.</div>}
                {form.action === "OTHER" && (
                  <label className="fb-field" htmlFor="fb-t-note">
                    <span>
                      What will be done? <span className="fb-req">*</span>
                    </span>
                    <textarea id="fb-t-note" className="fb-textarea" rows={3} maxLength={2000} placeholder="Type what will be done" value={form.note} onChange={set("note")} />
                  </label>
                )}
                {form.action === "SCHEDULE_REVISIT" && (
                  <div className="fb-field">
                    <span id="fb-t-svc-label">
                      Technician re-visit <span className="fb-req">*</span>
                    </span>
                    <span className="fb-field-hint">
                      {ticket.revisit
                        ? `Booked: ${revisitText(ticket.revisit)}`
                        : `Tick the services, then book the visit for ${ticket.site.name}. It is linked to this ticket, which shows "Work done" once the visit is completed.`}
                    </span>
                    <ServicePicker picked={services} onChange={setServices} />
                    {revisitError && <ErrorBox error={revisitError} />}
                    <div>
                      <BookVisitButton
                        onBooked={linkBooking}
                        contactId={ticket.contacts[0]?.id}
                        siteId={ticket.site.id}
                        services={services}
                        label={ticket.revisit ? "Book another visit" : "Book a visit"}
                        className={`fb-btn ${ticket.revisit ? "" : "fb-btn-primary"}`}
                      />
                    </div>
                  </div>
                )}
                {form.action !== "OTHER" && (
                  <label className="fb-field" htmlFor="fb-t-note">
                    Note
                    <textarea id="fb-t-note" className="fb-textarea" rows={2} maxLength={2000} value={form.note} onChange={set("note")} />
                  </label>
                )}
                <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                  {dirty && (
                    <button type="button" className="fb-btn" onClick={() => setForm(formFrom(ticket))} disabled={saving}>
                      Undo changes
                    </button>
                  )}
                  {revisitMissing && dirty && <span className="fb-small fb-muted">Book the re-visit above to save.</span>}
                  {ownerMissing && dirty && <span className="fb-small fb-muted">Choose the {assignMeta.who.toLowerCase()} to save.</span>}
                  <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={saving || !dirty || revisitMissing || ownerMissing}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              // Read-only: the same details as plain text, so it doesn't look like a form to fill in.
              <dl className="fb-kv">
                <dt>Priority</dt>
                <dd>
                  <PriorityChip priority={ticket.priority} />
                </dd>
                <dt>Next step</dt>
                <dd>{ACTIONS[ticket.action]?.label || ticket.action}</dd>
                {ticket.action_note && (
                  <>
                    <dt>{ticket.action === "OTHER" ? "What will be done" : "Note"}</dt>
                    <dd style={{ whiteSpace: "pre-line" }}>{ticket.action_note}</dd>
                  </>
                )}
                <dt>Due by</dt>
                <dd>
                  {ticket.action_due_at ? formatDate(ticket.action_due_at) : "No date set"}
                  {late && <span className="fb-danger-text"> · overdue</span>}
                </dd>
                {savedAssigned ? (
                  <>
                    <dt>Assigned to</dt>
                    <dd>{ticket.action_owner?.name || "Not assigned"}</dd>
                  </>
                ) : (
                  <>
                    <dt>Technician re-visit</dt>
                    <dd>{ticket.revisit ? revisitText(ticket.revisit) : "Not booked yet"}</dd>
                  </>
                )}
              </dl>
            )}
            {/* Site audit / Supervisor visit / Sales: the assigned person marks it done. */}
            {savedAssigned && (
              <div className="fb-assigned-step">
                {ticket.action_done ? (
                  <div className="fb-part-done">
                    <FiCheck aria-hidden="true" style={{ color: "#16a34a", marginTop: 2 }} />
                    <span>
                      <span className="fb-strong">{ACTIONS[ticket.action].label} done</span> · {ticket.action_done.note}
                      <span className="fb-small fb-muted"> · {[formatDateTime(ticket.action_done.at), ticket.action_done.by?.name].filter(Boolean).join(" · ")}</span>
                    </span>
                  </div>
                ) : canFinishAction ? (
                  <div className="fb-stack" style={{ gap: 8 }}>
                    <label className="fb-field" htmlFor="fb-t-action-done">
                      <span>
                        What was done in the {ACTIONS[ticket.action].label.toLowerCase()}? <span className="fb-req">*</span>
                      </span>
                      <input
                        id="fb-t-action-done"
                        className="fb-input"
                        maxLength={500}
                        placeholder={ticket.action === "SALES" ? "e.g. Met the customer and explained the plan" : "e.g. Checked the site, drains cleaned"}
                        value={actionDoneNote}
                        onChange={(e) => setActionDoneNote(e.target.value)}
                      />
                    </label>
                    <div>
                      <button type="button" className="fb-btn fb-btn-primary" disabled={saving || !actionDoneNote.trim()} onClick={finishAction}>
                        <FiCheck aria-hidden="true" /> {saving ? "Saving…" : `Mark ${ACTIONS[ticket.action].label.toLowerCase()} done`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="fb-small fb-muted">{open ? `Waiting for ${ticket.action_owner?.name || "the assigned person"} to mark it done.` : "Closed."}</div>
                )}
              </div>
            )}
          </Card>
          )}

          <FollowUpCard ticket={ticket} deptOnly={deptOnly} canClose={canMessage} onClose={() => setModal("close")} />
        </div>

        <div className="fb-stack">
          <CustomerCard customer={ticket.customer} site={ticket.site} contacts={ticket.contacts} feedback={ticket.feedback} />

          {!deptOnly && (
          <Card title="Email the customer" aside="Optional">
            <div className="fb-stack" style={{ gap: 8 }}>
              <button
                type="button"
                className="fb-btn"
                disabled={!emailTemplateFor(emailTemplates, open ? "ISSUE_RECEIVED" : "ISSUE_RESOLVED")}
                onClick={() =>
                  openCustomerEmail(
                    emailTemplateFor(emailTemplates, open ? "ISSUE_RECEIVED" : "ISSUE_RESOLVED"),
                    {
                      customer: ticket.customer.name,
                      site: ticket.site.name,
                      month: ticket.month,
                      name: ticket.feedback?.spoke_with_name,
                      ticketNumber: ticket.ticket_number,
                      issue: ticket.issue_summary,
                      revisitDate: ticket.revisit && ticket.revisit.status !== "COMPLETED" ? ticket.revisit.date : null,
                      closeNote: ticket.close_note,
                      sender: user?.name,
                    },
                    ticket.contacts,
                  )
                }
              >
                <FiMail /> {open ? "Issue received email" : "Issue resolved email"}
              </button>
            </div>
          </Card>
          )}

          {/* Open: "Ticket raised", and "Re-visit booked" once a visit is linked. Closed: "Issue resolved". */}
          {canMessage && (
            <Card title="WhatsApp the customer">
              <div className="fb-stack" style={{ gap: 10 }}>
                {ticket.contacts.length > 0 ? (
                  <div className="fb-stack" style={{ gap: 8 }}>
                    <select className="fb-select" value={waContact} onChange={(e) => setWaContact(e.target.value)} aria-label="Customer contact">
                      {ticket.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone.trim()}` : ""}
                        </option>
                      ))}
                    </select>
                    {(open ? [["TICKET_RAISED", "Ticket raised"], ...(ticket.revisit ? [["REVISIT_BOOKED", "Re-visit booked"]] : [])] : [["ISSUE_RESOLVED", "Issue resolved"]]).map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        className="fb-btn fb-btn-wa"
                        disabled={!waContact}
                        onClick={() => whatsapp({ template_code: code, recipient_type: "CUSTOMER", contact_id: waContact }, "the customer")}
                      >
                        <FaWhatsapp /> {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="fb-small fb-muted">This site has no customer contacts saved.</div>
                )}
              </div>
            </Card>
          )}

          {ticket.whatsapp_messages.length > 0 && (
            <Card title="Messages sent">
              <div className="fb-stack" style={{ gap: 10 }}>
                {ticket.whatsapp_messages.map((m) => (
                  <div key={m.id} className="fb-small">
                    <div className="fb-strong">
                      To {m.recipient_type.toLowerCase()} · {m.phone}
                    </div>
                    <div className="fb-muted">
                      {formatDateTime(m.opened_at)}
                      {m.opened_by ? ` · ${m.opened_by.name}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="History" aside={`${ticket.history.length} event${ticket.history.length === 1 ? "" : "s"}`}>
            <Timeline items={historyItems(ticket.history)} limit={5} />
          </Card>
        </div>
      </div>

      {askPart && (
        <PartFeedbackModal
          ticket={ticket}
          part={askPart}
          onClose={() => setAskPart(null)}
          onDone={(t) => {
            show(t);
            setNotice(`${askPart.label} feedback saved.`);
            setAskPart(null);
          }}
        />
      )}
      {modal === "reopen" && !open && canMessage && <ReopenTicketModal ticket={ticket} onDone={reopened} onClose={() => setModal(null)} />}
      {modal === "close" && open && canMessage && (
        <Modal
          title={`Close ${ticket.ticket_number}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-ok" onClick={closeIt} disabled={saving}>
                {saving ? "Closing…" : "Close the ticket"}
              </button>
            </>
          }
        >
          <div className="fb-stack" style={{ gap: 12 }}>
            <div className="fb-small fb-muted">Every team has finished its work. The ticket closes without the follow-up call; you can reopen it later if needed.</div>
            <label className="fb-field" htmlFor="fb-t-close-note">
              Note (optional)
              <textarea id="fb-t-close-note" className="fb-textarea" rows={2} maxLength={400} placeholder="e.g. Customer said on WhatsApp it is sorted" value={modalNote} onChange={(e) => setModalNote(e.target.value)} />
            </label>
          </div>
        </Modal>
      )}

      {modal === "delete" && canMessage && (
        <Modal
          title={`Delete ${ticket.ticket_number}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-danger" onClick={remove} disabled={saving}>
                <FiTrash2 aria-hidden="true" /> {saving ? "Deleting…" : "Delete ticket"}
              </button>
            </>
          }
        >
          <div className="fb-alert fb-alert-danger">
            <span>The ticket and its history are removed for good. The call and its feedback answers stay.</span>
          </div>
          <label className="fb-field" htmlFor="fb-t-del-note">
            Why delete it? (optional)
            <textarea id="fb-t-del-note" className="fb-textarea" rows={2} maxLength={400} value={modalNote} onChange={(e) => setModalNote(e.target.value)} />
          </label>
        </Modal>
      )}
    </>
  );
}
