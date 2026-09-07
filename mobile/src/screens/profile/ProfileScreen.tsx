import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ListRow } from '../../components/ListRow';
import { Banner } from '../../components/Banner';
import { EmailIcon, PhoneIcon, LockIcon, LogoutIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { useUserRole, normalizeRole, roleLabel } from '../../auth/role';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Reached from AppHeader's avatar - a real identity/contact screen, not a
 * dashboard. Org-management (Companies/Groups) and Work shortcuts (My
 * Performance/Completed Jobs) now live in the "More" menu instead (see
 * MoreScreen) - this screen is deliberately just: who am I, how do I get
 * contacted, and my account. Also the fallback for a signed-in user whose
 * role has no dedicated dashboard (client, telecaller).
 */
export function ProfileScreen() {
  const { user, logout } = useAuth();
  const role = useUserRole();
  const navigation = useNavigation<Nav>();
  const name = user?.name ?? 'BestServe user';

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFor(name)}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{formatRoleLabel(user?.role)}</Text>
        </View>
      </View>

      {!role && (
        <Banner
          variant="permission"
          message="Your role doesn't have a dedicated dashboard in the app yet. You can still view your profile and sign out below."
        />
      )}

      <Text style={styles.sectionTitle}>Contact</Text>
      <View style={styles.contactCard}>
        <View style={styles.contactRow}>
          <EmailIcon size={17} color={colors.textMuted} />
          <Text style={styles.contactText} numberOfLines={1}>
            {user?.email ?? '—'}
          </Text>
        </View>
        <View style={styles.contactDivider} />
        <View style={styles.contactRow}>
          <PhoneIcon size={17} color={colors.textMuted} />
          <Text style={styles.contactText} numberOfLines={1}>
            {user?.phone ?? '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <ListRow
        title="Change password"
        trailing={<LockIcon size={18} color={colors.textMuted} />}
        onPress={() => navigation.navigate('ChangePassword')}
      />
      <ListRow
        title="Sign out"
        trailing={<LogoutIcon size={18} color={colors.dangerText} />}
        onPress={logout}
      />
    </ScreenContainer>
  );
}

function formatRoleLabel(role: string | undefined): string {
  if (!role) return '—';
  const known = normalizeRole(role);
  return known ? roleLabel(known) : role.charAt(0).toUpperCase() + role.slice(1);
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  avatarText: {
    ...typography.title,
    color: colors.textOnPrimary,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  rolePill: {
    alignSelf: 'center',
    backgroundColor: colors.primarySoftBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xxs,
  },
  roleText: {
    ...typography.overline,
    fontSize: 11,
    color: colors.primaryPressed,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  contactDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  contactText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
