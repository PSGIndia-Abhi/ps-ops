// Shared building blocks for the Lead Management screens.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertCircle, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInbox, FiX } from "react-icons/fi";
import { stageOf } from "./format";
import { ToastContext } from "./hooks";

/* ------------------------------------------------------------ small parts */

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#d97706", "#db2777", "#0891b2", "#4f46e5", "#16a34a"];

export function Avatar({ name = "", size = 36 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  const color = AVATAR_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="lm-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: color }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Who({ name, sub, size = 36 }) {
  return (
    <span className="lm-who">
      <Avatar name={name} size={size} />
      <span className="lm-who-text">
        <strong>{name}</strong>
        {!!sub && <small>{sub}</small>}
      </span>
    </span>
  );
}

export function Badge({ tone = "neutral", children, plain = false }) {
  return <span className={`lm-badge tone-${tone}${plain ? " plain" : ""}`}>{children}</span>;
}

export function StageBadge({ stage }) {
  const s = stageOf(stage);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Counts up to `value` once, when it first appears (and again if it changes). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-IN"), duration = 900 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(origin + (value - origin) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/** A headline number. Give it `onClick` to make the whole card a button. */
export function Kpi({ label, value, icon, tone = "info", foot, format, index = 0, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`lm-kpi tone-${tone}`} style={{ "--i": index }} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="lm-kpi-top">
        <span className="lm-kpi-label">{label}</span>
        <span className="lm-kpi-icon">{icon}</span>
      </div>
      <div className="lm-kpi-value">
        <CountUp value={value} format={format} />
      </div>
      {!!foot && <div className="lm-kpi-foot">{foot}</div>}
      <span className="lm-kpi-bar" />
    </Tag>
  );
}

export function Card({ title, sub, action, children, index = 0, flush = false, className = "" }) {
  return (
    <section className={`lm-card ${className}`} style={{ "--i": index }}>
      {(title || action) && (
        <header className="lm-card-head">
          <div>
            {!!title && <h2>{title}</h2>}
            {!!sub && <small>{sub}</small>}
          </div>
          {action}
        </header>
      )}
      {flush ? children : <div className="lm-card-body">{children}</div>}
    </section>
  );
}

export function Empty({ title, text, icon = <FiInbox />, action }) {
  return (
    <div className="lm-empty">
      <span className="lm-empty-art">{icon}</span>
      <strong>{title}</strong>
      {!!text && <span>{text}</span>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div style={{ padding: 20, display: "grid", gap: 14 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="lm-skel" style={{ height: 44, opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}

export function Button({ variant = "primary", size, block, busy, children, icon, ...rest }) {
  const cls = ["lm-btn", variant, size, block ? "block" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={busy || rest.disabled} {...rest}>
      {busy ? <span className="lm-spinner" /> : icon}
      {children}
    </button>
  );
}

export function Field({ label, required, error, hint, wide, children }) {
  return (
    <label className={`lm-field${wide ? " wide" : ""}`}>
      <span className="lm-label">
        {label} {required && <i>*</i>}
      </span>
      {children}
      {error ? <span className="lm-err">{error}</span> : !!hint && <span className="lm-hint">{hint}</span>}
    </label>
  );
}

export function Note({ tone = "warn", children }) {
  return (
    <div className={`lm-note tone-${tone}`} role="status">
      <FiAlertCircle />
      <div>{children}</div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="lm-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === value} className={`lm-tab${t.key === value ? " on" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="lm-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pages, total, perPage, onPage }) {
  if (total === 0) return null;
  const first = (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  return (
    <div className="lm-table-foot">
      <span>
        Showing {first}-{last} of {total}
      </span>
      <div className="lm-pager">
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <FiChevronLeft />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" className={n === page ? "on" : ""} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>
            {n}
          </button>
        ))}
        <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <FiChevronRight />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ overlays */

const host = () => document.querySelector(".lm-root") || document.body;

/**
 * A panel that slides in from the right, the way Task Management's forms do
 * (pass `side={false}` for a centred dialog instead). Closes on Escape and on
 * a click outside, and plays its exit before unmounting.
 */
export function Modal({ title, sub, onClose, children, footer, wide, side = true }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return createPortal(
    <div className={`lm-scrim${side ? " side" : ""}${closing ? " closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={side ? `lm-drawer${wide ? " wide" : ""}` : `lm-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="lm-modal-head">
          <div>
            <h2>{title}</h2>
            {!!sub && <p>{sub}</p>}
          </div>
          <button type="button" className="lm-x" onClick={close} aria-label="Close">
            <FiX />
          </button>
        </header>
        <div className="lm-modal-body">{typeof children === "function" ? children(close) : children}</div>
        {!!footer && <footer className="lm-modal-foot">{typeof footer === "function" ? footer(close) : footer}</footer>}
      </div>
    </div>,
    host(),
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, bad = false) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, text, bad }]);
    setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 3400);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3700);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="lm-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`lm-toast${t.bad ? " bad" : ""}${t.leaving ? " leaving" : ""}`}>
            {t.bad ? <FiAlertCircle /> : <FiCheckCircle />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** The animated tick shown when something has been saved. */
export function Done({ title, text, children }) {
  return (
    <div className="lm-done">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" />
        <path d="M15 24.5l6 6 12-13" />
      </svg>
      <h3>{title}</h3>
      {!!text && <p>{text}</p>}
      {children}
    </div>
  );
}
