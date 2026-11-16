import { useEffect } from "react";
import { typeClass, typeLabel } from "./format";

// Small shared pieces for the Billing screens.

/** A coloured summary card (blue, green, orange, red, purple). */
export function Kpi({ color = "blue", label, value, note, onClick, active }) {
  return (
    <div
      className={`ac-kpi ${color}${onClick ? " clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      style={active ? { boxShadow: "0 0 0 3px rgba(15,23,42,.25)" } : undefined}
    >
      <div className="ac-kpi-label">{label}</div>
      <div className="ac-kpi-value">{value}</div>
      {note && <div className="ac-kpi-note">{note}</div>}
    </div>
  );
}

/** "9 / 10 ⚠" style chip for services done against planned. */
export function ServicesChip({ done, planned }) {
  if (planned === null || planned === undefined) return <span className="bl-svc none">—</span>;
  const cls = done < planned ? "short" : done > planned ? "extra" : "ok";
  return <span className={`bl-svc ${cls}`}>{done} / {planned}{done < planned ? " ⚠" : ""}</span>;
}

export function TypeBadge({ type, frequency }) {
  return <span className={`ac-badge ${typeClass(type)}`}>{typeLabel(type, frequency)}</span>;
}

const COLOR = {
  ACTIVE: "b-green", PAID: "b-green", COMPLETED: "b-green", ISSUED: "b-green", SENT: "b-green",
  PENDING: "b-amber", DRAFT: "b-amber", SCHEDULED: "b-amber", EXPIRING: "b-amber", LOGGED: "b-grey",
  PARTIAL: "b-blue", OVERDUE: "b-red", EXPIRED: "b-red", SHORT: "b-red", FAILED: "b-red",
  CANCELLED: "b-grey", CLOSED: "b-grey", ENDED: "b-grey", PAUSED: "b-amber", EXTRA: "b-purple",
};
const LABEL = { PARTIAL: "Partial", EXPIRING: "Expiring soon" };

export function StatusBadge({ value, label }) {
  const key = String(value || "").toUpperCase();
  const text = label || LABEL[key] || (key ? key.charAt(0) + key.slice(1).toLowerCase() : "—");
  return <span className={`ac-badge ${COLOR[key] || "b-grey"}`}>{text}</span>;
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
