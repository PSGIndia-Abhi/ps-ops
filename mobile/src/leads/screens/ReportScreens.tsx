import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import type { Tone } from '../../crm/ui/StatusBadge';
import { addDays, fmtDateShort, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { Person } from '../types';
import { StatTile, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';
import { formatINR } from '../../crm/format';
import { AchievementCard } from '../AchievementCard';
import { TargetCard, targetPercent, type ContractKind, type PeriodFigures } from '../TargetCard';
import { TeamMemberRow, TeamSummary } from '../TeamReportParts';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  range: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  tileRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.sm },
  summarySkeleton: { marginBottom: spacing.lg },
  teamHeading: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
});

type Range = 'today' | 'week' | 'month' | 'lifetime';
const RANGES: Option<Range>[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'Month' },
  { value: 'lifetime', label: 'Lifetime' },
];
/** "Lifetime" starts before the first lead was ever added. */
const LIFETIME_FROM = '2020-01-01';

/** The report's from/to dates for a range, as wall-clock YYYY-MM-DD. */
export function rangeDates(range: Range, today = todayStr()): { from: string; to: string } {
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') return { from: addDays(today, -6), to: today };
  if (range === 'lifetime') return { from: LIFETIME_FROM, to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Days in the month of a 'YYYY-MM' string. */
const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * What the Target card shows for the chosen filter. Targets are set per month, so:
 *  - Month: the card's own month figures (undefined here);
 *  - Today / 7 days: the month target's share for 1 / 7 days, against what the leads converted in
 *    the period are worth;
 *  - Lifetime: every monthly target set added up, against everything achieved.
 */
function periodFigures(
  range: Range,
  target: api.SalesTarget,
  history: api.AchievementHistory | null,
  converted: api.PerformanceItem[] | null,
): PeriodFigures | undefined {
  if (range === 'month') return undefined;
  if (range === 'lifetime') {
    const set = (history?.months ?? []).filter((m) => m.target !== null);
    const total = set.reduce((s, m) => s + (m.target ?? 0), 0);
    return {
      title: 'LIFETIME',
      target: total || null,
      achieved: history?.lifetime.achieved ?? 0,
      converted: history?.lifetime.converted ?? 0,
      when: 'so far',
      note: total ? `All monthly targets added up (${set.length} month${set.length === 1 ? '' : 's'})` : undefined,
    };
  }
  const days = range === 'today' ? 1 : 7;
  const share = target.target ? Math.round((target.target * days) / daysInMonth(target.month)) : null;
  const items = converted ?? [];
  return {
    title: range === 'today' ? 'TODAY' : 'LAST 7 DAYS',
    target: share,
    achieved: items.reduce((s, i) => s + (i.amount ?? 0), 0),
    converted: items.length,
    when: range === 'today' ? 'today' : 'in the last 7 days',
    note: target.target ? `${days === 1 ? "1 day's" : "7 days'"} share of the month's ${formatINR(target.target)}` : undefined,
  };
}

const METRICS: { key: api.PerformanceMetric; label: string; tone: Tone }[][] = [
  [
    { key: 'leadsGenerated', label: 'Leads generated', tone: 'info' },
    { key: 'genuineLeads', label: 'Genuine leads', tone: 'success' },
  ],
  [
    { key: 'meetingsScheduled', label: 'Meetings scheduled', tone: 'accent' },
    { key: 'visitsCompleted', label: 'Visits completed', tone: 'accent' },
  ],
  [
    { key: 'quotationsSent', label: 'Quotations sent', tone: 'warning' },
    { key: 'followUpsDue', label: 'Follow-ups due', tone: 'warning' },
  ],
  [
    { key: 'leadsConverted', label: 'Converted', tone: 'success' },
    { key: 'leadsLost', label: 'Lost', tone: 'danger' },
  ],
];

/** Sales performance for one person - yourself, or (for a manager) someone in the team. */
export function PerformanceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const params = useRoute<RouteProp<LeadStackParamList, 'LeadPerformance'>>().params;
  const { styles } = useCrmStyles(factory);
  const [range, setRange] = useState<Range>('month');
  const { from, to } = rangeDates(range);
  const employeeId = params?.employeeId;
  const { myIdNum, persona } = useMe();
  const manager = persona === 'sales_manager';

  const loader = useCallback(() => api.performance(from, to, employeeId), [from, to, employeeId]);
  const { data, loading, refreshing, error, refresh: refreshReport, reload } = useLoad(loader, 'Could not load the performance report.');
  // This month's target for the person shown (a manager gets the team's list and picks them out).
  const targetLoader = useCallback(async () => {
    const list = await api.listTargets().catch(() => [] as api.SalesTarget[]);
    return list.find((t) => t.userId === (employeeId ?? myIdNum)) ?? null;
  }, [employeeId, myIdNum]);
  const { data: target, refresh: refreshTarget, reload: reloadTarget } = useLoad(targetLoader, '');
  // Lifetime achieved and every monthly target set (the server keeps up to 24 months), for the Lifetime filter.
  const historyLoader = useCallback(() => api.targetHistory(employeeId, 24).catch(() => null), [employeeId]);
  const { data: history, refresh: refreshHistory, reload: reloadHistory } = useLoad(historyLoader, '');
  // Today / 7 days: what the leads converted in the period are worth (the same value the target counts).
  const convertedLoader = useCallback(
    () =>
      range === 'today' || range === 'week'
        ? api.performanceItems('leadsConverted', from, to, employeeId).catch(() => null)
        : Promise.resolve(null),
    [range, from, to, employeeId],
  );
  const { data: converted, refresh: refreshConverted } = useLoad(convertedLoader, '');
  // All / One-time / AMC on the Target card: with a type picked, the leads converted in the period
  // (each carries its One-time / AMC) are added up for that type.
  const [kind, setKind] = useState<ContractKind>('ALL');
  const typedLoader = useCallback(
    () => (kind === 'ALL' ? Promise.resolve(null) : api.performanceItems('leadsConverted', from, to, employeeId).catch(() => null)),
    [kind, from, to, employeeId],
  );
  const { data: typedItems, loading: typedLoading, refresh: refreshTyped } = useLoad(typedLoader, '');
  const typedOnes = (typedItems ?? []).filter((i) => i.contractType === kind);
  const kindFigures =
    kind === 'ALL' ? null : typedLoading && !typedItems ? undefined : { achieved: typedOnes.reduce((s, i) => s + (i.amount ?? 0), 0), converted: typedOnes.length };
  const refresh = () => {
    refreshReport();
    refreshTarget();
    refreshHistory();
    refreshConverted();
    refreshTyped();
  };
  const periodLabel = range === 'lifetime' ? 'All time' : from === to ? fmtDateShort(from) : `${fmtDateShort(from)} - ${fmtDateShort(to)}`;
  const period = target ? periodFigures(range, target, history ?? null, converted ?? null) : undefined;
  // A tile opens the records behind its number, for the same person and period.
  const openTile = (metric: api.PerformanceMetric, label: string) =>
    navigation.navigate('LeadPerformanceItems', { metric, label, from, to, employeeId, name: params?.name ?? 'My performance', periodLabel });

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={params?.name ?? 'My performance'} subtitle="Sales performance" onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        <Text style={styles.range}>{periodLabel}</Text>
        {!!target && (
          <TargetCard
            target={target}
            period={period}
            canSet={manager && !!employeeId}
            onChanged={() => {
              reloadTarget();
              reloadHistory();
            }}
            onHistory={() => navigation.navigate('LeadAchievementHistory', { employeeId, name: params?.name ?? 'My achievement' })}
            kind={kind}
            onKindChange={setKind}
            kindFigures={kindFigures}
          />
        )}
        <CrmErrorBanner message={error} onRetry={reload} />
        {loading && !data ? (
          <CrmSkeleton height={360} radius={radii.lg} />
        ) : (
          !!data &&
          METRICS.map((row, i) => (
            <View key={i} style={styles.tileRow}>
              {row.map((m) => (
                <StatTile key={m.key} label={m.label} value={data[m.key]} tone={m.tone} onPress={() => openTile(m.key, m.label)} />
              ))}
            </View>
          ))
        )}
      </CrmScreen>
    </LeadScreen>
  );
}

/**
 * Achievement history for one person (opened from the Target card): lifetime achieved, last month,
 * and the month-by-month chart against each month's target.
 */
export function AchievementHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const params = useRoute<RouteProp<LeadStackParamList, 'LeadAchievementHistory'>>().params;
  const { styles } = useCrmStyles(factory);
  const loader = useCallback(() => api.targetHistory(params?.employeeId), [params?.employeeId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the achievement history.');

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Achievement history" subtitle={params?.name} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        {loading && !data ? <CrmSkeleton height={320} radius={radii.lg} /> : !!data && <AchievementCard history={data} initiallyOpen />}
      </CrmScreen>
    </LeadScreen>
  );
}

/**
 * The people a sales manager can look at: everyone who can work a lead, plus
 * anyone below the manager in the org hierarchy (which is what brings in
 * telecallers). The server still decides whose numbers may actually be read.
 */
// The sales team only (Sales Executives and sales managers) - not the whole Task Management
// hierarchy, which for a Managing Director / Personal Assistant is everyone in the company.
async function loadTeam(myId: number): Promise<Person[]> {
  const sales = await api.salesEmployees().catch(() => [] as Person[]);
  const byId = new Map<number, Person>();
  for (const p of sales) {
    const id = Number(p.id);
    if (id !== myId && !byId.has(id)) byId.set(id, { id, name: p.name, role: p.role });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function TeamScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { myIdNum } = useMe();

  const loader = useCallback(async () => {
    const [team, targets, visits] = await Promise.all([
      loadTeam(myIdNum),
      api.listTargets().catch(() => [] as api.SalesTarget[]),
      api.teamVisits(todayStr()).catch(() => [] as api.TeamVisit[]),
    ]);
    const byId = new Map(targets.map((t) => [t.userId, t]));
    const todays = visits.filter((v) => v.status !== 'CANCELLED');
    const people = team.map((p) => ({
      ...p,
      target: byId.get(Number(p.id)) ?? null,
      visitsToday: todays.filter((v) => String(v.salesEmployeeId) === String(p.id)).length,
    }));
    // Ranked by how much of their target they have reached; people without a target after, by amount.
    const pct = (t: api.SalesTarget | null) => (t?.target ? targetPercent(t) ?? 0 : -1);
    people.sort((a, b) => pct(b.target) - pct(a.target) || (b.target?.achieved ?? 0) - (a.target?.achieved ?? 0) || a.name.localeCompare(b.name));
    const summary = {
      month: targets[0]?.month,
      target: people.reduce((s, p) => s + (p.target?.target ?? 0), 0),
      achieved: people.reduce((s, p) => s + (p.target?.achieved ?? 0), 0),
      // Only the people who have a target count towards the team's target %.
      targetAchieved: people.reduce((s, p) => s + (p.target?.target ? p.target.achieved : 0), 0),
      converted: people.reduce((s, p) => s + (p.target?.converted ?? 0), 0),
      visitsToday: todays.length,
    };
    return { people, summary };
  }, [myIdNum]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the team.');
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const openVisits = () => navigation.navigate('LeadTeamVisits');
  let place = 0;
  const ranked = (data?.people ?? []).map((p) => ({ ...p, rank: p.target?.target ? (place += 1) : null }));

  return (
    <LeadScreen edges={['top']}>
      {/* Opened from Home / More (the manager's tab is Follow-ups now). */}
      <TopBar title="Team report" onBack={() => navigation.goBack()} />
      <FlatList
        data={ranked}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={
          <>
            <CrmErrorBanner message={error} onRetry={reload} />
            {data ? (
              <TeamSummary {...data.summary} onVisits={openVisits} />
            ) : loading ? (
              <CrmSkeleton height={200} radius={radii.xl} style={styles.summarySkeleton} />
            ) : null}
            {ranked.length > 0 && <Text style={styles.teamHeading}>LEADERBOARD · THIS MONTH</Text>}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={96} radius={radii.xl} />
          ) : error ? undefined : (
            <CrmEmptyState title="No team members" subtitle="People who work leads will be listed here." icon={<UsersIcon size={30} color={theme.textMuted} />} />
          )
        }
        renderItem={({ item }) => (
          <TeamMemberRow
            rank={item.rank}
            name={item.name}
            role={item.role ? api.roleName(item.role) : ''}
            target={item.target}
            visitsToday={item.visitsToday}
            onPress={() => navigation.navigate('LeadPerformance', { employeeId: item.id, name: item.name })}
          />
        )}
      />
    </LeadScreen>
  );
}
