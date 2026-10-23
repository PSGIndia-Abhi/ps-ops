// Brigade Executive module — shared front-end helpers.
// The backend (/api/brigade/meta) is the source of truth for the service list
// and the flat-number rule; these mirror it for instant form feedback.
import { apiFetch, safeJson } from "../../api";

export const BRIGADE_ROLE = "brigade_executive";

// One capital letter, a hyphen, then exactly 4 digits: L-0123
export const FLAT_NUMBER_PATTERN = /^[A-Z]-\d{4}$/;
export const FLAT_NUMBER_HINT = "Format: one capital letter, hyphen, 4 digits (e.g. L-0123)";

export const MIN_VISIT_PHOTOS = 1;

export function isValidFlatNumber(value) {
  return FLAT_NUMBER_PATTERN.test(value || "");
}

// Explains what is wrong with a flat number while it is typed.
export function flatNumberError(value) {
  if (!value) return "";
  if (isValidFlatNumber(value)) return "";
  if (/\s/.test(value)) return "No spaces allowed. " + FLAT_NUMBER_HINT;
  if (!/^[A-Z]/.test(value)) return "Must start with one capital letter. " + FLAT_NUMBER_HINT;
  if (value[1] !== "-") return "Second character must be a hyphen. " + FLAT_NUMBER_HINT;
  return "Needs exactly 4 digits after the hyphen. " + FLAT_NUMBER_HINT;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function formatInr(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? inr.format(num) : "—";
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function statusLabel(status) {
  return (status || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

// Panel base path for the current role (Brigade Executive vs admin).
export function brigadeBasePath() {
  return localStorage.getItem("role") === BRIGADE_ROLE ? "/brigade" : "/admin";
}

// fetch + JSON + error message in one place.
export async function brigadeRequest(endpoint, options) {
  const res = await apiFetch(endpoint, options);
  const data = await safeJson(res);
  if (!res?.ok) {
    const err = new Error(data?.error || "Request failed");
    err.status = res?.status;
    err.data = data;
    throw err;
  }
  return data;
}
