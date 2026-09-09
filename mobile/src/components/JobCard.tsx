import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { ChevronRightIcon, ClockIcon, PinIcon } from './icons';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface JobCardProps {
  /** e.g. "JOB #1024" */
  code: string;
  /** e.g. job type / sub-service - "Pest Control Service" */
  title: string;
  /** site/company name - "ABC Office" */
  site?: string | null;
  address?: string | null;
  /** already-formatted time/date, e.g. "09:30 AM" */
  when?: string | null;
  status: string | null | undefined;
  onPress: () => void;
  actionLabel?: string;
  /** Subtle primary-tinted emphasis for the single most relevant card (e.g. "Up Next"). */
  highlighted?: boolean;
  highlightLabel?: string;
}

/**
 * The one job/visit card used across Admin's Jobs list, Supervisor's
 * Today's Work, and the Technician's Today's Jobs - same visual language
 * everywhere, fed by whatever data each screen actually has.
 */
export function JobCard({
  code,
  title,
  site,
  address,
  when,
  status,
  onPress,
  actionLabel = 'View job',
  highlighted,
  highlightLabel = 'UP NEXT',
}: JobCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.cardHighlighted,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.code} numberOfLines={1}>
            {code}
          </Text>
          {highlighted && (
            <View style={styles.highlightTag}>
              <Text style={styles.highlightTagText}>{highlightLabel}</Text>
            </View>
          )}
        </View>
        <StatusBadge status={status} />
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {!!site && (
        <Text style={styles.site} numberOfLines={1}>
          {site}
        </Text>
      )}

      <View style={styles.metaRow}>
        {!!when && (
          <View style={styles.metaItem}>
            <ClockIcon size={14} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {when}
            </Text>
          </View>
        )}
        {!!address && (
          <View style={[styles.metaItem, styles.metaItemGrow]}>
            <PinIcon size={14} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {address}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <Text style={styles.actionLabel}>{actionLabel}</Text>
        <ChevronRightIcon size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHighlighted: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.primarySoftBg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  highlightTag: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  highlightTagText: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textOnPrimary,
  },
  code: {
    ...typography.overline,
    color: colors.textMuted,
    flexShrink: 1,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  site: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  metaItemGrow: {
    flexShrink: 1,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 2,
  },
  actionLabel: {
    ...typography.captionMedium,
    color: colors.primary,
  },
});
