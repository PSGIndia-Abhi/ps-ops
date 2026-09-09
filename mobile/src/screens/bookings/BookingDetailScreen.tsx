import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { JobCard } from '../../components/JobCard';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BriefcaseIcon } from '../../components/icons';
import { bookingsApi, ApiError } from '../../api';
import { formatDate } from '../../utils/date';
import { colors, radii, spacing, typography } from '../../theme';
import type { Booking } from '../../types/booking';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthenticatedStackParamList, 'BookingDetail'>;
type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

/**
 * The backend has no GET /api/bookings/:id - the same list endpoint used by
 * BookingsListScreen is the only source, so this screen finds its booking
 * within that list rather than inventing a per-booking endpoint.
 */
export function BookingDetailScreen({ route }: Props) {
  const { bookingId } = route.params;
  const navigation = useNavigation<Nav>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const bookings = await bookingsApi.listBookings();
        const found = bookings.find((b) => b.id === bookingId);
        if (!found) {
          setError('This booking could not be found.');
        }
        setBooking(found ?? null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setRefreshing(false);
      }
    },
    [bookingId],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!booking && !error) {
    return (
      <ScreenContainer edges={['bottom']}>
        <Skeleton height={28} width="60%" style={styles.skeletonGap} />
        <Skeleton height={100} radius={16} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['bottom']}>
      {!!error && <Banner message={error} variant="error" />}

      {!!booking && (
        <>
          <Text style={styles.code}>{booking.code}</Text>
          <Text style={styles.title}>{booking.company_name ?? booking.contact_name ?? 'Booking'}</Text>
          {!!booking.service_type && <Text style={styles.subtitle}>{booking.service_type}</Text>}

          <View style={styles.infoCard}>
            <Row label="Created" value={formatDate(booking.created_at)} />
            {!!booking.contact_name && <Row label="Requested by" value={booking.contact_name} />}
            {!!booking.contact_phone && <Row label="Phone" value={booking.contact_phone} />}
            {!!booking.company_site && <Row label="Site" value={booking.company_site} />}
          </View>

          <Text style={styles.sectionTitle}>Jobs</Text>
          {booking.jobs.length === 0 ? (
            <EmptyState
              icon={<BriefcaseIcon size={28} color={colors.textMuted} />}
              title="No jobs yet"
              subtitle="Jobs created from this booking will appear here."
            />
          ) : (
            booking.jobs.map((job) => (
              <JobCard
                key={job.id}
                code={job.code}
                title={job.sub_service}
                site={job.company_name ?? undefined}
                when={formatDate(job.start_date)}
                status={job.status}
                onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
              />
            ))
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonGap: {
    marginBottom: spacing.md,
  },
  code: {
    ...typography.overline,
    color: colors.textMuted,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.xxs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
    marginLeft: spacing.md,
    textAlign: 'right',
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
});
