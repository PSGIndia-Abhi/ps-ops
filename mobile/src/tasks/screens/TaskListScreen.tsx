import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { AlertTriangleIcon, CalendarIcon, InboxIcon, MenuIcon, PersonIcon, PlayIcon, SunIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import { byNewest, isOverdue, LIST_MODES, todayStr, type ListMode } from '../format';
import type { TaskStackParamList, TaskTabParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { NotStartedSeries } from '../ui/NotStartedSeries';
import { TaskRow, inputStyle } from '../ui/parts';
import { ActionSheet } from '../ui/sheets';
import { SeriesSheet } from '../ui/SeriesSheet';
import { CheckIcon, ClipboardIcon, FlagIcon, RepeatIcon, SearchIcon, SwapIcon } from '../ui/taskIcons';
import type { WorkTask } from '../types';

const CHIP_ORDER: ListMode[] = ['all', 'today', 'overdue', 'my', 'upcoming', 'team', 'completed'];
const EXTRA_MODES: ListMode[] = ['progress', 'high', 'delegated'];
// Reached from a Home Quick Action tile: a single dedicated view, no chip row back into the others.
const BARE_MODES: ListMode[] = ['progress', 'high', 'completed', 'recurring'];
// Switching among just these, never into Team/All - a dedicated "my work" /
// "my team's work" view (which one depends on `teamScoped`, see below).
const MY_ONLY_MODES: ListMode[] = ['today', 'overdue', 'upcoming'];
const MY_RELATED_CHIPS: ListMode[] = ['my', 'today', 'overdue', 'upcoming'];
const TEAM_RELATED_CHIPS: ListMode[] = ['team', 'today', 'overdue', 'upcoming'];
const TEAM_LABEL: Partial<Record<ListMode, string>> = { today: 'Team Today', overdue: 'Team Overdue', upcoming: 'Team Upcoming' };
// "View all" on Home opens just My Tasks or Team Tasks - a single list, no chip row (see `focused` below).
const FOCUSED_LABEL: Partial<Record<ListMode, string>> = { my: 'My Tasks', team: 'Team Tasks' };
// The date/status part of today/overdue/upcoming, without LIST_MODES' own
// "assigned to me" baked in (today has it, overdue/upcoming don't) - lets the
// same three dates be scoped to either "mine" or "my team's" below.
function dateOnlyMatch(m: ListMode, t: WorkTask): boolean {
  if (m === 'today') return t.due_date === todayStr() && t.status !== 'CANCELLED';
  if (m === 'overdue') return isOverdue(t);
  if (m === 'upcoming') return t.status === 'OPEN' && !!t.due_date && !isOverdue(t);
  return false;
}
// "My Tasks" itself isn't a date filter - dateOnlyMatch doesn't know it, so fall back to its own LIST_MODES definition.
const myRelatedMatch = (m: ListMode, t: WorkTask, me: number) =>
  m === 'my' ? LIST_MODES.my.match(t, me) : t.assigned_to === me && dateOnlyMatch(m, t);
// Same proxy for "my team" the generic Team chip already uses: anyone visible who isn't me.
const teamRelatedMatch = (m: ListMode, t: WorkTask, me: number) =>
  m === 'team' ? LIST_MODES.team.match(t, me) : t.assigned_to !== me && dateOnlyMatch(m, t);

type DelegatedSub = 'all' | 'overdue' | 'progress' | 'completed';
const DELEGATED_SUBS: [DelegatedSub, string][] = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['progress', 'In Progress'],
  ['completed', 'Completed'],
];
/** Tasks I created for someone else - "Assigned by Me", regardless of their status. */
const isMyDelegated = (t: WorkTask, me: number) => t.created_by === me && t.assigned_to !== me;
function delegatedSubMatch(sub: DelegatedSub, t: WorkTask, me: number): boolean {
  if (!isMyDelegated(t, me)) return false;
  if (sub === 'overdue') return isOverdue(t);
  if (sub === 'progress') return t.status === 'IN_PROGRESS' || t.status === 'PAUSED';
  if (sub === 'completed') return t.status === 'COMPLETED';
  return true;
}

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

/** Icon + colour for each view in the "Show" sheet. */
function modeLook(m: ListMode, t: CrmTheme): { Icon: IconComp; color: string; bg: string } {
  switch (m) {
    case 'today':
      return { Icon: SunIcon, color: t.warningText, bg: t.warningBg };
    case 'overdue':
      return { Icon: AlertTriangleIcon, color: t.dangerText, bg: t.dangerBg };
    case 'my':
      return { Icon: PersonIcon, color: t.primary, bg: t.primarySoftBg };
    case 'upcoming':
      return { Icon: CalendarIcon, color: t.info, bg: t.infoBg };
    case 'team':
      return { Icon: UsersIcon, color: t.primary, bg: t.primarySoftBg };
    case 'completed':
      return { Icon: CheckIcon, color: t.successText, bg: t.successBg };
    case 'progress':
      return { Icon: PlayIcon, color: t.accentText, bg: t.accentBg };
    case 'high':
      return { Icon: FlagIcon, color: t.dangerText, bg: t.dangerBg };
    case 'delegated':
      return { Icon: SwapIcon, color: t.primary, bg: t.primarySoftBg };
    case 'recurring':
      return { Icon: RepeatIcon, color: t.accentText, bg: t.accentBg };
    default:
      return { Icon: ClipboardIcon, color: t.primary, bg: t.primarySoftBg };
  }
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.title, color: t.textPrimary, marginBottom: spacing.md },
  searchRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.md },
  search: { ...inputStyle(t), flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, paddingVertical: 0 },
  searchInput: { flex: 1, ...typography.body, color: t.textPrimary, minHeight: 48 },
  filterBtn: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chips: { gap: spacing.xs, paddingBottom: spacing.md },
  chipsRow: { flexDirection: 'row' as const, gap: spacing.xs, paddingBottom: spacing.md },
  chip: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: t.surfaceAlt },
  chipOn: { backgroundColor: t.primary },
  chipDanger: { backgroundColor: t.dangerBg },
  chipText: { ...typography.captionMedium, fontSize: 14, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  chipTextDanger: { color: t.dangerText },
  skeleton: { marginBottom: spacing.sm },
});

/** My Tasks - list + search, with the same filter views as the web sidebar. */
export function TaskListScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const route = useRoute<RouteProp<TaskTabParamList, 'Tasks'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { tasks, viewer, ready, refreshing, refresh, error } = useTasks();
  const [mode, setMode] = useState<ListMode>(route.params?.mode ?? 'all');
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openSeries, setOpenSeries] = useState<{ id: string; allowManage: boolean } | null>(null);
  const [delegatedSub, setDelegatedSub] = useState<DelegatedSub>('all');
  // Whether Today/Overdue/Upcoming mean "mine" or "my team's" - set when
  // arriving from a Team stat tile on Home, cleared by picking a mode any
  // other way (see selectMode below) so it never sticks around stale.
  const [teamScoped, setTeamScoped] = useState(!!route.params?.teamScoped);
  // Set when arriving from Home's "View all": shows only My Tasks or Team Tasks
  // with no chip row. Cleared by picking a mode any other way (see selectMode).
  const [focused, setFocused] = useState(!!route.params?.focused);
  // Quick Action tiles (In Progress, High Priority, Completed, Recurring) open
  // a single dedicated view - no chip row or "Show" sheet back into the others.
  const bareView = BARE_MODES.includes(mode);
  // Today/Overdue/Upcoming: only let switching among those and My Tasks (or,
  // from a Team tile, Team + those three), never into All/Completed from here.
  const myOnlyView = MY_ONLY_MODES.includes(mode) && !teamScoped;
  const teamOnlyView = MY_ONLY_MODES.includes(mode) && teamScoped;
  // "Assigned by Me" gets its own status row scoped to tasks I delegated, not the generic chips.
  const delegatedView = mode === 'delegated';
  const focusedView = focused && (mode === 'my' || mode === 'team');
  const restricted = bareView || myOnlyView || teamOnlyView || delegatedView || focusedView;
  // Every way of picking a mode goes through this, so teamScoped never leaks
  // from a Team-tile visit into a later, unrelated chip tap.
  const selectMode = (m: ListMode, team = false) => {
    setMode(m);
    setTeamScoped(team);
    setFocused(false);
  };

  // Keep the selected chip in view: arriving from Home ("Completed",
  // "In Progress"...) or the filter sheet scrolls the chip row to it instead
  // of leaving it off-screen at the end of the row. Shared across every chip
  // row below (general + the three restricted ones) - only one is ever
  // mounted at a time, so one ref/key-map covers all of them.
  const chipScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollToChip = useCallback((m: string, animated = true) => {
    const x = chipX.current[m];
    if (x !== undefined) chipScroll.current?.scrollTo({ x: Math.max(0, x - spacing.lg), animated });
  }, []);
  useEffect(() => {
    scrollToChip(delegatedView ? delegatedSub : mode);
  }, [mode, delegatedSub, delegatedView, scrollToChip]);

  // Drill-downs from Home (stat tiles, "View all") pick the view.
  // Insights' Team workload pre-fills the search; the Tasks tab resets both.
  // Keyed on the whole params object so a repeat tap (same values) still applies.
  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
    if (route.params?.q !== undefined) setQ(route.params.q);
    if (route.params?.mode) setTeamScoped(!!route.params.teamScoped);
    if (route.params?.mode) setFocused(!!route.params.focused);
    if (route.params?.mode === 'delegated') setDelegatedSub('all');
  }, [route.params]);

  const hasTeam = viewer.team.length > 0 || viewer.isAdmin;
  // The Quick Actions views (In Progress, High Priority...) live in the filter
  // sheet, and get a chip of their own only while one of them is selected.
  const allModes = useMemo(
    () => [...CHIP_ORDER, ...EXTRA_MODES].filter((m) => (m !== 'team' && m !== 'delegated') || hasTeam),
    [hasTeam],
  );
  const modes = useMemo(() => {
    const base = CHIP_ORDER.filter((m) => m !== 'team' || hasTeam);
    return base.includes(mode) ? base : [base[0], mode, ...base.slice(1)];
  }, [hasTeam, mode]);

  const counts = useMemo(
    () => Object.fromEntries(allModes.map((m) => [m, tasks.filter((x) => LIST_MODES[m].match(x, viewer.id)).length])) as Record<ListMode, number>,
    [tasks, viewer.id, allModes],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tasks
      .filter((x) =>
        delegatedView
          ? delegatedSubMatch(delegatedSub, x, viewer.id)
          : myOnlyView
            ? myRelatedMatch(mode, x, viewer.id)
            : teamOnlyView
              ? teamRelatedMatch(mode, x, viewer.id)
              : LIST_MODES[mode].match(x, viewer.id),
      )
      .filter(
        (x) =>
          !needle ||
          x.title.toLowerCase().includes(needle) ||
          (x.assigned_to_name || '').toLowerCase().includes(needle) ||
          (x.task_type || '').toLowerCase().includes(needle),
      );
    return mode === 'completed' ? list.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')) : list.sort(byNewest);
  }, [tasks, mode, q, viewer.id, delegatedView, delegatedSub, myOnlyView, teamOnlyView]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={ready ? shown : []}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing && ready} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{restricted ? (teamOnlyView ? TEAM_LABEL[mode] : focusedView ? FOCUSED_LABEL[mode] : LIST_MODES[mode].label) : 'Tasks'}</Text>
            <View style={styles.searchRow}>
              <View style={styles.search}>
                <SearchIcon size={18} color={theme.textMuted} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search tasks..."
                  placeholderTextColor={theme.textMuted}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </View>
              {!restricted && (
                <Pressable style={styles.filterBtn} onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel="Filter tasks">
                  <MenuIcon size={22} color={theme.textPrimary} />
                </Pressable>
              )}
            </View>
            {!restricted && (
              <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {modes.map((m) => {
                  const on = mode === m;
                  const danger = m === 'overdue' && !on;
                  return (
                    <Pressable
                      key={m}
                      onLayout={(e) => {
                        chipX.current[m] = e.nativeEvent.layout.x;
                        if (m === mode) scrollToChip(m, false);
                      }}
                      // Tapping the active chip again goes back to All.
                      onPress={() => selectMode(on && m !== 'all' ? 'all' : m)}
                      style={[styles.chip, on && styles.chipOn, danger && styles.chipDanger]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn, danger && styles.chipTextDanger]}>
                        {LIST_MODES[m].label}
                        {ready ? ` (${counts[m]})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {myOnlyView && (
              <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {MY_RELATED_CHIPS.map((m) => {
                  const on = mode === m;
                  const danger = m === 'overdue' && !on;
                  const count = tasks.filter((x) => myRelatedMatch(m, x, viewer.id)).length;
                  return (
                    <Pressable
                      key={m}
                      onLayout={(e) => {
                        chipX.current[m] = e.nativeEvent.layout.x;
                        if (m === mode) scrollToChip(m, false);
                      }}
                      onPress={() => selectMode(m, false)}
                      style={[styles.chip, on && styles.chipOn, danger && styles.chipDanger]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn, danger && styles.chipTextDanger]}>
                        {LIST_MODES[m].label}
                        {ready ? ` (${count})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {teamOnlyView && (
              <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {TEAM_RELATED_CHIPS.map((m) => {
                  const on = mode === m;
                  const danger = m === 'overdue' && !on;
                  const count = tasks.filter((x) => teamRelatedMatch(m, x, viewer.id)).length;
                  return (
                    <Pressable
                      key={m}
                      onLayout={(e) => {
                        chipX.current[m] = e.nativeEvent.layout.x;
                        if (m === mode) scrollToChip(m, false);
                      }}
                      onPress={() => selectMode(m, m !== 'team')}
                      style={[styles.chip, on && styles.chipOn, danger && styles.chipDanger]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn, danger && styles.chipTextDanger]}>
                        {TEAM_LABEL[m] ?? LIST_MODES[m].label}
                        {ready ? ` (${count})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {delegatedView && (
              <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {DELEGATED_SUBS.map(([key, label]) => {
                  const on = delegatedSub === key;
                  const count = tasks.filter((x) => delegatedSubMatch(key, x, viewer.id)).length;
                  return (
                    <Pressable
                      key={key}
                      onLayout={(e) => {
                        chipX.current[key] = e.nativeEvent.layout.x;
                        if (key === delegatedSub) scrollToChip(key, false);
                      }}
                      onPress={() => setDelegatedSub(key)}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {label}
                        {ready ? ` (${count})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {ready && mode === 'upcoming' && (
              <NotStartedSeries viewer={viewer} onOpen={(id, allowManage) => setOpenSeries({ id, allowManage })} />
            )}
            <CrmErrorBanner message={ready ? error : null} onRetry={refresh} />
            {!ready && [0, 1, 2, 3].map((i) => <CrmSkeleton key={i} height={76} radius={radii.lg} style={styles.skeleton} />)}
          </View>
        }
        ListEmptyComponent={
          ready && !error ? (
            <CrmEmptyState
              title={q ? 'No matches' : 'Nothing here'}
              subtitle={q ? `No task matches “${q}”.` : 'Tasks in this view will show up here.'}
              icon={<InboxIcon size={30} color={theme.textMuted} />}
            />
          ) : undefined
        }
        renderItem={({ item }) => (
          <TaskRow task={item} showAssignee={item.assigned_to !== viewer.id} onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })} />
        )}
      />
      <ActionSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Show"
        actions={allModes.map((m) => {
          const { Icon, color, bg } = modeLook(m, theme);
          return {
            key: m,
            label: LIST_MODES[m].label,
            sub: `${counts[m] ?? 0} task${counts[m] === 1 ? '' : 's'}`,
            icon: <Icon size={18} color={color} />,
            iconBg: bg,
            selected: m === mode,
            onPress: () => selectMode(m, false),
          };
        })}
      />
      {openSeries && (
        <SeriesSheet
          visible
          onClose={() => setOpenSeries(null)}
          seriesId={openSeries.id}
          allowManage={openSeries.allowManage}
          onChanged={refresh}
        />
      )}
    </SafeAreaView>
  );
}
