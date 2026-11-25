import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { colors, shadows } from '../theme';

/**
 * The CRM's light/dark palette. Light is the existing app palette verbatim
 * (same brand blue/red, same neutrals) so the CRM looks like the same
 * product; dark is a matching set derived from those same brand tokens.
 *
 * Kept separate from `src/theme` on purpose: every existing screen and shared
 * component reads the static light `colors` object, so making the CRM dark-
 * aware here means the Technician/Supervisor screens are never touched.
 */
export interface CrmTheme {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryPressed: string;
  primarySoftBg: string;
  primarySoft: string;
  crestRed: string;
  success: string;
  successText: string;
  successBg: string;
  warning: string;
  warningText: string;
  warningBg: string;
  danger: string;
  dangerText: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  accent: string;
  accentText: string;
  accentBg: string;
  overlay: string;
  cardShadow: ViewStyle;
  raisedShadow: ViewStyle;
}

const lightTheme: CrmTheme = {
  isDark: false,
  background: colors.background,
  surface: colors.surface,
  surfaceAlt: colors.surfaceAlt,
  border: colors.border,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  textOnPrimary: colors.textOnPrimary,
  primary: colors.primary,
  primaryPressed: colors.primaryPressed,
  primarySoftBg: colors.primarySoftBg,
  primarySoft: colors.primarySoft,
  crestRed: colors.crestRed,
  success: colors.success,
  successText: colors.successText,
  successBg: colors.successBg,
  warning: colors.warning,
  warningText: colors.warningText,
  warningBg: colors.warningBg,
  danger: colors.danger,
  dangerText: colors.dangerText,
  dangerBg: colors.dangerBg,
  info: colors.info,
  infoBg: colors.infoBg,
  accent: colors.accent,
  accentText: colors.accentText,
  accentBg: colors.accentBg,
  overlay: colors.overlay,
  cardShadow: shadows.card as ViewStyle,
  raisedShadow: shadows.raised as ViewStyle,
};

const darkTheme: CrmTheme = {
  isDark: true,
  background: '#0B1220',
  surface: '#131C2E',
  surfaceAlt: '#1B2740',
  border: '#26344F',
  textPrimary: '#F3F4F6',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  primary: '#3B82F6',
  primaryPressed: '#60A5FA',
  primarySoftBg: 'rgba(59, 130, 246, 0.16)',
  primarySoft: 'rgba(59, 130, 246, 0.35)',
  crestRed: '#D93636',
  success: '#22C55E',
  successText: '#4ADE80',
  successBg: 'rgba(34, 197, 94, 0.16)',
  warning: '#F59E0B',
  warningText: '#FBBF24',
  warningBg: 'rgba(245, 158, 11, 0.16)',
  danger: '#EF4444',
  dangerText: '#F87171',
  dangerBg: 'rgba(239, 68, 68, 0.16)',
  info: '#38BDF8',
  infoBg: 'rgba(56, 189, 248, 0.16)',
  accent: '#A78BFA',
  accentText: '#C4B5FD',
  accentBg: 'rgba(167, 139, 250, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  // Shadows barely read on dark surfaces; the card border carries the edge.
  cardShadow: {},
  raisedShadow: {},
};

/** Follows the device's light/dark setting. */
export function useCrmTheme(): CrmTheme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/**
 * Builds a StyleSheet from the current theme. `factory` must be a module-scope
 * function so the sheet is only rebuilt when the theme actually flips.
 */
export function useCrmStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(
  factory: (theme: CrmTheme) => T,
): { styles: T; theme: CrmTheme } {
  const theme = useCrmTheme();
  const styles = useMemo(() => StyleSheet.create(factory(theme)), [factory, theme]);
  return { styles, theme };
}
