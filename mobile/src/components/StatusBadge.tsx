import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getStatusMeta } from '../utils/statusMeta';
import { radii, spacing, typography } from '../theme';

interface StatusBadgeProps {
  status: string | null | undefined;
}

/** One consistent, restrained status pill - never a giant colored label. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = getStatusMeta(status);

  return (
    <View style={[styles.container, { backgroundColor: meta.bg }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, { color: meta.color }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.captionMedium,
    fontSize: 12,
  },
});
