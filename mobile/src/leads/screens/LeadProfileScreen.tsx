import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { displayRole, useRawRole } from '../../auth/role';
import { BriefcaseIcon, ChevronRightIcon, EmailIcon, LockIcon, LogoutIcon, PhoneIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { initials } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import { LeadTopBar as TopBar, LeadScreen } from '../ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const factory = (t: CrmTheme) => ({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  head: { alignItems: 'center' as const, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 4,
    borderColor: t.surface,
    ...t.raisedShadow,
  },
  avatarText: { ...typography.display, fontSize: 32, color: t.textOnPrimary },
  name: { ...typography.title, color: t.textPrimary, marginTop: spacing.md, textAlign: 'center' as const },
  role: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
  },
  roleText: { ...typography.captionMedium, color: t.primary },
  since: { ...typography.caption, color: t.textMuted, marginTop: spacing.sm },

  sectionTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xxs },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: spacing.lg,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingHorizontal: spacing.md, minHeight: 64 },
  divider: { borderTopWidth: 1, borderTopColor: t.border },
  pressed: { backgroundColor: t.surfaceAlt },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.primarySoftBg },
  iconDanger: { backgroundColor: t.dangerBg },
  rowText: { flex: 1, paddingVertical: spacing.sm },
  rowLabel: { ...typography.caption, color: t.textMuted },
  rowValue: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 1 },
  rowValueMuted: { color: t.textMuted, fontWeight: '400' as const },
  action: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  actionDanger: { color: t.dangerText },
});

/** "2026-10-08T05:12:00Z" -> "Oct 2026". */
function memberSince(at: string | undefined): string | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The signed-in person, for the sales apps: who they are, how to reach them, and the two account
 * actions (change password, sign out). Replaces the generic profile, which told these roles they
 * had no dashboard.
 */
export function LeadProfileScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { user, logout } = useAuth();
  const rawRole = useRawRole();
  const { styles, theme } = useCrmStyles(factory);

  const name = user?.name || 'BestServe user';
  const since = memberSince(user?.created_at);
  const branch = user?.branch_name || user?.branch?.name || '';

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need your email and password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Profile" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          {!!rawRole && (
            <View style={styles.role}>
              <Text style={styles.roleText}>{displayRole(rawRole)}</Text>
            </View>
          )}
          {!!since && <Text style={styles.since}>Member since {since}</Text>}
        </View>

        <Text style={styles.sectionTitle}>CONTACT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <EmailIcon size={18} color={theme.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {user?.email || '-'}
              </Text>
            </View>
          </View>
          <View style={[styles.row, styles.divider]}>
            <View style={styles.icon}>
              <PhoneIcon size={18} color={theme.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Phone</Text>
              <Text style={[styles.rowValue, !user?.phone && styles.rowValueMuted]}>{user?.phone || 'Not added'}</Text>
            </View>
          </View>
          {!!branch && (
            <View style={[styles.row, styles.divider]}>
              <View style={styles.icon}>
                <BriefcaseIcon size={18} color={theme.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Branch</Text>
                <Text style={styles.rowValue}>{branch}</Text>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => navigation.navigate('ChangePassword')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.icon}>
              <LockIcon size={18} color={theme.primary} />
            </View>
            <Text style={styles.action}>Change password</Text>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>
          <Pressable
            onPress={confirmSignOut}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, styles.divider, pressed && styles.pressed]}
          >
            <View style={[styles.icon, styles.iconDanger]}>
              <LogoutIcon size={18} color={theme.dangerText} />
            </View>
            <Text style={[styles.action, styles.actionDanger]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LeadScreen>
  );
}
