import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { AppHeader } from '../../components/AppHeader';
import { StatCard } from '../../components/StatCard';
import { QuickAction } from '../../components/QuickAction';
import { ProgressBar } from '../../components/ProgressBar';
import { ScheduleRow } from '../../components/ScheduleRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
} from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel, useUserRole } from '../../auth/role';
import { dashboardApi, jobsApi, teamsApi, ApiError } from '../../api';
import { formatTime, getGreeting } from '../../utils/date';
import { summarizeTodaysOperations, type TodaysOperationsSummary } from '../../utils/todaysOperations';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { DashboardSummary } from '../../types/dashboard';
import type { ShiftTechniciansResponse } from '../../types/team';
import type { AdminTabParamList, AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & AdminTabParamList>;

export function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const role = useUserRole();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState<TodaysOperationsSummary | null>(null);
  const [shifts, setShifts] = useState<ShiftTechniciansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [summaryData, jobs, shiftData] = await Promise.all([
        dashboardApi.fetchDashboardSummary(),
        jobsApi.listJobs(),
        teamsApi.getShiftStatusByTechnician(),
      ]);
      setSummary(summaryData);
      setToday(summarizeTodaysOperations(jobs));
      setShifts(shiftData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overdue = summary?.calendar.overdue ?? 0;
  const pendingWork = summary?.status.created ?? 0;
  const showNeedsAttention = !!summary && (overdue > 0 || pendingWork > 0);

  const scheduleJobs = [...(today?.jobs ?? [])].sort((a, b) => {
    const timeA = new Date(a.next_visit_date ?? a.dueDate ?? 0).getTime();
    const timeB = new Date(b.next_visit_date ?? b.dueDate ?? 0).getTime();
    return timeA - timeB;
  });
  const nextJobId = scheduleJobs.find((j) => j.status !== 'COMPLETED')?.id;

  const totalTechnicians = shifts ? shifts.online.length + shifts.offline.length : null;

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
        <Text style={styles.subtitle}>Here's what's happening across your operations.</Text>

        {!!error && <Banner message={error} variant="error" />}

        {/* Today's Operations */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroValue}>{today ? today.total : '–'}</Text>
              <Text style={styles.heroLabel}>Jobs today</Text>
            </View>
            <View style={styles.heroPercentWrap}>
              <Text style={styles.heroPercent}>{today ? `${today.percentComplete}%` : '–'}</Text>
              <Text style={styles.heroPercentLabel}>progress</Text>
            </View>
          </View>
          <ProgressBar percent={today?.percentComplete ?? 0} />
          {!!today && today.total > 0 && (
            <Text style={styles.heroBreakdown}>
              {today.completed} Completed · {today.inProgress} In progress · {today.pending} Pending
            </Text>
          )}
        </View>

        {/* Status Overview */}
        <Text style={styles.sectionTitle}>Status overview</Text>
        <View style={styles.statGrid}>
          <View style={styles.statRow}>
            <StatCard
              label="Total jobs"
              value={summary?.total ?? 0}
              isLoading={!summary}
              icon={<BriefcaseIcon size={16} color={colors.primary} />}
              accentColor={colors.primary}
            />
            <StatCard
              label="In progress"
              value={summary?.status.inProgress ?? 0}
              isLoading={!summary}
              icon={<ClockIcon size={16} color={colors.info} />}
              accentColor={colors.info}
            />
          </View>
          <View style={styles.statRow}>
            <StatCard
              label="Completed"
              value={summary?.status.completed ?? 0}
              isLoading={!summary}
              icon={<CheckCircleIcon size={16} color={colors.success} />}
              accentColor={colors.success}
            />
            <StatCard
              label="Overdue"
              value={overdue}
              isLoading={!summary}
              icon={<AlertTriangleIcon size={16} color={colors.danger} />}
              accentColor={colors.danger}
            />
          </View>
        </View>

        {/* Needs Attention */}
        {showNeedsAttention && (
          <>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <View style={styles.attentionRow}>
              {overdue > 0 && (
                <View style={[styles.attentionCard, { backgroundColor: colors.dangerBg }]}>
                  <Text style={[styles.attentionValue, { color: colors.dangerText }]}>{overdue}</Text>
                  <Text style={[styles.attentionLabel, { color: colors.dangerText }]}>Overdue jobs</Text>
                </View>
              )}
              {pendingWork > 0 && (
                <View style={[styles.attentionCard, { backgroundColor: colors.warningBg }]}>
                  <Text style={[styles.attentionValue, { color: colors.warningText }]}>{pendingWork}</Text>
                  <Text style={[styles.attentionLabel, { color: colors.warningText }]}>Pending work</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Quick Access */}
        <Text style={styles.sectionTitle}>Quick access</Text>
        <View style={styles.quickActionRow}>
          <QuickAction
            label="Jobs"
            icon={<BriefcaseIcon size={20} color={colors.primary} />}
            onPress={() => navigation.navigate('Jobs')}
          />
          <QuickAction
            label="Team"
            icon={<UsersIcon size={20} color={colors.primary} />}
            onPress={() => navigation.navigate('TeamOverview')}
          />
          <QuickAction
            label="Bookings"
            icon={<CalendarIcon size={20} color={colors.primary} />}
            onPress={() => navigation.navigate('Bookings')}
          />
        </View>

        {/* Team Snapshot */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Team snapshot</Text>
          <Text style={styles.viewAll} onPress={() => navigation.navigate('TeamOverview')}>
            View all →
          </Text>
        </View>
        {shifts === null && !error ? (
          <Skeleton height={72} radius={16} style={styles.skeletonGap} />
        ) : (
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotTotal}>
              {totalTechnicians} {totalTechnicians === 1 ? 'Technician' : 'Technicians'}
            </Text>
            <View style={styles.snapshotRow}>
              <View style={styles.snapshotItem}>
                <View style={[styles.snapshotDot, { backgroundColor: colors.success }]} />
                <Text style={styles.snapshotText}>{shifts?.online.length ?? 0} On shift</Text>
              </View>
              <View style={styles.snapshotItem}>
                <View style={[styles.snapshotDot, { backgroundColor: colors.textMuted }]} />
                <Text style={styles.snapshotText}>{shifts?.offline.length ?? 0} Off shift</Text>
              </View>
            </View>
          </View>
        )}

        {/* Today's Schedule */}
        <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Today's schedule</Text>
        {today === null && !error ? (
          <Skeleton height={130} radius={16} />
        ) : scheduleJobs.length === 0 ? (
          <EmptyState
            icon={<BriefcaseIcon size={28} color={colors.textMuted} />}
            title="No jobs scheduled today"
            subtitle="You're all caught up for today."
          />
        ) : (
          <View style={styles.scheduleCard}>
            {scheduleJobs.map((job, index) => (
              <ScheduleRow
                key={job.id}
                time={formatTime(job.next_visit_date ?? job.dueDate)}
                site={job.companyname ?? job.site ?? job.title}
                jobType={job.title}
                technicianName={job.team[0]?.name ?? job.supervisor?.name}
                status={job.status}
                isNext={job.id === nextJobId}
                isLast={index === scheduleJobs.length - 1}
                onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
              />
            ))}
          </View>
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  heroValue: {
    ...typography.display,
    color: colors.textPrimary,
  },
  heroLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  heroPercentWrap: {
    alignItems: 'flex-end',
  },
  heroPercent: {
    ...typography.title,
    color: colors.primary,
  },
  heroPercentLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  heroBreakdown: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  sectionTitleSpaced: {
    marginTop: spacing.lg,
  },
  statGrid: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  attentionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  attentionCard: {
    flex: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  attentionValue: {
    ...typography.title,
  },
  attentionLabel: {
    ...typography.captionMedium,
    marginTop: 2,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAll: {
    ...typography.captionMedium,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  skeletonGap: {
    marginBottom: spacing.xl,
  },
  snapshotCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  snapshotTotal: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  snapshotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  snapshotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  snapshotText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card,
  },
});
