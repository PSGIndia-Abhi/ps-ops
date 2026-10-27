import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BriefcaseIcon, CalendarIcon, ChevronRightIcon, ClockIcon, PinIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SearchIcon } from '../../crm/ui/crmIcons';
import { fmtTimestamp, todayStr } from '../../tasks/format';
import { radii, spacing, typography } from '../../theme';
import { getCurrentLocation } from '../../utils/location';
import { refreshReminders } from '../../reminders-engine/useReminders';
import * as api from '../api';
import * as field from '../fieldApi';
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

/** Stages a visit can be recorded for - the server's ACTIVE_MEETING_STAGES (crm-lead-meetings.routes.js). */
const VISITABLE_STAGES: PipelineStage[] = [
  'NEW', 'TO_CALL', 'QUALIFIED', 'NEED_MORE_INFO', 'MEETING_SCHEDULED', 'VISIT_COMPLETED', 'QUOTATION_SENT',
];

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 5,
    padding: spacing.lg,
    ...t.raisedShadow,
  },
  kicker: { ...typography.overline },
  title: { ...typography.title, color: t.textPrimary, marginTop: spacing.xxs },
  meta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 4 },
  metaText: { ...typography.body, color: t.textSecondary, flex: 1 },
  btns: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  flex1: { flex: 1 },
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    marginTop: spacing.sm,
    minHeight: 44,
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
  statValue: { ...typography.title, color: t.textPrimary },
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
  const onEnd = () =>
    Alert.alert('End your shift?', 'Your field day will be closed and sent to your manager.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'End shift', style: 'destructive', onPress: doEnd },
    ]);

  if (!loaded) return <CrmSkeleton height={150} radius={radii.xl} />;

  const active = !!shift;
  const tone = active ? theme.success : theme.primary;
  return (
    <View>
      <CrmErrorBanner message={error} onRetry={reload} />
      <CrmErrorBanner message={actionError} />
      <View style={[styles.card, { borderLeftColor: tone }]}>
        <Text style={[styles.kicker, { color: tone }]}>{active ? 'SHIFT IN PROGRESS' : 'FIELD DAY'}</Text>
        <Text style={styles.title}>{shift ? `Started at ${clock(shift.startedAt)}` : 'Shift not started'}</Text>
        <View style={styles.meta}>
          <ClockIcon size={15} color={theme.textMuted} />
          <Text style={styles.metaText}>
            {active ? 'Punch in at each client. End the shift when your day is done.' : 'Start your shift when you leave for the field.'}
          </Text>
        </View>
        <View style={styles.btns}>
          {active ? (
            <PrimaryButton label="End shift" variant="brand" onPress={onEnd} loading={busy === 'end'} disabled={busy !== null} style={styles.flex1} />
          ) : (
            <PrimaryButton
              label="Start shift"
              icon={<BriefcaseIcon size={18} color={WHITE} />}
              onPress={onStart}
              loading={busy === 'start'}
              disabled={busy !== null}
              style={styles.flex1}
            />
          )}
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

  const onUnplanned = () => {
    if (data && !data.shiftActive) {
      Alert.alert('Start your shift first', 'Start your shift so this visit is part of your field day.');
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
          <CrmSkeleton height={84} radius={radii.lg} />
        ) : (
          data && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.day.visitCount}</Text>
                <Text style={styles.statLabel}>Visits today</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.day.unplannedVisitCount}</Text>
                <Text style={styles.statLabel}>Unplanned</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{data.day.gpsKm.toFixed(1)}</Text>
                <Text style={styles.statLabel}>km tracked</Text>
              </View>
            </View>
          )
        )}

        <PrimaryButton label="Unplanned visit" variant="secondary" icon={<PlusIcon size={18} color={theme.primary} />} onPress={onUnplanned} />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's visits</Text>
          <Text style={styles.hint}>Tap a visit to punch in / out</Text>
        </View>

        {loading && !data && [0, 1].map((i) => <CrmSkeleton key={i} height={96} radius={radii.lg} />)}
        {!!data && data.meetings.length === 0 && (
          <CrmEmptyState
            title="No visits today"
            subtitle="Meetings booked for today and unplanned visits show here."
            icon={<CalendarIcon size={30} color={theme.textMuted} />}
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

  const onPick = (lead: PipelineLead) =>
    Alert.alert('Punch in here?', `Start an unplanned visit at ${lead.companyName}. Your location will be recorded.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch in',
        onPress: async () => {
          setBusyLead(lead.id);
          const coords = await readCoords();
          setBusyLead(null);
          if (coords) return punchIn(lead, coords);
          Alert.alert('Location not available', 'Your location could not be read. Turn location on and try again, or punch in without it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Punch in without location', onPress: () => punchIn(lead, null) },
          ]);
        },
      },
    ]);

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
              icon={<PinIcon size={30} color={theme.textMuted} />}
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
          icon={<PlusIcon size={18} color={theme.primary} />}
          onPress={() => navigation.navigate('LeadNew')}
          disabled={busyLead !== null}
        />
      </View>
    </LeadScreen>
  );
}
