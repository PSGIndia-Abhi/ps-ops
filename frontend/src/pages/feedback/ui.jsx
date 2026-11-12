// Small building blocks shared by the Customer Feedback screens.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaBuilding } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiCircle, FiClock, FiEdit2, FiFlag, FiInbox, FiMail, FiMessageCircle, FiMessageSquare, FiMinus, FiMinusCircle, FiPhone, FiPhoneCall, FiRotateCcw, FiSend, FiSmartphone, FiTrash2, FiUser, FiUserCheck, FiUserPlus, FiX, FiXCircle } from "react-icons/fi";
import { CALL_STATUS, PRIORITY, TICKET_STATUS, VISIT_STATUS } from "./feedbackApi";

export function Chip({ tone = "muted", children, title }) {
  return (
    <span className={`fb-chip fb-tone-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function CallStatusChip({ status }) {
  const s = CALL_STATUS[status] || { label: status, tone: "muted" };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function TicketStatusChip({ status }) {
  const s = TICKET_STATUS[status] || { label: status, tone: "muted" };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function VisitStatusChip({ status }) {
  const v = VISIT_STATUS[status];
  return v ? <Chip tone={v.tone}>{v.label}</Chip> : null;
}

export function PriorityChip({ priority }) {
  const p = PRIORITY[priority];
  return p ? <Chip tone={p.tone}>{p.label}</Chip> : null;
}

export function ResultChip({ result }) {
  if (result === "GOOD") return <Chip tone="ok">Good</Chip>;
  if (result === "ISSUE") return <Chip tone="danger">Issue</Chip>;
  if (result === "NO_RESPONSE") return <Chip tone="muted">Not responded</Chip>;
  return null;
}

/** A row of number tiles; a tile with onClick works as a filter. */
/**
 * A row of number cards; a card with onClick works as a filter. Item: { label, value, tone, sub,
 * icon (a react-icons component), share (0..1, drawn as a small bar), active, onClick }.
 */
export function Tiles({ items }) {
  return (
    <div className="fb-tiles">
      {items.map((t) => {
        const Tag = t.onClick ? "button" : "div";
        const Icon = t.icon;
        return (
          <Tag
            key={t.label}
            type={t.onClick ? "button" : undefined}
            className={`fb-tile fb-tile-${t.tone || "dark"} ${t.active ? "is-active" : ""}`}
            onClick={t.onClick}
            aria-pressed={t.onClick ? Boolean(t.active) : undefined}
          >
            <span className="fb-tile-top">
              {Icon && (
                <span className="fb-tile-icon" aria-hidden="true">
                  <Icon />
                </span>
              )}
              <span className="fb-tile-n">{t.value}</span>
            </span>
            <span className="fb-tile-l">{t.label}</span>
            {typeof t.share === "number" && (
              <span className="fb-tile-share" aria-hidden="true">
                <span style={{ width: `${Math.round(Math.min(1, Math.max(0, t.share)) * 100)}%` }} />
              </span>
            )}
            {t.sub && <span className="fb-tile-s">{t.sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}

/** Back arrow: the previous page, or `fallback` when the page was opened directly (new tab, link). */
export function BackButton({ fallback }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="fb-back-btn"
      aria-label="Back"
      title="Back"
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))}
    >
      <FiArrowLeft aria-hidden="true" />
    </button>
  );
}

export function PageHead({ title, sub, after, actions, back }) {
  return (
    <div className="fb-page-head">
      <div className="fb-page-head-text">
        <div className="fb-title-row">
          {back && <BackButton fallback={back} />}
          <h1>{title}</h1>
          {after}
        </div>
        {sub && <div className="fb-sub">{sub}</div>}
      </div>
      {actions && <div className="fb-page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, aside, children, className = "", bodyClass = "" }) {
  return (
    <section className={`fb-card ${className}`}>
      {(title || aside) && (
        <div className="fb-card-h">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {aside && <div className="fb-card-aside">{aside}</div>}
        </div>
      )}
      <div className={`fb-card-b ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Loading({ text = "Loading…" }) {
  return <div className="fb-state">{text}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="fb-alert fb-alert-danger" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <span>{error}</span>
      {onRetry && (
        <button type="button" className="fb-btn fb-btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, text }) {
  return (
    <div className="fb-empty">
      <FiInbox aria-hidden="true" />
      <strong>{title}</strong>
      {text && <span>{text}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide, className = "" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fb-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`fb-modal ${wide ? "is-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="fb-card-h">
          <h2>{title}</h2>
          <button type="button" className="fb-icon-btn" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>
        <div className="fb-modal-b">{children}</div>
        {footer && <div className="fb-modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * "Call" for a customer contact. Customers are called from the Android app, so on the web this
 * only says so (with the number) instead of dialling. onClick runs too (e.g. to pick the contact).
 */
export function CallButton({ name, phone, className = "fb-btn", onClick, children }) {
  const [open, setOpen] = useState(false);
  const number = String(phone || "").trim();
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          onClick?.();
          setOpen(true);
        }}
      >
        <FiPhone aria-hidden="true" /> {children || `Call ${number}`}
      </button>
      {open && (
        <Modal
          title="Use the Android app"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" className="fb-btn fb-btn-primary" onClick={() => setOpen(false)}>
              OK
            </button>
          }
        >
          <div className="fb-row" style={{ gap: 8 }}>
            <FiSmartphone aria-hidden="true" className="fb-muted" />
            <span>Please call {name || "the customer"} from the Android app.</span>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Switch({ checked, onChange, label, disabled, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`fb-switch ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Segmented buttons: one value out of a few. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="fb-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? "is-on" : ""}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A feedback's answers as a table: question, answer (green good / red bad, with the suggested
 * priority) and the customer's own words. onlyBad = just the answers that show an issue.
 */
export function SubmissionAnswers({ submission, onlyBad = false }) {
  const rows = onlyBad ? submission.responses.filter((r) => r.is_bad) : submission.responses;
  return (
    <div>
      <ul className="fb-round-answers fb-answers-1col">
        {rows.map((r) => (
          <li key={r.question_id} className={r.is_bad ? "is-bad" : "is-good"}>
            <span className="fb-round-mark" aria-hidden="true">
              {r.is_bad ? <FiX /> : <FiCheck />}
            </span>
            <span className="fb-round-q">{r.question}</span>
            <span className="fb-round-a">
              {r.answer}
              {r.is_bad && r.suggested_priority ? <PriorityChip priority={r.suggested_priority} /> : null}
            </span>
          </li>
        ))}
      </ul>
      {submission.other_feedback && (
        <blockquote className="fb-round-said">
          <FiMessageSquare aria-hidden="true" /> “{submission.other_feedback}”
        </blockquote>
      )}
    </div>
  );
}

/** Answer buttons for one question: good answers green, bad answers red. */
const MIDDLE_ANSWERS = ["partly", "maybe", "average", "somewhat", "not sure", "neutral", "okay", "ok"];

export function AnswerButtons({ question, value, onChange }) {
  return (
    <div className="fb-opts" role="radiogroup" aria-label={question.question_text}>
      {question.options.map((o) => {
        const Icon = MIDDLE_ANSWERS.includes(String(o.label).trim().toLowerCase()) ? FiMinusCircle : o.is_bad ? FiXCircle : FiCheckCircle;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`fb-opt ${o.is_bad ? "is-bad-opt" : "is-good-opt"} ${value === o.id ? "is-on" : ""} ${value === o.id && o.is_bad ? "is-bad" : ""}`}
            onClick={() => onChange(o.id)}
          >
            <Icon className="fb-opt-icon" aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "3 of 5 answered" with a segment per question (green once answered). */
export function QuestionProgress({ questions, answers }) {
  const done = questions.filter((q) => answers[q.id]).length;
  if (!questions.length) return null;
  return (
    <div className="fb-qprog" aria-live="polite">
      <div className="fb-qprog-top">
        <b>{done === questions.length ? "All questions answered" : `${done} of ${questions.length} answered`}</b>
        <span>{Math.round((done / questions.length) * 100)}%</span>
      </div>
      <div className="fb-qprog-steps" aria-hidden="true">
        {questions.map((q) => (
          <i key={q.id} className={answers[q.id] ? "is-done" : ""} />
        ))}
      </div>
    </div>
  );
}

/**
 * Who the feedback is from, in one card: the customer and site, and the person who gave it - name,
 * position, phone and email (from the site's contacts), and how and when.
 */
export function CustomerCard({ customer, site, contacts = [], feedback }) {
  const who = feedback ? contacts.find((c) => c.id === feedback.contact_id) || contacts.find((c) => c.name === feedback.spoke_with_name) || null : null;
  const name = who?.name || feedback?.spoke_with_name || null;
  return (
    <Card title="Customer">
      <div className="fb-cust">
        <div className="fb-cust-top">
          {/* Every customer is a company: the same building icon for all. */}
          <span className="fb-cust-avatar" aria-hidden="true">
            <FaBuilding />
          </span>
          <div>
            <div className="fb-strong">{customer?.name}</div>
            <div className="fb-site-name">
              {site?.name}
              {site?.city ? <span className="fb-muted">, {site.city}</span> : null}
            </div>
          </div>
        </div>
        {name ? (
          <dl className="fb-cust-kv">
            <dt>
              <FiUser aria-hidden="true" /> Feedback from
            </dt>
            <dd>
              {name}
              {who?.role ? <span className="fb-muted"> · {who.role}</span> : null}
            </dd>
            <dt>
              <FiPhone aria-hidden="true" /> Phone
            </dt>
            <dd>{who?.phone?.trim() || "—"}</dd>
            <dt>
              <FiMail aria-hidden="true" /> Email
            </dt>
            <dd>{who?.email?.trim() || "—"}</dd>
            <dt>
              <FiClock aria-hidden="true" /> Given
            </dt>
            <dd>
              {feedback.source === "FORM" ? "On the WhatsApp form" : "On the call"} · {formatWhen(feedback.submitted_at)}
            </dd>
          </dl>
        ) : (
          <div className="fb-small fb-muted">No feedback yet.</div>
        )}
      </div>
    </Card>
  );
}

function formatWhen(value) {
  const d = value ? new Date(String(value).replace(" ", "T")) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * One round of feedback in the Result (the first call, then each follow-up call): who answered and
 * when, a good / issue badge, "3 of 5 good" with a bar, each answer with a tick or a cross (and the
 * suggested priority of a bad one), and the customer's own words.
 * label: "First feedback" | "Follow-up call 1"; status: { text, tone } for the badge.
 */
export function FeedbackRound({ label, status, submission, extra }) {
  const total = submission.responses.length;
  const good = submission.responses.filter((r) => !r.is_bad).length;
  const Icon = submission.source === "FORM" ? FiInbox : FiPhoneCall;
  return (
    <div className={`fb-round fb-round-${status.tone}`}>
      <span className="fb-round-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="fb-round-body">
        <div className="fb-round-head">
          <div>
            <div className="fb-round-title">
              {label} <Chip tone={status.tone}>{status.text}</Chip>
            </div>
            <div className="fb-small fb-muted">
              {[submission.source === "FORM" ? "Customer's form" : "Call", submission.spoke_with_name, formatWhen(submission.submitted_at), submission.collected_by?.name ? `by ${submission.collected_by.name}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {total > 0 && (
            <div className="fb-round-score" title={`${good} of ${total} answers good`}>
              <b>
                {good}/{total}
              </b>
              <span>good</span>
              <span className="fb-round-bar">
                <span style={{ width: `${(good / total) * 100}%` }} />
              </span>
            </div>
          )}
        </div>
        <ul className="fb-round-answers">
          {submission.responses.map((r) => (
            <li key={r.question_id} className={r.is_bad ? "is-bad" : "is-good"}>
              <span className="fb-round-mark" aria-hidden="true">
                {r.is_bad ? <FiX /> : <FiCheck />}
              </span>
              <span className="fb-round-q">{r.question}</span>
              <span className="fb-round-a">
                {r.answer}
                {r.is_bad && r.suggested_priority ? <PriorityChip priority={r.suggested_priority} /> : null}
              </span>
            </li>
          ))}
        </ul>
        {submission.other_feedback && (
          <blockquote className="fb-round-said">
            <FiMessageSquare aria-hidden="true" /> “{submission.other_feedback}”
          </blockquote>
        )}
        {extra}
      </div>
    </div>
  );
}

/** An icon for each history event (the History timeline). */
const EVENT_ICONS = {
  OPENED: FiUserCheck,
  ASSIGNED: FiUser,
  OWNER_CHANGED: FiUser,
  CALL_ATTEMPT: FiPhone,
  FOLLOWUP_CALL: FiPhoneCall,
  FEEDBACK_SAVED: FiMessageSquare,
  TICKET_RAISED: FiAlertTriangle,
  DONE: FiCheckCircle,
  CLOSED: FiCheckCircle,
  CANCELLED: FiXCircle,
  ACTION_DONE: FiCheckCircle,
  REOPENED: FiRotateCcw,
  FORM_LINK_SENT: FiSend,
  FORM_SUBMITTED: FiInbox,
  FORM_EXPIRED: FiClock,
  WHATSAPP_SENT: FiMessageCircle,
  PRIORITY_SET: FiFlag,
  ACTION_SET: FiArrowRight,
  UPDATED: FiEdit2,
  CONTACT_ADDED: FiUserPlus,
  CONTACT_UPDATED: FiEdit2,
  TICKET_DELETED: FiTrash2,
};

/**
 * A short message in the top-right corner (saved, reopened, ...) that goes away by itself.
 * notice: null | { text, tone: "ok" | "warn" }.
 */
export function Toast({ notice, onClose, ms = 4000 }) {
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [notice, onClose, ms]);
  if (!notice) return null;
  const tone = notice.tone || "ok";
  return createPortal(
    <div className={`fb-pop fb-pop-${tone}`} role="status" aria-live="polite">
      {tone === "ok" ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
      <span>{notice.text}</span>
      <button type="button" className="fb-icon-btn" onClick={onClose} aria-label="Close">
        <FiX />
      </button>
    </div>,
    document.body,
  );
}

/** History list, newest first. Shows the latest `limit` items with a "Show all" button for the rest. */
export function Timeline({ items, limit = 6 }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <div className="fb-muted fb-small">Nothing yet.</div>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ol className="fb-timeline">
        {shown.map((h) => {
          const Icon = EVENT_ICONS[h.event] || FiCircle;
          return (
          <li key={h.key}>
            <span className={`fb-tl-icon fb-tl-${h.tone || "muted"}`} aria-hidden="true">
              <Icon />
            </span>
            <div className="fb-timeline-text">
              <div className="fb-timeline-title">
                {h.title}
                {h.detail && <span className="fb-timeline-detail"> · {h.detail}</span>}
              </div>
              <div className="fb-small fb-muted">{h.sub}</div>
            </div>
          </li>
          );
        })}
      </ol>
      {items.length > limit && (
        <button type="button" className="fb-btn fb-btn-sm fb-btn-link" style={{ marginTop: 6 }} onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

const STEP_STATE_TEXT = { done: "done", current: "in progress", skipped: "skipped", todo: "not yet" };

/** A progress bar of stages; steps come from callStages() / ticketStages() in feedbackApi.js. */
export function Steps({ steps, small, label }) {
  return (
    <ol className={`fb-steps ${small ? "is-small" : ""}`} aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.key} className={`fb-step is-${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="fb-step-dot" aria-hidden="true">
            {s.state === "done" ? <FiCheck /> : s.state === "skipped" ? <FiMinus /> : i + 1}
          </span>
          <span className="fb-step-label">
            {s.label}
            <span className="fb-sr-only"> ({STEP_STATE_TEXT[s.state]})</span>
          </span>
          {s.sub && <span className={`fb-step-sub ${s.late || /overdue/.test(s.sub) ? "is-late" : ""}`}>{s.sub}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Which questions to ask: General, Service-based (the questions for the month's services) or Both,
 * with how many questions each gives. counts: { GENERAL, SERVICE, BOTH }.
 */
export function QuestionModePicker({ value, onChange, counts, departments = [] }) {
  // Departments with questions are extra choices ("DEPT:ACCOUNTS").
  const deptModes = departments
    .filter((d) => counts[`DEPT:${d.kind}`])
    .map((d) => [`DEPT:${d.kind}`, d.name || d.label, "Questions for this department"]);
  return (
    <div className="fb-qmode" role="radiogroup" aria-label="Which questions to ask">
      {[
        ["GENERAL", "General", "Questions for every customer"],
        ["SERVICE", "Service-based", "For this month's services"],
        ["BOTH", "Both", "General and service questions"],
        ...deptModes,
      ].map(([mode, label, hint]) => (
        <button key={mode} type="button" role="radio" aria-checked={value === mode} className={value === mode ? "is-on" : ""} disabled={!counts[mode]} onClick={() => onChange(mode)}>
          <span>
            <b>
              {label} · {counts[mode]}
            </b>
            <small>{counts[mode] ? hint : "No questions for this"}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Closing a ticket whose work is done: without the customer's feedback (an optional note), or by
 * taking the feedback first (the follow-up questions; all good closes it).
 */
export function CloseTicketChoice({ ticketNumber, saving, note, onNote, onCloseNow, onTakeFeedback, onCancel }) {
  const [mode, setMode] = useState("");
  return (
    <Modal
      title={`Close ${ticketNumber}?`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="fb-btn" onClick={onCancel}>
            Cancel
          </button>
          {mode === "now" && (
            <button type="button" className="fb-btn fb-btn-ok" disabled={saving} onClick={onCloseNow}>
              {saving ? "Closing…" : "Close the ticket"}
            </button>
          )}
          {mode === "feedback" && (
            <button type="button" className="fb-btn fb-btn-primary" onClick={onTakeFeedback}>
              Take the feedback
            </button>
          )}
        </>
      }
    >
      <div className="fb-stack" style={{ gap: 12 }}>
        <p className="fb-small fb-muted" style={{ margin: 0 }}>
          Every team has finished its work. How do you want to close it?
        </p>
        <div className="fb-close-choice" role="radiogroup" aria-label="How to close">
          <button type="button" role="radio" aria-checked={mode === "feedback"} className={`fb-close-opt is-feedback ${mode === "feedback" ? "is-on" : ""}`} onClick={() => setMode("feedback")}>
            <span className="fb-close-opt-icon" aria-hidden="true">
              <FiPhoneCall />
            </span>
            <span>
              <b>Close by taking feedback</b>
              <small>Call the customer and ask the questions again. Satisfied: the ticket closes.</small>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={mode === "now"} className={`fb-close-opt is-now ${mode === "now" ? "is-on" : ""}`} onClick={() => setMode("now")}>
            <span className="fb-close-opt-icon" aria-hidden="true">
              <FiCheck />
            </span>
            <span>
              <b>Close without feedback</b>
              <small>Close it now, without the follow-up call. You can reopen it later.</small>
            </span>
          </button>
        </div>
        {mode === "now" && (
          <label className="fb-field" htmlFor="fb-close-choice-note">
            Note (optional)
            <textarea id="fb-close-choice-note" className="fb-textarea" rows={2} maxLength={400} placeholder="e.g. Customer said on WhatsApp it is sorted" value={note} onChange={(e) => onNote(e.target.value)} />
          </label>
        )}
      </div>
    </Modal>
  );
}
