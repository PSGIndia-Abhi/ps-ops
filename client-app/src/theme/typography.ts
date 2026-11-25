import { Platform } from 'react-native';

/**
 * Type scale. Uses the platform system font (Roboto on Android) rather than
 * bundling a custom webfont — keeps the app lean and native-feeling while the
 * weight/size rhythm below carries the brand's visual hierarchy.
 */
const fontFamily = Platform.select({
  android: 'sans-serif',
  default: undefined,
});

const fontFamilyMedium = Platform.select({
  android: 'sans-serif-medium',
  default: undefined,
});

export const typography = {
  display: {
    fontFamily: fontFamilyMedium,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: fontFamilyMedium,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: fontFamilyMedium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  body: {
    fontFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontFamily: fontFamilyMedium,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  captionMedium: {
    fontFamily: fontFamilyMedium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  overline: {
    fontFamily: fontFamilyMedium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  button: {
    fontFamily: fontFamilyMedium,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700' as const,
  },
} as const;

export type TypographyToken = keyof typeof typography;
