import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { EyeIcon, EyeOffIcon } from './icons';
import { colors, radii, spacing, touchTarget, typography } from '../theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  secureToggle?: boolean;
  /** Leading icon rendered inside the input, before the text (e.g. an email or lock glyph). */
  icon?: React.ReactNode;
}

export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(
  function TextFieldInner(
    { label, error, secureToggle, secureTextEntry, icon, style, ...inputProps },
    ref,
  ) {
  const [isFocused, setIsFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecure = secureToggle ? !revealed : secureTextEntry;

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          isFocused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        {!!icon && <View style={styles.leadingIcon}>{icon}</View>}
        <TextInput
          ref={ref}
          {...inputProps}
          secureTextEntry={isSecure}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setIsFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            inputProps.onBlur?.(e);
          }}
        />
        {secureToggle && (
          <Pressable
            onPress={() => setRevealed((prev) => !prev)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={styles.toggle}
          >
            {revealed ? (
              <EyeOffIcon size={20} color={colors.textMuted} />
            ) : (
              <EyeIcon size={20} color={colors.textMuted} />
            )}
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
  },
);

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.minHeight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  inputRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoftBg,
  },
  inputRowError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  toggle: {
    paddingLeft: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xxs,
  },
});
