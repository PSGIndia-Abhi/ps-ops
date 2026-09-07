import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface StatCardProps {
  label: string;
  value: number | string;
  /** Loading and "no data yet" both render a dash instead of a misleading 0. */
  isLoading?: boolean;
  icon?: React.ReactNode;
  /** Semantic accent (e.g. colors.danger for "Overdue") - defaults to a neutral surface. */
  accentColor?: string;
}

/**
 * A small, meaningful summary number - never one of ten decorative cards.
 * `accentColor`/`icon` are optional so every stat card doesn't have to look
 * identical, without forcing every caller to specify them.
 */
export function StatCard({ label, value, isLoading, icon, accentColor }: StatCardProps) {
  return (
    <View style={styles.card}>
      {!!icon && (
        <View
          style={[
            styles.iconWrap,
            accentColor ? { backgroundColor: `${accentColor}1A` } : styles.iconWrapNeutral,
          ]}
        >
          {icon}
        </View>
      )}
      <Text style={[styles.value, accentColor ? { color: accentColor } : null]}>
        {isLoading ? '–' : value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconWrapNeutral: {
    backgroundColor: colors.surfaceAlt,
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
