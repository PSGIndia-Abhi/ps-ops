import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
import { GlossyBadge } from '../../components/GlossyBadge';
import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  EmailIcon,
  PersonIcon,
  PhoneIcon,
  PinIcon,
  TagIcon,
  UsersIcon,
} from '../../components/icons';
import { IconTile } from '../../crm/ui/IconTile';
import { RupeeIcon } from '../../crm/ui/crmIcons';
import { formatINR } from '../../crm/format';
import { useLeads } from '../../crm/LeadsContext';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { SelectField } from '../../crm/ui/SelectField';
import { toneColors } from '../../crm/ui/StatusBadge';
import { addDays, fmtDateShort, fmtTime, initials, todayStr } from '../../tasks/format';
import { DateSheet, PeopleSheet, TimeSheet } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import { openFollowUpsFor } from '../../reminders-engine/personal';
import { getCurrentLocation } from '../../utils/location';
import { reverseGeocode } from '../../utils/reverseGeocode';
import { refreshReminders } from '../../reminders-engine/useReminders';
import type { WorkTask } from '../../tasks/types';
import { ClashNotice, confirmClash, loadAllReminderItems, useClashes } from './RemindersScreens';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import { SOURCE_LABELS } from '../stage';
import type { CallOutcome, LocalFile, MeetingType, NamedOption, Person, PipelineLead, Qualification } from '../types';
import { Card, errorMessage, FieldLabel, FieldRow, InfoLine, LeadHeader, personTone, PickField, RadioRow, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

/**
 * The small forms that act on one lead: log a call, schedule a meeting or a
 * follow-up, close it, convert it, send provider feedback. Each saves, then
 * goes back to the lead - which reloads on focus and shows the result.
 */

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { ...typography.overline, color: t.textMuted, marginBottom: spacing.xs },
  help: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md },
  // Assign lead: people to choose from
  nowChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 6,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  nowChipText: { ...typography.captionMedium, color: t.primary },
  pickSection: { marginTop: spacing.md },
  pick: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: t.surface,
    borderWidth: 1.5,
    borderColor: t.border,
  },
  pickOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  pickPressed: { opacity: 0.8 },
  pickAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
  pickInitials: { ...typography.bodyMedium, fontWeight: '700' as const },
  pickBody: { flex: 1 },
  pickName: { ...typography.bodyMedium, color: t.textPrimary },
  pickTags: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 2 },
  pickRole: { ...typography.caption, color: t.textMuted },
  pickNow: { backgroundColor: t.successBg, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  pickNowText: { ...typography.overline, fontSize: 10, color: t.successText },
  pickRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.border },
  switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48 },
  switchLabel: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  gap: { height: spacing.md },
  notes: { minHeight: 96, textAlignVertical: 'top' as const },
  busyCard: { alignItems: 'center' as const, paddingVertical: spacing.lg },
  busyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.accentBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.md,
  },
  busyTitle: { ...typography.subtitle, color: t.textPrimary, textAlign: 'center' as const },
  busyWhen: { ...typography.bodyMedium, color: t.textPrimary, textAlign: 'center' as const, marginTop: spacing.sm },
  busyMeta: { ...typography.body, color: t.textSecondary, textAlign: 'center' as const, marginTop: 2 },
  busyHelp: { ...typography.caption, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.md, lineHeight: 18 },
  // Clear / Refresh under an address read from GPS
  addrActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: spacing.sm, marginTop: -spacing.xs, marginBottom: spacing.md },
  addrBtn: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  addrBtnOff: { opacity: 0.4 },
  addrBtnText: { ...typography.captionMedium, color: t.primary },
  reviewCard: { marginBottom: spacing.md },
  // "Set a reminder" (ReminderField)
  reminderBox: { marginTop: spacing.sm, marginBottom: spacing.sm },
  reminderText: { flex: 1, paddingRight: spacing.sm },
  reminderHint: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  // An open follow-up on the Follow-ups screen
  fuCard: { marginBottom: spacing.sm },
  fuRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  fuIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
  fuBody: { flex: 1, gap: 2 },
  fuWhen: { ...typography.bodyMedium, color: t.textPrimary },
  fuMeta: { ...typography.caption, color: t.textMuted },
  fuChange: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  fuChangeText: { ...typography.captionMedium, color: t.primary },
});

function FormShell({
  title,
  subtitle,
  error,
  submitLabel,
  onSubmit,
  saving,
  danger,
  children,
}: {
  title: string;
  subtitle: string;
  error: string | null;
  submitLabel: string;
  onSubmit: () => void;
  saving: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const navigation = useNavigation<Nav>();
  const { styles } = useCrmStyles(factory);
  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={title} subtitle={subtitle} onBack={() => navigation.goBack()} icon="close" />
      <CrmScreen edges={[]} transparent contentStyle={styles.body}>
        <CrmErrorBanner message={error} />
        {children}
        <View style={styles.gap} />
        <PrimaryButton label={submitLabel} onPress={onSubmit} loading={saving} variant={danger ? 'brand' : 'primary'} />
      </CrmScreen>
    </LeadScreen>
  );
}

/** Runs a save, shows its error in the form, and goes back to the lead on success. */
function useSubmit() {
  const navigation = useNavigation<Nav>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** `then` replaces the usual "back to the lead" (e.g. open the meeting just scheduled). */
  const submit = async (work: () => Promise<void>, then?: () => void) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await work();
      // A meeting / follow-up set, or a lead closed: re-arm its reminders now.
      refreshReminders();
      if (then) then();
      else navigation.goBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not save. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, submit };
}

function NotesField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const { styles } = useCrmStyles(factory);
  return (
    <CrmTextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline
      maxLength={2000}
      style={styles.notes}
    />
  );
}

/**
 * "Set a reminder" on a meeting / follow-up / next call: off by default - nothing rings unless it
 * is turned on. On, the phone rings once, only at the date and time picked here.
 */
type ReminderChoice = { on: boolean; date: string; time: string | null };
const reminderOff = (date: string): ReminderChoice => ({ on: false, date, time: '09:00' });

/** Why the reminder cannot be saved, or null. */
function reminderProblem(r: ReminderChoice): string | null {
  if (!r.on) return null;
  if (!r.time) return 'Pick the reminder time.';
  if (new Date(`${r.date}T${r.time}:00`).getTime() <= Date.now()) {
    return `The reminder time ${r.date === todayStr() ? 'today' : fmtDateShort(r.date)}, ${fmtTime(r.time)} has already passed. Pick a later time.`;
  }
  return null;
}
const reminderOf = (r: ReminderChoice): api.LeadReminder | null => (r.on && r.time ? { date: r.date, time: r.time } : null);

/**
 * Where a reminder starts when it is turned on: an hour before the meeting / follow-up - or, when
 * that is already past, the next full hour from now.
 */
function suggestReminder(date: string, time: string | null): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const at = new Date(`${date}T${time || '10:00'}:00`);
  at.setHours(at.getHours() - 1);
  if (at.getTime() <= Date.now()) {
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return { date: ymd(next), time: `${pad(next.getHours())}:00` };
  }
  return { date: ymd(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}

function ReminderField({
  value,
  onChange,
  forDate,
  forTime,
}: {
  value: ReminderChoice;
  onChange: (next: ReminderChoice) => void;
  /** The meeting / follow-up's own date and time: turning the reminder on starts an hour before. */
  forDate: string;
  forTime: string | null;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  return (
    <View style={styles.reminderBox}>
      <View style={styles.switchRow}>
        <View style={styles.reminderText}>
          <Text style={styles.switchLabel}>Set a reminder</Text>
          <Text style={styles.reminderHint}>{value.on ? 'Your phone rings only at this date and time.' : 'Off - nothing will ring for this.'}</Text>
        </View>
        <Switch value={value.on} onValueChange={(on) => onChange(on ? { on, ...suggestReminder(forDate, forTime) } : { ...value, on })} trackColor={{ true: theme.primary }} />
      </View>
      {value.on && (
        <>
          <View style={styles.gap} />
          <FieldRow>
            <PickField label="Reminder date" value={fmtDateShort(value.date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
            <PickField label="Reminder time" value={value.time ? fmtTime(value.time) : null} placeholder="Pick a time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
          </FieldRow>
        </>
      )}
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={value.date} minDate={todayStr()} title="Reminder date" onPick={(d) => { onChange({ ...value, date: d }); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={value.time} allowNone={false} onPick={(t) => { onChange({ ...value, time: t }); setSheet(null); }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Log a call
// ---------------------------------------------------------------------------

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'CONNECTED', label: 'Spoke to customer' },
  { value: 'NO_ANSWER', label: 'No response' },
  { value: 'CALLBACK_REQUESTED', label: 'Will call later' },
  { value: 'INVALID_NUMBER', label: 'Wrong / invalid number' },
];

const QUALITIES: { value: Qualification; label: string }[] = [
  { value: 'GENUINE', label: 'Genuine lead' },
  { value: 'NEEDS_INFO', label: 'Need more information' },
  { value: 'NOT_GENUINE', label: 'Not a genuine lead' },
];

export function LeadCallScreen() {
  const { leadId, name, contact, stage, canQualify } = useRoute<RouteProp<LeadStackParamList, 'LeadCall'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { myIdNum } = useMe();
  const { saving, error, setError, submit } = useSubmit();
  const [outcome, setOutcome] = useState<CallOutcome>('CONNECTED');
  const [quality, setQuality] = useState<Qualification | null>(null);
  const [comments, setComments] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('10:00');
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  const [reminder, setReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const callLogged = useRef(false);

  // Only a real conversation can tell whether the lead is genuine.
  const askQuality = canQualify && outcome === 'CONNECTED';
  const rejecting = askQuality && quality === 'NOT_GENUINE';

  const onSave = () => {
    const notes = comments.trim();
    if (rejecting && !notes) return setError('Add a note saying why this lead is not genuine.');
    const reminderError = followUp && !rejecting ? reminderProblem(reminder) : null;
    if (reminderError) return setError(reminderError);
    submit(async () => {
      // If a later step fails and Save is pressed again, the call must not be logged twice.
      if (!callLogged.current) {
        await api.logCall(leadId, {
          outcome,
          qualificationStatus: askQuality && quality ? quality : undefined,
          comments: notes || undefined,
        });
        callLogged.current = true;
      }
      // The call log is only a record; these are the calls that actually move the lead.
      if (askQuality && quality === 'GENUINE') await api.qualifyLead(leadId, 'GENUINE');
      if (askQuality && quality === 'NEEDS_INFO') await api.qualifyLead(leadId, 'NEEDS_INFO');
      if (rejecting) await api.rejectLead(leadId, notes);
      if (followUp && !rejecting) await api.addFollowUp(leadId, { date, time, note: notes, assignedTo: myIdNum, reminder: reminderOf(reminder) });
    });
  };

  return (
    <FormShell title="Update lead" subtitle="Call details" error={error} submitLabel={followUp && !rejecting ? 'Save follow-up' : 'Save call'} onSubmit={onSave} saving={saving} danger={rejecting}>
      <LeadHeader name={name} contact={contact} stage={stage} />
      <Text style={styles.section}>CALL OUTCOME</Text>
      <Card>
        {OUTCOMES.map((o) => (
          <RadioRow key={o.value} label={o.label} selected={outcome === o.value} onPress={() => setOutcome(o.value)} />
        ))}
      </Card>

      {askQuality && (
        <>
          <Text style={styles.section}>LEAD QUALITY</Text>
          <Card>
            {QUALITIES.map((q) => (
              <RadioRow key={q.value} label={q.label} selected={quality === q.value} onPress={() => setQuality(quality === q.value ? null : q.value)} />
            ))}
          </Card>
        </>
      )}

      <NotesField label={rejecting ? 'Reason (required)' : 'Call notes'} value={comments} onChangeText={setComments} placeholder="What did the customer say?" />

      {!rejecting && (
        <>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Create follow-up task (reminder)</Text>
            <Switch value={followUp} onValueChange={setFollowUp} trackColor={{ true: theme.primary }} />
          </View>
          {followUp && (
            <>
              <View style={styles.gap} />
              <FieldRow>
                <PickField label="Next follow-up date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
                <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Any time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
              </FieldRow>
              <ReminderField value={reminder} onChange={setReminder} forDate={date} forTime={time} />
            </>
          )}
        </>
      )}

      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Schedule a follow-up
// ---------------------------------------------------------------------------

export function LeadFollowUpScreen() {
  const { leadId, name, taskId } = useRoute<RouteProp<LeadStackParamList, 'LeadFollowUp'>>().params;
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { myId, myIdNum } = useMe();
  const { saving, error, setError, submit } = useSubmit();
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('10:00');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<'date' | 'time' | 'moveDate' | 'moveTime' | null>(null);
  // Follow-ups already open on this lead: undefined while checking.
  const [existing, setExisting] = useState<WorkTask[] | undefined>(undefined);
  // The open follow-up being moved, and its new date and time.
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const [moveDate, setMoveDate] = useState(todayStr());
  const [moveTime, setMoveTime] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState('');
  const [moving, setMoving] = useState(false);
  const [reminder, setReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const [moveReminder, setMoveReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const clashes = useClashes(myId, date, time);

  useEffect(() => {
    let alive = true;
    openFollowUpsFor(leadId)
      .then((list) => {
        if (!alive) return;
        setExisting(list);
        // Opened from one follow-up's edit: straight to changing that one.
        const picked = taskId ? list.find((t) => String(t.id) === taskId) : undefined;
        if (picked) startMove(picked);
        else if (taskId) setError('That follow-up is no longer open.');
      })
      .catch(() => alive && setExisting([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, taskId]);

  // A lead can have several follow-ups: "Add follow-up" always adds a new one next to those open.
  const onSave = async () => {
    // "Already something at this time?" - against everything that rings for me.
    const reminderError = reminderProblem(reminder);
    if (reminderError) return setError(reminderError);
    const items = await loadAllReminderItems(myId).catch(() => []);
    if (!(await confirmClash(items, date, time))) return;
    submit(() => api.addFollowUp(leadId, { date, time, note: note.trim(), assignedTo: myIdNum, newTask: true, reminder: reminderOf(reminder) }));
  };

  const startMove = (task: WorkTask) => {
    setError(null);
    setEditing(task);
    setMoveDate(String(task.due_date).slice(0, 10));
    setMoveTime(task.due_time ? task.due_time.slice(0, 5) : null);
    setMoveNote(task.description || '');
    setMoveReminder(reminderOff(todayStr()));
  };
  // "Change date & time" moves only the follow-up picked (the server keeps the earlier time in its history).
  const saveMove = async () => {
    if (!editing) return;
    const reminderError = reminderProblem(moveReminder);
    if (reminderError) return setError(reminderError);
    setMoving(true);
    setError(null);
    try {
      await api.addFollowUp(leadId, {
        date: moveDate,
        time: moveTime,
        note: moveNote.trim(),
        assignedTo: Number(editing.assigned_to) || myIdNum,
        taskId: editing.id,
        reminder: reminderOf(moveReminder),
      });
      refreshReminders();
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not change the follow-up.'));
    } finally {
      setMoving(false);
    }
  };

  if (existing === undefined) {
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <TopBar title="Follow-ups" subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <CrmScreen edges={[]} transparent contentStyle={styles.body}>
          <CrmSkeleton height={64} radius={16} />
          <View style={styles.gap} />
          <CrmSkeleton height={64} radius={16} />
        </CrmScreen>
      </LeadScreen>
    );
  }

  const when = (t: WorkTask) => `${fmtDateShort(String(t.due_date).slice(0, 10))}${t.due_time ? `, ${fmtTime(t.due_time)}` : ''}`;

  if (editing) {
    return (
      <FormShell title="Change follow-up" subtitle={name} error={error} submitLabel="Save changes" saving={moving} onSubmit={saveMove}>
        <Card>
          <InfoLine label="Now due" value={when(editing)} />
        </Card>
        <View style={styles.gap} />
        <FieldRow>
          <PickField label="New date" value={fmtDateShort(moveDate)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('moveDate')} />
          <PickField label="New time" value={moveTime ? fmtTime(moveTime) : null} placeholder="Any time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('moveTime')} />
        </FieldRow>
        <NotesField label="Note" value={moveNote} onChangeText={setMoveNote} placeholder="What needs to be followed up?" />
        <ReminderField value={moveReminder} onChange={setMoveReminder} forDate={moveDate} forTime={moveTime} />
        <View style={styles.gap} />
        <PrimaryButton label="Cancel" variant="secondary" onPress={() => (taskId ? navigation.goBack() : setEditing(null))} />
        <DateSheet visible={sheet === 'moveDate'} onClose={() => setSheet(null)} value={moveDate} minDate={todayStr()} title="New follow-up date" onPick={(d) => { setMoveDate(d); setSheet(null); }} />
        <TimeSheet visible={sheet === 'moveTime'} onClose={() => setSheet(null)} value={moveTime} onPick={(t) => { setMoveTime(t); setSheet(null); }} />
      </FormShell>
    );
  }

  return (
    <FormShell title="Follow-ups" subtitle={name} error={error} submitLabel="Add follow-up" saving={saving} onSubmit={onSave}>
      {existing.length > 0 && (
        <>
          <Text style={styles.section}>{existing.length === 1 ? 'OPEN FOLLOW-UP' : `OPEN FOLLOW-UPS (${existing.length})`}</Text>
          {existing.map((t) => {
            const mine = Number(t.assigned_to) === myIdNum;
            return (
              <Card key={t.id} style={styles.fuCard}>
                <View style={styles.fuRow}>
                  <View style={[styles.fuIcon, { backgroundColor: theme.warningBg }]}>
                    <ClockIcon size={20} color={theme.warning} />
                  </View>
                  <View style={styles.fuBody}>
                    <Text style={styles.fuWhen}>{when(t)}</Text>
                    {!!t.description && <Text style={styles.fuMeta} numberOfLines={2}>{t.description}</Text>}
                    {!mine && !!t.assigned_to_name && <Text style={styles.fuMeta}>for {t.assigned_to_name}</Text>}
                  </View>
                  {mine && (
                    <Pressable onPress={() => startMove(t)} accessibilityRole="button" accessibilityLabel="Change date and time" style={({ pressed }) => [styles.fuChange, pressed && { opacity: 0.8 }]}>
                      <Text style={styles.fuChangeText}>Change</Text>
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          })}
          <View style={styles.gap} />
        </>
      )}
      <Text style={styles.section}>ADD A FOLLOW-UP</Text>
      <FieldRow>
        <PickField label="Follow-up date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
        <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Any time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
      </FieldRow>
      <ClashNotice clashes={clashes} date={date} time={time} />
      <NotesField label="Note" value={note} onChangeText={setNote} placeholder="What needs to be followed up?" />
      <ReminderField value={reminder} onChange={setReminder} forDate={date} forTime={time} />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Residential lead: log a call and set the next one
// ---------------------------------------------------------------------------

const RESIDENTIAL_OUTCOMES: { value: api.ResidentialOutcome; label: string }[] = [
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'CALL_BACK', label: 'Call back later' },
  { value: 'NOT_REACHABLE', label: 'Not reachable' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
];

/**
 * Residential leads are followed up by phone only: what the call came to, and when to call next
 * (it rings at that time). "Not interested" closes the lead and its follow-ups instead.
 */
export function LeadResidentialCallScreen() {
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadResidentialCall'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  const { refresh } = useLeads();
  const { saving, error, setError, submit } = useSubmit();
  const [outcome, setOutcome] = useState<api.ResidentialOutcome | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('10:00');
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  const [reminder, setReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const closing = outcome === 'NOT_INTERESTED';
  const clashes = useClashes(myId, date, closing ? null : time);

  const onSave = async () => {
    if (!outcome) return setError('Choose how the call went.');
    if (closing && !note.trim()) return setError('Add a short note on why the customer is not interested.');
    if (!closing && date === todayStr() && time && new Date(`${date}T${time}:00`).getTime() <= Date.now()) {
      return setError(`${fmtTime(time)} today has already passed. Pick a later time for the next call.`);
    }
    const reminderError = closing ? null : reminderProblem(reminder);
    if (reminderError) return setError(reminderError);
    if (!closing) {
      const items = await loadAllReminderItems(myId).catch(() => []);
      if (!(await confirmClash(items, date, time))) return;
    }
    submit(async () => {
      await api.logResidentialCall(leadId, {
        outcome,
        note: note.trim(),
        nextDate: closing ? undefined : date,
        nextTime: closing ? null : time,
        reminder: closing ? null : reminderOf(reminder),
      });
      // The lead's status may have moved (contacted / lost): bring the lead list up to date.
      refresh();
    });
  };

  return (
    <FormShell
      title="Log call"
      subtitle={name}
      error={error}
      submitLabel={closing ? 'Close lead' : 'Save call & next call'}
      onSubmit={onSave}
      saving={saving}
      danger={closing}
    >
      <Text style={styles.section}>HOW DID THE CALL GO?</Text>
      <Card>
        {RESIDENTIAL_OUTCOMES.map((o) => (
          <RadioRow key={o.value} label={o.label} selected={outcome === o.value} onPress={() => setOutcome(o.value)} />
        ))}
      </Card>
      <NotesField
        label={closing ? 'Reason (required)' : 'Call notes'}
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 400))}
        placeholder={closing ? 'Why is the customer not interested?' : 'What did the customer say?'}
      />
      {closing ? (
        <Text style={styles.help}>This closes the lead as not interested and stops its follow-up calls.</Text>
      ) : (
        <>
          <Text style={styles.section}>NEXT CALL</Text>
          <FieldRow>
            <PickField label="Date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
            <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Any time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
          </FieldRow>
          <ClashNotice clashes={clashes} date={date} time={time} />
          <ReminderField value={reminder} onChange={setReminder} forDate={date} forTime={time} />
          <Text style={styles.help}>Keep calling until the customer is converted.</Text>
        </>
      )}
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

/** A residential lead became a customer: the final amount (changeable) and a note; its calls stop. */
export function LeadResidentialConvertScreen() {
  const { leadId, name, amount: leadAmount } = useRoute<RouteProp<LeadStackParamList, 'LeadResidentialConvert'>>().params;
  const { styles } = useCrmStyles(factory);
  const { refresh } = useLeads();
  const { saving, error, setError, submit } = useSubmit();
  const [amount, setAmount] = useState(leadAmount > 0 ? String(Math.round(leadAmount)) : '');
  const [note, setNote] = useState('');

  const onSave = () => {
    const total = amount ? Number(amount) : undefined;
    if (total !== undefined && (!Number.isFinite(total) || total <= 0)) return setError('Enter a valid amount, or leave it empty.');
    submit(async () => {
      await api.convertResidential(leadId, { amount: total, note: note.trim() });
      // The lead's status changed: bring the lead list and its details up to date.
      refresh();
    });
  };

  return (
    <FormShell title="Convert to customer" subtitle={name} error={error} submitLabel="Convert to customer" onSubmit={onSave} saving={saving}>
      <Text style={styles.help}>The lead becomes a customer and its follow-up calls stop. It cannot be undone from the app.</Text>
      <CrmTextField
        label="Final amount (₹)"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 8))}
        prefix="₹"
        keyboardType="number-pad"
        hint={leadAmount > 0 && Number(amount) !== Math.round(leadAmount) ? `Changed from ${formatINR(leadAmount)}` : 'The lead amount - change it if the final amount is different.'}
      />
      <NotesField label="Note (optional)" value={note} onChangeText={(v) => setNote(v.slice(0, 400))} placeholder="e.g. Service booked for Saturday" />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Assign / reassign (sales manager)
// ---------------------------------------------------------------------------

/**
 * The sales manager gives the lead to a sales executive (or another sales manager) to work, or keeps
 * it ("Myself"). Only that person - and the
 * managers - then see it.
 */
export function LeadAssignScreen() {
  const { leadId, name, salesId, telecallerId } = useRoute<RouteProp<LeadStackParamList, 'LeadAssign'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { myIdNum } = useMe();
  const { saving, error, setError, submit } = useSubmit();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .leadAssignees()
      .then((list) => alive && setPeople(list))
      .catch((err) => {
        if (!alive) return;
        setPeople([]);
        setError(errorMessage(err, 'Could not load the team.'));
      });
    return () => {
      alive = false;
    };
  }, [setError]);

  const current = salesId ? Number(salesId) : telecallerId ? Number(telecallerId) : null;
  const currentName = current === myIdNum ? 'You' : people?.find((p) => p.id === current)?.name;
  const groups: { title: string; list: Person[] }[] = people
    ? [
        { title: 'SALES EXECUTIVES', list: people.filter((p) => p.role === 'Sales Executive') },
        { title: 'SALES MANAGERS', list: people.filter((p) => api.isManagerRole(p.role) && p.id !== myIdNum) },
      ].filter((g) => g.list.length > 0)
    : [];

  const onSave = () => {
    if (!picked) return setError('Choose who this lead goes to.');
    if (picked === current) return setError('This lead is already with them.');
    submit(() => api.assignLead(leadId, picked));
  };

  return (
    <FormShell title="Assign lead" subtitle={name} error={error} submitLabel="Assign lead" onSubmit={onSave} saving={saving}>
      <View style={styles.nowChip}>
        <UsersIcon size={14} color={theme.primary} />
        <Text style={styles.nowChipText} numberOfLines={1}>
          {currentName ? `Now with ${currentName}` : 'Not assigned yet'}
        </Text>
      </View>
      {!people ? (
        <CrmSkeleton height={180} radius={16} />
      ) : (
        <>
          <PersonPick name="Myself" me now={current === myIdNum} selected={picked === myIdNum} onPress={() => setPicked(myIdNum)} />
          {groups.map((g) => (
            <React.Fragment key={g.title}>
              <Text style={[styles.section, styles.pickSection]}>{g.title}</Text>
              {g.list.map((p) => (
                <PersonPick key={p.id} name={p.name} role={p.role} now={p.id === current} selected={picked === p.id} onPress={() => setPicked(p.id)} />
              ))}
            </React.Fragment>
          ))}
        </>
      )}
    </FormShell>
  );
}

/** One person to give the lead to: a coloured initials avatar, the name and role, a tick when chosen. */
function PersonPick({ name, role, me, now, selected, onPress }: { name: string; role?: string; me?: boolean; now?: boolean; selected: boolean; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const tone = me ? { fg: theme.primary, bg: theme.primarySoftBg } : toneColors(theme, personTone(name));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.pick, selected && styles.pickOn, pressed && styles.pickPressed]}
    >
      <View style={[styles.pickAvatar, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pickInitials, { color: tone.fg }]}>{me ? 'ME' : initials(name)}</Text>
      </View>
      <View style={styles.pickBody}>
        <Text style={styles.pickName} numberOfLines={1}>
          {name}
        </Text>
        {(!!role || now) && (
          <View style={styles.pickTags}>
            {!!role && <Text style={styles.pickRole}>{role}</Text>}
            {now && (
              <View style={styles.pickNow}>
                <Text style={styles.pickNowText}>NOW</Text>
              </View>
            )}
          </View>
        )}
      </View>
      {selected ? <CheckCircleIcon size={24} color={theme.primary} /> : <View style={styles.pickRing} />}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Schedule a meeting
// ---------------------------------------------------------------------------

/**
 * Where the meeting is: the client's address (from the lead form), the BestServe office, or
 * another place - read from where I am now (GPS), which can be cleared, read again or typed over.
 */
type MeetingPlace = 'client' | 'office' | 'other';
const MEETING_PLACES: Option<MeetingPlace>[] = [
  { value: 'client', label: 'Client location' },
  { value: 'office', label: 'BestServe office' },
  { value: 'other', label: 'Other' },
];
export const BESTSERVE_OFFICE_ADDRESS = '1st Floor, Swathi Sankeema, 11, 27th Cross, 7th Block, Jayanagar, Bengaluru, Karnataka 560070';

export function LeadMeetingNewScreen() {
  const { leadId, name, address: leadAddress } = useRoute<RouteProp<LeadStackParamList, 'LeadMeetingNew'>>().params;
  const { theme } = useCrmStyles(factory);
  const { myId, myIdNum, persona } = useMe();
  const { saving, error, setError, submit } = useSubmit();
  const [people, setPeople] = useState<Person[]>([]);
  // A sales executive scheduling their own visit is the common case; others must choose.
  const [personId, setPersonId] = useState<number | null>(persona === 'sales' ? myIdNum : null);
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('11:00');
  const [place, setPlace] = useState<MeetingPlace>('client');
  const [address, setAddress] = useState(leadAddress);
  const [reminder, setReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const [currentAddress, setCurrentAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const type: MeetingType = place === 'office' ? 'OFFICE' : 'SITE_VISIT';
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState<'date' | 'time' | 'person' | null>(null);
  // A lead has one open meeting at a time: undefined while checking, null when there is none.
  const [existing, setExisting] = useState<api.OpenMeeting | null | undefined>(undefined);
  const navigation = useNavigation<Nav>();
  const { styles } = useCrmStyles(factory);

  useEffect(() => {
    let alive = true;
    api
      .openMeeting(leadId)
      .then((m) => alive && setExisting(m))
      .catch(() => alive && setExisting(null));
    return () => {
      alive = false;
    };
  }, [leadId]);

  useEffect(() => {
    let alive = true;
    api
      .salesEmployees()
      .then((list) => alive && setPeople(list))
      .catch((err) => alive && setError(errorMessage(err, 'Could not load the sales team.')));
    return () => {
      alive = false;
    };
  }, [setError]);

  const person = people.find((p) => p.id === personId);
  const personLabel = person?.name ?? (personId === myIdNum ? 'Me' : null);
  // Only my own reminders can be read, so the "already at this time" check is for a meeting I attend.
  const forMe = personId === myIdNum;
  const clashes = useClashes(myId, date, time, undefined, forMe);

  // "Current location": the address of where I am now, read once from GPS (it can be corrected by hand).
  const readCurrent = async () => {
    setLocating(true);
    setError(null);
    try {
      const loc = await getCurrentLocation();
      const text = await reverseGeocode(loc.latitude, loc.longitude);
      setCurrentAddress(text || `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
    } catch {
      setError('Could not read your location. Turn location on and try again, or choose Other.');
    } finally {
      setLocating(false);
    }
  };
  const pickPlace = (next: MeetingPlace) => {
    setPlace(next);
    if (next === 'other' && !currentAddress && !locating) readCurrent();
  };
  const meetingAddress = place === 'office' ? BESTSERVE_OFFICE_ADDRESS : place === 'other' ? currentAddress : address;

  const onSave = async () => {
    if (!personId) return setError('Choose the sales person for this meeting.');
    if (!time) return setError('Choose a time for the meeting.');
    if (place === 'other' && !currentAddress.trim()) return setError(locating ? 'Reading your location - one moment.' : 'No address yet. Tap Refresh to read your location, or type it.');
    if (place === 'client' && !address.trim()) return setError('The lead has no address. Type the client address.');
    const reminderError = reminderProblem(reminder);
    if (reminderError) return setError(reminderError);
    if (forMe) {
      const items = await loadAllReminderItems(myId).catch(() => []);
      if (!(await confirmClash(items, date, time))) return;
    }
    let created: string | null = null;
    submit(
      async () => {
        const meeting = await api.scheduleMeeting(leadId, { salesEmployeeId: personId, date, time, type, address: meetingAddress.trim(), notes: notes.trim(), reminder: reminderOf(reminder) });
        created = meeting.id;
      },
      // Straight to the meeting just set - its time, place, Directions and Start visit.
      () => (created ? navigation.replace('LeadMeeting', { meetingId: created }) : navigation.goBack()),
    );
  };

  if (existing === undefined) {
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <TopBar title="Schedule meeting" subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <CrmScreen edges={[]} transparent contentStyle={styles.body}>
          <CrmSkeleton height={64} radius={16} />
          <View style={styles.gap} />
          <CrmSkeleton height={64} radius={16} />
        </CrmScreen>
      </LeadScreen>
    );
  }

  if (existing) {
    const office = existing.type === 'OFFICE';
    return (
      <LeadScreen edges={['top', 'bottom']}>
        <TopBar title="Schedule meeting" subtitle={name} onBack={() => navigation.goBack()} icon="close" />
        <CrmScreen edges={[]} transparent contentStyle={styles.body}>
          <Card>
            <View style={styles.busyCard}>
              <View style={styles.busyIcon}>
                <CalendarIcon size={30} color={theme.accent} />
              </View>
              <Text style={styles.busyTitle}>{existing.started ? 'A visit is in progress' : 'A meeting is already scheduled'}</Text>
              <Text style={styles.busyWhen}>
                {office ? 'Office meeting' : 'Site visit'} · {fmtDateShort(existing.date)}
                {existing.time ? `, ${fmtTime(existing.time)}` : ''}
              </Text>
              {!!existing.salesName && <Text style={styles.busyMeta}>with {existing.salesName}</Text>}
              <Text style={styles.busyHelp}>
                A lead can have one open meeting. Complete, reschedule or cancel this one before setting a new one.
              </Text>
            </View>
          </Card>
          <View style={styles.gap} />
          <PrimaryButton label="Open meeting" onPress={() => navigation.replace('LeadMeeting', { meetingId: existing.id })} />
          <View style={styles.gap} />
          <PrimaryButton label="Back" variant="secondary" onPress={() => navigation.goBack()} />
        </CrmScreen>
      </LeadScreen>
    );
  }

  return (
    <FormShell title="Schedule meeting" subtitle={name} error={error} submitLabel="Schedule meeting" onSubmit={onSave} saving={saving}>
      <PickField label="Assign to sales person" value={personLabel} placeholder="Choose a sales person" icon={<PersonIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('person')} />
      <FieldRow>
        <PickField label="Meeting date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
        <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Pick a time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
      </FieldRow>
      <ClashNotice clashes={clashes} date={date} time={time} />
      <FieldLabel>Meeting location</FieldLabel>
      <SegmentedControl options={MEETING_PLACES} value={place} onChange={pickPlace} />
      <View style={{ height: spacing.md }} />
      {place === 'office' && (
        <Card>
          <InfoLine label="BestServe office" value={BESTSERVE_OFFICE_ADDRESS} />
        </Card>
      )}
      {place === 'client' && (
        <CrmTextField label="Client address" value={address} onChangeText={setAddress} placeholder="The client's address" maxLength={255} multiline />
      )}
      {place === 'other' && (
        <>
          <CrmTextField
            label="Your current location"
            value={currentAddress}
            onChangeText={setCurrentAddress}
            placeholder={locating ? 'Reading your location…' : 'Tap Refresh to read your location, or type an address'}
            maxLength={255}
            multiline
          />
          <View style={styles.addrActions}>
            <Pressable onPress={() => setCurrentAddress('')} disabled={locating || !currentAddress} accessibilityRole="button" style={({ pressed }) => [styles.addrBtn, (locating || !currentAddress) && styles.addrBtnOff, pressed && { opacity: 0.8 }]}>
              <Text style={styles.addrBtnText}>Clear</Text>
            </Pressable>
            <Pressable onPress={readCurrent} disabled={locating} accessibilityRole="button" style={({ pressed }) => [styles.addrBtn, locating && styles.addrBtnOff, pressed && { opacity: 0.8 }]}>
              <Text style={styles.addrBtnText}>{locating ? 'Reading…' : 'Refresh'}</Text>
            </Pressable>
          </View>
        </>
      )}
      <NotesField label="Meeting notes" value={notes} onChangeText={setNotes} placeholder="What should be discussed or inspected?" />
      <ReminderField value={reminder} onChange={setReminder} forDate={date} forTime={time} />

      <PeopleSheet visible={sheet === 'person'} onClose={() => setSheet(null)} people={people} selectedId={personId} meId={myIdNum} title="Sales person" onPick={(p) => { setPersonId(p.id); setSheet(null); }} />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} allowNone={false} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Reschedule a meeting
// ---------------------------------------------------------------------------

export function LeadMeetingRescheduleScreen() {
  const { meetingId, title, date: oldDate, time: oldTime } = useRoute<RouteProp<LeadStackParamList, 'LeadMeetingReschedule'>>().params;
  const { theme } = useCrmStyles(factory);
  const { saving, error, setError, submit } = useSubmit();
  const [date, setDate] = useState(oldDate >= todayStr() ? oldDate : todayStr());
  const [time, setTime] = useState<string | null>(oldTime.slice(0, 5));
  const [reason, setReason] = useState('');
  const [reminder, setReminder] = useState<ReminderChoice>(() => reminderOff(todayStr()));
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);

  const onSave = () => {
    if (!time) return setError('Choose the new meeting time.');
    if (new Date(`${date}T${time}:00`).getTime() <= Date.now()) return setError('That time has already passed. Pick a later time for the meeting.');
    if (date === oldDate && time === oldTime.slice(0, 5)) return setError('Pick a different date or time.');
    const reminderError = reminderProblem(reminder);
    if (reminderError) return setError(reminderError);
    submit(() => api.rescheduleMeeting(meetingId, date, time, { reason: reason.trim(), reminder: reminderOf(reminder) }).then(() => undefined));
  };

  return (
    <FormShell title="Reschedule meeting" subtitle={title} error={error} submitLabel="Save new time" onSubmit={onSave} saving={saving}>
      <Card>
        <InfoLine label="Now" value={`${fmtDateShort(oldDate)}, ${fmtTime(oldTime)}`} />
      </Card>
      <View style={{ height: spacing.md }} />
      <FieldRow>
        <PickField label="New date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
        <PickField label="New time" value={time ? fmtTime(time) : null} placeholder="Pick a time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
      </FieldRow>
      <NotesField label="Reason (optional)" value={reason} onChangeText={(v) => setReason(v.slice(0, 500))} placeholder="e.g. Customer asked for another day" />
      <ReminderField value={reminder} onChange={setReminder} forDate={date} forTime={time} />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} title="New meeting date" onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} allowNone={false} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Reject (not genuine) / mark lost
// ---------------------------------------------------------------------------

export function LeadCloseScreen() {
  const { leadId, name, mode } = useRoute<RouteProp<LeadStackParamList, 'LeadClose'>>().params;
  const { styles } = useCrmStyles(factory);
  const { saving, error, setError, submit } = useSubmit();
  const [reasons, setReasons] = useState<NamedOption[]>([]);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const reject = mode === 'reject';

  useEffect(() => {
    let alive = true;
    // The list is a convenience - if it does not load, a typed reason is still enough.
    api
      .lossReasons()
      .then((list) => alive && setReasons(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onSave = () => {
    const picked = reasons.find((r) => String(r.id) === reasonId);
    const text = [picked?.name, notes.trim()].filter(Boolean).join(': ');
    if (!text) return setError('Choose a reason or describe why.');
    submit(() => (reject ? api.rejectLead(leadId, text, picked?.id) : api.markLost(leadId, text, picked?.id)));
  };

  return (
    <FormShell title={reject ? 'Reject lead' : 'Mark as lost'} subtitle={name} error={error} submitLabel={reject ? 'Reject lead' : 'Mark as lost'} onSubmit={onSave} saving={saving} danger>
      <Text style={styles.help}>
        {reject ? 'Use this when the lead is not genuine. It closes the lead.' : 'Use this when a genuine opportunity did not close. It closes the lead.'}
      </Text>
      {reasons.length > 0 && (
        <SelectField
          label="Reason"
          placeholder="Choose a reason"
          options={reasons.map((r) => ({ value: String(r.id), label: r.name }))}
          value={reasonId}
          onChange={setReasonId}
        />
      )}
      <NotesField label="Details" value={notes} onChangeText={setNotes} placeholder="Add anything the team should know" />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Convert to customer
// ---------------------------------------------------------------------------

export function LeadConvertScreen() {
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadConvert'>>().params;
  const { styles: cs, theme } = useCrmStyles(convertFactory);
  const { saving, error, setError, submit } = useSubmit();
  const [notes, setNotes] = useState('');
  const [lead, setLead] = useState<PipelineLead | null>(null);
  // The deal (closure) amount - what this conversion counts for in targets. Filled with the latest
  // quotation (else the approximate quote) and changeable before converting.
  const [amount, setAmount] = useState('');
  const [quoted, setQuoted] = useState<number | null>(null);
  // The sales manager converting a sales executive's lead chooses who it counts for: that sales
  // person (picked to start with) or themselves.
  const { persona, myIdNum } = useMe();
  const manager = persona === 'sales_manager';
  const [owner, setOwner] = useState<Person | null>(null);
  const [creditTo, setCreditTo] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    // Only to show what the customer record will contain; converting does not depend on it.
    api
      .getLead(leadId)
      .then(async (l) => {
        if (!alive) return;
        setLead(l);
        // The closure amount starts as the latest quotation sent (what was offered), else the
        // approximate quote; the person can still change it to the final agreed amount.
        const quotes = await api.getQuotations(leadId).catch(() => []);
        const latest = quotes
          .filter((q) => q.status !== 'CANCELLED' && q.total > 0)
          .sort((a, b) => String(b.sentAt ?? '').localeCompare(String(a.sentAt ?? '')))[0];
        if (!alive) return;
        setQuoted(latest ? latest.total : null);
        const start = latest ? latest.total : l.amount;
        setAmount((a) => a || (start > 0 ? String(Math.round(start)) : ''));
        if (!manager) return;
        // Whose lead it is: its sales person, else the sales executive who added it.
        const people = await api.salesEmployees().catch(() => [] as Person[]);
        const byId = (id: string | null) => (id ? people.find((p) => String(p.id) === String(id)) : undefined);
        const who = byId(l.salesEmployeeId) ?? byId(l.createdById);
        if (alive && who && who.id !== myIdNum) {
          setOwner(who);
          setCreditTo(who.id);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leadId, manager, myIdNum]);

  // What the amount was filled with, to say where it came from or that it was changed.
  const startAmount = quoted ?? lead?.amount ?? 0;
  const startLabel = quoted !== null ? 'the latest quotation' : 'the approximate quote';
  const changed = startAmount > 0 && amount !== '' && Number(amount) !== Math.round(startAmount);
  const details: DetailRow[] = lead
    ? [
        { icon: BriefcaseIcon, label: 'Customer (company)', value: lead.companyName || name },
        { icon: PinIcon, label: 'Address', value: lead.address },
        { icon: TagIcon, label: 'Lead source', value: lead.source ? SOURCE_LABELS[lead.source] ?? lead.source : '' },
        { icon: PersonIcon, label: 'Added by', value: lead.createdByName },
      ]
    : [];
  const contact: DetailRow[] = lead
    ? [
        { icon: PersonIcon, label: 'Contact person', value: lead.contactPerson },
        { icon: PhoneIcon, label: 'Phone', value: lead.phone ? `+91 ${lead.phone}` : '' },
        ...(lead.alternatePhone ? [{ icon: PhoneIcon, label: 'Alternate phone', value: `+91 ${lead.alternatePhone}` }] : []),
        { icon: EmailIcon, label: 'Email', value: lead.email },
      ]
    : [];
  const sections = [
    { title: 'Company', icon: <BriefcaseIcon />, color: theme.primary, rows: details },
    { title: 'Contact', icon: <PhoneIcon />, color: theme.success, rows: contact },
  ];

  return (
    <FormShell
      title="Convert to customer"
      subtitle={name}
      error={error}
      submitLabel="Convert to customer"
      saving={saving}
      onSubmit={() => {
        const total = amount ? Number(amount) : undefined;
        if (total !== undefined && (!Number.isFinite(total) || total <= 0)) return setError('Enter a valid amount, or leave it empty.');
        submit(async () => {
          await api.convertLead(leadId, notes.trim(), total, owner && creditTo !== null ? creditTo : undefined);
        });
      }}
    >
      {/* What happens: a customer is created and the lead closes as won. */}
      <View style={cs.hero}>
        <GlossyBadge color={theme.success} size={52} icon={<CheckCircleIcon size={26} color={WHITE} />} />
        <View style={cs.flex1}>
          <Text style={cs.heroTitle} numberOfLines={2}>
            {lead?.companyName || name}
          </Text>
          <Text style={cs.heroSub}>{lead?.leadNumber ? `${lead.leadNumber} · becomes a customer` : 'Becomes a customer'}</Text>
        </View>
      </View>
      {/* <View style={cs.warn}>
        <AlertTriangleIcon size={16} color={theme.warningText} />
        <Text style={cs.warnText}>This closes the lead as converted and cannot be undone from the app.</Text>
      </View> */}

      {!lead ? (
        <CrmSkeleton height={260} radius={16} />
      ) : (
        <>
          {/* The closure amount - what this conversion adds to the target. */}
          <View style={cs.card}>
            <View style={cs.cardHead}>
              <IconTile icon={<RupeeIcon />} color={theme.success} size={32} />
              <View style={cs.flex1}>
                <Text style={cs.cardTitle}>Deal amount</Text>
                <Text style={cs.cardSub}>The final amount agreed - counts towards the target</Text>
              </View>
            </View>
            <CrmTextField
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
              prefix="₹"
              keyboardType="number-pad"
              maxLength={9}
              placeholder="0"
              hint={
                changed
                  ? `Changed from ${startLabel} (${formatINR(startAmount)})`
                  : startAmount > 0
                    ? `Filled with ${startLabel} - change it if the final amount is different.`
                    : undefined
              }
            />
            {!!lead.notes && (
              <View style={cs.req}>
                <Text style={cs.reqLabel}>REQUIREMENT</Text>
                <Text style={cs.reqText}>{lead.notes}</Text>
              </View>
            )}
          </View>

          {!!owner && (
            <View style={cs.card}>
              <View style={cs.cardHead}>
                <IconTile icon={<UsersIcon />} color={theme.accent} size={32} />
                <View style={cs.flex1}>
                  <Text style={cs.cardTitle}>Count this conversion for</Text>
                  <Text style={cs.cardSub}>Whose target the deal amount is added to</Text>
                </View>
              </View>
              {[
                {
                  id: owner.id,
                  title: owner.name,
                  sub: `${api.roleName(owner.role)} · ${String(lead.salesEmployeeId) === String(owner.id) ? 'assigned' : 'added this lead'}`,
                },
                { id: myIdNum, title: 'Me', sub: 'Count it towards my own target' },
              ].map((o) => {
                const on = creditTo === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setCreditTo(o.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [cs.choice, on && cs.choiceOn, pressed && cs.pressed]}
                  >
                    <View style={[cs.avatar, on && cs.avatarOn]}>
                      <Text style={[cs.avatarText, on && cs.avatarTextOn]}>{o.title.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={cs.flex1}>
                      <Text style={cs.choiceTitle}>{o.title}</Text>
                      <Text style={cs.choiceSub}>{o.sub}</Text>
                    </View>
                    <View style={[cs.radio, on && cs.radioOn]}>{on && <View style={cs.radioDot} />}</View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {sections.map((sec) => (
            <View key={sec.title} style={cs.card}>
              <View style={cs.cardHead}>
                <IconTile icon={sec.icon} color={sec.color} size={32} />
                <Text style={[cs.cardTitle, cs.flex1]}>{sec.title}</Text>
              </View>
              {sec.rows.map((r, i) => {
                const RowIcon = r.icon;
                return (
                  <View key={r.label} style={[cs.row, i > 0 && cs.rowLine]}>
                    <RowIcon size={16} color={theme.textMuted} />
                    <View style={cs.flex1}>
                      <Text style={cs.rowLabel}>{r.label}</Text>
                      <Text style={[cs.rowValue, !r.value && cs.rowEmpty]}>{r.value || 'Not added'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}
      <NotesField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Annual contract agreed" />
    </FormShell>
  );
}

type DetailRow = { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: string };

const WHITE = '#FFFFFF';

/** The Convert to customer screen's own look: a clear header, the deal amount first, tidy detail cards. */
const convertFactory = (t: CrmTheme) => ({
  flex1: { flex: 1 },
  pressed: { opacity: 0.85 },
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginBottom: spacing.sm },
  heroTitle: { ...typography.title, color: t.textPrimary },
  heroSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  warn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.warningBg,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  warnText: { ...typography.caption, color: t.warningText, flex: 1 },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...t.cardShadow,
  },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary },
  cardSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  req: { backgroundColor: t.surfaceAlt, borderRadius: radii.md, padding: spacing.sm },
  reqLabel: { ...typography.overline, color: t.textMuted },
  reqText: { ...typography.body, color: t.textSecondary, marginTop: 2 },
  choice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: t.border,
    marginTop: spacing.xs,
  },
  choiceOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarOn: { backgroundColor: t.primary },
  avatarText: { ...typography.bodyMedium, color: t.textSecondary },
  avatarTextOn: { color: WHITE },
  choiceTitle: { ...typography.bodyMedium, color: t.textPrimary },
  choiceSub: { ...typography.caption, color: t.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  radioOn: { borderColor: t.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, paddingVertical: spacing.sm },
  rowLine: { borderTopWidth: 1, borderTopColor: t.border },
  rowLabel: { ...typography.caption, color: t.textMuted },
  rowValue: { ...typography.body, color: t.textPrimary, marginTop: 1 },
  rowEmpty: { color: t.textMuted },
});

// ---------------------------------------------------------------------------
// Upload a quotation (PDF)
// ---------------------------------------------------------------------------

/** Same limit the server enforces - checked here so a large file fails before a slow upload, not after. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function LeadQuoteScreen() {
  const { leadId, name, amount: leadAmount } = useRoute<RouteProp<LeadStackParamList, 'LeadQuote'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { saving, error, setError, submit } = useSubmit();
  const [amount, setAmount] = useState(leadAmount > 0 ? String(Math.round(leadAmount)) : '');
  const [file, setFile] = useState<LocalFile | null>(null);
  const [notes, setNotes] = useState('');

  const pickPdf = async () => {
    try {
      const [picked] = await pick({ type: [types.pdf] });
      if (picked.size != null && picked.size > MAX_PDF_BYTES) return setError('That file is too large. The limit is 10 MB.');
      setError(null);
      setFile({ uri: picked.uri, name: picked.name || `quotation-${Date.now()}.pdf`, type: 'application/pdf' });
    } catch (err) {
      // Backing out of the picker is not an error.
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)) setError('Could not open the file picker.');
    }
  };

  const onSave = () => {
    const total = Number(amount);
    if (!amount || !Number.isFinite(total) || total <= 0) return setError('Enter the quotation amount.');
    if (!file) return setError('Attach the quotation PDF.');
    submit(async () => {
      // The server keeps the note in the lead history, capped at 300 characters.
      await api.uploadQuotation(leadId, { totalAmount: total, notes: notes.trim().slice(0, 300), file });
    });
  };

  return (
    <FormShell title="Upload quotation" subtitle={name} error={error} submitLabel="Upload quotation" onSubmit={onSave} saving={saving}>
      <Text style={styles.help}>The quotation is saved as sent and the lead moves to "Quotation sent". The quotation number is assigned automatically.</Text>
      <Card>
        <InfoLine label="Quotation no." value="Assigned on upload" />
      </Card>
      <CrmTextField
        label="Total amount (₹)"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
        prefix="₹"
        keyboardType="number-pad"
        maxLength={8}
      />
      <PickField
        label="Quotation PDF"
        value={file?.name ?? null}
        placeholder="Choose a PDF file"
        icon={<DocumentIcon size={18} color={theme.textMuted} />}
        onPress={pickPdf}
      />
      <NotesField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Sent by email, follow up after 1 week" />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Feedback to the lead provider
// ---------------------------------------------------------------------------

export function LeadFeedbackScreen() {
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadFeedback'>>().params;
  const { styles } = useCrmStyles(factory);
  const { saving, error, setError, submit } = useSubmit();
  const [message, setMessage] = useState('');

  const onSave = () => {
    const text = message.trim();
    if (!text) return setError('Write the feedback to send.');
    submit(() => api.sendFeedback(leadId, text));
  };

  return (
    <FormShell title="Feedback to provider" subtitle={name} error={error} submitLabel="Send feedback" onSubmit={onSave} saving={saving}>
      <Text style={styles.help}>The lead provider will see this message. Do not include internal notes or pricing.</Text>
      <NotesField label="Message" value={message} onChangeText={setMessage} placeholder="e.g. Customer contacted, meeting scheduled" />
    </FormShell>
  );
}
