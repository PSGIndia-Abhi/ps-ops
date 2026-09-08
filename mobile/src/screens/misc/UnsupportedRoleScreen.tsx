import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { AlertCircleIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * Shown instead of a dashboard for any signed-in role this mobile app
 * doesn't have a mobile experience for - admin/branch_admin (business
 * decision: the Android app is Technician/Supervisor only, admin work stays
 * on the web app - see roleBasePath.js routing branch_admin to the same
 * "/admin" experience as admin on web, which is why it's grouped with admin
 * here rather than treated as a supervisor-equivalent role) and any other
 * role the app has never had a dashboard for (client, temporary_worker).
 *
 * Deliberately not a silent blank screen or a reused Profile screen - a
 * clear explanation plus the one action available (sign out), so nobody
 * gets stuck looking at an empty tab.
 */
export function UnsupportedRoleScreen() {
  const { logout } = useAuth();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <AlertCircleIcon size={32} color={colors.textMuted} />
        </View>
        <Text style={styles.title}>Not available on mobile</Text>
        <Text style={styles.subtitle}>
          BestServe Mobile is available for Technician and Supervisor accounts. Please use the web
          application for admin tasks.
        </Text>
        <Button label="Sign out" variant="secondary" onPress={logout} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  button: {
    minWidth: 160,
  },
});
