import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { getStatusMeta } from '../utils/statusMeta';
import { colors, spacing, typography } from '../theme';

interface ScheduleRowProps {
  time: string;
  site: string;
  jobType: string;
  technicianName?: string | null;
  status: string | null | undefined;
  onPress: () => void;
  /** Flags the single nearest upcoming item, matching the reference layout's "UP NEXT" tag. */
  isNext?: boolean;
  isLast?: boolean;
}

/**
 * A compact timeline row (time + connector + details + status) - deliberately
 * lighter-weight than JobCard, which is meant for list screens. Reused by
 * Admin, Supervisor, and Technician's "Today's Schedule"/"Up Next" sections.
 */
export function ScheduleRow({
  time,
  site,
  jobType,
  technicianName,
  status,
  onPress,
  isNext,
  isLast,
}: ScheduleRowProps) {
  const meta = getStatusMeta(status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.timeColumn}>
        <Text style={styles.time} numberOfLines={1}>
          {time}
        </Text>
        <View style={styles.connector}>
          <View style={[styles.dot, { backgroundColor: meta.color }]} />
          {!isLast && <View style={styles.line} />}
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.contentHeader}>
          <Text style={styles.site} numberOfLines={1}>
            {site}
          </Text>
          {isNext && (
            <View style={styles.nextTag}>
              <Text style={styles.nextTagText}>UP NEXT</Text>
            </View>
          )}
        </View>
        <Text style={styles.jobType} numberOfLines={1}>
          {jobType}
        </Text>
        {!!technicianName && (
          <Text style={styles.technician} numberOfLines={1}>
            {technicianName}
          </Text>
        )}
        <View style={styles.statusRow}>
          <StatusBadge status={status} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  rowPressed: {
    opacity: 0.85,
  },
  timeColumn: {
    width: 66,
    alignItems: 'center',
  },
  time: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  connector: {
    alignItems: 'center',
    flex: 1,
    marginTop: spacing.xxs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingBottom: spacing.md,
    paddingLeft: spacing.sm,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  site: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  nextTag: {
    backgroundColor: colors.primarySoftBg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  nextTagText: {
    ...typography.overline,
    fontSize: 9,
    color: colors.primaryPressed,
  },
  jobType: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 1,
  },
  technician: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  statusRow: {
    marginTop: spacing.xs,
  },
});
