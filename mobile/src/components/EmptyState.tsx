import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InboxIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

/** A calm, on-brand "nothing here" state - never a blank screen. */
export function EmptyState({ title, subtitle, icon }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>{icon ?? <InboxIcon size={32} color={colors.textMuted} />}</View>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
});
