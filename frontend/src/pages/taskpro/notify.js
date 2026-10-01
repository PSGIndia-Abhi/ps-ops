// How each notification event reads: "<actor> <pre> <task> <post>", an icon
// and a tone. Shared by the bell and the Notifications page so they always
// say the same thing. Events come from GET /api/work-tasks/notifications.

import {
  FiCalendar,
  FiCheckCircle,
  FiEdit3,
  FiMessageSquare,
  FiPaperclip,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiRotateCcw,
  FiSkipForward,
  FiSlash,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { fmtDate, fmtDateTime, fmtTime } from "./format";

const date = (e) => fmtDateTime(e.to_due_date, e.to_due_time);

const KINDS = {
  assigned: { icon: FiUserPlus, tone: "blue", text: () => ["assigned you", ""] },
  reassigned: { icon: FiUserPlus, tone: "blue", text: () => ["reassigned", "to you"] },
  rescheduled: { icon: FiCalendar, tone: "blue", text: () => ["moved the due date of", ""] },
  edited: { icon: FiEdit3, tone: "gray", text: () => ["edited", ""] },
  reopened: { icon: FiRotateCcw, tone: "orange", text: () => ["reopened", ""] },
  skipped: { icon: FiSkipForward, tone: "gray", text: () => ["skipped", ""] },
  cancelled: { icon: FiSlash, tone: "gray", text: () => ["cancelled", ""] },
  attached: { icon: FiPaperclip, tone: "gray", text: () => ["attached a file to", ""] },
  started: { icon: FiPlay, tone: "orange", text: () => ["started", ""] },
  paused: { icon: FiPause, tone: "pink", text: () => ["paused", ""] },
  resumed: { icon: FiPlay, tone: "orange", text: () => ["resumed", ""] },
  completed: { icon: FiCheckCircle, tone: "green", text: () => ["completed", ""] },
  commented: { icon: FiMessageSquare, tone: "blue", text: () => ["commented on", ""] },
  request_received: {
    icon: FiRefreshCw,
    tone: "amber",
    text: (e) => ["asked to move", `to ${date(e)}${e.request_status && e.request_status !== "PENDING" ? ` · ${e.request_status.toLowerCase()}` : ""}`],
  },
  request_approved: { icon: FiCheckCircle, tone: "green", text: (e) => ["approved your request to move", `to ${date(e)}`] },
  request_rejected: { icon: FiX, tone: "red", text: () => ["rejected your request to move", ""] },
};

// The server writes a due-date change as "Due 2026-09-25 10:00:00 moved to
// 2026-09-30: reason"; show it as "25 Sep 2026, 10:00 AM → 30 Sep 2026 · reason".
const MOVE_RE = /^Due (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}(?::\d{2})?))? moved to (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}(?::\d{2})?))?(?:: ([\s\S]*))?$/;
function readableNote(e) {
  const note = e.note || "";
  if (e.type !== "rescheduled") return note;
  const m = note.match(MOVE_RE);
  if (!m) return note;
  const when = (d, t) => (t ? `${fmtDate(d)}, ${fmtTime(t)}` : fmtDate(d));
  return `${when(m[1], m[2])} → ${when(m[3], m[4])}${m[5] ? ` · ${m[5]}` : ""}`;
}

/** { icon, tone, pre, post, note } for one event. */
export function describe(e) {
  const k = KINDS[e.type] || KINDS.edited;
  const [pre, post] = k.text(e);
  return { icon: k.icon, tone: k.tone, pre, post, note: readableNote(e) };
}

/** "Today" / "Yesterday" / "Earlier" bucket for the page's grouping. */
export function dayBucket(iso, now = new Date()) {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (d >= start) return "Today";
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d >= yesterday) return "Yesterday";
  const week = new Date(start);
  week.setDate(week.getDate() - 6);
  return d >= week ? "Earlier this week" : "Older";
}
