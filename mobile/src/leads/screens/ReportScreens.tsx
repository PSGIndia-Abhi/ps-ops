import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { httpClient } from '../../api/httpClient';
import { ChevronRightIcon, PinIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { toneColors, type Tone } from '../../crm/ui/StatusBadge';
import { addDays, fmtDateShort, initials, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { Performance, Person } from '../types';
import { Card, StatTile, useLoad, useMe, LeadTopBar as TopBar, LeadScreen, personTone } from '../ui';
import { formatINR } from '../../crm/format';
import { TargetCard, targetPercent } from '../TargetCard';

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  title: { ...typography.display, color: t.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  range: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  tileRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.sm },
  person: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...typography.bodyMedium, color: t.primary },
  personBody: { flex: 1 },
  visitsIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  personName: { ...typography.bodyMedium, color: t.textPrimary },
  personRole: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  targetLine: { ...typography.captionMedium, color: t.textSecondary, marginTop: 4 },
  targetTrack: { height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const, marginTop: 4 },
  targetFill: { height: 6, borderRadius: 3 },
  targetNone: { ...typography.caption, color: t.primary, marginTop: 4 },
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

const METRICS: { key: keyof Performance; label: string; tone: Tone }[][] = [
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
  const refresh = () => {
    refreshReport();
    refreshTarget();
  };

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={params?.name ?? 'My performance'} subtitle="Sales performance" onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        {!!target && <TargetCard target={target} canSet={manager && !!employeeId} onChanged={reloadTarget} />}
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        <Text style={styles.range}>
          {range === 'lifetime' ? 'All time' : from === to ? fmtDateShort(from) : `${fmtDateShort(from)} - ${fmtDateShort(to)}`}
        </Text>
        <CrmErrorBanner message={error} onRetry={reload} />
        {loading && !data ? (
          <CrmSkeleton height={360} radius={radii.lg} />
        ) : (
          !!data &&
          METRICS.map((row, i) => (
            <View key={i} style={styles.tileRow}>
              {row.map((m) => (
                <StatTile key={m.key} label={m.label} value={data[m.key]} tone={m.tone} />
              ))}
            </View>
          ))
        )}
      </CrmScreen>
    </LeadScreen>
  );
}

/**
 * The people a sales manager can look at: everyone who can work a lead, plus
 * anyone below the manager in the org hierarchy (which is what brings in
 * telecallers). The server still decides whose numbers may actually be read.
 */
async function loadTeam(myId: number): Promise<Person[]> {
  const [sales, team] = await Promise.all([
    api.salesEmployees().catch(() => [] as Person[]),
    httpClient
      .get<{ members: Person[] }>('/api/users/me/team')
      .then((r) => r.data.members ?? [])
      .catch(() => [] as Person[]),
  ]);
  const byId = new Map<number, Person>();
  for (const p of [...sales, ...team]) {
    const id = Number(p.id);
    if (id !== myId && !byId.has(id)) byId.set(id, { id, name: p.name, role: p.role });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Initials on a tint that is stable per person, so the list is easy to scan. */
function PersonAvatar({ name }: { name: string }) {
  const { styles, theme } = useCrmStyles(factory);
  const { bg, fg } = toneColors(theme, personTone(name));
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{initials(name)}</Text>
    </View>
  );
}

export function TeamScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { myIdNum } = useMe();

  const loader = useCallback(async () => {
    const [team, targets] = await Promise.all([loadTeam(myIdNum), api.listTargets().catch(() => [] as api.SalesTarget[])]);
    const byId = new Map(targets.map((t) => [t.userId, t]));
    return team.map((p) => ({ ...p, target: byId.get(Number(p.id)) ?? null }));
  }, [myIdNum]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the team.');
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <LeadScreen edges={['top']}>
      {/* Opened from Home / More (the manager's tab is Follow-ups now). */}
      <TopBar title="Team report" onBack={() => navigation.goBack()} />
      <FlatList
        data={data ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={
          <>
            <CrmErrorBanner message={error} onRetry={reload} />
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('LeadTeamVisits')} style={({ pressed }) => pressed && { opacity: 0.75 }}>
              <Card>
                <View style={styles.person}>
                  <View style={[styles.visitsIcon, { backgroundColor: theme.accentBg }]}>
                    <PinIcon size={20} color={theme.accent} />
                  </View>
                  <View style={styles.personBody}>
                    <Text style={styles.personName}>Team visits</Text>
                    <Text style={styles.personRole}>Who visited where today - start, end and GPS</Text>
                  </View>
                  <ChevronRightIcon size={16} color={theme.textMuted} />
                </View>
              </Card>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={76} radius={radii.lg} />
          ) : error ? undefined : (
            <CrmEmptyState title="No team members" subtitle="People who work leads will be listed here." icon={<UsersIcon size={30} color={theme.textMuted} />} />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('LeadPerformance', { employeeId: item.id, name: item.name })}
            style={({ pressed }) => pressed && { opacity: 0.75 }}
          >
            <Card>
              <View style={styles.person}>
                <PersonAvatar name={item.name} />
                <View style={styles.personBody}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {!!item.role && <Text style={styles.personRole}>{item.role.replace(/_/g, ' ')}</Text>}
                  {item.target?.target ? (
                    <>
                      <Text style={styles.targetLine}>
                        {formatINR(item.target.achieved)} of {formatINR(item.target.target)} · {targetPercent(item.target)}%
                      </Text>
                      <View style={styles.targetTrack}>
                        <View style={[styles.targetFill, { width: `${Math.min(100, targetPercent(item.target) ?? 0)}%`, backgroundColor: (targetPercent(item.target) ?? 0) >= 100 ? theme.success : theme.primary }]} />
                      </View>
                    </>
                  ) : item.target ? (
                    <Text style={styles.targetNone}>No target this month - tap to set</Text>
                  ) : null}
                </View>
                <ChevronRightIcon size={16} color={theme.textMuted} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </LeadScreen>
  );
}
