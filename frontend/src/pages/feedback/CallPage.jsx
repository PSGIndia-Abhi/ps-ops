import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiAlertTriangle, FiCheck, FiMail, FiPhone } from "react-icons/fi";
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
  emailTemplateFor,
  getEmailTemplates,
  openCustomerEmail,
  pendingTab,
  prepareWhatsapp,
  raiseTicket,
  recordAttempt,
  saveCallFeedback,
  sendFormLink,
  suggestedPriority,
  telLink,
} from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import useMe from "../../hooks/useMe";
import RaiseTicketModal from "./RaiseTicketModal";
import { problemNote } from "./feedbackApi";
import { AnswerButtons, CallStatusChip, Card, Chip, ErrorBox, Loading, Modal, PageHead, PriorityChip, ResultChip, Segmented, Steps, TicketStatusChip, Timeline } from "./ui";

const OTHER = "other";

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "Q? Answer; Q? Answer" + the customer's own words - the default ticket text. */
function issueText(responses, other) {
  const bad = responses.filter((r) => r.is_bad).map((r) => `${r.question} ${r.answer}`);
  return [...bad, other ? `"${other}"` : null].filter(Boolean).join("; ").slice(0, 500);
}

function SubmissionAnswers({ submission }) {
  return (
    <div className="fb-stack" style={{ gap: 10 }}>
      <div className="fb-table-wrap" style={{ border: "1px solid #eef0f3", borderRadius: 10 }}>
        <table className="fb-table">
          <tbody>
            {submission.responses.map((r) => (
              <tr key={r.question_id}>
                <td style={{ width: "58%" }}>{r.question}</td>
                <td>
                  <div className="fb-row" style={{ gap: 6 }}>
                    <Chip tone={r.is_bad ? "danger" : "ok"}>{r.answer}</Chip>
                    {r.is_bad && <PriorityChip priority={r.suggested_priority} />}
                  </div>
                </td>
              </tr>
            ))}
            {submission.other_feedback && (
              <tr>
                <td>Other feedback</td>
                <td>“{submission.other_feedback}”</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

  // call result
  const [contactKey, setContactKey] = useState("");
  const [otherPhone, setOtherPhone] = useState("");
  const [otherName, setOtherName] = useState("");
  const [outcome, setOutcome] = useState(null); // null = show the last saved result
  const [savingAttempt, setSavingAttempt] = useState(false);

  // feedback
  const [answers, setAnswers] = useState({});
  const [spokeWith, setSpokeWith] = useState("");
  const [other, setOther] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null); // "ticket-new" | "ticket-later" | "no-ticket" | "finish" | "give"
  const [finishNote, setFinishNote] = useState("");
  const [giveTo, setGiveTo] = useState("");
  const { user } = useMe();
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [visitFilter, setVisitFilter] = useState("");

  const load = useCallback(() => {
    return getCall(id)
      .then((c) => {
        setCall(c);
        setContactKey((k) => k || (c.contacts[0] ? c.contacts[0].id : OTHER));
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

  // answers as response rows with the master's flags, for the warning and the ticket text
  const chosen = useMemo(
    () =>
      questions
        .filter((q) => answers[q.id])
        .map((q) => {
          const o = q.options.find((x) => x.id === answers[q.id]);
          return { question_id: q.id, option_id: o.id, question: q.question_text, answer: o.label, is_bad: o.is_bad, suggested_priority: o.is_bad ? o.suggested_priority : null };
        }),
    [questions, answers],
  );
  const bad = chosen.filter((r) => r.is_bad);
  const missing = questions.filter((q) => q.is_required && !answers[q.id]);
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
    return { phone: otherPhone.trim(), contact_name: otherName.trim() || undefined };
  }

  async function saveAttempt() {
    setSavingAttempt(true);
    setError("");
    try {
      const res = await recordAttempt(id, { ...phoneTarget(), outcome: shownOutcome });
      setOutcome(null);
      if (shownOutcome === "ANSWERED") flash("Call saved. Fill in the customer's answers below.");
      else if (res.offer_form_link) flash("Call saved. The customer didn't answer. You can send the feedback form on WhatsApp.", "warn");
      else flash(res.next_call_at ? `Call saved. Call back ${formatDateTime(res.next_call_at)}.` : "Call saved.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAttempt(false);
    }
  }

  function feedbackBody() {
    if (!who) throw new Error("Choose or type who gave the feedback");
    if (missing.length) throw new Error(`Answer "${missing[0].question_text}"`);
    return {
      ...(contact ? { contact_id: contact.id } : {}),
      spoke_with_name: who,
      responses: chosen.map((r) => ({ question_id: r.question_id, option_id: r.option_id })),
      other_feedback: otherEnabled ? other.trim() || null : null,
      started_at: startedAt,
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
  const visibleQuestions = questions;
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
  const visitCounts = {};
  for (const v of call.visits) visitCounts[v.status] = (visitCounts[v.status] || 0) + 1;
  const shownVisits = visitFilter ? call.visits.filter((v) => v.status === visitFilter) : call.visits;
  const emailBase = { customer: call.customer.name, site: call.site.name, month: call.month, name: latest?.spoke_with_name, sender: user?.name };

  return (
    <>
      <PageHead
        crumb={
          <>
            <Link to={FEEDBACK_HOME}>Dashboard</Link> › <Link to={`${FEEDBACK_HOME}?month=${call.month}`}>{monthLabel(call.month)}</Link>
          </>
        }
        title={call.customer.name}
        back={FEEDBACK_HOME}
        after={
          <>
            <CallStatusChip status={call.status} />
            <ResultChip result={call.result} />
          </>
        }
        sub={
          <>
            Site: {call.site.name}
            {call.site.city ? `, ${call.site.city}` : ""} · {call.visits.length} service{call.visits.length === 1 ? "" : "s"} in {monthLabel(call.month)}
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

      {notice && (
        <div className={`fb-alert fb-alert-${notice.tone}`} role="status" style={{ marginBottom: 16 }}>
          <FiCheck aria-hidden="true" />
          <span>{notice.text}</span>
          <button type="button" className="fb-btn fb-btn-sm fb-btn-link" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
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
                <SubmissionAnswers submission={latest} />
                {latest.has_issue ? (
                  <div className="fb-alert fb-alert-danger" style={{ marginTop: 14 }}>
                    <FiAlertTriangle aria-hidden="true" />
                    <span>
                      <b>
                        {latest.responses.filter((r) => r.is_bad).length} bad answer{latest.responses.filter((r) => r.is_bad).length === 1 ? "" : "s"}.
                      </b>{" "}
                      Suggested priority: <b>{PRIORITY[suggestedPriority(latest.responses)]?.label || "—"}</b>. Check with the customer if needed, then raise a ticket.
                    </span>
                  </div>
                ) : (
                  <div className="fb-alert fb-alert-ok" style={{ marginTop: 14 }}>
                    <span>All answers are good.</span>
                  </div>
                )}
              </Card>
              {canWork && (
                <Card title="Your decision">
                  <div className="fb-row" style={{ justifyContent: "space-between" }}>
                    <div className="fb-small fb-muted" style={{ maxWidth: 420 }}>
                      Nothing is raised automatically. Raise a ticket for a real problem, or mark the call done if there is no issue.
                    </div>
                    <div className="fb-row">
                      {contact?.phone && (
                        <a className="fb-btn" href={telLink(contact.phone)}>
                          <FiPhone /> Call {contact.name}
                        </a>
                      )}
                      <button type="button" className="fb-btn fb-btn-ok" disabled={saving} onClick={() => finish()}>
                        No issue · Done
                      </button>
                      <button type="button" className="fb-btn fb-btn-danger" onClick={() => setModal("ticket-later")}>
                        Raise ticket
                      </button>
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
                  {call.contacts.map((c) => (
                    <div key={c.id} className={`fb-contact ${contactKey === c.id ? "is-on" : ""}`}>
                      <label className="fb-contact-pick">
                        <input type="radio" name="fb-contact" checked={contactKey === c.id} onChange={() => setContactKey(c.id)} />
                        <span>
                          <span className="fb-strong">{c.name}</span>
                          <br />
                          <span className="fb-small fb-muted">
                            {[c.role, c.phone?.trim() || "No phone number", c.is_primary ? "Primary" : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                      {c.phone?.trim() && (
                        <a className="fb-btn fb-btn-primary" href={telLink(c.phone)} onClick={() => setContactKey(c.id)}>
                          <FiPhone /> Call {c.phone.trim()}
                        </a>
                      )}
                    </div>
                  ))}
                  <div className={`fb-contact ${contactKey === OTHER ? "is-on" : ""}`}>
                    <label className="fb-contact-pick" style={{ flex: "0 0 auto" }}>
                      <input type="radio" name="fb-contact" checked={contactKey === OTHER} onChange={() => setContactKey(OTHER)} />
                      <span className="fb-strong">Another number</span>
                    </label>
                    {contactKey === OTHER && (
                      <div className="fb-row" style={{ flex: 1 }}>
                        <input className="fb-input fb-grow" placeholder="Phone number" value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} aria-label="Phone number" />
                        <input className="fb-input fb-grow" placeholder="Name (optional)" value={otherName} onChange={(e) => setOtherName(e.target.value)} aria-label="Name" />
                      </div>
                    )}
                  </div>
                  {!call.contacts.length && <div className="fb-small fb-muted">This site has no contacts saved. Add them in Site Contacts, or type the number above.</div>}

                  <div className="fb-field" style={{ marginTop: 6 }}>
                    What happened on this call?
                    <div className="fb-row">
                      <Segmented label="Call result" options={CALL_OUTCOMES} value={shownOutcome} onChange={setOutcome} />
                      <button type="button" className="fb-btn fb-btn-dark" onClick={saveAttempt} disabled={savingAttempt || !attemptChanged}>
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
                  </div>
                </div>
              </Card>

              <Card title="2 · Feedback from the call" aside="Questions come from Masters › Questions">
                <label className="fb-field" htmlFor="fb-spoke" style={{ paddingBottom: 12, borderBottom: "1px solid #f1f2f4" }}>
                  Spoke with
                  <input id="fb-spoke" className="fb-input" style={{ maxWidth: 360 }} placeholder={contact?.name || otherName || "Name of the person"} value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} />
                </label>
                {visibleQuestions.map((q, n) => (
                  <div key={q.id} className="fb-q">
                    <div className="fb-q-t">
                      {n + 1}. {q.question_text} {q.is_required && <span className="fb-req">*</span>}
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
                {bad.length > 0 && (
                  <div className="fb-alert fb-alert-danger" style={{ margin: "6px 0 14px" }}>
                    <FiAlertTriangle aria-hidden="true" />
                    <span>
                      <b>
                        {bad.length} bad answer{bad.length === 1 ? "" : "s"}
                      </b>{" "}
                      ({bad.map((b) => `${b.question} ${b.answer}`).join("; ")}). This looks like an issue. Suggested priority: <b>{PRIORITY[suggestedPriority(bad)]?.label}</b>.
                    </span>
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

              <Card title="Can't get feedback this month?">
                <div className="fb-row" style={{ justifyContent: "space-between" }}>
                  <span className="fb-small fb-muted" style={{ maxWidth: 460 }}>
                    If the customer can't be reached even after the form link, close the call with a note saying why.
                  </span>
                  <button type="button" className="fb-btn" onClick={() => setModal("finish")}>
                    Finish without feedback
                  </button>
                </div>
              </Card>
            </>
          )}

          {call.status === "DONE" && (
            <Card title="Result" aside={call.done_at ? `Done ${formatDateTime(call.done_at)}${call.done_by ? ` · ${call.done_by.name}` : ""}` : null}>
              {latest ? (
                <>
                  <div className="fb-small fb-muted" style={{ marginBottom: 10 }}>
                    {latest.source === "FORM" ? "From the customer's form" : "From the call"}
                    {latest.spoke_with_name ? ` · ${latest.spoke_with_name}` : ""} · {formatDateTime(latest.submitted_at)}
                  </div>
                  <SubmissionAnswers submission={latest} />
                </>
              ) : (
                <div className="fb-muted">No feedback was received this month.</div>
              )}
              {canRaiseLater && (
                <div className="fb-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" className="fb-btn" onClick={() => setModal("ticket-later")}>
                    Raise another ticket
                  </button>
                </div>
              )}
            </Card>
          )}

          <Card title="History" aside={`${call.history.length} event${call.history.length === 1 ? "" : "s"}`}>
            <Timeline items={historyItems(call.history)} />
          </Card>
        </div>

        <div className="fb-stack">
          <Card title={`Services in ${monthLabel(call.month).split(" ")[0]}`} aside={`${visitCounts.COMPLETED || 0} of ${call.visits.length} completed`} bodyClass="is-flush">
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
                <div className="fb-small fb-muted">Opens WhatsApp with the message ready. You press Send there.</div>
                <button type="button" className="fb-btn fb-btn-wa" onClick={sendLink} disabled={!contact?.phone}>
                  <FaWhatsapp /> Send feedback form link{contact ? ` to ${contact.name}` : ""}
                </button>
                <div className="fb-small fb-muted">Use this when the customer can't talk now. A new link replaces any older one.</div>
              </div>
            </Card>
          )}

          {call.result === "GOOD" && (
            <Card title="Thank the customer" aside="Optional">
              <div className="fb-stack" style={{ gap: 8 }}>
                <button type="button" className="fb-btn fb-btn-wa" onClick={sendThankYou} disabled={!thankYouContact}>
                  <FaWhatsapp /> Thank-you WhatsApp{thankYouContact ? ` to ${thankYouContact.name}` : ""}
                </button>
                <div className="fb-small fb-muted">
                  {thankYouContact ? "Thanks them for choosing BestServe. Text from Masters › WhatsApp templates." : "No contact with a phone number for this site."}
                </div>
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
                <div className="fb-small fb-muted">Your choice. Opens Gmail with the email written; check it, edit if needed, and press Send.</div>
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
