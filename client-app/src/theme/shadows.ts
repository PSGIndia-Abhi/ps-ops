import { Platform } from 'react-native';

/**
 * Elevation tiers. Subtle by design — the brand uses soft, low-opacity
 * shadows (see frontend job-card / summary-card box-shadows), not heavy
 * skeuomorphic drop shadows.
 */
function elevation(android: number, iosOpacity: number, iosRadius: number, iosOffsetY: number) {
  return Platform.select({
    android: { elevation: android },
    default: {
      shadowColor: '#0F172A',
      shadowOpacity: iosOpacity,
      shadowRadius: iosRadius,
      shadowOffset: { width: 0, height: iosOffsetY },
    },
  });
}

export const shadows = {
  card: elevation(2, 0.06, 8, 2),
  raised: elevation(6, 0.1, 16, 6),
  floating: elevation(12, 0.16, 24, 10),
};
