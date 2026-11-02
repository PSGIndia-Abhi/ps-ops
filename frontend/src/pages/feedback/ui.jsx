// Small building blocks shared by the Customer Feedback screens.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowLeft, FiCheck, FiInbox, FiMinus, FiX } from "react-icons/fi";
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

export function PageHead({ crumb, title, sub, after, actions, back }) {
  return (
    <div className="fb-page-head">
      <div className="fb-page-head-text">
        {crumb && <div className="fb-crumb">{crumb}</div>}
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

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fb-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`fb-modal ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
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

/** Answer buttons for one question; bad answers turn red when chosen. */
export function AnswerButtons({ question, value, onChange }) {
  return (
    <div className="fb-opts" role="radiogroup" aria-label={question.question_text}>
      {question.options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`fb-opt ${value === o.id ? "is-on" : ""} ${value === o.id && o.is_bad ? "is-bad" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
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
        {shown.map((h) => (
          <li key={h.key}>
            <span className={`fb-dot fb-tone-${h.tone || "muted"}`} />
            <div className="fb-timeline-text">
              <div className="fb-timeline-title">
                {h.title}
                {h.detail && <span className="fb-timeline-detail"> · {h.detail}</span>}
              </div>
              <div className="fb-small fb-muted">{h.sub}</div>
            </div>
          </li>
        ))}
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
