import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** 'flat' (border only, no shadow - dense list contexts) vs 'raised' (default - the app's one surface elevation). */
  variant?: 'raised' | 'flat';
  padded?: boolean;
}

/**
 * The one "surface card" every screen builds on - previously the exact same
 * `{ backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1,
 * borderColor: colors.border, ...shadows.card }` object was hand-copied into
 * a dozen screens' StyleSheets. Centralizing it here is what actually keeps
 * radius/shadow/border consistent app-wide instead of by convention alone.
 */
export function Card({ children, onPress, style, variant = 'raised', padded = true }: CardProps) {
  const base = [styles.base, padded && styles.padded, variant === 'raised' && shadows.card, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...base, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: {
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
});
