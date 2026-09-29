import { Platform } from 'react-native';
import type { TaskPriority, TaskStatus } from './types';

/**
 * Task Management look: soft pastel wash (pink -> lavender -> peach), white
 * rounded cards, near-black primary actions and a lime progress accent.
 * Its own module - like crm/theme.ts - so no existing screen is affected.
 */
export const t = {
  ink: '#141416',
  inkSoft: '#2A2A2E',
  text: '#141416',
  textSecondary: '#55555C',
  textMuted: '#8C8C94',
  onInk: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceGlass: 'rgba(255,255,255,0.72)',
  border: '#ECEBEF',
  lime: '#C9DE7E',
  limeDeep: '#8FA73A',
  limeSoft: '#EEF5D2',
  danger: '#D64545',
  dangerSoft: '#FCE8E8',
  overlay: 'rgba(20,20,22,0.45)',
  washPink: '#F6CFE0',
  washLavender: '#DCC8F2',
  washPeach: '#F8D9C8',
  washBase: '#F5F3F6',
} as const;

export const radius = { sm: 12, md: 18, lg: 24, xl: 30, pill: 999 } as const;

export const font = {
  light: Platform.select({ android: 'sans-serif-light', default: undefined }),
  regular: Platform.select({ android: 'sans-serif', default: undefined }),
  medium: Platform.select({ android: 'sans-serif-medium', default: undefined }),
};

export const cardShadow = Platform.select({
  android: { elevation: 1 },
  default: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});

export const STATUS_META: Record<TaskStatus, { label: string; color: string; soft: string }> = {
  OPEN: { label: 'To Do', color: '#2F6FE4', soft: '#E6EEFD' },
  IN_PROGRESS: { label: 'In Progress', color: '#9B6AF0', soft: '#EFE6FD' },
  COMPLETED: { label: 'Completed', color: '#3D8B55', soft: '#E3F3E7' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280', soft: '#EEF0F3' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; soft: string; border: string }> = {
  LOW: { label: 'Low', color: '#3D8B55', soft: '#E6F4EA', border: '#9BCFA9' },
  NORMAL: { label: 'Normal', color: '#C7862B', soft: '#FDF1DE', border: '#F0C27B' },
  HIGH: { label: 'High', color: '#D24545', soft: '#FBE5E5', border: '#F0A5A5' },
};

export const TONE_COLOR = { late: '#D24545', soon: '#C7862B', ok: '#55555C', muted: '#8C8C94' } as const;

/** Stable pastel per person, for avatar circles. */
const AVATAR_COLORS = ['#F7B7C8', '#B9D7F7', '#C9DE7E', '#F6CF9A', '#CDB8F4', '#9FDCCB', '#F4A99A'];
export function avatarColor(seed: string | number | null | undefined): string {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
