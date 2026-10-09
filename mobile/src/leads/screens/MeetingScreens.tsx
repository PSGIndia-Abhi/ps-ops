import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, PinIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton, NoticeBanner, SectionLabel } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { TopBar } from '../../crm/ui/TopBar';
import { fmtTimestamp, todayStr } from '../../tasks/format';
import { DateSheet, TimeSheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { getCurrentLocation } from '../../utils/location';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { VISIT_OUTCOMES, visitOutcomeText, type VisitNext } from '../stage';
import type { Coords, Meeting, PipelineLead } from '../types';
import { Card, errorMessage, InfoLine, MEETING_STATUS_META, MeetingRow, meetingWhen, RadioRow, useLoad, useMe } from '../ui';

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  segment: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  headText: { flex: 1 },
  company: { ...typography.subtitle, color: t.textPrimary },
  when: { ...typography.bodyMedium, color: t.textSecondary, marginTop: 4 },
  help: { ...typography.caption, color: t.textMuted, marginBottom: spacing.sm },
  gap: { height: spacing.sm },
  notes: { minHeight: 96, textAlignVertical: 'top' as const },
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
    <CrmScreen scroll={false} edges={['top']}>
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
    </CrmScreen>
  );
}

// ---------------------------------------------------------------------------
// One meeting: check in, complete with an outcome, reschedule, cancel
// ---------------------------------------------------------------------------

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
    if (coords) return run('checkin', () => api.checkIn(meetingId, coords), 'Visit started.');
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
    if (!picked) return setActionError('Choose the visit outcome.');
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

  const openMap = (c: Coords) => Linking.openURL(`geo:${c.lat},${c.lng}?q=${c.lat},${c.lng}`).catch(() => {});
  const coordText = (c: Coords) => `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;

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
  // The server lets the assigned sales person run the visit; anyone managing the lead may move or cancel it.
  const canArrange = open && !checkedIn && (mine || persona === 'sales_manager' || persona === 'telecaller');
  const statusMeta = meeting ? (open && checkedIn ? { label: 'In progress', tone: 'warning' as const } : MEETING_STATUS_META[meeting.status]) : null;

  return (
    <CrmScreen scroll={false} edges={['top', 'bottom']}>
      <TopBar title={meeting?.type === 'OFFICE' ? 'Office meeting' : 'Site visit'} subtitle={lead?.companyName} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
        <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />

        {loading && !meeting && <CrmSkeleton height={180} radius={radii.lg} />}

        {meeting && (
          <>
            <Card>
              <View style={styles.headRow}>
                <View style={styles.headText}>
                  <Text style={styles.company} numberOfLines={2}>
                    {lead?.companyName || 'Meeting'}
                  </Text>
                  <Text style={styles.when}>{meetingWhen(meeting)}</Text>
                </View>
                {statusMeta && <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
              </View>
            </Card>

            <Card>
              {!!lead && <InfoLine label="Contact" value={lead.contactPerson} />}
              {!!lead && <InfoLine label="Phone" value={lead.phone} onPress={() => Linking.openURL(`tel:${lead.phone}`).catch(() => {})} />}
              <InfoLine
                label="Address"
                value={meeting.address}
                onPress={meeting.address ? () => Linking.openURL(`geo:0,0?q=${encodeURIComponent(meeting.address)}`).catch(() => {}) : undefined}
              />
              {!!meeting.notes && <InfoLine label="Notes" value={meeting.notes} />}
              {!!meeting.checkInAt && <InfoLine label="Visit started" value={fmtTimestamp(meeting.checkInAt.replace(' ', 'T'))} />}
              {!!meeting.checkInCoords && (
                <InfoLine label="Start location" value={coordText(meeting.checkInCoords)} onPress={() => openMap(meeting.checkInCoords as Coords)} />
              )}
              {!!meeting.checkOutAt && <InfoLine label="Visit ended" value={fmtTimestamp(meeting.checkOutAt.replace(' ', 'T'))} />}
              {!!meeting.checkOutCoords && (
                <InfoLine label="End location" value={coordText(meeting.checkOutCoords)} onPress={() => openMap(meeting.checkOutCoords as Coords)} />
              )}
              {!!meeting.outcomeNotes && <InfoLine label="Outcome" value={meeting.outcomeNotes} />}
            </Card>

            {open && mine && !checkedIn && (
              <>
                <Text style={styles.help}>Start the visit when you reach the customer. Your location is recorded only when you start and end the visit.</Text>
                <PrimaryButton label="Start visit" icon={<PinIcon size={18} color={theme.textOnPrimary} />} onPress={onCheckIn} loading={busy === 'checkin'} disabled={busy !== null} />
                <View style={styles.gap} />
              </>
            )}

            {open && mine && (
              <>
                <SectionLabel>{checkedIn ? 'VISIT OUTCOME' : 'OR END WITHOUT STARTING'}</SectionLabel>
                <Card>
                  {VISIT_OUTCOMES.map((o) => (
                    <RadioRow key={o.key} label={o.label} selected={outcomeKey === o.key} onPress={() => setOutcomeKey(o.key)} />
                  ))}
                </Card>
                <CrmTextField
                  label="Notes"
                  value={outcome}
                  onChangeText={setOutcome}
                  placeholder="Site visited, requirement confirmed…"
                  multiline
                  maxLength={2000}
                  style={styles.notes}
                />
                <PrimaryButton label="End visit" variant={checkedIn ? 'brand' : 'secondary'} onPress={onComplete} loading={busy === 'complete'} disabled={busy !== null} />
                <View style={styles.gap} />
              </>
            )}

            {canArrange && !cancelling && (
              <>
                <PrimaryButton label="Reschedule" variant="secondary" onPress={() => setSheet('date')} loading={busy === 'reschedule'} disabled={busy !== null} />
                <View style={styles.gap} />
                <PrimaryButton label="Cancel meeting" variant="secondary" onPress={() => setCancelling(true)} disabled={busy !== null} />
              </>
            )}

            {canArrange && cancelling && (
              <>
                <CrmTextField label="Reason for cancelling" value={cancelReason} onChangeText={setCancelReason} placeholder="e.g. Customer unavailable" maxLength={500} />
                <PrimaryButton label="Confirm cancel" variant="brand" onPress={onCancel} loading={busy === 'cancel'} disabled={busy !== null} />
                <View style={styles.gap} />
                <PrimaryButton label="Keep meeting" variant="secondary" onPress={() => setCancelling(false)} disabled={busy !== null} />
              </>
            )}

            {!!lead && (
              <>
                <View style={styles.gap} />
                <PrimaryButton
                  label={meeting.status === 'COMPLETED' ? 'Open lead - next step' : 'Open lead'}
                  variant={meeting.status === 'COMPLETED' ? 'primary' : 'secondary'}
                  onPress={() => navigation.navigate('LeadWork', { leadId: lead.id })}
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
    </CrmScreen>
  );
}
