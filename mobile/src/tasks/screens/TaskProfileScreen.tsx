import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { ChevronRightIcon, LockIcon, LogoutIcon, UsersIcon } from '../../components/icons';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import { isActive, isOverdue } from '../format';
import { useTasks } from '../TasksContext';
import { Avatar, ScreenHeader } from '../ui/parts';
import { Sheet } from '../ui/sheets';

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
  statValue: { ...typography.title, color: t.textPrimary },
  statLabel: { ...typography.caption, color: t.textMuted },
  group: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
  },
  groupHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, padding: spacing.md, paddingBottom: spacing.xs },
  groupTitle: { ...typography.bodyMedium, color: t.textPrimary },
  member: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  memberName: { ...typography.bodyMedium, color: t.textPrimary },
  memberRole: { ...typography.caption, color: t.textMuted },
  count: {
    minWidth: 30,
    textAlign: 'center' as const,
    ...typography.captionMedium,
    color: t.primary,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden' as const,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 56, paddingHorizontal: spacing.md, gap: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowIconDanger: { backgroundColor: t.dangerBg },
  rowLabel: { flex: 1, ...typography.bodyMedium, color: t.textPrimary },
  rowLabelDanger: { color: t.dangerText },
  memberPad: { paddingBottom: spacing.sm },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** Profile (opened from the avatar on Home) - the viewer's own numbers, their team, password and sign out. */
export function TaskProfileScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { user, logout } = useAuth();
  const { viewer, tasks } = useTasks();
  const [confirmOut, setConfirmOut] = useState(false);

  const stats = useMemo(() => {
    const mine = tasks.filter((x) => x.assigned_to === viewer.id);
    return {
      active: mine.filter(isActive).length,
      done: mine.filter((x) => x.status === 'COMPLETED').length,
      overdue: mine.filter(isOverdue).length,
    };
  }, [tasks, viewer.id]);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
      </SafeAreaView>
      <CrmScreen edges={[]}>

      <View style={styles.profile}>
        <Avatar name={viewer.name} id={viewer.id} size={56} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {viewer.name}
          </Text>
          {!!user?.email && (
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          )}
          {!!viewer.role && <StatusBadge label={viewer.role} tone="info" dot={false} />}
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

      {viewer.team.length > 0 && (
        <View style={[styles.group, styles.memberPad]}>
          <View style={styles.groupHead}>
            <UsersIcon size={18} color={theme.primary} />
            <Text style={styles.groupTitle}>My team · {viewer.team.length}</Text>
          </View>
          {viewer.team.map((m) => (
            <View key={m.id} style={styles.member}>
              <Avatar name={m.name} id={m.id} size={36} />
              <View style={styles.flex}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberRole}>{[m.designation || m.role, m.is_direct ? 'Direct report' : null].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={styles.count}>{tasks.filter((x) => x.assigned_to === m.id && isActive(x)).length}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.group}>
        <Pressable onPress={() => navigation.navigate('ChangePassword')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <View style={styles.rowIcon}>
            <LockIcon size={18} color={theme.primary} />
          </View>
          <Text style={styles.rowLabel}>Change password</Text>
          <ChevronRightIcon size={16} color={theme.textMuted} />
        </Pressable>
        <Pressable onPress={() => setConfirmOut(true)} style={({ pressed }) => [styles.row, styles.rowDivider, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <View style={[styles.rowIcon, styles.rowIconDanger]}>
            <LogoutIcon size={18} color={theme.dangerText} />
          </View>
          <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Sign out</Text>
        </Pressable>
      </View>

      <Sheet visible={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?">
        <Text style={styles.sheetText}>You’ll need to sign in again to see your tasks.</Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Stay" variant="secondary" style={styles.flex} onPress={() => setConfirmOut(false)} />
          <PrimaryButton label="Sign out" variant="brand" style={styles.flex} onPress={() => logout()} />
        </View>
      </Sheet>
      </CrmScreen>
    </View>
  );
}
