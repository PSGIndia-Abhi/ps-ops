import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PersonIcon,
  UsersIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { StatusBadge, toneColors, type Tone } from '../../crm/ui/StatusBadge';
import { addDays, fmtDateShort, fmtTime, initials, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { PlaceLine } from '../PlaceLine';
import { useLoad } from '../ui';

type State = 'done' | 'progress' | 'missed' | 'upcoming' | 'cancelled';
type Filter = 'all' | State;

const STATE_META: Record<State, { label: string; tone: Tone }> = {
  done: { label: 'Completed', tone: 'success' },
  progress: { label: 'In progress', tone: 'warning' },
  missed: { label: 'Not started', tone: 'danger' },
  upcoming: { label: 'Upcoming', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Completed' },
  { key: 'progress', label: 'In progress' },
  { key: 'missed', label: 'Not started' },
  { key: 'upcoming', label: 'Upcoming' },
];
/** A start within this many minutes after the scheduled time counts as on time. */
const ON_TIME_GRACE_MIN = 15;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },

  // Summary band
  band: { backgroundColor: t.primary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  bandTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center' as const, justifyContent: 'center' as const },
  bandTitle: { ...typography.title, color: '#FFFFFF' },
  bandSub: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  dateBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.lg,
    marginTop: spacing.sm,
    height: 48,
  },
  dateNav: { width: 48, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const },
  dateCenter: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  dateText: { ...typography.bodyMedium, color: '#FFFFFF' },
  kpis: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  kpi: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: radii.lg, paddingVertical: spacing.sm, alignItems: 'center' as const },
  kpiValue: { ...typography.title, color: t.textPrimary },
  kpiLabel: { ...typography.caption, color: t.textMuted, marginTop: 1, textAlign: 'center' as const },

  // Filters
  filters: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.xs },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  chipOn: { backgroundColor: t.textPrimary, borderColor: t.textPrimary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.surface },
  chipCount: { ...typography.caption, color: t.textMuted },
  chipCountOn: { color: t.surface },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl },

  // One sales person
  person: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...t.cardShadow,
  },
  personHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.bodyMedium, color: t.primary },
  personText: { flex: 1 },
  personName: { ...typography.subtitle, color: t.textPrimary },
  personMeta: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  progress: { height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' as const, flexDirection: 'row' as const },
  progressFill: { height: 6 },

  // One visit on the person's timeline
  visit: { flexDirection: 'row' as const, marginTop: spacing.md },
  rail: { width: 56, alignItems: 'center' as const },
  railTime: { ...typography.captionMedium, color: t.textPrimary },
  railAmpm: { ...typography.caption, color: t.textMuted },
  railDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  railLine: { flex: 1, width: 2, backgroundColor: t.border, marginTop: 4 },
  visitCard: {
    flex: 1,
    backgroundColor: t.background,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  visitTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  company: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  metaRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: spacing.xs },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  metaText: { ...typography.caption, color: t.textMuted },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill },
  pillText: { ...typography.caption, fontWeight: '600' as const },
  outcome: {
    ...typography.caption,
    color: t.textSecondary,
    lineHeight: 18,
    backgroundColor: t.surface,
    borderLeftWidth: 3,
    borderLeftColor: t.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'flex-end' as const, gap: 2 },
  openText: { ...typography.captionMedium, color: t.primary },
});

function stateOf(v: api.TeamVisit, now: Date): State {
  if (v.status === 'CANCELLED') return 'cancelled';
  if (v.status === 'COMPLETED' || v.checkOutAt) return 'done';
  if (v.checkInAt) return 'progress';
  return scheduledAt(v) < now ? 'missed' : 'upcoming';
}

function scheduledAt(v: api.TeamVisit): Date {
  const [y, m, d] = v.date.split('-').map(Number);
  const [hh, mm] = v.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0);
}

const at = (s: string) => new Date(s.replace(' ', 'T'));
const clockOf = (s: string) => fmtTime(s.split(' ')[1] ?? '');
/** The time, with the date in front when it was not the visit's own day. */
const whenOn = (s: string, day: string) => (s.slice(0, 10) === day ? clockOf(s) : `${fmtDateShort(s.slice(0, 10))}, ${clockOf(s)}`);

/** Minutes after the scheduled time the visit was started (negative = early). */
function lateBy(v: api.TeamVisit): number | null {
  if (!v.checkInAt) return null;
  return Math.round((at(v.checkInAt).getTime() - scheduledAt(v).getTime()) / 60000);
}

function minutesText(mins: number): string {
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Visit length in minutes, when it was both started and ended. */
function durationMins(v: api.TeamVisit): number | null {
  if (!v.checkInAt || !v.checkOutAt) return null;
  const mins = Math.round((at(v.checkOutAt).getTime() - at(v.checkInAt).getTime()) / 60000);
  return mins > 0 ? mins : null;
}

/** "14:30:00" -> ["2:30", "PM"]. */
function splitTime(time: string): [string, string] {
  const [clock, ampm] = fmtTime(time).split(' ');
  return [clock, ampm ?? ''];
}

function Pill({ text, tone }: { text: string; tone: Tone }) {
  const { styles, theme } = useCrmStyles(factory);
  const c = toneColors(theme, tone);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

function VisitItem({ v, last, now, onOpen }: { v: api.TeamVisit; last: boolean; now: Date; onOpen: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const st = stateOf(v, now);
  const meta = STATE_META[st];
  const c = toneColors(theme, meta.tone);
  const [clock, ampm] = splitTime(v.time);
  const late = lateBy(v);
  const dur = durationMins(v);
  const startTone = toneColors(theme, 'success');
  const endTone = toneColors(theme, 'info');

  return (
    <View style={styles.visit}>
      <View style={styles.rail}>
        <Text style={styles.railTime}>{clock}</Text>
        <Text style={styles.railAmpm}>{ampm}</Text>
        <View style={[styles.railDot, { backgroundColor: c.fg }]} />
        {!last && <View style={styles.railLine} />}
      </View>
      <Pressable onPress={onOpen} accessibilityRole="button" style={({ pressed }) => [styles.visitCard, pressed && { opacity: 0.92 }]}>
        <View style={styles.visitTop}>
          <Text style={styles.company} numberOfLines={1}>
            {v.company || 'Lead'}
          </Text>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            {v.type === 'OFFICE' ? <UsersIcon size={12} color={theme.textMuted} /> : <BriefcaseIcon size={12} color={theme.textMuted} />}
            <Text style={styles.metaText}>{v.type === 'OFFICE' ? 'Office meeting' : 'Site visit'}</Text>
          </View>
          {!!v.leadBy && (
            <View style={styles.meta}>
              <PersonIcon size={12} color={theme.textMuted} />
              <Text style={styles.metaText}>Lead by {v.leadBy}</Text>
            </View>
          )}
        </View>

        {(late !== null || dur !== null) && (
          <View style={styles.metaRow}>
            {late !== null && (late <= ON_TIME_GRACE_MIN ? <Pill text={late < 0 ? 'Started early' : 'On time'} tone="success" /> : <Pill text={`Started ${minutesText(late)} late`} tone="warning" />)}
            {dur !== null && <Pill text={`Visit ${minutesText(dur)}`} tone="info" />}
          </View>
        )}

        {!!v.checkInAt && <PlaceLine label="Started" time={whenOn(v.checkInAt, v.date)} coords={v.checkInCoords} tone={startTone} />}
        {!!v.checkOutAt && <PlaceLine label="Ended" time={whenOn(v.checkOutAt, v.date)} coords={v.checkOutCoords} tone={endTone} />}
        {st === 'missed' && <Pill text="Time passed - visit not started" tone="danger" />}

        {!!v.outcomeNotes && <Text style={styles.outcome}>{v.outcomeNotes}</Text>}

        <View style={styles.openRow}>
          <Text style={styles.openText}>Open visit</Text>
          <ChevronRightIcon size={14} color={theme.primary} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Team visits, for the sales manager: one day's site visits and meetings across the team, grouped
 * by sales person. For every visit - when it was due, whether it was started on time, where it was
 * started and ended (the place in words, and a Map button for the exact GPS point), how long it
 * took, how it went, and who brought in the lead. Visits whose time passed without a start are
 * flagged.
 */
export function TeamVisitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const [date, setDate] = useState(todayStr());
  const [filter, setFilter] = useState<Filter>('all');

  const loader = useCallback(() => api.teamVisits(date), [date]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load team visits.');

  const now = new Date();
  const visits = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, done: 0, progress: 0, missed: 0, upcoming: 0, cancelled: 0 };
    for (const v of visits) {
      const st = stateOf(v, new Date());
      if (st === 'cancelled') continue;
      c.all += 1;
      c[st] += 1;
    }
    return c;
  }, [visits]);

  const kpis = useMemo(() => {
    const started = visits.filter((v) => v.checkInAt);
    const onTime = started.filter((v) => (lateBy(v) ?? 0) <= ON_TIME_GRACE_MIN).length;
    const durs = visits.map(durationMins).filter((m): m is number => m !== null);
    return {
      onTimePct: started.length ? Math.round((onTime / started.length) * 100) : null,
      avg: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
    };
  }, [visits]);

  // Grouped by sales person, the busiest first.
  const groups = useMemo(() => {
    const byPerson = new Map<string, { id: string; name: string; visits: api.TeamVisit[] }>();
    for (const v of visits) {
      const st = stateOf(v, new Date());
      if (st === 'cancelled' || (filter !== 'all' && st !== filter)) continue;
      const g = byPerson.get(v.salesEmployeeId) ?? { id: v.salesEmployeeId, name: v.salesName || 'Unassigned', visits: [] };
      g.visits.push(v);
      byPerson.set(v.salesEmployeeId, g);
    }
    return [...byPerson.values()].sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name));
  }, [visits, filter]);

  const dayLabel = date === todayStr() ? 'Today' : date === addDays(todayStr(), -1) ? 'Yesterday' : date === addDays(todayStr(), 1) ? 'Tomorrow' : fmtDateShort(date);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        stickyHeaderIndices={[1]}
      >
        <View style={[styles.band, { paddingTop: insets.top + spacing.xs }]}>
          <View style={styles.bandTop}>
            <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
              <ChevronLeftIcon size={20} color="#FFFFFF" />
            </Pressable>
            <View>
              <Text style={styles.bandTitle}>Team visits</Text>
              <Text style={styles.bandSub}>Who visited where, and when</Text>
            </View>
          </View>

          <View style={styles.dateBar}>
            <Pressable onPress={() => setDate((d) => addDays(d, -1))} accessibilityLabel="Previous day" style={styles.dateNav}>
              <ChevronLeftIcon size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={() => setDate(todayStr())} style={styles.dateCenter} accessibilityLabel="Go to today">
              <CalendarIcon size={17} color="#FFFFFF" />
              <Text style={styles.dateText}>
                {dayLabel}
                {dayLabel !== fmtDateShort(date) ? ` · ${fmtDateShort(date)}` : ''}
              </Text>
            </Pressable>
            <Pressable onPress={() => setDate((d) => addDays(d, 1))} accessibilityLabel="Next day" style={styles.dateNav}>
              <ChevronRightIcon size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{data ? counts.all : '-'}</Text>
              <Text style={styles.kpiLabel}>Visits</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={[styles.kpiValue, { color: theme.success }]}>{data ? counts.done : '-'}</Text>
              <Text style={styles.kpiLabel}>Completed</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{kpis.onTimePct === null ? '-' : `${kpis.onTimePct}%`}</Text>
              <Text style={styles.kpiLabel}>On time</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{kpis.avg === null ? '-' : kpis.avg < 60 ? `${kpis.avg}m` : `${Math.floor(kpis.avg / 60)}h`}</Text>
              <Text style={styles.kpiLabel}>Avg visit</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: theme.background }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                  <Text style={[styles.chipCount, on && styles.chipCountOn]}>{counts[f.key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.body}>
          <CrmErrorBanner message={error} onRetry={reload} />
          {loading && !data && [0, 1].map((i) => <CrmSkeleton key={i} height={260} radius={radii.xl} style={{ marginBottom: spacing.lg }} />)}

          {!!data && groups.length === 0 && !error && (
            <CrmEmptyState
              title={filter === 'all' ? `No visits ${date === todayStr() ? 'today' : 'on this day'}` : `No ${STATE_META[filter as State].label.toLowerCase()} visits`}
              subtitle="Site visits and meetings scheduled for your team show up here."
              icon={<CalendarIcon size={30} color={theme.textMuted} />}
            />
          )}

          {groups.map((g) => {
            const done = g.visits.filter((v) => stateOf(v, now) === 'done').length;
            const ongoing = g.visits.filter((v) => stateOf(v, now) === 'progress').length;
            const pct = (n: number) => `${(n / g.visits.length) * 100}%` as const;
            return (
              <View key={g.id} style={styles.person}>
                <View style={styles.personHead}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(g.name)}</Text>
                  </View>
                  <View style={styles.personText}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={styles.personMeta}>
                      {g.visits.length === 1 ? '1 visit' : `${g.visits.length} visits`} · {done} completed
                      {ongoing ? ` · ${ongoing} in progress` : ''}
                    </Text>
                  </View>
                  {done === g.visits.length && <CheckCircleIcon size={22} color={theme.success} />}
                  {done !== g.visits.length && <ClockIcon size={20} color={theme.textMuted} />}
                </View>
                <View style={styles.progress}>
                  <View style={[styles.progressFill, { width: pct(done), backgroundColor: theme.success }]} />
                  <View style={[styles.progressFill, { width: pct(ongoing), backgroundColor: theme.warning }]} />
                </View>
                {g.visits.map((v, i) => (
                  <VisitItem key={v.id} v={v} now={now} last={i === g.visits.length - 1} onOpen={() => navigation.navigate('LeadMeeting', { meetingId: v.id })} />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
