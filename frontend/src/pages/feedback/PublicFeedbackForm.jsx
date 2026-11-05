import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FiArrowRight, FiCalendar, FiCheck, FiCheckCircle, FiClock, FiEdit2, FiLock, FiMapPin, FiMessageSquare, FiMinusCircle, FiPhoneCall, FiUser, FiXCircle } from "react-icons/fi";
import logo from "../../assets/logo.png";
import { getPublicForm, submitPublicForm } from "./feedbackApi";
import "./feedback.css";

// The tone of common answer words: good (green), so-so (amber) or bad (red), each with an icon.
// Labels come from Masters › Questions, so anything not recognised is shown in the brand blue.
const GOOD = ["yes", "good", "very good", "excellent", "satisfied", "very satisfied", "on time", "definitely"];
const OK = ["partly", "maybe", "average", "okay", "ok", "somewhat", "not sure", "neutral"];
const BAD = ["no", "poor", "bad", "very poor", "not satisfied", "late", "never"];
function toneOf(label) {
  const l = String(label || "").trim().toLowerCase();
  if (GOOD.includes(l)) return { tone: "good", Icon: FiCheckCircle };
  if (OK.includes(l)) return { tone: "ok", Icon: FiMinusCircle };
  if (BAD.includes(l)) return { tone: "bad", Icon: FiXCircle };
  return { tone: "plain", Icon: FiCheckCircle };
}

function Hero({ form, small }) {
  return (
    <header className={`fb-pf-hero ${small ? "is-small" : ""}`}>
      <span className="fb-pf-logo">
        <img src={logo} alt="BestServe" />
      </span>
      {form && (
        <>
          <p className="fb-pf-eyebrow">Customer feedback</p>
          <h1>How was our service?</h1>
          <p className="fb-pf-lead">Dear {form.customer || "Customer"}, your feedback helps us keep improving. It takes about a minute.</p>
          <div className="fb-pf-tags">
            {form.site && (
              <span>
                <FiMapPin aria-hidden="true" /> {form.site}
              </span>
            )}
            <span>
              <FiCalendar aria-hidden="true" /> {form.month_label}
            </span>
          </div>
        </>
      )}
    </header>
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
      .then((f) => {
        setForm(f);
        // starts as the name of the person the link was sent to; they can change it
        setName((v) => v || f.contact_name || "");
      })
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
      <div className="fb-pf">
        <div className="fb-pf-card">
          <Hero form={null} small />
          <div className="fb-pf-done">
            {done ? (
              <>
                <span className="fb-pf-done-icon is-ok">
                  <FiCheck />
                </span>
                <h2>Thank you{name.trim() ? `, ${name.trim()}` : ""}!</h2>
                <p>Your feedback has been received by the BestServe team.</p>
                <div className="fb-pf-next">
                  <b>What happens next</b>
                  <div>
                    <span className="fb-pf-next-icon">
                      <FiMessageSquare aria-hidden="true" />
                    </span>
                    <span>Our service team reviews your answers.</span>
                  </div>
                  <div>
                    <span className="fb-pf-next-icon">
                      <FiPhoneCall aria-hidden="true" />
                    </span>
                    <span>If you reported a problem, we will call you to put it right.</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="fb-pf-done-icon is-off">
                  <FiClock />
                </span>
                <h2>This link is no longer available</h2>
                <p>{closed}</p>
                <p className="fb-pf-soft">To share feedback, please reply to our WhatsApp message.</p>
              </>
            )}
          </div>
          <p className="fb-pf-foot">BestServe Customer Care</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fb-pf">
      <div className="fb-pf-card">
        <Hero form={form} />

        {!form ? (
          <div className="fb-pf-loading">Loading the form…</div>
        ) : (
          <form className="fb-pf-body" onSubmit={send} noValidate>
            {/* stays at the top while scrolling */}
            <div className="fb-pf-progress" aria-live="polite">
              <div className="fb-pf-progress-top">
                <b>{answered === total && total > 0 ? "All questions answered" : `${answered} of ${total} answered`}</b>
                <span>{total ? Math.round((answered / total) * 100) : 0}%</span>
              </div>
              <div className="fb-pf-steps" aria-hidden="true">
                {form.questions.map((q) => (
                  <i key={q.id} className={answers[q.id] ? "is-done" : ""} />
                ))}
              </div>
            </div>

            <div className="fb-pf-q fb-pf-who">
              <label className="fb-pf-field">
                <span>
                  <FiUser aria-hidden="true" /> Your name
                </span>
                <span className="fb-pf-input-icon">
                  <input maxLength={150} placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <FiEdit2 aria-hidden="true" />
                </span>
                <small className="fb-pf-hint">You can change it if someone else is filling in the form.</small>
              </label>
            </div>

            {form.questions.map((q, n) => (
              <fieldset key={q.id} id={`fb-pq-${q.id}`} className={`fb-pf-q ${answers[q.id] ? "is-done" : ""} ${missingId === q.id ? "is-missing" : ""}`}>
                <legend className="fb-pf-q-t">
                  <span className="fb-pf-qno">{answers[q.id] ? <FiCheck aria-hidden="true" /> : n + 1}</span>
                  <span>
                    {q.question_text}
                    {q.is_required ? (
                      <span className="fb-pf-req" aria-label="required">
                        {" "}
                        *
                      </span>
                    ) : (
                      <span className="fb-pf-optional">Optional</span>
                    )}
                  </span>
                </legend>
                <div className="fb-pf-opts" role="radiogroup" aria-label={q.question_text}>
                  {q.options.map((o) => {
                    const { tone, Icon } = toneOf(o.label);
                    const on = answers[q.id] === o.id;
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={on} className={`fb-pf-opt is-${tone} ${on ? "is-on" : ""}`} onClick={() => pick(q.id, o.id)}>
                        <Icon className="fb-pf-opt-icon" aria-hidden="true" />
                        <span>{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div className="fb-pf-q fb-pf-extra">
              <div className="fb-pf-extra-head">
                <span className="fb-pf-extra-icon" aria-hidden="true">
                  <FiMessageSquare />
                </span>
                <span>
                  <b>Anything else?</b>
                  <small>Additional comments - optional</small>
                </span>
              </div>
              {form.other_text_enabled && (
                <label className="fb-pf-field">
                  <textarea rows={3} maxLength={2000} placeholder="Tell us more about your experience" value={other} onChange={(e) => setOther(e.target.value)} />
                </label>
              )}
            </div>

            <div className="fb-pf-submitbar">
              {error && (
                <div className="fb-pf-error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="fb-pf-submit" disabled={sending}>
                {sending ? (
                  "Submitting…"
                ) : (
                  <>
                    Submit feedback <FiArrowRight aria-hidden="true" />
                  </>
                )}
              </button>
              <p className="fb-pf-privacy">
                <FiLock aria-hidden="true" /> Your responses are shared only with the BestServe service team.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
