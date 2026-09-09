import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { RichActionTile } from '../../components/RichActionTile';
import { Banner } from '../../components/Banner';
import {
  AvatarIcon,
  EmailIcon,
  LockIcon,
  LogoutIcon,
  PersonIcon,
  PhoneIcon,
  SettingsIcon,
} from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { useUserRole, normalizeRole, roleLabel } from '../../auth/role';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { AuthenticatedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;

/**
 * Reached from AppHeader's avatar - a real identity/contact screen, not a
 * dashboard. Org-management (Companies/Groups) and Work shortcuts (My
 * Performance/Completed Jobs) now live in the "More" menu instead (see
 * MoreScreen) - this screen is deliberately just: who am I, how do I get
 * contacted, and my account. Also the fallback for a signed-in user whose
 * role has no dedicated dashboard (client, telecaller).
 *
 * "Change password"/"Sign out" reuse `RichActionTile` (the same gradient-
 * tile-with-ghost-icon treatment as the Technician dashboard's Quick
 * Access) rather than the plain `ListRow` these used before - promoted to
 * a shared component once a second screen wanted the identical look.
 *
 * No "Edit" on Contact yet - `PATCH /api/auth/me` already exists in
 * `api/auth.ts` (updateProfile) but nothing calls it anywhere in the app.
 * Wiring up a real edit sheet is a genuine small follow-up, not shown here
 * to avoid a link that does nothing.
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
          <AvatarIcon size={34} color={colors.textOnPrimary} />
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

      <View style={styles.sectionHeaderRow}>
        <PersonIcon size={14} color={colors.textMuted} />
        <Text style={styles.sectionTitle}>Contact</Text>
      </View>
      <View style={styles.contactCard}>
        <ContactRow
          icon={<EmailIcon size={17} color={colors.primary} />}
          accentColor={colors.primary}
          value={user?.email ?? '—'}
          label="Email address"
        />
        <View style={styles.contactDivider} />
        <ContactRow
          icon={<PhoneIcon size={17} color={colors.success} />}
          accentColor={colors.success}
          value={user?.phone ?? '—'}
          label="Phone number"
        />
      </View>

      <View style={styles.sectionHeaderRow}>
        <SettingsIcon size={14} color={colors.textMuted} />
        <Text style={styles.sectionTitle}>Account</Text>
      </View>
      <RichActionTile
        title="Change password"
        description="Keep your account secure"
        icon={<LockIcon size={20} color={colors.textOnPrimary} />}
        ghostIcon={<LockIcon size={56} color={colors.primary} />}
        accentColor={colors.primary}
        style={styles.accountTile}
        onPress={() => navigation.navigate('ChangePassword')}
      />
      <RichActionTile
        title="Sign out"
        description="See you soon!"
        icon={<LogoutIcon size={20} color={colors.textOnPrimary} />}
        ghostIcon={<LogoutIcon size={56} color={colors.danger} />}
        accentColor={colors.danger}
        style={styles.accountTile}
        onPress={logout}
      />
    </ScreenContainer>
  );
}

/** One Contact row - a colored icon circle + a two-line value/label stack, matching the reference exactly rather than the previous single-line icon+text. */
function ContactRow({
  icon,
  accentColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  accentColor: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.contactRow}>
      <View style={[styles.contactIconWrap, { backgroundColor: `${accentColor}1A` }]}>{icon}</View>
      <View style={styles.contactTextCol}>
        <Text style={styles.contactValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.contactLabel}>{label}</Text>
      </View>
    </View>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  contactIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTextCol: {
    flex: 1,
  },
  contactValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  contactLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  contactDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  accountTile: {
    marginBottom: spacing.sm,
  },
});
