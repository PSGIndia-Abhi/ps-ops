import type { ComplaintCategory, ComplaintStage } from './api';

/** Complaint stages in order (BestServe moves a complaint through them; the client only replies). */
export const STAGES: { key: ComplaintStage; label: string; note: string }[] = [
  { key: 'OPEN', label: 'Raised', note: 'We have your complaint. Our team will pick it up shortly.' },
  { key: 'IN_PROGRESS', label: 'In progress', note: 'Our team is working on it.' },
  { key: 'VISIT_SCHEDULED', label: 'Visit scheduled', note: 'Our team will visit your outlet to fix it.' },
  { key: 'RESOLVED', label: 'Resolved', note: 'Marked as fixed by our team. Reply if the problem is still there.' },
  { key: 'CLOSED', label: 'Closed', note: 'Closed by our team. Raise a new complaint if the issue comes back.' },
];

/** Colours per stage (light theme): red Open, amber In progress, violet Visit, green Resolved, slate Closed. */
export const STAGE_TONE: Record<ComplaintStage, { fg: string; bg: string }> = {
  OPEN: { fg: '#C5221F', bg: '#FCE8E6' },
  IN_PROGRESS: { fg: '#B06000', bg: '#FEF3E2' },
  VISIT_SCHEDULED: { fg: '#7B3FC4', bg: '#F3E8FD' },
  RESOLVED: { fg: '#188038', bg: '#E6F4EA' },
  CLOSED: { fg: '#5F6368', bg: '#F1F3F4' },
};

export const stageOf = (status: string | null | undefined): ComplaintStage => {
  const s = String(status || '').toUpperCase() as ComplaintStage;
  return STAGES.some((x) => x.key === s) ? s : 'OPEN';
};

/** Status name for lists and pills ("Open"); the stage timeline says "Raised" for the same step. */
export const stageLabel = (status: string | null | undefined) => {
  const st = stageOf(status);
  return st === 'OPEN' ? 'Open' : STAGES.find((x) => x.key === st)!.label;
};

export const PRIORITY_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Normal', HIGH: 'High', URGENT: 'Urgent' };
export const PRIORITY_TONE: Record<string, { fg: string; bg: string }> = {
  LOW: { fg: '#188038', bg: '#E6F4EA' },
  MEDIUM: { fg: '#0B57D0', bg: '#E3ECFD' },
  HIGH: { fg: '#C26401', bg: '#FEF3E2' },
  URGENT: { fg: '#C5221F', bg: '#FCE8E6' },
};

export const CATEGORY_LABEL: Record<ComplaintCategory, string> = { SERVICE: 'Service', ACCOUNTS: 'Accounts' };
export const CATEGORY_TONE: Record<ComplaintCategory, { fg: string; bg: string }> = {
  SERVICE: { fg: '#0B57D0', bg: '#E3ECFD' },
  ACCOUNTS: { fg: '#00796B', bg: '#E0F4F2' },
};

/** "Tue, 02 Dec, 3 - 5 PM" from the complaint's visit date / slot (either may be missing). */
export function visitText(date?: string | null, slot?: string | null): string {
  const day = date ? new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }) : '';
  return [day, slot].filter(Boolean).join(', ');
}
