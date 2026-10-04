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
// The fixed filter row for each part. The row never changes when a chip is tapped - only the list does.
const MY_PART: ListMode[] = ['my', 'today', 'overdue', 'upcoming', 'progress', 'high', 'completed'];
const TEAM_PART: ListMode[] = ['team', 'today', 'overdue', 'upcoming', 'progress', 'high', 'completed'];
// Date views: "mine" or "my team's" depending on the part they are in.
const DATE_MODES: ListMode[] = ['today', 'overdue', 'upcoming'];
// Quick Action views (from Home). Scoped to My or Team like the date views.
const QUICK_MODES: ListMode[] = ['progress', 'high', 'completed', 'recurring'];
const TEAM_LABEL: Partial<Record<ListMode, string>> = { today: 'Team Today', overdue: 'Team Overdue', upcoming: 'Team Upcoming' };
// "View all" on Home opens just My Tasks or Team Tasks - a single list, no switch (see `focused` below).
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
  scopeTrack: { flexDirection: 'row' as const, backgroundColor: t.surfaceAlt, borderRadius: radii.pill, padding: 4, marginBottom: spacing.md },
  scopeSeg: { flex: 1, paddingVertical: spacing.xs, borderRadius: radii.pill, alignItems: 'center' as const },
  scopeSegOn: { backgroundColor: t.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  scopeText: { ...typography.captionMedium, color: t.textSecondary },
  scopeTextOn: { color: t.primary, fontWeight: '700' as const },
  skeleton: { marginBottom: spacing.sm },
});

/** My Tasks / My Team - list + search, with the same filter views as the web sidebar. */
export function TaskListScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const route = useRoute<RouteProp<TaskTabParamList, 'Tasks'>>();
  const { styles, theme } = useCrmStyles(factory);
  const { tasks, viewer, ready, refreshing, refresh, error } = useTasks();
  const [mode, setMode] = useState<ListMode>(route.params?.mode ?? 'my');
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openSeries, setOpenSeries] = useState<{ id: string; allowManage: boolean } | null>(null);
  const [delegatedSub, setDelegatedSub] = useState<DelegatedSub>('all');
  // Whether the date and Quick Action views mean "mine" or "my team's". Set by
  // the My/Team switch, by Home's team tiles, and by the chips in each part.
  const [teamScoped, setTeamScoped] = useState(!!route.params?.teamScoped);
  // Set when arriving from Home's "View all": shows only My Tasks or Team Tasks, with no switch.
  const [focused, setFocused] = useState(!!route.params?.focused);

  const hasTeam = viewer.team.length > 0 || viewer.isAdmin;
  // Which part is showing: the mode decides it for My/Team, otherwise the teamScoped flag does.
  const partTeam = mode === 'team' || (mode !== 'my' && teamScoped);
  const inPart = MY_PART.includes(mode) || TEAM_PART.includes(mode);
  // Every part view and the Quick Action views (Recurring, Assigned by Me) show the filter row.
  const showRow = inPart || mode === 'recurring' || mode === 'delegated';
  const showSwitch = hasTeam && inPart && !focused;
  // The row's chips: the fixed set for this part, plus the current mode first if it isn't in that set (Recurring).
  const rowChips: ListMode[] = inPart ? (partTeam ? TEAM_PART : MY_PART) : [mode, ...MY_PART];

  // Every way of picking a mode goes through this, so teamScoped never leaks
  // from one part into the other.
  const selectMode = (m: ListMode, team = partTeam) => {
    setMode(m);
    setTeamScoped(team);
    setFocused(false);
  };
  // The My Tasks / My Team switch keeps the current filter (Overdue stays Overdue, and so on).
  const switchPart = (team: boolean) => {
    setMode(mode === 'my' || mode === 'team' ? (team ? 'team' : 'my') : mode);
    setTeamScoped(team);
    setFocused(false);
  };

  // Keep the selected chip in view: arriving from Home or the filter sheet scrolls
  // the chip row to it instead of leaving it off-screen at the end of the row.
  const chipScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollToChip = useCallback((m: string, animated = true) => {
    const x = chipX.current[m];
    if (x !== undefined) chipScroll.current?.scrollTo({ x: Math.max(0, x - spacing.lg), animated });
  }, []);
  useEffect(() => {
    scrollToChip(mode);
  }, [mode, partTeam, scrollToChip]);

  // Drill-downs from Home (stat tiles, Quick Actions, "View all") pick the view.
  // Insights' Team workload pre-fills the search; the Tasks tab resets both.
  // Keyed on the whole params object so a repeat tap (same values) still applies.
  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
    if (route.params?.q !== undefined) setQ(route.params.q);
    if (route.params?.mode) setTeamScoped(!!route.params.teamScoped);
    if (route.params?.mode) setFocused(!!route.params.focused);
    if (route.params?.mode === 'delegated') setDelegatedSub('all');
  }, [route.params]);

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

  /** Whether a task belongs to the view `m`, within the current part (My or Team). */
  const matchFor = useCallback(
    (m: ListMode, x: WorkTask): boolean => {
      const me = viewer.id;
      if (m === 'delegated') return delegatedSubMatch(delegatedSub, x, me);
      if (DATE_MODES.includes(m)) return partTeam ? teamRelatedMatch(m, x, me) : myRelatedMatch(m, x, me);
      if (QUICK_MODES.includes(m) && hasTeam) return LIST_MODES[m].match(x, me) && (partTeam ? x.assigned_to !== me : x.assigned_to === me);
      return LIST_MODES[m].match(x, me);
    },
    [viewer.id, delegatedSub, partTeam, hasTeam],
  );
  // Chip counts. "Assigned by Me" always counts all of them, whatever sub-filter is picked.
  const countFor = (m: ListMode) => tasks.filter((x) => (m === 'delegated' ? LIST_MODES.delegated.match(x, viewer.id) : matchFor(m, x))).length;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tasks
      .filter((x) => matchFor(mode, x))
      .filter(
        (x) =>
          !needle ||
          x.title.toLowerCase().includes(needle) ||
          (x.assigned_to_name || '').toLowerCase().includes(needle) ||
          (x.task_type || '').toLowerCase().includes(needle),
      );
    return mode === 'completed' ? list.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')) : list.sort(byNewest);
  }, [tasks, mode, q, matchFor]);

  const title =
    focused && (mode === 'my' || mode === 'team')
      ? FOCUSED_LABEL[mode]
      : showRow && mode !== 'my' && mode !== 'team'
        ? (partTeam && TEAM_LABEL[mode]) || LIST_MODES[mode].label
        : 'Tasks';

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
            <Text style={styles.title}>{title}</Text>
            {showSwitch && (
              <View style={styles.scopeTrack}>
                {(['my', 'team'] as const).map((m) => {
                  const on = m === 'team' ? partTeam : !partTeam;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => switchPart(m === 'team')}
                      style={[styles.scopeSeg, on && styles.scopeSegOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.scopeText, on && styles.scopeTextOn]}>{m === 'my' ? 'My Tasks' : 'My Team'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
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
              {!showRow && (
                <Pressable style={styles.filterBtn} onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel="Filter tasks">
                  <MenuIcon size={22} color={theme.textPrimary} />
                </Pressable>
              )}
            </View>
            {!showRow && (
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
                      onPress={() => selectMode(on && m !== 'all' ? 'all' : m, false)}
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
            {showRow && (
              <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {rowChips.map((m) => {
                  const on = mode === m;
                  const danger = m === 'overdue' && !on;
                  return (
                    <Pressable
                      key={m}
                      onLayout={(e) => {
                        chipX.current[m] = e.nativeEvent.layout.x;
                        if (m === mode) scrollToChip(m, false);
                      }}
                      onPress={() => selectMode(m)}
                      style={[styles.chip, on && styles.chipOn, danger && styles.chipDanger]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn, danger && styles.chipTextDanger]}>
                        {(partTeam && TEAM_LABEL[m]) || LIST_MODES[m].label}
                        {ready ? ` (${countFor(m)})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {mode === 'delegated' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {DELEGATED_SUBS.map(([key, label]) => {
                  const on = delegatedSub === key;
                  const count = tasks.filter((x) => delegatedSubMatch(key, x, viewer.id)).length;
                  return (
                    <Pressable
                      key={key}
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
