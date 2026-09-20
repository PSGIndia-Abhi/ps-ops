import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, touchTarget, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';
import { CheckIcon, ChevronDownIcon } from './crmIcons';
import type { Option } from '../types';

const factory = (t: CrmTheme) => ({
  container: { marginBottom: spacing.md },
  label: {
    ...typography.captionMedium,
    color: t.textSecondary,
    marginBottom: spacing.xxs,
  },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget.minHeight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  fieldError: { borderColor: t.danger },
  fieldDisabled: { opacity: 0.55 },
  value: { flex: 1, ...typography.body, color: t.textPrimary },
  placeholder: { flex: 1, ...typography.body, color: t.textMuted },
  error: { ...typography.caption, color: t.dangerText, marginTop: spacing.xxs },
  backdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: t.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.lg,
  },
  optionSelected: { backgroundColor: t.primarySoftBg },
  optionLabel: { flex: 1, ...typography.body, color: t.textPrimary },
  optionLabelSelected: { color: t.primary, fontWeight: '700' as const },
});

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  disabled?: boolean;
  /** Shown as the sheet title; defaults to the field label. */
  sheetTitle?: string;
}

/** A dropdown that opens a bottom sheet - the touch-friendly way to pick from a list on a phone. */
export function SelectField<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  disabled = false,
  sheetTitle,
}: SelectFieldProps<T>) {
  const { styles, theme } = useCrmStyles(factory);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected ? selected.label : 'not selected'}`}
        accessibilityState={{ disabled }}
        style={[styles.field, !!error && styles.fieldError, disabled && styles.fieldDisabled]}
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDownIcon size={18} color={theme.textMuted} />
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { maxHeight: windowHeight * 0.7, paddingBottom: insets.bottom }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{sheetTitle ?? label}</Text>
            <ScrollView>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.option, isSelected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                    {isSelected && <CheckIcon size={20} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
