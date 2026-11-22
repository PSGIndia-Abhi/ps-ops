import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiDroplet, FiRepeat, FiShield, FiZap } from "react-icons/fi";
import { typeLabel } from "./format";

// Small shared pieces for the Billing screens.

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const NUM_RE = /\d[\d,]*(\.\d+)?/g;

/**
 * Text whose numbers count up from 0 (e.g. "11 / 11", "₹1.2L", "42") when it first shows or changes.
 * Non-text values (elements) and reduced-motion users get the value as it is.
 */
export function CountUp({ value, duration = 900 }) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : null;
  const animates = text !== null && /\d/.test(text) && !reducedMotion();
  // Progress belongs to one text: a new text starts again from 0 (no flash of the final value).
  const [anim, setAnim] = useState({ text: null, p: 1 });
  const p = !animates ? 1 : anim.text === text ? anim.p : 0;
  useEffect(() => {
    if (!animates) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setAnim({ text, p: 1 - (1 - t) ** 3 }); // ease-out
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, animates]);
  if (text === null) return value;
  if (p >= 1) return text;
  return text.replace(NUM_RE, (m) => {
    const decimals = (m.split(".")[1] || "").length;
    const n = Number(m.replace(/,/g, "")) * p;
    const s = n.toFixed(decimals);
    return m.includes(",") ? Number(s).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
  });
}

/**
 * A summary card: white card, tinted icon badge in the accent colour (blue, green, orange, red,
 * purple, teal), label, big number, note, and an optional mini progress bar (0-100).
 * Clickable cards lift on hover; `active` (the filter it stands for is on) gets an accent ring.
 */
export function Kpi({ color = "blue", label, value, note, onClick, active, icon: Icon, progress }) {
  const pct = progress === undefined || progress === null ? null : Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div
      className={`bl-kpi ${color}${onClick ? " clickable" : ""}${active ? " active" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick && active !== undefined ? Boolean(active) : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className="bl-kpi-top">
        <span className="bl-kpi-label">{label}</span>
        {Icon ? <span className="bl-kpi-icon"><Icon /></span> : <span className="bl-kpi-dot" />}
      </div>
      <div className="bl-kpi-value"><CountUp value={value} /></div>
      {pct !== null && <div className="bl-kpi-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
      {note && <div className="bl-kpi-note">{note}</div>}
    </div>
  );
}

/** "9 / 10 ⚠" style chip for services done against planned. */
export function ServicesChip({ done, planned }) {
  if (planned === null || planned === undefined) return <span className="bl-svc none">—</span>;
  const cls = done < planned ? "short" : done > planned ? "extra" : "ok";
  return <span className={`bl-svc ${cls}`}>{done} / {planned}{done < planned ? " ⚠" : ""}</span>;
}

const TYPE_ICON = { AMC: FiRepeat, ONE_TIME: FiZap, TERMITE: FiShield, CHEMICAL: FiDroplet };
const TYPE_TONE = { AMC: "blue", ONE_TIME: "teal", TERMITE: "orange", CHEMICAL: "purple" };

/** Billing type chip: tinted icon, the type, and the frequency (e.g. AMC · Monthly). */
export function TypeBadge({ type, frequency, unit }) {
  const Icon = TYPE_ICON[type] || FiRepeat;
  const [main, ...rest] = typeLabel(type, frequency, unit).split(" · ");
  return (
    <span className={`bl-type ${TYPE_TONE[type] || "blue"}`} title={typeLabel(type, frequency, unit)}>
      <span className="bl-type-ic"><Icon /></span>
      <b>{main}</b>{rest.length > 0 && <span className="bl-type-sub">{rest.join(" · ")}</span>}
    </span>
  );
}

const COLOR = {
  ACTIVE: "b-green", PAID: "b-green", COMPLETED: "b-green", ISSUED: "b-green", SENT: "b-green",
  PENDING: "b-amber", DRAFT: "b-amber", SCHEDULED: "b-amber", EXPIRING: "b-amber", LOGGED: "b-grey",
  PARTIAL: "b-blue", OVERDUE: "b-red", EXPIRED: "b-red", SHORT: "b-red", FAILED: "b-red",
  CANCELLED: "b-grey", CLOSED: "b-grey", ENDED: "b-grey", PAUSED: "b-amber", EXTRA: "b-purple",
};
const LABEL = { PARTIAL: "Partially paid", EXPIRING: "Expiring soon" };

export function StatusBadge({ value, label }) {
  const key = String(value || "").toUpperCase();
  const text = label || LABEL[key] || (key ? key.charAt(0) + key.slice(1).toLowerCase() : "—");
  return <span className={`bl-status ${(COLOR[key] || "b-grey").slice(2)}`}><span className="bl-status-dot" />{text}</span>;
}

/** Error (with the server's list of problems) or success message. */
export function Msg({ error, errors, ok }) {
  if (!error && !ok) return null;
  return (
    <div className={`bl-msg ${error ? "err" : "ok"}`} role={error ? "alert" : "status"}>
      {error || ok}
      {error && errors?.length > 0 && !(errors.length === 1 && errors[0] === error) && (
        <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  );
}

/** A dialog over the page. Closes on Escape. */
export function Modal({ children, onClose, narrow = false, label }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ac-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`bl-modal${narrow ? " narrow" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** A labelled form field. */
export function Field({ label, required, children, className = "", hint }) {
  return (
    <div className={`ac-field ${className}`}>
      <label>
        {label}
        {required && <span className="bl-req"> *</span>}
      </label>
      {children}
      {hint && <span className="bl-sub" style={{ color: "#64748b", fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

/** Progress bar coloured by status. */
export function Bar({ done, planned, status }) {
  const pct = planned ? Math.min(100, Math.round((done * 100) / planned)) : 0;
  const color = { SHORT: "red", SCHEDULED: "amber", COMPLETED: "green", EXTRA: "purple" }[status] || "";
  return (
    <div className={`bl-bar ${color}`}>
      <i style={{ width: `${status === "EXTRA" ? 100 : pct}%` }} />
    </div>
  );
}

/** Back arrow at the top of a page (same square button as the SOS page): goes to `to`. */
export function BackButton({ to, label }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="sos-back bl-back" onClick={() => navigate(to)} aria-label={`Back to ${label}`} title={`Back to ${label}`}>
      <FiArrowLeft />
    </button>
  );
}

/** "2026-11" moved by n months. */
export function shiftMonth(ym, n) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Month picker with ‹ › arrows to step one month back / forward. `value` "YYYY-MM" ("" = all months,
 * when `allowEmpty`; the arrows then start from `fallback`). `max`: no later month.
 */
export function MonthPicker({ value, onChange, max, allowEmpty = false, fallback, title, width = 190 }) {
  const base = value || fallback;
  const nextOff = !base || (max && base >= max);
  return (
    <div className="bl-monthnav">
      <button type="button" className="bl-monthnav-btn" onClick={() => base && onChange(shiftMonth(base, -1))} disabled={!base} aria-label="Previous month" title="Previous month"><FiChevronLeft /></button>
      <input type="month" className="ac-input" style={{ width }} value={value} max={max} title={title}
        onChange={(e) => onChange(e.target.value || (allowEmpty ? "" : fallback || value))} aria-label="Month" />
      <button type="button" className="bl-monthnav-btn" onClick={() => base && !nextOff && onChange(shiftMonth(base, 1))} disabled={nextOff} aria-label="Next month" title="Next month"><FiChevronRight /></button>
    </div>
  );
}
