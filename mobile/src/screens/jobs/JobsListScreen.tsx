import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { JobCard } from '../../components/JobCard';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BriefcaseIcon } from '../../components/icons';
import { jobsApi, ApiError } from '../../api';
import { formatDate, isBeforeToday } from '../../utils/date';
import { colors, spacing, typography } from '../../theme';
import type { Job } from '../../types/job';
import type { AuthenticatedStackParamList, JobsListFilter, SupervisorTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

const TITLES: Record<JobsListFilter, string> = {
  all: 'Jobs',
  inProgress: 'In Progress',
  completed: 'Completed',
  created: 'Pending Work',
  overdue: 'Overdue Jobs',
};

const EMPTY_COPY: Record<JobsListFilter, { title: string; subtitle: string }> = {
  all: { title: 'No jobs yet', subtitle: "Jobs within your scope will show up here as soon as they're created." },
  inProgress: { title: 'Nothing in progress', subtitle: 'Jobs your team starts will show up here.' },
  completed: { title: 'No completed jobs yet', subtitle: 'Finished jobs will show up here.' },
  created: { title: 'No pending work', subtitle: "You're all caught up." },
  overdue: { title: 'No overdue jobs', subtitle: 'Nothing is past its due date.' },
};

/**
 * Reused as-is by Supervisor's "Jobs" tab (Admin no longer reaches this
 * screen - see RoleTabs) and, via the optional `filter` param, by every
 * Supervisor Home stat-card drill-down. Each filter mirrors the exact
 * definition GET /api/dashboard/summary's SQL already uses
 * (backend/src/routes/dashboard.routes.js), computed here client-side over
 * the same GET /api/jobs list the unfiltered "Jobs" tab already shows -
 * this is what keeps a Home stat's count and its drill-down list in
 * agreement, since both read the same rows the same way.
 */
export function JobsListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<SupervisorTabParamList, 'Jobs'>>();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<JobsListFilter>(route.params?.filter ?? 'all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await jobsApi.listJobs();
      setJobs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tab screens stay mounted, so a fresh `filter` (a second stat-card tap)
  // needs to be re-applied on focus, not just read once at mount.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.filter) setFilter(route.params.filter);
    }, [route.params?.filter]),
  );

  const filteredJobs = useMemo(() => {
    if (!jobs) return null;
    switch (filter) {
      case 'inProgress':
        return jobs.filter((j) => j.status === 'IN_PROGRESS');
      case 'completed':
        return jobs.filter((j) => j.status === 'COMPLETED');
      case 'created':
        return jobs.filter((j) => j.status === 'CREATED');
      case 'overdue':
        // Deliberately only excludes COMPLETED, not CANCELED - mirrors the
        // backend's actual (buggy) SQL exactly: dashboard.routes.js filters
        // "status NOT IN ('COMPLETED','CANCELLED')", but the real jobs_status
        // enum spells it CANCELED (one L, see prisma/schema.prisma) - so
        // that clause can never match a canceled row and never excludes one
        // in practice. Reproducing that exactly (rather than the "correct"
        // version) is what keeps this list's count in agreement with the
        // Overdue stat card, which comes from that same SQL. See this
        // phase's final report for the backend bug this reveals.
        return jobs.filter((j) => isBeforeToday(j.dueDate) && j.status !== 'COMPLETED');
      case 'all':
      default:
        return jobs;
    }
  }, [jobs, filter]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/*
       * FlatList, not the shared ScreenContainer's ScrollView+map - this
       * screen's data (GET /api/jobs) is every job in an admin/supervisor's
       * whole scope, unbounded and un-paginated server-side. A ScrollView
       * mounts every JobCard at once regardless of what's actually visible;
       * for an org with hundreds of jobs that's hundreds of live
       * Pressable/StatusBadge trees sitting in memory permanently. FlatList
       * only keeps what's near the viewport mounted, recycling the rest -
       * same data, same filtering, same visual result, far less memory for
       * exactly the accounts most likely to have a long list.
       */}
      <FlatList
        data={filteredJobs ?? []}
        keyExtractor={(job) => job.id}
        renderItem={({ item: job }) => (
          <JobCard
            code={job.code}
            title={job.title}
            site={job.companyname ?? job.site ?? undefined}
            address={job.address}
            when={job.next_visit_date ? formatDate(job.next_visit_date) : formatDate(job.dueDate)}
            status={job.status}
            onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <Text style={styles.title}>{TITLES[filter]}</Text>
            {!!error && <Banner message={error} variant="error" />}
            {filteredJobs === null && !error && (
              <View>
                <Skeleton height={110} radius={16} style={styles.skeletonCard} />
                <Skeleton height={110} radius={16} style={styles.skeletonCard} />
                <Skeleton height={110} radius={16} style={styles.skeletonCard} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          filteredJobs && filteredJobs.length === 0 ? (
            <EmptyState
              icon={<BriefcaseIcon size={32} color={colors.textMuted} />}
              title={EMPTY_COPY[filter].title}
              subtitle={EMPTY_COPY[filter].subtitle}
            />
          ) : undefined
        }
        // Keeps the recycling window small rather than the RN default (21
        // screens' worth) - this list's rows are relatively heavy (icons,
        // status pill, multi-line address), so a tighter window is the
        // actual memory win, not just virtualization existing in principle.
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
});
