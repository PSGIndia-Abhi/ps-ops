import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { CalendarIcon, PlusIcon, SunIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import { addDays, byDue, fmtDate, fmtTime, isOverdue, parseDate, todayStr, WEEKDAYS } from '../format';
import type { TaskStackParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { PRIORITY_META, toneSolid } from '../theme';
import type { WorkTask } from '../types';
import { Avatar, TaskStatePill } from '../ui/parts';
import { DateSheet } from '../ui/sheets';
import { MoonIcon, SunsetIcon } from '../ui/taskIcons';

type Filter = 'all' | 'mine' | 'team' | 'high';
const DAY_W = 56;
const RANGE_BEFORE = 21;
const RANGE_AFTER = 60;

const PERIODS = [
  { key: 'morning', label: 'Morning', Icon: SunIcon, match: (h: number | null) => h !== null && h < 12 },
  { key: 'afternoon', label: 'Afternoon', Icon: SunsetIcon, match: (h: number | null) => h !== null && h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', Icon: MoonIcon, match: (h: number | null) => h !== null && h >= 17 },
  { key: 'any', label: 'Any time', Icon: CalendarIcon, match: (h: number | null) => h === null },
] as const;

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.md },
  headerText: { flex: 1 },
  title: { ...typography.title, fontSize: 25, lineHeight: 31, fontWeight: '800' as const, color: t.textPrimary },
  dateRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: 2 },
  date: { ...typography.caption, fontSize: 13.5, color: t.textMuted },
  todayPill: { backgroundColor: t.primarySoftBg, borderRadius: radii.pill, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  todayText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.primary },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  roundBtnPrimary: {
    backgroundColor: t.primary,
    borderColor: t.primary,
    elevation: 6,
    shadowColor: t.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  strip: { gap: spacing.xs, paddingBottom: spacing.xs },
  day: {
    width: DAY_W,
    alignItems: 'center' as const,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  dayOn: { backgroundColor: t.primary, borderColor: t.primary },
  dayToday: { borderColor: t.primary },
  dayName: { ...typography.caption, color: t.textMuted },
  dayNum: { ...typography.subtitle, color: t.textPrimary, marginTop: 2 },
  onPrimary: { color: t.textOnPrimary },
  busyDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  chips: { gap: spacing.xs, marginTop: spacing.md },
  chip: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: t.surfaceAlt },
  chipOn: { backgroundColor: t.primary },
  chipText: { ...typography.captionMedium, fontSize: 14, color: t.textSecondary },
  overdue: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: t.dangerBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  overdueText: { ...typography.captionMedium, color: t.dangerText, flex: 1 },
  overdueLink: { ...typography.captionMedium, color: t.dangerText, textDecorationLine: 'underline' as const },
  periodHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.sm },
  periodText: { ...typography.subtitle, color: t.textPrimary },
  card: {
    flexDirection: 'row' as const,
    gap: spacing.md,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden' as const,
    ...t.cardShadow,
  },
  accent: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 4 },
  time: { width: 56 },
  timeText: { ...typography.subtitle, color: t.textPrimary },
  ampm: { ...typography.caption, color: t.textMuted },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary },
  cardDesc: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  cardBottom: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm },
  person: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, flexShrink: 1 },
  personName: { ...typography.caption, color: t.textSecondary, flexShrink: 1 },
  empty: { marginTop: spacing.lg },
});

/** Calendar tab - tasks for one day, grouped by time of day. */
export function TaskScheduleScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { tasks, viewer, refresh, refreshing } = useTasks();
  const today = todayStr();
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const stripRef = useRef<FlatList<string>>(null);

  // A strip anchored on the selected day, so jumping via the calendar re-centres it.
  const [anchor, setAnchor] = useState(today);
  const days = useMemo(() => Array.from({ length: RANGE_BEFORE + RANGE_AFTER }, (_, i) => addDays(anchor, i - RANGE_BEFORE)), [anchor]);

  useEffect(() => {
    const idx = days.indexOf(selected);
    if (idx < 0) {
      setAnchor(selected);
      return;
    }
    stripRef.current?.scrollToIndex({ index: Math.max(0, idx - 2), animated: true });
  }, [selected, days]);

  const busyDays = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((x) => x.due_date && x.status !== 'CANCELLED' && s.add(x.due_date));
    return s;
  }, [tasks]);

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((x) => x.due_date === selected && x.status !== 'CANCELLED')
        .filter((x) =>
          filter === 'mine' ? x.assigned_to === viewer.id : filter === 'team' ? x.assigned_to !== viewer.id : filter === 'high' ? x.priority === 'HIGH' : true,
        )
        .sort(byDue),
    [tasks, selected, filter, viewer.id],
  );

  const overdueCount = useMemo(() => (selected === today ? tasks.filter(isOverdue).length : 0), [tasks, selected, today]);
  const groups = PERIODS.map((p) => ({ ...p, items: dayTasks.filter((x) => p.match(x.due_time ? Number(x.due_time.slice(0, 2)) : null)) })).filter(
    (g) => g.items.length > 0,
  );
  const filters: [Filter, string][] = [
    ['all', 'All'],
    ['mine', 'Mine'],
    ...(viewer.team.length > 0 ? ([['team', 'Team']] as [Filter, string][]) : []),
    ['high', 'High priority'],
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Task Schedule</Text>
            <View style={styles.dateRow}>
              <Text style={styles.date}>{fmtDate(selected)}</Text>
              {/* Only while looking at another day - one tap back to today. */}
              {selected !== today && (
                <Pressable style={styles.todayPill} onPress={() => setSelected(today)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go to today">
                  <Text style={styles.todayText}>↺ Today</Text>
                </Pressable>
              )}
            </View>
          </View>
          <Pressable style={[styles.roundBtn, styles.roundBtnPrimary]} onPress={() => navigation.navigate('NewTask', { date: selected })} accessibilityRole="button" accessibilityLabel="New task for this day">
            <PlusIcon size={22} color={theme.textOnPrimary} />
          </Pressable>
          <Pressable style={styles.roundBtn} onPress={() => setCalendarOpen(true)} accessibilityRole="button" accessibilityLabel="Open month calendar">
            <CalendarIcon size={20} color={theme.primary} />
          </Pressable>
        </View>

        <FlatList
          ref={stripRef}
          horizontal
          data={days}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(0, days.indexOf(selected) - 2)}
          getItemLayout={(_, index) => ({ length: DAY_W + spacing.xs, offset: (DAY_W + spacing.xs) * index, index })}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={styles.strip}
          renderItem={({ item }) => {
            const on = item === selected;
            const d = parseDate(item);
            return (
              <Pressable onPress={() => setSelected(item)} style={[styles.day, item === today && styles.dayToday, on && styles.dayOn]} accessibilityRole="button">
                <Text style={[styles.dayName, on && styles.onPrimary]}>{WEEKDAYS[d.getDay()]}</Text>
                <Text style={[styles.dayNum, on && styles.onPrimary]}>{d.getDate()}</Text>
                <View style={[styles.busyDot, { backgroundColor: busyDays.has(item) ? (on ? theme.textOnPrimary : theme.primary) : 'transparent' }]} />
              </Pressable>
            );
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filters.map(([k, label]) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: filter === k }}>
              <Text style={[styles.chipText, filter === k && styles.onPrimary]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {overdueCount > 0 && (
          <Pressable style={styles.overdue} onPress={() => navigation.navigate('TaskTabs', { screen: 'Tasks', params: { mode: 'overdue' } })}>
            <Text style={styles.overdueText}>
              {overdueCount} overdue task{overdueCount === 1 ? '' : 's'} from earlier days
            </Text>
            <Text style={styles.overdueLink}>View</Text>
          </Pressable>
        )}

        {groups.length === 0 && (
          <View style={styles.empty}>
            <CrmEmptyState
              title="Nothing scheduled"
              subtitle={selected === today ? 'No tasks due today.' : `No tasks due on ${fmtDate(selected)}.`}
              icon={<CalendarIcon size={30} color={theme.textMuted} />}
            />
          </View>
        )}

        {groups.map((g) => (
          <View key={g.key}>
            <View style={styles.periodHead}>
              <g.Icon size={20} color={theme.primary} />
              <Text style={styles.periodText}>{g.label}</Text>
            </View>
            {g.items.map((x) => (
              <ScheduleCard key={x.id} task={x} onPress={() => navigation.navigate('TaskDetail', { taskId: x.id })} />
            ))}
          </View>
        ))}
      </ScrollView>

      <DateSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} value={selected} onPick={setSelected} title="Jump to date" />
    </SafeAreaView>
  );
}

function ScheduleCard({ task, onPress }: { task: WorkTask; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const time = fmtTime(task.due_time);
  const [hm, ampm] = time ? time.split(' ') : ['—', ''];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={[styles.accent, { backgroundColor: toneSolid(theme, PRIORITY_META[task.priority].tone) }]} />
      <View style={styles.time}>
        <Text style={styles.timeText}>{hm}</Text>
        <Text style={styles.ampm}>{ampm}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {task.description}
          </Text>
        )}
        <View style={styles.cardBottom}>
          <View style={styles.person}>
            <Avatar name={task.assigned_to_name} id={task.assigned_to} size={24} />
            <Text style={styles.personName} numberOfLines={1}>
              {task.assigned_to_name}
            </Text>
          </View>
          <TaskStatePill task={task} />
        </View>
      </View>
    </Pressable>
  );
}
