import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useRawRole } from '../../auth/role';
import { ChevronRightIcon, LockIcon, LogoutIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { Avatar, ScreenHeader } from '../../tasks/ui/parts';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { useReminders } from '../RemindersContext';

// Same layout as Task Management's profile (tasks/screens/TaskProfileScreen.tsx).
const factory = (t: CrmTheme) => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: t.background },
  profile: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  name: { ...typography.subtitle, color: t.textPrimary },
  email: { ...typography.caption, color: t.textMuted, marginBottom: 4 },
  stats: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, alignItems: 'center' as const, borderRadius: radii.lg, paddingVertical: spacing.md },
  statValue: { ...typography.title },
  statLabel: { ...typography.caption, color: t.textMuted },
  group: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 56, paddingHorizontal: spacing.md, gap: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowIconDanger: { backgroundColor: t.dangerBg },
  rowLabel: { flex: 1, ...typography.bodyMedium, color: t.textPrimary },
  rowLabelDanger: { color: t.dangerText },
  pressed: { opacity: 0.7 },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** Profile (opened from the avatar's "View profile") - the accountant's reminder numbers, password and sign out. */
export function ReminderProfileScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { user, logout } = useAuth();
  const rawRole = useRawRole();
  const { userId, userName, reminders } = useReminders();
  const [confirmOut, setConfirmOut] = useState(false);
  const role = rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : '';

  const stats = useMemo(
    () => ({
      active: reminders.filter((r) => r.active).length,
      done: reminders.filter((r) => r.status === 'COMPLETED').length,
      overdue: reminders.filter((r) => r.active && r.display_status === 'OVERDUE').length,
    }),
    [reminders],
  );

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
      </SafeAreaView>
      <CrmScreen edges={[]}>
        <View style={styles.profile}>
          <Avatar name={userName} id={userId} size={56} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {userName}
            </Text>
            {!!user?.email && (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            )}
            {!!role && <StatusBadge label={role} tone="info" dot={false} />}
          </View>
        </View>

        <View style={styles.stats}>
          {(
            [
              ['Active', stats.active, theme.primary],
              ['Completed', stats.done, theme.success],
              ['Overdue', stats.overdue, theme.danger],
            ] as const
          ).map(([label, value, color]) => (
            <View key={label} style={[styles.stat, { backgroundColor: `${color}1F` }]}>
              <Text style={[styles.statValue, { color }]}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.group}>
          <Pressable onPress={() => navigation.navigate('ChangePassword')} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.rowIcon}>
              <LockIcon size={18} color={theme.primary} />
            </View>
            <Text style={styles.rowLabel}>Change password</Text>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>
          <Pressable onPress={() => setConfirmOut(true)} style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]} accessibilityRole="button">
            <View style={[styles.rowIcon, styles.rowIconDanger]}>
              <LogoutIcon size={18} color={theme.dangerText} />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Sign out</Text>
          </Pressable>
        </View>

        <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?">
          <Text style={styles.sheetText}>You’ll need to sign in again to see your reminders.</Text>
          <View style={styles.sheetButtons}>
            <PrimaryButton label="Stay" variant="secondary" style={styles.flex} onPress={() => setConfirmOut(false)} />
            <PrimaryButton label="Sign out" variant="brand" style={styles.flex} onPress={() => logout()} />
          </View>
        </Sheet>
      </CrmScreen>
    </View>
  );
}
