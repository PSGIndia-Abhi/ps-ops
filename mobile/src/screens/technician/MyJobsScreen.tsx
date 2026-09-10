import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PinIcon,
} from '../../components/icons';
import { getStatusMeta } from '../../utils/statusMeta';
import { useAuth } from '../../auth/AuthContext';
import { visitsApi, jobsApi, ApiError } from '../../api';
import { formatDate, formatTime, isBeforeToday, isToday, isTomorrow } from '../../utils/date';
import { colors, radii, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';
import type { Job } from '../../types/job';
import type {
  AuthenticatedStackParamList,
  TechnicianTabParamList,
  TechnicianWorkQueueFilter,
} from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList>;
type SortMode = 'time' | 'status';

/** One flattened FlatList row - Job and TechnicianVisit are genuinely different API shapes, normalized to this single one before rendering (see the `rows` useMemo below). */
interface JobQueueRow {
  rowKey: string;
  jobId: string;
  code: string;
  title: string;
  /** Company/customer name - shown both as a subtitle line and as the first chip. */
  company: string | undefined;
  /** Site/area name - a genuinely different field from `company` (see JobDetail's Location section), shown as the second chip. */
  siteArea: string | undefined;
  address: string | null | undefined;
  when: string | undefined;
  /** Raw, unformatted date - `when` above is already display-formatted text, not sortable; this is what the "Sort by Time" toggle actually sorts on. */
  sortDate: string | null;
  status: string | null | undefined;
}

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
  completed: "Jobs you've finished",
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

/** "You have N job(s) ..." - the one real, singular/plural-aware sentence for the "all caught up" footer below a non-empty list. */
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
      return `You have ${count} completed ${job}.`;
    case 'all':
    default:
      return `You have ${count} ${job} assigned.`;
  }
}

// Sort order for the "Status" sort mode - active/actionable work first, done/dead states last. Not a backend concept, purely a client-side display order.
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

/**
 * The technician's full work queue: Today / Pending / Tomorrow are the exact
 * same definitions the existing web technician dashboard already uses
 * (frontend/src/pages/TechnicianDashboard.jsx filteredVisits) applied to the
 * same GET /api/visits/my data - "Pending" here means overdue backlog
 * (scheduled_date < today), not "not started yet" (see
 * utils/date.ts:isBeforeToday). Only these three are shown as pills - the
 * screen also still correctly renders 'completed'/'all' (GET /api/jobs
 * instead, since visits/my's own SQL excludes COMPLETED/CANCELED outright)
 * when arrived at via `filter` from elsewhere (More menu's "Completed
 * Jobs", Home's "Completed" quick-access tile) - there just isn't an
 * in-screen pill to switch into them manually anymore.
 *
 * Also doubles as the destination for every Home stat-card drill-down
 * (Today's jobs / In progress / Pending today) via the `filter` route param
 * instead of building three near-identical screens - see navigation/types.ts.
 */
export function MyJobsScreen() {
  const navigation = useNavigation<Nav>();
  // Also mounted as the "Schedule" tab (same component, different
  // initialParams default - see TechnicianTabNavigator) - both route names
  // carry the identical param shape, so this reads correctly under either.
  const route = useRoute<RouteProp<TechnicianTabParamList, 'MyJobs' | 'Schedule'>>();
  const { user } = useAuth();

  const [filter, setFilter] = useState<TechnicianWorkQueueFilter>(route.params?.filter ?? 'today');
  const [sortBy, setSortBy] = useState<SortMode>('time');

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

  // Bottom-tab screens stay mounted across tab switches (unlike a stack
  // push, which remounts) - a plain mount-only fetch here meant returning
  // to this tab after starting/submitting a visit elsewhere (JobDetail)
  // kept showing the pre-change list and pill counts until a manual pull-
  // to-refresh, exactly the staleness bug Home's own dashboard already had
  // fixed (see TechnicianDashboardScreen's identical useFocusEffect). A
  // fresh `filter` param (tapping a different Home stat card, or
  // "Completed Jobs" from More a second time) also needs to be re-applied
  // on focus, not just read once at mount via useState's initializer -
  // both now happen in the same focus effect.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.filter) setFilter(route.params.filter);
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.filter]),
  );

  const applyFilter = useCallback((next: TechnicianWorkQueueFilter) => {
    setFilter(next);
  }, []);

  // Today/Pending/Tomorrow are what a technician actually checks dozens of
  // times a day - real counts (not just labels) so each is a genuine "how
  // much work is there" glance, not decoration. Deliberately only these
  // three pills - Completed/All are reached from elsewhere (More menu,
  // Home's Completed tile) instead of a fourth "More" control here.
  const counts = useMemo(() => {
    if (!visits) return { today: null, pending: null, tomorrow: null };
    return {
      today: visits.filter((v) => isToday(v.scheduled_date)).length,
      pending: visits.filter((v) => isBeforeToday(v.scheduled_date)).length,
      tomorrow: visits.filter((v) => isTomorrow(v.scheduled_date)).length,
    };
  }, [visits]);

  const completedJobs = useMemo(() => {
    if (!jobs || !user) return null;
    return jobs.filter(
      (job) => job.status === 'COMPLETED' && job.team.some((t) => String(t.id) === String(user.id)),
    );
  }, [jobs, user]);

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
        // Not scoped to today - a visit started today but originally
        // scheduled for an earlier date (overdue, then finally started)
        // still counts as in progress; see Home's identical fix for why.
        return visits.filter((v) => v.status === 'IN_PROGRESS');
      case 'pendingToday':
        return visits.filter((v) => isToday(v.scheduled_date) && v.status !== 'IN_PROGRESS');
      case 'all':
        return visits;
      default:
        return visits;
    }
  }, [visits, filter]);

  const isCompletedView = filter === 'completed';
  const list = isCompletedView ? completedJobs : filteredVisits;

  // Normalized to one flat shape before rendering - `list` is a union of two
  // genuinely different API shapes (Job vs TechnicianVisit), each mapped to
  // the same row shape here once, so the FlatList below has a single,
  // simple renderItem instead of branching per-row on `isCompletedView`.
  const rows = useMemo((): JobQueueRow[] | null => {
    if (list === null) return null;
    if (isCompletedView) {
      return (list as Job[]).map(
        (job): JobQueueRow => ({
          rowKey: job.id,
          jobId: job.id,
          code: job.code,
          title: job.title,
          company: job.companyname ?? undefined,
          siteArea: job.site ?? undefined,
          address: job.address,
          when: formatDate(job.dueDate ?? job.start_date),
          sortDate: job.dueDate ?? job.start_date ?? null,
          status: job.status,
        }),
      );
    }
    return (list as TechnicianVisit[]).map(
      (visit): JobQueueRow => ({
        rowKey: visit.id,
        jobId: visit.job_id,
        code: visit.job_code,
        title: visit.sub_service,
        company: visit.companyname ?? undefined,
        siteArea: visit.sitename ?? undefined,
        address: visit.address,
        when: visit.scheduled_date
          ? `${formatDate(visit.scheduled_date)}, ${formatTime(visit.scheduled_date)}`
          : undefined,
        sortDate: visit.scheduled_date,
        status: visit.status,
      }),
    );
  }, [list, isCompletedView]);

  // "Sort by Time" (default - earliest first, undated last, EXCEPT on the
  // Completed view - see below) vs "Sort by Status" (active/actionable work
  // first) - a real reorder of the same rows, not a second fetch or a
  // different dataset.
  const sortedRows = useMemo(() => {
    if (!rows) return null;
    const copy = [...rows];
    if (sortBy === 'status') {
      copy.sort((a, b) => (STATUS_SORT_RANK[a.status ?? ''] ?? 9) - (STATUS_SORT_RANK[b.status ?? ''] ?? 9));
    } else {
      // Completed is a history list, not an upcoming queue - the most
      // recently completed job belongs at the top, so this one view sorts
      // newest-first instead of the soonest-due-first order every other
      // filter uses.
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* FlatList, not ScreenContainer's ScrollView+map - see JobsListScreen's
          identical note. A technician's own history (this screen's
          'completed'/'all' views) accumulates every job they've ever done,
          unbounded, so it has the same long-list memory profile. */}
      <FlatList
        data={sortedRows ?? []}
        keyExtractor={(row) => row.rowKey}
        renderItem={({ item: row }) => (
          <WorkQueueCard row={row} onPress={() => navigation.navigate('JobDetail', { jobId: row.jobId })} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={styles.overline}>Stay on track</Text>
                <Text style={styles.title}>{TITLES[filter]}</Text>
                <Text style={styles.subtitle}>{SUBTITLES[filter]}</Text>
              </View>
              <View style={styles.headerIconWrap}>
                <View style={styles.headerIconBlob} />
                <View style={styles.headerIconCircle}>
                  <CalendarIcon size={26} color={colors.primary} />
                </View>
                <View style={styles.headerCheckBadge}>
                  <CheckCircleIcon size={12} color={colors.textOnPrimary} />
                </View>
              </View>
            </View>

            <View style={styles.quickFilterRow}>
              <StatCard
                label="Today"
                value={counts.today ?? 0}
                isLoading={counts.today === null}
                icon={<BriefcaseIcon size={16} color={colors.primary} />}
                accentColor={colors.primary}
                selected={filter === 'today'}
                tintWhenSelected
                onPress={() => applyFilter('today')}
              />
              <StatCard
                label="Pending"
                value={counts.pending ?? 0}
                isLoading={counts.pending === null}
                icon={<ClockIcon size={16} color={colors.warningText} />}
                accentColor={colors.warningText}
                selected={filter === 'pending'}
                tintWhenSelected
                onPress={() => applyFilter('pending')}
              />
              <StatCard
                label="Tomorrow"
                value={counts.tomorrow ?? 0}
                isLoading={counts.tomorrow === null}
                icon={<CalendarIcon size={16} color={colors.info} />}
                accentColor={colors.info}
                selected={filter === 'tomorrow'}
                tintWhenSelected
                onPress={() => applyFilter('tomorrow')}
              />
            </View>

            {!!error && <Banner message={error} variant="error" />}

            {rows === null && !error ? (
              <View>
                <Skeleton height={130} radius={16} style={styles.skeletonCard} />
                <Skeleton height={130} radius={16} style={styles.skeletonCard} />
                <Skeleton height={130} radius={16} style={styles.skeletonCard} />
              </View>
            ) : (
              !!rows &&
              rows.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>
                    {TITLES[filter].toUpperCase()} ({rows.length})
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
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

/**
 * One work-queue entry - its own card with a left accent bar colored by the
 * visit/job's real status, a compact company/site chip row (both genuinely
 * distinct fields - see JobQueueRow's doc comment), and a real "View Job"
 * button rather than a text link, matching the reference layout. Local to
 * this screen - the shared `JobCard` (used by Admin/Supervisor job lists
 * too) is untouched.
 */
function WorkQueueCard({ row, onPress }: { row: JobQueueRow; onPress: () => void }) {
  const meta = getStatusMeta(row.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
    >
      <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardCode} numberOfLines={1}>
            {row.code}
          </Text>
          <StatusBadge status={row.status} />
        </View>

        <Text style={styles.cardTitle} numberOfLines={1}>
          {row.title}
        </Text>
        {!!row.company && (
          <Text style={styles.cardCompany} numberOfLines={1}>
            {row.company}
          </Text>
        )}

        <View style={styles.metaRow}>
          {!!row.when && (
            <View style={styles.metaItem}>
              <ClockIcon size={13} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {row.when}
              </Text>
            </View>
          )}
          {!!row.address && (
            <View style={[styles.metaItem, styles.metaItemGrow]}>
              <PinIcon size={13} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {row.address}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footerRow}>
          <View style={styles.chipRow}>
            {!!row.company && (
              <View style={styles.chip}>
                <BriefcaseIcon size={12} color={colors.textSecondary} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {row.company}
                </Text>
              </View>
            )}
            {!!row.siteArea && (
              <View style={styles.chip}>
                <PinIcon size={12} color={colors.textSecondary} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {row.siteArea}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.viewJobButton}>
            <Text style={styles.viewJobText}>View Job</Text>
            <ChevronRightIcon size={15} color={colors.textOnPrimary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTextCol: {
    flex: 1,
    paddingRight: spacing.md,
  },
  overline: {
    ...typography.overline,
    color: colors.textMuted,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: 2,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBlob: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.primarySoftBg,
    transform: [{ rotate: '18deg' }],
  },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCheckBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  sortValue: {
    color: colors.primary,
  },
  sortChevron: {
    marginLeft: 2,
    transform: [{ rotate: '90deg' }],
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardCode: {
    ...typography.overline,
    color: colors.textMuted,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  cardCompany: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  metaItemGrow: {
    flexShrink: 1,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  viewJobButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  viewJobText: {
    ...typography.captionMedium,
    color: colors.textOnPrimary,
  },
});
