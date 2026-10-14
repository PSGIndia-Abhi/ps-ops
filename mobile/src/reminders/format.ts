import type { Tone } from '../crm/ui/StatusBadge';
import { fmtTime, parseDate, todayStr } from '../tasks/format';
import type { SeriesListItem, WorkTask } from '../tasks/types';
import { REMINDER_MODULE, type Customer, type Invoice, type Reminder, type ReminderDisplayStatus, type Repeat } from './types';

/**
 * Reminder helpers ported from the web Accountant Panel (frontend/src/pages/accountant/
 * data.js + followups.js) so both clients describe a reminder the same way.
 */

const num = (v: unknown) => Number(v) || 0;
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Any date value -> 'YYYY-MM-DD' in the user's own time zone ('' when empty). */
export function ymd(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** '2026-09-01' -> '01/09/2026'. */
export const showDate = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');

/** '2026-10-10', '10:00' -> 'Today, 10:00 AM' / '10 Oct, 10:00 AM' (the year only when it isn't this year). */
export function showDue(date: string, time?: string | null): string {
  if (!date) return '—';
  const d = parseDate(date);
  const day =
    date === todayStr()
      ? 'Today'
      : `${pad(d.getDate())} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
  return time ? `${day}, ${fmtTime(time)}` : day;
}

export function cleanInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    invoice_number: String(row.invoice_number ?? ''),
    customer_id: String(row.customer_id ?? ''),
    customer_name: String(row.customer_name ?? ''),
    customer_code: String(row.customer_code ?? ''),
    invoice_date: ymd(row.invoice_date),
    due_date: ymd(row.due_date),
    invoice_amount: num(row.invoice_amount),
    paid_amount: num(row.paid_amount),
    pending_amount: num(row.pending_amount),
    status: String(row.display_status || row.status || ''), // display_status marks late invoices OVERDUE
  };
}

/** Customers that still owe something, A-Z, each with its unpaid invoices (oldest due first). */
export function customersWithOutstanding(invoices: Invoice[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const inv of invoices) {
    if (inv.status === 'CANCELLED' || inv.pending_amount <= 0) continue;
    let c = map.get(inv.customer_id);
    if (!c) {
      c = { id: inv.customer_id, name: inv.customer_name, code: inv.customer_code, outstanding: 0, unpaid: [] };
      map.set(inv.customer_id, c);
    }
    c.outstanding += inv.pending_amount;
    c.unpaid.push(inv);
  }
  const due = (i: Invoice) => i.due_date || i.invoice_date || '9999';
  for (const c of map.values()) c.unpaid.sort((a, b) => due(a).localeCompare(due(b)));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function displayStatus(task: WorkTask, due: string): ReminderDisplayStatus {
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return task.status;
  if (!due) return 'UPCOMING';
  const today = todayStr();
  return due < today ? 'OVERDUE' : due === today ? 'TODAY' : 'UPCOMING';
}

/** Turns a work task into a reminder; names and invoice numbers come from the invoices already loaded. */
export function cleanReminder(task: WorkTask, invoicesById: Map<string, Invoice>, customerNames: Map<string, string>): Reminder {
  const scope = task.source_module === REMINDER_MODULE.INVOICE ? 'INVOICE' : 'CUSTOMER';
  const invoice = scope === 'INVOICE' ? invoicesById.get(String(task.source_id)) : undefined;
  const customerId = scope === 'INVOICE' ? invoice?.customer_id || '' : String(task.source_id || '');
  const due = ymd(task.due_date);
  return {
    id: task.id,
    series_id: task.series_id || '',
    scope,
    customer_id: customerId,
    // A reminder whose invoice isn't in the list any more still says who it is for, from its title.
    customer_name:
      invoice?.customer_name || customerNames.get(customerId) || task.title.replace(/^Payment (Reminder|Follow-up) - /, '').replace(/ \([^)]*\)$/, ''),
    invoice_id: scope === 'INVOICE' ? String(task.source_id || '') : '',
    invoice_number: invoice?.invoice_number || '',
    notes: task.description || '',
    priority: task.priority,
    status: task.status,
    active: task.status === 'OPEN' || task.status === 'IN_PROGRESS' || task.status === 'PAUSED',
    display_status: displayStatus(task, due),
    due_date: due,
    due_time: task.due_time ? String(task.due_time).slice(0, 5) : '',
    completed_at: task.completed_at || '',
    task,
  };
}

export const STATUS_META: Record<ReminderDisplayStatus, { label: string; tone: Tone }> = {
  TODAY: { label: 'Today', tone: 'warning' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/** Sorts reminders by when they are due (date, then time); undated last. */
export const byDue = (a: Reminder, b: Reminder) =>
  `${a.due_date || '9999-99-99'} ${a.due_time || '99:99'}`.localeCompare(`${b.due_date || '9999-99-99'} ${b.due_time || '99:99'}`);

/** What a reminder is about, in one line: "Invoice INV-1042" or "Entire customer". */
export const reminderFor = (r: Pick<Reminder, 'scope' | 'invoice_number'>) =>
  r.scope === 'INVOICE' ? `Invoice ${r.invoice_number || '—'}` : 'Entire customer';

// ---- call outcomes ---------------------------------------------------------

/** What the accountant picks from after phoning the customer. `date`: whether a next reminder date is offered. */
export const OUTCOMES = [
  { key: 'PAYMENT_RECEIVED', label: 'Payment received', date: false },
  { key: 'WILL_PAY_TODAY', label: 'Will pay today', date: true },
  { key: 'CALL_LATER', label: 'Call me later', date: true },
  { key: 'DATE_CONFIRMED', label: 'Payment date confirmed', date: true },
  { key: 'DISPUTE', label: 'Dispute / Query', date: true },
  { key: 'NO_RESPONSE', label: 'No response', date: true },
  // anything not in the list: the accountant types the outcome, and that text is what History shows
  { key: 'OTHER', label: 'Other', date: true },
] as const;
export type OutcomeKey = (typeof OUTCOMES)[number]['key'];

// ---- repeating reminders ---------------------------------------------------

export const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'ONCE', label: 'One time' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

/** The rule the API takes, worked out from the first reminder date and time (the schedule's day comes from that date). */
export function recurrenceFor(repeat: Exclude<Repeat, 'ONCE'>, date: string, time: string, endDate?: string) {
  const d = parseDate(date);
  return {
    frequency: repeat,
    start_date: date,
    time_of_day: time || '09:00',
    ...(endDate ? { end_type: 'ON_DATE' as const, end_date: endDate } : {}),
    ...(repeat === 'WEEKLY' ? { days_of_week: [d.getDay()] } : {}),
    ...(repeat === 'MONTHLY' ? { day_of_month: d.getDate() } : {}),
  };
}

type Rule = Pick<SeriesListItem, 'frequency' | 'time_of_day'> & Partial<Pick<SeriesListItem, 'days_of_week' | 'day_of_month' | 'use_last_day_of_month'>>;

/** "Every month on the 8th at 10:00 AM". */
export function repeatText(r: Rule): string {
  const days: number[] = Array.isArray(r.days_of_week) ? r.days_of_week : JSON.parse(r.days_of_week || '[]');
  const at = ` at ${fmtTime(r.time_of_day || '09:00')}`;
  if (r.frequency === 'DAILY') return `Every day${at}`;
  if (r.frequency === 'WEEKLY') return `Every ${days.map((n) => WEEKDAYS[n]).join(', ') || 'week'}${at}`;
  if (r.frequency === 'MONTHLY') {
    if (r.use_last_day_of_month) return `Every month on the last day${at}`;
    const day = Number(r.day_of_month);
    return `Every month on the ${ordinal(day)}${day > 28 ? ' (or the last day of a shorter month)' : ''}${at}`;
  }
  return `Every year${at}`;
}
