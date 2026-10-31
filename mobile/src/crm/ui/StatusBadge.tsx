import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
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
import type { LeadSource, LeadStatus, PaymentStatus } from '../types';

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

/** Emoji read as a real, recognisable glyph per channel - a website/apartment/referral icon,
 * not another abstract shape - with no new asset weight. */
const LEAD_SOURCE_META: Record<
  LeadSource,
  { label: string; tone: Tone; emoji: string }
> = {
  website: { label: 'Website', tone: 'info', emoji: '🌐' },
  apartment: { label: 'Apartment', tone: 'accent', emoji: '🏢' },
  referral: { label: 'Referral', tone: 'success', emoji: '🤝' },
  social_media: { label: 'Social Media', tone: 'warning', emoji: '📱' },
  google: { label: 'Google', tone: 'info', emoji: '🔎' },
  other: { label: 'Other', tone: 'neutral', emoji: '🏷️' },
};
const UNKNOWN_SOURCE_META = {
  label: 'Source not set',
  tone: 'neutral' as Tone,
  emoji: '🏷️',
};

const factory = (_t: CrmTheme) => ({
  // A soft pill: the status colour with a light gloss on top, a thin outline in the same colour,
  // a glowing dot (a dot in a soft halo) and a bold label.
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 4,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm + 2,
    overflow: 'hidden' as const,
  },
  dotWrap: {
    width: 12,
    height: 12,
    marginRight: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  halo: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    opacity: 0.22,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.captionMedium,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sourceEmoji: { fontSize: 16, lineHeight: 19 },
});

interface StatusBadgeProps {
  label: string;
  tone: Tone;
  dot?: boolean;
}

/** "#16a34a" -> "#16a34a40" (a see-through outline); other colour formats are used as they are. */
const soften = (color: string, alpha: string) =>
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;

export function StatusBadge({ label, tone, dot = true }: StatusBadgeProps) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, tone);
  const glossId = useRef(
    `statusGloss${Math.round(Math.random() * 1e6)}`,
  ).current;
  // The gloss is drawn at the pill's measured size (a percentage-sized SVG does not always stretch).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: soften(fg, '33') },
      ]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev =>
          prev && prev.w === width && prev.h === height
            ? prev
            : { w: width, h: height },
        );
      }}
    >
      {/* a light gloss over the top half */}
      {size && (
        <Svg
          style={StyleSheet.absoluteFill}
          width={size.w}
          height={size.h}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.w}
            height={size.h}
            fill={`url(#${glossId})`}
          />
        </Svg>
      )}
      {dot && (
        <View style={styles.dotWrap}>
          <View style={[styles.halo, { backgroundColor: fg }]} />
          <View style={[styles.dot, { backgroundColor: fg }]} />
        </View>
      )}
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

/** Icon-only lead source: where this lead actually came from (website/apartment/referral/...),
 * shown instead of the pipeline status - the payment icon right next to it already covers
 * "paid or not", so this slot is more useful surfacing the channel than the stage. */
export function LeadSourceIcon({ source }: { source: LeadSource | null }) {
  const { styles } = useCrmStyles(factory);
  // The server can hold a source this app has no entry for - a lead submitted through the web
  // provider portal is stored as "Lead Provider", "Field Visit", ... Such a lead gets the
  // neutral tag (announced by its own name) rather than taking the whole list down.
  const known = source ? LEAD_SOURCE_META[source] : undefined;
  const meta = known ?? {
    ...UNKNOWN_SOURCE_META,
    label: source || UNKNOWN_SOURCE_META.label,
  };
  return (
    <IconBadge tone={meta.tone} label={meta.label}>
      {() => <Text style={styles.sourceEmoji}>{meta.emoji}</Text>}
    </IconBadge>
  );
}
