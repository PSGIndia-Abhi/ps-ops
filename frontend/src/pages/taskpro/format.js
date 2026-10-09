const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

// The API sends calendar dates as plain 'YYYY-MM-DD' strings and times as
// 'HH:MM:SS' (or null) — see TASK_COLUMNS in backend/src/utils/workTasks.js.
// Parsed as local time (not UTC) so "due today" means the viewer's today.

/** A local Date -> 'YYYY-MM-DD'. */
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function todayStr() {
  return dateKey(new Date());
}

/** 'YYYY-MM-DD' for `n` days from today (local). */
export function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** due_date (+ optional due_time) -> a local Date, or null. A date with no
 *  time is treated as end-of-day, so "Due in 2 days" reads naturally. */
export function dueDateTime(due_date, due_time) {
  if (!due_date) return null;
  const [y, m, d] = due_date.split("-").map(Number);
  if (due_time) {
    const [hh, mm, ss = 0] = due_time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, ss);
  }
  return new Date(y, m - 1, d, 23, 59, 59);
}

export const fmtDate = (due_date) => {
  if (!due_date) return "—";
  const [y, m, d] = due_date.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
};

export const fmtTime = (due_time) => {
  if (!due_time) return "";
  const [hh, mm] = due_time.split(":").map(Number);
  return `${pad(hh % 12 || 12)}:${pad(mm)} ${hh < 12 ? "AM" : "PM"}`;
};

export const fmtDateTime = (due_date, due_time) => {
  if (!due_date) return "—";
  const t = fmtTime(due_time);
  return t ? `${fmtDate(due_date)}, ${t}` : fmtDate(due_date);
};

export const fmtTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours();
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
};

export const fmtMoney = (n) => `₹ ${Number(n || 0).toLocaleString("en-IN")}`;

export function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

export const firstName = (name = "") => name.split(/\s+/)[0] || "there";

/** Day-granularity, same rule the server uses for `is_overdue`: a task is
 *  overdue once its due DATE (not time) is in the past, regardless of
 *  due_time — so this always agrees with the server's own flag. */
export const isPastDue = (due_date) => !!due_date && due_date < todayStr();

/** "Due in 2 days" / "Due today" / "Overdue by 1 day", with a tone for colouring. */
export function dueInfo(due_date, due_time, status) {
  if (!due_date) return { text: "No due date", tone: "muted" };
  if (status === "COMPLETED" || status === "CANCELLED") return { text: "Done", tone: "muted" };
  const today = todayStr();
  if (due_date < today) {
    const late = Math.round((dueDateTime(today) - dueDateTime(due_date)) / 86400000);
    return { text: `Overdue by ${late} day${late === 1 ? "" : "s"}`, tone: "late" };
  }
  if (due_date === today) return { text: "Due today", tone: "soon" };
  const days = Math.round((dueDateTime(due_date) - dueDateTime(today)) / 86400000);
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${days} days`, tone: "ok" };
}

/** Value for <input type="date">. */
export function toDateInput(due_date) {
  return due_date || todayStr();
}
/** Value for <input type="time">. */
export function toTimeInput(due_time) {
  return due_time ? due_time.slice(0, 5) : "";
}

/** A recurrence rule -> "every week on Mon, Fri" / "every 2 months on day 15" etc. */
export function recurrenceSummary(r) {
  if (!r) return "";
  const every = r.interval_value > 1 ? `every ${r.interval_value} ` : "every ";
  if (r.frequency === "DAILY") return `${every}day${r.interval_value > 1 ? "s" : ""}`;
  if (r.frequency === "WEEKLY") {
    const names = (r.days_of_week || []).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
    return `${every}week${r.interval_value > 1 ? "s" : ""} on ${names}`;
  }
  if (r.frequency === "MONTHLY") {
    if (Array.isArray(r.month_week) && r.month_week.length > 0) {
      const ordMap = { 1: "first", 2: "second", 3: "third", 4: "fourth", "-1": "last" };
      const weeks = r.month_week.map((w) => ordMap[w]).join(", ");
      const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = (r.days_of_week || []).map((d) => wd[d]).join(", ");
      return `${every}month${r.interval_value > 1 ? "s" : ""} on the ${weeks} ${days}`;
    }
    return `${every}month${r.interval_value > 1 ? "s" : ""} on ${r.use_last_day_of_month ? "the last day" : `day ${r.day_of_month}`}`;
  }
  return `${every}year${r.interval_value > 1 ? "s" : ""}`;
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
