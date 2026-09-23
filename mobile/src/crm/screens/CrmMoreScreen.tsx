import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel, useUserRole } from '../../auth/role';
import { ChartIcon, ChevronRightIcon, LogoutIcon, PersonIcon, SettingsIcon } from '../../components/icons';
import type { AuthenticatedStackParamList } from '../../navigation/types';
import { radii, spacing, typography } from '../../theme';
import { initialsOf } from '../format';
import { useCrmStyles, type CrmTheme } from '../theme';
import { CrmScreen } from '../ui/CrmScreen';
import { StatusBadge } from '../ui/StatusBadge';

const factory = (t: CrmTheme) => ({
  title: { ...typography.display, color: t.textPrimary, marginBottom: spacing.md },
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: t.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...typography.title, color: t.textOnPrimary },
  name: { ...typography.subtitle, color: t.textPrimary },
  email: { ...typography.caption, color: t.textMuted, marginBottom: 4 },
  group: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowIconDanger: { backgroundColor: t.dangerBg },
  rowLabel: { flex: 1, ...typography.bodyMedium, color: t.textPrimary },
  rowLabelMuted: { color: t.textMuted },
  rowLabelDanger: { color: t.dangerText },
  shrink: { flexShrink: 1 },
});

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  soon?: boolean;
  danger?: boolean;
  divider?: boolean;
}

function MenuRow({ icon, label, onPress, soon, danger, divider }: MenuRowProps) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>{icon}</View>
      <Text style={[styles.rowLabel, soon && styles.rowLabelMuted, danger && styles.rowLabelDanger]}>{label}</Text>
      {soon ? (
        <View>
          <StatusBadge label="Soon" tone="neutral" dot={false} />
        </View>
      ) : (
        !danger && <ChevronRightIcon size={16} color={theme.textMuted} />
      )}
    </Pressable>
  );
}

export function CrmMoreScreen() {
  const navigation = useNavigation<NavigationProp<AuthenticatedStackParamList>>();
  const { user, logout } = useAuth();
  const role = useUserRole();
  const { styles, theme } = useCrmStyles(factory);
  const name = user?.name ?? 'Account';

  return (
    <CrmScreen>
      <Text style={styles.title}>More</Text>

      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
        </View>
        <View style={styles.shrink}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {!!user?.email && (
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          )}
          {role && <StatusBadge label={roleLabel(role)} tone="info" dot={false} />}
        </View>
      </View>

      <View style={styles.group}>
        <MenuRow
          icon={<PersonIcon size={18} color={theme.primary} />}
          label="Profile"
          onPress={() => navigation.navigate('Profile')}
        />
        <MenuRow icon={<SettingsIcon size={18} color={theme.textMuted} />} label="Settings" soon divider />
        <MenuRow icon={<ChartIcon size={18} color={theme.textMuted} />} label="Reports" soon divider />
      </View>

      <View style={styles.group}>
        <MenuRow
          icon={<LogoutIcon size={18} color={theme.dangerText} />}
          label="Sign out"
          danger
          onPress={() => {
            logout();
          }}
        />
      </View>
    </CrmScreen>
  );
}
