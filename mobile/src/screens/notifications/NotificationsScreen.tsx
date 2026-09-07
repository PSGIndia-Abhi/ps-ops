import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BellIcon } from '../../components/icons';
import { notificationsApi, ApiError } from '../../api';
import { formatDate, formatTime } from '../../utils/date';
import { colors, radii, spacing, typography } from '../../theme';
import type { AppNotification } from '../../types/notification';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

export function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setNotifications(await notificationsApi.listNotifications());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Your session has expired. Please sign in again.');
      } else if (err instanceof ApiError && err.isNetworkError) {
        setError('Unable to connect. Check your connection and try again.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleOpen(notification: AppNotification) {
    // Mark read first (best-effort - if this fails, still let the user
    // navigate; a stale "unread" flag on one item isn't worth blocking on).
    if (!notification.is_read) {
      setNotifications((prev) =>
        prev ? prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)) : prev,
      );
      notificationsApi.markNotificationRead(notification.id).catch(() => {
        // swallow - the list will show the correct state again on next load
      });
    }

    if (notification.entity_type === 'job' && notification.entity_id) {
      navigation.navigate('JobDetail', { jobId: notification.entity_id });
    }
  }

  async function handleMarkAllRead() {
    setMarkingAllRead(true);
    try {
      await notificationsApi.markAllNotificationsRead();
      setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, is_read: true })) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to mark notifications as read.');
    } finally {
      setMarkingAllRead(false);
    }
  }

  const hasUnread = !!notifications?.some((n) => !n.is_read);

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>
        {hasUnread && (
          <Pressable onPress={handleMarkAllRead} disabled={markingAllRead} hitSlop={8}>
            <Text style={styles.markAllLink}>{markingAllRead ? 'Marking...' : 'Mark all as read'}</Text>
          </Pressable>
        )}
      </View>

      {!!error && <Banner message={error} variant={error.includes('session') ? 'permission' : 'error'} />}

      {!notifications && !error ? (
        <View>
          <Skeleton height={70} radius={12} style={styles.skeletonRow} />
          <Skeleton height={70} radius={12} style={styles.skeletonRow} />
          <Skeleton height={70} radius={12} style={styles.skeletonRow} />
        </View>
      ) : !notifications ? null : notifications.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={28} color={colors.textMuted} />}
          title="No notifications"
          subtitle="You're all caught up. New updates will appear here."
        />
      ) : (
        notifications.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={() => handleOpen(notification)}
            style={({ pressed }) => [
              styles.row,
              !notification.is_read && styles.rowUnread,
              pressed && styles.rowPressed,
            ]}
          >
            {!notification.is_read && <View style={styles.unreadDot} />}
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, !notification.is_read && styles.rowTitleUnread]} numberOfLines={2}>
                {notification.title || 'Notification'}
              </Text>
              {!!notification.message && (
                <Text style={styles.rowMessage} numberOfLines={3}>
                  {notification.message}
                </Text>
              )}
              <Text style={styles.rowTime}>
                {formatDate(notification.created_at)} · {formatTime(notification.created_at)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  markAllLink: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  skeletonRow: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowUnread: {
    backgroundColor: colors.primarySoftBg,
    borderColor: colors.primarySoft,
  },
  rowPressed: {
    opacity: 0.85,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  rowTitleUnread: {
    color: colors.textPrimary,
  },
  rowMessage: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
