import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { GradientCard } from '../../components/GradientCard';
import { Skeleton } from '../../components/Skeleton';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlayIcon,
} from '../../components/icons';
import { getStatusMeta } from '../../utils/statusMeta';
import { useAuth } from '../../auth/AuthContext';
import { visitsApi, jobsApi, ApiError } from '../../api';
import { formatDate, formatTime, isBeforeToday, isToday, isTomorrow } from '../../utils/date';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';
import type { Job } from '../../types/job';
import type {
  AuthenticatedStackParamList,
  TechnicianTabParamList,
  TechnicianWorkQueueFilter,
} from '../../navigation/types';
import { buildQueueItems, mostRecentCompleted, RECENT_COMPLETED_LIMIT, type JobQueueRow, type QueueItem } from './workQueue';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;
type SortMode = 'time' | 'status';

const TITLES: Record<TechnicianWorkQueueFilter, string> = {
  today: "Today's Jobs",
  pending: 'Pending',
  tomorrow: "Tomorrow's Jobs",
  inProgress: 'In Progress',
  pendingToday: 'Pending Today',
  completed: 'Completed Jobs',
  all: 'My Jobs',
};

const SUBTITLES: Record<TechnicianWorkQueueFilter, string> = {
  today: 'Your work for today at a glance',
  pending: 'Overdue work that needs attention',
  tomorrow: "Get a head start on what's next",
  inProgress: 'Visits currently underway',
  pendingToday: "Today's work that hasn't started yet",
  completed: `Your ${RECENT_COMPLETED_LIMIT} most recent finished jobs`,
  all: 'Every job assigned to you',
};

const EMPTY_COPY: Record<TechnicianWorkQueueFilter, { title: string; subtitle: string }> = {
  today: { title: 'No jobs today', subtitle: "You're all caught up for today." },
  pending: { title: 'Nothing pending', subtitle: 'No overdue work right now.' },
  tomorrow: { title: 'Nothing scheduled', subtitle: 'No jobs scheduled for tomorrow yet.' },
  inProgress: { title: 'Nothing in progress', subtitle: 'Start a visit to see it here.' },
  pendingToday: { title: 'Nothing pending today', subtitle: "You're all caught up for today." },
  completed: { title: 'No completed jobs yet', subtitle: 'Jobs you finish will show up here.' },
  all: { title: 'No jobs assigned', subtitle: "You're all caught up for now." },
};

/**
 * The three filters a technician checks constantly, always shown as their own tile - never a sideways
 * scroller, so nothing is hidden and the selected one is always in view.
 */
const PRIMARY_FILTERS: TechnicianWorkQueueFilter[] = ['today', 'pending', 'tomorrow'];

/** Everything else, reached through the fixed "More" tile's list instead of crowding the row - keeps the
 * screen to the three filters that matter most at a glance, per feedback that six tiles felt busy. */
const MORE_FILTERS: TechnicianWorkQueueFilter[] = ['inProgress', 'pendingToday', 'completed'];

const FILTER_LABEL: Record<TechnicianWorkQueueFilter, string> = {
  today: 'Today',
  inProgress: 'In progress',
  pendingToday: 'Pending today',
  pending: 'Pending',
  tomorrow: 'Tomorrow',
  completed: 'Completed',
  all: 'All',
};

/** One colour per filter: the selected pill, the summary card and its count all take it. */
const FILTER_COLOR: Record<TechnicianWorkQueueFilter, string> = {
  today: '#2563EB',
  inProgress: '#0284C7',
  pendingToday: '#DC2626',
  pending: '#D97706',
  tomorrow: '#0891B2',
  completed: '#16A34A',
  all: '#475569',
};

const MORE_COLOR = '#64748B';

function FilterIcon({ filter, color }: { filter: TechnicianWorkQueueFilter; color: string }) {
  switch (filter) {
    case 'today':
      return <BriefcaseIcon size={16} color={color} />;
    case 'inProgress':
      return <PlayIcon size={16} color={color} />;
    case 'pendingToday':
      return <AlertCircleIcon size={16} color={color} />;
    case 'pending':
      return <ClockIcon size={16} color={color} />;
    case 'tomorrow':
      return <CalendarIcon size={16} color={color} />;
    case 'completed':
      return <CheckCircleIcon size={16} color={color} />;
    default:
      return <DocumentIcon size={16} color={color} />;
  }
}

/** "You have N job(s) ..." - the singular/plural-aware sentence for the "all caught up" footer below a non-empty list. */
function caughtUpCopy(filter: TechnicianWorkQueueFilter, count: number): string {
  const job = count === 1 ? 'job' : 'jobs';
  switch (filter) {
    case 'today':
      return `You have ${count} ${job} scheduled for today.`;
    case 'tomorrow':
      return `You have ${count} ${job} scheduled for tomorrow.`;
    case 'pending':
      return `You have ${count} pending ${job}.`;
    case 'inProgress':
      return `You have ${count} ${job} in progress.`;
    case 'pendingToday':
      return `You have ${count} ${job} pending today.`;
    case 'completed':
      return count >= RECENT_COMPLETED_LIMIT
        ? `Showing your ${count} most recent completed jobs.`
        : `You have ${count} completed ${job}.`;
    case 'all':
    default:
      return `You have ${count} ${job} assigned.`;
  }
}

// Sort order for the "Status" sort mode - active/actionable work first, done/dead states last. Client-side display order only.
const STATUS_SORT_RANK: Record<string, number> = {
  IN_PROGRESS: 0,
  AWAITING_APPROVAL: 1,
  MISSED: 2,
  SCHEDULED: 3,
  NOT_STARTED: 3,
  CREATED: 3,
  PAUSED: 3,
  COMPLETED: 4,
  CANCELED: 5,
  CANCELLED: 5,
};

/** "02:07 AM" -> ["02:07", "AM"]; falls back to [time, ''] when there is no space (or "--"). */
function splitTime(time: string): [string, string] {
  // toLocaleTimeString puts a narrow no-break space (U+202F) before AM/PM on some devices, so match any whitespace.
  const match = time.match(/^(.*?)[\s  ]*([AaPp][Mm])$/);
  return match ? [match[1], match[2].toUpperCase()] : [time, ''];
}

/**
 * The technician's full work queue. Today / Pending / Tomorrow use the same definitions as the web
 * technician dashboard, applied to GET /api/visits/my ("Pending" = overdue, i.e. scheduled before today);
 * Completed comes from GET /api/jobs (the visits list never includes finished work). Home's tiles and the
 * More menu open this screen with a `filter` param, so the rail lists every filter and always shows which
 * one is selected.
 */
export function MyJobsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TechnicianTabParamList, 'MyJobs'>>();
  const { user } = useAuth();

  const [filter, setFilter] = useState<TechnicianWorkQueueFilter>(route.params?.filter ?? 'today');
  const [sortBy, setSortBy] = useState<SortMode>('time');
  const [moreOpen, setMoreOpen] = useState(false);
  const inMoreFilters = MORE_FILTERS.includes(filter);

  const [visits, setVisits] = useState<TechnicianVisit[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [visitData, jobData] = await Promise.all([visitsApi.listMyVisits(), jobsApi.listJobs()]);
      setVisits(visitData);
      setJobs(jobData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Tab screens stay mounted, so refetch (and re-apply a fresh `filter` param) every time this screen is focused.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.filter) setFilter(route.params.filter);
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.filter]),
  );

  const completedJobs = useMemo(() => {
    if (!jobs || !user) return null;
    return mostRecentCompleted(jobs, user.id);
  }, [jobs, user]);

  const counts = useMemo((): Record<TechnicianWorkQueueFilter, number | null> => {
    if (!visits) {
      return { today: null, inProgress: null, pendingToday: null, pending: null, tomorrow: null, completed: completedJobs?.length ?? null, all: null };
    }
    return {
      today: visits.filter((v) => isToday(v.scheduled_date)).length,
      inProgress: visits.filter((v) => v.status === 'IN_PROGRESS').length,
      pendingToday: visits.filter((v) => isToday(v.scheduled_date) && v.status !== 'IN_PROGRESS').length,
      pending: visits.filter((v) => isBeforeToday(v.scheduled_date)).length,
      tomorrow: visits.filter((v) => isTomorrow(v.scheduled_date)).length,
      completed: completedJobs?.length ?? null,
      all: visits.length,
    };
  }, [visits, completedJobs]);

  const filteredVisits = useMemo(() => {
    if (!visits) return null;
    switch (filter) {
      case 'today':
        return visits.filter((v) => isToday(v.scheduled_date));
      case 'pending':
        return visits.filter((v) => isBeforeToday(v.scheduled_date));
      case 'tomorrow':
        return visits.filter((v) => isTomorrow(v.scheduled_date));
      case 'inProgress':
        // Not scoped to today - a visit started today but originally scheduled earlier still counts.
        return visits.filter((v) => v.status === 'IN_PROGRESS');
      case 'pendingToday':
        return visits.filter((v) => isToday(v.scheduled_date) && v.status !== 'IN_PROGRESS');
      default:
        return visits;
    }
  }, [visits, filter]);

  const isCompletedView = filter === 'completed';
  const list = isCompletedView ? completedJobs : filteredVisits;

  // Job and TechnicianVisit are different API shapes; map each to the one row shape the list renders.
  const rows = useMemo((): JobQueueRow[] | null => {
    if (list === null) return null;
    if (isCompletedView) {
      return (list as Job[]).map((job): JobQueueRow => {
        const iso = job.dueDate ?? job.start_date ?? null;
        const d = iso ? new Date(iso) : null;
        const valid = !!d && !Number.isNaN(d.getTime());
        return {
          rowKey: job.id,
          jobId: job.id,
          code: job.code,
          title: job.title,
          company: job.companyname ?? undefined,
          siteArea: job.site ?? undefined,
          address: job.address,
          sortDate: iso,
          status: job.status,
          timeMain: valid ? String(d!.getDate()) : '--',
          timeSub: valid ? d!.toLocaleDateString([], { month: 'short' }) : formatDate(iso),
        };
      });
    }
    return (list as TechnicianVisit[]).map((visit): JobQueueRow => {
      const [timeMain, timeSub] = splitTime(formatTime(visit.scheduled_date));
      return {
        rowKey: visit.id,
        jobId: visit.job_id,
        code: visit.job_code,
        title: visit.sub_service,
        company: visit.companyname ?? undefined,
        siteArea: visit.sitename ?? undefined,
        address: visit.address,
        sortDate: visit.scheduled_date,
        status: visit.status,
        timeMain,
        timeSub,
      };
    });
  }, [list, isCompletedView]);

  // "Time": soonest first (newest first on Completed, which is history); "Status": actionable work first.
  const sortedRows = useMemo(() => {
    if (!rows) return null;
    const copy = [...rows];
    if (sortBy === 'status') {
      copy.sort((a, b) => (STATUS_SORT_RANK[a.status ?? ''] ?? 9) - (STATUS_SORT_RANK[b.status ?? ''] ?? 9));
    } else {
      const direction = isCompletedView ? -1 : 1;
      copy.sort((a, b) => {
        if (!a.sortDate && !b.sortDate) return 0;
        if (!a.sortDate) return 1;
        if (!b.sortDate) return -1;
        return direction * (new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());
      });
    }
    return copy;
  }, [rows, sortBy, isCompletedView]);

  const items = useMemo(() => (sortedRows ? buildQueueItems(sortedRows, sortBy === 'time') : []), [sortedRows, sortBy]);

  const accent = FILTER_COLOR[filter];
  const activeMore = inMoreFilters ? filter : null;
  const moreColor = activeMore ? FILTER_COLOR[activeMore] : MORE_COLOR;
  const moreCount = activeMore ? counts[activeMore] : null;
  const moreLabel = activeMore ? FILTER_LABEL[activeMore] : 'More';
  const total = rows?.length;
  let cardIndex = -1;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.kind === 'header') return <DayHeader item={item} color={accent} />;
          cardIndex += 1;
          return <WorkQueueCard row={item.row} index={cardIndex} onPress={() => navigation.navigate('JobDetail', { jobId: item.row.jobId })} />;
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            <View style={styles.gridRow} accessibilityRole="tablist">
              {PRIMARY_FILTERS.map((f) => {
                const selected = f === filter;
                const color = FILTER_COLOR[f];
                const count = counts[f];
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${FILTER_LABEL[f]}${count !== null ? `, ${count}` : ''}`}
                    style={({ pressed }) => [
                      styles.tile,
                      selected ? { backgroundColor: color, borderColor: color } : { borderColor: `${color}55` },
                      pressed && styles.tilePressed,
                    ]}
                    testID={`filter-${f}`}
                  >
                    {selected && (
                      <View style={styles.tileTick}>
                        <CheckCircleIcon size={16} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={[styles.tileIcon, selected ? styles.tileIconOn : { backgroundColor: `${color}1A` }]}>
                      <FilterIcon filter={f} color={selected ? '#FFFFFF' : color} />
                    </View>
                    <Text style={[styles.tileCount, selected ? styles.tileTextOn : { color }]}>{count ?? '-'}</Text>
                    <Text style={[styles.tileLabel, selected && styles.tileTextOn]} numberOfLines={1}>
                      {FILTER_LABEL[f]}
                    </Text>
                  </Pressable>
                );
              })}

              {/* The "More" tile takes on the current filter's own look the moment one of MORE_FILTERS is
                  picked, so - even though it lives behind a sheet - it's never a mystery which one is
                  selected; that was the whole point of the earlier 6-tile grid, kept without the clutter. */}
              <Pressable
                onPress={() => setMoreOpen(true)}
                accessibilityRole="tab"
                accessibilityState={{ selected: inMoreFilters }}
                accessibilityLabel={
                  activeMore ? `${moreLabel}${moreCount !== null ? `, ${moreCount}` : ''}, more filters` : 'More filters'
                }
                style={({ pressed }) => [
                  styles.tile,
                  inMoreFilters
                    ? { backgroundColor: moreColor, borderColor: moreColor }
                    : { borderColor: `${moreColor}55` },
                  pressed && styles.tilePressed,
                ]}
                testID="filter-more"
              >
                {inMoreFilters && (
                  <View style={styles.tileTick}>
                    <CheckCircleIcon size={16} color="#FFFFFF" />
                  </View>
                )}
                <View style={[styles.tileIcon, inMoreFilters ? styles.tileIconOn : { backgroundColor: `${moreColor}1A` }]}>
                  {activeMore ? (
                    <FilterIcon filter={activeMore} color={inMoreFilters ? '#FFFFFF' : moreColor} />
                  ) : (
                    <MoreHorizontalIcon size={16} color={moreColor} />
                  )}
                </View>
                {activeMore ? (
                  <Text style={[styles.tileCount, inMoreFilters ? styles.tileTextOn : { color: moreColor }]}>
                    {moreCount ?? '-'}
                  </Text>
                ) : (
                  <View style={styles.tileCountSpacer} />
                )}
                <Text style={[styles.tileLabel, inMoreFilters && styles.tileTextOn]} numberOfLines={1}>
                  {moreLabel}
                </Text>
              </Pressable>
            </View>

            <GradientCard color={accent} style={styles.hero}>
              <View style={styles.heroBlob} />
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{TITLES[filter]}</Text>
                <Text style={styles.heroSubtitle}>{SUBTITLES[filter]}</Text>
              </View>
              <View style={styles.heroCount} accessible accessibilityLabel={`${total ?? 0} jobs`}>
                <Text style={styles.heroCountValue}>{total ?? '-'}</Text>
                <Text style={styles.heroCountLabel}>{total === 1 ? 'job' : 'jobs'}</Text>
              </View>
            </GradientCard>

            {!!error && <Banner message={error} variant="error" />}

            {rows === null && !error ? (
              <View>
                <Skeleton height={112} radius={16} style={styles.skeletonCard} />
                <Skeleton height={112} radius={16} style={styles.skeletonCard} />
                <Skeleton height={112} radius={16} style={styles.skeletonCard} />
              </View>
            ) : (
              !!rows &&
              rows.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>
                    {rows.length} {rows.length === 1 ? 'JOB' : 'JOBS'}
                  </Text>
                  <Pressable
                    onPress={() => setSortBy((prev) => (prev === 'time' ? 'status' : 'time'))}
                    hitSlop={8}
                    style={styles.sortButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.sortLabel}>
                      Sort by <Text style={styles.sortValue}>{sortBy === 'time' ? 'Time' : 'Status'}</Text>
                    </Text>
                    <View style={styles.sortChevron}>
                      <ChevronRightIcon size={13} color={colors.primary} />
                    </View>
                  </Pressable>
                </View>
              )
            )}
          </>
        }
        ListFooterComponent={
          sortedRows && sortedRows.length > 0 ? (
            <EmptyState
              icon={<CheckCircleIcon size={30} color={colors.success} />}
              title="All caught up!"
              subtitle={caughtUpCopy(filter, sortedRows.length)}
            />
          ) : undefined
        }
        ListEmptyComponent={
          rows && rows.length === 0 ? (
            <EmptyState
              icon={
                isCompletedView ? (
                  <CheckCircleIcon size={32} color={colors.textMuted} />
                ) : (
                  <BriefcaseIcon size={32} color={colors.textMuted} />
                )
              }
              title={EMPTY_COPY[filter].title}
              subtitle={EMPTY_COPY[filter].subtitle}
            />
          ) : undefined
        }
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
      />

      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setMoreOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>More filters</Text>
            {MORE_FILTERS.map((f) => {
              const selected = f === filter;
              const color = FILTER_COLOR[f];
              const count = counts[f];
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    setFilter(f);
                    setMoreOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.sheetRow, pressed && styles.tilePressed]}
                  testID={`filter-more-${f}`}
                >
                  <View style={[styles.sheetRowIcon, { backgroundColor: `${color}1A` }]}>
                    <FilterIcon filter={f} color={color} />
                  </View>
                  <Text style={styles.sheetRowLabel}>{FILTER_LABEL[f]}</Text>
                  <Text style={[styles.sheetRowCount, { color }]}>{count ?? '-'}</Text>
                  {selected && <CheckCircleIcon size={18} color={color} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/** The heading above each day's jobs: "Today", "Yesterday", "Mon, Sep 7", with how many. */
function DayHeader({ item, color }: { item: Extract<QueueItem, { kind: 'header' }>; color: string }) {
  return (
    <View style={styles.dayHeader}>
      <View style={[styles.dayDot, { backgroundColor: color }]} />
      <Text style={styles.dayLabel}>{item.label}</Text>
      <View style={styles.dayLine} />
      <Text style={styles.dayCount}>{item.count}</Text>
    </View>
  );
}

const STAGGER_LIMIT = 8;

/**
 * One work-queue entry: the visit's time (or a finished job's date) on the left in its status colour, then
 * the customer with the status, the service(s) below it, and the address; the chevron opens the job.
 */
function WorkQueueCard({ row, index, onPress }: { row: JobQueueRow; index: number; onPress: () => void }) {
  const meta = getStatusMeta(row.status);
  const enter = useRef(new Animated.Value(index < STAGGER_LIMIT ? 0 : 1)).current;

  useEffect(() => {
    if (index >= STAGGER_LIMIT) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: 350,
      delay: index * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${row.title}, ${meta.label}`}
      >
        {/* The status tint is its own layer: a translucent card background would let the elevation shadow show through as a grey box. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `${meta.color}0A` }]} pointerEvents="none" />
        <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />

        <View style={styles.timeCol}>
          <Text style={[styles.timeMain, { color: meta.color }]} numberOfLines={1} adjustsFontSizeToFit>
            {row.timeMain}
          </Text>
          {!!row.timeSub && <Text style={styles.timeSub}>{row.timeSub}</Text>}
        </View>

        <View style={[styles.cardDivider, { backgroundColor: `${meta.color}33` }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardCustomer} numberOfLines={1}>
              {row.company || row.title}
            </Text>
            <StatusBadge status={row.status} />
          </View>
          {!!row.company && (
            <Text style={styles.cardService} numberOfLines={1}>
              {row.title}
            </Text>
          )}
          {!!row.address && (
            <View style={styles.addressRow}>
              <PinIcon size={13} color={colors.textMuted} />
              <Text style={styles.addressText} numberOfLines={1}>
                {row.address}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.chevron, { backgroundColor: meta.color }]}>
          <ChevronRightIcon size={16} color="#FFFFFF" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  gridRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tilePressed: { opacity: 0.85 },
  tileTick: { position: 'absolute', top: 5, right: 5 },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tileCount: { ...typography.title, fontSize: 24, lineHeight: 30, marginTop: 2 },
  /** Same height as tileCount's line box, so the "More" tile (which has no number until a hidden filter is picked) still lines up with its siblings. */
  tileCountSpacer: { height: 30, marginTop: 2 },
  tileLabel: { ...typography.captionMedium, color: colors.textSecondary, textAlign: 'center' },
  tileTextOn: { color: '#FFFFFF' },

  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  heroBlob: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroText: { flex: 1, paddingRight: spacing.md },
  heroOverline: { ...typography.overline, color: 'rgba(255,255,255,0.8)' },
  heroTitle: { ...typography.title, fontSize: 20, color: '#FFFFFF' },
  heroSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  heroCount: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCountValue: { ...typography.display, fontSize: 24, lineHeight: 27, color: '#FFFFFF' },
  heroCountLabel: { ...typography.caption, fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: -2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  sectionLabel: { ...typography.captionMedium, color: colors.textMuted, letterSpacing: 0.4 },
  sortButton: { flexDirection: 'row', alignItems: 'center' },
  sortLabel: { ...typography.captionMedium, color: colors.textMuted },
  sortValue: { color: colors.primary },
  sortChevron: { marginLeft: 2, transform: [{ rotate: '90deg' }] },
  skeletonCard: { marginBottom: spacing.sm },

  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.xs },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { ...typography.bodyMedium, color: colors.textPrimary },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dayCount: { ...typography.captionMedium, color: colors.textMuted },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardPressed: { opacity: 0.85 },
  cardAccent: { width: 5, alignSelf: 'stretch' },
  timeCol: { width: 62, alignItems: 'center', paddingHorizontal: 4 },
  timeMain: { ...typography.title, fontSize: 19, fontWeight: '700' },
  timeSub: { ...typography.caption, color: colors.textMuted, marginTop: -2 },
  cardDivider: { width: 1, alignSelf: 'stretch', marginVertical: spacing.sm },
  cardBody: { flex: 1, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  cardCustomer: { ...typography.bodyMedium, fontSize: 15, color: colors.textPrimary, flex: 1 },
  cardService: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  addressText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },

  sheetOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  sheetRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowLabel: { ...typography.bodyMedium, color: colors.textPrimary, flex: 1 },
  sheetRowCount: { ...typography.bodyMedium, marginRight: spacing.xs },
});
