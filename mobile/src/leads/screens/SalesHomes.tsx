import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUnreadNotificationCount } from '../../api/notifications';
import { useAuth } from '../../auth/AuthContext';
import {
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  ExternalLinkIcon,
  PinIcon,
  UsersIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { HomeBand, HomeTile, QuickAction, SectionTitle, TILE_OVERLAP } from '../homeParts';
import type { LeadRootStackParamList, LeadTabParamList } from '../navigation';
import { countByGroup, type StageGroup } from '../stage';
import type { LeadTask, Meeting } from '../types';
import { TeamVisitsTimeline } from '../TeamVisitsTimeline';
import { LeadRow, LeadWash, meetingWhen, useLoad, useMe } from '../ui';

const RECENT_LIMIT = 3;
const WHITE = '#FFFFFF';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.lg },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  skeleton: { marginBottom: spacing.sm },

  // The focus card at the top (next visit / waiting for a meeting)
  focus: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 5,
    padding: spacing.lg,
    ...t.raisedShadow,
  },
  kicker: { ...typography.overline },
  focusTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs },
  focusTitle: { ...typography.title, color: t.textPrimary, flex: 1 },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 4 },
  metaText: { ...typography.body, color: t.textSecondary, flex: 1 },
  btns: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    minHeight: 50,
    borderRadius: radii.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  btnSoft: { backgroundColor: t.primarySoftBg },
  btnTextOn: { ...typography.bodyMedium, color: WHITE },
  btnTextSoft: { ...typography.bodyMedium, color: t.primary },
  pressed: { opacity: 0.85 },
  calm: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.successBg,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  calmText: { ...typography.bodyMedium, color: t.successText, flex: 1 },
});

type HomeNav = CompositeNavigationProp<BottomTabNavigationProp<LeadTabParamList, 'Home'>, NativeStackNavigationProp<LeadRootStackParamList>>;

/** Shared: the header and the band's switch-app behaviour. */
function useHomeBasics() {
  const navigation = useNavigation<HomeNav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { canSwitch, openSwitcher } = useAppSwitch();
  const [actionError, setActionError] = useState<string | null>(null);
  const openProfile = () => navigation.navigate('More');
  const band = {
    name: user?.name ?? '',
    topInset: insets.top,
    onBell: () => navigation.navigate('LeadNotifications'),
    onProfile: canSwitch ? () => openSwitcher(openProfile) : openProfile,
    onLogo: canSwitch ? () => openSwitcher(openProfile) : undefined,
  };
  return { navigation, band, actionError, setActionError };
}

const followUpsOf = (tasks: LeadTask[]) =>
  tasks.filter((t) => t.taskType !== 'LEAD_MEETING').sort((a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'));

// ---------------------------------------------------------------------------
// Sales executive: the next visit first
// ---------------------------------------------------------------------------

/** The next visit of mine that is still open: one in progress, else the soonest scheduled. */
function nextVisit(meetings: Meeting[], myId: string): Meeting | null {
  const mine = meetings.filter((m) => m.salesEmployeeId === myId && m.status === 'SCHEDULED');
  const live = mine.find((m) => !!m.checkInAt);
  if (live) return live;
  return [...mine].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] ?? null;
}

export function SalesExecHome() {
  const { navigation, band, actionError, setActionError } = useHomeBasics();
  const { myId } = useMe();
  const { styles, theme } = useCrmStyles(factory);

  const loader = useCallback(async () => {
    const [leads, tasks, today, upcoming, unread] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      api.meetingsToday().catch(() => [] as Meeting[]),
      api.meetingsUpcoming().catch(() => [] as Meeting[]),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    const meetings = [...today, ...upcoming.filter((u) => !today.some((t) => t.id === u.id))];
    return { leads, tasks, meetings, unread };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const counts = useMemo(() => countByGroup(leads), [leads]);
  const next = useMemo(() => nextVisit(data?.meetings ?? [], myId), [data, myId]);
  const nextLead = next ? leads.find((l) => l.id === next.leadId) : undefined;
  const followUps = useMemo(() => followUpsOf(data?.tasks ?? []), [data]);
  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });
  const address = next?.address || nextLead?.address || '';

  return (
    <View style={styles.screen}>
      <LeadWash />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <HomeBand {...band} role="Sales" alerts={data?.unread ?? 0} />

        <View style={styles.tiles}>
          {loading && !data ? (
            [0, 1, 2].map((i) => <CrmSkeleton key={i} height={128} radius={22} style={styles.flex1} />)
          ) : (
            <>
              <HomeTile icon={<CalendarIcon size={18} color={WHITE} />} value={counts.meeting} label="Meetings" tone="accent" onPress={() => openGroup('meeting')} />
              <HomeTile icon={<DocumentIcon size={18} color={WHITE} />} value={counts.quoted} label="Quotations" tone="info" onPress={() => openGroup('quoted')} />
              <HomeTile icon={<CheckCircleIcon size={18} color={WHITE} />} value={counts.won} label="Converted" tone="success" onPress={() => openGroup('won')} />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          <CrmErrorBanner message={actionError} />

          {loading && !data ? (
            <CrmSkeleton height={190} radius={radii.xl} />
          ) : next ? (
            <View style={[styles.focus, { borderLeftColor: next.checkInAt ? theme.warning : theme.accent }]}>
              <Text style={[styles.kicker, { color: next.checkInAt ? theme.warning : theme.accent }]}>
                {next.checkInAt ? 'VISIT IN PROGRESS' : next.date === todayStr() ? 'NEXT VISIT · TODAY' : 'NEXT VISIT'}
              </Text>
              <View style={styles.focusTop}>
                <Text style={styles.focusTitle} numberOfLines={1}>
                  {nextLead?.companyName || 'Meeting'}
                </Text>
              </View>
              <View style={styles.meta}>
                <ClockIcon size={15} color={theme.textMuted} />
                <Text style={styles.metaText}>{meetingWhen(next)}</Text>
              </View>
              {!!address && (
                <View style={styles.meta}>
                  <PinIcon size={15} color={theme.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {address}
                  </Text>
                </View>
              )}
              <View style={styles.btns}>
                <Pressable
                  onPress={() =>
                    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`).catch(() =>
                      setActionError('No maps app on this phone.'),
                    )
                  }
                  disabled={!address}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, { backgroundColor: theme.primary }, !address && { opacity: 0.4 }, pressed && styles.pressed]}
                >
                  <ExternalLinkIcon size={17} color={WHITE} />
                  <Text style={styles.btnTextOn}>Directions</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('LeadMeeting', { meetingId: next.id })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.btnSoft, pressed && styles.pressed]}
                >
                  <Text style={styles.btnTextSoft}>{next.checkInAt ? 'Continue visit' : 'Open visit'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            !!data && (
              <View style={styles.calm}>
                <CalendarIcon size={24} color={theme.success} />
                <Text style={styles.calmText}>No visits scheduled. Open a verified lead to book one.</Text>
              </View>
            )
          )}


          <View style={styles.section}>
            <SectionTitle title="Recent Leads" onViewAll={leads.length > 0 ? () => openGroup('all') : undefined} />
            {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={92} radius={radii.lg} style={styles.skeleton} />)}
            {!!data && leads.length === 0 && !error && <CrmEmptyState title="No leads yet" subtitle="Leads you add or are given will appear here." />}
            {leads.slice(0, RECENT_LIMIT).map((lead) => (
              <LeadRow key={lead.id} lead={lead} onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })} />
            ))}
          </View>

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" />
            <View style={styles.quickRow}>
              <QuickAction icon={<ClockIcon size={19} color={WHITE} />} label="Follow-ups" tone="warning" count={followUps.length} onPress={() => navigation.navigate('Tasks')} />
              <QuickAction icon={<CalendarIcon size={19} color={WHITE} />} label="Meetings" tone="accent" onPress={() => navigation.navigate('LeadMeetings')} />
              <QuickAction icon={<ClipboardListIcon size={19} color={WHITE} />} label="All Leads" tone="info" count={counts.all} onPress={() => openGroup('all')} />
              <QuickAction icon={<ChartIcon size={19} color={WHITE} />} label="Performance" tone="success" onPress={() => navigation.navigate('LeadPerformance')} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sales manager: what needs a decision, and how the team's day is going
// ---------------------------------------------------------------------------

export function SalesManagerHome() {
  const { navigation, band, actionError } = useHomeBasics();
  const { styles, theme } = useCrmStyles(factory);

  const loader = useCallback(async () => {
    const [leads, tasks, visits, unread] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      api.teamVisits(todayStr()).catch(() => [] as api.TeamVisit[]),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    return { leads, tasks, visits, unread };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const counts = useMemo(() => countByGroup(leads), [leads]);
  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });

  return (
    <View style={styles.screen}>
      <LeadWash />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <HomeBand {...band} role="Sales Manager" alerts={data?.unread ?? 0} />

        <View style={styles.tiles}>
          {loading && !data ? (
            [0, 1, 2].map((i) => <CrmSkeleton key={i} height={128} radius={22} style={styles.flex1} />)
          ) : (
            <>
              <HomeTile icon={<ClipboardListIcon size={18} color={WHITE} />} value={counts.all} label="Total Leads" tone="info" onPress={() => openGroup('all')} />
              <HomeTile icon={<CalendarIcon size={18} color={WHITE} />} value={counts.meeting} label="Meetings" tone="accent" onPress={() => openGroup('meeting')} />
              <HomeTile icon={<CheckCircleIcon size={18} color={WHITE} />} value={counts.won} label="Converted" tone="success" onPress={() => openGroup('won')} />
            </>
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          <CrmErrorBanner message={actionError} />

          {/* Today's team visits at a glance */}
          <View style={styles.section}>
            <SectionTitle title="Team visits today" />
            <TeamVisitsTimeline visits={data ? data.visits : null} onPress={() => navigation.navigate('LeadTeamVisits')} />
          </View>


          <View style={styles.section}>
            <SectionTitle title="Recent Leads" onViewAll={leads.length > 0 ? () => openGroup('all') : undefined} />
            {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={92} radius={radii.lg} style={styles.skeleton} />)}
            {!!data && leads.length === 0 && !error && <CrmEmptyState title="No leads yet" subtitle="Verified leads will appear here." />}
            {leads.slice(0, RECENT_LIMIT).map((lead) => (
              <LeadRow key={lead.id} lead={lead} onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })} />
            ))}
          </View>

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" />
            <View style={styles.quickRow}>
              <QuickAction icon={<PinIcon size={19} color={WHITE} />} label="Team visits" tone="accent" onPress={() => navigation.navigate('LeadTeamVisits')} />
              <QuickAction icon={<DocumentIcon size={19} color={WHITE} />} label="Quoted" tone="info" count={counts.quoted} onPress={() => openGroup('quoted')} />
              <QuickAction icon={<UsersIcon size={19} color={WHITE} />} label="Team" tone="success" onPress={() => navigation.navigate('LeadTeam')} />
              <QuickAction icon={<BriefcaseIcon size={19} color={WHITE} />} label="All Leads" tone="warning" count={counts.all} onPress={() => openGroup('all')} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
