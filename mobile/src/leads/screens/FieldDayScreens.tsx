import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Easing, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GlossyBadge } from '../../components/GlossyBadge';
import { AlertTriangleIcon, CalendarIcon, ChevronRightIcon, ClockIcon, PersonIcon, PinIcon, PlayIcon, PlusIcon, ShieldIcon, StopIcon, UsersIcon } from '../../components/icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { formatShiftClock } from '../../screens/technician/shiftTime';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon, TrendUpIcon } from '../../crm/ui/crmIcons';
import { fmtTime, fmtTimestamp, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import { getCurrentLocation } from '../../utils/location';
import { refreshReminders } from '../../reminders-engine/useReminders';
import * as api from '../api';
import * as field from '../fieldApi';
import { FieldDialog } from '../FieldDialog';
import * as tracking from '../fieldTracking';
import type { FieldShift } from '../fieldApi';
import type { LeadStackParamList } from '../navigation';
import type { Coords, PipelineLead, PipelineStage } from '../types';
import { errorMessage, GradientFill, LeadRow, MeetingRow, useLoad, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

/**
 * Sales Executive field day: Start Shift (from wherever they are - petrol is counted from that
 * start point, on the manager's side), punch in / out at clients, unplanned visits, End Shift.
 * The manager reviews the day on the web (Lead Management -> Field Tracking).
 */

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const WHITE = '#FFFFFF';

/** The small stopwatch dial on the Field Day card. */
const DIAL = 66;
const DIAL_CENTER = DIAL / 2;
const TICKS = 60;

/**
 * 60 ticks like a stopwatch: while on duty they light up second by second with a dot on the
 * leading edge, starting over every minute; off duty the dial rests, dim. Same idea as the
 * technician's My Shift clock, drawn at card size.
 */
function ShiftDial({ litSeconds, running, color, rest }: { litSeconds: number; running: boolean; color: string; rest: string }) {
  const tipAngle = ((-90 + (litSeconds * 360) / TICKS) * Math.PI) / 180;
  const tipRadius = DIAL_CENTER - 17;
  return (
    <Svg width={DIAL} height={DIAL}>
      {Array.from({ length: TICKS }, (_, i) => {
        const angle = ((-90 + (i * 360) / TICKS) * Math.PI) / 180;
        const major = i % 5 === 0;
        const outer = DIAL_CENTER - 2;
        const inner = outer - (major ? 8 : 4);
        const lit = running && i <= litSeconds;
        return (
          <Line
            key={i}
            x1={DIAL_CENTER + Math.cos(angle) * outer}
            y1={DIAL_CENTER + Math.sin(angle) * outer}
            x2={DIAL_CENTER + Math.cos(angle) * inner}
            y2={DIAL_CENTER + Math.sin(angle) * inner}
            stroke={lit ? color : rest}
            strokeOpacity={lit || major ? 1 : 0.6}
            strokeWidth={major ? 2.2 : 1.3}
            strokeLinecap="round"
          />
        );
      })}
      {running && (
        <Circle cx={DIAL_CENTER + Math.cos(tipAngle) * tipRadius} cy={DIAL_CENTER + Math.sin(tipAngle) * tipRadius} r={3} fill={color} />
      )}
    </Svg>
  );
}

/** Stages a visit can be recorded for - the server's ACTIVE_MEETING_STAGES (crm-lead-meetings.routes.js). */
const VISITABLE_STAGES: PipelineStage[] = [
  'NEW', 'TO_CALL', 'QUALIFIED', 'NEED_MORE_INFO', 'MEETING_SCHEDULED', 'VISIT_COMPLETED', 'QUOTATION_SENT',
];

const factory = (t: CrmTheme) => ({
  // Shift card: one compact gradient row - blue off duty, green and "live" on duty: the stopwatch
  // dial, the status and time, and a small pill button; My Day as a slim link under it.
  hero: {
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    overflow: 'hidden' as const,
    ...t.raisedShadow,
  },
  bubble: { position: 'absolute' as const, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  bubbleBig: { width: 150, height: 150, top: -70, right: -40 },
  bubbleSmall: { width: 90, height: 90, bottom: -50, left: 60 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  faceWrap: { width: DIAL, height: DIAL, alignItems: 'center' as const, justifyContent: 'center' as const },
  glow: {
    position: 'absolute' as const,
    width: DIAL - 8,
    height: DIAL - 8,
    borderRadius: (DIAL - 8) / 2,
    borderWidth: 3,
  },
  faceCenter: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  faceIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  faceSec: { fontSize: 15, lineHeight: 18, fontWeight: '800' as const, color: WHITE },
  side: { flex: 1 },
  statusPill: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: WHITE },
  dotIdle: { opacity: 0.6 },
  statusText: { ...typography.overline, fontSize: 10, color: WHITE },
  bigClock: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const, color: WHITE, letterSpacing: 0.5, marginTop: 2 },
  since: { ...typography.caption, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  heroButton: {
    flexDirection: 'row' as const,
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  startButton: { backgroundColor: WHITE },
  endButton: { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  heroButtonText: { ...typography.bodyMedium, fontWeight: '800' as const },
  startText: { color: '#1D4ED8' },
  endText: { color: WHITE },
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    minHeight: 38,
  },
  linkText: { ...typography.caption, fontWeight: '700' as const, color: WHITE, flex: 1 },
  pressed: { opacity: 0.85 },

  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  stats: { flexDirection: 'row' as const, gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: spacing.md,
    alignItems: 'center' as const,
  },
  statValue: { ...typography.title, color: t.textPrimary, marginTop: spacing.xs },
  statLabel: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  sectionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: t.textPrimary },
  hint: { ...typography.caption, color: t.textMuted },
  tag: {
    alignSelf: 'flex-start' as const,
    backgroundColor: t.accentBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginBottom: -spacing.xs,
    marginLeft: spacing.sm,
    zIndex: 1,
  },
  tagText: { ...typography.captionMedium, color: t.accentText },

  searchWrap: { paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  busyRow: { opacity: 0.5 },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface },
  // Unplanned visit footer: one control split into two halves.
  split: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    overflow: 'hidden' as const,
  },
  splitHalf: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minHeight: 64,
  },
  splitPressed: { backgroundColor: t.surfaceAlt },
  splitDivider: { width: 1, backgroundColor: t.border, marginVertical: spacing.sm },
  splitText: { flex: 1 },
  splitTitle: { ...typography.bodyMedium, fontWeight: '800' as const },
  splitSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },

  // "Just a conversation": gradient hero, a form card with quick notes, a sticky Punch in.
  convBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  convHero: { borderRadius: 24, padding: spacing.lg, overflow: 'hidden' as const, ...t.raisedShadow },
  convHeroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  convHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  convHeroTitle: { fontSize: 21, lineHeight: 26, fontWeight: '800' as const, color: WHITE },
  convHeroSub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  convChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginTop: spacing.md },
  convChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  convChipText: { ...typography.captionMedium, color: WHITE },
  convForm: {
    backgroundColor: t.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  convStep: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  convStepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.accentBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  convStepNoText: { fontSize: 12, fontWeight: '800' as const, color: t.accentText },
  convStepTitle: { ...typography.overline, color: t.textSecondary },
  convCount: { ...typography.caption, color: t.textMuted, marginLeft: 'auto' as const },
  convQuickLabel: { ...typography.caption, color: t.textMuted, marginBottom: spacing.xs },
  convQuick: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginBottom: spacing.md },
  convQuickChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  convQuickChipOn: { borderColor: t.accent, backgroundColor: t.accentBg },
  convQuickText: { ...typography.captionMedium, color: t.textSecondary },
  convQuickTextOn: { color: t.accentText },
  convFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface },

  // The day's conversation cards on My Day.
  convCard: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  convHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  convWho: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  convTime: { ...typography.caption, color: t.textMuted },
  convNote: { ...typography.body, color: t.textSecondary },
});

/** 'YYYY-MM-DD HH:MM:SS' -> "9:02 AM". */
function clock(at: string): string {
  return fmtTimestamp(at.replace(' ', 'T')).split(', ').pop() ?? at;
}

/** The phone's position for a punch; null when it cannot be had. */
async function readCoords(): Promise<Coords | null> {
  try {
    const loc = await getCurrentLocation();
    return { lat: loc.latitude, lng: loc.longitude };
  } catch {
    return null;
  }
}

/** The open shift, re-read every time the screen comes into view. */
function useCurrentShift() {
  const [shift, setShift] = useState<FieldShift | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const current = await field.currentShift();
      setShift(current);
      setError(null);
      // Keep the phone's GPS recording in step with the server: resume it for an open shift (app
      // reopened, phone restarted), stop it when the shift was closed (auto-ended overnight).
      if (current) tracking.ensureTracking(current.id);
      else if (await tracking.isTracking()) tracking.stopTracking().catch(() => {});
    } catch (err) {
      setError(errorMessage(err, 'Could not load your shift.'));
    } finally {
      setLoaded(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { shift, setShift, loaded, error, reload };
}

/** The battery prompt is shown at most once per app run while a shift is open (see ShiftCard). */
let askedBatteryThisRun = false;

/**
 * Start / End Shift. Shown at the top of the sales executive's Home and on My Day.
 * `onChange` lets the host refresh its own numbers after a start or end.
 */
export function ShiftCard({ showMyDayLink = false, onChange }: { showMyDayLink?: boolean; onChange?: () => void }) {
  const navigation = useNavigation<Nav>();
  const { styles } = useCrmStyles(factory);
  const { shift, setShift, loaded, error, reload } = useCurrentShift();
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onStart = async () => {
    setBusy('start');
    setActionError(null);
    try {
      const coords = await readCoords();
      // The day's start point is the one thing the shift cannot do without.
      if (!coords) {
        setActionError('Your location is needed to start the shift. Turn on location and try again.');
        return;
      }
      const started = await field.startShift(coords);
      setShift(started);
      onChange?.();
      try {
        await tracking.startTracking(started.id);
        // The phone may stop background tracking to save battery: ask once to allow it. Once allowed
        // it is never asked again.
        if (!(await tracking.backgroundAllowed())) setAskBattery(true);
      } catch {
        setActionError('Shift started, but location tracking could not start. Keep location on and reopen the app.');
      }
    } catch (err) {
      setActionError(errorMessage(err, 'Could not start the shift. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const doEnd = async () => {
    setBusy('end');
    setActionError(null);
    try {
      await field.endShift(await readCoords());
      setShift(null);
      // Stop recording and send what is still on the phone, so the manager sees the whole day.
      await tracking.stopTracking();
      onChange?.();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not end the shift. Please try again.'));
      reload();
    } finally {
      setBusy(null);
    }
  };
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [askBattery, setAskBattery] = useState(false);
  // Already on duty (e.g. the app was updated or reopened mid-shift) with limits still on: ask once
  // per app run as well, not only at Start shift.
  useEffect(() => {
    if (!shift || askedBatteryThisRun) return;
    askedBatteryThisRun = true;
    tracking.backgroundAllowed().then((ok) => !ok && setAskBattery(true));
  }, [shift]);
  // Back from Android's battery screen: close the prompt once it was allowed.
  useEffect(() => {
    if (!askBattery) return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && (await tracking.backgroundAllowed())) setAskBattery(false);
    });
    return () => sub.remove();
  }, [askBattery]);
  const active = !!shift;

  // The running clock: ticks every second only while on duty and this screen is in view
  // (Home stays mounted under other tabs), like the technician's My Shift screen.
  const isFocused = useIsFocused();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !isFocused) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, isFocused]);

  // A soft glow that breathes around the face while the shift runs.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || !isFocused) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, isFocused, pulse]);

  if (!loaded) return <CrmSkeleton height={showMyDayLink ? 150 : 98} radius={22} />;

  // started_at is the server's wall-clock time, read as local time on the phone.
  const elapsed = shift ? Math.max(0, now - new Date(shift.startedAt.replace(' ', 'T')).getTime()) : 0;
  const litSeconds = Math.floor(elapsed / 1000) % 60;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });

  return (
    <View>
      <CrmErrorBanner message={error} onRetry={reload} />
      <CrmErrorBanner message={actionError} />
      <View style={styles.hero}>
        <GradientFill from={active ? '#10B981' : '#2563EB'} to={active ? '#047857' : '#1E3A8A'} />
        <View style={[styles.bubble, styles.bubbleBig]} pointerEvents="none" />
        <View style={[styles.bubble, styles.bubbleSmall]} pointerEvents="none" />

        <View style={styles.row}>
          <View style={styles.faceWrap}>
            {active && <Animated.View style={[styles.glow, { borderColor: WHITE, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
            <ShiftDial litSeconds={litSeconds} running={active} color={WHITE} rest="rgba(255,255,255,0.3)" />
            <View style={styles.faceCenter} pointerEvents="none">
              {active ? (
                <Text style={styles.faceSec}>{String(litSeconds).padStart(2, '0')}</Text>
              ) : (
                <View style={styles.faceIcon}>
                  <ClockIcon size={15} color={WHITE} />
                </View>
              )}
            </View>
          </View>

          <View style={styles.side}>
            <View style={styles.statusPill}>
              {active ? <Animated.View style={[styles.dot, { opacity: dotOpacity }]} /> : <View style={[styles.dot, styles.dotIdle]} />}
              <Text style={styles.statusText}>{active ? 'ON DUTY · LIVE' : 'OFF DUTY'}</Text>
            </View>
            <Text style={styles.bigClock} accessibilityLabel={shift ? `Time on duty ${formatShiftClock(elapsed)}` : 'Not on duty'} numberOfLines={1} adjustsFontSizeToFit>
              {shift ? formatShiftClock(elapsed) : '--:--'}
            </Text>
            {!!shift && <Text style={styles.since}>Since {clock(shift.startedAt)}</Text>}
          </View>

          <Pressable
            onPress={active ? () => setConfirmEnd(true) : onStart}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={active ? 'End shift' : 'Start shift'}
            style={({ pressed }) => [styles.heroButton, active ? styles.endButton : styles.startButton, (pressed || busy !== null) && styles.pressed]}
          >
            {active ? <StopIcon size={14} color={WHITE} /> : <PlayIcon size={14} color="#1D4ED8" />}
            <Text style={[styles.heroButtonText, active ? styles.endText : styles.startText]}>
              {busy === 'start' ? 'Starting' : busy === 'end' ? 'Ending' : active ? 'End' : 'Start'}
            </Text>
          </Pressable>
        </View>

        {showMyDayLink && (
          <Pressable
            onPress={() => navigation.navigate('LeadMyDay')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <PinIcon size={15} color={WHITE} />
            <Text style={styles.linkText}>My day · visits & unplanned visit</Text>
            <ChevronRightIcon size={15} color={WHITE} />
          </Pressable>
        )}
      </View>

      <FieldDialog
        visible={askBattery}
        tone="warning"
        icon={ShieldIcon}
        title="Keep tracking on all day"
        message="To save battery, your phone can stop BestServe in the background - then your route has gaps and those trips are flagged. Allow BestServe to run without battery limits (on Xiaomi, Oppo or Vivo phones also turn on Autostart)."
        onClose={() => setAskBattery(false)}
        actions={[
          { label: 'Allow', variant: 'primary', onPress: () => tracking.openBatterySettings() },
          { label: 'Not now', variant: 'secondary', onPress: () => setAskBattery(false) },
        ]}
      />

      <FieldDialog
        visible={confirmEnd}
        tone="danger"
        icon={ClockIcon}
        title="End your shift?"
        message="Your location will be recorded and your field day will be closed and sent to your manager."
        onClose={() => setConfirmEnd(false)}
        actions={[
          {
            label: 'End shift',
            variant: 'danger',
            loading: busy === 'end',
            onPress: async () => {
              await doEnd();
              setConfirmEnd(false);
            },
          },
          { label: 'Not yet', variant: 'secondary', onPress: () => setConfirmEnd(false) },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// My Day: shift, today's numbers, today's visits, unplanned visit
// ---------------------------------------------------------------------------

export function MyDayScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { myIdNum } = useMe();

  const loader = useCallback(async () => {
    const [day, meetings, leads, shift] = await Promise.all([
      field.myDay(myIdNum, todayStr()),
      api.meetingsToday(),
      api.listLeads().catch(() => [] as PipelineLead[]),
      field.currentShift(),
    ]);
    const names = new Map(leads.map((l) => [l.id, l.companyName]));
    // Mine only, the one in progress first, then by time.
    const mine = meetings
      .filter((m) => m.status !== 'CANCELLED')
      .sort((a, b) => Number(!!b.checkInAt && !b.checkOutAt) - Number(!!a.checkInAt && !a.checkOutAt) || a.time.localeCompare(b.time));
    return { day, meetings: mine, names, shiftActive: !!shift };
  }, [myIdNum]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your day.');
  const [needShift, setNeedShift] = useState(false);

  const onUnplanned = () => {
    if (data && !data.shiftActive) {
      setNeedShift(true);
      return;
    }
    navigation.navigate('LeadUnplannedVisit');
  };

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="My day" onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <ShiftCard onChange={reload} />
        <CrmErrorBanner message={error} onRetry={reload} />

        {loading && !data ? (
          <CrmSkeleton height={118} radius={radii.lg} />
        ) : (
          data && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <GlossyBadge color={theme.primary} size={36} icon={<PinIcon size={18} color={WHITE} />} />
                <Text style={styles.statValue}>{data.day.visitCount}</Text>
                <Text style={styles.statLabel}>Visits today</Text>
              </View>
              <View style={styles.stat}>
                <GlossyBadge color={theme.accent} size={36} icon={<PlusIcon size={18} color={WHITE} />} />
                <Text style={styles.statValue}>{data.day.unplannedVisitCount}</Text>
                <Text style={styles.statLabel}>Unplanned</Text>
              </View>
              <View style={styles.stat}>
                <GlossyBadge color={theme.success} size={36} icon={<TrendUpIcon size={18} color={WHITE} />} />
                <Text style={styles.statValue}>{data.day.gpsKm.toFixed(1)}</Text>
                <Text style={styles.statLabel}>km tracked</Text>
              </View>
            </View>
          )
        )}

        <PrimaryButton
          label="Unplanned visit"
          variant="secondary"
          icon={<GlossyBadge color={theme.accent} size={26} icon={<PlusIcon size={15} color={WHITE} />} />}
          onPress={onUnplanned}
        />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's visits</Text>
          <Text style={styles.hint}>Tap a visit to punch in / out</Text>
        </View>

        {loading && !data && [0, 1].map((i) => <CrmSkeleton key={i} height={96} radius={radii.lg} />)}
        {!!data && data.meetings.length === 0 && (
          <CrmEmptyState
            title="No visits today"
            subtitle="Meetings booked for today and unplanned visits show here."
            icon={<GlossyBadge color={theme.primary} size={56} icon={<CalendarIcon size={26} color={WHITE} />} />}
          />
        )}
        {data?.meetings.map((m) => (
          <View key={m.id}>
            {data.day.unplannedMeetingIds.has(m.id) && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Unplanned</Text>
              </View>
            )}
            <MeetingRow
              meeting={m}
              title={data.names.get(m.leadId) || m.address || 'Meeting'}
              onPress={() => navigation.navigate('LeadMeeting', { meetingId: m.id })}
            />
          </View>
        ))}

        {!!data && data.day.conversations.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Conversations</Text>
              <Text style={styles.hint}>{data.day.conversations.length} today</Text>
            </View>
            {data.day.conversations
              .slice()
              .reverse()
              .map((c) => (
                <View key={c.id} style={styles.convCard}>
                  <View style={styles.convHead}>
                    <GlossyBadge color={theme.accent} size={30} icon={<UsersIcon size={15} color={WHITE} />} />
                    <Text style={styles.convWho} numberOfLines={1}>
                      {c.personName}
                    </Text>
                    <Text style={styles.convTime}>{clock(c.createdAt)}</Text>
                  </View>
                  <Text style={styles.convNote}>{c.notes}</Text>
                </View>
              ))}
          </>
        )}
      </CrmScreen>

      <FieldDialog
        visible={needShift}
        tone="warning"
        icon={ClockIcon}
        title="Start your shift first"
        message="An unplanned visit is part of your field day. Start your shift, then record the visit."
        onClose={() => setNeedShift(false)}
        actions={[{ label: 'Got it', onPress: () => setNeedShift(false) }]}
      />
    </LeadScreen>
  );
}

// ---------------------------------------------------------------------------
// Unplanned visit: pick the client (an existing lead), punch in
// ---------------------------------------------------------------------------

export function UnplannedVisitScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const [query, setQuery] = useState('');
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(() => api.listLeads(), []);
  const { data, loading, error, reload } = useLoad(loader, 'Could not load your leads.');

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((l) => VISITABLE_STAGES.includes(l.stage))
      .filter(
        (l) =>
          !q ||
          l.companyName.toLowerCase().includes(q) ||
          l.contactPerson.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.leadNumber ?? '').toLowerCase().includes(q),
      );
  }, [data, query]);

  const punchIn = async (lead: PipelineLead, coords: Coords | null) => {
    setBusyLead(lead.id);
    setActionError(null);
    try {
      const meeting = await field.unplannedVisit(lead.id, coords);
      refreshReminders();
      // Straight to the visit, where they record the outcome and punch out.
      navigation.replace('LeadMeeting', { meetingId: meeting.id });
    } catch (err) {
      setActionError(errorMessage(err, 'Could not start the visit. Please try again.'));
    } finally {
      setBusyLead(null);
    }
  };

  // The two dialogs: confirm the punch-in, and (if GPS could not be read) what to do next.
  const [confirmLead, setConfirmLead] = useState<PipelineLead | null>(null);
  const [noGpsLead, setNoGpsLead] = useState<PipelineLead | null>(null);
  const [reading, setReading] = useState(false);

  const onPick = (lead: PipelineLead) => setConfirmLead(lead);

  const confirmPunchIn = async (lead: PipelineLead) => {
    setReading(true);
    const coords = await readCoords();
    setReading(false);
    setConfirmLead(null);
    if (coords) return punchIn(lead, coords);
    setNoGpsLead(lead);
  };

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Unplanned visit" subtitle="Which client are you at?" icon="close" onBack={() => navigation.goBack()} />
      <View style={styles.searchWrap}>
        <CrmTextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search company, contact, phone…"
          icon={<SearchIcon size={18} color={theme.textMuted} />}
          autoCorrect={false}
          returnKeyType="search"
        />
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
      </View>
      <FlatList
        data={leads}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={92} radius={radii.lg} />
          ) : error ? undefined : (
            <CrmEmptyState
              title={query ? 'No matching client' : 'No leads to visit'}
              subtitle="A new client? Add them as a lead first, then punch in."
              icon={<GlossyBadge color={theme.accent} size={56} icon={<PinIcon size={26} color={WHITE} />} />}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={busyLead === item.id ? styles.busyRow : undefined} pointerEvents={busyLead ? 'none' : 'auto'}>
            <LeadRow lead={item} onPress={() => onPick(item)} />
          </View>
        )}
      />
      {/* Not in the list: one control, two halves - a new client (add the lead) or just a conversation. */}
      <View style={styles.footer}>
        <View style={[styles.split, busyLead !== null && styles.busyRow]} pointerEvents={busyLead ? 'none' : 'auto'}>
          <Pressable
            onPress={() => navigation.navigate('LeadNew')}
            accessibilityRole="button"
            accessibilityLabel="New client - add lead"
            style={({ pressed }) => [styles.splitHalf, pressed && styles.splitPressed]}
          >
            <GlossyBadge color={theme.primary} size={34} icon={<PlusIcon size={17} color={WHITE} />} />
            <View style={styles.splitText}>
              <Text style={[styles.splitTitle, { color: theme.primary }]} numberOfLines={1}>New client</Text>
              <Text style={styles.splitSub} numberOfLines={1}>Add as a lead</Text>
            </View>
          </Pressable>
          <View style={styles.splitDivider} />
          <Pressable
            onPress={() => navigation.replace('LeadConversation')}
            accessibilityRole="button"
            accessibilityLabel="Just a conversation"
            style={({ pressed }) => [styles.splitHalf, pressed && styles.splitPressed]}
          >
            <GlossyBadge color={theme.accent} size={34} icon={<UsersIcon size={17} color={WHITE} />} />
            <View style={styles.splitText}>
              <Text style={[styles.splitTitle, { color: theme.accentText }]} numberOfLines={1}>Conversation</Text>
              <Text style={styles.splitSub} numberOfLines={1}>Not a lead</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <FieldDialog
        visible={!!confirmLead}
        tone="accent"
        icon={PinIcon}
        title="Punch in here?"
        message={`Start an unplanned visit at ${confirmLead?.companyName ?? 'this client'}. Your location will be recorded.`}
        onClose={() => setConfirmLead(null)}
        actions={[
          { label: reading ? 'Reading location...' : 'Punch in', loading: reading, onPress: () => confirmLead && confirmPunchIn(confirmLead) },
          { label: 'Cancel', variant: 'secondary', onPress: () => setConfirmLead(null) },
        ]}
      />

      <FieldDialog
        visible={!!noGpsLead}
        tone="warning"
        icon={AlertTriangleIcon}
        title="Location not available"
        message="Your location could not be read. Turn on location and try again, or punch in without it."
        onClose={() => setNoGpsLead(null)}
        actions={[
          {
            label: 'Try again',
            onPress: () => {
              const lead = noGpsLead;
              setNoGpsLead(null);
              if (lead) setConfirmLead(lead);
            },
          },
          {
            label: 'Punch in without location',
            variant: 'secondary',
            onPress: () => {
              const lead = noGpsLead;
              setNoGpsLead(null);
              if (lead) punchIn(lead, null);
            },
          },
          { label: 'Cancel', variant: 'secondary', onPress: () => setNoGpsLead(null) },
        ]}
      />
    </LeadScreen>
  );
}

// ---------------------------------------------------------------------------
// Unplanned visit -> Just a conversation: anyone (not a lead). Who + what was discussed, punch in.
// One step - no punch-out; saved against the active shift with the phone's location.
// ---------------------------------------------------------------------------

/** One-tap notes - tapping adds the phrase to "What did you discuss?" (tap again to take it out). */
const QUICK_NOTES = ['Interested in our service', 'Asked for a quotation', 'Will call back', 'Gave a reference', 'General enquiry'];

/** The phone's time now as "2:32 PM", refreshed every 30 seconds. */
function nowLabel() {
  const d = new Date();
  return fmtTime(`${d.getHours()}:${d.getMinutes()}`);
}
function useNowLabel() {
  const [now, setNow] = useState(nowLabel);
  useEffect(() => {
    const t = setInterval(() => setNow(nowLabel()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** "What did you discuss?" as its sentences (quick notes are stored as "Phrase."). */
const noteParts = (n: string) => n.split(/\.\s*/).map((x) => x.trim()).filter(Boolean);

export function ConversationScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const now = useNowLabel();
  const [personName, setPersonName] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ who?: string; notes?: string }>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noGps, setNoGps] = useState(false);

  const toggleQuick = (q: string) => {
    setNotes((n) => {
      const parts = noteParts(n);
      const next = parts.includes(q) ? parts.filter((x) => x !== q) : [...parts, q];
      return next.length ? `${next.join('. ')}.` : '';
    });
    if (errors.notes) setErrors((e) => ({ ...e, notes: undefined }));
  };

  const save = async (coords: Coords | null) => {
    setBusy(true);
    setActionError(null);
    try {
      await field.logConversation(personName.trim(), notes.trim(), coords);
      navigation.goBack();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not save the conversation. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onPunchIn = async () => {
    const next: { who?: string; notes?: string } = {};
    if (!personName.trim()) next.who = 'Enter who you met';
    if (!notes.trim()) next.notes = 'Write what you discussed, or tap a quick note';
    setErrors(next);
    if (next.who || next.notes) return;
    setBusy(true);
    const coords = await readCoords();
    setBusy(false);
    if (coords) return save(coords);
    setNoGps(true);
  };

  const parts = noteParts(notes);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Just a conversation" subtitle="Not a lead" icon="close" onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent contentStyle={styles.convBody}>
        {/* Hero: what this is, the time now, and that the location is taken on punch-in. */}
        <View style={styles.convHero}>
          <GradientFill from="#8B5CF6" to="#5B21B6" />
          <View style={[styles.bubble, styles.bubbleBig]} pointerEvents="none" />
          <View style={[styles.bubble, styles.bubbleSmall]} pointerEvents="none" />
          <View style={styles.convHeroTop}>
            <View style={styles.convHeroIcon}>
              <UsersIcon size={24} color={WHITE} />
            </View>
            <View style={styles.side}>
              <Text style={styles.convHeroTitle}>Quick conversation</Text>
              <Text style={styles.convHeroSub}>Met someone who is not a lead? Note it in seconds.</Text>
            </View>
          </View>
          <View style={styles.convChips}>
            <View style={styles.convChip}>
              <ClockIcon size={13} color={WHITE} />
              <Text style={styles.convChipText}>{now}</Text>
            </View>
          </View>
        </View>

        <CrmErrorBanner message={actionError} />

        <View style={styles.convForm}>
          <View style={styles.convStep}>
            <View style={styles.convStepNo}>
              <Text style={styles.convStepNoText}>1</Text>
            </View>
            <Text style={styles.convStepTitle}>WHO DID YOU MEET?</Text>
          </View>
          <CrmTextField
            value={personName}
            onChangeText={(v) => {
              setPersonName(v);
              if (errors.who) setErrors((e) => ({ ...e, who: undefined }));
            }}
            placeholder="Name, shop or company"
            icon={<PersonIcon size={18} color={theme.textMuted} />}
            error={errors.who}
            maxLength={150}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <View style={styles.convStep}>
            <View style={styles.convStepNo}>
              <Text style={styles.convStepNoText}>2</Text>
            </View>
            <Text style={styles.convStepTitle}>WHAT DID YOU DISCUSS?</Text>
            {notes.length > 0 && <Text style={styles.convCount}>{notes.length}/2000</Text>}
          </View>
          <Text style={styles.convQuickLabel}>Tap to add a quick note</Text>
          <View style={styles.convQuick}>
            {QUICK_NOTES.map((q) => {
              const on = parts.includes(q);
              return (
                <Pressable
                  key={q}
                  onPress={() => toggleQuick(q)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.convQuickChip, on && styles.convQuickChipOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.convQuickText, on && styles.convQuickTextOn]}>{on ? `✓ ${q}` : q}</Text>
                </Pressable>
              );
            })}
          </View>
          <CrmTextField
            value={notes}
            onChangeText={(v) => {
              setNotes(v);
              if (errors.notes) setErrors((e) => ({ ...e, notes: undefined }));
            }}
            placeholder="Or write a few words about the conversation"
            error={errors.notes}
            maxLength={2000}
            multiline
          />
        </View>
      </CrmScreen>

      <View style={styles.convFooter}>
        <PrimaryButton label="Punch in" icon={<PinIcon size={18} color={WHITE} />} loading={busy} onPress={onPunchIn} />
      </View>

      <FieldDialog
        visible={noGps}
        tone="warning"
        icon={AlertTriangleIcon}
        title="Location not available"
        message="Your location could not be read. Turn on location and try again, or save without it."
        onClose={() => setNoGps(false)}
        actions={[
          {
            label: 'Try again',
            onPress: () => {
              setNoGps(false);
              onPunchIn();
            },
          },
          {
            label: 'Save without location',
            variant: 'secondary',
            onPress: () => {
              setNoGps(false);
              save(null);
            },
          },
          { label: 'Cancel', variant: 'secondary', onPress: () => setNoGps(false) },
        ]}
      />
    </LeadScreen>
  );
}
