import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import type { Option } from '../types';

const factory = (t: CrmTheme) => ({
  track: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.lg,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.xs,
  },
  segmentActive: {
    backgroundColor: t.primary,
  },
  content: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6 },
  label: {
    ...typography.captionMedium,
    color: t.textSecondary,
    textAlign: 'center' as const,
  },
  labelActive: {
    color: t.textOnPrimary,
  },
});

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional icon per option; `color` already matches the active / inactive label colour. */
  renderIcon?: (value: T, color: string) => React.ReactNode;
}

export function SegmentedControl<T extends string>({ options, value, onChange, renderIcon }: SegmentedControlProps<T>) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <View style={styles.content}>
              {renderIcon?.(option.value, active ? theme.textOnPrimary : theme.textSecondary)}
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
