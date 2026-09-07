import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { JobCard } from '../../components/JobCard';
import { PillSelect } from '../../components/PillSelect';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BriefcaseIcon, CheckCircleIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { visitsApi, jobsApi, ApiError } from '../../api';
import { formatDate, formatTime } from '../../utils/date';
import { colors, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';
import type { Job } from '../../types/job';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;
type Tab = 'active' | 'completed';

/**
 * The full worklist behind the technician's Home "Today's jobs" preview,
 * split into Active (from GET /api/visits/my, unchanged from Phase 4) and
 * Completed.
 *
 * Completed can't come from /api/visits/my - that endpoint's own SQL
 * excludes COMPLETED/CANCELED visits outright, so a completed one is never
 * in its response no matter what. GET /api/jobs is the only endpoint that
 * does return completed jobs, but its scoping (buildScopeFilter) is
 * branch/company/site-based, not per-technician - it would return every
 * job in the technician's branch, not just their own. So this screen fetches
 * that list and filters it client-side to jobs whose real `team` array
 * (the same field the app already treats as authoritative for assignment
 * elsewhere) contains this technician's own id, before ever rendering
 * anything - no other technician's data is displayed.
 */
export function MyJobsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TechnicianTabParamList, 'MyJobs'>>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(route.params?.initialTab ?? 'active');

  const [visits, setVisits] = useState<TechnicianVisit[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [visitData, jobData] = await Promise.all([visitsApi.listMyVisits(), jobsApi.listJobs()]);
      setVisits(visitData);
      setJobs(jobData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Bottom-tab screens stay mounted across tab switches, so a fresh
  // `initialTab` param (e.g. tapping "Completed Jobs" from the More menu a
  // second time) needs to be re-applied on focus, not just read once at
  // mount via useState's initializer.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.initialTab) setTab(route.params.initialTab);
    }, [route.params?.initialTab]),
  );

  const completedJobs = useMemo(() => {
    if (!jobs || !user) return null;
    return jobs.filter(
      (job) => job.status === 'COMPLETED' && job.team.some((t) => String(t.id) === String(user.id)),
    );
  }, [jobs, user]);

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>My Jobs</Text>

      <PillSelect
        options={[
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!!error && <Banner message={error} variant="error" />}

      {tab === 'active' ? (
        !visits && !error ? (
          <View>
            <Skeleton height={130} radius={16} style={styles.skeletonCard} />
            <Skeleton height={130} radius={16} style={styles.skeletonCard} />
            <Skeleton height={130} radius={16} style={styles.skeletonCard} />
          </View>
        ) : !visits ? null : visits.length === 0 ? (
          <EmptyState
            icon={<BriefcaseIcon size={32} color={colors.textMuted} />}
            title="No jobs assigned"
            subtitle="You're all caught up for now."
          />
        ) : (
          visits.map((visit) => (
            <JobCard
              key={visit.id}
              code={visit.job_code}
              title={visit.sub_service}
              site={visit.companyname ?? visit.sitename ?? undefined}
              address={visit.address}
              when={
                visit.scheduled_date
                  ? `${formatDate(visit.scheduled_date)}, ${formatTime(visit.scheduled_date)}`
                  : undefined
              }
              status={visit.status}
              actionLabel="View job"
              onPress={() => navigation.navigate('JobDetail', { jobId: visit.job_id })}
            />
          ))
        )
      ) : !completedJobs && !error ? (
        <View>
          <Skeleton height={130} radius={16} style={styles.skeletonCard} />
          <Skeleton height={130} radius={16} style={styles.skeletonCard} />
        </View>
      ) : !completedJobs ? null : completedJobs.length === 0 ? (
        <EmptyState
          icon={<CheckCircleIcon size={32} color={colors.textMuted} />}
          title="No completed jobs yet"
          subtitle="Jobs you finish will show up here."
        />
      ) : (
        completedJobs.map((job) => (
          <JobCard
            key={job.id}
            code={job.code}
            title={job.title}
            site={job.companyname ?? job.site ?? undefined}
            address={job.address}
            when={formatDate(job.dueDate ?? job.start_date)}
            status={job.status}
            actionLabel="View job"
            onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
          />
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
});
