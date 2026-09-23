import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Banner } from '../../components/Banner';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Skeleton } from '../../components/Skeleton';
import { jobsApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { colors, spacing, typography } from '../../theme';
import { computeTechnicianAchievements, type TechnicianAchievements } from './achievements';
import { PerformanceView } from './PerformanceView';

/**
 * "My Performance": the technician's level, journey, milestone medals and completion rate - all worked
 * out from their own job list (GET /api/jobs, the same call behind the Completed list), so it needs no
 * extra permission. The animations play every time the page is shown and after every refresh.
 */
export function MyPerformanceScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  // `undefined` = loading, `null` = the job list could not be read.
  const [achievements, setAchievements] = useState<TechnicianAchievements | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [replay, setReplay] = useState(0);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const jobs = await jobsApi.listJobs();
        setAchievements(userId ? computeTechnicianAchievements(jobs, userId) : null);
        if (isRefresh) setReplay(k => k + 1);
      } catch {
        setAchievements(null);
      } finally {
        setRefreshing(false);
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      setReplay(k => k + 1);
      load();
    }, [load]),
  );

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <Text style={styles.title}>My Performance</Text>
      <Text style={styles.subtitle}>Your level, badges and progress.</Text>

      {achievements === undefined ? (
        <View>
          <Skeleton height={220} radius={24} style={styles.gap} />
          <Skeleton height={130} radius={24} style={styles.gap} />
          <Skeleton height={130} radius={24} style={styles.gap} />
        </View>
      ) : achievements === null ? (
        <Banner message="We couldn't load your performance. Pull down to try again." variant="error" />
      ) : (
        <PerformanceView achievements={achievements} replayKey={replay} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  gap: { marginBottom: spacing.md },
});
