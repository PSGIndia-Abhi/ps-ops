import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StatCard } from '../../components/StatCard';
import { Banner } from '../../components/Banner';
import { BriefcaseIcon, CheckCircleIcon, ClockIcon } from '../../components/icons';
import { visitsApi, dashboardApi, ApiError } from '../../api';
import { isToday } from '../../utils/date';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';

/**
 * The dedicated "My Performance" destination from the More menu - the exact
 * same two real, technician-scoped API calls Home's compact "My work"
 * section already uses (GET /api/visits/my, GET /api/dashboard/summary),
 * just given room to breathe on their own screen. No new metrics invented -
 * see TechnicianDashboardScreen's doc comment for exactly why "today's
 * completed" and "this week" aren't shown anywhere in this app.
 */
export function MyPerformanceScreen() {
  const [visits, setVisits] = useState<TechnicianVisit[] | null>(null);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
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

    try {
      const summary = await dashboardApi.fetchDashboardSummary();
      setCompletedCount(summary.status.completed);
      setTotalCount(summary.total);
    } catch {
      setCompletedCount(null);
      setTotalCount(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todaysVisits = visits?.filter((v) => isToday(v.scheduled_date)) ?? null;
  const inProgressCount = todaysVisits?.filter((v) => v.status === 'IN_PROGRESS').length ?? 0;
  const pendingCount = todaysVisits ? todaysVisits.length - inProgressCount : 0;

  // 'top' included - this is now a bottom-tab screen (see
  // TechnicianTabNavigator), not a stack push, so there's no native header
  // above it to already consume that space.
  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>My Performance</Text>
      <Text style={styles.subtitle}>Your assigned work, at a glance.</Text>

      {!!error && <Banner message={error} variant="error" />}

      <Text style={styles.sectionTitle}>Today</Text>
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
        </View>
      </View>

      {(totalCount !== null || completedCount !== null) && (
        <>
          <Text style={styles.sectionTitle}>All time</Text>
          <View style={styles.statGrid}>
            <View style={styles.statRow}>
              {totalCount !== null && (
                <StatCard
                  label="Total assigned"
                  value={totalCount}
                  icon={<BriefcaseIcon size={16} color={colors.primary} />}
                  accentColor={colors.primary}
                />
              )}
              {completedCount !== null && (
                <StatCard
                  label="Completed"
                  value={completedCount}
                  icon={<CheckCircleIcon size={16} color={colors.success} />}
                  accentColor={colors.success}
                />
              )}
            </View>
          </View>
        </>
      )}

      {/* <View style={styles.noteCard}>
        <Text style={styles.noteText}>
          A weekly or "completed today" breakdown isn't shown here because the backend doesn't record
          when a visit was completed relative to today - these numbers only show what's genuinely
          available right now.
        </Text>
      </View> */}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
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
  noteCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  noteText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
