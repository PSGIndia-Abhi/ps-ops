import React, { useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { AppHeader } from '../../components/AppHeader';
import { BackgroundWash } from '../../components/BackgroundWash';
import { GradientCard } from '../../components/GradientCard';
import { SectionHeader } from '../../components/SectionHeader';
import { JobCard } from '../../components/JobCard';
import { Banner } from '../../components/Banner';
import { Skeleton } from '../../components/Skeleton';
import {
  AlertCircleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChartIcon,
  ChevronRightIcon,
  ClockIcon,
  PinIcon,
  SendIcon,
  SparkleIcon,
  SunIcon,
} from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { roleLabel, useUserRole } from '../../auth/role';
import { visitsApi, ApiError } from '../../api';
import { formatTime, getGreeting, isToday } from '../../utils/date';
import { getStatusMeta } from '../../utils/statusMeta';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { TechnicianVisit } from '../../types/visit';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & TechnicianTabParamList>;

/** Today's schedule preview is capped, not the full list - "View all" (-> My Jobs, filter=today) is the real list; this is just a glance. */
const SCHEDULE_PREVIEW_LIMIT = 4;

/**
 * The most important screen in the app, by design the smallest: a
 * technician opens this dozens of times a day to answer one question -
 * "what do I need to do now?" Reading order: a real-time "today's work"
 * summary up front (each number a genuine drill-down, not a decorative
 * stat), then - if one exists - the single active visit spotlighted on its
 * own, then a short preview of the rest of today, then quick shortcuts to
 * what doesn't fit here. Everything else (the fuller worklist, completed
 * jobs) lives one tap away on "My Jobs"/"View all".
 *
 * What's real and what isn't, and why:
 *  - Today's Jobs / In Progress / Pending come from GET /api/visits/my,
 *    filtered to today. That endpoint never returns COMPLETED/CANCELED
 *    visits (the backend excludes them outright), so there is no reliable
 *    way to compute "today's completed count" from it - showing one would
 *    mean guessing. Not shown, and no fabricated "% complete" progress bar
 *    either for the same reason (unlike Supervisor's dashboard, which can
 *    compute a real one from GET /api/jobs's own status field).
 *  - An all-time completed count (GET /api/dashboard/summary) isn't fetched
 *    here at all anymore - it wasn't being shown anywhere on this redesigned
 *    layout, and fetching data nothing renders is exactly the kind of
 *    unnecessary API call this app avoids. It's still one tap away via the
 *    "Completed" quick-access tile below (which lists the real jobs, not
 *    just a number).
 *  - The "Together for Safer Spaces" banner is pure brand decoration (no
 *    data, real or fake, is attached to it) - same spirit as the puzzle-
 *    piece corner shapes tried on Login.
 */
export function TechnicianDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const role = useUserRole();

  const [visits, setVisits] = useState<TechnicianVisit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Today's Schedule is a horizontal slider (one card at a time, swipeable)
  // rather than a stacked vertical list - `scheduleWidth` is measured via
  // onLayout (not assumed) so each card/page is sized to the actual
  // available content width, and `scheduleIndex` (from the scroll
  // position) drives the dot indicator below it.
  const [scheduleWidth, setScheduleWidth] = useState(0);
  const [scheduleIndex, setScheduleIndex] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setVisits(await visitsApi.listMyVisits());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refetch every time Home regains focus (returning from JobDetail after
  // Start Visit, switching tabs and back, etc.) rather than only once on
  // mount - this is the actual bug fix: Home was showing stale visit
  // status because it never refetched after a status-changing action
  // elsewhere. Screen-focus-driven refresh, not a poll/interval - it only
  // runs when the user is actually looking at this screen again.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const todaysVisits = visits
    ? [...visits.filter((v) => isToday(v.scheduled_date))].sort(
        (a, b) => new Date(a.scheduled_date ?? 0).getTime() - new Date(b.scheduled_date ?? 0).getTime(),
      )
    : null;
  const inProgressVisits = todaysVisits?.filter((v) => v.status === 'IN_PROGRESS') ?? [];
  // Only the single most-relevant in-progress visit gets the spotlight card;
  // if a technician somehow has more than one active at once, the rest still
  // show up in the schedule preview below rather than being silently dropped.
  const inProgressVisit = inProgressVisits[0] ?? null;
  const inProgressCount = inProgressVisits.length;
  const pendingCount = todaysVisits ? todaysVisits.length - inProgressCount : 0;
  const restOfToday = todaysVisits?.filter((v) => v.id !== inProgressVisit?.id) ?? [];
  const nextVisitId = restOfToday.find((v) => v.status !== 'IN_PROGRESS')?.id ?? restOfToday[0]?.id;
  const schedulePreview = restOfToday.slice(0, SCHEDULE_PREVIEW_LIMIT);

  function handleScheduleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!scheduleWidth) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / scheduleWidth);
    setScheduleIndex(Math.max(0, Math.min(schedulePreview.length - 1, next)));
  }

  return (
    <View style={styles.flex}>
      {/* Same whisper-soft brand wash Login uses, not a new pattern - the
          rest of the screen (AppHeader, cards) still sits on its own solid
          surface, so this only ever shows in the gaps between them. Needs
          ScreenContainer's `transparent` so its own solid fill doesn't cover
          it. */}
      <BackgroundWash />
      <AppHeader
        userName={user?.name ?? ''}
        roleLabel={role ? roleLabel(role) : ''}
        onProfilePress={() => navigation.navigate('Profile')}
        onNotificationsPress={() => navigation.navigate('Notifications')}
      />
      <ScreenContainer transparent onRefresh={() => load(true)} refreshing={refreshing}>
        {/* A touch more breathing room than the shared ScreenContainer's own
            base padding gives every screen - local to Home only, not a
            change to that shared component (which every other screen also
            sits in). */}
        <View style={styles.homePad}>
        <GreetingCard name={firstName(user?.name)} />

        {!!error && <Banner message={error} variant="error" />}

        <View style={styles.dashStatRow}>
          <DashStat
            icon={<BriefcaseIcon size={16} color={colors.textOnPrimary} />}
            value={todaysVisits?.length}
            label="Today's jobs"
            accentColor={colors.primary}
            onPress={() => navigation.navigate('MyJobs', { filter: 'today' })}
          />
          <DashStat
            icon={<ClockIcon size={16} color={colors.textOnPrimary} />}
            value={todaysVisits ? inProgressCount : undefined}
            label="In progress"
            accentColor={colors.warning}
            onPress={() => navigation.navigate('MyJobs', { filter: 'inProgress' })}
          />
          <DashStat
            icon={<AlertCircleIcon size={16} color={colors.textOnPrimary} />}
            value={todaysVisits ? pendingCount : undefined}
            label="Pending today"
            accentColor={colors.danger}
            onPress={() => navigation.navigate('MyJobs', { filter: 'pendingToday' })}
          />
        </View>

        {!!inProgressVisit && (
          <>
            <SectionHeader title="In progress" />
            <JobCard
              code={inProgressVisit.job_code}
              title={inProgressVisit.sub_service}
              site={inProgressVisit.companyname ?? inProgressVisit.sitename ?? undefined}
              address={inProgressVisit.address}
              when={formatTime(inProgressVisit.scheduled_date)}
              status={inProgressVisit.status}
              actionLabel="Continue"
              highlighted
              highlightLabel="ACTIVE"
              onPress={() => navigation.navigate('JobDetail', { jobId: inProgressVisit.job_id })}
            />
          </>
        )}

        <RichSectionHeader
          title="Today's Schedule"
          gradientUnderline
          actionLabel="View all"
          onAction={() => navigation.navigate('MyJobs', { filter: 'today' })}
        />
        {todaysVisits === null && !error ? (
          <View>
            <Skeleton height={64} radius={16} style={styles.skeletonCard} />
            <Skeleton height={64} radius={16} style={styles.skeletonCard} />
          </View>
        ) : todaysVisits === null ? null : todaysVisits.length === 0 ? (
          <ScheduleEmptyCard />
        ) : schedulePreview.length === 0 ? null : (
          <View
            style={styles.scheduleCarouselWrap}
            onLayout={(e) => setScheduleWidth(e.nativeEvent.layout.width)}
          >
            {!!scheduleWidth && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScheduleScrollEnd}
              >
                {schedulePreview.map((visit) => (
                  <View key={visit.id} style={{ width: scheduleWidth }}>
                    <TodayScheduleItem
                      time={formatTime(visit.scheduled_date)}
                      site={visit.companyname ?? visit.sitename ?? 'Job'}
                      jobType={visit.sub_service}
                      status={visit.status}
                      isNext={visit.id === nextVisitId}
                      onPress={() => navigation.navigate('JobDetail', { jobId: visit.job_id })}
                    />
                  </View>
                ))}
              </ScrollView>
            )}
            {schedulePreview.length > 1 && (
              <View style={styles.scheduleDotsRow}>
                {schedulePreview.map((visit, i) => (
                  <View
                    key={visit.id}
                    style={[styles.scheduleDot, i === scheduleIndex && styles.scheduleDotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <RichSectionHeader
          title="Quick Access"
          actionLabel="See all"
          onAction={() => navigation.navigate('More')}
        />
        <View style={styles.quickActionRow}>
          <QuickAccessTile
            label="My Jobs"
            icon={<BriefcaseIcon size={20} color={colors.textOnPrimary} />}
            accentColor={colors.primary}
            onPress={() => navigation.navigate('MyJobs', { filter: 'today' })}
          />
          <QuickAccessTile
            label="Schedule"
            icon={<CalendarIcon size={20} color={colors.textOnPrimary} />}
            accentColor={colors.warning}
            onPress={() => navigation.navigate('Schedule', { filter: 'tomorrow' })}
          />
          <QuickAccessTile
            label="Performance"
            icon={<ChartIcon size={20} color={colors.textOnPrimary} />}
            accentColor={colors.accent}
            onPress={() => navigation.navigate('Performance')}
          />
          <QuickAccessTile
            label="Completed"
            icon={<CheckCircleIcon size={20} color={colors.textOnPrimary} />}
            accentColor={colors.success}
            onPress={() => navigation.navigate('MyJobs', { filter: 'completed' })}
          />
        </View>

        <GradientCard color={colors.primary} style={styles.promoCard}>
          <View style={styles.promoGlow} />
          <Text style={styles.promoTitle}>Together for</Text>
          <Text style={[styles.promoTitle, styles.promoTitleAccent]}>Safer Spaces</Text>
          <View style={styles.promoUnderline} />
        </GradientCard>
        </View>
      </ScreenContainer>
    </View>
  );
}

/**
 * A bigger, two-line section header (title + supporting sentence + a
 * colored underline) with an optional chevron-accompanied action - used for
 * "Today's Schedule"/"Quick Access" specifically, which this reference
 * gives real visual weight to. The plain, single-line `SectionHeader` (used
 * everywhere else on this screen, and across every other role's dashboard)
 * is untouched - this is a local, heavier variant, not a replacement.
 */
function RichSectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  gradientUnderline,
}: {
  title: string;
  /** Optional - the reference gives this header treatment no supporting sentence on either "Today's Schedule" or "Quick Access", just title + underline + action. */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** "Today's Schedule" uses a genuine blue gradient bar; "Quick Access" uses a plain solid one (matching this screen's other underline accents) - both real per the reference, not the same asset reused. */
  gradientUnderline?: boolean;
}) {
  const gradId = useRef(`richHeaderGrad${Math.round(Math.random() * 1e6)}`).current;
  return (
    <View style={styles.richHeaderRow}>
      <View style={styles.richHeaderTextCol}>
        <Text style={styles.richHeaderTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.richHeaderSubtitle}>{subtitle}</Text>}
        {gradientUnderline ? (
          <Svg width={64} height={4} style={styles.richHeaderUnderlineGap}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.primary} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0.15} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={64} height={4} rx={2} fill={`url(#${gradId})`} />
          </Svg>
        ) : (
          <View style={styles.richHeaderUnderlineSolid} />
        )}
      </View>
      {!!actionLabel && (
        <Pressable onPress={onAction} hitSlop={8} style={styles.richHeaderAction}>
          <Text style={styles.richHeaderActionText}>{actionLabel}</Text>
          <ChevronRightIcon size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * One of the three "today's work" numbers - the reference gives each its own
 * tinted card (not a shared white card) with a solid-color icon circle, so
 * this takes the icon element as-is and renders it in white on top of
 * `accentColor` rather than the muted-outline-on-tint treatment used
 * elsewhere in the app.
 */
function DashStat({
  icon,
  value,
  label,
  accentColor,
  onPress,
}: {
  icon: React.ReactNode;
  value: number | undefined;
  label: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.dashStatCard, { backgroundColor: `${accentColor}1F` }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? 'loading'}`}
    >
      <View style={[styles.dashStatIconWrap, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.dashStatValue}>{value ?? '–'}</Text>
      <Text style={styles.dashStatLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "11:25 PM" -> ["11:25", "PM"] for the reference's stacked two-line time block - falls back to [time, ''] if formatTime ever returns something without a space (e.g. its own "--" placeholder). */
function splitTime(time: string): [string, string] {
  const lastSpace = time.lastIndexOf(' ');
  if (lastSpace === -1) return [time, ''];
  return [time.slice(0, lastSpace), time.slice(lastSpace + 1)];
}

/**
 * One "Today's schedule" preview entry - a left accent strip colored by the
 * visit's real status, a stacked two-line time block + divider, a gradient
 * "UP NEXT" pill, a location-style status pill, a large translucent ghost
 * calendar for depth, and a circular chevron button - all in the visit's
 * own status color rather than one fixed blue, so "Missed"/"Awaiting
 * approval" etc. still read correctly if they ever show up in this preview.
 * Local to this screen - `ScheduleRow` (used by Admin/Supervisor too) is
 * untouched.
 */
function TodayScheduleItem({
  time,
  site,
  jobType,
  status,
  isNext,
  onPress,
}: {
  time: string;
  site: string;
  jobType: string;
  status: string | null | undefined;
  isNext: boolean;
  onPress: () => void;
}) {
  const meta = getStatusMeta(status);
  const [hourMinute, meridiem] = splitTime(time);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.scheduleItem,
        { backgroundColor: `${meta.color}0D` },
        isNext && styles.scheduleItemNext,
        pressed && styles.scheduleItemPressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.scheduleAccent, { backgroundColor: meta.color }]} />
      <View style={styles.scheduleGhostWrap}>
        <CalendarIcon size={80} color={meta.color} />
      </View>

      <View style={styles.scheduleTimeCol}>
        <View style={[styles.scheduleTimeIconWrap, { backgroundColor: meta.bg }]}>
          <ClockIcon size={15} color={meta.color} />
        </View>
        <Text style={[styles.scheduleTimeHour, { color: meta.color }]} numberOfLines={1}>
          {hourMinute}
        </Text>
        {!!meridiem && <Text style={styles.scheduleTimeMeridiem}>{meridiem}</Text>}
      </View>

      <View style={[styles.scheduleDivider, { backgroundColor: `${meta.color}33` }]} />

      <View style={styles.scheduleBody}>
        <View style={styles.scheduleTopRow}>
          <Text style={styles.scheduleSite} numberOfLines={1}>
            {site}
          </Text>
          {isNext && (
            <View style={styles.nextTag}>
              <Text style={styles.nextTagText}>UP NEXT</Text>
            </View>
          )}
        </View>
        <Text style={styles.scheduleJobType} numberOfLines={1}>
          {jobType}
        </Text>
        <View style={[styles.scheduleStatusPill, { backgroundColor: meta.bg }]}>
          <PinIcon size={12} color={meta.color} />
          <Text style={[styles.scheduleStatusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.scheduleChevronBtn}>
        <ChevronRightIcon size={16} color={meta.color} />
      </View>
    </Pressable>
  );
}

/**
 * Home's greeting banner - a soft illustrated card (reference), not the
 * previous plain text block: a sun glyph + italic tagline up top, a big
 * two-line "Good morning, <name>" below, and a small skyline+trees
 * illustration bleeding into the bottom-right corner. All pure decoration
 * (the name is the only real data in it), same spirit as the "Together for
 * Safer Spaces" promo card further down this same screen.
 */
function GreetingCard({ name }: { name: string }) {
  return (
    <GradientCard color={colors.primarySoft} style={styles.greetingCard}>
      <View style={styles.greetingIllustration} pointerEvents="none">
        <GreetingSkyline />
      </View>
      <View style={styles.greetingHeaderRow}>
        <View style={styles.greetingSunWrap}>
          <SunIcon size={19} color={colors.warning} />
        </View>
        <View style={styles.greetingTaglineCol}>
          <Text style={styles.greetingTagline}>“Safer Spaces{'\n'}Together”</Text>
          <View style={styles.greetingTaglineUnderline} />
        </View>
      </View>
      <Text style={styles.greetingBig}>{getGreeting()},</Text>
      <Text style={[styles.greetingBig, styles.greetingBigName]}>{name}</Text>
    </GradientCard>
  );
}

/** Small skyline+trees decoration for the greeting card's bottom-right corner - deliberately compact (unlike the full-bleed `DecorativeSkyline` on Login), and local to this one card rather than a shared component since nothing else needs this exact size/palette. */
function GreetingSkyline() {
  return (
    <Svg width={132} height={92} viewBox="0 0 132 92">
      <Circle cx={20} cy={78} r={13} fill={colors.success} opacity={0.55} />
      <Circle cx={11} cy={70} r={10} fill={colors.success} opacity={0.5} />
      <Rect x={17} y={80} width={4} height={10} fill={colors.crestRedDeep} opacity={0.3} />
      <Circle cx={42} cy={82} r={9} fill={colors.success} opacity={0.45} />
      <Rect x={39} y={88} width={3} height={7} fill={colors.crestRedDeep} opacity={0.25} />
      <Rect x={62} y={38} width={26} height={54} rx={5} fill={colors.surface} opacity={0.55} />
      <Rect x={69} y={48} width={4} height={4} rx={1} fill={colors.primary} opacity={0.4} />
      <Rect x={78} y={48} width={4} height={4} rx={1} fill={colors.primary} opacity={0.4} />
      <Rect x={69} y={58} width={4} height={4} rx={1} fill={colors.primary} opacity={0.4} />
      <Rect x={78} y={58} width={4} height={4} rx={1} fill={colors.primary} opacity={0.4} />
      <Rect x={96} y={16} width={24} height={76} rx={5} fill={colors.surface} opacity={0.75} />
      <Rect x={106} y={4} width={2} height={14} fill={colors.surface} opacity={0.75} />
      <Rect x={102} y={26} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
      <Rect x={111} y={26} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
      <Rect x={102} y={36} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
      <Rect x={111} y={36} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
      <Rect x={102} y={46} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
      <Rect x={111} y={46} width={4} height={4} rx={1} fill={colors.primary} opacity={0.45} />
    </Svg>
  );
}

/**
 * "No jobs scheduled" for Today's Schedule when the technician has nothing
 * today - a dashed path curving from a calendar+sparkle glyph to a paper
 * plane (reusing `SendIcon`, the app's existing paper-plane glyph, rather
 * than adding a near-duplicate icon), matching the reference illustration
 * instead of the plain `EmptyState` used everywhere else in the app.
 */
function ScheduleEmptyCard() {
  return (
    <View style={styles.scheduleEmptyCard}>
      <View style={styles.scheduleEmptyArt}>
        <Svg width="100%" height={90} viewBox="0 0 280 90" preserveAspectRatio="none">
          <Path
            d="M46 24 C110 18 150 78 234 62"
            stroke={colors.primarySoft}
            strokeWidth={2}
            strokeDasharray="6 7"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
        <View style={styles.scheduleEmptyCalendarWrap}>
          <CalendarIcon size={26} color={colors.primary} />
          <View style={styles.scheduleEmptySparkle}>
            <SparkleIcon size={14} color={colors.warning} />
          </View>
        </View>
        <View style={styles.scheduleEmptyPlaneWrap}>
          <SendIcon size={18} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.scheduleEmptyTitle}>No jobs scheduled</Text>
    </View>
  );
}

/** One "Quick Access" shortcut - a flat tinted tile with a solid icon circle and a label, matching the reference's single-row layout (no description/ghost-icon treatment - that's `RichActionTile`, still used on Profile). */
function QuickAccessTile({
  label,
  icon,
  accentColor,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        { backgroundColor: `${accentColor}1F` },
        pressed && styles.quickTilePressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickTileIconWrap, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.quickTileLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

function firstName(name: string | undefined): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  homePad: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  // No flat backgroundColor here anymore - GradientCard supplies its own
  // diagonal light-to-deep fill built from the `color` passed to it (same
  // pattern as the "Together for Safer Spaces" promo card further down this
  // screen), giving the card real depth instead of one flat pale-blue tone.
  greetingCard: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  greetingIllustration: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  greetingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  greetingSunWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingTaglineCol: {
    alignItems: 'flex-end',
  },
  greetingTagline: {
    ...typography.captionMedium,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  greetingTaglineUnderline: {
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.crestRed,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  greetingBig: {
    ...typography.display,
    color: colors.textPrimary,
  },
  greetingBigName: {
    color: colors.primary,
  },
  richHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  richHeaderTextCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  // Medium, not the full `typography.title` (22px) this used to borrow -
  // "Today's Schedule"/"Quick Access" are section labels, not headline text.
  richHeaderTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  richHeaderSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 1,
  },
  richHeaderUnderlineGap: {
    marginTop: spacing.xs,
  },
  richHeaderUnderlineSolid: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.crestRed,
    marginTop: spacing.xs,
  },
  richHeaderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  richHeaderActionText: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  dashStatRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dashStatCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  dashStatIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dashStatValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  dashStatLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  scheduleCarouselWrap: {
    marginBottom: spacing.xl,
  },
  scheduleDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  scheduleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  scheduleDotActive: {
    width: 16,
    backgroundColor: colors.primary,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingRight: spacing.sm,
    overflow: 'hidden',
  },
  scheduleItemNext: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoftBg,
  },
  scheduleItemPressed: {
    opacity: 0.85,
  },
  scheduleAccent: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: spacing.sm,
  },
  scheduleGhostWrap: {
    position: 'absolute',
    top: -14,
    right: -10,
    opacity: 0.16,
  },
  scheduleTimeCol: {
    alignItems: 'center',
    width: 76,
  },
  scheduleTimeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  scheduleTimeHour: {
    ...typography.bodyMedium,
    fontSize: 17,
    fontWeight: '700',
  },
  scheduleTimeMeridiem: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -2,
  },
  scheduleDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: spacing.xs,
    marginRight: spacing.sm,
  },
  scheduleBody: {
    flex: 1,
    gap: 2,
  },
  scheduleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scheduleSite: {
    ...typography.bodyMedium,
    fontSize: 16,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  scheduleJobType: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textSecondary,
  },
  scheduleStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    marginTop: 3,
  },
  scheduleStatusText: {
    ...typography.captionMedium,
    fontSize: 11,
  },
  scheduleChevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  nextTag: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nextTagText: {
    ...typography.overline,
    fontSize: 9,
    color: colors.textOnPrimary,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickTile: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxs,
    gap: spacing.xs,
  },
  quickTilePressed: {
    opacity: 0.85,
  },
  quickTileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileLabel: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  scheduleEmptyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  scheduleEmptyArt: {
    width: '100%',
    height: 90,
    marginBottom: spacing.sm,
  },
  scheduleEmptyCalendarWrap: {
    position: 'absolute',
    left: 28,
    top: 4,
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleEmptySparkle: {
    position: 'absolute',
    top: -4,
    right: -6,
  },
  scheduleEmptyPlaneWrap: {
    position: 'absolute',
    right: 24,
    bottom: 8,
    transform: [{ rotate: '20deg' }],
  },
  scheduleEmptyTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  promoCard: {
    padding: spacing.lg,
    overflow: 'hidden',
  },
  promoGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  promoTitle: {
    ...typography.title,
    color: colors.textOnPrimary,
  },
  promoTitleAccent: {
    color: colors.crestRed,
  },
  promoUnderline: {
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textOnPrimary,
    marginTop: spacing.sm,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },
});
