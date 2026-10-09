import React, { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
import { CalendarIcon, ClockIcon, DocumentIcon, PersonIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import type { Option } from '../../crm/types';
import { CrmErrorBanner, CrmScreen } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { SelectField } from '../../crm/ui/SelectField';
import { addDays, fmtDateShort, fmtTime, todayStr } from '../../tasks/format';
import { DateSheet, PeopleSheet, TimeSheet } from '../../tasks/ui/sheets';
import { spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { CallOutcome, LocalFile, MeetingType, NamedOption, Person, PipelineLead, Qualification } from '../types';
import { Card, errorMessage, FieldLabel, FieldRow, InfoLine, LeadHeader, PickField, RadioRow, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

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
  switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 48 },
  switchLabel: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  gap: { height: spacing.md },
  notes: { minHeight: 96, textAlignVertical: 'top' as const },
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
  const submit = async (work: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await work();
      navigation.goBack();
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
  const { saving, error, setError, submit } = useSubmit();
  const [outcome, setOutcome] = useState<CallOutcome>('CONNECTED');
  const [quality, setQuality] = useState<Qualification | null>(null);
  const [comments, setComments] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('10:00');
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  const callLogged = useRef(false);

  // Only a real conversation can tell whether the lead is genuine.
  const askQuality = canQualify && outcome === 'CONNECTED';
  const rejecting = askQuality && quality === 'NOT_GENUINE';

  const onSave = () => {
    const notes = comments.trim();
    if (rejecting && !notes) return setError('Add a note saying why this lead is not genuine.');
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
      if (followUp && !rejecting) await api.addFollowUp(leadId, { date, time, note: notes });
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
  const { leadId, name } = useRoute<RouteProp<LeadStackParamList, 'LeadFollowUp'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { saving, error, submit } = useSubmit();
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('10:00');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);

  return (
    <FormShell
      title="Schedule follow-up"
      subtitle={name}
      error={error}
      submitLabel="Save follow-up"
      saving={saving}
      onSubmit={() => submit(() => api.addFollowUp(leadId, { date, time, note: note.trim() }))}
    >
      <Text style={styles.help}>This creates a reminder task for you on the chosen day.</Text>
      <FieldRow>
        <PickField label="Next follow-up date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
        <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Any time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
      </FieldRow>
      <NotesField label="Note" value={note} onChangeText={setNote} placeholder="What needs to be followed up?" />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} onPick={(t) => { setTime(t); setSheet(null); }} />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------
// Schedule a meeting
// ---------------------------------------------------------------------------

const MEETING_TYPES: Option<MeetingType>[] = [
  { value: 'SITE_VISIT', label: 'Customer site' },
  { value: 'OFFICE', label: 'Our office' },
];

export function LeadMeetingNewScreen() {
  const { leadId, name, address: leadAddress } = useRoute<RouteProp<LeadStackParamList, 'LeadMeetingNew'>>().params;
  const { theme } = useCrmStyles(factory);
  const { myIdNum, persona } = useMe();
  const { saving, error, setError, submit } = useSubmit();
  const [people, setPeople] = useState<Person[]>([]);
  // A sales executive scheduling their own visit is the common case; others must choose.
  const [personId, setPersonId] = useState<number | null>(persona === 'sales' ? myIdNum : null);
  const [date, setDate] = useState(addDays(todayStr(), 1));
  const [time, setTime] = useState<string | null>('11:00');
  const [type, setType] = useState<MeetingType>('SITE_VISIT');
  const [address, setAddress] = useState(leadAddress);
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState<'date' | 'time' | 'person' | null>(null);

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

  const onSave = () => {
    if (!personId) return setError('Choose the sales person for this meeting.');
    if (!time) return setError('Choose a time for the meeting.');
    submit(async () => {
      await api.scheduleMeeting(leadId, { salesEmployeeId: personId, date, time, type, address: address.trim(), notes: notes.trim() });
    });
  };

  return (
    <FormShell title="Schedule meeting" subtitle={name} error={error} submitLabel="Schedule meeting" onSubmit={onSave} saving={saving}>
      <PickField label="Assign to sales person" value={personLabel} placeholder="Choose a sales person" icon={<PersonIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('person')} />
      <FieldRow>
        <PickField label="Meeting date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
        <PickField label="Time" value={time ? fmtTime(time) : null} placeholder="Pick a time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
      </FieldRow>
      <FieldLabel>Meeting location</FieldLabel>
      <SegmentedControl options={MEETING_TYPES} value={type} onChange={setType} />
      <View style={{ height: spacing.md }} />
      {type === 'SITE_VISIT' && <CrmTextField label="Address" value={address} onChangeText={setAddress} placeholder="Customer address" maxLength={255} />}
      <NotesField label="Meeting notes" value={notes} onChangeText={setNotes} placeholder="What should be discussed or inspected?" />

      <PeopleSheet visible={sheet === 'person'} onClose={() => setSheet(null)} people={people} selectedId={personId} meId={myIdNum} title="Sales person" onPick={(p) => { setPersonId(p.id); setSheet(null); }} />
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
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
  const { styles } = useCrmStyles(factory);
  const { saving, error, submit } = useSubmit();
  const [notes, setNotes] = useState('');
  const [lead, setLead] = useState<PipelineLead | null>(null);

  useEffect(() => {
    let alive = true;
    // Only to show what the customer record will contain; converting does not depend on it.
    api
      .getLead(leadId)
      .then((l) => alive && setLead(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leadId]);

  return (
    <FormShell
      title="Convert to customer"
      subtitle={name}
      error={error}
      submitLabel="Convert to customer"
      saving={saving}
      onSubmit={() =>
        submit(async () => {
          await api.convertLead(leadId, notes.trim());
        })
      }
    >
      <Text style={styles.help}>
        This creates a customer record for {name} and closes the lead as converted. It cannot be undone from the app.
      </Text>
      <Text style={styles.section}>NEW CUSTOMER</Text>
      <Card>
        <InfoLine label="Customer" value={name} />
        <InfoLine label="Contact person" value={lead?.contactPerson ?? ''} />
        <InfoLine label="Phone" value={lead?.phone ?? ''} />
        <InfoLine label="Email" value={lead?.email ?? ''} />
        <InfoLine label="Address" value={lead?.address ?? ''} />
      </Card>
      <NotesField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Annual contract agreed" />
    </FormShell>
  );
}

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
