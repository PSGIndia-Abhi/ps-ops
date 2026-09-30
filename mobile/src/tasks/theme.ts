import type { CrmTheme } from '../crm/theme';
import type { Tone } from '../crm/ui/StatusBadge';
import { isOverdue, todayStr } from './format';
import type { TaskPriority, WorkTask } from './types';

/**
 * Task Management uses the same look as the CRM and Technician screens: the
 * CRM light/dark theme (crm/theme.ts, via useCrmStyles) and its components.
 * This file only maps task states onto that theme's tones.
 */

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: Tone }> = {
  LOW: { label: 'Low', tone: 'success' },
  NORMAL: { label: 'Normal', tone: 'info' },
  HIGH: { label: 'High', tone: 'danger' },
};

export type TaskState = 'overdue' | 'progress' | 'paused' | 'today' | 'upcoming' | 'open' | 'done' | 'cancelled';

/** What a task "is" right now, for its colour and pill - same rules as the lists. */
export function taskState(x: WorkTask): TaskState {
  if (x.status === 'COMPLETED') return 'done';
  if (x.status === 'CANCELLED') return 'cancelled';
  if (isOverdue(x)) return 'overdue';
  if (x.status === 'PAUSED') return 'paused';
  if (x.status === 'IN_PROGRESS') return 'progress';
  if (x.due_date === todayStr()) return 'today';
  if (x.due_date && x.due_date > todayStr()) return 'upcoming';
  return 'open';
}

export const STATE_META: Record<TaskState, { label: string; tone: Tone }> = {
  overdue: { label: 'Overdue', tone: 'danger' },
  progress: { label: 'In Progress', tone: 'accent' },
  paused: { label: 'Paused', tone: 'warning' },
  today: { label: 'Open', tone: 'warning' },
  upcoming: { label: 'Upcoming', tone: 'info' },
  open: { label: 'Open', tone: 'info' },
  done: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Solid colour for a tone (icon squares, accents). */
export function toneSolid(theme: CrmTheme, tone: Tone): string {
  switch (tone) {
    case 'success':
      return theme.success;
    case 'warning':
      return theme.warning;
    case 'danger':
      return theme.danger;
    case 'info':
      return theme.primary;
    case 'accent':
      return theme.accent;
    default:
      return theme.textMuted;
  }
}

/** Light -> deep pair per tone, for the gradient icon squares and tile circles. */
export const TONE_GRADIENT: Record<Tone, [string, string]> = {
  info: ['#60A5FA', '#2563EB'],
  danger: ['#F87171', '#DC2626'],
  success: ['#4ADE80', '#16A34A'],
  warning: ['#FCD34D', '#F59E0B'],
  accent: ['#A78BFA', '#7C3AED'],
  neutral: ['#CBD5E1', '#94A3B8'],
};

/** Short, readable reference for a task (ids are UUIDs). */
export const taskRef = (id: string) => `TSK-${id.slice(0, 8).toUpperCase()}`;

/** Stable colour per person, for avatar circles. */
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#0891B2', '#16A34A', '#D97706', '#DB2777', '#4F46E5'];
export function avatarColor(seed: string | number | null | undefined): string {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
