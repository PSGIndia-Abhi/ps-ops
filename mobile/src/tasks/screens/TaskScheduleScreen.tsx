import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { CalendarIcon, PersonIcon, PlusIcon, SunIcon, UsersIcon } from '../../components/icons';
import { addDays, byDue, fmtDate, fmtTime, isOverdue, parseDate, todayStr, WEEKDAYS } from '../format';
import type { TaskStackParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { cardShadow, font, PRIORITY_META, radius, t } from '../theme';
import type { WorkTask } from '../types';
import { Backdrop } from '../ui/Backdrop';
import { AvatarStack, Chip, CircleButton, EmptyBlock, StatusPill } from '../ui/primitives';
import { ActionSheet, DateSheet } from '../ui/sheets';
import { DotsIcon, MoonIcon, SunsetIcon } from '../ui/taskIcons';

type Filter = 'all' | 'mine' | 'team' | 'high';
const DAY_W = 60;
const RANGE_BEFORE = 21;
const RANGE_AFTER = 60;

const PERIODS = [
  { key: 'morning', label: 'Morning', icon: SunIcon, match: (h: number | null) => h !== null && h < 12 },
  { key: 'afternoon', label: 'Afternoon', icon: SunsetIcon, match: (h: number | null) => h !== null && h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', icon: MoonIcon, match: (h: number | null) => h !== null && h >= 17 },
  { key: 'any', label: 'Any time', icon: CalendarIcon, match: (h: number | null) => h === null },
] as const;

export function TaskScheduleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const { tasks, viewer, refresh, refreshing } = useTasks();
  const [selected, setSelected] = useState(todayStr());
  const [filter, setFilter] = useState<Filter>('all');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const stripRef = useRef<FlatList<string>>(null);
  const today = todayStr();

  // A strip anchored on the selected day's week, so jumping via the calendar re-centres it.
  const [anchor, setAnchor] = useState(today);
  const days = useMemo(
    () => Array.from({ length: RANGE_BEFORE + RANGE_AFTER }, (_, i) => addDays(anchor, i - RANGE_BEFORE)),
    [anchor],
  );

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

  const dayTasks = useMemo(() => {
    return tasks
      .filter((x) => x.due_date === selected && x.status !== 'CANCELLED')
      .filter((x) =>
        filter === 'mine'
          ? x.assigned_to === viewer.id
          : filter === 'team'
            ? x.assigned_to !== viewer.id
            : filter === 'high'
              ? x.priority === 'HIGH'
              : true,
      )
      .sort(byDue);
  }, [tasks, selected, filter, viewer.id]);

  const overdueCount = useMemo(() => (selected === today ? tasks.filter(isOverdue).length : 0), [tasks, selected, today]);

  const groups = PERIODS.map((p) => ({
    ...p,
    items: dayTasks.filter((x) => p.match(x.due_time ? Number(x.due_time.slice(0, 2)) : null)),
  })).filter((g) => g.items.length > 0);

  const d = parseDate(selected);

  return (
    <View style={styles.flex}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerDate}>
            {WEEKDAYS[d.getDay()]}, {fmtDate(selected).split(', ')[1]}
          </Text>
          <CircleButton dark label="New task" size={56} onPress={() => navigation.navigate('NewTask', { date: selected })}>
            <PlusIcon size={22} color={t.onInk} />
          </CircleButton>
          <CircleButton label="More options" size={56} onPress={() => setMenuOpen(true)}>
            <DotsIcon size={20} color={t.ink} />
          </CircleButton>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Task{'\n'}Schedule</Text>
          <Pressable style={styles.calendarBtn} onPress={() => setCalendarOpen(true)} accessibilityRole="button">
            <View style={styles.calendarIcon}>
              <CalendarIcon size={20} color={t.ink} />
            </View>
            <Text style={styles.calendarText}>Calendar</Text>
          </Pressable>
        </View>

        <FlatList
          ref={stripRef}
          horizontal
          data={days}
          keyExtractor={(x) => x}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(0, days.indexOf(selected) - 2)}
          getItemLayout={(_, index) => ({ length: DAY_W + 8, offset: (DAY_W + 8) * index, index })}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={styles.strip}
          renderItem={({ item }) => {
            const on = item === selected;
            const dd = parseDate(item);
            return (
              <Pressable onPress={() => setSelected(item)} style={[styles.day, on && styles.dayOn]} accessibilityRole="button">
                <Text style={styles.dayName}>{WEEKDAYS[dd.getDay()]}</Text>
                <View style={[styles.dayNum, on && styles.dayNumOn, item === today && !on && styles.dayNumToday]}>
                  <Text style={[styles.dayNumText, on && { color: t.onInk }]}>{dd.getDate()}</Text>
                </View>
                <View style={[styles.busyDot, { opacity: busyDays.has(item) ? 1 : 0 }]} />
              </Pressable>
            );
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip
            label="Mine"
            icon={<PersonIcon size={18} color={filter === 'mine' ? t.onInk : t.ink} />}
            active={filter === 'mine'}
            onPress={() => setFilter('mine')}
          />
          {viewer.team.length > 0 && (
            <Chip
              label="Team"
              icon={<UsersIcon size={18} color={filter === 'team' ? t.onInk : t.ink} />}
              active={filter === 'team'}
              onPress={() => setFilter('team')}
            />
          )}
          <Chip label="High priority" active={filter === 'high'} onPress={() => setFilter('high')} />
        </ScrollView>

        {overdueCount > 0 && (
          <Pressable
            style={styles.overdueBanner}
            onPress={() => navigation.navigate('TaskTabs', { screen: 'Tasks', params: { mode: 'overdue' } })}
          >
            <Text style={styles.overdueText}>
              {overdueCount} overdue task{overdueCount === 1 ? '' : 's'} from earlier days
            </Text>
            <Text style={styles.overdueLink}>View</Text>
          </Pressable>
        )}

        {groups.length === 0 && (
          <View style={styles.emptyWrap}>
            <EmptyBlock
              icon={<CalendarIcon size={32} color={t.textMuted} />}
              title="Nothing scheduled"
              text={selected === today ? 'No tasks due today.' : `No tasks due on ${fmtDate(selected)}.`}
            />
          </View>
        )}

        {groups.map((g) => (
          <View key={g.key}>
            <View style={styles.periodHead}>
              <View style={styles.periodLabel}>
                <g.icon size={20} color={t.ink} />
                <Text style={styles.periodText}>{g.label}</Text>
              </View>
              <Text style={styles.periodSide}>{selected === today ? 'Today' : ''}</Text>
            </View>
            {g.items.map((x) => (
              <ScheduleCard key={x.id} task={x} onPress={() => navigation.navigate('TaskDetail', { taskId: x.id })} />
            ))}
          </View>
        ))}
      </ScrollView>

      <DateSheet visible={calendarOpen} onClose={() => setCalendarOpen(false)} value={selected} onPick={setSelected} title="Jump to date" />
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          { key: 'today', label: 'Go to today', icon: <CalendarIcon size={18} color={t.ink} />, onPress: () => setSelected(today) },
        ]}
      />
    </View>
  );
}

function ScheduleCard({ task, onPress }: { task: WorkTask; onPress: () => void }) {
  const time = fmtTime(task.due_time);
  const [hm, ampm] = time ? time.split(' ') : ['—', ''];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sCard, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <View style={styles.sTime}>
        <Text style={styles.sTimeText}>{hm}</Text>
        <Text style={styles.sAmpm}>{ampm}</Text>
        <View style={styles.sLineDot} />
        <View style={styles.sLine} />
      </View>
      <View style={styles.flex}>
        <View style={styles.sTitleRow}>
          <View style={[styles.sPriority, { backgroundColor: PRIORITY_META[task.priority].color }]} />
          <Text style={styles.sTitle} numberOfLines={2}>
            {task.title}
          </Text>
        </View>
        {!!task.description && (
          <Text style={styles.sDesc} numberOfLines={2}>
            {task.description}
          </Text>
        )}
        <View style={styles.sBottom}>
          <AvatarStack
            size={34}
            people={[
              { id: task.assigned_to, name: task.assigned_to_name },
              { id: task.created_by, name: task.created_by_name },
            ]}
          />
          <StatusPill status={task.status} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDate: { flex: 1, fontSize: 19, color: t.text, fontFamily: font.regular, marginLeft: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 34, marginBottom: 24 },
  title: { fontSize: 38, lineHeight: 46, color: t.text, fontFamily: font.regular, letterSpacing: -0.6 },
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.surface,
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: 20,
    height: 58,
  },
  calendarIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F2F1F4', alignItems: 'center', justifyContent: 'center' },
  calendarText: { fontSize: 16, color: t.text, fontFamily: font.medium },
  strip: { gap: 8, paddingRight: 20 },
  day: {
    width: DAY_W,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
    borderRadius: 30,
    backgroundColor: t.surfaceGlass,
  },
  dayOn: { backgroundColor: t.surface },
  dayName: { fontSize: 13, color: t.text, fontFamily: font.medium, marginBottom: 10 },
  dayNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECEBEF', alignItems: 'center', justifyContent: 'center' },
  dayNumOn: { backgroundColor: t.ink },
  dayNumToday: { borderWidth: 1.5, borderColor: t.limeDeep },
  dayNumText: { fontSize: 14, color: t.text, fontFamily: font.medium },
  busyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: t.limeDeep, marginTop: 6 },
  chips: { gap: 10, marginTop: 20, paddingRight: 20 },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  overdueText: { color: t.danger, fontSize: 13, fontFamily: font.medium, flex: 1 },
  overdueLink: { color: t.danger, fontSize: 13, fontFamily: font.medium, textDecorationLine: 'underline' },
  emptyWrap: { marginTop: 24 },
  periodHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  periodLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodText: { fontSize: 18, color: t.text, fontFamily: font.regular },
  periodSide: { fontSize: 14, color: t.textMuted },
  sCard: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  sTime: { width: 54, alignItems: 'flex-start' },
  sTimeText: { fontSize: 19, color: t.text, fontFamily: font.regular },
  sAmpm: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  sLineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C4C4CA', marginTop: 12, marginLeft: 8 },
  sLine: { width: 1, flex: 1, minHeight: 30, backgroundColor: '#D8D8DD', marginLeft: 10 },
  sTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sPriority: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  sTitle: { flex: 1, fontSize: 17, color: t.text, fontFamily: font.medium },
  sDesc: { fontSize: 12, color: t.textSecondary, marginTop: 8, lineHeight: 17 },
  sBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
});
