import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { JobCard } from '../../components/JobCard';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { BriefcaseIcon } from '../../components/icons';
import { jobsApi, ApiError } from '../../api';
import { formatDate } from '../../utils/date';
import { colors, spacing, typography } from '../../theme';
import type { Job } from '../../types/job';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

/**
 * Reused as-is by both Admin's and Supervisor's "Jobs" tab - the backend
 * already scopes GET /api/jobs per role/branch/team, so the same screen
 * legitimately shows different data for each without any client-side
 * role branching.
 */
export function JobsListScreen() {
  const navigation = useNavigation<Nav>();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>Jobs</Text>

      {!!error && <Banner message={error} variant="error" />}

      {jobs === null && !error ? (
        <View>
          <Skeleton height={110} radius={16} style={styles.skeletonCard} />
          <Skeleton height={110} radius={16} style={styles.skeletonCard} />
          <Skeleton height={110} radius={16} style={styles.skeletonCard} />
        </View>
      ) : jobs && jobs.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon size={32} color={colors.textMuted} />}
          title="No jobs yet"
          subtitle="Jobs within your scope will show up here as soon as they're created."
        />
      ) : (
        jobs?.map((job) => (
          <JobCard
            key={job.id}
            code={job.code}
            title={job.title}
            site={job.companyname ?? job.site ?? undefined}
            address={job.address}
            when={job.next_visit_date ? formatDate(job.next_visit_date) : formatDate(job.dueDate)}
            status={job.status}
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
