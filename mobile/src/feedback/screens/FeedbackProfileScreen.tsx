import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { useRawRole } from '../../auth/role';
import { ChevronRightIcon, LockIcon, LogoutIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { Avatar } from '../../tasks/ui/parts';
import { SwapIcon } from '../../tasks/ui/taskIcons';
import { HeroHeader } from '../Hero';
import { Sheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';

// Same layout as Payment Reminders' profile (reminders/screens/ReminderProfileScreen.tsx).
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
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  name: { ...typography.subtitle, color: t.textPrimary },
  email: { ...typography.caption, color: t.textMuted, marginBottom: 4 },
  group: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' as const, marginBottom: spacing.lg },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 56, paddingHorizontal: spacing.md, gap: spacing.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowIconDanger: { backgroundColor: t.dangerBg },
  rowLabel: { flex: 1, ...typography.bodyMedium, color: t.textPrimary },
  rowLabelDanger: { color: t.dangerText },
  pressed: { opacity: 0.7 },
  switchCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.primary, padding: spacing.md, marginBottom: spacing.lg, ...t.cardShadow },
  switchIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

/** Profile: who is signed in, change password and sign out. */
export function FeedbackProfileScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { user, logout } = useAuth();
  const rawRole = useRawRole();
  const [confirmOut, setConfirmOut] = useState(false);
  const { canSwitch, openSwitcher } = useAppSwitch();
  const role = rawRole ? rawRole.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '';

  return (
    <View style={styles.screen}>
      <HeroHeader title="Profile" subtitle={user?.name} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]}>
        <View style={styles.profile}>
          <Avatar name={user?.name} id={user?.id} size={56} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name}
            </Text>
            {!!user?.email && (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            )}
            {!!role && <StatusBadge label={role} tone="info" dot={false} />}
          </View>
        </View>

        {canSwitch && (
          <Pressable onPress={() => openSwitcher()} style={({ pressed }) => [styles.switchCard, pressed && styles.pressed]} accessibilityRole="button">
            <View style={styles.switchIcon}>
              <SwapIcon size={20} color="#FFFFFF" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowLabel}>Switch app</Text>
              <Text style={styles.email}>Go to Task Management or your other apps</Text>
            </View>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>
        )}

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
          <Text style={styles.sheetText}>You’ll need to sign in again to see your feedback calls.</Text>
          <View style={styles.sheetButtons}>
            <PrimaryButton label="Stay" variant="secondary" style={styles.flex} onPress={() => setConfirmOut(false)} />
            <PrimaryButton label="Sign out" variant="brand" style={styles.flex} onPress={() => logout()} />
          </View>
        </Sheet>
      </CrmScreen>
    </View>
  );
}
