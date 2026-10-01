import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';
import { addDays, isActive, isOverdue, MONTHS_LONG, parseDate, toDateStr, todayStr, WEEKDAYS } from '../format';
import type { TaskStackParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import type { WorkTask } from '../types';
import { Avatar } from '../ui/parts';

type Period = 'week' | 'month';

/** Local calendar date of an ISO timestamp (completed_at / created_at). */
const localDay = (iso: string) => toDateStr(new Date(iso));

/** [start, end] of the current and the previous period, as 'YYYY-MM-DD'. */
function ranges(period: Period) {
  const today = todayStr();
  if (period === 'week') {
    const offset = (parseDate(today).getDay() + 6) % 7; // Monday-based week
    const start = addDays(today, -offset);
    return { cur: [start, addDays(start, 6)], prev: [addDays(start, -7), addDays(start, -1)] };
  }
  const d = parseDate(today);
  const start = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  const end = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const prevStart = toDateStr(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const prevEnd = toDateStr(new Date(d.getFullYear(), d.getMonth(), 0));
  return { cur: [start, end], prev: [prevStart, prevEnd] };
}

const within = (day: string, [a, b]: string[]) => day >= a && day <= b;

function fmtDuration(ms: number): string {
  const hours = ms / 3600000;
  if (hours < 24) return `${Math.max(1, Math.round(hours))} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  title: { ...typography.display, color: t.textPrimary },
  seg: { flexDirection: 'row' as const, backgroundColor: t.surfaceAlt, borderRadius: radii.pill, padding: 3 },
  segBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  segOn: { backgroundColor: t.primary },
  segText: { ...typography.captionMedium, color: t.textSecondary },
  segTextOn: { color: t.textOnPrimary },
  hero: { marginTop: spacing.md, borderRadius: 24, padding: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, overflow: 'hidden' as const },
  ringWrap: { width: 100, height: 100 },
  ringCenter: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' as const, justifyContent: 'center' as const },
  ringValue: { ...typography.title, color: '#FFFFFF' },
  ringLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  heroBig: { ...typography.display, fontSize: 26, lineHeight: 31, color: '#FFFFFF' },
  trend: { alignSelf: 'flex-start' as const, marginTop: spacing.xs, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radii.pill, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  trendText: { ...typography.captionMedium, fontSize: 11.5, color: '#FFFFFF' },
  minis: { flexDirection: 'row' as const, gap: spacing.xs, marginTop: spacing.sm },
  mini: { flex: 1, alignItems: 'center' as const, backgroundColor: t.surface, borderRadius: radii.lg, paddingVertical: spacing.sm, ...t.cardShadow },
  miniDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  miniValue: { ...typography.subtitle, color: t.textPrimary },
  miniLabel: { fontSize: 10.5, color: t.textMuted },
  card: { backgroundColor: t.surface, borderRadius: 20, padding: spacing.md, marginTop: spacing.sm, ...t.cardShadow },
  cardHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  cardTitle: { ...typography.bodyMedium, fontSize: 15, color: t.textPrimary },
  cardHint: { ...typography.caption, color: t.textMuted },
  bars: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: spacing.xs, height: 110, marginTop: spacing.sm },
  bar: { flex: 1, alignItems: 'center' as const, gap: 4 },
  barNum: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted },
  barCol: { width: '100%' as const, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, overflow: 'hidden' as const },
  barDay: { fontSize: 10.5, color: t.textMuted },
  person: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm },
  personName: { ...typography.captionMedium, fontSize: 13, color: t.textPrimary, flexShrink: 1 },
  personMeta: { ...typography.caption, color: t.textMuted },
  personHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.xs },
  track: { height: 7, borderRadius: 4, backgroundColor: t.surfaceAlt, marginTop: 5, flexDirection: 'row' as const, overflow: 'hidden' as const },
  empty: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, paddingVertical: spacing.md },
  pressed: { opacity: 0.7 },
});

/** The hero card's blue gradient + a soft circle. */
function HeroBackground() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((p) => (p && p.w === width && p.h === height ? p : { w: width, h: height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {!!size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="insHero" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5C8DF7" />
              <Stop offset="0.5" stopColor="#2563EB" />
              <Stop offset="1" stopColor="#1E3FBF" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#insHero)" />
          <Circle cx={size.w * 0.95} cy={-size.h * 0.1} r={size.h * 0.85} fill="#FFFFFF" fillOpacity={0.1} />
        </Svg>
      )}
    </View>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={100} height={100}>
      <Circle cx={50} cy={50} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={9} fill="none" />
      {percent > 0 && (
        <Circle
          cx={50}
          cy={50}
          r={r}
          stroke="#FFFFFF"
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          transform="rotate(-90 50 50)"
        />
      )}
    </Svg>
  );
}

/**
 * Insights tab - how the viewer's own work is going this week / month, plus
 * (for managers) each team member's workload. Worked out entirely from the
 * task list the app already loads; nothing new is fetched.
 */
export function TaskInsightsScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { tasks, viewer, refreshing, refresh } = useTasks();
  const [period, setPeriod] = useState<Period>('month');

  const mine = useMemo(() => tasks.filter((x) => x.assigned_to === viewer.id && x.status !== 'CANCELLED'), [tasks, viewer.id]);

  const data = useMemo(() => {
    const { cur, prev } = ranges(period);
    const doneIn = (range: string[]) => mine.filter((x) => x.status === 'COMPLETED' && x.completed_at && within(localDay(x.completed_at), range));
    const done = doneIn(cur);
    const prevDone = doneIn(prev);
    const onTime = done.filter((x) => !x.due_date || localDay(x.completed_at!) <= x.due_date).length;
    const durations = done
      .map((x) => new Date(x.completed_at!).getTime() - new Date(x.started_at || x.created_at).getTime())
      .filter((ms) => ms > 0);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    // Week: one bar per day (Mon-Sun). Month: one bar per week of the month.
    let bars: { label: string; value: number; current: boolean }[];
    if (period === 'week') {
      bars = Array.from({ length: 7 }, (_, i) => {
        const day = addDays(cur[0], i);
        return {
          label: WEEKDAYS[parseDate(day).getDay()],
          value: done.filter((x) => localDay(x.completed_at!) === day).length,
          current: day === todayStr(),
        };
      });
    } else {
      const weeks: { label: string; value: number; current: boolean }[] = [];
      for (let s = cur[0], i = 1; s <= cur[1]; s = addDays(s, 7), i++) {
        const e = addDays(s, 6) < cur[1] ? addDays(s, 6) : cur[1];
        weeks.push({
          label: `W${i}`,
          value: done.filter((x) => within(localDay(x.completed_at!), [s, e])).length,
          current: within(todayStr(), [s, e]),
        });
      }
      bars = weeks;
    }

    return {
      completed: done.length,
      delta: done.length - prevDone.length,
      onTimePct: done.length ? Math.round((onTime / done.length) * 100) : 0,
      inProgress: mine.filter((x) => x.status === 'IN_PROGRESS').length,
      overdue: mine.filter(isOverdue).length,
      avg: avg === null ? '—' : fmtDuration(avg),
      high: mine.filter((x) => isActive(x) && x.priority === 'HIGH').length,
      bars,
    };
  }, [mine, period]);

  const workload = useMemo(() => {
    const byPerson = (id: number) => tasks.filter((x: WorkTask) => x.assigned_to === id);
    return viewer.team
      .map((m) => {
        const list = byPerson(m.id);
        return { member: m, active: list.filter(isActive).length, overdue: list.filter(isOverdue).length };
      })
      .sort((a, b) => b.overdue - a.overdue || b.active - a.active)
      .slice(0, 8);
  }, [tasks, viewer.team]);
  const maxLoad = Math.max(1, ...workload.map((w) => w.active));
  const maxBar = Math.max(1, ...data.bars.map((b) => b.value));

  const now = parseDate(todayStr());
  const prevName = period === 'week' ? 'last week' : MONTHS_LONG[(now.getMonth() + 11) % 12];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <View style={styles.top}>
          <Text style={styles.title}>Insights</Text>
          <View style={styles.seg}>
            {(['week', 'month'] as const).map((p) => (
              <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.segBtn, period === p && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: period === p }}>
                <Text style={[styles.segText, period === p && styles.segTextOn]}>{p === 'week' ? 'Week' : 'Month'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.hero}>
          <HeroBackground />
          <View style={styles.ringWrap}>
            <Ring percent={data.onTimePct} />
            <View style={styles.ringCenter}>
              <Text style={styles.ringValue}>{data.completed ? `${data.onTimePct}%` : '—'}</Text>
              <Text style={styles.ringLabel}>on time</Text>
            </View>
          </View>
          <View style={styles.flex1}>
            <Text style={styles.heroBig}>{data.completed} completed</Text>
            <View style={styles.trend}>
              <Text style={styles.trendText}>
                {data.delta === 0 ? `Same as ${prevName}` : `${data.delta > 0 ? '▲' : '▼'} ${Math.abs(data.delta)} ${data.delta > 0 ? 'more' : 'fewer'} than ${prevName}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.minis}>
          {(
            [
              [String(data.inProgress), 'In progress', theme.accent],
              [String(data.overdue), 'Overdue', theme.danger],
              [data.avg, 'Avg. to finish', theme.success],
              [String(data.high), 'High priority', theme.warning],
            ] as const
          ).map(([value, label, color]) => (
            <View key={label} style={styles.mini}>
              <View style={[styles.miniDot, { backgroundColor: color }]} />
              <Text style={styles.miniValue}>{value}</Text>
              <Text style={styles.miniLabel} numberOfLines={1}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{period === 'week' ? 'Completed this week' : 'Completed by week'}</Text>
            <Text style={styles.cardHint}>{period === 'week' ? 'Mon – Sun' : MONTHS_LONG[now.getMonth()]}</Text>
          </View>
          <View style={styles.bars}>
            {data.bars.map((b) => {
              const h = b.value ? Math.max(10, (b.value / maxBar) * 72) : 4;
              const [from, to] = b.current ? ['#F87171', theme.crestRed] : ['#93C5FD', theme.primary];
              return (
                <View key={b.label} style={styles.bar}>
                  <Text style={styles.barNum}>{b.value}</Text>
                  <View style={[styles.barCol, { height: h, opacity: b.value ? 1 : 0.35 }]}>
                    <Svg width="100%" height={h}>
                      <Defs>
                        <LinearGradient id={`bar${b.label}`} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={from} />
                          <Stop offset="1" stopColor={to} />
                        </LinearGradient>
                      </Defs>
                      <Rect x={0} y={0} width="100%" height={h} fill={`url(#bar${b.label})`} />
                    </Svg>
                  </View>
                  <Text style={styles.barDay}>{b.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {viewer.team.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Team workload</Text>
              <Text style={styles.cardHint}>active · overdue</Text>
            </View>
            {workload.every((w) => w.active === 0) && <Text style={styles.empty}>Nobody on your team has open tasks.</Text>}
            {workload
              .filter((w) => w.active > 0)
              .map(({ member, active, overdue }) => (
                <Pressable
                  key={member.id}
                  style={({ pressed }) => [styles.person, pressed && styles.pressed]}
                  onPress={() => navigation.navigate('TaskTabs', { screen: 'Tasks', params: { mode: 'all', q: member.name } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${member.name}: ${active} active, ${overdue} overdue`}
                >
                  <Avatar name={member.name} id={member.id} size={32} />
                  <View style={styles.flex1}>
                    <View style={styles.personHead}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={styles.personMeta}>
                        {active} active{overdue ? ` · ${overdue} overdue` : ''}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={{ width: `${((active - overdue) / maxLoad) * 100}%`, backgroundColor: theme.primary }} />
                      {overdue > 0 && <View style={{ width: `${(overdue / maxLoad) * 100}%`, backgroundColor: theme.danger }} />}
                    </View>
                  </View>
                </Pressable>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
