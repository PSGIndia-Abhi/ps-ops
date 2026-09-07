import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from './BrandMark';
import { BellIcon, MenuIcon, PersonIcon } from './icons';
import { notificationsApi } from '../api';
import { colors, radii, spacing, typography } from '../theme';

interface AppHeaderProps {
  userName: string;
  roleLabel: string;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
  /** Optional left-side entry point into the role's secondary-options menu (the "More" tab). */
  onMorePress?: () => void;
}

/**
 * The one header shared by every role's dashboard: brand mark, the signed-in
 * user's name + role, a real unread-notification indicator, and a profile
 * entry point - deliberately compact, it should never dominate the screen
 * the way the login intro does.
 *
 * No fake avatar photo: without a real profile picture the brief asks for a
 * professional person icon instead of a generic initials circle, so that's
 * what this renders.
 *
 * The unread count refetches every time this screen regains focus (not just
 * on mount) - so the badge updates correctly after visiting Notifications
 * and reading something there, without any cross-component state plumbing.
 */
export function AppHeader({
  userName,
  roleLabel,
  onProfilePress,
  onNotificationsPress,
  onMorePress,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

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
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      {!!onMorePress && (
        <Pressable
          onPress={onMorePress}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, styles.moreButton, pressed && styles.avatarPressed]}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <MenuIcon size={18} color={colors.textSecondary} />
        </Pressable>
      )}

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
          <BellIcon size={19} color={colors.textSecondary} />
          {!!unreadCount && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={onProfilePress}
          hitSlop={8}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <PersonIcon size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    marginRight: spacing.sm,
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
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: {
    opacity: 0.75,
  },
});
