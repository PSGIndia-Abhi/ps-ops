import type { Tone } from '../crm/ui/StatusBadge';
import type { CallOutcome, CallStatus, Department, DepartmentKind, EmailTemplate, Priority, Question, Response, TicketAction, TicketStatus } from './types';

/** Labels and badge tones - the same words the web Feedback Desk uses (feedbackApi.js). */
export const CALL_STATUS: Record<CallStatus, { label: string; tone: Tone }> = {
  TO_CALL: { label: 'To call', tone: 'neutral' },
  NOT_ANSWERED: { label: 'Not answered', tone: 'warning' },
  WRONG_NUMBER: { label: 'Wrong number', tone: 'danger' },
  FORM_SENT: { label: 'Form sent', tone: 'info' },
  FORM_RECEIVED: { label: 'Form received', tone: 'accent' },
  DONE: { label: 'Completed', tone: 'success' },
  TICKET_OPEN: { label: 'Ticket open', tone: 'danger' },
};

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  ACTION_PENDING: { label: 'Action pending', tone: 'warning' },
  CLOSED: { label: 'Closed', tone: 'success' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  VERY_HIGH: { label: 'Very high', tone: 'danger' },
  HIGH: { label: 'High', tone: 'danger' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  LOW: { label: 'Low', tone: 'info' },
};
export const PRIORITIES: Priority[] = ['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'];

/** assign: who the step is assigned to (GET /people's list); that person marks it done. */
export const ACTIONS: Record<TicketAction, { label: string; hint: string; assign?: 'supervisors' | 'sales'; who?: string }> = {
  RESOLVED_ON_CALL: { label: 'Resolved on the call', hint: 'You sorted it out on the phone. The ticket closes now.' },
  SCHEDULE_REVISIT: { label: 'Book a re-visit', hint: 'A technician goes back. The visit is booked on the ticket.' },
  SITE_AUDIT: { label: 'Site audit', hint: 'A supervisor audits the site.', assign: 'supervisors', who: 'Supervisor' },
  SUPERVISOR_VISIT: { label: 'Supervisor visit', hint: 'A supervisor visits the customer.', assign: 'supervisors', who: 'Supervisor' },
  SALES: { label: 'Sales', hint: 'A salesperson takes it up with the customer.', assign: 'sales', who: 'Salesperson' },
  // Older tickets only: worked as "Book a re-visit".
  ESCALATE_OPERATIONS: { label: 'Book a re-visit', hint: 'A technician goes back.' },
  OTHER: { label: 'Other', hint: 'Something else - type what will be done.' },
};
/** The next steps offered when raising a ticket. */
export const RAISE_ACTIONS: TicketAction[] = ['RESOLVED_ON_CALL', 'SCHEDULE_REVISIT', 'SITE_AUDIT', 'SUPERVISOR_VISIT', 'SALES', 'OTHER'];
/** Site audit, Supervisor visit and Sales are done by one assigned person. */
export const isAssignedAction = (a: TicketAction) => Boolean(ACTIONS[a]?.assign);

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'ANSWERED', label: 'Answered' },
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'WRONG_NUMBER', label: 'Wrong no.' },
];

/** The call list's filters - "All" first, as on the web. */
export const CALL_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'TO_CALL', label: 'To call' },
  { value: 'NOT_ANSWERED', label: 'Not answered' },
  { value: 'WRONG_NUMBER', label: 'Wrong number' },
  { value: 'FORM_SENT', label: 'Form sent' },
  { value: 'FORM_RECEIVED', label: 'Form received' },
  { value: 'TICKET_OPEN', label: 'Ticket open' },
  { value: 'DONE', label: 'Completed' },
];

/* ---- months and dates ---- */
export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1] ?? ''} ${y}`;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(' ', 'T') : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "3 Nov" */
export function formatDay(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? `${d.getDate()} ${SHORT[d.getMonth()]}` : '—';
}

/** "Today 4:30 pm" / "3 Nov, 4:30 pm" */
export function formatDateTime(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  return d.toDateString() === new Date().toDateString() ? `Today ${time}` : `${formatDay(value)}, ${time}`;
}

export function isPast(value: string | null | undefined): boolean {
  const d = toDate(value);
  return !!d && d.getTime() <= Date.now();
}

/* ---- the period a list covers: due today, all, one month, or From - To dates ---- */
export interface Period {
  /** today / all: the call list only (calls due today + overdue, or every call). */
  mode: 'today' | 'all' | 'month' | 'range';
  month: string;
  from: string;
  to: string;
}

/** Today as "2026-11-03". */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** This month (or mode, e.g. 'today' for the call list); for dates, the 1st of this month to today. */
export function defaultPeriod(mode: Period['mode'] = 'month'): Period {
  return { mode, month: thisMonth(), from: `${thisMonth()}-01`, to: todayIso() };
}

/** The call list's query for a period. */
export function periodQuery(p: Period): { month?: string; from?: string; to?: string; due?: string } {
  if (p.mode === 'today' || p.mode === 'all') return { due: p.mode };
  return p.mode === 'month' ? { month: p.month } : { from: p.from, to: p.to };
}

/** "29 Oct – 4 Nov": the services a call asks about. */
export function periodText(start?: string, end?: string): string {
  if (!start || !end) return '';
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/** "2026-11-03" -> "3 Nov 2026" */
export function longDay(iso: string): string {
  return `${formatDay(iso)} ${iso.slice(0, 4)}`;
}

/** "November 2026" or "1 Nov 2026 – 3 Nov 2026". */
export function periodLabel(p: Period): string {
  if (p.mode === 'today') return 'Due today';
  if (p.mode === 'all') return 'All calls';
  return p.mode === 'month' ? monthLabel(p.month) : `${longDay(p.from)} – ${longDay(p.to)}`;
}

/** "2026-11-03 14:05:09" - the started-at time the API expects. */
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---- answers ---- */
/** The chosen answers as response rows with the master's flags. */
export function chosenAnswers(questions: Question[], answers: Record<number, number>): Response[] {
  return questions
    .filter((q) => answers[q.id])
    .map((q) => {
      const o = q.options.find((x) => x.id === answers[q.id])!;
      return { question_id: q.id, question: q.question_text, option_id: o.id, answer: o.label, is_bad: o.is_bad, suggested_priority: o.is_bad ? o.suggested_priority : null };
    });
}

/* ---- customer emails (Masters > Email templates; opened in the phone's mail app to edit and send) ---- */
export const EMAIL_LABELS: Record<string, string> = {
  THANK_YOU: 'Thank-you email',
  ISSUE_RECEIVED: 'Issue received email',
  ISSUE_RESOLVED: 'Issue resolved email',
};

/** The active template for an email kind, or null (switched off or not loaded). */
export function emailTemplateFor(templates: EmailTemplate[], code: string): EmailTemplate | null {
  return templates.find((t) => t.code === code && t.is_active) || null;
}

/**
 * A customer email from its template, the same wording as the web: the {placeholders} filled, and
 * lines left empty by a missing value dropped. info: who it is for and about which ticket.
 */
export function fillEmail(
  template: EmailTemplate,
  info: { name?: string | null; customer?: string; site?: string; month?: string; ticketNumber?: string; issue?: string | null; revisitDate?: string | null; closeNote?: string | null; sender?: string },
): { subject: string; body: string } {
  const values: Record<string, string> = {
    contact: info.name || `${info.customer || 'Customer'} team`,
    customer: info.customer || '',
    site: info.site || '',
    month: info.month ? monthLabel(info.month) : '',
    ticket: info.ticketNumber || '',
    issue: info.issue || '',
    revisit_note: info.revisitDate ? `A re-visit has been scheduled for ${longDay(info.revisitDate.slice(0, 10))}. ` : '',
    action_taken: info.closeNote ? `Action taken: ${info.closeNote}` : '',
    sender: info.sender || 'Customer Care Team',
  };
  const fill = (text: string) => String(text || '').replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
  const body = fill(template.body)
    .split('\n')
    .filter((line) => !/^\s*["“”']{2}\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { subject: fill(template.subject).trim(), body };
}

/** A mailto: link that opens the phone's mail app with the email written. */
export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ---- which questions a feedback asks ---- */
/** GENERAL, SERVICE, BOTH, or one department's questions as "DEPT:ACCOUNTS". */
export type QuestionMode = string;
export const QUESTION_MODES: { value: QuestionMode; label: string }[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'SERVICE', label: 'Service-based' },
  { value: 'BOTH', label: 'Both' },
];

/** The questions asked for a mode and the month's services (the same rule the server checks). */
export function questionsFor(questions: Question[], mode: QuestionMode, services: string[]): Question[] {
  const had = new Set(services.map((x) => x.trim().toLowerCase()));
  const dept = mode.startsWith('DEPT:') ? mode.slice(5) : null;
  return questions.filter((q) => {
    if (q.question_type === 'DEPARTMENT') return !!dept && (q.departments || []).includes(dept);
    if (dept) return false;
    return q.question_type === 'SERVICE' ? mode !== 'GENERAL' && (q.services || []).some((x) => had.has(x.trim().toLowerCase())) : mode !== 'SERVICE';
  });
}

/** The API fields for a mode: { question_mode, question_department? }. */
export function modeBody(mode: QuestionMode): { question_mode: string; question_department?: string } {
  return mode.startsWith('DEPT:') ? { question_mode: 'DEPARTMENT', question_department: mode.slice(5) } : { question_mode: mode };
}

/** Every mode with its label: General / Service-based / Both and one per department. */
export function questionModes(departments: Department[]): { value: QuestionMode; label: string }[] {
  return [...QUESTION_MODES, ...departments.map((d) => ({ value: `DEPT:${d.kind}`, label: d.name || d.label }))];
}

/** How many questions each mode asks. */
export function modeCounts(questions: Question[], services: string[], departments: Department[]): Record<string, number> {
  return Object.fromEntries(questionModes(departments).map((m) => [m.value, questionsFor(questions, m.value, services).length]));
}

/* ---- departments a ticket goes to ---- */
export const OPERATIONS: DepartmentKind = 'OPERATIONS';

/** One line under a department's name: what happens when a ticket goes there. */
export function departmentHint(d: { kind: DepartmentKind; with_invoices?: boolean }): string {
  if (d.kind === OPERATIONS) return 'Service issue - a re-visit is booked';
  if (d.with_invoices) return "Invoice issue - pick the customer's invoices";
  return 'Their team handles it and marks it done';
}

/** A call's badge: a done call closed without an answer shows "Not responded". */
export function callStatusMeta(status: string, result?: string | null): { label: string; tone: Tone } {
  if (status === 'DONE' && result === 'NO_RESPONSE') return { label: 'Not responded', tone: 'neutral' };
  return CALL_STATUS[status as CallStatus] || { label: status, tone: 'neutral' };
}

/** "₹12,500" */
export function rupees(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** The highest priority the bad answers suggest. */
export function suggestedPriority(rows: Response[]): Priority {
  const rank: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4 };
  return rows.reduce<Priority | null>((best, r) => (r.suggested_priority && (!best || rank[r.suggested_priority] > rank[best]) ? r.suggested_priority : best), null) ?? 'MEDIUM';
}
