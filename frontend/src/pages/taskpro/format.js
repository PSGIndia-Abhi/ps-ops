const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

export const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const h = d.getHours();
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
};

export const fmtDateTime = (ts) => (ts ? `${fmtDate(ts)}, ${fmtTime(ts)}` : "—");

export const fmtMoney = (n) => `₹ ${Number(n || 0).toLocaleString("en-IN")}`;

export function fmtDuration(ms, withSeconds = false) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (withSeconds) return h ? `${h}h ${m}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
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

/** "Due in 2 days" / "Due today" / "Overdue by 1 day", with a tone for colouring. */
export function dueInfo(dueAt, now, done = false) {
  if (!dueAt) return { text: "No due date", tone: "muted" };
  if (done) return { text: "Done", tone: "muted" };
  const diff = dueAt - now;
  const days = Math.round(diff / 86400000);
  const sameDay = new Date(dueAt).toDateString() === new Date(now).toDateString();
  if (diff < 0) {
    const late = Math.max(1, Math.round(-diff / 86400000));
    return { text: sameDay ? "Overdue today" : `Overdue by ${late} day${late === 1 ? "" : "s"}`, tone: "late" };
  }
  if (sameDay) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${days} days`, tone: "ok" };
}

/** Value for <input type="datetime-local"> in local time. */
export function toInputValue(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
