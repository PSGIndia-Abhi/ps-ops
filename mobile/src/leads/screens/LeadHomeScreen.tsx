import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { CalendarIcon, ChartIcon, CheckCircleIcon, ClockIcon, CloseIcon, DocumentIcon, PhoneIcon, SparkleIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { ClipboardListIcon } from '../../crm/ui/crmIcons';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import type { Tone } from '../../crm/ui/StatusBadge';
import { radii, spacing } from '../../theme';
import { getUnreadNotificationCount } from '../../api/notifications';
import * as api from '../api';
import { HomeBand, HomeTile, QuickAction, SectionTitle, TILE_OVERLAP } from '../homeParts';
import type { LeadRootStackParamList, LeadTabParamList } from '../navigation';
import { countByGroup, type StageGroup } from '../stage';
import type { LeadPersona, LeadTask } from '../types';
import { LeadRow, LeadWash, useLoad, useMe } from '../ui';

const RECENT_LIMIT = 3;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  tiles: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: -TILE_OVERLAP },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.lg },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm },
  skeletonRow: { marginBottom: spacing.sm },
});

type HomeNav = CompositeNavigationProp<BottomTabNavigationProp<LeadTabParamList, 'Home'>, NativeStackNavigationProp<LeadRootStackParamList>>;

type IconType = React.ComponentType<{ size?: number; color?: string }>;
interface TileDef {
  group: StageGroup;
  label: string;
  tone: Tone;
  icon: IconType;
}

/** The three numbers each role opens the day with. */
const TILES: Record<LeadPersona, TileDef[]> = {
  telecaller: [
    { group: 'new', label: 'New Leads', tone: 'info', icon: SparkleIcon },
    { group: 'to_call', label: 'To Call', tone: 'danger', icon: PhoneIcon },
    { group: 'qualified', label: 'Qualified', tone: 'success', icon: CheckCircleIcon },
  ],
  // The commercial sales executive's day: visits, quotations out, deals won.
  sales: [
    { group: 'meeting', label: 'Meetings', tone: 'accent', icon: CalendarIcon },
    { group: 'quoted', label: 'Quotations', tone: 'info', icon: DocumentIcon },
    { group: 'won', label: 'Converted', tone: 'success', icon: CheckCircleIcon },
  ],
  sales_manager: [
    { group: 'all', label: 'Total Leads', tone: 'info', icon: ClipboardListIcon },
    { group: 'meeting', label: 'Meetings', tone: 'accent', icon: CalendarIcon },
    { group: 'won', label: 'Converted', tone: 'success', icon: CheckCircleIcon },
  ],
};

const ROLE_LABELS: Record<LeadPersona, string> = {
  telecaller: 'Telecaller',
  sales: 'Sales',
  sales_manager: 'Sales Manager',
};

/**
 * Home for the telecaller, the commercial sales executive and the sales manager: a blue header band, three
 * stat tiles floating over its edge, the newest leads and Quick Actions. The bell
 * opens the lead notifications (its badge is the unread count).
 */
export function LeadHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { persona } = useMe();
  const { styles, theme } = useCrmStyles(factory);
  const manager = persona === 'sales_manager';

  const loader = useCallback(async () => {
    const [leads, tasks, meetings, unread] = await Promise.all([
      api.listLeads(),
      api.myTasksToday().catch(() => [] as LeadTask[]),
      api.meetingsToday().catch(() => []),
      getUnreadNotificationCount().catch(() => 0),
    ]);
    return { leads, tasks, meetings, unread };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your leads.');

  const counts = useMemo(() => countByGroup(data?.leads ?? []), [data]);
  // The server sends leads newest first.
  const recent = (data?.leads ?? []).slice(0, RECENT_LIMIT);
  // A meeting's reminder task is counted under Meetings, not Follow-ups (same split as the Today tab).
  const followUps = (data?.tasks ?? []).filter((t) => t.taskType !== 'LEAD_MEETING').length;
  const meetingsToday = data?.meetings.length ?? 0;

  const openGroup = (group: StageGroup) => navigation.navigate('Leads', { group, at: Date.now() });
  const openTasks = () => (manager ? navigation.navigate('LeadTasks') : navigation.navigate('Tasks'));
  const white = '#FFFFFF';

  return (
    <View style={styles.screen}>
      <LeadWash />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <HomeBand
          name={user?.name ?? ''}
          role={ROLE_LABELS[persona]}
          alerts={data?.unread ?? 0}
          topInset={insets.top}
          onBell={() => navigation.navigate('LeadNotifications')}
          onProfile={() => navigation.navigate('More')}
        />

        <View style={styles.tiles}>
          {loading && !data
            ? [0, 1, 2].map((i) => <CrmSkeleton key={i} height={128} radius={22} style={styles.flex1} />)
            : TILES[persona].map(({ group, label, tone, icon: Icon }) => (
                <HomeTile key={group} icon={<Icon size={18} color={white} />} value={counts[group]} label={label} tone={tone} onPress={() => openGroup(group)} />
              ))}
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />

          <SectionTitle title="Recent Leads" onViewAll={recent.length > 0 ? () => openGroup('all') : undefined} />
          {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={92} radius={radii.lg} style={styles.skeletonRow} />)}
          {!!data && recent.length === 0 && !error && (
            <CrmEmptyState title="No leads yet" subtitle="New commercial leads will appear here as soon as they are submitted." />
          )}
          {recent.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })} />
          ))}

          <View style={styles.section}>
            <SectionTitle title="Quick Actions" />
            <View style={styles.quickRow}>
              <QuickAction icon={<ClockIcon size={19} color={white} />} label="Follow-ups" tone="warning" count={followUps} onPress={openTasks} />
              {/* A manager's "Meetings" is the team's visits; everyone else's is their own. */}
              <QuickAction
                icon={<CalendarIcon size={19} color={white} />}
                label={manager ? 'Team visits' : 'Meetings'}
                tone="accent"
                count={manager ? undefined : meetingsToday}
                onPress={() => navigation.navigate(manager ? 'LeadTeamVisits' : 'LeadMeetings')}
              />
              {manager ? (
                <>
                  <QuickAction icon={<DocumentIcon size={19} color={white} />} label="Quoted" tone="info" count={counts.quoted} onPress={() => openGroup('quoted')} />
                  <QuickAction icon={<UsersIcon size={19} color={white} />} label="Team" tone="success" onPress={() => navigation.navigate('Team')} />
                </>
              ) : persona === 'sales' ? (
                <>
                  <QuickAction icon={<ClipboardListIcon size={19} color={white} />} label="All Leads" tone="info" count={counts.all} onPress={() => openGroup('all')} />
                  <QuickAction icon={<ChartIcon size={19} color={white} />} label="Performance" tone="success" onPress={() => navigation.navigate('LeadPerformance')} />
                </>
              ) : (
                <>
                  <QuickAction icon={<ClipboardListIcon size={19} color={white} />} label="All Leads" tone="info" count={counts.all} onPress={() => openGroup('all')} />
                  <QuickAction icon={<CloseIcon size={19} color={white} />} label="Closed" tone="danger" count={counts.closed} onPress={() => openGroup('closed')} />
                </>
              )}
            </View>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}
