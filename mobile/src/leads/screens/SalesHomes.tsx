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
import { LeadRow, LeadWash, useLoad } from '../ui';

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
