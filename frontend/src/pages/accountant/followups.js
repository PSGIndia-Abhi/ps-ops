import { FOLLOWUP_MODULE, FOLLOWUP_TYPE, getJson, send } from "./data";

// Payment follow-up actions. Everything goes through the existing Task Management
// API (/api/work-tasks); the only payment-specific call is the customer's phone.

// The call outcomes the accountant picks from after phoning the customer.
//   date: whether the next follow-up date is asked for ("required", "optional" or false)
export const OUTCOMES = [
  { key: "PAYMENT_RECEIVED", label: "Payment received", date: false },
  { key: "WILL_PAY_TODAY", label: "Will pay today", date: "optional" },
  { key: "CALL_LATER", label: "Call me later", date: "required" },
  { key: "DATE_CONFIRMED", label: "Payment date confirmed", date: "required" },
  { key: "DISPUTE", label: "Dispute / Query", date: "optional" },
  { key: "NO_RESPONSE", label: "No response", date: "required" },
];

// The logged-in user's id: follow-ups are always assigned to whoever creates them.
async function myUserId() {
  const stored = Number(localStorage.getItem("userId"));
  if (stored > 0) return stored;
  const me = await getJson("/api/auth/me");
  return Number(me?.id) || null;
}

// scope: "CUSTOMER" (the customer's whole outstanding) or "INVOICE" (one invoice).
export async function createFollowUp({ scope, customer, invoice, date, time, priority, notes }) {
  const assignedTo = await myUserId();
  if (!assignedTo) throw new Error("You need to log in again");
  const forInvoice = scope === "INVOICE";
  const title = `Payment Follow-up - ${customer.name}${forInvoice ? ` (${invoice.invoice_number})` : ""}`.slice(0, 200);
  return send("POST", "/api/work-tasks", {
    title,
    task_type: FOLLOWUP_TYPE,
    priority: priority || "NORMAL",
    source_module: forInvoice ? FOLLOWUP_MODULE.INVOICE : FOLLOWUP_MODULE.CUSTOMER,
    source_id: forInvoice ? invoice.id : customer.id,
    assigned_to: assignedTo,
    due_date: date,
    due_time: time || null,
    description: notes?.trim() || null,
  });
}

export const fetchFollowUp = (id) => getJson(`/api/work-tasks/${id}`);
export const fetchFollowUpHistory = (id) => getJson(`/api/work-tasks/${id}/history`);
export const fetchFollowUpComments = (id) => getJson(`/api/work-tasks/${id}/comments`);
export const addFollowUpComment = (id, comment) => send("POST", `/api/work-tasks/${id}/comments`, { comment });
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

// Saves a call outcome as a progress update, and moves the follow-up date if a new one is given.
export async function recordOutcome(task, { outcome, notes, date, time }) {
  const label = OUTCOMES.find((o) => o.key === outcome)?.label || outcome;
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

// The customer's primary phone number ({ name, phone } — phone is null when none is saved).
export const fetchCustomerContact = (customerId) => getJson(`/api/invoices/customers/${encodeURIComponent(customerId)}/contact`);

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
