import { colors } from '../theme';

export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

/**
 * One consistent status vocabulary for jobs AND visits (their status enums
 * overlap almost entirely - CREATED/NOT_STARTED map to a "Pending" family,
 * IN_PROGRESS/AWAITING_APPROVAL are "in flight", COMPLETED/CANCELED/MISSED
 * are terminal). Colors reuse the same semantic tokens the web app's job
 * status pills use (frontend/src/styles/job.css) - success green, warning
 * amber, info blue, danger red, neutral gray - never a one-off hex value.
 */
const STATUS_META: Record<string, StatusMeta> = {
  CREATED: { label: 'Pending', color: colors.warningText, bg: colors.warningBg },
  NOT_STARTED: { label: 'Pending', color: colors.warningText, bg: colors.warningBg },
  SCHEDULED: { label: 'Scheduled', color: colors.info, bg: colors.infoBg },
  ASSIGNED: { label: 'Assigned', color: colors.info, bg: colors.infoBg },
  IN_PROGRESS: { label: 'In progress', color: colors.info, bg: colors.infoBg },
  PAUSED: { label: 'Paused', color: colors.warningText, bg: colors.warningBg },
  AWAITING_APPROVAL: { label: 'Awaiting approval', color: colors.warningText, bg: colors.warningBg },
  PENDING: { label: 'Pending', color: colors.warningText, bg: colors.warningBg },
  LOST: { label: 'Lost', color: colors.dangerText, bg: colors.dangerBg },
  COMPLETED: { label: 'Completed', color: colors.successText, bg: colors.successBg },
  CANCELED: { label: 'Canceled', color: colors.dangerText, bg: colors.dangerBg },
  CANCELLED: { label: 'Canceled', color: colors.dangerText, bg: colors.dangerBg },
  MISSED: { label: 'Missed', color: colors.dangerText, bg: colors.dangerBg },
};

const FALLBACK_META: StatusMeta = {
  label: 'Unknown',
  color: colors.textMuted,
  bg: colors.surfaceAlt,
};

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return FALLBACK_META;
  const meta = STATUS_META[status.toUpperCase()];
  if (meta) return meta;
  // Unknown status from the backend: render it as-is rather than hiding it.
  return { ...FALLBACK_META, label: toTitleCase(status) };
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
