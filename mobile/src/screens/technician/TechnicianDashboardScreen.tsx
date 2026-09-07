import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { AppHeader } from '../../components/AppHeader';
import { StatCard } from '../../components/StatCard';
import { JobCard } from '../../components/JobCard';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BriefcaseIcon, CheckCircleIcon, ClockIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel, useUserRole } from '../../auth/role';
import { visitsApi, dashboardApi, ApiError } from '../../api';
import { formatTime, getGreeting, isToday } from '../../utils/date';
import { colors, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & TechnicianTabParamList>;

/**
 * The most important screen in the app, by design the smallest: a
 * technician opens this dozens of times a day to answer one question -
 * "what do I need to do now?" No quick actions, no activity feed - just a
 * compact "My Work" summary and today's work, with the next thing to do
 * made obvious. Everything else (the fuller worklist, completed jobs)
 * lives one tap away on "My Jobs".
 *
 * "My Work" metrics - what's real and what isn't, and why:
 *  - Today's Jobs / In Progress / Pending come from GET /api/visits/my,
 *    filtered to today. That endpoint never returns COMPLETED/CANCELED
 *    visits (the backend excludes them outright), so there is no reliable
 *    way to compute "today's completed count" from it - showing one would
 *    mean guessing. Not shown.
 *  - Completed comes from GET /api/dashboard/summary, which the backend
 *    already scopes to this technician specifically (its SQL filters on
 *    `JSON_CONTAINS(j.team, JSON_QUOTE(?))` for role=technician) - a real,
 *    correctly-scoped all-time count of this technician's completed jobs,
 *    not "today's completed" (no field distinguishes when a job was
 *    completed, so a weekly/today breakdown for it can't be built
 *    honestly and isn't attempted). If this call fails (e.g. the
 *    technician's role isn't granted VIEW_ANALYTICS), the card is simply
 *    omitted rather than shown as a permanent placeholder.
 */
export function TechnicianDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const role = useUserRole();

  const [visits, setVisits] = useState<TechnicianVisit[] | null>(null);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setVisits(await visitsApi.listMyVisits());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }

    // Optional overlay stat - a failure here shouldn't block the rest of
    // the dashboard from loading (see the doc comment above).
    try {
      const summary = await dashboardApi.fetchDashboardSummary();
      setCompletedCount(summary.status.completed);
    } catch {
      setCompletedCount(null);
    }
  }, []);

  // Refetch every time Home regains focus (returning from JobDetail after
  // Start Visit, switching tabs and back, etc.) rather than only once on
  // mount - this is the actual bug fix: Home was showing stale visit
  // status because it never refetched after a status-changing action
  // elsewhere. Screen-focus-driven refresh, not a poll/interval - it only
  // runs when the user is actually looking at this screen again.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const todaysVisits = visits
    ? [...visits.filter((v) => isToday(v.scheduled_date))].sort(
        (a, b) => new Date(a.scheduled_date ?? 0).getTime() - new Date(b.scheduled_date ?? 0).getTime(),
      )
    : null;
  const inProgressCount = todaysVisits?.filter((v) => v.status === 'IN_PROGRESS').length ?? 0;
  const pendingCount = todaysVisits ? todaysVisits.length - inProgressCount : 0;
  const nextVisitId = todaysVisits?.find((v) => v.status !== 'IN_PROGRESS')?.id ?? todaysVisits?.[0]?.id;

  return (
    <View style={styles.flex}>
      <AppHeader
        userName={user?.name ?? ''}
        roleLabel={role ? roleLabel(role) : ''}
        onProfilePress={() => navigation.navigate('Profile')}
        onNotificationsPress={() => navigation.navigate('Notifications')}
        onMorePress={() => navigation.navigate('More')}
      />
      <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing}>
        <Text style={styles.greeting}>
          {getGreeting()}, {firstName(user?.name)}
        </Text>
        <Text style={styles.subtitle}>Here's your work for today.</Text>

        {!!error && <Banner message={error} variant="error" />}

        <Text style={styles.sectionTitle}>My work</Text>
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatCard
              label="Today's jobs"
              value={todaysVisits?.length ?? 0}
              isLoading={!todaysVisits}
              icon={<BriefcaseIcon size={16} color={colors.primary} />}
              accentColor={colors.primary}
            />
            <StatCard
              label="In progress"
              value={inProgressCount}
              isLoading={!todaysVisits}
              icon={<ClockIcon size={16} color={colors.info} />}
              accentColor={colors.info}
            />
          </View>
          <View style={styles.statRow}>
            <StatCard
              label="Pending today"
              value={pendingCount}
              isLoading={!todaysVisits}
              icon={<ClockIcon size={16} color={colors.warningText} />}
              accentColor={colors.warningText}
            />
            {completedCount !== null && (
              <StatCard
                label="Completed (all time)"
                value={completedCount}
                icon={<CheckCircleIcon size={16} color={colors.success} />}
                accentColor={colors.success}
              />
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Today's jobs</Text>

        {todaysVisits === null && !error ? (
          <View>
            <Skeleton height={130} radius={16} style={styles.skeletonCard} />
            <Skeleton height={130} radius={16} style={styles.skeletonCard} />
          </View>
        ) : todaysVisits === null ? null : todaysVisits.length === 0 ? (
          <EmptyState
            icon={<BriefcaseIcon size={32} color={colors.textMuted} />}
            title="No jobs assigned"
            subtitle="You're all caught up for now."
          />
        ) : (
          todaysVisits.map((visit) => (
            <JobCard
              key={visit.id}
              code={visit.job_code}
              title={visit.sub_service}
              site={visit.companyname ?? visit.sitename ?? undefined}
              address={visit.address}
              when={formatTime(visit.scheduled_date)}
              status={visit.status}
              actionLabel="View job"
              highlighted={visit.id === nextVisitId}
              onPress={() => navigation.navigate('JobDetail', { jobId: visit.job_id })}
            />
          ))
        )}
      </ScreenContainer>
    </View>
  );
}

function firstName(name: string | undefined): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  greeting: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  statGrid: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
});
