import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from './icons';
import { shadeColor } from '../utils/color';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface StatCardProps {
  label: string;
  value: number | string;
  /** Loading and "no data yet" both render a dash instead of a misleading 0. */
  isLoading?: boolean;
  icon?: React.ReactNode;
  /** Semantic accent (e.g. colors.danger for "Overdue") - defaults to a neutral surface. */
  accentColor?: string;
  /** When provided, the card becomes a real drill-down entry point (not a decorative number) - shows a chevron and navigates on tap. */
  onPress?: () => void;
  /** Persistent "this is the active filter" state (distinct from the transient pressed-opacity feedback) - draws an accent-colored border/tint instead of a chevron, for a card used as a toggle rather than a one-way drill-down. */
  selected?: boolean;
  /**
   * Opt-in richer "selected" look - an opaque, lightly-tinted background
   * (via shadeColor, never alpha - see the Android elevation+alpha shadow-
   * seam artifact noted below) plus a solid accent bar along the bottom
   * edge, instead of just the border. Off by default so every existing
   * caller (Supervisor dashboard, My Performance) keeps its current look;
   * only the technician work-queue's filter pills opt into it.
   */
  tintWhenSelected?: boolean;
}

/**
 * A small, meaningful summary number - never one of ten decorative cards.
 * `accentColor`/`icon` are optional so every stat card doesn't have to look
 * identical, without forcing every caller to specify them. When `onPress`
 * is given, the whole card becomes tappable (with a chevron hint) so a
 * count like "Today's jobs" can lead straight to the filtered list behind
 * it instead of being a dead-end statistic. `selected` is for the toggle
 * variant of that (e.g. the technician work-queue's Today/Pending/Tomorrow
 * filter row) - no chevron, since tapping doesn't navigate anywhere new.
 */
export function StatCard({
  label,
  value,
  isLoading,
  icon,
  accentColor,
  onPress,
  selected,
  tintWhenSelected,
}: StatCardProps) {
  const isTinted = !!(selected && accentColor && tintWhenSelected);
  const content = (
    <>
      {!!icon && (
        <View
          style={[
            styles.iconWrap,
            accentColor ? { backgroundColor: `${accentColor}1A` } : styles.iconWrapNeutral,
          ]}
        >
          {icon}
        </View>
      )}
      {!!onPress && !selected && (
        <View style={styles.chevron}>
          <ChevronRightIcon size={14} color={colors.textMuted} />
        </View>
      )}
      <Text style={[styles.value, accentColor ? { color: accentColor } : null]}>
        {isLoading ? '–' : value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {isTinted && <View style={[styles.underline, { backgroundColor: accentColor }]} />}
    </>
  );

  // Border only by default, deliberately no translucent background tint:
  // combined with this card's elevation (shadows.card), a semi-transparent
  // background makes Android render a visible rectangular shadow-seam
  // artifact under the content (an elevation + alpha-background
  // interaction) - a plain opaque border reads just as clearly as
  // "selected" without it. `tintWhenSelected` opts into a background too,
  // but via shadeColor (a real opaque lightened hex, never alpha), which
  // doesn't trigger that artifact.
  const selectedStyle =
    selected && accentColor
      ? [
          { borderColor: accentColor, borderWidth: 2 },
          isTinted && { backgroundColor: shadeColor(accentColor, 0.9) },
        ]
      : null;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, selectedStyle, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        accessibilityLabel={`${label}, ${isLoading ? 'loading' : value}`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.card, selectedStyle]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.7,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  chevron: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconWrapNeutral: {
    backgroundColor: colors.surfaceAlt,
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
