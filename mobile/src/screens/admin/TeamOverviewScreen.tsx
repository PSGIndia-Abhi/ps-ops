import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import { UsersIcon } from '../../components/icons';
import { teamsApi, ApiError } from '../../api';
import { colors, spacing, typography } from '../../theme';
import type { TeamOverview } from '../../types/team';

export function TeamOverviewScreen() {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await teamsApi.getTeamOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty =
    overview && overview.supervisors.length === 0 && overview.unassignedTechnicians.length === 0;

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['bottom']}>
      {!!error && <Banner message={error} variant="error" />}

      {overview === null && !error ? (
        <View>
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
          <Skeleton height={60} radius={12} style={styles.skeletonRow} />
        </View>
      ) : isEmpty ? (
        <EmptyState
          icon={<UsersIcon size={32} color={colors.textMuted} />}
          title="No team members yet"
          subtitle="Supervisors and technicians within your scope will appear here."
        />
      ) : (
        <>
          {overview?.supervisors.map((supervisor) => (
            <View key={supervisor.id} style={styles.group}>
              <Text style={styles.groupTitle}>{supervisor.name}</Text>
              <Text style={styles.groupSubtitle}>
                Supervisor · {supervisor.technicians.length}{' '}
                {supervisor.technicians.length === 1 ? 'technician' : 'technicians'}
              </Text>
              {supervisor.technicians.map((tech) => (
                <ListRow
                  key={tech.id}
                  leadingInitial={tech.name.charAt(0).toUpperCase()}
                  title={tech.name}
                  subtitle="Technician"
                />
              ))}
              {supervisor.technicians.length === 0 && (
                <Text style={styles.emptyGroup}>No technicians assigned yet.</Text>
              )}
            </View>
          ))}

          {!!overview?.unassignedTechnicians.length && (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Unassigned technicians</Text>
              {overview.unassignedTechnicians.map((tech) => (
                <ListRow
                  key={tech.id}
                  leadingInitial={tech.name.charAt(0).toUpperCase()}
                  title={tech.name}
                  subtitle="Technician"
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    marginBottom: spacing.xs,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  groupSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  emptyGroup: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xxs,
  },
});
