import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiInbox, FiX } from "react-icons/fi";
import { PRIORITY, STATUS } from "./data";
import { initials } from "./format";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#4f46e5"];

export function Avatar({ name, size = 32 }) {
  let hash = 0;
  for (const ch of name || "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="tp-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ status, live = false }) {
  const s = STATUS[status] || STATUS.OPEN;
  return (
    <span className="tp-badge" style={{ color: s.color, background: s.soft }}>
      {live && status === "IN_PROGRESS" && <span className="tp-live-dot" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}

export function PriorityBadge({ priority, long = false }) {
  const p = PRIORITY[priority] || PRIORITY.MEDIUM;
  return (
    <span className="tp-badge" style={{ color: p.color, background: p.soft }}>
      {p.label}
      {long ? " Priority" : ""}
    </span>
  );
}

export function PriorityDot({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.MEDIUM;
  return <span className="tp-pdot" style={{ background: priority === "URGENT" ? p.soft : p.color }} />;
}

export function Skeleton({ height = 16, width = "100%", radius = 8, style }) {
  return <span className="tp-skel" style={{ height, width, borderRadius: radius, ...style }} />;
}

export function EmptyState({ icon = FiInbox, title, text, children }) {
  const Icon = icon;
  return (
    <div className="tp-empty">
      <span className="tp-empty-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/**
 * Dialog rendered inside .tp-root (so the scoped styles apply).
 * `children` may be a function receiving `close`, which plays the exit
 * animation and then calls `onClose`.
 */
export function Modal({ title, onClose, children, size = "md", hideHeader = false }) {
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const host = document.querySelector(".tp-root") || document.body;

  return createPortal(
    <div className={`tp-overlay ${closing ? "closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`tp-modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        {!hideHeader && (
          <div className="tp-modal-head">
            <h3>{title}</h3>
            <button type="button" className="tp-icon-btn" onClick={close} aria-label="Close">
              <FiX />
            </button>
          </div>
        )}
        {hideHeader && (
          <button type="button" className="tp-icon-btn tp-modal-x" onClick={close} aria-label="Close">
            <FiX />
          </button>
        )}
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>,
    host,
  );
}

/** Count-up number for KPI tiles. */
export function CountUp({ value, duration = 850 }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n}</>;
}

/** Full-screen "done" moment: expanding rings and a drawn check mark. */
export function CompletionBurst() {
  const host = document.querySelector(".tp-root") || document.body;
  return createPortal(
    <div className="tp-burst" aria-hidden="true">
      <span className="tp-burst-ring" />
      <span className="tp-burst-ring two" />
      <svg viewBox="0 0 52 52">
        <circle cx="26" cy="26" r="24" className="c" />
        <path d="M15 27l8 8 14-16" className="k" />
      </svg>
    </div>,
    host,
  );
}
