import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiCheck, FiEdit2, FiMail } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import { FEEDBACK_HOME } from "./access";
import {
  CALL_OUTCOMES,
  PRIORITY,
  VISIT_STATUS,
  callStagesFromCall,
  finishCall,
  formatDateTime,
  formatDay,
  getCall,
  getPeople,
  getQuestions,
  getSettings,
  giveCall,
  historyItems,
  monthLabel,
  periodText,
  emailTemplateFor,
  getEmailTemplates,
  openCustomerEmail,
  pendingTab,
  questionsFor,
  modeBody,
  modeCounts as countModes,
  prepareWhatsapp,
  raiseTicket,
  addCallContact,
  updateCallContact,
  recordAttempt,
  recordFollowUp,
  closeTicket,
  getTicket,
  saveCallFeedback,
  sendFormLink,
  suggestedPriority,
} from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { WrongNumberRequest } from "./NumberRequests";
import useMe from "../../hooks/useMe";
import RaiseTicketModal from "./RaiseTicketModal";
import { problemNote } from "./feedbackApi";
import { AnswerButtons, CallButton, CallStatusChip, Card, Chip, CustomerCard, ErrorBox, FeedbackRound, Loading, Modal, PageHead, PriorityChip, QuestionModePicker, QuestionProgress, ResultChip, Segmented, Steps, TicketStatusChip, Timeline, Toast } from "./ui";

const OTHER = "other";

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "Q? Answer; Q? Answer" + the customer's own words - the default ticket text. */
// The default "What is the problem?" text: the customer's own words. The bad answers are kept with
// the ticket's feedback and shown as a table, so they aren't repeated in the text.
function issueText(responses, other) {
  return (other || "").slice(0, 500);
}

/** The digits of a phone number, at most 10 (the field takes a 10-digit mobile number). */
const tenDigits = (v) => String(v || "").replace(/\D/g, "").slice(0, 10);

export default function CallPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, userId } = useFeedbackAccess();

  const [call, setCall] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [otherEnabled, setOtherEnabled] = useState(true);
  const [people, setPeople] = useState({ owners: [], collectors: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  const [editing, setEditing] = useState(null); // { id, name, phone, role, email } - a contact being corrected

  // call result
  const [contactKey, setContactKey] = useState("");
  const [otherPhone, setOtherPhone] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherRole, setOtherRole] = useState(""); // position, saved as contacts.role
  const [otherEmail, setOtherEmail] = useState("");
  const [outcome, setOutcome] = useState(null); // null = show the last saved result
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // feedback
  const [answers, setAnswers] = useState({});
  // Which questions to ask: GENERAL, SERVICE (for the month's services) or BOTH.
  const [qMode, setQMode] = useState("BOTH");
  const [spokeWith, setSpokeWith] = useState("");
  const [other, setOther] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null); // "ticket-new" | "ticket-later" | "no-ticket" | "finish" | "give"
  const [finishNote, setFinishNote] = useState("");
  const [closeNote, setCloseNote] = useState(""); // closing the ticket without the follow-up call
  const [giveTo, setGiveTo] = useState("");
  const { user } = useMe();
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [visitFilter, setVisitFilter] = useState("");
  const [ticketWaContact, setTicketWaContact] = useState(""); // "" = the default contact

  const load = useCallback(() => {
    return getCall(id)
      .then((c) => {
        setCall(c);
        // A right number just added by the service coordinator is the one to call next.
        const fresh = freshNumberRequest(c);
        setContactKey((k) => (fresh?.right?.contact_id && c.contacts.some((x) => x.id === fresh.right.contact_id) ? fresh.right.contact_id : k || (c.contacts[0] ? c.contacts[0].id : OTHER)));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
    getQuestions()
      .then((d) => setQuestions(d.questions))
      .catch((err) => setError(err.message));
    getSettings()
      .then((d) => setOtherEnabled(d.settings.other_text_enabled))
      .catch(() => {});
    getPeople()
      .then(setPeople)
      .catch(() => {});
    getEmailTemplates()
      .then((d) => setEmailTemplates(d.templates))
      .catch(() => {});
  }, [load]);

  const contact = call?.contacts.find((c) => c.id === contactKey) || null;
  // "Spoke with" starts as the picked contact's name; it can be edited.
  useEffect(() => {
    if (contact?.name) setSpokeWith(contact.name);
  }, [contact?.id, contact?.name]);
  // The last saved call result stays selected; Save is on only after it is changed (or a new person is called).
  const savedAttempt = call?.call_attempts?.[0] || null;
  const shownOutcome = outcome ?? savedAttempt?.outcome ?? "ANSWERED";
  const attemptChanged =
    !savedAttempt ||
    shownOutcome !== savedAttempt.outcome ||
    (contact ? contact.id !== savedAttempt.contact_id : Boolean(otherPhone.trim()) && otherPhone.trim() !== savedAttempt.phone);
  const mine = call?.collector?.id === userId;
  const canWork = Boolean(call) && call.status !== "DONE" && (mine || can("FEEDBACK_MANAGE"));
  const canRaiseLater = Boolean(call?.submissions?.length) && (mine || can("FEEDBACK_MANAGE"));
  const latest = call?.submissions?.find((s) => s.is_latest) || call?.submissions?.[0] || null;
  const firstTicket = call?.tickets?.[0] || null; // a call has one ticket
  // Several contacts can be marked primary; only the first is shown as Primary.
  const primaryId = call?.contacts?.find((c) => c.is_primary)?.id;
  // The right number from the service coordinator (not called yet): under the wrong one, marked New.
  const freshRequest = call ? freshNumberRequest(call) : null;
  const newContactId = freshRequest?.right?.contact_id || null;
  const contactsShown = (() => {
    const list = call?.contacts || [];
    const added = list.find((c) => c.id === newContactId);
    if (!added) return list;
    const rest = list.filter((c) => c.id !== newContactId);
    const at = rest.findIndex((c) => c.id === freshRequest.wrong?.contact_id);
    return at < 0 ? [...rest, added] : [...rest.slice(0, at + 1), added, ...rest.slice(at + 1)];
  })();
  // The ticket's work is done: call the customer back with the same questions (closes it when all good).
  const followUpTicket = call?.tickets?.find((t) => t.follow_up_due) || null;
  const canFollowUp = Boolean(followUpTicket) && (mine || can("FEEDBACK_MANAGE"));
  // Feedback given after the ticket was raised = the follow-up calls (oldest first); before = the first call.
  const ticketAt = firstTicket ? new Date(firstTicket.created_at).getTime() : Infinity;
  const bySubmitted = [...(call?.submissions || [])].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  const followUpSubs = bySubmitted.filter((s) => new Date(s.submitted_at).getTime() > ticketAt);
  const firstFeedback = bySubmitted.filter((s) => new Date(s.submitted_at).getTime() <= ticketAt).pop() || null;

  // The services the site had this month, and the questions asked for the picked mode.
  const monthServices = useMemo(() => [...new Set((call?.visits || []).map((v) => v.service).filter(Boolean))], [call]);
  const asked = useMemo(() => questionsFor(questions, qMode, monthServices), [questions, qMode, monthServices]);
  const modeCounts = useMemo(
    () => countModes(questions, monthServices, []),
    [questions, monthServices],
  );

  // answers to the asked questions as response rows with the master's flags (for the ticket)
  const chosen = useMemo(
    () =>
      asked
        .filter((q) => answers[q.id])
        .map((q) => {
          const o = q.options.find((x) => x.id === answers[q.id]);
          return { question_id: q.id, option_id: o.id, question: q.question_text, answer: o.label, is_bad: o.is_bad, suggested_priority: o.is_bad ? o.suggested_priority : null };
        }),
    [asked, answers],
  );
  const bad = chosen.filter((r) => r.is_bad);
  // Required questions must be answered; the others can be skipped.
  const missing = asked.filter((q) => q.is_required && !answers[q.id]);
  const who = spokeWith.trim() || contact?.name || otherName.trim();

  function flash(text, tone = "ok") {
    setNotice({ text, tone });
  }

  function pickAnswer(questionId, optionId) {
    if (!startedAt) setStartedAt(nowStamp());
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
  }

  function phoneTarget() {
    if (contact) return { contact_id: contact.id };
    if (!otherPhone.trim()) throw new Error("Enter the phone number you called");
    if (!otherName.trim()) throw new Error("Enter the name of the person at this number");
    return { phone: otherPhone.trim(), contact_name: otherName.trim() };
  }

  // Another number -> one of the site's contacts, then picked for this call.
  async function saveContact() {
    setSavingContact(true);
    setError("");
    try {
      const c = await addCallContact(id, {
        name: otherName.trim(),
        phone: otherPhone.trim(),
        role: otherRole.trim() || null,
        email: otherEmail.trim() || null,
      });
      await load();
      setContactKey(c.id);
      setOtherPhone("");
      setOtherName("");
      setOtherRole("");
      setOtherEmail("");
      flash(c.created ? `${c.name} saved to ${call.site.name}'s contacts.` : `This number is already saved as ${c.name}. Picked it.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingContact(false);
    }
  }

  async function saveEdit() {
    setSavingContact(true);
    setError("");
    try {
      const c = await updateCallContact(id, editing.id, {
        name: editing.name.trim(),
        phone: editing.phone,
        role: editing.role.trim() || null,
        email: editing.email.trim() || null,
      });
      setEditing(null);
      await load();
      flash(`${c.name} updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingContact(false);
    }
  }

  async function saveAttempt() {
    setSavingAttempt(true);
    setError("");
    try {
      const res = await recordAttempt(id, { ...phoneTarget(), outcome: shownOutcome });
      setOutcome(null);
      // Another number is now one of the site's contacts: pick it.
      if (res.contact_id) setContactKey(res.contact_id);
      setOtherPhone("");
      setOtherName("");
      if (shownOutcome === "ANSWERED") flash("Call saved. Fill in the customer's answers below.");
      else if (res.offer_form_link) flash("Call saved. The customer didn't answer. You can send the feedback form on WhatsApp.", "warn");
      else flash(res.next_call_at ? `Call saved. Call back ${formatDateTime(res.next_call_at)}.` : "Call saved.");
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSavingAttempt(false);
    }
  }

  function feedbackBody() {
    if (!who) throw new Error("Choose or type who gave the feedback");
    if (missing.length) throw new Error(`Answer "${missing[0].question_text}"`);
    if (!chosen.length) throw new Error("Answer at least one question");
    return {
      // Linked to the contact while the name is theirs; an edited name is someone else at the site.
      ...(contact && spokeWith.trim() === contact.name ? { contact_id: contact.id } : {}),
      spoke_with_name: who,
      responses: chosen.map((r) => ({ question_id: r.question_id, option_id: r.option_id })),
      other_feedback: otherEnabled ? other.trim() || null : null,
      started_at: startedAt,
      ...modeBody(qMode),
    };
  }

  async function saveGood(extra = {}) {
    setSaving(true);
    setError("");
    try {
      const res = await saveCallFeedback(id, { ...feedbackBody(), ...extra });
      setModal(null);
      flash(res.ticket ? `Feedback saved and ticket ${res.ticket.ticket_number} raised. The call is done.` : "Feedback saved. The call is done.");
      setAnswers({});
      setOther("");
      await load();
    } catch (err) {
      setError(err.message);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  // The action is taken (every team finished): close the ticket without calling the customer back.
  async function closeWithoutCall() {
    setSaving(true);
    setError("");
    try {
      const t = await getTicket(followUpTicket.id);
      await closeTicket(followUpTicket.id, t.row_version, closeNote.trim() || null);
      flash(`${followUpTicket.ticket_number} is closed.`, "ok");
      setModal(null);
      setCloseNote("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // closeAnyway: bad answers, but close the ticket all the same (e.g. after several re-visits).
  async function saveFollowUp(closeAnyway = false) {
    setSaving(true);
    setError("");
    try {
      const res = await recordFollowUp(followUpTicket.id, { ...feedbackBody(), close_anyway: closeAnyway });
      flash(
        res.resolved
          ? `The customer is satisfied. ${res.ticket_number} is closed.`
          : res.closed
            ? `${res.ticket_number} is closed, with the answers saved.`
            : `Not resolved yet. ${res.ticket_number} stays open: book another re-visit on it.`,
        res.closed ? "ok" : "warn",
      );
      setAnswers({});
      setOther("");
      setSpokeWith("");
      setStartedAt(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openTicketForNewFeedback() {
    try {
      feedbackBody();
      setError("");
      setModal("ticket-new");
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendLink() {
    if (!contact?.phone) {
      setError("Pick a contact with a phone number to send the form link to");
      return;
    }
    const tab = pendingTab();
    setError("");
    try {
      const res = await sendFormLink(id, contact.id);
      if (res.whatsapp?.wa_me_url) tab.go(res.whatsapp.wa_me_url);
      else tab.cancel();
      flash(`Form link made for ${contact.name}. Press Send in WhatsApp. The link works until ${formatDateTime(res.expires_at)}.`);
      await load();
    } catch (err) {
      tab.cancel();
      setError(err.message);
    }
  }

  async function finish(note) {
    setSaving(true);
    setError("");
    try {
      await finishCall(id, note);
      setModal(null);
      flash("The call is done.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function give() {
    setSaving(true);
    setError("");
    try {
      const c = await giveCall(id, Number(giveTo));
      setCall(c);
      setModal(null);
      flash(`Call given to ${c.collector?.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!call) {
    return error ? <ErrorBox error={error} onRetry={load} /> : <Loading />;
  }

  const formReceived = call.status === "FORM_RECEIVED";
  const showCalling = canWork && !formReceived;
  const visibleQuestions = asked;
  // The thank-you goes to whoever gave the feedback, else the first contact with a phone.
  const thankYouContact =
    call.contacts.find((c) => c.id === latest?.contact_id && c.phone?.trim()) || call.contacts.find((c) => c.phone?.trim()) || null;
  async function sendThankYou() {
    const tab = pendingTab();
    setError("");
    try {
      const res = await prepareWhatsapp(id, { template_code: "THANK_YOU", recipient_type: "CUSTOMER", contact_id: thankYouContact.id });
      tab.go(res.wa_me_url);
      flash(`WhatsApp opened for ${thankYouContact.name}. Press Send there.`);
      load();
    } catch (err) {
      tab.cancel();
      setError(err.message);
    }
  }
  // A ticket's WhatsApp to the customer: "Re-visit booked" while it is open with a visit booked,
  // "Issue resolved" once it is closed. Goes to the contact picked in the card.
  const waContacts = call.contacts.filter((c) => c.phone?.trim());
  const waTo = waContacts.find((c) => c.id === ticketWaContact) || thankYouContact;
  const ticketMessages = call.tickets.flatMap((t) =>
    t.status === "CLOSED"
      ? [{ t, code: "ISSUE_RESOLVED", label: "Issue resolved" }]
      : [{ t, code: "TICKET_RAISED", label: "Ticket raised" }, ...(t.has_revisit ? [{ t, code: "REVISIT_BOOKED", label: "Re-visit booked" }] : [])],
  );
  async function sendTicketWhatsapp(ticketId, code, label) {
    const tab = pendingTab();
    setError("");
    try {
      const res = await prepareWhatsapp(id, { template_code: code, recipient_type: "CUSTOMER", ticket_id: ticketId, contact_id: waTo.id });
      tab.go(res.wa_me_url);
      flash(`WhatsApp "${label}" opened for ${waTo.name}. Press Send there.`);
      load();
    } catch (err) {
      tab.cancel();
      setError(err.message);
    }
  }
  const visitCounts = {};
  for (const v of call.visits) visitCounts[v.status] = (visitCounts[v.status] || 0) + 1;
  const shownVisits = visitFilter ? call.visits.filter((v) => v.status === visitFilter) : call.visits;
  const emailBase = { customer: call.customer.name, site: call.site.name, month: call.month, name: latest?.spoke_with_name, sender: user?.name };

  return (
    <>
      <PageHead
        title={call.customer.name}
        back={FEEDBACK_HOME}
        after={
          <>
            <CallStatusChip status={call.display_status || call.status} />
            <ResultChip result={call.result} />
          </>
        }
        sub={
          <>
            Site: {call.site.name}
            {call.site.city ? `, ${call.site.city}` : ""} · {call.visits.length} service{call.visits.length === 1 ? "" : "s"} {call.period_start ? periodText(call.period_start, call.period_end) : `in ${monthLabel(call.month)}`}
            {call.due_date && ` · due ${formatDay(call.due_date)}`}
            {call.collector && (
              <>
                {" "}
                · Taken by <b>{mine ? "you" : call.collector.name}</b>
              </>
            )}
          </>
        }
        actions={
          can("FEEDBACK_MANAGE") &&
          call.status !== "DONE" && (
            <button type="button" className="fb-btn" onClick={() => setModal("give")}>
              Give to another collector
            </button>
          )
        }
      />

      <div className="fb-progress-card">
        <Steps steps={callStagesFromCall(call)} label="Feedback call progress" />
      </div>

      <Toast notice={notice} onClose={clearNotice} />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox error={error} />
        </div>
      )}
      {call.status !== "DONE" && !mine && !can("FEEDBACK_MANAGE") && (
        <div className="fb-alert fb-alert-info" style={{ marginBottom: 16 }}>
          <span>{call.collector?.name || "Another collector"} is calling this site. You can look, but only they can work on it.</span>
        </div>
      )}

      <div className="fb-grid-side">
        <div className="fb-stack">
          {formReceived && latest && (
            <>
              <Card
                title="Customer sent the feedback form"
                aside={`${formatDateTime(latest.submitted_at)}${latest.spoke_with_name ? ` · filled by ${latest.spoke_with_name}` : ""}`}
              >
                <FeedbackRound label="The customer's form" status={latest.has_issue ? { text: "Issue", tone: "danger" } : { text: "All good", tone: "ok" }} submission={latest} />
              </Card>
              {canWork && (
                <Card title="Your decision">
                  <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                    <div className="fb-row">
                      {contact?.phone && (
                        <CallButton name={contact.name} phone={contact.phone}>
                          Call {contact.name}
                        </CallButton>
                      )}
                      <button type="button" className="fb-btn fb-btn-ok" disabled={saving} onClick={() => finish()}>
                        No issue · Done
                      </button>
                      {firstTicket ? (
                        <Link className="fb-btn fb-btn-danger" to={`${FEEDBACK_HOME}/tickets/${firstTicket.id}${firstTicket.status === "CLOSED" ? "?reopen=1" : ""}`}>
                          {firstTicket.status === "CLOSED" ? `Reopen ${firstTicket.ticket_number}` : `Open ${firstTicket.ticket_number}`}
                        </Link>
                      ) : (
                        <button type="button" className="fb-btn fb-btn-danger" onClick={() => setModal("ticket-later")}>
                          Raise ticket
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}

          {showCalling && (
            <>
              <Card
                title="1 · Call the customer"
                aside={call.calls_summary.total ? `${call.calls_summary.total} call${call.calls_summary.total === 1 ? "" : "s"} so far · ${call.calls_summary.missed} not answered` : "No calls yet"}
              >
                <div className="fb-stack" style={{ gap: 10 }}>
                  {contactsShown.map((c) =>
                    editing?.id === c.id ? (
                      <div key={c.id} className="fb-contact is-on">
                        <div className="fb-stack" style={{ flex: "1 1 100%", gap: 10 }}>
                          <div className="fb-form-grid">
                            <input className="fb-input" inputMode="numeric" placeholder="10-digit phone *" maxLength={10} value={editing.phone} onChange={(e) => setEditing((x) => ({ ...x, phone: tenDigits(e.target.value) }))} aria-label="Phone number" />
                            <input className="fb-input" placeholder="Name *" maxLength={150} value={editing.name} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} aria-label="Name" />
                            <input className="fb-input" placeholder="Position (optional)" maxLength={100} value={editing.role} onChange={(e) => setEditing((x) => ({ ...x, role: e.target.value }))} aria-label="Position" />
                            <input className="fb-input" type="email" placeholder="Email (optional)" maxLength={150} value={editing.email} onChange={(e) => setEditing((x) => ({ ...x, email: e.target.value }))} aria-label="Email" />
                          </div>
                          {editing.phone && editing.phone.length !== 10 && <span className="fb-danger-text fb-small">Enter a 10-digit phone number.</span>}
                          <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="fb-btn" onClick={() => setEditing(null)} disabled={savingContact}>
                              Cancel
                            </button>
                            <button type="button" className="fb-btn fb-btn-primary" onClick={saveEdit} disabled={savingContact || editing.phone.length !== 10 || !editing.name.trim()}>
                              {savingContact ? "Saving…" : "Save changes"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={c.id} className={`fb-contact ${contactKey === c.id ? "is-on" : ""} ${c.id === newContactId ? "is-new" : ""}`}>
                        <label className="fb-contact-pick">
                          <input type="radio" name="fb-contact" checked={contactKey === c.id} onChange={() => setContactKey(c.id)} />
                          <span>
                            <span className="fb-strong">{c.name}</span>
                            {c.id === newContactId && (
                              <span className="fb-new-tag" title={`Right number from ${freshRequest.resolved_by?.name || "the service coordinator"}`}>
                                New
                              </span>
                            )}
                            <br />
                            <span className="fb-small fb-muted">
                              {[c.role, c.phone?.trim() || "No phone number", c.email, c.id === primaryId ? "Primary" : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="fb-icon-btn"
                          title="Edit contact"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => setEditing({ id: c.id, name: c.name || "", phone: tenDigits(String(c.phone || "").replace(/^\+?91(?=\d{10}$)/, "")), role: c.role || "", email: c.email || "" })}
                        >
                          <FiEdit2 />
                        </button>
                        {c.phone?.trim() && <CallButton className="fb-btn fb-btn-primary" name={c.name} phone={c.phone} onClick={() => setContactKey(c.id)} />}
                      </div>
                    ),
                  )}
                  <div className={`fb-contact ${contactKey === OTHER ? "is-on" : ""}`}>
                    <label className="fb-contact-pick" style={{ flex: "0 0 auto" }}>
                      <input type="radio" name="fb-contact" checked={contactKey === OTHER} onChange={() => setContactKey(OTHER)} />
                      <span className="fb-strong">Another number</span>
                    </label>
                    {contactKey === OTHER && (
                      <div className="fb-stack" style={{ flex: "1 1 100%", gap: 10 }}>
                        <div className="fb-form-grid">
                          <input className="fb-input" inputMode="numeric" placeholder="10-digit phone *" maxLength={10} value={otherPhone} onChange={(e) => setOtherPhone(tenDigits(e.target.value))} aria-label="Phone number" />
                          <input className="fb-input" placeholder="Name *" value={otherName} onChange={(e) => setOtherName(e.target.value)} aria-label="Name" />
                          <input className="fb-input" placeholder="Position (optional)" maxLength={100} value={otherRole} onChange={(e) => setOtherRole(e.target.value)} aria-label="Position" />
                          <input className="fb-input" type="email" placeholder="Email (optional)" maxLength={150} value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} aria-label="Email" />
                        </div>
                        {otherPhone && otherPhone.length !== 10 && <span className="fb-danger-text fb-small">Enter a 10-digit phone number.</span>}
                        <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                          <button type="button" className="fb-btn fb-btn-primary" onClick={saveContact} disabled={savingContact || otherPhone.length !== 10 || !otherName.trim()}>
                            {savingContact ? "Saving…" : "Save contact"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="fb-field" style={{ marginTop: 6 }}>
                    What happened on this call?
                    <div className="fb-row">
                      <Segmented label="Call result" options={CALL_OUTCOMES} value={shownOutcome} onChange={setOutcome} />
                      <button type="button" className="fb-btn fb-btn-ok" onClick={saveAttempt} disabled={savingAttempt || !attemptChanged}>
                        {savingAttempt ? "Saving…" : "Save call result"}
                      </button>
                    </div>
                    {savedAttempt && (
                      <span className="fb-field-hint">
                        Saved: {CALL_OUTCOMES.find((o) => o.value === savedAttempt.outcome)?.label || savedAttempt.outcome} · {savedAttempt.contact_name || savedAttempt.phone} ·{" "}
                        {formatDateTime(savedAttempt.called_at)}
                        {attemptChanged ? " · not saved yet: press Save call result" : ". Change the result to save a new one."}
                      </span>
                    )}
                    {/* Wrong number: ask the service coordinator for the right one (Requests). */}
                    <WrongNumberRequest
                      call={call}
                      canWork={canWork}
                      wrongPicked={shownOutcome === "WRONG_NUMBER"}
                      unsaved={attemptChanged}
                      saveResult={saveAttempt}
                      lastCallAt={savedAttempt?.called_at}
                      onChanged={(text) => {
                        flash(text, "ok");
                        load();
                      }}
                    />
                  </div>
                </div>
              </Card>

              <Card title="2 · Feedback from the call">
                <label className="fb-field" htmlFor="fb-spoke" style={{ paddingBottom: 12, borderBottom: "1px solid #f1f2f4" }}>
                  Spoke with
                  <input id="fb-spoke" className="fb-input" style={{ maxWidth: 360 }} placeholder="Name of the person" value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} />
                </label>
                <QuestionModePicker value={qMode} onChange={setQMode} counts={modeCounts} />
                <QuestionProgress questions={visibleQuestions} answers={answers} />
                {visibleQuestions.map((q, n) => (
                  <div key={q.id} className={`fb-q ${answers[q.id] ? "is-answered" : ""} ${!q.is_required && !answers[q.id] ? "is-skipped" : ""}`}>
                    <div className="fb-q-t">
                      <span className="fb-q-no">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                      <span className="fb-q-text">
                        {q.question_text} {q.is_required ? <span className="fb-req">*</span> : <span className="fb-q-optional">Optional</span>}
                      </span>
                      {q.question_type === "SERVICE" && <span className="fb-q-tag">Service</span>}
                      {!q.is_required && answers[q.id] && (
                        <button type="button" className="fb-q-skip" onClick={() => setAnswers((a) => ({ ...a, [q.id]: undefined }))}>
                          Skip
                        </button>
                      )}
                    </div>
                    <AnswerButtons question={q} value={answers[q.id]} onChange={(optionId) => pickAnswer(q.id, optionId)} />
                  </div>
                ))}
                {otherEnabled && (
                  <div className="fb-q">
                    <label className="fb-q-t" htmlFor="fb-other" style={{ display: "block" }}>
                      Other feedback <span className="fb-muted fb-small">(optional)</span>
                    </label>
                    <textarea id="fb-other" className="fb-textarea" rows={2} maxLength={2000} value={other} onChange={(e) => setOther(e.target.value)} />
                  </div>
                )}
                <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                  {missing.length > 0 && chosen.length > 0 && <span className="fb-small fb-muted">{missing.length} question{missing.length === 1 ? "" : "s"} left</span>}
                  {bad.length > 0 ? (
                    <>
                      <button type="button" className="fb-btn" disabled={saving || !chosen.length} onClick={() => setModal("no-ticket")}>
                        No ticket needed · Done
                      </button>
                      <button type="button" className="fb-btn fb-btn-danger" disabled={saving || !chosen.length} onClick={openTicketForNewFeedback}>
                        Raise ticket · Done
                      </button>
                    </>
                  ) : (
                    <button type="button" className="fb-btn fb-btn-ok" disabled={saving || !chosen.length} onClick={() => saveGood()}>
                      <FiCheck /> {saving ? "Saving…" : "Save feedback · Done (Good)"}
                    </button>
                  )}
                </div>
              </Card>

              <Card title="Can't get feedback?">
                <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="fb-btn" onClick={() => setModal("finish")}>
                    Finish without feedback
                  </button>
                </div>
              </Card>
            </>
          )}

          {call.status === "DONE" && canFollowUp && (
            <Card title={`Follow-up call · ${followUpTicket.ticket_number}`}>
              {/* The action is taken: call the customer to confirm - or close the ticket without the call. */}
              <div className="fb-close-bar">
                <span className="fb-small">
                  <b>The action is taken.</b> Call the customer to confirm it is resolved, or close the ticket without the call.
                </span>
                <button type="button" className="fb-btn fb-btn-sm" onClick={() => setModal("close-ticket")} disabled={saving}>
                  <FiCheck aria-hidden="true" /> Close the ticket
                </button>
              </div>
              <div className="fb-stack" style={{ gap: 10, paddingBottom: 12, borderBottom: "1px solid #f1f2f4" }}>
                {call.contacts.map((c) => (
                  <div key={c.id} className={`fb-contact ${contactKey === c.id ? "is-on" : ""}`}>
                    <label className="fb-contact-pick">
                      <input type="radio" name="fb-fu-contact" checked={contactKey === c.id} onChange={() => setContactKey(c.id)} />
                      <span>
                        <span className="fb-strong">{c.name}</span>
                        <br />
                        <span className="fb-small fb-muted">{[c.role, c.phone?.trim() || "No phone number"].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                    {c.phone?.trim() && (
                      <CallButton className="fb-btn fb-btn-primary" name={c.name} phone={c.phone} onClick={() => setContactKey(c.id)} />
                    )}
                  </div>
                ))}
                <label className="fb-field" htmlFor="fb-fu-spoke">
                  Spoke with
                  <input id="fb-fu-spoke" className="fb-input" style={{ maxWidth: 360 }} placeholder="Name of the person" value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} />
                </label>
              </div>
              <QuestionModePicker value={qMode} onChange={setQMode} counts={modeCounts} />
                <QuestionProgress questions={visibleQuestions} answers={answers} />
              {visibleQuestions.map((q, n) => (
                <div key={q.id} className={`fb-q ${answers[q.id] ? "is-answered" : ""} ${!q.is_required && !answers[q.id] ? "is-skipped" : ""}`}>
                  <div className="fb-q-t">
                    <span className="fb-q-no">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                      <span className="fb-q-text">
                        {q.question_text} {q.is_required ? <span className="fb-req">*</span> : <span className="fb-q-optional">Optional</span>}
                      </span>
                    {q.question_type === "SERVICE" && <span className="fb-q-tag">Service</span>}
                    {!q.is_required && answers[q.id] && (
                      <button type="button" className="fb-q-skip" onClick={() => setAnswers((a) => ({ ...a, [q.id]: undefined }))}>
                        Skip
                      </button>
                    )}
                  </div>
                  <AnswerButtons question={q} value={answers[q.id]} onChange={(optionId) => pickAnswer(q.id, optionId)} />
                </div>
              ))}
              {otherEnabled && (
                <div className="fb-q">
                  <label className="fb-q-t" htmlFor="fb-fu-other" style={{ display: "block" }}>
                    Other feedback <span className="fb-muted fb-small">(optional)</span>
                  </label>
                  <textarea id="fb-fu-other" className="fb-textarea" rows={2} maxLength={2000} value={other} onChange={(e) => setOther(e.target.value)} />
                </div>
              )}
              <div className="fb-row" style={{ justifyContent: "flex-end" }}>
                {missing.length > 0 && chosen.length > 0 && <span className="fb-small fb-muted">{missing.length} question{missing.length === 1 ? "" : "s"} left</span>}
                {bad.length > 0 && (
                  <button type="button" className="fb-btn" disabled={saving || !chosen.length} onClick={() => saveFollowUp(true)}>
                    Close the ticket
                  </button>
                )}
                <button type="button" className={`fb-btn ${bad.length ? "fb-btn-danger" : "fb-btn-ok"}`} disabled={saving || !chosen.length} onClick={() => saveFollowUp()}>
                  {saving ? "Saving…" : bad.length ? `Save · ${followUpTicket.ticket_number} stays open` : `Save · satisfied, close ${followUpTicket.ticket_number}`}
                </button>
              </div>
            </Card>
          )}

          {call.status === "DONE" && (
            <Card title="Result" aside={call.done_at ? `${formatDateTime(call.done_at)}${call.done_by ? ` · ${call.done_by.name}` : ""}` : null}>
              {firstFeedback ? (
                <div className="fb-rounds">
                  <FeedbackRound
                    label="First feedback"
                    status={firstFeedback.has_issue ? { text: firstTicket ? `Issue · ${firstTicket.ticket_number}` : "Issue", tone: "danger" } : { text: "All good", tone: "ok" }}
                    submission={firstFeedback}
                  />
                  {followUpSubs.map((s, n) => (
                    <FeedbackRound key={s.id} label={`Follow-up call ${n + 1}`} status={s.has_issue ? { text: "Not resolved", tone: "danger" } : { text: "Resolved", tone: "ok" }} submission={s} />
                  ))}
                </div>
              ) : (
                <div className="fb-muted">No feedback was received on this call.</div>
              )}
              {canRaiseLater && (
                <div className="fb-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
                  {/* One ticket per call: a new problem goes on the same ticket. */}
                  {firstTicket ? (
                    <Link className="fb-btn" to={`${FEEDBACK_HOME}/tickets/${firstTicket.id}${firstTicket.status === "CLOSED" ? "?reopen=1" : ""}`}>
                      {firstTicket.status === "CLOSED" ? `Reopen ${firstTicket.ticket_number}` : `Open ${firstTicket.ticket_number}`}
                    </Link>
                  ) : (
                    <button type="button" className="fb-btn" onClick={() => setModal("ticket-later")}>
                      Raise ticket
                    </button>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card title="History" aside={`${call.history.length} event${call.history.length === 1 ? "" : "s"}`}>
            <Timeline items={historyItems(call.history)} />
          </Card>
        </div>

        <div className="fb-stack">
          {latest && <CustomerCard customer={call.customer} site={call.site} contacts={call.contacts} feedback={latest} />}

          <Card title={call.period_start ? `Services ${periodText(call.period_start, call.period_end)}` : `Services in ${monthLabel(call.month).split(" ")[0]}`} aside={`${visitCounts.COMPLETED || 0} of ${call.visits.length} completed`} bodyClass="is-flush">
            {call.visits.length > 0 && (
              <div className="fb-visit-filter" role="group" aria-label="Show services">
                <button type="button" className={visitFilter === "" ? "is-on" : ""} onClick={() => setVisitFilter("")} aria-pressed={visitFilter === ""}>
                  All {call.visits.length}
                </button>
                {Object.entries(visitCounts).map(([status, n]) => (
                  <button
                    key={status}
                    type="button"
                    className={`is-${VISIT_STATUS[status]?.tone || "muted"} ${visitFilter === status ? "is-on" : ""}`}
                    onClick={() => setVisitFilter(visitFilter === status ? "" : status)}
                    aria-pressed={visitFilter === status}
                  >
                    {VISIT_STATUS[status]?.label || status} {n}
                  </button>
                ))}
              </div>
            )}
            <ul className="fb-visit-list">
              {shownVisits.map((v) => (
                <li key={v.id}>
                  <span className={`fb-visit-dot fb-tone-${VISIT_STATUS[v.status]?.tone || "muted"}`} title={VISIT_STATUS[v.status]?.label || v.status} />
                  <span className="fb-visit-main">
                    <span className="fb-visit-line">
                      <b>{formatDay(v.date)}</b> · Job {v.job_code}
                    </span>
                    <span className="fb-visit-sub" title={`${v.service}${v.technicians ? ` · ${v.technicians}` : ""}`}>
                      {v.service}
                      {v.technicians ? ` · ${v.technicians}` : ""}
                    </span>
                  </span>
                  <span className={`fb-visit-status fb-tone-${VISIT_STATUS[v.status]?.tone || "muted"}`}>{VISIT_STATUS[v.status]?.label || v.status}</span>
                </li>
              ))}
            </ul>
          </Card>

          {showCalling && (
            <Card title="WhatsApp">
              <div className="fb-stack" style={{ gap: 10 }}>
                <button type="button" className="fb-btn fb-btn-wa" onClick={sendLink} disabled={!contact?.phone}>
                  <FaWhatsapp /> Send feedback form link{contact ? ` to ${contact.name}` : ""}
                </button>
              </div>
            </Card>
          )}

          {call.result === "GOOD" && (
            <Card title="Thank the customer" aside="Optional">
              <div className="fb-stack" style={{ gap: 8 }}>
                <button type="button" className="fb-btn fb-btn-wa" onClick={sendThankYou} disabled={!thankYouContact}>
                  <FaWhatsapp /> Thank-you WhatsApp{thankYouContact ? ` to ${thankYouContact.name}` : ""}
                </button>
                {!thankYouContact && <div className="fb-small fb-muted">No contact with a phone number for this site.</div>}
              </div>
            </Card>
          )}

          {ticketMessages.length > 0 && (mine || can("FEEDBACK_MANAGE")) && (
            <Card title="WhatsApp the customer" aside="Optional">
              <div className="fb-stack" style={{ gap: 8 }}>
                {waContacts.length > 0 ? (
                  <>
                    <select className="fb-select" value={waTo?.id || ""} onChange={(e) => setTicketWaContact(e.target.value)} aria-label="Send to">
                      {waContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.phone.trim()}
                        </option>
                      ))}
                    </select>
                    {ticketMessages.map(({ t, code, label }) => (
                      <button key={`${t.id}-${code}`} type="button" className="fb-btn fb-btn-wa" onClick={() => sendTicketWhatsapp(t.id, code, label)}>
                        <FaWhatsapp /> {t.ticket_number} · {label}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="fb-small fb-muted">No contact with a phone number for this site.</div>
                )}
              </div>
            </Card>
          )}

          {(call.result === "GOOD" || call.tickets.length > 0) && (
            <Card title="Email the customer" aside="Optional">
              <div className="fb-stack" style={{ gap: 8 }}>
                {call.result === "GOOD" && (
                  <button
                    type="button"
                    className="fb-btn"
                    disabled={!emailTemplateFor(emailTemplates, "THANK_YOU")}
                    title={emailTemplateFor(emailTemplates, "THANK_YOU") ? undefined : "This email is switched off in Masters › Email templates"}
                    onClick={() => openCustomerEmail(emailTemplateFor(emailTemplates, "THANK_YOU"), emailBase, call.contacts)}
                  >
                    <FiMail /> Thank-you email
                  </button>
                )}
                {call.tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="fb-btn"
                    disabled={!emailTemplateFor(emailTemplates, t.status === "CLOSED" ? "ISSUE_RESOLVED" : "ISSUE_RECEIVED")}
                    onClick={() =>
                      openCustomerEmail(
                        emailTemplateFor(emailTemplates, t.status === "CLOSED" ? "ISSUE_RESOLVED" : "ISSUE_RECEIVED"),
                        { ...emailBase, ticketNumber: t.ticket_number, issue: t.issue_summary },
                        call.contacts,
                      )
                    }
                  >
                    <FiMail /> {t.ticket_number} · {t.status === "CLOSED" ? "Issue resolved email" : "Issue received email"}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {call.tickets.length > 0 && (
            <Card title="Tickets raised" bodyClass="is-flush">
              <table className="fb-table">
                <tbody>
                  {call.tickets.map((t) => (
                    <tr key={t.id} className="is-link" onClick={() => navigate(`${FEEDBACK_HOME}/tickets/${t.id}`)}>
                      <td>
                        <span className="fb-link">{t.ticket_number}</span>
                        <div className="fb-small fb-muted" style={{ whiteSpace: "pre-line" }}>
                          {problemNote(t.issue_summary, call.submissions.flatMap((s) => s.responses || [])) || "See the answers above"}
                        </div>
                      </td>
                      <td className="fb-right">
                        <div className="fb-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <PriorityChip priority={t.priority} />
                          <TicketStatusChip status={t.status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {call.form_links.length > 0 && (
            <Card title="Form links">
              <div className="fb-stack" style={{ gap: 8 }}>
                {call.form_links.slice(0, 3).map((l) => (
                  <div key={l.id} className="fb-row fb-small" style={{ justifyContent: "space-between" }}>
                    <span>
                      Sent {formatDateTime(l.created_at)}
                      {l.opened_at ? ` · opened ${formatDateTime(l.opened_at)}` : ""}
                    </span>
                    <Chip tone={{ SUBMITTED: "ok", OPENED: "info", SENT: "info", EXPIRED: "muted", REVOKED: "muted" }[l.state]}>
                      {{ SUBMITTED: "Used", OPENED: "Opened", SENT: "Sent", EXPIRED: "Expired", REVOKED: "Replaced" }[l.state]}
                    </Chip>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      </div>

      {modal === "ticket-new" && (
        <RaiseTicketModal
          callId={id}
          title={`Raise a ticket · ${call.customer.name}`}
          visits={call.visits}
          suggested={suggestedPriority(bad)}
          defaultSummary={issueText(bad, other.trim())}
          submitLabel="Save feedback & raise ticket"
          note="The call is marked Done · Issue."
          onClose={() => setModal(null)}
          onSubmit={async (ticket) => {
            const res = await saveCallFeedback(id, { ...feedbackBody(), ticket });
            setModal(null);
            setAnswers({});
            setOther("");
            flash(`Feedback saved and ticket ${res.ticket.ticket_number} raised. The call is done.`);
            await load();
          }}
        />
      )}

      {modal === "ticket-later" && latest && (
        <RaiseTicketModal
          callId={id}
          title={`Raise a ticket · ${call.customer.name}`}
          visits={call.visits}
          suggested={suggestedPriority(latest.responses)}
          defaultSummary={issueText(latest.responses, latest.other_feedback)}
          note={call.status === "DONE" ? "The call stays done, with result Issue." : "The call is marked Done · Issue."}
          onClose={() => setModal(null)}
          onSubmit={async (ticket) => {
            const res = await raiseTicket(id, { submission_id: latest.id, ...ticket });
            setModal(null);
            flash(`Ticket ${res.ticket.ticket_number} raised.`);
            await load();
          }}
        />
      )}

      {modal === "no-ticket" && (
        <Modal
          title="Finish without a ticket?"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Back
              </button>
              <button type="button" className="fb-btn fb-btn-dark" disabled={saving} onClick={() => saveGood({ no_ticket: true })}>
                {saving ? "Saving…" : "Yes, no ticket needed"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Some answers show an issue. The feedback is saved as it is, and the call is marked done without a ticket. Use this only when the problem is already sorted out or not real.
          </p>
        </Modal>
      )}

      {modal === "finish" && (
        <Modal
          title="Finish without feedback"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-dark" disabled={saving || (!latest && !finishNote.trim())} onClick={() => finish(finishNote.trim())}>
                {saving ? "Saving…" : "Finish the call"}
              </button>
            </>
          }
        >
          <label className="fb-field" htmlFor="fb-finish-note">
            Why is the call finished without feedback?
            <textarea id="fb-finish-note" className="fb-textarea" rows={3} maxLength={500} placeholder="e.g. Called 4 times and sent the form, no reply." value={finishNote} onChange={(e) => setFinishNote(e.target.value)} />
          </label>
        </Modal>
      )}

      {modal === "close-ticket" && followUpTicket && (
        <Modal
          title={`Close ${followUpTicket.ticket_number}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-ok" disabled={saving} onClick={closeWithoutCall}>
                {saving ? "Closing…" : "Close the ticket"}
              </button>
            </>
          }
        >
          <div className="fb-stack" style={{ gap: 12 }}>
            <p className="fb-small fb-muted" style={{ margin: 0 }}>
              Every team has finished its work. The ticket closes without the follow-up call; you can reopen it later if needed.
            </p>
            <label className="fb-field" htmlFor="fb-close-note">
              Note (optional)
              <textarea id="fb-close-note" className="fb-textarea" rows={2} maxLength={400} placeholder="e.g. Customer said on WhatsApp it is sorted" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
            </label>
          </div>
        </Modal>
      )}

      {modal === "give" && (
        <Modal
          title="Give the call to another collector"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="fb-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="fb-btn fb-btn-primary" disabled={saving || !giveTo} onClick={give}>
                {saving ? "Saving…" : "Give the call"}
              </button>
            </>
          }
        >
          {people.collectors.length ? (
            <label className="fb-field" htmlFor="fb-give">
              Collector (gets a notification)
              <select id="fb-give" className="fb-select" value={giveTo} onChange={(e) => setGiveTo(e.target.value)}>
                <option value="">Choose…</option>
                {people.collectors
                  .filter((u) => u.id !== call.collector?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <div className="fb-muted">No user has the feedback collector role yet. Give someone the role in User Management first.</div>
          )}
        </Modal>
      )}
    </>
  );
}

/** The right number the service coordinator added that hasn't been called yet (or null). */
function freshNumberRequest(call) {
  const done = (call.number_requests || []).find((q) => q.status === "DONE");
  if (!done?.right) return null;
  const lastCall = call.call_attempts?.[0]?.called_at;
  return !lastCall || new Date(lastCall) < new Date(done.resolved_at) ? done : null;
}
