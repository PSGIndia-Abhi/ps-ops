import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { radii, spacing, touchTarget, typography } from '../../theme';
import { useCrmStyles, type CrmTheme } from '../theme';

const factory = (t: CrmTheme) => ({
  container: { marginBottom: spacing.md },
  label: {
    ...typography.captionMedium,
    color: t.textSecondary,
    marginBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget.minHeight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  rowMultiline: {
    alignItems: 'flex-start' as const,
  },
  rowFocused: {
    borderColor: t.primary,
    backgroundColor: t.primarySoftBg,
  },
  rowError: { borderColor: t.danger },
  icon: { marginRight: spacing.sm },
  accessory: { marginLeft: spacing.sm },
  input: {
    flex: 1,
    ...typography.body,
    color: t.textPrimary,
    paddingVertical: spacing.sm,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top' as const,
  },
  hint: {
    ...typography.caption,
    color: t.textMuted,
    marginTop: spacing.xxs,
  },
  error: {
    ...typography.caption,
    color: t.dangerText,
    marginTop: spacing.xxs,
  },
});

interface CrmTextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: React.ReactNode;
  /** Something to show at the right end of the field (e.g. an Apply button). */
  accessory?: React.ReactNode;
}

export const CrmTextField = forwardRef<React.ComponentRef<typeof TextInput>, CrmTextFieldProps>(
  function CrmTextFieldInner({ label, error, hint, icon, accessory, style, multiline, ...inputProps }, ref) {
    const { styles, theme } = useCrmStyles(factory);
    const [focused, setFocused] = useState(false);

    return (
      <View style={styles.container}>
        {!!label && <Text style={styles.label}>{label}</Text>}
        <View
          style={[
            styles.row,
            multiline && styles.rowMultiline,
            focused && styles.rowFocused,
            !!error && styles.rowError,
          ]}
        >
          {!!icon && <View style={styles.icon}>{icon}</View>}
          <TextInput
            ref={ref}
            {...inputProps}
            multiline={multiline}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, multiline && styles.inputMultiline, style]}
            onFocus={(e) => {
              setFocused(true);
              inputProps.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              inputProps.onBlur?.(e);
            }}
          />
          {!!accessory && <View style={styles.accessory}>{accessory}</View>}
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
    );
  },
);
