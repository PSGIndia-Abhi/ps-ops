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

/* ---- GST (fixed 18%: CGST 9% + SGST 9%) and PO checks ---- */
// Service prices exclude GST. A client PO amount INCLUDES GST (₹10,000 PO = ₹8,474.58
// service value + ₹762.71 CGST + ₹762.71 SGST), so it is compared with value + GST.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** GST on a service value: { base, cgst, sgst, gst, total } (total incl. GST). */
export function gstOn(value) {
  const base = r2(value);
  const half = r2(base * 0.09);
  return { base, cgst: half, sgst: half, gst: r2(half * 2), total: r2(base + half * 2) };
}

/** Splits an amount that includes GST: ₹10,000 -> { base 8474.58, cgst 762.71, sgst 762.71, gst, total }. */
export function gstInside(total) {
  const t = r2(total);
  const base = r2(t / 1.18);
  const gst = r2(t - base);
  const cgst = r2(gst / 2);
  return { base, cgst, sgst: r2(gst - cgst), gst, total: t };
}

/**
 * How services (value excl. GST) compare with what is left on a PO (incl. GST).
 * Returns { tone: "ok" | "info" | "warn", title, text } for <PoCheck/>; never blocks anything.
 *   poAmount  - PO amount incl. GST (null when not entered)
 *   used      - already on the PO, incl. GST (other flats / services)
 *   value     - the services being checked, excl. GST
 */
export function poMatch({ poAmount, used = 0, value }) {
  const mine = gstOn(value).total;
  if (poAmount === null || poAmount === undefined || poAmount === "") {
    return { tone: "info", title: "No PO amount", text: "Add the PO amount to check the services against it." };
  }
  const po = Number(poAmount);
  const left = r2(po - used);
  const diff = r2(left - mine);
  const usedNote = used ? ` (${formatInr(used)} of the PO is already used)` : "";
  if (Math.abs(diff) < 1) {
    return { tone: "ok", title: "Matches the PO", text: `Services ${formatInr(mine)} incl. GST = PO amount left ${formatInr(left)}${usedNote}.` };
  }
  if (diff < 0) {
    return {
      tone: "warn",
      title: `Over the PO by ${formatInr(-diff)}`,
      text: `Services come to ${formatInr(mine)} incl. GST but only ${formatInr(left)} of the PO is left${usedNote}. Check the PO amount or the services.`,
    };
  }
  return {
    tone: "info",
    title: `${formatInr(diff)} of the PO left`,
    text: `Services ${formatInr(mine)} incl. GST; the PO has ${formatInr(left)} left${usedNote}, so ${formatInr(diff)} stays unused.`,
  };
}

/** POST /api/brigade/billing/invoices/check - totals + any PO mismatch for the ticked services. */
export function checkInvoice(poNumber, jobIds) {
  return brigadeRequest("/api/brigade/billing/invoices/check", { method: "POST", body: JSON.stringify({ po_number: poNumber, job_ids: jobIds }) });
}

/* ---- PO screens (PO section + Billing) ---- */

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

// Where a PO stands: drives the status badge, bar colour and list filters.
export function poState(poAmount, balance) {
  if (poAmount === null) return { key: "none", tone: "muted", label: "No PO amount" };
  if (balance < 0) return { key: "over", tone: "danger", label: "Over the PO" };
  if (Math.abs(balance) < 1) return { key: "full", tone: "ok", label: "Fully used" };
  return { key: "open", tone: "info", label: "Open" };
}

export function usedPct(used, poAmount) {
  return poAmount ? Math.round((used / poAmount) * 100) : null;
}
