import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

interface PillOption<T extends string> {
  value: T;
  label: string;
}

interface PillSelectProps<T extends string> {
  label?: string;
  options: PillOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/** A compact single-select row of pills - used for short, fixed option sets (type, service type, scope). */
export function PillSelect<T extends string>({ label, options, value, onChange }: PillSelectProps<T>) {
  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoftBg,
  },
  pillText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.primaryPressed,
  },
});
