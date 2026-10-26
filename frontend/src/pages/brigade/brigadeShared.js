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

/* ---- PO files: documents attached to a client PO (kept per PO number) ---- */

export const MAX_PO_FILE_BYTES = 3 * 1024 * 1024;

/** 2048 -> "2 KB", 1572864 -> "1.5 MB". */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** The reason a picked file cannot be uploaded, or "" when it can. Any format is allowed. */
export function poFileProblem(file) {
  return file.size > MAX_PO_FILE_BYTES ? `${file.name} is larger than 3 MB` : "";
}

export function listPoFiles(poNumber) {
  return brigadeRequest(`/api/brigade/po-files?po_number=${encodeURIComponent(poNumber)}`);
}

/** POST /api/brigade/po-files - one file for a PO number; resolves to the saved row. */
export function uploadPoFile(poNumber, file) {
  const form = new FormData();
  form.append("po_number", poNumber);
  form.append("file", file);
  return brigadeRequest("/api/brigade/po-files", { method: "POST", body: form });
}

export function deletePoFile(id) {
  return brigadeRequest(`/api/brigade/po-files/${id}`, { method: "DELETE" });
}

/** Opens (PDF, images) or downloads (anything else) a PO file - fetched with the login token, which a plain link can't carry. */
export async function openPoFile(file) {
  const res = await apiFetch(`/api/brigade/po-files/${file.id}/view`);
  if (!res?.ok) throw new Error((await safeJson(res))?.error || "Could not open the file");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.download = file.file_name || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---- Tax invoices from a PO ---- */

/** Fetches a PDF (with the login token) and returns a blob URL for it; a refusal becomes an Error with the server's message. */
async function fetchPdfUrl(endpoint, options) {
  const res = await apiFetch(endpoint, options);
  if (!res?.ok) {
    const err = new Error((await safeJson(res))?.error || "Request failed");
    err.status = res?.status;
    throw err;
  }
  return URL.createObjectURL(await res.blob());
}

/** POST /api/brigade/billing/invoices/preview - the invoice for the ticked services, stamped PREVIEW. */
export function previewInvoiceUrl(poNumber, jobIds) {
  return fetchPdfUrl("/api/brigade/billing/invoices/preview", { method: "POST", body: JSON.stringify({ po_number: poNumber, job_ids: jobIds }) });
}

export function createInvoice(poNumber, jobIds) {
  return brigadeRequest("/api/brigade/billing/invoices", { method: "POST", body: JSON.stringify({ po_number: poNumber, job_ids: jobIds }) });
}

export function listInvoices(poNumber) {
  return brigadeRequest(`/api/brigade/billing/invoices?po_number=${encodeURIComponent(poNumber)}`);
}

/** Downloads an issued invoice as "Tax Invoice BSPMPL26-27-5000.pdf". */
export async function downloadInvoice(invoice) {
  const url = await fetchPdfUrl(`/api/brigade/billing/invoices/${invoice.id}/pdf`);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tax Invoice ${invoice.invoice_number.replace(/\//g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
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
