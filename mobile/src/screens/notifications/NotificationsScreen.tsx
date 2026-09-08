import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BellIcon } from '../../components/icons';
import { notificationsApi, ApiError } from '../../api';
import { formatDate, formatTime, isToday } from '../../utils/date';
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
    // Mirrors the web app's exact order (frontend/src/hooks/useNotifications.js
    // markAsRead + components/NotificationsMenu.jsx handleNotificationClick):
    // mark-as-read is awaited BEFORE navigating, and local state only ever
    // flips to read once the backend actually confirms it - never
    // optimistically before that, since this account's role may not have
    // permission to update it (see notificationsApi.markNotificationRead's
    // doc comment) and showing "read" for something that didn't actually
    // persist would be exactly the kind of fake success this app avoids
    // elsewhere. A failure here (permission or network) still lets the
    // technician open the job - not being able to view their job because a
    // notification couldn't be marked read would be a worse outcome than a
    // notification staying (correctly) unread.
    if (!notification.is_read) {
      try {
        await notificationsApi.markNotificationRead(notification.id);
        setNotifications((prev) =>
          prev ? prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)) : prev,
        );
      } catch {
        // Leave it unread - the list already reflects the real backend
        // state, and a toast here would just be noise on every tap for an
        // account without permission (see the "Mark all as read" banner,
        // which does surface this once explicitly instead).
      }
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
      if (err instanceof ApiError && err.status === 403) {
        setError("Your account doesn't have permission to do this yet. Contact your admin.");
      } else {
        setError(err instanceof ApiError ? err.message : 'Unable to mark notifications as read.');
      }
    } finally {
      setMarkingAllRead(false);
    }
  }

  const hasUnread = !!notifications?.some((n) => !n.is_read);

  // Real, already-available data (created_at) grouped by calendar day -
  // purely a presentation grouping, not a second fetch or a new field.
  const { todayGroup, earlierGroup } = useMemo(() => {
    if (!notifications) return { todayGroup: [], earlierGroup: [] };
    const t: AppNotification[] = [];
    const e: AppNotification[] = [];
    for (const n of notifications) (isToday(n.created_at) ? t : e).push(n);
    return { todayGroup: t, earlierGroup: e };
  }, [notifications]);

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

      {!!error && (
        <Banner
          message={error}
          variant={error.includes('session') || error.includes('permission') ? 'permission' : 'error'}
        />
      )}

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
        <>
          {todayGroup.length > 0 && (
            <>
              <SectionHeader title="Today" />
              {todayGroup.map((n) => (
                <NotificationRow key={n.id} notification={n} onPress={() => handleOpen(n)} />
              ))}
            </>
          )}
          {earlierGroup.length > 0 && (
            <>
              <SectionHeader title="Earlier" />
              {earlierGroup.map((n) => (
                <NotificationRow key={n.id} notification={n} onPress={() => handleOpen(n)} />
              ))}
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
