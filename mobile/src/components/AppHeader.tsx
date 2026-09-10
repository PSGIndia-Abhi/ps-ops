import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { BrandMark } from './BrandMark';
import { AvatarIcon, BellIcon } from './icons';
import { notificationsApi } from '../api';
import { colors, radii, shadows, spacing, typography } from '../theme';

interface AppHeaderProps {
  userName: string;
  roleLabel: string;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
}

/**
 * The one header shared by every role's dashboard: brand mark, the signed-in
 * user's name + role, a real unread-notification indicator, and a profile
 * entry point - deliberately compact, it should never dominate the screen
 * the way the login intro does.
 *
 * No left-side menu button anymore - it used to open the same secondary-
 * options screen the bottom tab bar's own "More" tab already opens, which
 * was a redundant second way to reach an identical destination. The bottom
 * tab is the one entry point now.
 *
 * No fake avatar photo: without a real profile picture, this renders a
 * fixed avatar glyph (not initials text) on the brand-colored circle - a
 * stable, recognizable "this is your profile" icon rather than text that
 * changes per account.
 *
 * The unread count refetches every time this screen regains focus (not just
 * on mount) - so the badge updates correctly after visiting Notifications
 * and reading something there, without any cross-component state plumbing.
 */
/**
 * A soft wave wash behind the brand mark - purely decorative (same spirit
 * as `BackgroundWash`/`GradientCard`'s glow accents elsewhere), sized via
 * onLayout rather than an SVG percentage string for the same reason every
 * other gradient fill in this app is: react-native-svg has no reliable
 * viewBox-less percentage sizing.
 */
function HeaderWave({ width, height }: { width: number; height: number }) {
  const gradId = useRef(`headerWave${Math.round(Math.random() * 1e6)}`).current;
  if (!width || !height) return null;
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.primarySoft} stopOpacity={0.6} />
          <Stop offset="1" stopColor={colors.primarySoft} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path
        d={`M0,0 L${width * 0.62},0 C${width * 0.48},${height * 0.55} ${width * 0.3},${height * 0.32} 0,${height} Z`}
        fill={`url(#${gradId})`}
      />
    </Svg>
  );
}

export function AppHeader({ userName, roleLabel, onProfilePress, onNotificationsPress }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      notificationsApi
        .getUnreadNotificationCount()
        .then((count) => {
          if (!cancelled) setUnreadCount(count);
        })
        .catch(() => {
          // A header badge failing to load isn't worth surfacing an error for -
          // it just quietly shows no badge.
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={[styles.outer, { marginTop: insets.top + spacing.xs }]}>
      <View style={styles.container} onLayout={onLayout}>
        {!!size && <HeaderWave width={size.width} height={size.height} />}
        <View style={styles.identity}>
          <BrandMark size={32} />
          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {userName}
            </Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onNotificationsPress}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.avatarPressed]}
            accessibilityRole="button"
            accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <BellIcon size={19} color={colors.primary} />
            {!!unreadCount && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={onProfilePress}
            hitSlop={8}
            style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <AvatarIcon size={19} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A floating rounded card (margin on every side, not edge-to-edge) rather
  // than the previous flat bar with a bottom border - the safe-area inset
  // is a margin here, not padding, specifically so the status bar area
  // shows the screen's own background instead of the header bleeding
  // behind it; that's what makes the top corners actually read as rounded
  // instead of being a rounded shape sitting flush against the screen edge.
  outer: {
    marginHorizontal: spacing.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.raised,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  textBlock: {
    flexShrink: 1,
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoftBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    marginTop: 2,
  },
  roleText: {
    ...typography.overline,
    fontSize: 10,
    color: colors.primaryPressed,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: {
    opacity: 0.75,
  },
});
