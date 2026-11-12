// Small helpers shared by the Client Portal pages.

// BestServe support contact shown to clients (sidebar, profile).
export const SUPPORT_CONTACT = {
  email: "info@bestserve.in",
  phone: "8884442625",
  phoneDisplay: "+91 88844 42625",
};

const OUTLET_KEY = "clientPortal.outletId";

export function loadSavedOutlet() {
  try {
    return localStorage.getItem(OUTLET_KEY) || "";
  } catch {
    return "";
  }
}

export function saveOutlet(id) {
  try {
    if (id) localStorage.setItem(OUTLET_KEY, id);
    else localStorage.removeItem(OUTLET_KEY);
  } catch {
    /* storage unavailable: the filter just isn't remembered */
  }
}

export function formatDate(value, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", opts);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export function relativeDay(value) {
  if (!value) return "";
  const d = new Date(value);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days ago`;
}

export function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Period presets for the filter bar.
export const PERIODS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export function periodRange(key, custom = {}) {
  const today = new Date();
  const from = new Date(today);
  if (key === "7d") from.setDate(today.getDate() - 6);
  else if (key === "month") from.setDate(1);
  else if (key === "year") from.setMonth(0, 1);
  else if (key === "custom") return { from: custom.from || ymd(today), to: custom.to || ymd(today) };
  else from.setDate(today.getDate() - 29);
  return { from: ymd(from), to: ymd(today) };
}

const SERVICE_LABELS = {
  PEST: "Pest Control",
  DEEP: "Deep Cleaning",
  BOTH: "Pest Control + Deep Cleaning",
  SALES: "Sales Visit",
};

export function serviceLabel(code) {
  if (!code) return "Service";
  return SERVICE_LABELS[String(code).toUpperCase()] || String(code);
}

const STATUS_LABELS = {
  NOT_STARTED: { label: "Scheduled", className: "st-blue" },
  IN_PROGRESS: { label: "In progress", className: "st-amber" },
  COMPLETED: { label: "Completed", className: "st-green" },
  SCHEDULED: { label: "Scheduled", className: "st-blue" },
  AWAITING_APPROVAL: { label: "Under review", className: "st-amber" },
  MISSED: { label: "Missed", className: "st-red" },
  CANCELED: { label: "Cancelled", className: "st-slate" },
  OPEN: { label: "Open", className: "st-amber" },
  RESOLVED: { label: "Resolved", className: "st-green" },
  CLOSED: { label: "Closed", className: "st-slate" },
};

export function statusInfo(status) {
  return STATUS_LABELS[String(status || "").toUpperCase()] || { label: status || "—", className: "st-slate" };
}

export const RISK_STYLE = {
  CRITICAL: { label: "Critical", className: "risk-critical" },
  HIGH: { label: "High", className: "risk-high" },
  MEDIUM: { label: "Medium", className: "risk-medium" },
  LOW: { label: "Low", className: "risk-low" },
};
