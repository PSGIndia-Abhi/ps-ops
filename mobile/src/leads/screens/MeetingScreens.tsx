import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  DocumentIcon,
  ExternalLinkIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  UsersIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton, NoticeBanner } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { StatusBadge, type Tone } from '../../crm/ui/StatusBadge';
import { fmtTimestamp, todayStr } from '../../tasks/format';
import { DateSheet, TimeSheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { getCurrentLocation } from '../../utils/location';
import { refreshReminders } from '../../reminders-engine/useReminders';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { PlaceLine } from '../PlaceLine';
import { VISIT_OUTCOMES, visitOutcomeText, type VisitNext } from '../stage';
import type { Coords, Meeting, PipelineLead } from '../types';
import { errorMessage, MEETING_STATUS_META, MeetingRow, meetingWhen, useLoad, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  segment: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  gap: { height: spacing.sm },
  notes: { minHeight: 96, textAlignVertical: 'top' as const },

  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  cardTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.sm },

  // Who and when
  hero: { borderLeftWidth: 5, borderLeftColor: t.primary, ...t.raisedShadow },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroText: { flex: 1 },
  kind: { ...typography.overline, color: t.primary },
  company: { ...typography.title, color: t.textPrimary, marginTop: 2 },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 4 },
  metaText: { ...typography.body, color: t.textSecondary, flex: 1 },
  whenBox: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surfaceAlt,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  whenLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  whenText: { ...typography.bodyMedium, color: t.textPrimary },

  // Progress: Scheduled -> Visit started -> Visit ended
  steps: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  step: { flex: 1, alignItems: 'center' as const },
  stepLine: { position: 'absolute' as const, top: 16, left: '50%' as const, width: '100%' as const, height: 2, backgroundColor: t.border },
  stepLineDone: { backgroundColor: t.success },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surface,
    borderWidth: 2,
    borderColor: t.border,
  },
  stepDotDone: { backgroundColor: t.success, borderColor: t.success },
  stepDotNow: { backgroundColor: t.primarySoftBg, borderColor: t.primary },
  stepNum: { ...typography.captionMedium, color: t.textMuted },
  stepNumNow: { color: t.primary },
  stepLabel: { ...typography.captionMedium, color: t.textPrimary, marginTop: spacing.xs, textAlign: 'center' as const },
  stepSub: { ...typography.caption, color: t.textMuted, marginTop: 1, textAlign: 'center' as const },

  // Where
  addrRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm },
  addrIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.dangerBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addrText: { ...typography.bodyMedium, color: t.textPrimary, flex: 1, lineHeight: 22, marginTop: spacing.xs },
  addrEmpty: { color: t.textMuted },
  meetingNotes: { ...typography.body, color: t.textSecondary, lineHeight: 22, marginTop: spacing.sm },
  quickRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  quick: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  quickNav: { backgroundColor: t.primary },
  quickCall: { backgroundColor: t.success },
  quickOff: { opacity: 0.4 },
  quickPressed: { opacity: 0.85 },
  quickLabel: { ...typography.captionMedium, color: '#FFFFFF' },

  // What was recorded
  gpsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  gpsDivider: { borderTopWidth: 1, borderTopColor: t.border },
  placeRow: { paddingVertical: spacing.sm },
  gpsText: { flex: 1 },
  gpsLabel: { ...typography.caption, color: t.textMuted },
  gpsValue: { ...typography.bodyMedium, color: t.textPrimary, marginTop: 1 },
  gpsChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: t.successBg,
  },
  gpsChipOff: { backgroundColor: t.warningBg },
  gpsChipText: { ...typography.captionMedium, color: t.successText },
  gpsChipTextOff: { color: t.warningText },
  outcomeText: { ...typography.body, color: t.textSecondary, lineHeight: 22, marginTop: 1 },

  // How it went
  outcomeGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const, rowGap: spacing.sm },
  outcome: {
    width: '48.5%' as const,
    minHeight: 64,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: t.border,
    backgroundColor: t.surface,
    padding: spacing.sm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  outcomeOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  outcomeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  outcomeLabel: { ...typography.captionMedium, color: t.textPrimary, flex: 1 },
  outcomeLabelOn: { color: t.primary },

  linkBtn: { alignSelf: 'center' as const, padding: spacing.sm, marginTop: spacing.xs },
  link: { ...typography.bodyMedium, color: t.primary },
  rowButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  flex1: { flex: 1 },

  // The action for right now, always in reach
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
});

/** Reads the phone's position for a check-in / check-out; null when it cannot be had. */
async function readCoords(): Promise<Coords | null> {
  try {
    const loc = await getCurrentLocation();
    return { lat: loc.latitude, lng: loc.longitude };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// My meetings: today / upcoming
// ---------------------------------------------------------------------------

const TABS: Option<'today' | 'upcoming'>[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
];

export function MeetingsScreen() {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const [tab, setTab] = useState<'today' | 'upcoming'>('today');

  const loader = useCallback(async () => {
    const [today, upcoming, leads] = await Promise.all([
      api.meetingsToday(),
      api.meetingsUpcoming(),
      // Meetings carry only the lead's id; the list is what gives them a company name.
      api.listLeads().catch(() => [] as PipelineLead[]),
    ]);
    const names = new Map(leads.map((l) => [l.id, l.companyName]));
    return { today, upcoming, names };
  }, []);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your meetings.');

  // "Upcoming" is everything still ahead; today's own are already on the Today tab.
  const rows = !data ? [] : tab === 'today' ? data.today : data.upcoming.filter((m) => m.date !== todayStr());

  return (
    <LeadScreen edges={['top']}>
      <TopBar title="My meetings" onBack={() => navigation.goBack()} />
      <View style={styles.segment}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListHeaderComponent={<CrmErrorBanner message={error} onRetry={reload} />}
        ListEmptyComponent={
          loading ? (
            <CrmSkeleton height={110} radius={radii.lg} />
          ) : error ? undefined : (
            <CrmEmptyState
              title={tab === 'today' ? 'No meetings today' : 'No upcoming meetings'}
              subtitle="Meetings scheduled for you will appear here."
              icon={<CalendarIcon size={30} color={theme.textMuted} />}
            />
          )
        }
        renderItem={({ item }) => (
          <MeetingRow
            meeting={item}
            title={data?.names.get(item.leadId) || item.address || 'Meeting'}
            onPress={() => navigation.navigate('LeadMeeting', { meetingId: item.id })}
          />
        )}
      />
    </LeadScreen>
  );
}

// ---------------------------------------------------------------------------
// One meeting: start the visit, record how it went, reschedule, cancel
// ---------------------------------------------------------------------------

/** How each visit outcome reads on its card. */
const OUTCOME_LOOK: Record<string, { tone: Tone; icon: (c: string) => React.ReactNode }> = {
  quotation: { tone: 'info', icon: (c) => <DocumentIcon size={18} color={c} /> },
  interested: { tone: 'success', icon: (c) => <CheckCircleIcon size={18} color={c} /> },
  not_interested: { tone: 'danger', icon: (c) => <CloseIcon size={18} color={c} /> },
  follow_up: { tone: 'warning', icon: (c) => <ClockIcon size={18} color={c} /> },
  close: { tone: 'success', icon: (c) => <UsersIcon size={18} color={c} /> },
  cancel: { tone: 'danger', icon: (c) => <AlertTriangleIcon size={18} color={c} /> },
};

function toneColors(t: CrmTheme, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'success':
      return { fg: t.success, bg: t.successBg };
    case 'warning':
      return { fg: t.warning, bg: t.warningBg };
    case 'danger':
      return { fg: t.danger, bg: t.dangerBg };
    case 'accent':
      return { fg: t.accent, bg: t.accentBg };
    default:
      return { fg: t.primary, bg: t.primarySoftBg };
  }
}

/** "2026-10-13 11:34:00" -> its time of day, for the progress steps. */
function clock(at: string): string {
  return fmtTimestamp(at.replace(' ', 'T')).split(', ').pop() ?? at;
}

/** Google Maps for a point or a place; opens the Maps app when it is installed. */
const mapsDirections = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

export function MeetingScreen() {
  const navigation = useNavigation<Nav>();
  const { meetingId } = useRoute<RouteProp<LeadStackParamList, 'LeadMeeting'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { myId, persona } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcomeKey, setOutcomeKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  // Before the visit starts, the outcome form opens only on request ("Could not visit?").
  const [endingEarly, setEndingEarly] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [newDate, setNewDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);

  const loader = useCallback(async () => {
    const meeting = await api.getMeeting(meetingId);
    const lead = await api.getLead(meeting.leadId).catch(() => null);
    return { meeting, lead };
  }, [meetingId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load this meeting.');

  /** Resolves true when the change was saved. */
  const run = async (key: string, work: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(key);
    setActionError(null);
    try {
      await work();
      setNotice(done);
      reload();
      // Started / ended / moved / cancelled: the meeting's alarm moves or goes with it.
      refreshReminders();
      return true;
    } catch (err) {
      setActionError(errorMessage(err, 'That did not go through. Please try again.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onCheckIn = async () => {
    setBusy('checkin');
    const coords = await readCoords();
    setBusy(null);
    if (coords) return run('checkin', () => api.checkIn(meetingId, coords), 'Visit started - your location is recorded.');
    // Location is wanted for the visit record, but a phone with location off must not block the visit.
    Alert.alert('Location not available', 'Your location could not be read. You can turn location on and try again, or start the visit without it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start without location', onPress: () => run('checkin', () => api.checkIn(meetingId, null), 'Visit started without location.') },
    ]);
  };

  /** Opens the form that follows from the chosen outcome, so the sales person is not left to find it. */
  const goNext = (next: VisitNext, lead: PipelineLead | null) => {
    if (!next || !lead) return;
    const base = { leadId: lead.id, name: lead.companyName };
    if (next === 'quote') navigation.navigate('LeadQuote', { ...base, amount: lead.amount });
    if (next === 'followUp') navigation.navigate('LeadFollowUp', base);
    if (next === 'convert') navigation.navigate('LeadConvert', base);
    if (next === 'lost') navigation.navigate('LeadClose', { ...base, mode: 'lost' });
  };

  const onComplete = async () => {
    const picked = VISIT_OUTCOMES.find((o) => o.key === outcomeKey);
    if (!picked) return setActionError('Choose how the visit went.');
    const currentLead = data?.lead ?? null;
    const saved = await run(
      'complete',
      async () => {
        const coords = await readCoords();
        await api.completeMeeting(meetingId, visitOutcomeText(picked.label, outcome), coords);
      },
      'Visit completed.',
    );
    if (saved) goNext(picked.next, currentLead);
  };

  const openUrl = (url: string) => Linking.openURL(url).catch(() => setActionError('No app on this phone can open that.'));

  const onCancel = () => {
    const reason = cancelReason.trim();
    if (!reason) return setActionError('Give a reason for cancelling.');
    run('cancel', () => api.cancelMeeting(meetingId, reason), 'Meeting cancelled.').then((saved) => saved && setCancelling(false));
  };

  const meeting: Meeting | undefined = data?.meeting;
  const lead = data?.lead ?? null;
  const mine = !!meeting && meeting.salesEmployeeId === myId;
  const open = meeting?.status === 'SCHEDULED';
  const checkedIn = !!meeting?.checkInAt;
  const ended = !!meeting?.checkOutAt || meeting?.status === 'COMPLETED';
  // The server lets the assigned sales person run the visit; anyone managing the lead may move or cancel it.
  const canArrange = open && !checkedIn && (mine || persona === 'sales_manager' || persona === 'telecaller');
  const statusMeta = meeting ? (open && checkedIn ? { label: 'In progress', tone: 'warning' as const } : MEETING_STATUS_META[meeting.status]) : null;
  const runsVisit = open && mine;
  const showOutcome = runsVisit && (checkedIn || endingEarly);
  const office = meeting?.type === 'OFFICE';
  const address = meeting?.address || lead?.address || '';
  const phone = lead?.phone || '';

  const doneFlags = [true, checkedIn, ended];
  const firstOpen = doneFlags.indexOf(false);
  const stepState = (i: number): 'done' | 'now' | 'todo' => (doneFlags[i] ? 'done' : i === firstOpen && open ? 'now' : 'todo');
  const steps = [
    { label: 'Scheduled', sub: meeting ? meetingWhen(meeting) : '' },
    { label: 'Visit started', sub: meeting?.checkInAt ? clock(meeting.checkInAt) : 'Not yet' },
    { label: 'Visit ended', sub: meeting?.checkOutAt ? clock(meeting.checkOutAt) : 'Not yet' },
  ];

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={office ? 'Office meeting' : 'Site visit'} subtitle={lead?.companyName} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
        <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />

        {loading && !meeting && (
          <>
            <CrmSkeleton height={170} radius={radii.xl} />
            <View style={styles.gap} />
            <CrmSkeleton height={110} radius={radii.xl} />
          </>
        )}

        {meeting && (
          <>
            {/* Who and when */}
            <View style={[styles.card, styles.hero]}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  {office ? <UsersIcon size={26} color={theme.primary} /> : <PinIcon size={26} color={theme.primary} />}
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.kind}>{office ? 'OFFICE MEETING' : 'SITE VISIT'}</Text>
                  <Text style={styles.company} numberOfLines={2}>
                    {lead?.companyName || 'Meeting'}
                  </Text>
                  {!!lead?.contactPerson && (
                    <View style={styles.metaRow}>
                      <PersonIcon size={15} color={theme.textMuted} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {lead.contactPerson}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.whenBox}>
                <View style={styles.whenLeft}>
                  <CalendarIcon size={17} color={theme.primary} />
                  <Text style={styles.whenText}>{meetingWhen(meeting)}</Text>
                </View>
                {statusMeta && <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
              </View>
            </View>

            {/* Progress */}
            {meeting.status !== 'CANCELLED' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>VISIT PROGRESS</Text>
                <View style={styles.steps}>
                  {steps.map((st, i) => {
                    const state = stepState(i);
                    return (
                      <View key={st.label} style={styles.step}>
                        {i < steps.length - 1 && <View style={[styles.stepLine, stepState(i + 1) === 'done' && styles.stepLineDone]} />}
                        <View style={[styles.stepDot, state === 'done' && styles.stepDotDone, state === 'now' && styles.stepDotNow]}>
                          {state === 'done' ? (
                            <CheckCircleIcon size={18} color={theme.textOnPrimary} />
                          ) : (
                            <Text style={[styles.stepNum, state === 'now' && styles.stepNumNow]}>{i + 1}</Text>
                          )}
                        </View>
                        <Text style={styles.stepLabel}>{st.label}</Text>
                        <Text style={styles.stepSub} numberOfLines={1}>
                          {st.sub}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Where - with directions and a call button */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>LOCATION</Text>
              <View style={styles.addrRow}>
                <View style={styles.addrIcon}>
                  <PinIcon size={20} color={theme.danger} />
                </View>
                <Text style={[styles.addrText, !address && styles.addrEmpty]}>{address || 'No address on this meeting'}</Text>
              </View>
              {!!meeting.notes && <Text style={styles.meetingNotes}>{meeting.notes}</Text>}
              <View style={styles.quickRow}>
                <Pressable
                  onPress={() => openUrl(mapsDirections(address))}
                  disabled={!address}
                  accessibilityRole="button"
                  accessibilityLabel="Get directions in Maps"
                  style={({ pressed }) => [styles.quick, styles.quickNav, !address && styles.quickOff, pressed && styles.quickPressed]}
                >
                  <ExternalLinkIcon size={17} color="#FFFFFF" />
                  <Text style={styles.quickLabel}>Directions</Text>
                </Pressable>
                <Pressable
                  onPress={() => openUrl(`tel:${phone}`)}
                  disabled={!phone}
                  accessibilityRole="button"
                  accessibilityLabel={lead?.contactPerson ? `Call ${lead.contactPerson}` : 'Call'}
                  style={({ pressed }) => [styles.quick, styles.quickCall, !phone && styles.quickOff, pressed && styles.quickPressed]}
                >
                  <PhoneIcon size={17} color="#FFFFFF" />
                  <Text style={styles.quickLabel}>Call</Text>
                </Pressable>
              </View>
            </View>

            {/* What was recorded */}
            {(checkedIn || ended) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>VISIT RECORD</Text>
                {!!meeting.checkInAt && (
                  <View style={styles.placeRow}>
                    <PlaceLine label="Visit started" time={fmtTimestamp(meeting.checkInAt.replace(' ', 'T'))} coords={meeting.checkInCoords} tone={toneColors(theme, 'success')} />
                  </View>
                )}
                {!!meeting.checkOutAt && (
                  <View style={[styles.placeRow, !!meeting.checkInAt && styles.gpsDivider]}>
                    <PlaceLine label="Visit ended" time={fmtTimestamp(meeting.checkOutAt.replace(' ', 'T'))} coords={meeting.checkOutCoords} tone={toneColors(theme, 'info')} />
                  </View>
                )}
                {!!meeting.outcomeNotes && (
                  <View style={[styles.gpsRow, styles.gpsDivider]}>
                    <View style={styles.gpsText}>
                      <Text style={styles.gpsLabel}>Outcome</Text>
                      <Text style={styles.outcomeText}>{meeting.outcomeNotes}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* How it went */}
            {showOutcome && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{checkedIn ? 'HOW DID THE VISIT GO?' : 'COULD NOT VISIT - RECORD THE OUTCOME'}</Text>
                <View style={styles.outcomeGrid}>
                  {VISIT_OUTCOMES.map((o) => {
                    const on = outcomeKey === o.key;
                    const look = OUTCOME_LOOK[o.key] ?? OUTCOME_LOOK.interested;
                    const c = toneColors(theme, look.tone);
                    return (
                      <Pressable
                        key={o.key}
                        onPress={() => setOutcomeKey(o.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.outcome, on && styles.outcomeOn]}
                      >
                        <View style={[styles.outcomeIcon, { backgroundColor: c.bg }]}>{look.icon(c.fg)}</View>
                        <Text style={[styles.outcomeLabel, on && styles.outcomeLabelOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.gap} />
                <CrmTextField
                  label="Notes"
                  value={outcome}
                  onChangeText={setOutcome}
                  placeholder="Site visited, requirement confirmed..."
                  multiline
                  maxLength={2000}
                  style={styles.notes}
                />
              </View>
            )}

            {canArrange && !cancelling && !endingEarly && (
              <View style={styles.rowButtons}>
                <PrimaryButton label="Reschedule" variant="secondary" onPress={() => setSheet('date')} loading={busy === 'reschedule'} disabled={busy !== null} style={styles.flex1} />
                <PrimaryButton label="Cancel meeting" variant="secondary" onPress={() => setCancelling(true)} disabled={busy !== null} style={styles.flex1} />
              </View>
            )}

            {canArrange && cancelling && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>CANCEL THIS MEETING</Text>
                <CrmTextField label="Reason for cancelling" value={cancelReason} onChangeText={setCancelReason} placeholder="e.g. Customer unavailable" maxLength={500} />
                <View style={styles.rowButtons}>
                  <PrimaryButton label="Keep meeting" variant="secondary" onPress={() => setCancelling(false)} disabled={busy !== null} style={styles.flex1} />
                  <PrimaryButton label="Confirm cancel" variant="brand" onPress={onCancel} loading={busy === 'cancel'} disabled={busy !== null} style={styles.flex1} />
                </View>
              </View>
            )}

            {runsVisit && !checkedIn && !endingEarly && !cancelling && (
              <Pressable onPress={() => setEndingEarly(true)} style={styles.linkBtn} accessibilityRole="button">
                <Text style={styles.link}>Could not visit? Record the outcome</Text>
              </Pressable>
            )}

            {!!lead && !runsVisit && (
              <>
                <View style={styles.gap} />
                <PrimaryButton
                  label={meeting.status === 'COMPLETED' ? 'Open lead' : 'Open lead'}
                  variant={meeting.status === 'COMPLETED' ? 'primary' : 'secondary'}
                  onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}
                />
              </>
            )}
          </>
        )}

        <DateSheet
          visible={sheet === 'date'}
          onClose={() => setSheet(null)}
          value={meeting?.date ?? null}
          minDate={todayStr()}
          title="New meeting date"
          onPick={(d) => {
            setNewDate(d);
            setSheet('time');
          }}
        />
        <TimeSheet
          visible={sheet === 'time'}
          onClose={() => setSheet(null)}
          value={meeting ? meeting.time.slice(0, 5) : null}
          allowNone={false}
          onPick={(t) => {
            setSheet(null);
            if (newDate && t) run('reschedule', () => api.rescheduleMeeting(meetingId, newDate, t), 'Meeting rescheduled.');
          }}
        />
      </CrmScreen>

      {/* The one thing to do now, always in reach. */}
      {meeting && runsVisit && !cancelling && (
        <View style={styles.footer}>
          {checkedIn ? (
            <PrimaryButton label="End visit" variant="brand" onPress={onComplete} loading={busy === 'complete'} disabled={busy !== null} />
          ) : endingEarly ? (
            <View style={styles.rowButtons}>
              <PrimaryButton label="Back" variant="secondary" onPress={() => setEndingEarly(false)} disabled={busy !== null} style={styles.flex1} />
              <PrimaryButton label="Save outcome" variant="brand" onPress={onComplete} loading={busy === 'complete'} disabled={busy !== null} style={styles.flex1} />
            </View>
          ) : (
            <PrimaryButton
              label="Start visit"
              icon={<PinIcon size={18} color={theme.textOnPrimary} />}
              onPress={onCheckIn}
              loading={busy === 'checkin'}
              disabled={busy !== null}
            />
          )}
        </View>
      )}
    </LeadScreen>
  );
}
