import type { CrmTheme } from '../crm/theme';
import type { HelpdeskPriority, HelpdeskStatus } from './api';

export function timeAgo(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function clock(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? time : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function dayLabel(value: string): string {
  const d = new Date(value);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What the person who raised it reads. */
export const USER_STATUS: Record<HelpdeskStatus, string> = {
  OPEN: 'Submitted',
  IN_PROGRESS: 'In progress',
  WAITING_USER: 'Needs your reply',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** What the technical team reads. */
export const TEAM_STATUS: Record<HelpdeskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_USER: 'Waiting on user',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABEL: Record<HelpdeskPriority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

export const ACTIVE: HelpdeskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'];

export function statusColors(status: HelpdeskStatus, t: CrmTheme): { bg: string; fg: string } {
  switch (status) {
    case 'OPEN':
      return { bg: t.infoBg, fg: t.info };
    case 'IN_PROGRESS':
      return { bg: t.accentBg, fg: t.accentText };
    case 'WAITING_USER':
      return { bg: t.warningBg, fg: t.warningText };
    case 'RESOLVED':
      return { bg: t.successBg, fg: t.successText };
    default:
      return { bg: t.surfaceAlt, fg: t.textSecondary };
  }
}

export function priorityColors(priority: HelpdeskPriority, t: CrmTheme): { bg: string; fg: string } {
  switch (priority) {
    case 'URGENT':
      return { bg: t.dangerBg, fg: t.dangerText };
    case 'HIGH':
      return { bg: t.warningBg, fg: t.warningText };
    case 'LOW':
      return { bg: t.surfaceAlt, fg: t.textMuted };
    default:
      return { bg: t.infoBg, fg: t.info };
  }
}
