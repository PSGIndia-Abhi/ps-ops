import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlossyBadge } from './GlossyBadge';
import { ChevronRightIcon } from './icons';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface RichActionTileProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** A large, low-opacity decorative icon in the corner - purely visual, not a second real icon with meaning. */
  ghostIcon: React.ReactNode;
  accentColor: string;
  onPress: () => void;
  /** No spacing/flex baked in (a 2-up grid needs `flex:1`, a stacked list needs `marginBottom`) - each caller says which. */
  style?: StyleProp<ViewStyle>;
  badgeSize?: number;
}

/**
 * A tinted-gradient action tile - a glossy circular icon badge, a large
 * translucent "ghost" icon and soft color wave in the corner for depth,
 * and a divider + circular chevron button on the right. Originated on the
 * Technician dashboard's Quick Access tiles; promoted here once Profile's
 * "Change password"/"Sign out" rows needed the identical treatment, rather
 * than duplicating it a second time.
 */
export function RichActionTile({
  title,
  description,
  icon,
  ghostIcon,
  accentColor,
  onPress,
  style,
  badgeSize = 48,
}: RichActionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: `${accentColor}12` },
        style,
        pressed && styles.tilePressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.wave, { backgroundColor: `${accentColor}26` }]} />
      <View style={styles.ghostWrap}>{ghostIcon}</View>

      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          <GlossyBadge color={accentColor} icon={icon} size={badgeSize} />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: `${accentColor}33` }]} />
        <View style={styles.chevronBtn}>
          <ChevronRightIcon size={16} color={accentColor} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  tilePressed: {
    opacity: 0.85,
  },
  wave: {
    position: 'absolute',
    bottom: -30,
    right: -30,
    width: 90,
    height: 90,
    borderRadius: 999,
  },
  ghostWrap: {
    position: 'absolute',
    top: -16,
    right: -12,
    opacity: 0.16,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCol: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  divider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.sm,
  },
  chevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  description: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
});
