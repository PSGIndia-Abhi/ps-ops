import type { RecurrenceInput, TaskStatus, WorkTask } from './types';

/**
 * Date/label helpers ported from the web TaskPro (frontend/src/pages/taskpro/
 * format.js + selectors.js) so both clients describe a task the same way.
 * Dates are parsed as LOCAL calendar dates so "due today" means the viewer's today.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = parseDate(s);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const fmtDateShort = (s: string | null) => {
  if (!s) return '—';
  const d = parseDate(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** 'HH:MM[:SS]' -> '9:30 AM' */
export const fmtTime = (t: string | null | undefined) => {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  return `${hh % 12 || 12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
};

export const fmtDateTime = (d: string | null, t: string | null) => {
  if (!d) return '—';
  const time = fmtTime(t);
  return time ? `${fmtDateShort(d)}, ${time}` : fmtDateShort(d);
};

export const fmtTimestamp = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
};

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

export const initials = (name?: string | null) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export const firstName = (name?: string | null) => (name || '').split(/\s+/)[0] || 'there';

export const formatBytes = (n: number | null) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// ---- selectors (same definitions as web selectors.js) ---------------------

export const isActive = (t: WorkTask) => t.status === 'OPEN' || t.status === 'IN_PROGRESS';
export const isFinished = (s: TaskStatus) => s === 'COMPLETED' || s === 'CANCELLED';

/** Day-granularity, the same rule the server uses for `is_overdue`. */
export const isOverdue = (t: WorkTask) => isActive(t) && !!t.due_date && t.due_date < todayStr();

export type DueTone = 'late' | 'soon' | 'ok' | 'muted';

export function dueInfo(t: Pick<WorkTask, 'due_date' | 'status'>): { text: string; tone: DueTone } {
  if (!t.due_date) return { text: 'No due date', tone: 'muted' };
  if (isFinished(t.status)) return { text: t.status === 'COMPLETED' ? 'Done' : 'Cancelled', tone: 'muted' };
  const today = todayStr();
  const days = Math.round((parseDate(t.due_date).getTime() - parseDate(today).getTime()) / 86400000);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'late' };
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' };
  return { text: `Due in ${days} days`, tone: 'ok' };
}

export type ListMode =
  | 'my'
  | 'team'
  | 'all'
  | 'today'
  | 'overdue'
  | 'upcoming'
  | 'completed'
  | 'progress'
  | 'high'
  | 'delegated'
  | 'recurring'
  | 'tomorrow';

export const LIST_MODES: Record<ListMode, { label: string; match: (t: WorkTask, me: number) => boolean }> = {
  my: { label: 'My Tasks', match: (t, me) => t.assigned_to === me && isActive(t) },
  team: { label: 'Team', match: (t, me) => t.assigned_to !== me && isActive(t) },
  all: { label: 'All', match: () => true },
  // Only the viewer's own work (assigned to them) - not their team's, not tasks they created for others.
  today: { label: 'Today', match: (t, me) => t.assigned_to === me && t.due_date === todayStr() && t.status !== 'CANCELLED' },
  overdue: { label: 'Overdue', match: (t) => isOverdue(t) },
  upcoming: { label: 'Upcoming', match: (t) => t.status === 'OPEN' && !!t.due_date && !isOverdue(t) },
  completed: { label: 'Completed', match: (t) => t.status === 'COMPLETED' },
  // Reached from Home's Quick Actions.
  progress: { label: 'In Progress', match: (t) => t.status === 'IN_PROGRESS' },
  high: { label: 'High Priority', match: (t) => isActive(t) && t.priority === 'HIGH' },
  delegated: { label: 'Assigned by Me', match: (t, me) => t.created_by === me && t.assigned_to !== me && isActive(t) },
  recurring: { label: 'Recurring', match: (t) => !!t.series_id && isActive(t) },
  // Reached from Notifications' "Due tomorrow".
  tomorrow: { label: 'Tomorrow', match: (t) => isActive(t) && t.due_date === addDays(todayStr(), 1) },
};

/** Newest first - a freshly created/assigned task shows at the top. */
export const byNewest = (a: WorkTask, b: WorkTask) => (b.created_at || '').localeCompare(a.created_at || '');

/** Sort by due date/time, undated last. */
export const byDue = (a: WorkTask, b: WorkTask) =>
  `${a.due_date ?? '9999'}${a.due_time ?? '99'}`.localeCompare(`${b.due_date ?? '9999'}${b.due_time ?? '99'}`);

export function recurrenceSummary(r: TaskSeriesRecurrence | null): string {
  if (!r) return 'Recurring';
  const n = Number(r.interval_value) || 1;
  const every = n > 1 ? `Every ${n} ` : 'Every ';
  const plural = n > 1 ? 's' : '';
  if (r.frequency === 'DAILY') return `${every}day${plural}`;
  if (r.frequency === 'WEEKLY') {
    const days = typeof r.days_of_week === 'string' ? JSON.parse(r.days_of_week) : r.days_of_week || [];
    return `${every}week${plural} on ${(days as number[]).map((d) => WEEKDAYS[d]).join(', ')}`;
  }
  if (r.frequency === 'MONTHLY') {
    return `${every}month${plural} on ${r.use_last_day_of_month ? 'the last day' : `day ${r.day_of_month}`}`;
  }
  return `${every}year${plural}`;
}

type TaskSeriesRecurrence = Omit<RecurrenceInput, 'days_of_week'> & { days_of_week?: number[] | string | null };
