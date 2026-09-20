import React from 'react';
import { Text, View } from 'react-native';
import {
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  PhoneIcon,
  SparkleIcon,
} from '../../components/icons';
import { radii, spacing, typography } from '../../theme';
import { StarIcon } from './crmIcons';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { LeadStatus, PaymentStatus } from '../types';

export type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'neutral';

export function toneColors(
  theme: CrmTheme,
  tone: Tone,
): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: theme.successBg, fg: theme.successText };
    case 'warning':
      return { bg: theme.warningBg, fg: theme.warningText };
    case 'danger':
      return { bg: theme.dangerBg, fg: theme.dangerText };
    case 'info':
      return { bg: theme.infoBg, fg: theme.info };
    case 'accent':
      return { bg: theme.accentBg, fg: theme.accentText };
    default:
      return { bg: theme.surfaceAlt, fg: theme.textSecondary };
  }
}

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: Tone }
> = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Payment Pending', tone: 'warning' },
};

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; tone: Tone }
> = {
  new: { label: 'New', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'accent' },
  converted: { label: 'Converted', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};

const factory = (_t: CrmTheme) => ({
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    ...typography.captionMedium,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

interface StatusBadgeProps {
  label: string;
  tone: Tone;
  dot?: boolean;
}

export function StatusBadge({ label, tone, dot = true }: StatusBadgeProps) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: fg }]} />}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

function IconBadge({
  tone,
  label,
  children,
}: {
  tone: Tone;
  label: string;
  children: (color: string) => React.ReactNode;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.iconBadge, { backgroundColor: bg }]}
    >
      {children(fg)}
    </View>
  );
}

/** Icon-only payment state: check = paid, clock = pending. Meaning is in the accessibility label. */
export function PaymentStatusIcon({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_STATUS_META[status];
  return (
    <IconBadge tone={meta.tone} label={meta.label}>
      {c =>
        status === 'paid' ? (
          <CheckCircleIcon size={18} color={c} />
        ) : (
          <ClockIcon size={18} color={c} />
        )
      }
    </IconBadge>
  );
}

/** Icon-only lead state: sparkle = new, phone = contacted, star = converted, x = lost. */
export function LeadStatusIcon({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <IconBadge tone={meta.tone} label={meta.label}>
      {c =>
        status === 'new' ? (
          <SparkleIcon size={17} color={c} />
        ) : status === 'contacted' ? (
          <PhoneIcon size={16} color={c} />
        ) : status === 'converted' ? (
          <StarIcon size={17} color={c} />
        ) : (
          <CloseIcon size={16} color={c} />
        )
      }
    </IconBadge>
  );
}
