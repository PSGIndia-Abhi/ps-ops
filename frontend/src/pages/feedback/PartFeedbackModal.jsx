import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiPhoneCall } from "react-icons/fi";
import { getQuestions, getSettings, questionsFor, recordPartFeedback } from "./feedbackApi";
import { AnswerButtons, CallButton, ErrorBox, Loading, Modal, QuestionProgress } from "./ui";

/**
 * Optional: once a department (e.g. Accounts Team) has finished its part of a ticket, the collector
 * calls the customer and asks that department's questions (Masters › Questions › Department).
 * Saved on the ticket's call; the ticket itself doesn't change. onDone(ticket) gets the ticket.
 */
export default function PartFeedbackModal({ ticket, part, onDone, onClose }) {
  const [questions, setQuestions] = useState(null);
  const [otherEnabled, setOtherEnabled] = useState(true);
  const contacts = ticket.contacts || [];
  const [contactId, setContactId] = useState(contacts[0]?.id || "");
  const [spokeWith, setSpokeWith] = useState(contacts[0]?.name || "");
  const [answers, setAnswers] = useState({});
  const [other, setOther] = useState("");
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
  }, []);

  const asked = useMemo(() => questionsFor(questions || [], `DEPT:${part.kind}`, []), [questions, part.kind]);
  const chosen = asked.filter((q) => answers[q.id]);
  const missing = asked.filter((q) => q.is_required && !answers[q.id]);
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
      const t = await recordPartFeedback(ticket.id, part.kind, {
        ...(contact && who === contact.name ? { contact_id: contact.id } : {}),
        spoke_with_name: who,
        responses: chosen.map((q) => ({ question_id: q.id, option_id: answers[q.id] })),
        other_feedback: otherEnabled ? other.trim() || null : null,
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
      className="fb-rt fb-partfb"
      title={`${part.label} · customer feedback`}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <span className="fb-small fb-muted fb-spacer">Optional. The ticket doesn't change.</span>
          <button type="button" className="fb-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="fb-btn fb-btn-primary" onClick={submit} disabled={saving || !chosen.length}>
            <FiCheck aria-hidden="true" /> {saving ? "Saving…" : "Save feedback"}
          </button>
        </>
      }
    >
      <div className="fb-rt-hero is-green">
        <span className="fb-rt-hero-icon" aria-hidden="true">
          <FiPhoneCall />
        </span>
        <span>
          <b>{part.label} has finished its part</b>
          <small>Call the customer and ask how it went. Their answers are saved with this ticket.</small>
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
        {contact?.phone && (
          <div style={{ marginTop: 8 }}>
            <CallButton name={contact.name} phone={contact.phone} />
          </div>
        )}
      </div>

      <section className="fb-rt-sec">
        <span className="fb-rt-step">
          <span className="fb-rt-step-no">2</span>
          {part.label} questions
        </span>
        {!questions ? (
          <Loading />
        ) : !asked.length ? (
          <div className="fb-alert fb-alert-info">
            <span>There are no questions for {part.label} yet. Add them in Masters › Questions (type Department).</span>
          </div>
        ) : (
          <>
            {asked.map((q, n) => (
              <div key={q.id} className={`fb-q ${answers[q.id] ? "is-answered" : ""} ${!q.is_required && !answers[q.id] ? "is-skipped" : ""}`}>
                <div className="fb-q-t">
                  <span className="fb-q-no">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                  <span className="fb-q-text">
                    {q.question_text} {q.is_required ? <span className="fb-req">*</span> : <span className="fb-q-optional">Optional</span>}
                  </span>
                </div>
                <AnswerButtons question={q} value={answers[q.id]} onChange={(optionId) => setAnswers((a) => ({ ...a, [q.id]: optionId }))} />
              </div>
            ))}
            <QuestionProgress questions={asked} answers={answers} />
            {otherEnabled && (
              <label className="fb-field" htmlFor="fb-pf-other">
                Other feedback (optional)
                <textarea id="fb-pf-other" className="fb-textarea" rows={2} maxLength={2000} value={other} onChange={(e) => setOther(e.target.value)} />
              </label>
            )}
          </>
        )}
      </section>
    </Modal>
  );
}
