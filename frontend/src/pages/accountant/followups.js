import { apiFetch } from "../../api";
import { FOLLOWUP_MODULE, FOLLOWUP_TYPE, getJson, send } from "./data";

// Payment reminder actions. Everything goes through the existing Task Management
// API (/api/work-tasks); the only payment-specific call is the customer's phone.

// The call outcomes the accountant picks from after phoning the customer.
//   date: whether the next reminder date is shown ("optional": shown, never compulsory; false: not shown)
export const OUTCOMES = [
  { key: "PAYMENT_RECEIVED", label: "Payment received", date: false },
  { key: "WILL_PAY_TODAY", label: "Will pay today", date: "optional" },
  { key: "CALL_LATER", label: "Call me later", date: "optional" },
  { key: "DATE_CONFIRMED", label: "Payment date confirmed", date: "optional" },
  { key: "DISPUTE", label: "Dispute / Query", date: "optional" },
  { key: "NO_RESPONSE", label: "No response", date: "optional" },
  // anything not in the list: the accountant types the outcome, and that text is what History shows
  { key: "OTHER", label: "Other", date: "optional" },
];

// The logged-in user's id: reminders are always assigned to whoever creates them.
async function myUserId() {
  const stored = Number(localStorage.getItem("userId"));
  if (stored > 0) return stored;
  const me = await getJson("/api/auth/me");
  return Number(me?.id) || null;
}

// How often a reminder comes back. "ONCE" is an ordinary one-time reminder; the others are a
// repeating schedule in Task Management (monthly on the 8th at 10:00, say). A repeating payment
// reminder stays ONE reminder: each time it falls due its date moves on and the accountant is
// alerted again, until its end date, or until it is completed or stopped.
// The schedule's day comes from the first date chosen.
export const REPEATS = [["ONCE", "One time"], ["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["MONTHLY", "Monthly"]];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const clock = (time) => {
  const [h, m] = String(time || "09:00").split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
// The rule the API takes, worked out from the first reminder date ("2026-11-08") and time.
function recurrenceFor(repeat, date, time, endDate) {
  const [y, m, d] = date.split("-").map(Number);
  const rule = { frequency: repeat, start_date: date, time_of_day: time || "09:00" };
  if (endDate) Object.assign(rule, { end_type: "ON_DATE", end_date: endDate });
  if (repeat === "WEEKLY") rule.days_of_week = [new Date(y, m - 1, d).getDay()];
  if (repeat === "MONTHLY") rule.day_of_month = d;
  return rule;
}
// "Every month on the 8th at 10:00 AM". Takes what the form holds ({ repeat, date, time }) or a saved schedule.
// (The end date is shown separately: see repeatEnd.)
export function repeatText(rule) {
  const r = rule.frequency ? rule : recurrenceFor(rule.repeat, rule.date, rule.time);
  const days = Array.isArray(r.days_of_week) ? r.days_of_week : JSON.parse(r.days_of_week || "[]");
  const at = ` at ${clock(r.time_of_day)}`;
  if (r.frequency === "DAILY") return `Every day${at}`;
  if (r.frequency === "WEEKLY") return `Every ${days.map((n) => WEEKDAYS[n]).join(", ") || "week"}${at}`;
  if (r.frequency === "MONTHLY") {
    if (r.use_last_day_of_month) return `Every month on the last day${at}`;
    return `Every month on the ${ordinal(Number(r.day_of_month))}${Number(r.day_of_month) > 28 ? " (or the last day of a shorter month)" : ""}${at}`;
  }
  return `Every year${at}`;
}

// The last date of a saved schedule ("2026-10-05"), or "" when it has no end.
export const repeatEnd = (schedule) => (schedule?.end_type === "ON_DATE" && schedule.end_date ? String(schedule.end_date).slice(0, 10) : "");
// One reminder's schedule ({ status, recurrence: {...} }), for the reminder page.
export const fetchReminderSchedule = (seriesId) => getJson(`/api/work-task-series/${seriesId}`);

// The accountant's repeating payment reminders that are still running.
export async function fetchReminderSchedules() {
  const rows = await getJson("/api/work-task-series?status=ACTIVE");
  return rows.filter((s) => s.source_module === FOLLOWUP_MODULE.CUSTOMER || s.source_module === FOLLOWUP_MODULE.INVOICE);
}
// Stops a reminder from repeating. The reminder itself stays as it is, on its current date.
export const stopReminderSchedule = (id) => send("POST", `/api/work-task-series/${id}/stop`);

// scope: "CUSTOMER" (the customer's whole outstanding) or "INVOICE" (one invoice).
// repeat: "ONCE" (default), "DAILY", "WEEKLY" or "MONTHLY" -- see REPEATS. endDate: the last
// date a repeating reminder comes due (optional; without it, it repeats until completed or stopped).
export async function createFollowUp({ scope, customer, invoice, date, time, priority, notes, repeat = "ONCE", endDate = "" }) {
  const assignedTo = await myUserId();
  if (!assignedTo) throw new Error("You need to log in again");
  const forInvoice = scope === "INVOICE";
  const title = `Payment Reminder - ${customer.name}${forInvoice ? ` (${invoice.invoice_number})` : ""}`.slice(0, 200);
  const source = { module: forInvoice ? FOLLOWUP_MODULE.INVOICE : FOLLOWUP_MODULE.CUSTOMER, id: forInvoice ? invoice.id : customer.id };
  const repeating = repeat !== "ONCE";
  if (repeating) {
    // Two schedules for the same customer or invoice would send every reminder twice.
    const running = (await fetchReminderSchedules()).find((s) => s.source_module === source.module && s.source_id === source.id);
    if (running) {
      throw new Error(`${forInvoice ? invoice.invoice_number : customer.name} already has a repeating reminder (${repeatText(running).replace(/^E/, "e")}). Stop it first in Tasks & Reminders, Repeating tab.`);
    }
  }
  return send("POST", "/api/work-tasks", {
    title,
    task_type: FOLLOWUP_TYPE,
    priority: priority || "NORMAL",
    source_module: source.module,
    source_id: source.id,
    assigned_to: assignedTo,
    ...(repeating ? { recurrence: recurrenceFor(repeat, date, time, endDate) } : { due_date: date, due_time: time || null }),
    description: notes?.trim() || null,
  });
}

export const fetchFollowUp = (id) => getJson(`/api/work-tasks/${id}`);
export const fetchFollowUpHistory = (id) => getJson(`/api/work-tasks/${id}/history`);
export const fetchFollowUpComments = (id) => getJson(`/api/work-tasks/${id}/comments`);
export const addFollowUpComment = (id, comment) => send("POST", `/api/work-tasks/${id}/comments`, { comment });
// Files attached to a reminder (a cheque photo, a payment advice, an email...). Same
// rules as comments: the reminder must be started, and a completed one is closed.
export const MAX_ATTACHMENT_MB = 10;
export const fetchFollowUpAttachments = (id) => getJson(`/api/work-tasks/${id}/attachments`);
export const deleteFollowUpAttachment = (id, attachmentId) => send("DELETE", `/api/work-tasks/${id}/attachments/${attachmentId}`);
export async function uploadFollowUpAttachment(id, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/api/work-tasks/${id}/attachments`, { method: "POST", body: form });
  if (!res) throw new Error("You need to log in again");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "The file could not be uploaded.");
  return data;
}
// Opens a file in a new tab (images and PDFs) or downloads it. The file is fetched with
// the login attached, because a plain link cannot carry it.
export async function openFollowUpAttachment(id, attachment) {
  const res = await apiFetch(`/api/work-tasks/${id}/attachments/${attachment.id}/view`);
  if (!res || !res.ok) throw new Error("The file could not be opened.");
  const url = URL.createObjectURL(await res.blob());
  const viewable = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"].includes(attachment.file_type);
  const a = document.createElement("a");
  a.href = url;
  if (viewable) { a.target = "_blank"; a.rel = "noopener"; } else a.download = attachment.file_name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const startFollowUp = (id) => send("POST", `/api/work-tasks/${id}/start`);
export const reopenFollowUp = (id, reason) => send("POST", `/api/work-tasks/${id}/reopen`, { reason: reason || undefined });
export const rescheduleFollowUp = (id, date, time, reason) =>
  send("POST", `/api/work-tasks/${id}/reschedule`, { due_date: date, due_time: time || null, reason: reason || undefined });

// Updates and completing need the task to be in progress: an open one is started
// first, a paused one resumed. Returns the task's latest status.
async function ensureInProgress(task) {
  if (task.status === "OPEN") return (await startFollowUp(task.id)).status;
  if (task.status === "PAUSED") return (await send("POST", `/api/work-tasks/${task.id}/resume`)).status;
  return task.status;
}

// Saves a call outcome as a progress update, and moves the reminder date if a new one is given.
export async function recordOutcome(task, { outcome, other, notes, date, time }) {
  const label = outcome === "OTHER" ? other.trim() : OUTCOMES.find((o) => o.key === outcome)?.label || outcome;
  const note = `${label}${notes?.trim() ? `: ${notes.trim()}` : ""}`;
  await ensureInProgress(task);
  await send("POST", `/api/work-tasks/${task.id}/progress`, { note });
  const moved = date && (date !== task.due_date || (time || "") !== (task.due_time || ""));
  if (moved) await rescheduleFollowUp(task.id, date, time, note.slice(0, 500));
  return { rescheduled: Boolean(moved) };
}

export async function completeFollowUp(task, note) {
  await ensureInProgress(task);
  return send("POST", `/api/work-tasks/${task.id}/complete`, { completion_note: note?.trim() || undefined });
}

// The accountant's own phone list for a customer: { name, phone, contacts }. `phone` is the
// number to call (the primary one; null when none is saved), `contacts` all of them.
// These are kept apart from the admin's Contacts page.
export const fetchCustomerContact = (customerId) => getJson(`/api/invoices/customers/${encodeURIComponent(customerId)}/contact`);

// Adds a phone number for the customer, or changes one (when `id` is given). Marking one
// as primary takes the mark off the customer's other numbers. Returns the refreshed list.
// `email` is optional and only the Contacts page has a box for it; when it is left out
// (the quick add/edit on the reminder screens) a saved email is kept as it is.
export async function saveCustomerContact(customerId, { id, name, phone, email, primary }) {
  const base = `/api/invoices/customers/${encodeURIComponent(customerId)}/contacts`;
  const body = { name: name.trim(), phone: phone.trim(), is_primary: Boolean(primary), ...(email === undefined ? {} : { email: email.trim() }) };
  try {
    return id ? await send("PUT", `${base}/${encodeURIComponent(id)}`, body) : await send("POST", base, body);
  } catch (err) {
    if (/insufficient permissions/i.test(err.message)) throw new Error("You don't have permission to save customer phone numbers.");
    throw err;
  }
}

// Every saved number across customers, for the Contacts page (archived: the archived ones instead).
export const fetchAllCustomerContacts = (archived = false) => getJson(`/api/invoices/customer-contacts${archived ? "?archived=true" : ""}`);
// Archiving hides a number without deleting it; restoring brings it back.
export const archiveCustomerContact = (customerId, id) =>
  send("POST", `/api/invoices/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(id)}/archive`);
export const restoreCustomerContact = (customerId, id) =>
  send("POST", `/api/invoices/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(id)}/restore`);

// "2026-10-10", "10:00" -> "10 Oct 2026, 10:00 AM"
// short: leaves the year out when it is this year ("10 Oct, 10:00 AM"), for narrow table cells.
export function showDue(date, time, { short = false } = {}) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  const day = new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(short && sameYear ? {} : { year: "numeric" }) });
  if (!time) return day;
  const [h, min] = time.split(":").map(Number);
  const t = new Date(2000, 0, 1, h, min).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${t.toUpperCase()}`;
}
