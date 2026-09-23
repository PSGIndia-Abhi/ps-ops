import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Line } from 'react-native-svg';
import { Banner } from '../../components/Banner';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { GradientCard } from '../../components/GradientCard';
import { AlertTriangleIcon, BriefcaseIcon, ChevronRightIcon, ClockIcon } from '../../components/icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Skeleton } from '../../components/Skeleton';
import { ApiError, shiftsApi } from '../../api';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { AuthenticatedStackParamList, TechnicianTabParamList } from '../../navigation/types';
import type { CurrentShift, TechnicianShift } from '../../types/shift';
import { formatDate, formatTime, isToday } from '../../utils/date';
import { getCurrentLocation, LocationError, LocationServicesDisabledError } from '../../utils/location';
import { formatShiftClock, formatWorked } from './shiftTime';

type Nav = NativeStackNavigationProp<AuthenticatedStackParamList & TechnicianTabParamList>;

/** A shift running longer than this was almost certainly forgotten (nobody works 14 hours straight). */
const STALE_SHIFT_MS = 14 * 60 * 60 * 1000;

const FACE = 224;
const CENTER = FACE / 2;
const TICKS = 60;

function problemMessage(err: unknown, action: 'start' | 'end'): string {
  if (err instanceof LocationServicesDisabledError) return `Turn on your phone's location (GPS) to ${action} your shift.`;
  if (err instanceof LocationError) return `We need your location to ${action} your shift. Allow location access and try again.`;
  if (err instanceof ApiError) {
    if (err.status === 403) return "Shifts aren't switched on for your account. Please ask your supervisor.";
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * The clock face: 60 ticks like a stopwatch. While on duty the ticks light up second by second and a
 * bright dot rides the leading edge, starting over every minute; off duty the face rests, dim.
 */
function ClockFace({ litSeconds, running }: { litSeconds: number; running: boolean }) {
  const tipAngle = ((-90 + (litSeconds * 360) / TICKS) * Math.PI) / 180;
  return (
    <Svg width={FACE} height={FACE}>
      {Array.from({ length: TICKS }, (_, i) => {
        const angle = ((-90 + (i * 360) / TICKS) * Math.PI) / 180;
        const major = i % 5 === 0;
        const outer = CENTER - 4;
        const inner = outer - (major ? 15 : 8);
        const lit = running && i <= litSeconds;
        return (
          <Line
            key={i}
            x1={CENTER + Math.cos(angle) * outer}
            y1={CENTER + Math.sin(angle) * outer}
            x2={CENTER + Math.cos(angle) * inner}
            y2={CENTER + Math.sin(angle) * inner}
            stroke="#FFFFFF"
            strokeOpacity={lit ? 1 : major ? 0.5 : 0.28}
            strokeWidth={major ? 3.5 : 2}
            strokeLinecap="round"
          />
        );
      })}
      {running && (
        <>
          <Circle cx={CENTER + Math.cos(tipAngle) * (CENTER - 32)} cy={CENTER + Math.sin(tipAngle) * (CENTER - 32)} r={9} fill="#FFFFFF" fillOpacity={0.25} />
          <Circle cx={CENTER + Math.cos(tipAngle) * (CENTER - 32)} cy={CENTER + Math.sin(tipAngle) * (CENTER - 32)} r={4.5} fill="#FFFFFF" />
        </>
      )}
    </Svg>
  );
}

/**
 * "My Shift": start and end the working day. The backend records the technician's location once at each
 * end (start and end), exactly like the web app's shift page - the app does not track anyone in the background.
 */
export function ShiftScreen() {
  const navigation = useNavigation<Nav>();
  const [current, setCurrent] = useState<CurrentShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ended, setEnded] = useState<TechnicianShift | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setCurrent(await shiftsApi.getCurrentShift());
    } catch (err) {
      setError(problemMessage(err, 'start'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = !!current?.active && !!current.shift;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  // A soft glow that breathes around the face while the shift is running.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
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
  }, [active, pulse]);

  async function startShift() {
    setBusy('start');
    setError(null);
    try {
      const location = await getCurrentLocation();
      const result = await shiftsApi.startShift(location.latitude, location.longitude);
      setCurrent({ active: true, shift: result.shift, activeVisit: null });
      setEnded(null);
    } catch (err) {
      setError(problemMessage(err, 'start'));
    } finally {
      setBusy(null);
    }
  }

  async function endShift() {
    setBusy('end');
    setError(null);
    try {
      const location = await getCurrentLocation();
      const result = await shiftsApi.endShift(location.latitude, location.longitude);
      setEnded(result.shift);
      setCurrent({ active: false, shift: null, activeVisit: null });
      setConfirmEnd(false);
    } catch (err) {
      setConfirmEnd(false);
      setError(problemMessage(err, 'end'));
    } finally {
      setBusy(null);
    }
  }

  const shift = current?.shift ?? null;
  const elapsed = active && shift ? Math.max(0, now - new Date(shift.started_at).getTime()) : 0;
  const litSeconds = Math.floor(elapsed / 1000) % 60;
  const stale = active && elapsed > STALE_SHIFT_MS;
  const workedMs = ended?.ended_at ? new Date(ended.ended_at).getTime() - new Date(ended.started_at).getTime() : 0;
  const visit = current?.activeVisit ?? null;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  return (
    <ScreenContainer onRefresh={() => load(true)} refreshing={refreshing} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, active && styles.headerIconLive]}>
          <ClockIcon size={30} color={active ? colors.success : colors.primary} />
        </View>
        <Text style={styles.title}>My Shift</Text>
        <Text style={styles.subtitle}>Start when you begin work, end when you are done.</Text>
      </View>

      {!!error && <Banner message={error} variant="error" />}

      {loading ? (
        <Skeleton height={340} radius={24} style={styles.gap} />
      ) : (
        <GradientCard color={active ? colors.success : colors.primary} style={styles.hero}>
          <View style={styles.blob} />
          <View style={styles.statusPill}>
            <View style={[styles.dot, active && styles.dotLive]} />
            <Text style={styles.statusText}>{active ? 'ON DUTY' : 'OFF DUTY'}</Text>
          </View>

          <View style={styles.faceWrap}>
            {active && <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
            <ClockFace litSeconds={litSeconds} running={active} />
            <View style={styles.faceCenter} pointerEvents="none">
              <ClockIcon size={22} color="rgba(255,255,255,0.85)" />
              <Text style={styles.clock} accessibilityLabel={active ? `Time on duty ${formatShiftClock(elapsed)}` : 'Not on duty'}>
                {active ? formatShiftClock(elapsed) : '--:--:--'}
              </Text>
              <Text style={styles.faceSub}>
                {active && shift
                  ? `since ${isToday(shift.started_at) ? '' : `${formatDate(shift.started_at)}, `}${formatTime(shift.started_at)}`
                  : 'ready when you are'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={active ? () => setConfirmEnd(true) : startShift}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={active ? 'End shift' : 'Start shift'}
            style={({ pressed }) => [styles.heroButton, (pressed || busy !== null) && styles.heroButtonPressed]}
            testID="shift-toggle"
          >
            <Text style={[styles.heroButtonText, { color: active ? colors.danger : colors.primary }]}>
              {busy === 'start' ? 'Starting...' : busy === 'end' ? 'Ending...' : active ? 'End shift' : 'Start shift'}
            </Text>
          </Pressable>
        </GradientCard>
      )}

      {stale && (
        <View style={styles.staleCard} accessibilityLiveRegion="polite">
          <AlertTriangleIcon size={20} color={colors.warningText} />
          <View style={styles.staleText}>
            <Text style={styles.staleTitle}>This shift has been running for {formatWorked(elapsed)}</Text>
            <Text style={styles.staleBody}>
              It looks like it was not ended. End it now, then start today's shift. Ending it records the end time as right now.
            </Text>
          </View>
        </View>
      )}

      {!!ended && !active && (
        <View style={styles.endedCard}>
          <Text style={styles.endedTitle}>Shift ended</Text>
          <Text style={styles.endedText}>You worked {formatWorked(workedMs)}. Good job today!</Text>
        </View>
      )}

      {active && !!visit && (
        <Pressable
          onPress={() => navigation.navigate('JobDetail', { jobId: visit.job_id })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.visitCard, pressed && styles.pressed]}
        >
          <View style={styles.visitIcon}>
            <BriefcaseIcon size={20} color={colors.primary} />
          </View>
          <View style={styles.visitText}>
            <Text style={styles.overline}>ON SITE NOW</Text>
            <Text style={styles.visitTitle} numberOfLines={1}>
              {visit.job_title}
            </Text>
            <Text style={styles.visitSub}>Visit {visit.visit_number} - tap to continue</Text>
          </View>
          <ChevronRightIcon size={18} color={colors.textMuted} />
        </Pressable>
      )}

      <ConfirmSheet
        visible={confirmEnd}
        title="End your shift?"
        description={
          visit
            ? 'You still have a visit in progress. Finish or pause it first if you have not, then end your shift.'
            : 'Your location will be recorded and your time on duty will stop.'
        }
        confirmLabel="End shift"
        destructive
        loading={busy === 'end'}
        onConfirm={endShift}
        onCancel={() => setConfirmEnd(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.lg },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headerIconLive: { backgroundColor: colors.successBg },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  gap: { marginBottom: spacing.md },
  hero: { padding: spacing.lg, marginBottom: spacing.md, overflow: 'hidden', alignItems: 'center' },
  blob: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotLive: { backgroundColor: '#FFFFFF' },
  statusText: { ...typography.overline, color: '#FFFFFF' },
  faceWrap: {
    width: FACE,
    height: FACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  glow: {
    position: 'absolute',
    width: FACE - 20,
    height: FACE - 20,
    borderRadius: (FACE - 20) / 2,
    borderWidth: 6,
    borderColor: '#FFFFFF',
  },
  faceCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  clock: { ...typography.display, fontSize: 34, lineHeight: 40, color: '#FFFFFF' },
  faceSub: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
  heroButton: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonPressed: { opacity: 0.85 },
  heroButtonText: { ...typography.button },
  staleCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  staleText: { flex: 1 },
  staleTitle: { ...typography.bodyMedium, color: colors.warningText },
  staleBody: { ...typography.caption, color: colors.warningText, marginTop: 2 },
  endedCard: {
    backgroundColor: colors.successBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  endedTitle: { ...typography.bodyMedium, color: colors.successText },
  endedText: { ...typography.body, color: colors.successText, marginTop: 2 },
  visitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  pressed: { opacity: 0.85 },
  visitIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitText: { flex: 1 },
  overline: { ...typography.overline, color: colors.textMuted },
  visitTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  visitSub: { ...typography.caption, color: colors.textMuted },
});
