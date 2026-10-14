import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { displayRole, roleLabel, useRawRole, useUserRole } from '../../auth/role';
import { BellIcon, CalendarIcon, ChartIcon, ChevronRightIcon, ClockIcon, LogoutIcon, PersonIcon, SettingsIcon } from '../../components/icons';
import type { LeadStackParamList } from '../../leads/navigation';
import { radii, spacing, typography } from '../../theme';
import { initialsOf } from '../format';
import { useCrmStyles, type CrmTheme } from '../theme';
import { CrmScreen } from '../ui/CrmScreen';
import { StatusBadge } from '../ui/StatusBadge';
import { ClipboardListIcon } from '../ui/crmIcons';
import { useAppSwitch } from '../../navigation/AppSwitchContext';

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
  // The lead screens live on whichever stack hosts this screen (CRM or Lead Management).
  const leadNavigation = useNavigation<NavigationProp<LeadStackParamList>>();
  const { user, logout } = useAuth();
  const role = useUserRole();
  const rawRole = useRawRole();
  const { styles, theme } = useCrmStyles(factory);
  const name = user?.name ?? 'Account';
  // A Managing Director / Personal Assistant in the Sales app keeps their own role name;
  // lead roles such as "commercial_sales" read as "Commercial Sales".
  const roleText = role ? roleLabel(role) : displayRole(rawRole);
  // Telecallers verify leads by phone: no site visits, no sales performance numbers.
  const telecaller = (rawRole ?? '').toLowerCase().trim() === 'telecaller';
  // Lead roles also have Task Management (and MD / PA the Sales app).
  const { canSwitch, current, openSwitcher } = useAppSwitch();

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
          {!!roleText && <StatusBadge label={roleText} tone="info" dot={false} />}
        </View>
      </View>

      <View style={styles.group}>
        <MenuRow
          icon={<PersonIcon size={18} color={theme.primary} />}
          label="Profile"
          onPress={() => leadNavigation.navigate('LeadProfile')}
        />
        <MenuRow icon={<SettingsIcon size={18} color={theme.textMuted} />} label="Settings" soon divider />
      </View>

      {canSwitch && (
        <View style={styles.group}>
          <MenuRow
            icon={<ClipboardListIcon size={18} color={theme.primary} />}
            label={current === 'leads' ? 'Task Management' : 'Switch app'}
            onPress={() => openSwitcher()}
          />
        </View>
      )}

      <View style={styles.group}>
        <MenuRow
          icon={<BellIcon size={18} color={theme.primary} />}
          label="Reminders"
          onPress={() => leadNavigation.navigate('LeadReminders')}
        />
        {!telecaller && (
          <MenuRow
            icon={<CalendarIcon size={18} color={theme.primary} />}
            label="My meetings"
            divider
            onPress={() => leadNavigation.navigate('LeadMeetings')}
          />
        )}
        <MenuRow
          icon={<ClockIcon size={18} color={theme.primary} />}
          label="Today's follow-ups"
          divider
          onPress={() => leadNavigation.navigate('LeadTasks')}
        />
        {!telecaller && (
          <MenuRow
            icon={<ChartIcon size={18} color={theme.primary} />}
            label="My performance"
            divider
            onPress={() => leadNavigation.navigate('LeadPerformance')}
          />
        )}
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
