import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { EmptyState } from '../../components/EmptyState';
import { CheckCircleIcon } from '../../components/icons';
import { useUserRole } from '../../auth/role';
import { colors, spacing, typography } from '../../theme';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & TechnicianTabParamList>;

/**
 * The bottom-tab "More" destination - a real secondary-options menu, not a
 * second route to Profile (that's the header's avatar now - see AppHeader's
 * onMorePress vs onProfilePress). Content is role-aware: only rows that lead
 * somewhere real are shown (no "Settings"/"Help" placeholders - nothing like
 * that exists in the app yet, and this project's own convention throughout
 * has been to never ship a screen-shaped dead end).
 */
export function MoreScreen() {
  const role = useUserRole();
  const navigation = useNavigation<Nav>();
  const isTechnician = role === 'technician';
  const canManageOrg = role === 'admin' || role === 'branch_admin';

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <Text style={styles.title}>More</Text>

      {isTechnician && (
        <>
          <Text style={styles.sectionTitle}>Work</Text>
          <ListRow
            title="My Performance"
            subtitle="Today's work and completed totals"
            leadingInitial="P"
            onPress={() => navigation.navigate('MyPerformance')}
          />
          <ListRow
            title="Completed Jobs"
            subtitle="Jobs you've finished"
            leadingInitial="C"
            onPress={() => navigation.navigate('MyJobs', { initialTab: 'completed' })}
          />
        </>
      )}

      {canManageOrg && (
        <>
          <Text style={styles.sectionTitle}>Manage</Text>
          <ListRow
            title="Companies"
            subtitle="Companies, sites, and groups"
            leadingInitial="C"
            onPress={() => navigation.navigate('Companies')}
          />
          <ListRow
            title="Groups"
            subtitle="Company organization groups"
            leadingInitial="G"
            onPress={() => navigation.navigate('Groups')}
          />
        </>
      )}

      {!isTechnician && !canManageOrg && (
        <EmptyState
          icon={<CheckCircleIcon size={28} color={colors.textMuted} />}
          title="Nothing else here yet"
          subtitle="Your profile and account options are available from the icon at the top right."
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
});
