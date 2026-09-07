import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

interface ListRowProps {
  title: string;
  subtitle?: string | null;
  /** e.g. a StatusBadge, an "On shift" dot, a count - rendered on the right. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  leadingInitial?: string;
}

/** A compact, reusable row for people/booking lists - name, subtitle, trailing detail. */
export function ListRow({ title, subtitle, trailing, onPress, leadingInitial }: ListRowProps) {
  const content = (
    <>
      {!!leadingInitial && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{leadingInitial}</Text>
        </View>
      )}
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {!!onPress && <ChevronRightIcon size={18} color={colors.textMuted} />}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  rowPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.captionMedium,
    color: colors.primaryPressed,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
});
