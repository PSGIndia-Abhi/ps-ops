// Formatting and date helpers for the Lead Management screens.

import { userName } from "./leadsApi";
import { STAGES } from "./mockData";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n) => inr.format(Number(n) || 0);
export const compactMoney = (n) => {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2).replace(/\.?0+$/, "")} L`;
  return money(v);
};

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const isToday = (iso) => !!iso && sameDay(new Date(iso), new Date());
export const isPast = (iso) => !!iso && new Date(iso).getTime() < Date.now();

export function dayLabel(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const yesterday = new Date(today.getTime() - 86400000);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
export const timeLabel = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "-");
export const dateTime = (iso) => (iso ? `${dayLabel(iso)}, ${timeLabel(iso)}` : "-");

/** A value for <input type="datetime-local"> in the user's own time zone. */
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const stageOf = (key) => STAGES.find((s) => s.key === key) || { key, label: key, tone: "neutral" };

/** Tomorrow at this time, as a value for <input type="datetime-local">. */
export const tomorrowInput = () => toLocalInput(new Date(Date.now() + 86400000).toISOString());

/** What should happen to this lead next, in a few words. */
export function nextAction(lead) {
  switch (lead.stage) {
    case "NEW":
      return "Call to verify";
    case "TO_CALL":
    case "NEED_MORE_INFO":
      return lead.nextFollowUpAt ? `Call ${dateTime(lead.nextFollowUpAt)}` : "Call again";
    case "QUALIFIED":
      return "Schedule meeting";
    case "MEETING_SCHEDULED":
      return `Visit by ${userName(lead.salesId) || "sales"}`;
    case "VISIT_COMPLETED":
      return "Send quotation";
    case "QUOTATION_SENT":
      return "Follow up on quotation";
    case "WON":
      return "Customer created";
    default:
      return lead.reason || "-";
  }
}
