import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { CalendarIcon } from '../../components/icons';
import { bookingsApi, ApiError } from '../../api';
import { formatDate } from '../../utils/date';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { Booking } from '../../types/booking';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

export function BookingsListScreen() {
  const navigation = useNavigation<Nav>();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await bookingsApi.listBookings();
      setBookings(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bookings</Text>
        <Pressable onPress={() => navigation.navigate('CreateBooking')} hitSlop={8}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {!!error && <Banner message={error} variant="error" />}

      {bookings === null && !error ? (
        <View>
          <Skeleton height={84} radius={16} style={styles.skeletonCard} />
          <Skeleton height={84} radius={16} style={styles.skeletonCard} />
        </View>
      ) : bookings && bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={32} color={colors.textMuted} />}
          title="No upcoming bookings"
          subtitle="New bookings within your scope will appear here."
        />
      ) : (
        bookings?.map((booking) => (
          <Pressable
            key={booking.id}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() =>
              !booking.id.startsWith('UNBOOKED-') &&
              navigation.navigate('BookingDetail', { bookingId: booking.id })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.code} numberOfLines={1}>
                {booking.code}
              </Text>
              <Text style={styles.date}>{formatDate(booking.created_at)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {booking.company_name ?? booking.contact_name ?? 'Booking'}
            </Text>
            {!!booking.service_type && (
              <Text style={styles.service} numberOfLines={1}>
                {booking.service_type}
              </Text>
            )}
            <Text style={styles.jobCount}>
              {booking.jobs.length} {booking.jobs.length === 1 ? 'job' : 'jobs'}
            </Text>
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
  addLink: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xxs,
  },
  code: {
    ...typography.overline,
    color: colors.textMuted,
    flexShrink: 1,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  service: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  jobCount: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
