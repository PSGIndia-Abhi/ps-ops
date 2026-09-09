import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState } from '../../components/EmptyState';
import { CheckCircleIcon } from '../../components/icons';
import { useUserRole } from '../../auth/role';
import { colors, spacing, typography } from '../../theme';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & TechnicianTabParamList>;

/**
 * The bottom-tab "More" destination - a real secondary-options menu, not a
 * second route to Profile (that's the header's avatar - see AppHeader's
 * onProfilePress). This is now the *only* entry point into this screen -
 * AppHeader used to also have a left-side menu button that opened the exact
 * same destination, which was just a redundant second way in; removed.
 * Content is role-aware: only rows that lead
 * somewhere real are shown (no "Settings"/"Help" placeholders - nothing like
 * that exists in the app yet, and this project's own convention throughout
 * has been to never ship a screen-shaped dead end).
 *
 * Mobile is Technician/Supervisor only (see RoleTabs) - there is no
 * Admin/branch_admin "Manage" section here anymore; that org-management
 * surface stays on the web app. "My Performance" isn't listed here either -
 * it's a first-class bottom tab now (see TechnicianTabNavigator), so a
 * second row leading to the exact same screen would just be a redundant
 * way in, the same reason the old header hamburger was removed.
 */
export function MoreScreen() {
  const role = useUserRole();
  const navigation = useNavigation<Nav>();
  const isTechnician = role === 'technician';

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <Text style={styles.title}>More</Text>

      {isTechnician ? (
        <>
          <SectionHeader title="Work" />
          <ListRow
            title="Completed Jobs"
            subtitle="Jobs you've finished"
            leadingIcon={<CheckCircleIcon size={18} color={colors.primaryPressed} />}
            onPress={() => navigation.navigate('MyJobs', { filter: 'completed' })}
          />
        </>
      ) : (
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
});
