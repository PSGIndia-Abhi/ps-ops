import { colors } from '../theme';
import type { AreaStatus, AuditStatus, RiskLevelCode } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-24" -> "24 Oct 2026" (read from the string, so no timezone shift). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-24T10:45:00" -> "10:45 AM, 24 Oct" */
export function fmtSaved(value: string | null | undefined): string {
  if (!value || value.length < 16) return '—';
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  let h = Number(value.slice(11, 13));
  const min = value.slice(14, 16);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}, ${d} ${MONTHS[m - 1]}`;
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-10-27" + 7 -> "2026-11-03" (calendar days, no time zone shift). */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const titleCase = (s: string | null | undefined) =>
  s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '';

export const AUDIT_TYPE_LABEL: Record<string, string> = {
  PRE_SALE: 'Pre-sale audit',
  COMPLAINT: 'Complaint audit',
  ROUTINE: 'Routine audit',
  OTHER: 'Other',
  // Older audits.
  RODENT: 'Rodent',
  GENERAL_PEST: 'General Pest Control',
  TERMITE: 'Termite',
};

export const RISK_STYLE: Record<RiskLevelCode, { label: string; bg: string; fg: string }> = {
  CRITICAL: { label: 'Critical', bg: '#8B1A1A', fg: '#FFFFFF' },
  HIGH: { label: 'High', bg: '#C2410C', fg: '#FFFFFF' },
  MEDIUM: { label: 'Medium', bg: '#F2C14E', fg: '#3B2A00' },
  LOW: { label: 'Low', bg: '#B9D94A', fg: '#213000' },
};

export const AUDIT_STATUS_STYLE: Record<AuditStatus, { label: string; bg: string; fg: string }> = {
  IN_PROGRESS: { label: 'In progress', bg: colors.primarySoft, fg: colors.primaryPressed },
  SUBMITTED: { label: 'Submitted', bg: colors.successBg, fg: colors.successText },
  AMENDING: { label: 'Amending', bg: colors.warningBg, fg: colors.warningText },
  CANCELLED: { label: 'Cancelled', bg: colors.surfaceAlt, fg: colors.textSecondary },
};

export const AREA_STATUS_STYLE: Record<AreaStatus, { label: string; bg: string; fg: string }> = {
  NOT_STARTED: { label: 'Not started', bg: colors.surfaceAlt, fg: colors.textSecondary },
  IN_PROGRESS: { label: 'In progress', bg: colors.primarySoft, fg: colors.primaryPressed },
  COMPLETED: { label: 'Completed', bg: colors.successBg, fg: colors.successText },
};

const FIELD_LABEL: Record<string, string> = {
  title: 'Finding title',
  riskCategory: 'Risk category',
  riskLevel: 'Risk level',
  observationText: 'Observation',
  customerActionText: 'Customer action',
  bestserveActionText: 'BestServe action',
  photos: 'Photo',
  findings: 'At least one finding',
};

/** "findings[0].observationText" -> "Finding 1: Observation" */
export function describeMissing(m: string): string {
  const match = m.match(/^findings\[(\d+)\]\.(\w+)$/);
  if (match) return `Finding ${Number(match[1]) + 1}: ${FIELD_LABEL[match[2]] || match[2]}`;
  return FIELD_LABEL[m] || m;
}

// ---- risk categories ---------------------------------------------------------

// Category codes the backend knows; anything else is a category typed under "Other".
export const KNOWN_CATEGORIES = ['HARBOURAGE', 'CRACKS', 'BURROWS', 'ENTRY_POINT', 'FOOD_SOURCE', 'WATER', 'OTHER'];
// A finding can have several categories. In the form they are kept together as "HARBOURAGE,CRACKS,OTHER"
// (OTHER = the typed one); on the server as "HARBOURAGE,CRACKS,Damaged wood".
export const catList = (value: string) => value.split(',').map(c => c.trim()).filter(Boolean);
/** Saved / heard categories -> chips (codes, OTHER for a typed one) and the typed text. */
export function splitCategories(value: string, labels: { code: string; label: string }[] = []) {
  const codes: string[] = [];
  let other = '';
  catList(value).forEach(c => {
    const code = labels.find(x => x.label.toLowerCase() === c.toLowerCase())?.code || c.toUpperCase().replace(/\s+/g, '_');
    if (KNOWN_CATEGORIES.includes(code) && code !== 'OTHER') { if (!codes.includes(code)) codes.push(code); } else if (!other) other = c;
  });
  return { riskCategory: [...codes, ...(other ? ['OTHER'] : [])].join(','), categoryOther: other };
}
/** What the server stores: the chosen codes and the typed "Other" text. */
export function categoriesToSave(x: { riskCategory: string; categoryOther: string }) {
  const list = catList(x.riskCategory).filter(c => c !== 'OTHER');
  if (catList(x.riskCategory).includes('OTHER') && x.categoryOther.trim()) list.push(x.categoryOther.trim().replace(/,/g, ' '));
  return list.join(',');
}
/** Names for showing: "Rodent harbourage, Cracks & crevices, Damaged wood". */
export const CATEGORY_LABEL: Record<string, string> = {
  HARBOURAGE: 'Rodent harbourage',
  CRACKS: 'Cracks & crevices',
  BURROWS: 'Burrows',
  ENTRY_POINT: 'Entry point',
  FOOD_SOURCE: 'Food source',
  WATER: 'Water stagnation',
};
export const categoryNames = (value: string) => catList(value).map(c => CATEGORY_LABEL[c] || titleCase(c)).join(', ');
