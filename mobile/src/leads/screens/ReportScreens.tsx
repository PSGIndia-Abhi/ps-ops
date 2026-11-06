import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { DateSheet, Sheet } from '../../tasks/ui/sheets';
import type { Tone } from '../../crm/ui/StatusBadge';
import { addDays, fmtDateShort, parseDate, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { Person } from '../types';
import { StatTile, useLoad, useMe, LeadTopBar as TopBar, LeadScreen } from '../ui';
import { formatINR } from '../../crm/format';
import { AchievementCard } from '../AchievementCard';
import { TargetCard, targetPercent, type ContractKind, type PeriodFigures } from '../TargetCard';
import { TeamMemberRow, TeamSummary } from '../TeamReportParts';
import { teamHistory, teamItems, teamPerformance, teamTarget } from '../teamTotals';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  // the dates shown, as a pill that opens the date filter
  datePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  datePillOn: { backgroundColor: t.primarySoftBg, borderColor: t.primary },
  datePillText: { ...typography.captionMedium, color: t.textSecondary },
  datePillTextOn: { color: t.primary },
  pressed: { opacity: 0.8 },
  // the date filter sheet
  sheetLabel: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
  quickRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, marginBottom: spacing.lg },
  quick: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  quickOn: { backgroundColor: t.primary, borderColor: t.primary },
  quickText: { ...typography.captionMedium, color: t.textSecondary },
  quickTextOn: { color: '#fff' },
  dateRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.lg },
  dateBox: { flex: 1, padding: spacing.sm + 2, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, gap: 2 },
  dateBoxLabel: { ...typography.caption, color: t.textMuted },
  dateBoxValue: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  dateBoxText: { ...typography.bodyMedium, fontWeight: '600' as const, color: t.textPrimary },
  tileRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.sm },
  summarySkeleton: { marginBottom: spacing.lg },
  teamHeading: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },
});

type Range = 'today' | 'week' | 'month' | 'lifetime' | 'custom';
const RANGES: Option<Range>[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'Month' },
  { value: 'lifetime', label: 'Lifetime' },
];
/** "Lifetime" starts before the first lead was ever added. */
const LIFETIME_FROM = '2020-01-01';

interface DateRange {
  from: string;
  to: string;
}

/** The report's from/to dates for a range, as wall-clock YYYY-MM-DD. `custom` is the picked dates. */
export function rangeDates(range: Range, today = todayStr(), custom?: DateRange): DateRange {
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') return { from: addDays(today, -6), to: today };
  if (range === 'lifetime') return { from: LIFETIME_FROM, to: today };
  if (range === 'custom' && custom) return custom;
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Days in the month of a 'YYYY-MM' string. */
const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (month: string) => MONTH_SHORT[Number(month.slice(5, 7)) - 1];
/** '2026-10' -> 'Oct 2026' */
const monthLabel = (month: string) => `${monthShort(month)} ${month.slice(0, 4)}`;
/** '2026-12' -> '2027-01' */
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const lastDayOf = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
/** Days from `a` to `b`, both counted. */
const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000) + 1;

/** The quick picks in the date filter. */
function quickRanges(today = todayStr()): { key: string; label: string; range: DateRange }[] {
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const back2 = new Date(y, m - 3, 1);
  return [
    { key: 'this', label: 'This month', range: { from: `${month}-01`, to: today } },
    { key: 'last', label: 'Last month', range: { from: `${prev}-01`, to: lastDayOf(prev) } },
    { key: '3m', label: 'Last 3 months', range: { from: `${back2.getFullYear()}-${String(back2.getMonth() + 1).padStart(2, '0')}-01`, to: today } },
    { key: 'year', label: 'This year', range: { from: `${y}-01-01`, to: today } },
  ];
}

/**
 * The Target card for picked dates. One whole month: that month's own target. Anything else: each
 * month's target counted for the days of it inside the range (Oct whole + 15 days of Nov...).
 */
function customFigures(range: DateRange, history: api.AchievementHistory | null, converted: api.PerformanceItem[] | null): PeriodFigures {
  const targetOf = new Map((history?.months ?? []).map((m) => [m.month, m.target]));
  const items = converted ?? [];
  const achieved = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  const firstMonth = range.from.slice(0, 7);
  if (range.from === `${firstMonth}-01` && range.to === lastDayOf(firstMonth)) {
    return {
      title: monthLabel(firstMonth).toUpperCase(),
      target: targetOf.get(firstMonth) ?? null,
      achieved,
      converted: items.length,
      when: `in ${monthLabel(firstMonth)}`,
    };
  }
  let total = 0;
  let anySet = false;
  const parts: string[] = [];
  for (let month = firstMonth; month <= range.to.slice(0, 7); month = nextMonth(month)) {
    const start = range.from > `${month}-01` ? range.from : `${month}-01`;
    const end = range.to < lastDayOf(month) ? range.to : lastDayOf(month);
    const days = daysBetween(start, end);
    const t = targetOf.get(month);
    if (t) {
      anySet = true;
      total += (t * days) / daysInMonth(month);
    }
    parts.push(days === daysInMonth(month) ? monthShort(month) : `${days} day${days === 1 ? '' : 's'} of ${monthShort(month)}`);
  }
  return {
    title: 'SELECTED DATES',
    target: anySet ? Math.round(total) : null,
    achieved,
    converted: items.length,
    when: 'in these dates',
    note: anySet ? (parts.length <= 3 ? `Targets for ${parts.join(' + ')}` : 'Each month’s target, shared by the days in this range') : undefined,
  };
}

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
  dates: DateRange,
): PeriodFigures | undefined {
  if (range === 'month') return undefined;
  if (range === 'custom') return customFigures(dates, history, converted);
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
  // Picked dates (the date filter), used when range is 'custom'.
  const [custom, setCustom] = useState<DateRange>(() => quickRanges()[1].range);
  const [filtering, setFiltering] = useState(false);
  const { from, to } = rangeDates(range, todayStr(), custom);
  const employeeId = params?.employeeId;
  // "All team" (from the Team report): everyone's numbers added up.
  const team = params?.team;
  const { myIdNum, persona } = useMe();
  const manager = persona === 'sales_manager';
  // The records behind a number: one person's, or the whole team's together.
  const itemsFor = useCallback(
    (metric: api.PerformanceMetric) => (team ? teamItems(metric, team, from, to) : api.performanceItems(metric, from, to, employeeId)),
    [team, from, to, employeeId],
  );

  const loader = useCallback(() => (team ? teamPerformance(team, from, to) : api.performance(from, to, employeeId)), [team, from, to, employeeId]);
  const { data, loading, refreshing, error, refresh: refreshReport, reload } = useLoad(loader, 'Could not load the performance report.');
  // This month's target for the person shown (a manager gets the team's list and picks them out).
  const targetLoader = useCallback(async () => {
    const list = await api.listTargets().catch(() => [] as api.SalesTarget[]);
    if (team) return teamTarget(list, team);
    return list.find((t) => t.userId === (employeeId ?? myIdNum)) ?? null;
  }, [team, employeeId, myIdNum]);
  const { data: target, refresh: refreshTarget, reload: reloadTarget } = useLoad(targetLoader, '');
  // Lifetime achieved and every monthly target set (the server keeps up to 24 months), for the Lifetime filter.
  const historyLoader = useCallback(
    () => (team ? teamHistory(team, 24) : api.targetHistory(employeeId, 24)).catch(() => null),
    [team, employeeId],
  );
  const { data: history, refresh: refreshHistory, reload: reloadHistory } = useLoad(historyLoader, '');
  // Today / 7 days: what the leads converted in the period are worth (the same value the target counts).
  const convertedLoader = useCallback(
    () =>
      range === 'today' || range === 'week' || range === 'custom' ? itemsFor('leadsConverted').catch(() => null) : Promise.resolve(null),
    [range, itemsFor],
  );
  const { data: converted, refresh: refreshConverted } = useLoad(convertedLoader, '');
  // All / One-time / AMC on the Target card: with a type picked, the leads converted in the period
  // (each carries its One-time / AMC) are added up for that type.
  const [kind, setKind] = useState<ContractKind>('ALL');
  const typedLoader = useCallback(
    () => (kind === 'ALL' ? Promise.resolve(null) : itemsFor('leadsConverted').catch(() => null)),
    [kind, itemsFor],
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
  // The same dates, short enough for the top bar: "Nov 1 - Nov 5" (the year only when it is not this year).
  const thisYear = todayStr().slice(0, 4);
  const shortDate = (d: string) => (d.slice(0, 4) === thisYear ? fmtDateShort(d).replace(/,?\s*\d{4}$/, '') : fmtDateShort(d));
  const barLabel = range === 'lifetime' ? 'All time' : from === to ? shortDate(from) : `${shortDate(from)} - ${shortDate(to)}`;
  const period = target ? periodFigures(range, target, history ?? null, converted ?? null, { from, to }) : undefined;
  // A tile opens the records behind its number, for the same person and period.
  const openTile = (metric: api.PerformanceMetric, label: string) =>
    navigation.navigate('LeadPerformanceItems', { metric, label, from, to, employeeId, team, name: params?.name ?? 'My performance', periodLabel });

  return (
    <LeadScreen edges={['top', 'bottom']}>
      {/* The dates sit on the right of the top bar; tapping them opens the date filter. */}
      <TopBar
        title={params?.name ?? 'My performance'}
        subtitle={team ? `Team performance · ${team.length} ${team.length === 1 ? 'person' : 'people'}` : 'Sales performance'}
        onBack={() => navigation.goBack()}
        action={{ label: barLabel, onPress: () => setFiltering(true), icon: <CalendarIcon size={15} color="#fff" /> }}
      />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        {!!target && (
          <TargetCard
            target={target}
            period={period}
            canSet={manager && !!employeeId && target.canSet}
            onChanged={() => {
              reloadTarget();
              reloadHistory();
            }}
            onHistory={() => navigation.navigate('LeadAchievementHistory', { employeeId, team, name: params?.name ?? 'My achievement' })}
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
      <DateFilterSheet
        visible={filtering}
        onClose={() => setFiltering(false)}
        value={{ from, to }}
        onApply={(r) => {
          setFiltering(false);
          // "This month" is the Month button; anything else is picked dates.
          const thisMonth = quickRanges()[0].range;
          if (r.from === thisMonth.from && r.to === thisMonth.to) setRange('month');
          else {
            setCustom(r);
            setRange('custom');
          }
        }}
      />
    </LeadScreen>
  );
}

/** The date filter: quick picks (This month, Last month...) or any From / To dates. */
function DateFilterSheet({ visible, onClose, value, onApply }: { visible: boolean; onClose: () => void; value: DateRange; onApply: (r: DateRange) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [draft, setDraft] = useState<DateRange>(value);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  // Start from the dates on screen each time it opens (Lifetime starts at this month instead).
  useEffect(() => {
    if (visible) setDraft(value.from === LIFETIME_FROM ? { from: `${value.to.slice(0, 8)}01`, to: value.to } : value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const pick = (date: string) => {
    // From stays on or before To
    setDraft((d) => (picking === 'from' ? { from: date, to: date > d.to ? date : d.to } : { from: date < d.from ? date : d.from, to: date }));
    setPicking(null);
  };
  return (
    <>
      {/* one sheet at a time: the calendar takes this one's place while it is open */}
      <Sheet visible={visible && !picking} onClose={onClose} title="Show performance for">
        <Text style={styles.sheetLabel}>Quick pick</Text>
        <View style={styles.quickRow}>
          {quickRanges().map((q) => {
            const on = q.range.from === draft.from && q.range.to === draft.to;
            return (
              <Pressable
                key={q.key}
                onPress={() => setDraft(q.range)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.quick, on && styles.quickOn, pressed && styles.pressed]}
              >
                <Text style={[styles.quickText, on && styles.quickTextOn]}>{q.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.sheetLabel}>Or pick dates</Text>
        <View style={styles.dateRow}>
          {(['from', 'to'] as const).map((k) => (
            <Pressable key={k} onPress={() => setPicking(k)} accessibilityRole="button" style={({ pressed }) => [styles.dateBox, pressed && styles.pressed]}>
              <Text style={styles.dateBoxLabel}>{k === 'from' ? 'From' : 'To'}</Text>
              <View style={styles.dateBoxValue}>
                <CalendarIcon size={15} color={theme.primary} />
                <Text style={styles.dateBoxText}>{fmtDateShort(draft[k])}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Apply" onPress={() => onApply(draft)} />
      </Sheet>
      <DateSheet visible={visible && !!picking} onClose={() => setPicking(null)} value={picking ? draft[picking] : null} onPick={pick} title={picking === 'from' ? 'From' : 'To'} />
    </>
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
  const loader = useCallback(
    () => (params?.team ? teamHistory(params.team, 6) : api.targetHistory(params?.employeeId)),
    [params?.team, params?.employeeId],
  );
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
    // Someone whose target this viewer sets but who works no leads of their own - the Personal
    // Assistant, whose target only the Managing Director sets - is on the team list too.
    const listed = new Set(team.map((p) => Number(p.id)));
    for (const t of targets) {
      if (t.canSet && t.userId !== myIdNum && !listed.has(t.userId)) {
        team.push({ id: t.userId, name: t.name, role: t.role });
        listed.add(t.userId);
      }
    }
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
      converted: people.reduce((s, p) => s + (p.target?.converted ?? 0), 0),
      visitsToday: todays.length,
    };
    // "All team": the people on the leaderboard, their numbers added up.
    const members = people.map((p) => ({ id: Number(p.id), name: p.name }));
    return { people, summary, members };
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
              <TeamSummary
                {...data.summary}
                onVisits={openVisits}
                onPress={() => navigation.navigate('LeadPerformance', { team: data.members, name: 'All team' })}
              />
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
