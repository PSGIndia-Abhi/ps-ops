// Reminders: the lead work coming up for the signed-in person. On the web this is a list to
// see and manage; the alarms themselves ring on the phone (the Android app arms them from the
// same records), never in the browser.
//
// Lead meetings, lead follow-ups and personal reminders - nothing else. The server keeps all
// three as work tasks (as the Android app's mobile/src/reminders-engine reads them), so one
// request (GET /api/work-tasks) feeds them; Task Management's own tasks and payment follow-ups
// are left out here and stay in Task Management. A personal reminder is the person's own task
// of type PERSONAL_REMINDER, so one set on the phone shows here and the other way round.

import { request } from "./leadsApi";

export const PERSONAL_REMINDER = "PERSONAL_REMINDER";

const OPEN = ["OPEN", "IN_PROGRESS", "PAUSED"];
/** How long before a meeting or follow-up the phone rings. A personal reminder rings at its own time. */
export const LEAD_MINUTES = 30;
/** Items with no time ring at this hour on their day. */
const ALL_DAY_HOUR = 9;
/** Something still open from this many days back stays on the list, marked overdue. */
const OVERDUE_DAYS = 7;

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dayKey(new Date());

const KIND_LABEL = { meeting: "Meeting", followup: "Follow-up", personal: "Reminder" };
export const kindLabel = (kind) => KIND_LABEL[kind];

/** The kind of lead reminder a work task is, or null for anything that is not lead work. */
function kindOf(t) {
  const type = String(t.task_type || "").toUpperCase();
  if (type === "LEAD_MEETING") return "meeting";
  if (type === "LEAD_FOLLOW_UP") return "followup";
  if (type === PERSONAL_REMINDER) return "personal";
  return null;
}

/** One work task as a reminder: what it is, when, and the lead or task it opens. */
function toReminder(t, myId) {
  const kind = kindOf(t);
  const title = t.title || "";
  const time = t.due_time ? String(t.due_time).slice(0, 5) : null;
  const date = String(t.due_date).slice(0, 10);
  return {
    key: `task:${t.id}`,
    taskId: t.id,
    kind,
    // "Site visit - Acme" -> "Acme": the kind already says it is a visit.
    title: kind === "meeting" ? title.replace(/^(Site visit|Meeting)\s*-\s*/i, "") : title,
    detail: kind === "meeting" ? (/^meeting/i.test(title) ? "Office meeting" : "Site visit") : kind === "followup" ? "Call back" : kind === "personal" ? t.description || "" : "",
    note: t.description || "",
    date,
    time,
    at: new Date(`${date}T${time || `${pad(ALL_DAY_HOUR)}:00`}`),
    fromSomeoneElse: String(t.created_by) !== String(myId),
    byName: t.created_by_name || "",
    // A meeting, a follow-up or a reminder set on a lead opens that lead.
    leadId: t.source_id || null,
  };
}

/** My lead reminders that are still open - due from today, or overdue from the last few days - soonest first. */
export async function myReminders(myId) {
  const from = new Date();
  from.setDate(from.getDate() - OVERDUE_DAYS);
  const rows = await request(`/api/work-tasks?assigned_to=${encodeURIComponent(myId)}&from_date=${dayKey(from)}`);
  return rows
    .filter((t) => OPEN.includes(String(t.status)) && !!t.due_date && kindOf(t))
    .map((t) => toReminder(t, myId))
    .sort((a, b) => a.at - b.at);
}

/** The event the layout listens for to show a card on the page. */
export const CARD_EVENT = "lm:reminder-card";

/**
 * Shows a card at the top of the page: { kind, title, text, sub, leadId }. Used right after a
 * follow-up is added or a reminder is set; the same card appears when one reaches its time.
 */
export function showReminderCard(card) {
  window.dispatchEvent(new CustomEvent(CARD_EVENT, { detail: card }));
}

/** What is already set for this moment: anything of mine on the same day at the same minute. */
export function clashesAt(items, date, time, exceptKey) {
  if (!time) return [];
  return items.filter((i) => i.key !== exceptKey && i.date === date && i.time === time.slice(0, 5));
}

// ---- personal reminders ---------------------------------------------------------

/** POST /work-tasks - a reminder for myself, optionally about a lead (source_module REMINDER). */
export function createReminder(myId, { title, note, date, time, leadId }) {
  return request("/api/work-tasks", {
    method: "POST",
    body: {
      title: title.trim(),
      description: note?.trim() || undefined,
      task_type: PERSONAL_REMINDER,
      priority: "NORMAL",
      assigned_to: Number(myId),
      due_date: date,
      due_time: time,
      source_module: leadId ? "REMINDER" : undefined,
      source_id: leadId || undefined,
    },
  });
}

/** Saves an edited reminder: its words, and its time only when that changed. */
export async function updateReminder(item, { title, note, date, time }) {
  if (title.trim() !== item.title || (note?.trim() || "") !== item.note) {
    await request(`/api/work-tasks/${item.taskId}`, { method: "PUT", body: { title: title.trim(), description: note?.trim() || null } });
  }
  if (date !== item.date || time !== item.time) await moveTask(item.taskId, date, time);
}

export const deleteReminder = (taskId) => request(`/api/work-tasks/${taskId}`, { method: "DELETE" });
export const completeReminder = (taskId) => request(`/api/work-tasks/${taskId}/complete`, { method: "POST", body: {} });

/** POST /work-tasks/{id}/reschedule - a new date and time for a task (its creator or their manager). */
export const moveTask = (taskId, date, time) => request(`/api/work-tasks/${taskId}/reschedule`, { method: "POST", body: { due_date: date, due_time: time } });

/** The follow-ups still open on a lead - what the Add Follow-up form shows before offering another. */
export async function openFollowUpsFor(leadId) {
  const rows = await request(`/api/work-tasks?source_id=${encodeURIComponent(leadId)}&task_type=LEAD_FOLLOW_UP`);
  return rows
    .filter((t) => OPEN.includes(String(t.status)))
    .map((t) => ({ id: t.id, date: String(t.due_date).slice(0, 10), time: t.due_time ? String(t.due_time).slice(0, 5) : null, forId: String(t.assigned_to), forName: t.assigned_to_name || "", note: t.description || "" }));
}
