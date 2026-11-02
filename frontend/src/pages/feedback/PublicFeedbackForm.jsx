import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FiCheck, FiClock, FiFrown, FiLock, FiMapPin, FiMeh, FiSmile } from "react-icons/fi";
import logo from "../../assets/logo.png";
import { getPublicForm, submitPublicForm } from "./feedbackApi";
import "./feedback.css";

// A face for common answer words, so the form reads at a glance. Labels come from Masters ›
// Questions, so anything not recognised simply has no icon.
const GOOD = ["yes", "good", "very good", "excellent", "satisfied", "very satisfied", "on time", "definitely"];
const OK = ["partly", "maybe", "average", "okay", "ok", "somewhat", "not sure", "neutral"];
const BAD = ["no", "poor", "bad", "very poor", "not satisfied", "late", "never"];
function faceFor(label) {
  const l = String(label || "").trim().toLowerCase();
  if (GOOD.includes(l)) return { Icon: FiSmile, tone: "good" };
  if (OK.includes(l)) return { Icon: FiMeh, tone: "ok" };
  if (BAD.includes(l)) return { Icon: FiFrown, tone: "bad" };
  return null;
}

function Header({ form }) {
  return (
    <div className="fb-public-hero">
      <div className="fb-public-logo">
        <img src={logo} alt="BestServe" />
      </div>
      {form && (
        <>
          <p className="fb-public-hello">Hello{form.customer ? `, ${form.customer}` : ""}</p>
          <h1>How was our service?</h1>
          <p className="fb-public-lead">Your answers take less than a minute and help us serve you better.</p>
          <div className="fb-public-chips">
            {form.site && (
              <span>
                <FiMapPin aria-hidden="true" /> {form.site}
              </span>
            )}
            <span>Services in {form.month_label}</span>
          </div>
        </>
      )}
    </div>
  );
}

// The customer's feedback form, opened from the WhatsApp link: /feedback/<token>. No login - the
// token in the link is the key, it works once and expires (Masters › Settings).
export default function PublicFeedbackForm() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [closed, setClosed] = useState(null); // message when the link can't be used
  const [answers, setAnswers] = useState({});
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [missingId, setMissingId] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPublicForm(token)
      .then(setForm)
      .catch((err) => setClosed(err.status === 404 || err.status === 410 ? err.message : "We couldn't open the form. Please check your internet connection and open the link again."));
  }, [token]);

  const total = form?.questions.length || 0;
  const answered = form ? form.questions.filter((q) => answers[q.id]).length : 0;

  function pick(questionId, optionId) {
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    if (missingId === questionId) {
      setMissingId(null);
      setError("");
    }
  }

  async function send(e) {
    e.preventDefault();
    const missing = form.questions.find((q) => q.is_required && !answers[q.id]);
    if (missing) {
      setError(`Please answer: ${missing.question_text}`);
      setMissingId(missing.id);
      document.getElementById(`fb-pq-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    setError("");
    try {
      await submitPublicForm(token, {
        responses: Object.entries(answers).map(([questionId, optionId]) => ({ question_id: Number(questionId), option_id: optionId })),
        other_feedback: form.other_text_enabled ? other.trim() || null : null,
        name: name.trim() || null,
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      if (err.status === 410) setClosed(err.message);
      else setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (done || closed) {
    return (
      <div className="fb-public">
        <div className="fb-public-card">
          <Header form={null} />
          <div className="fb-public-done">
            {done ? (
              <>
                <div className="fb-public-icon is-ok">
                  <FiCheck />
                </div>
                <h1>Thank you{name.trim() ? `, ${name.trim()}` : ""}!</h1>
                <p>Your feedback has reached the BestServe team.</p>
                <p className="fb-muted">If you told us about a problem, our team will contact you soon to put it right.</p>
              </>
            ) : (
              <>
                <div className="fb-public-icon is-off">
                  <FiClock />
                </div>
                <h1>This link can't be used</h1>
                <p>{closed}</p>
                <p className="fb-muted">If you still want to share feedback, please reply to our WhatsApp message.</p>
              </>
            )}
          </div>
          <p className="fb-public-foot">BestServe Customer Care</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fb-public">
      <div className="fb-public-card">
        <Header form={form} />

        {!form ? (
          <div className="fb-state">Opening the form…</div>
        ) : (
          <form className="fb-public-body" onSubmit={send} noValidate>
            <div className="fb-public-progress" aria-live="polite">
              <div className="fb-public-progress-text">
                <span>
                  {answered} of {total} answered
                </span>
                {answered === total && total > 0 && <span className="fb-public-ready">All done</span>}
              </div>
              <div className="fb-public-progress-bar">
                <span style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
              </div>
            </div>

            {form.questions.map((q, n) => (
              <fieldset key={q.id} id={`fb-pq-${q.id}`} className={`fb-public-qcard ${answers[q.id] ? "is-done" : ""} ${missingId === q.id ? "is-missing" : ""}`}>
                <legend className="fb-public-q-t">
                  <span className="fb-public-qno">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                  <span>
                    {q.question_text} {q.is_required && <span className="fb-req" aria-label="required">*</span>}
                  </span>
                </legend>
                <div className={`fb-public-opts ${q.options.length <= 3 ? "is-row" : ""}`}>
                  {q.options.map((o) => {
                    const face = faceFor(o.label);
                    const on = answers[q.id] === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`fb-public-opt ${on ? "is-on" : ""} ${face ? `is-${face.tone}` : ""}`}
                        onClick={() => pick(q.id, o.id)}
                      >
                        {face && <face.Icon className="fb-public-face" aria-hidden="true" />}
                        <span>{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {form.other_text_enabled && (
              <label className="fb-public-qcard fb-public-extra">
                <span className="fb-public-q-t">
                  <span>
                    Anything else you'd like to tell us? <span className="fb-muted fb-small">(optional)</span>
                  </span>
                </span>
                <textarea className="fb-textarea" rows={3} maxLength={2000} placeholder="Type here…" value={other} onChange={(e) => setOther(e.target.value)} />
              </label>
            )}
            <label className="fb-public-qcard fb-public-extra">
              <span className="fb-public-q-t">
                <span>
                  Your name <span className="fb-muted fb-small">(optional)</span>
                </span>
              </span>
              <input className="fb-input" maxLength={150} placeholder="So we know who to thank" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>

            <p className="fb-public-privacy">
              <FiLock aria-hidden="true" /> Your answers go only to the BestServe service team.
            </p>

            <div className="fb-public-submitbar">
              {error && (
                <div className="fb-alert fb-alert-danger" role="alert">
                  <span>{error}</span>
                </div>
              )}
              <button type="submit" className="fb-btn fb-btn-primary fb-public-submit" disabled={sending}>
                {sending ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
