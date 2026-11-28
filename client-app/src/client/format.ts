import type { Tone } from '../crm/ui/StatusBadge';

// Small helpers shared by the client screens - the mobile copy of the web's
// frontend/src/clientPortal/portalUtils.js, so both show the same words.

/** BestServe support contact shown to clients (profile). */
export const SUPPORT_CONTACT = {
  email: 'info@bestserve.in',
  phone: '8884442625',
  phoneDisplay: '+91 88844 42625',
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // A plain "YYYY-MM-DD" is a local calendar day, not UTC midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-IN', opts) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function relativeDay(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days ago`;
}

export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type PeriodKey = '7d' | '30d' | 'month' | 'year' | 'custom';

/** Period presets for the filter bar (same as the web). */
export const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key: '7d', label: 'Last 7 days', short: '7 days' },
  { key: '30d', label: 'Last 30 days', short: '30 days' },
  { key: 'month', label: 'This month', short: 'Month' },
  { key: 'year', label: 'This year', short: 'Year' },
  { key: 'custom', label: 'Custom', short: 'Custom' },
];

export interface DateRange {
  from: string;
  to: string;
}

export function periodRange(key: PeriodKey, custom: Partial<DateRange> = {}): DateRange {
  const today = new Date();
  const from = new Date(today);
  if (key === '7d') from.setDate(today.getDate() - 6);
  else if (key === 'month') from.setDate(1);
  else if (key === 'year') from.setMonth(0, 1);
  else if (key === 'custom') return { from: custom.from || ymd(today), to: custom.to || ymd(today) };
  else from.setDate(today.getDate() - 29);
  return { from: ymd(from), to: ymd(today) };
}

const SERVICE_LABELS: Record<string, string> = {
  PEST: 'Pest Control',
  DEEP: 'Deep Cleaning',
  BOTH: 'Pest Control + Deep Cleaning',
  SALES: 'Sales Visit',
};

export function serviceLabel(code: string | null | undefined): string {
  if (!code) return 'Service';
  return SERVICE_LABELS[String(code).toUpperCase()] || String(code);
}

const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Scheduled', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  AWAITING_APPROVAL: { label: 'Under review', tone: 'warning' },
  MISSED: { label: 'Missed', tone: 'danger' },
  CANCELED: { label: 'Cancelled', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'warning' },
  VISIT_SCHEDULED: { label: 'Visit scheduled', tone: 'accent' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export function statusInfo(status: string | null | undefined): { label: string; tone: Tone } {
  return STATUS_LABELS[String(status || '').toUpperCase()] || { label: status || '—', tone: 'neutral' };
}

export const RISK_STYLE: Record<string, { label: string; tone: Tone }> = {
  CRITICAL: { label: 'Critical', tone: 'danger' },
  HIGH: { label: 'High', tone: 'danger' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  LOW: { label: 'Low', tone: 'success' },
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
