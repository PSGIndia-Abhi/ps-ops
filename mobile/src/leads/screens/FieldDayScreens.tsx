import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GlossyBadge } from '../../components/GlossyBadge';
import { AlertTriangleIcon, CalendarIcon, ChevronRightIcon, ClockIcon, PinIcon, PlusIcon } from '../../components/icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { formatShiftClock } from '../../screens/technician/shiftTime';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon, TrendUpIcon } from '../../crm/ui/crmIcons';
import { fmtTimestamp, todayStr } from '../../tasks/format';
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
import { errorMessage, LeadRow, MeetingRow, useLoad, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

/**
 * Sales Executive field day: Start Shift (from wherever they are - petrol is always counted from
 * the registered home, on the manager's side), punch in / out at clients, unplanned visits, End
 * Shift. The manager reviews the day on the web (Lead Management -> Field Tracking).
 */

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const WHITE = '#FFFFFF';

/** The small stopwatch dial on the Field Day card. */
const DIAL = 112;
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
  // Shift card: the app's white home card (as the visit card below it) with the technician's
  // stopwatch idea as a small dial - on the left, status / time / button on the right.
  hero: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    ...t.raisedShadow,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  faceWrap: { width: DIAL, height: DIAL, alignItems: 'center' as const, justifyContent: 'center' as const },
  glow: {
    position: 'absolute' as const,
    width: DIAL - 10,
    height: DIAL - 10,
    borderRadius: (DIAL - 10) / 2,
    borderWidth: 4,
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
  clockText: { ...typography.bodyMedium, fontSize: 17, lineHeight: 21, fontWeight: '700' as const, color: t.textPrimary },
  faceSub: { ...typography.caption, fontSize: 10, lineHeight: 13, color: t.textMuted },
  side: { flex: 1, gap: 6 },
  statusPill: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.overline },
  sideTitle: { ...typography.bodyMedium, color: t.textPrimary },
  sideSub: { ...typography.caption, color: t.textMuted, marginTop: -4 },
  heroButton: {
    minHeight: 42,
    borderRadius: radii.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 2,
  },
  heroButtonText: { ...typography.button },
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
    minHeight: 40,
  },
  linkText: { ...typography.bodyMedium, color: t.primary },
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

/**
 * Start / End Shift. Shown at the top of the sales executive's Home and on My Day.
 * `onChange` lets the host refresh its own numbers after a start or end.
 */
export function ShiftCard({ showMyDayLink = false, onChange }: { showMyDayLink?: boolean; onChange?: () => void }) {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
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

  if (!loaded) return <CrmSkeleton height={showMyDayLink ? 196 : 146} radius={radii.xl} />;

  // started_at is the server's wall-clock time, read as local time on the phone.
  const elapsed = shift ? Math.max(0, now - new Date(shift.startedAt.replace(' ', 'T')).getTime()) : 0;
  const litSeconds = Math.floor(elapsed / 1000) % 60;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.3] });
  const tone = active ? theme.success : theme.primary;
  const soft = active ? theme.successBg : theme.primarySoftBg;

  return (
    <View>
      <CrmErrorBanner message={error} onRetry={reload} />
      <CrmErrorBanner message={actionError} />
      <View style={styles.hero}>
        <View style={styles.row}>
          <View style={styles.faceWrap}>
            {active && <Animated.View style={[styles.glow, { borderColor: tone, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
            <ShiftDial litSeconds={litSeconds} running={active} color={tone} rest={theme.border} />
            <View style={styles.faceCenter} pointerEvents="none">
              <Text style={styles.clockText} accessibilityLabel={shift ? `Time on duty ${formatShiftClock(elapsed)}` : 'Not on duty'}>
                {shift ? formatShiftClock(elapsed) : '--:--'}
              </Text>
              <Text style={styles.faceSub}>{shift ? 'on duty' : 'off duty'}</Text>
            </View>
          </View>

          <View style={styles.side}>
            <View style={[styles.statusPill, { backgroundColor: soft }]}>
              <View style={[styles.dot, { backgroundColor: tone }]} />
              <Text style={[styles.statusText, { color: tone }]}>{active ? 'ON DUTY' : 'OFF DUTY'}</Text>
            </View>
            <Text style={styles.sideTitle} numberOfLines={1}>
              {shift ? `Since ${clock(shift.startedAt)}` : 'Shift not started'}
            </Text>
            {/* <Text style={styles.sideSub} numberOfLines={1}>
              {active ? 'Your location is being recorded' : 'Start when you leave for the field'}
            </Text> */}
            <Pressable
              onPress={active ? () => setConfirmEnd(true) : onStart}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={active ? 'End shift' : 'Start shift'}
              style={({ pressed }) => [
                styles.heroButton,
                { backgroundColor: active ? theme.dangerBg : theme.primary },
                (pressed || busy !== null) && styles.pressed,
              ]}
            >
              <Text style={[styles.heroButtonText, { color: active ? theme.danger : theme.textOnPrimary }]}>
                {busy === 'start' ? 'Starting...' : busy === 'end' ? 'Ending...' : active ? 'End shift' : 'Start shift'}
              </Text>
            </Pressable>
          </View>
        </View>

        {showMyDayLink && (
          <Pressable
            onPress={() => navigation.navigate('LeadMyDay')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>My day · visits & unplanned visit</Text>
            <ChevronRightIcon size={16} color={theme.primary} />
          </Pressable>
        )}
      </View>

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
      <View style={styles.footer}>
        <PrimaryButton
          label="New client - add lead"
          variant="secondary"
          icon={<GlossyBadge color={theme.primary} size={26} icon={<PlusIcon size={15} color={WHITE} />} />}
          onPress={() => navigation.navigate('LeadNew')}
          disabled={busyLead !== null}
        />
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
