import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiRotateCcw } from "react-icons/fi";
import { getCall, getQuestions, getSettings, modeBody, modeCounts as countModes, questionsFor, reopenTicket } from "./feedbackApi";
import { AnswerButtons, ErrorBox, Loading, Modal, QuestionModePicker, QuestionProgress } from "./ui";

/**
 * Reopen a closed ticket: the customer has the problem again. The collector asks the feedback
 * questions (as on a call); the answers are saved on the call and become the ticket's problem.
 * onDone(ticket) gets the reopened ticket.
 */
export default function ReopenTicketModal({ ticket, onDone, onClose }) {
  const [questions, setQuestions] = useState(null);
  const [otherEnabled, setOtherEnabled] = useState(true);
  const [services, setServices] = useState([]);
  const contacts = ticket.contacts || [];
  const [contactId, setContactId] = useState(contacts[0]?.id || "");
  const [spokeWith, setSpokeWith] = useState(contacts[0]?.name || "");
  const [qMode, setQMode] = useState("BOTH");
  const [answers, setAnswers] = useState({});
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getQuestions()
      .then((d) => setQuestions(d.questions || []))
      .catch((err) => {
        setError(err.message);
        setQuestions([]);
      });
    getSettings()
      .then((d) => setOtherEnabled(d.settings.other_text_enabled))
      .catch(() => {});
    // The call's services pick the service questions.
    getCall(ticket.request_id)
      .then((c) => setServices([...new Set((c.visits || []).map((v) => v.service).filter(Boolean))]))
      .catch(() => {});
  }, [ticket.request_id]);

  const asked = useMemo(() => questionsFor(questions || [], qMode, services), [questions, qMode, services]);
  const counts = useMemo(() => countModes(questions || [], services, []), [questions, services]);
  const chosen = asked.filter((q) => answers[q.id]);
  const missing = asked.filter((q) => q.is_required && !answers[q.id]);
  const bad = chosen.filter((q) => q.options.find((o) => o.id === answers[q.id])?.is_bad);
  const contact = contacts.find((c) => c.id === contactId) || null;

  function pickContact(id) {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c) setSpokeWith(c.name);
  }

  async function submit() {
    const who = spokeWith.trim();
    if (!who) return setError("Choose or type who gave the feedback");
    if (!chosen.length) return setError("Ask the customer the questions first");
    if (missing.length) return setError(`Answer "${missing[0].question_text}"`);
    setSaving(true);
    setError("");
    try {
      const t = await reopenTicket(ticket.id, ticket.row_version, note.trim() || null, {
        ...(contact && who === contact.name ? { contact_id: contact.id } : {}),
        spoke_with_name: who,
        responses: chosen.map((q) => ({ question_id: q.id, option_id: answers[q.id] })),
        other_feedback: otherEnabled ? other.trim() || null : null,
        ...modeBody(qMode),
      });
      onDone(t);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      className="fb-rt fb-reopen"
      title={`Reopen ${ticket.ticket_number}`}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <span className="fb-small fb-muted fb-spacer">
            {missing.length > 0 && chosen.length > 0 ? `${missing.length} question${missing.length === 1 ? "" : "s"} left · ` : ""}
            {bad.length ? `${bad.length} answer${bad.length === 1 ? "" : "s"} show${bad.length === 1 ? "s" : ""} the issue` : ""}
          </span>
          <button type="button" className="fb-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="fb-btn fb-btn-danger" onClick={submit} disabled={saving || !chosen.length}>
            <FiRotateCcw aria-hidden="true" /> {saving ? "Reopening…" : "Save answers & reopen"}
          </button>
        </>
      }
    >
      <div className="fb-rt-hero is-indigo">
        <span className="fb-rt-hero-icon" aria-hidden="true">
          <FiRotateCcw />
        </span>
        <span>
          <b>The customer has the problem again?</b>
          <small>
            Ask the feedback questions. The answers are saved on the call and the same ticket opens again
            {ticket.action === "RESOLVED_ON_CALL" ? ' with the next step "Book a re-visit"' : ""}.
          </small>
        </span>
      </div>
      <ErrorBox error={error} />

      <div className="fb-field">
        <span className="fb-rt-step">
          <span className="fb-rt-step-no">1</span>Who did you speak with?
        </span>
        <div className="fb-reopen-who">
          {contacts.length > 0 && (
            <select className="fb-select" value={contactId} onChange={(e) => pickContact(e.target.value)} aria-label="Contact">
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          )}
          <input className="fb-input" placeholder="Name of the person" value={spokeWith} onChange={(e) => setSpokeWith(e.target.value)} aria-label="Spoke with" />
        </div>
      </div>

      <section className="fb-rt-sec">
        <span className="fb-rt-step">
          <span className="fb-rt-step-no">2</span>Feedback questions
        </span>
        {!questions ? (
          <Loading />
        ) : (
          <>
            <QuestionModePicker value={qMode} onChange={setQMode} counts={counts} />
            {asked.map((q, n) => (
              <div key={q.id} className={`fb-q ${answers[q.id] ? "is-answered" : ""} ${!q.is_required && !answers[q.id] ? "is-skipped" : ""}`}>
                <div className="fb-q-t">
                  <span className="fb-q-no">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                  <span className="fb-q-text">
                    {q.question_text} {q.is_required ? <span className="fb-req">*</span> : <span className="fb-q-optional">Optional</span>}
                  </span>
                  {q.question_type === "SERVICE" && <span className="fb-q-tag">Service</span>}
                </div>
                <AnswerButtons question={q} value={answers[q.id]} onChange={(optionId) => setAnswers((a) => ({ ...a, [q.id]: optionId }))} />
              </div>
            ))}
            <QuestionProgress questions={asked} answers={answers} />
            {otherEnabled && (
              <label className="fb-field" htmlFor="fb-ro-other">
                Other feedback (optional)
                <textarea id="fb-ro-other" className="fb-textarea" rows={2} maxLength={2000} value={other} onChange={(e) => setOther(e.target.value)} />
              </label>
            )}
          </>
        )}
      </section>

      <label className="fb-field" htmlFor="fb-ro-note">
        Note for the team (optional)
        <input id="fb-ro-note" className="fb-input" maxLength={400} placeholder="e.g. Cockroaches back in the kitchen since Monday" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}
