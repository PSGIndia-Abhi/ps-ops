import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
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
  PinIcon,
  UsersIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { useAppSwitch } from '../../navigation/AppSwitchContext';
import { todayStr } from '../../tasks/format';
import { radii, spacing } from '../../theme';
import * as api from '../api';
import { HomeBand, HomeTile, QuickAction, SectionTitle, TILE_OVERLAP } from '../homeParts';
import type { LeadRootStackParamList, LeadTabParamList } from '../navigation';
import { countByGroup, type StageGroup } from '../stage';
import type { LeadTask } from '../types';
import { TeamVisitsTimeline } from '../TeamVisitsTimeline';
import { ShiftCard } from './FieldDayScreens';
import { LeadRow, LeadWash, useLoad, useMe } from '../ui';
import { targetPercent } from '../TargetCard';
import { TeamPeopleRow, TeamPulseCard, TeamPulseSkeleton, type TeamPerson } from '../TeamHomeParts';
import { loadTeam } from './ReportScreens';

const RECENT_LIMIT = 3;
const WHITE = '#FFFFFF';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.lg },
  shift: { marginBottom: spacing.xs },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  pulse: { marginHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  firstSection: { marginTop: 0 },
  skeleton: { marginBottom: spacing.sm },
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
// Sales executive: the field day (shift) first; visits are on My day
// ---------------------------------------------------------------------------

export function SalesExecHome() {
  const { navigation, band, actionError } = useHomeBasics();
  const { styles, theme } = useCrmStyles(factory);

  const loader = useCallback(async () => {
    const [leads, tasks, unread] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    return { leads, tasks, unread };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const counts = useMemo(() => countByGroup(leads), [leads]);
  const followUps = useMemo(() => followUpsOf(data?.tasks ?? []), [data]);
  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });

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

          {/* Field day: Start / End Shift, and the way into My Day (visits, unplanned visit). */}
          <View style={styles.shift}>
            <ShiftCard showMyDayLink />
          </View>

          <View style={styles.section}>
            <SectionTitle title="Recent Leads" icon="leads" subtitle="Your newest leads" onViewAll={leads.length > 0 ? () => openGroup('all') : undefined} />
            {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={92} radius={radii.lg} style={styles.skeleton} />)}
            {!!data && leads.length === 0 && !error && <CrmEmptyState title="No leads yet" subtitle="Leads you add or are given will appear here." />}
            {leads.slice(0, RECENT_LIMIT).map((lead) => (
              <LeadRow key={lead.id} lead={lead} onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })} />
            ))}
          </View>

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" icon="actions" subtitle="Jump straight to your work" />
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
  const { myIdNum } = useMe();
  const { user } = useAuth();
  // The Managing Director / Personal Assistant keep their own title; others read "Sales Manager".
  const role = user?.role === 'Managing Director' || user?.role === 'Personal Assistant' ? user.role : 'Sales Manager';

  const loader = useCallback(async () => {
    const [leads, visits, team, targets, unread] = await Promise.all([
      api.listLeads(),
      api.teamVisits(todayStr()).catch(() => [] as api.TeamVisit[]),
      loadTeam(myIdNum),
      api.listTargets().catch(() => [] as api.SalesTarget[]),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    // The team as on the Team report: the sales team, plus anyone whose target this viewer sets
    // (the Personal Assistant, for the Managing Director).
    const listed = new Set(team.map((p) => Number(p.id)));
    for (const t of targets) {
      if (t.canSet && t.userId !== myIdNum && !listed.has(t.userId)) {
        team.push({ id: t.userId, name: t.name, role: t.role });
        listed.add(t.userId);
      }
    }
    const todays = visits.filter((v) => v.status !== 'CANCELLED');
    const byId = new Map(targets.map((t) => [t.userId, t]));
    const pct = (t: api.SalesTarget | null) => (t?.target ? targetPercent(t) ?? 0 : -1);
    const people = team
      .map((p) => ({
        id: Number(p.id),
        name: p.name,
        role: p.role,
        target: byId.get(Number(p.id)) ?? null,
        visitsToday: todays.filter((v) => String(v.salesEmployeeId) === String(p.id)).length,
      }))
      // Ranked by the amount they converted this month; equal amounts by % of target, then by name.
      .sort((a, b) => (b.target?.achieved ?? 0) - (a.target?.achieved ?? 0) || pct(b.target) - pct(a.target) || a.name.localeCompare(b.name));
    let place = 0;
    // A medal only for someone who has converted something this month.
    const ranked: TeamPerson[] = people.map((p) => ({ ...p, rank: (p.target?.achieved ?? 0) > 0 ? (place += 1) : null }));
    const summary = {
      month: targets[0]?.month,
      target: people.reduce((s, p) => s + (p.target?.target ?? 0), 0),
      achieved: people.reduce((s, p) => s + (p.target?.achieved ?? 0), 0),
      converted: people.reduce((s, p) => s + (p.target?.converted ?? 0), 0),
      visitsToday: todays.length,
    };
    const members = people.map((p) => ({ id: p.id, name: p.name }));
    return { leads, visits: todays, people: ranked, summary, members, unread };
  }, [myIdNum]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your team.');

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const counts = useMemo(() => countByGroup(leads), [leads]);
  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });
  const openVisits = () => navigation.navigate('LeadTeamVisits');

  return (
    <View style={styles.screen}>
      <LeadWash />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} progressViewOffset={40} />}
      >
        <HomeBand {...band} role={role} alerts={data?.unread ?? 0} />

        {/* The team's month - the same numbers as Team performance; opens it */}
        <View style={styles.pulse}>
          {data ? (
            <TeamPulseCard
              {...data.summary}
              people={data.people.length}
              onPress={() => navigation.navigate('LeadPerformance', { team: data.members, name: 'All team' })}
              onVisits={openVisits}
            />
          ) : (
            <TeamPulseSkeleton />
          )}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          <CrmErrorBanner message={actionError} />

          {/* Each person's progress - opens their performance */}
          <View style={styles.firstSection}>
            <SectionTitle title="My team" icon="leads" subtitle="This month, best first" onViewAll={() => navigation.navigate('LeadTeam')} />
            {loading && !data ? (
              <CrmSkeleton height={190} radius={radii.xl} />
            ) : data && data.people.length > 0 ? (
              <TeamPeopleRow people={data.people} onOpen={(p) => navigation.navigate('LeadPerformance', { employeeId: p.id, name: p.name })} />
            ) : (
              !!data && <CrmEmptyState title="No team members" subtitle="People who work leads will be listed here." />
            )}
          </View>

          {/* Today's team visits at a glance */}
          <View style={styles.section}>
            <SectionTitle title="Team visits today" icon="visits" subtitle="Who is out on visits right now" />
            <TeamVisitsTimeline visits={data ? data.visits : null} onPress={openVisits} />
          </View>

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" icon="actions" subtitle="Jump straight to your work" />
            <View style={styles.quickRow}>
              <QuickAction icon={<PinIcon size={19} color={WHITE} />} label="Team visits" tone="accent" onPress={openVisits} />
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
