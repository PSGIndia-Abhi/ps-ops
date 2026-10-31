import { useLocation } from "react-router-dom";

// Base path of the panel the page is mounted in: "/admin/audits" or "/supervisor/audits".
export function useAuditBase() {
  const { pathname } = useLocation();
  return `/${pathname.split("/")[1] || "admin"}/audits`;
}

export const AUDIT_STATUS = {
  IN_PROGRESS: { label: "In progress", cls: "au-pill-blue" },
  SUBMITTED: { label: "Completed", cls: "au-pill-green" },
  AMENDING: { label: "Amending", cls: "au-pill-amber" },
  CANCELLED: { label: "Cancelled", cls: "au-pill-grey" },
};

export const AREA_STATUS = {
  NOT_STARTED: { label: "Not started", cls: "au-pill-grey" },
  IN_PROGRESS: { label: "In progress", cls: "au-pill-blue" },
  COMPLETED: { label: "Completed", cls: "au-pill-green" },
};

export const RISK_CLS = { CRITICAL: "au-risk-critical", HIGH: "au-risk-high", MEDIUM: "au-risk-medium", LOW: "au-risk-low" };
export const RISK_LABEL = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export const AUDIT_TYPE_LABEL = {
  PRE_SALE: "Pre-sale audit", COMPLAINT: "Complaint audit", ROUTINE: "Routine audit", OTHER: "Other",
  // Older audits.
  RODENT: "Rodent", GENERAL_PEST: "General Pest Control", TERMITE: "Termite",
};
export const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-24" -> "24 Oct 2026" (parsed from the string, so no timezone shift).
export function fmtDate(value) {
  if (!value || typeof value !== "string") return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "2026-10-24T10:45:00" -> "24 Oct 2026, 10:45"
export function fmtDateTime(value) {
  if (!value || typeof value !== "string") return "—";
  const time = value.slice(11, 16);
  return time ? `${fmtDate(value)}, ${time}` : fmtDate(value);
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
