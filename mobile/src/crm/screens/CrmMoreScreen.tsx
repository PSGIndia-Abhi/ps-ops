import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { displayRole, roleLabel, useRawRole, useUserRole } from '../../auth/role';
import { ChartIcon, ChevronRightIcon, ClockIcon, LogoutIcon, PersonIcon, SettingsIcon } from '../../components/icons';
import type { LeadStackParamList } from '../../leads/navigation';
import { leadPersonaForRole } from '../../leads/stage';
import { GradientFill } from '../../leads/ui';
import { radii, spacing, typography } from '../../theme';
import { initialsOf } from '../format';
import { useCrmStyles, type CrmTheme } from '../theme';
import { CrmScreen } from '../ui/CrmScreen';
import { StatusBadge, toneColors, type Tone } from '../ui/StatusBadge';
import { ClipboardListIcon } from '../ui/crmIcons';
import { useAppSwitch, type AppKind } from '../../navigation/AppSwitchContext';

// The "More" tab of the sales apps (Commercial, Residential and CRM): who is signed in, in a
// coloured header, then the options in sections - each with its own colour icon and a one-line
// hint - and Sign out at the bottom.

/** The app names as the "Switch app" sheet shows them. */
const APP_NAMES: Record<AppKind, string> = {
  leads: 'Commercial Leads',
  residential: 'Residential Leads',
  tasks: 'Task Management',
  sales: 'Sales',
  reminders: 'Payment Reminders',
};

const factory = (t: CrmTheme) => ({
  title: { ...typography.display, color: t.textPrimary, marginBottom: spacing.md },

  hero: { borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden' as const, ...t.raisedShadow },
  heroRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  avatarRing: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center' as const, justifyContent: 'center' as const },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.title, color: '#1D4ED8' },
  heroBody: { flex: 1, minWidth: 0 },
  name: { ...typography.title, color: '#fff' },
  email: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: spacing.sm },
  chip: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  chipText: { ...typography.caption, fontWeight: '600' as const, color: '#fff' },

  section: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.border },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...typography.bodyMedium, color: t.textPrimary },
  rowLabelMuted: { color: t.textMuted },
  rowHint: { ...typography.caption, color: t.textMuted, marginTop: 1 },

  signOut: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: t.danger,
    backgroundColor: t.dangerBg,
    marginBottom: spacing.lg,
  },
  signOutText: { ...typography.button, color: t.dangerText },
  pressed: { opacity: 0.7 },
});

interface MenuRowProps {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  tone: Tone;
  label: string;
  hint?: string;
  onPress?: () => void;
  soon?: boolean;
  divider?: boolean;
}

function MenuRow({ icon: Icon, tone, label, hint, onPress, soon, divider }: MenuRowProps) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, soon ? 'neutral' : tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>
        <Icon size={20} color={fg} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, soon && styles.rowLabelMuted]} numberOfLines={1}>
          {label}
        </Text>
        {!!hint && (
          <Text style={styles.rowHint} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      {soon ? <StatusBadge label="Soon" tone="neutral" dot={false} /> : <ChevronRightIcon size={16} color={theme.textMuted} />}
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
  // lead roles such as "sales_manager" read as "Sales Manager".
  const roleText = role ? roleLabel(role) : displayRole(rawRole);
  // Telecallers verify leads by phone: no site visits, no sales performance numbers.
  const telecaller = (rawRole ?? '').toLowerCase().trim() === 'telecaller';
  // Lead roles also have Task Management (and MD / PA the Sales app; sales executives and managers
  // their Residential app). In the Residential app, meetings and sales numbers are not part of the work.
  const { canSwitch, current, openSwitcher } = useAppSwitch();
  const residentialApp = current === 'residential';
  const manager = leadPersonaForRole(rawRole) === 'sales_manager' && !residentialApp;
  const performance = !telecaller && !residentialApp;
  const openProfile = () => leadNavigation.navigate('LeadProfile');

  // The Work section, in order; dividers go between the rows that are shown.
  const work: Omit<MenuRowProps, 'divider'>[] = [];
  if (residentialApp) {
    // The Residential app's follow-ups and reminders, in one place (as the Commercial app's tab).
    work.push({
      icon: ClockIcon,
      tone: 'warning',
      label: 'Follow-ups',
      hint: 'Calls and reminders that are due',
      onPress: () => leadNavigation.navigate('LeadFollowUpsList', { leadType: 'consumer' }),
    });
  } /* Commercial: follow-ups and reminders are in the Follow-ups tab. */
  if (manager) {
    work.push({
      icon: ChartIcon,
      tone: 'accent',
      label: 'Team report & targets',
      hint: 'Leaderboard, targets and team visits',
      onPress: () => leadNavigation.navigate('LeadTeam'),
    });
  }
  if (performance) {
    work.push({
      icon: ChartIcon,
      tone: 'success',
      label: 'My performance',
      hint: 'Your leads, meetings and wins',
      onPress: () => leadNavigation.navigate('LeadPerformance'),
    });
  }

  return (
    <CrmScreen>
      <Text style={styles.title}>More</Text>

      {/* Who is signed in */}
      <View style={styles.hero}>
        <GradientFill from="#3B82F6" to="#1D4ED8" />
        <View style={styles.heroRow}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(name)}</Text>
            </View>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {!!user?.email && (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            )}
            <View style={styles.chips}>
              {!!roleText && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{roleText}</Text>
                </View>
              )}
              {canSwitch && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{APP_NAMES[current]}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {work.length > 0 && (
        <>
          <Text style={styles.section}>WORK</Text>
          <View style={styles.group}>
            {work.map((row, i) => (
              <MenuRow key={row.label} {...row} divider={i > 0} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.section}>ACCOUNT & APP</Text>
      <View style={styles.group}>
        <MenuRow icon={PersonIcon} tone="info" label="Profile" hint="Your details and contact" onPress={openProfile} />
        {canSwitch && (
          <MenuRow
            icon={ClipboardListIcon}
            tone="accent"
            label="Switch app"
            hint={`Now in ${APP_NAMES[current]}`}
            divider
            onPress={() => openSwitcher()}
          />
        )}
        <MenuRow icon={SettingsIcon} tone="neutral" label="Settings" hint="Notifications, theme and more" soon divider />
      </View>

      <Pressable
        onPress={() => {
          logout();
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <LogoutIcon size={18} color={theme.dangerText} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </CrmScreen>
  );
}
