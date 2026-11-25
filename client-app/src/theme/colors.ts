/**
 * BestServe mobile color tokens.
 *
 * Derived from the existing web app's actual design language (not invented):
 *  - Primary action blue (#2563EB) is the dominant interactive color across
 *    frontend/src (buttons, links, progress bars, active states).
 *  - Brand crest red/blue (#BD2727 / #008DD2) come from the BestServe puzzle-piece
 *    logo and the existing login screen gradient (frontend/src/assets/auth.css).
 *  - Neutral scale and semantic status colors mirror frontend/src/styles/job.css
 *    and admin.css so job/visit status pills feel identical to the web app.
 */

export const palette = {
  white: '#FFFFFF',
  black: '#000000',

  // Neutral scale (matches frontend --text/--muted/--border/--bg tokens)
  ink900: '#111827',
  ink700: '#374151',
  ink500: '#6B7280',
  ink400: '#9CA3AF',
  ink200: '#E5E7EB',
  ink100: '#F3F4F6',
  ink50: '#F6F7FB',

  // Primary — the app's functional action color (buttons, links, focus)
  primary700: '#1D4ED8',
  primary600: '#2563EB',
  primary500: '#3B82F6',
  primary100: '#DBEAFE',
  primary50: '#EFF6FF',

  // Brand crest — used for the launch/splash identity moment only
  crestRed: '#BD2727',
  crestRedDeep: '#8F1D1D',
  crestBlue: '#008DD2',

  // Semantic status (mirrors job/visit status pills on web)
  success600: '#16A34A',
  success700: '#166534',
  successBg: '#DCFCE7',

  warning600: '#F59E0B',
  warning700: '#92400E',
  warningBg: '#FEF3C7',

  danger600: '#DC2626',
  danger700: '#B91C1C',
  dangerBg: '#FEE2E2',

  info700: '#0369A1',
  infoBg: '#E0F2FE',

  // Accent — a fifth semantic color for things that aren't status/severity
  // (Performance's Quick Access tile) so it doesn't have to borrow `danger`
  // just to be visually distinct from the other three tiles' blue/amber/green.
  accent600: '#7C3AED',
  accent700: '#5B21B6',
  accentBg: '#EDE9FE',
} as const;

export const colors = {
  background: palette.ink50,
  surface: palette.white,
  surfaceAlt: palette.ink100,
  border: palette.ink200,

  textPrimary: palette.ink900,
  textSecondary: palette.ink700,
  textMuted: palette.ink500,
  textOnPrimary: palette.white,
  textInverse: palette.white,

  primary: palette.primary600,
  primaryPressed: palette.primary700,
  primarySoft: palette.primary100,
  primarySoftBg: palette.primary50,

  crestRed: palette.crestRed,
  crestRedDeep: palette.crestRedDeep,
  crestBlue: palette.crestBlue,

  success: palette.success600,
  successText: palette.success700,
  successBg: palette.successBg,

  warning: palette.warning600,
  warningText: palette.warning700,
  warningBg: palette.warningBg,

  danger: palette.danger600,
  dangerText: palette.danger700,
  dangerBg: palette.dangerBg,

  info: palette.info700,
  infoBg: palette.infoBg,

  accent: palette.accent600,
  accentText: palette.accent700,
  accentBg: palette.accentBg,

  overlay: 'rgba(17, 24, 39, 0.45)',
  divider: palette.ink200,
} as const;

export type ColorToken = keyof typeof colors;
