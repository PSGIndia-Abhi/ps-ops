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
import { toneColors, type Tone } from '../ui/StatusBadge';
import { GlossyBadge } from '../../components/GlossyBadge';
import { APP_VERSION } from '../../config/appVersion';
import { ClipboardListIcon } from '../ui/crmIcons';
import { useAppSwitch, type AppKind } from '../../navigation/AppSwitchContext';
import { useTicketsTab } from '../../feedback/ticketsTabContext';
import { useHelpRow } from '../../helpdesk/useHelpRow';

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
  feedback: 'Customer Feedback',
};

const factory = (t: CrmTheme) => ({
  title: { ...typography.display, color: t.textPrimary, marginBottom: spacing.md },

  // Who is signed in
  hero: { borderRadius: 24, padding: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden' as const, ...t.raisedShadow },
  heroBubbleA: { position: 'absolute' as const, width: 180, height: 180, borderRadius: 90, right: -50, top: -70, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroBubbleB: { position: 'absolute' as const, width: 120, height: 120, borderRadius: 60, right: 40, bottom: -70, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  avatarRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center' as const, justifyContent: 'center' as const },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.title, fontSize: 22, color: '#1D4ED8' },
  heroBody: { flex: 1, minWidth: 0 },
  name: { ...typography.title, fontSize: 21, color: '#fff' },
  email: { ...typography.caption, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroFoot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, flex: 1 },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#86EFAC' },
  chipText: { ...typography.caption, fontSize: 12, fontWeight: '600' as const, color: '#fff' },
  profileBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, height: 30, paddingLeft: 12, paddingRight: 8, borderRadius: radii.pill, backgroundColor: '#fff' },
  profileBtnText: { ...typography.caption, fontSize: 12, fontWeight: '700' as const, color: '#1D4ED8' },

  section: { ...typography.overline, fontSize: 11, letterSpacing: 1.1, color: t.textMuted, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: {
    backgroundColor: t.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: 10, gap: 14 },
  rowDivider: { position: 'absolute' as const, top: 0, left: 70, right: 0, height: 1, backgroundColor: t.border },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...typography.bodyMedium, fontSize: 15, fontWeight: '600' as const, color: t.textPrimary },
  rowLabelMuted: { color: t.textMuted },
  rowHint: { ...typography.caption, fontSize: 12.5, color: t.textMuted, marginTop: 2 },
  chevron: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  soon: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: t.surfaceAlt },
  soonText: { ...typography.caption, fontSize: 11, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.4 },

  signOut: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  signOutIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.dangerBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  signOutText: { ...typography.bodyMedium, fontSize: 15, fontWeight: '700' as const, color: t.dangerText },
  version: { ...typography.caption, fontSize: 11.5, color: t.textMuted, textAlign: 'center' as const, marginBottom: spacing.lg },
  pressed: { opacity: 0.75 },
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

export function MenuRow({ icon: Icon, tone, label, hint, onPress, soon, divider }: MenuRowProps) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, soon ? 'neutral' : tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: bg }]}
    >
      {divider && <View style={styles.rowDivider} />}
      <GlossyBadge color={soon ? theme.textMuted : fg} size={40} icon={<Icon size={19} color="#FFFFFF" />} />
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
      {soon ? (
        <View style={styles.soon}>
          <Text style={styles.soonText}>SOON</Text>
        </View>
      ) : (
        <View style={styles.chevron}>
          <ChevronRightIcon size={15} color={theme.textSecondary} />
        </View>
      )}
    </Pressable>
  );
}

/** A card of MenuRows. */
export function MenuGroup({ children }: { children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return <View style={styles.group}>{children}</View>;
}

export function CrmMoreScreen() {
  // The lead screens live on whichever stack hosts this screen (CRM or Lead Management).
  const leadNavigation = useNavigation<NavigationProp<LeadStackParamList>>();
  const { user, logout } = useAuth();
  const role = useUserRole();
  const rawRole = useRawRole();
  const { styles } = useCrmStyles(factory);
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
  const tickets = useTicketsTab();
  const help = useHelpRow(`More menu · ${APP_NAMES[current] ?? 'Sales'}`);

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
  // Customer Feedback tickets for them (e.g. a Sales step assigned to a salesperson), with the waiting count.
  if (tickets.show) {
    work.push({
      icon: ClipboardListIcon,
      tone: 'danger',
      label: 'Tickets',
      hint: tickets.count ? `${tickets.count} waiting for you` : 'Customer feedback tickets for you',
      onPress: () => leadNavigation.getParent()?.navigate('FeedbackTickets' as never),
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
        <View style={styles.heroBubbleA} />
        <View style={styles.heroBubbleB} />
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
          </View>
        </View>
        <View style={styles.heroFoot}>
          <View style={styles.chips}>
            {!!roleText && (
              <View style={styles.chip}>
                <View style={styles.chipDot} />
                <Text style={styles.chipText}>{roleText}</Text>
              </View>
            )}
            {canSwitch && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{APP_NAMES[current]}</Text>
              </View>
            )}
          </View>
          <Pressable onPress={openProfile} accessibilityRole="button" style={({ pressed }) => [styles.profileBtn, pressed && styles.pressed]}>
            <Text style={styles.profileBtnText}>View profile</Text>
            <ChevronRightIcon size={13} color="#1D4ED8" />
          </Pressable>
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
        <MenuRow icon={help.Icon} tone="info" label={help.label} hint={help.hint} divider onPress={help.open} />
        <MenuRow icon={SettingsIcon} tone="neutral" label="Settings" hint="Notifications, theme and more" soon divider />
      </View>

      <SignOutButton onPress={logout} />
    </CrmScreen>
  );
}

/** The red Sign out button at the bottom of a More screen. */
export function SignOutButton({ onPress }: { onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <>
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.signOut, pressed && { backgroundColor: theme.dangerBg }]}>
        <View style={styles.signOutIcon}>
          <LogoutIcon size={16} color={theme.dangerText} />
        </View>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Text style={styles.version}>BestServe · Version {APP_VERSION}</Text>
    </>
  );
}
