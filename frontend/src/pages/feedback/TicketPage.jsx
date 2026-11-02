import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiCheck, FiChevronDown, FiMail } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { FEEDBACK_HOME } from "./access";
import {
  ACTIONS,
  TICKET_ACTIONS,
  problemNote,
  PRIORITIES,
  PRIORITY,
  closeTicket,
  endOfDay,
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
  reopenTicket,
  ticketStages,
  toLocalInput,
  updateTicket,
} from "./feedbackApi";
import useMe from "../../hooks/useMe";
import { useFeedbackAccess } from "./feedbackContext";
import BookVisitButton from "./BookVisitButton";
import { deepCleaningServices, pestServices } from "../../components/CreateBookingModal";
import { Card, Chip, ErrorBox, Loading, Modal, PageHead, PriorityChip, Steps, TicketStatusChip, Timeline } from "./ui";

const SERVICES = [...pestServices, ...deepCleaningServices];

function formFrom(t) {
  return {
    issue_summary: t.issue_summary || "",
    priority: t.priority,
    action: t.action === "RESOLVED_ON_CALL" ? "ESCALATE_OPERATIONS" : t.action,
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

export default function TicketPage() {
  const { id } = useParams();
  const { can, userId } = useFeedbackAccess();
  const canManage = can("FEEDBACK_MANAGE");

  const [ticket, setTicket] = useState(null);
  const [form, setForm] = useState(null);
  const [services, setServices] = useState([]); // ticked for the re-visit booking
  const [revisitError, setRevisitError] = useState(""); // shown under the Book a visit button
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null); // "close" | "reopen"
  const [modalNote, setModalNote] = useState("");
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
    if (form.due !== before.due) body.action_due_at = endOfDay(form.due);
    if (form.note.trim() !== before.note.trim()) body.action_note = form.note.trim() || null;
    return body;
  }
  const dirty = Object.keys(changes()).length > 0;
  // "Book a re-visit" needs the visit booked (booking it links it and saves the step).
  const revisitMissing = form.action === "SCHEDULE_REVISIT" && !ticket.revisit_visit_id;

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

  async function closeOrReopen() {
    setSaving(true);
    setError("");
    try {
      const t = modal === "close" ? await closeTicket(ticket.id, ticket.row_version, modalNote.trim() || null) : await reopenTicket(ticket.id, ticket.row_version, modalNote.trim());
      show(t);
      setNotice(modal === "close" ? "Ticket closed." : "Ticket reopened.");
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

  return (
    <>
      <PageHead
        crumb={
          <>
            <Link to={`${FEEDBACK_HOME}/tickets`}>Tickets</Link> › {ticket.ticket_number}
          </>
        }
        title={ticket.ticket_number}
        back={`${FEEDBACK_HOME}/tickets`}
        after={
          <>
            <TicketStatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
          </>
        }
        sub={`${ticket.customer.name} · ${ticket.site.name}${ticket.site.city ? `, ${ticket.site.city}` : ""} · ${monthLabel(ticket.month)} · raised by ${ticket.raised_by?.name || "—"} on ${formatDate(ticket.created_at)}`}
        actions={
          <>
            <Link className="fb-btn" to={`${FEEDBACK_HOME}/calls/${ticket.request_id}`}>
              Open the call
            </Link>
            {canManage && open && (
              <button type="button" className="fb-btn fb-btn-ok" onClick={() => setModal("close")}>
                <FiCheck /> Close ticket
              </button>
            )}
            {canManage && !open && (
              <button type="button" className="fb-btn" onClick={() => setModal("reopen")}>
                Reopen
              </button>
            )}
          </>
        }
      />

      <div className="fb-progress-card">
        <Steps steps={ticketStages(ticket)} label="Ticket progress" />
      </div>

      {notice && (
        <div className="fb-alert fb-alert-ok" role="status" style={{ marginBottom: 16 }}>
          <FiCheck aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" className="fb-btn fb-btn-sm fb-btn-link" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}

      <div className="fb-grid-side">
        <div className="fb-stack">
          <Card title="Problem">
            <div className="fb-stack" style={{ gap: 12 }}>
              {note && <div style={{ fontSize: 15, whiteSpace: "pre-line" }}>{note}</div>}
              {fb && fb.responses.some((r) => r.is_bad) && (
                <div className="fb-row" style={{ gap: 6 }}>
                  {fb.responses
                    .filter((r) => r.is_bad)
                    .map((r) => (
                      <Chip key={r.question_id} tone="danger">
                        {r.question} · {r.answer}
                      </Chip>
                    ))}
                </div>
              )}
              {!note && !fb?.responses.some((r) => r.is_bad) && <div className="fb-muted">No summary written.</div>}
              <dl className="fb-kv">
                <dt>Service</dt>
                <dd>{ticket.service_label || "Not linked to one visit"}</dd>
                <dt>Technician</dt>
                <dd>{ticket.technician?.name || "—"}</dd>
                <dt>Feedback from</dt>
                <dd>{fb ? `${fb.source === "FORM" ? "Customer form" : "Call"}${fb.spoke_with_name ? ` · ${fb.spoke_with_name}` : ""} · ${formatDateTime(fb.submitted_at)}` : "—"}</dd>
                {!open && (
                  <>
                    <dt>Closed</dt>
                    <dd>
                      {formatDateTime(ticket.closed_at)}
                      {ticket.closed_by ? ` · ${ticket.closed_by.name}` : ""}
                      {ticket.close_note ? ` · “${ticket.close_note}”` : ""}
                    </dd>
                  </>
                )}
              </dl>
              {fb?.other_feedback && <div className="fb-muted">Customer said: “{fb.other_feedback}”</div>}
            </div>
          </Card>

          <Card title="Action" aside={editable ? null : open ? "Only the desk managers can change this" : "Reopen the ticket to change it"}>
            {editable ? (
              <div className="fb-stack" style={{ gap: 14 }}>
                <div className="fb-form-grid">
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
                      {(TICKET_ACTIONS.includes(ticket.action) ? TICKET_ACTIONS : [ticket.action, ...TICKET_ACTIONS]).map((a) => (
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
                </div>
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
                <label className="fb-field" htmlFor="fb-t-summary">
                  Problem summary
                  <textarea id="fb-t-summary" className="fb-textarea" rows={2} maxLength={500} value={form.issue_summary} onChange={set("issue_summary")} />
                </label>
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
                  <button type="button" className="fb-btn fb-btn-primary" onClick={save} disabled={saving || !dirty || revisitMissing}>
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
                <dt>Technician re-visit</dt>
                <dd>{ticket.revisit ? revisitText(ticket.revisit) : "Not booked yet"}</dd>
              </dl>
            )}
          </Card>
        </div>

        <div className="fb-stack">
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
              <div className="fb-small fb-muted">
                {open ? "Tell the customer their concern is registered." : "Tell the customer the concern is resolved."} Opens Gmail with the email written; edit it there if needed.
              </div>
            </div>
          </Card>

          {canMessage && (
            <Card title="WhatsApp the customer">
              <div className="fb-stack" style={{ gap: 10 }}>
                {ticket.contacts.length > 0 ? (
                  <div className="fb-row" style={{ gap: 8 }}>
                    <select className="fb-select fb-grow" value={waContact} onChange={(e) => setWaContact(e.target.value)} aria-label="Customer contact">
                      {ticket.contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone.trim()}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="fb-btn fb-btn-wa"
                      disabled={!waContact}
                      onClick={() => whatsapp({ template_code: "REVISIT_BOOKED", recipient_type: "CUSTOMER", contact_id: waContact }, "the customer")}
                    >
                      <FaWhatsapp /> Re-visit booked
                    </button>
                  </div>
                ) : (
                  <div className="fb-small fb-muted">This site has no customer contacts saved.</div>
                )}
                <div className="fb-small fb-muted">Tell the customer the re-visit is booked. The message text comes from Masters › Templates.</div>
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

      {modal && (
        <Modal
          title={modal === "close" ? `Close ${ticket.ticket_number}` : `Reopen ${ticket.ticket_number}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`fb-btn ${modal === "close" ? "fb-btn-ok" : "fb-btn-dark"}`}
                onClick={closeOrReopen}
                disabled={saving || (modal === "reopen" && !modalNote.trim())}
              >
                {saving ? "Saving…" : modal === "close" ? "Close ticket" : "Reopen ticket"}
              </button>
            </>
          }
        >
          <label className="fb-field" htmlFor="fb-t-modal-note">
            {modal === "close" ? "What was done? (optional)" : "Why is it reopened?"}
            <textarea id="fb-t-modal-note" className="fb-textarea" rows={3} maxLength={500} value={modalNote} onChange={(e) => setModalNote(e.target.value)} />
          </label>
          {modal === "reopen" && ticket.action === "RESOLVED_ON_CALL" && <div className="fb-small fb-muted">It was resolved on the call, so it reopens as "Escalate to operations".</div>}
        </Modal>
      )}
    </>
  );
}
