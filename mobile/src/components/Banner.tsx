import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AlertCircleIcon, CheckCircleIcon, WifiOffIcon } from './icons';
import { colors, radii, spacing, typography } from '../theme';

export type BannerVariant =
  | 'success'
  | 'error'
  | 'network'
  | 'validation'
  | 'permission'
  | 'loading';

interface BannerProps {
  message: string;
  variant?: BannerVariant;
}

const VARIANT_STYLE: Record<
  BannerVariant,
  { bg: string; text: string; icon?: (color: string) => React.ReactNode }
> = {
  success: {
    bg: colors.successBg,
    text: colors.successText,
    icon: (color) => <CheckCircleIcon size={18} color={color} />,
  },
  error: {
    bg: colors.dangerBg,
    text: colors.dangerText,
    icon: (color) => <AlertCircleIcon size={18} color={color} />,
  },
  network: {
    bg: colors.dangerBg,
    text: colors.dangerText,
    icon: (color) => <WifiOffIcon size={18} color={color} />,
  },
  validation: {
    bg: colors.warningBg,
    text: colors.warningText,
    icon: (color) => <AlertCircleIcon size={18} color={color} />,
  },
  permission: {
    bg: colors.surfaceAlt,
    text: colors.textSecondary,
    icon: (color) => <AlertCircleIcon size={18} color={color} />,
  },
  loading: {
    bg: colors.primarySoftBg,
    text: colors.primaryPressed,
  },
};

/**
 * The one feedback surface reused everywhere: form-level API errors (Login),
 * validation notices, permission-denied responses, success confirmations,
 * and inline "doing something right now" states. One visual language, five
 * meanings - callers only choose a `variant`, never a raw color.
 */
export function Banner({ message, variant = 'error' }: BannerProps) {
  const style = VARIANT_STYLE[variant];

  return (
    <View style={[styles.container, { backgroundColor: style.bg }]}>
      {variant === 'loading' ? (
        <ActivityIndicator size="small" color={style.text} />
      ) : (
        style.icon?.(style.text)
      )}
      <Text style={[styles.text, { color: style.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  text: {
    ...typography.captionMedium,
    flexShrink: 1,
  },
});
