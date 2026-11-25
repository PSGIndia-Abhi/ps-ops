/**
 * 4pt spacing scale. Keep all layout spacing on this scale so density stays
 * consistent across every screen.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Minimum touch target per Android accessibility guidance (48dp).
 */
export const touchTarget = {
  minHeight: 48,
} as const;
