import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { errorCodes, isErrorWithCode, pick } from '@react-native-documents/picker';
import { getToken } from '../../auth/tokenStorage';
import { CalendarIcon, CameraIcon, ClockIcon, DocumentIcon, GalleryIcon, PhoneIcon } from '../../components/icons';
import { API_BASE_URL } from '../../config/env';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import * as tasksApi from '../../tasks/api';
import { fmtTime, fmtTimestamp, formatBytes, initials, todayStr } from '../../tasks/format';
import { errorMessage } from '../../tasks/TasksContext';
import type { TaskAttachment, TaskHistoryEntry } from '../../tasks/types';
import { FieldLabel, inputStyle, ScreenHeader } from '../../tasks/ui/parts';
import { ActionSheet, DateSheet, Sheet, TimeSheet } from '../../tasks/ui/sheets';
import { CheckIcon, PaperclipIcon, RepeatIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { OUTCOMES, reminderFor, repeatText, showDate, showDue, STATUS_META, type OutcomeKey } from '../format';
import type { ReminderStackParamList } from '../navigation';
import { useReminders } from '../RemindersContext';
import type { CustomerContact } from '../types';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...t.cardShadow,
  },
  name: { ...typography.subtitle, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textSecondary },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  amounts: { flexDirection: 'row' as const, gap: spacing.sm },
  label: { ...typography.caption, color: t.textSecondary },
  value: { ...typography.bodyMedium, color: t.textPrimary },
  green: { color: t.successText },
  red: { color: t.dangerText },
  line: { height: 1, backgroundColor: t.border },
  due: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  link: { ...typography.bodyMedium, color: t.primary },
  cardTitle: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...typography.bodyMedium, color: t.primary },
  phone: { ...typography.caption, color: t.textSecondary },
  call: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: t.success,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  callText: { ...typography.button, color: '#FFFFFF' },
  callSmall: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: t.successBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: { opacity: 0.85 },
  body: { ...typography.body, color: t.textPrimary },
  muted: { ...typography.body, color: t.textMuted },
  historyRow: { flexDirection: 'row' as const, gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: t.border },
  dotOn: { backgroundColor: t.primary },
  historyTitle: { ...typography.bodyMedium, color: t.textPrimary },
  file: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  attach: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: t.border,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  attachText: { ...typography.bodyMedium, color: t.textSecondary },
  footer: { flexDirection: 'row' as const, gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  sheetScroll: { flexGrow: 0 },
  sheetSub: { ...typography.caption, color: t.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.md },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  chipOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  chipText: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary },
  chipTextOn: { color: t.primary },
  input: inputStyle(t),
  multi: { minHeight: 90, paddingTop: spacing.sm, textAlignVertical: 'top' as const },
  field: { marginBottom: spacing.md },
  twoCol: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.md },
  picker: { ...inputStyle(t), flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  pickerText: { ...typography.body, color: t.textPrimary, flex: 1 },
  placeholder: { color: t.textMuted },
  note: { ...typography.caption, color: t.warningText, marginBottom: spacing.md },
  error: { ...typography.captionMedium, color: t.dangerText, marginBottom: spacing.sm },
  buttons: { flexDirection: 'row' as const, gap: spacing.sm },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  boxOn: { backgroundColor: t.primary, borderColor: t.primary },
});

// Same wording as the web's reminder History. An UPDATE shows its own note (the call outcome) instead.
const HISTORY_LABEL: Record<string, string> = {
  CREATE: 'Reminder created',
  START: 'Started',
  UPDATE: 'Update',
  RESCHEDULE: 'Rescheduled',
  COMPLETE: 'Completed',
  REOPEN: 'Reopened',
  ATTACH: 'File attached',
  DETACH: 'File removed',
  PAUSE: 'Paused',
  RESUME: 'Resumed',
  REASSIGN: 'Reassigned',
  EDIT: 'Edited',
  CANCEL: 'Cancelled',
};

/** An update shows its own note (the call outcome); a reschedule shows where the date went. */
function historyTitle(h: TaskHistoryEntry): string {
  if (h.action === 'UPDATE' && h.note) return h.note;
  const moved = h.action === 'RESCHEDULE' ? /moved to (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(h.note || '') : null;
  if (moved) return `Due date moved to ${showDue(moved[1], moved[2])}`;
  return HISTORY_LABEL[h.action] || h.action;
}

type Dialog = null | 'update' | 'complete' | 'reschedule' | 'contact' | 'attach';

/**
 * One payment reminder: what is owed, who to call, the notes and the history, with the two
 * things the accountant does after a call - Update Reminder (log the outcome, optionally
 * move the date) and Mark Complete. Every action is an existing Task Management endpoint.
 */
export function ReminderDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();
  const { reminderId } = useRoute<RouteProp<ReminderStackParamList, 'ReminderDetail'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { reminders, invoices, customers, schedules, ready, error, reload, showToast } = useReminders();
  const reminder = reminders.find((r) => r.id === reminderId) || null;

  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [files, setFiles] = useState<TaskAttachment[]>([]);
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [picker, setPicker] = useState<null | 'date' | 'time'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Update Reminder / Reschedule form
  const [outcome, setOutcome] = useState<OutcomeKey | null>(null);
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('10:00');
  // Mark Complete form
  const [closing, setClosing] = useState('');
  // Add number form
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPrimary, setContactPrimary] = useState(false);

  const customerId = reminder?.customer_id || '';

  const loadActivity = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([tasksApi.listHistory(reminderId), tasksApi.listAttachments(reminderId)]);
      setHistory(h);
      setFiles(f);
    } catch {
      // The reminder itself still shows; History just stays as it was.
    }
  }, [reminderId]);

  useEffect(() => {
    loadActivity();
    getToken().then((token) => setAuthHeader(token ? `Bearer ${token}` : null));
  }, [loadActivity]);

  useEffect(() => {
    if (!customerId) return;
    api
      .getCustomerContacts(customerId)
      .then((c) => setContacts(c.contacts))
      .catch(() => setContacts([]));
  }, [customerId]);

  if (!reminder) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Payment Reminder" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          {ready ? <CrmEmptyState title="Reminder not found" subtitle={error || 'It may have been removed.'} /> : <ActivityIndicator color={theme.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  const task = reminder.task;
  const invoice = reminder.scope === 'INVOICE' ? invoices.find((i) => i.id === reminder.invoice_id) : undefined;
  const customer = customers.find((c) => c.id === reminder.customer_id);
  const outstanding = reminder.scope === 'INVOICE' ? invoice?.pending_amount ?? 0 : customer?.outstanding ?? 0;
  const schedule = reminder.series_id ? schedules.find((s) => s.id === reminder.series_id) : undefined;
  const status = STATUS_META[reminder.display_status];
  const primary = contacts?.[0];
  const updates = history.filter((h) => h.action === 'UPDATE').length;
  const picked = OUTCOMES.find((o) => o.key === outcome);

  function openDialog(d: Dialog) {
    setErr('');
    if (d === 'update' || d === 'reschedule') {
      setOutcome(null);
      setOther('');
      setNotes('');
      // Start from the current date; a date already gone starts from today.
      setDate(reminder!.due_date && reminder!.due_date >= todayStr() ? reminder!.due_date : todayStr());
      setTime(reminder!.due_time || '10:00');
    }
    if (d === 'complete') setClosing('');
    if (d === 'contact') {
      setContactName('');
      setContactPhone('');
      setContactPrimary(!contacts?.length);
    }
    setDialog(d);
  }

  /** Runs one action, then shows what the server has now. */
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setErr('');
    try {
      await action();
      setDialog(null);
      showToast(done);
    } catch (e) {
      setErr(errorMessage(e));
      if (!dialog) showToast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      // Also after a failure: an action made of two steps may have saved the first.
      reload();
      loadActivity();
    }
  }

  function saveUpdate() {
    if (!outcome) return setErr('Please choose the call outcome.');
    if (outcome === 'OTHER' && !other.trim()) return setErr('Please type the outcome.');
    const moves = picked!.date ? date : null;
    if (moves && moves < todayStr()) return setErr("The next reminder date can't be in the past.");
    run(() => api.recordOutcome(task, { outcome, other, notes, date: moves, time: moves ? time : null }), 'Reminder updated');
  }

  function saveReschedule() {
    if (!date) return;
    run(() => tasksApi.rescheduleTask(task.id, date, time), `Moved to ${showDue(date, time)}`);
  }

  function saveComplete() {
    if (outstanding > 0 && !closing.trim()) return setErr('Please say why you are closing it while money is still outstanding.');
    run(() => api.completeReminder(task, closing), 'Reminder completed');
  }

  function saveContact() {
    if (!contactName.trim()) return setErr('Please enter the contact name.');
    if (contactPhone.replace(/\D/g, '').length < 10) return setErr('Enter a valid phone number (at least 10 digits).');
    run(async () => {
      const list = await api.addCustomerContact(customerId, { name: contactName, phone: contactPhone, primary: contactPrimary });
      setContacts(list.contacts);
    }, 'Number saved');
  }

  const call = (phone: string) =>
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => showToast('Could not open the phone dialer.', 'error'));

  // A file can only be added to a started reminder, so an open one is started first (as Update Reminder does).
  const upload = (file: { uri: string; name: string; type: string } | null) => {
    if (!file) return;
    run(async () => {
      await api.ensureInProgress(task);
      await tasksApi.uploadAttachment(task.id, file);
    }, 'File attached');
  };
  const fromPicker = (res: ImagePickerResponse) => {
    const a = res.assets?.[0];
    return a?.uri ? { uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, type: a.type || 'image/jpeg' } : null;
  };
  async function pickCamera() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return showToast('Camera permission was denied.', 'permission');
    }
    upload(fromPicker(await launchCamera({ mediaType: 'photo', quality: 0.7, maxWidth: 1920, maxHeight: 1920 })));
  }
  async function pickGallery() {
    upload(fromPicker(await launchImageLibrary({ mediaType: 'photo', quality: 0.7, maxWidth: 1920, maxHeight: 1920, selectionLimit: 1 })));
  }
  async function pickDocument() {
    try {
      const [r] = await pick();
      upload({ uri: r.uri, name: r.name || `file-${Date.now()}`, type: r.type || 'application/octet-stream' });
    } catch (e) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) showToast('Could not open the file picker.', 'error');
    }
  }

  const dateTimeFields = (
    <View style={styles.twoCol}>
      <View style={styles.flex}>
        <FieldLabel>Next Reminder Date</FieldLabel>
        <Pressable style={styles.picker} onPress={() => setPicker('date')} accessibilityRole="button">
          <CalendarIcon size={18} color={theme.textSecondary} />
          <Text style={styles.pickerText}>{showDate(date)}</Text>
        </Pressable>
      </View>
      <View style={styles.flex}>
        <FieldLabel required>Time</FieldLabel>
        <Pressable style={styles.picker} onPress={() => setPicker('time')} accessibilityRole="button">
          <ClockIcon size={18} color={theme.textSecondary} />
          <Text style={styles.pickerText}>{fmtTime(time)}</Text>
        </Pressable>
      </View>
    </View>
  );
  const sheetSub = `${reminderFor(reminder)} · ${formatINR(outstanding)} pending`;
  const closeDialog = () => !busy && setDialog(null);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Payment Reminder" onBack={() => navigation.goBack()} right={<StatusBadge label={status.label} tone={status.tone} dot={false} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View>
            <Text style={styles.name}>{reminder.customer_name || 'Customer'}</Text>
            <Text style={styles.meta}>
              {reminderFor(reminder)} · {reminder.priority === 'HIGH' ? 'High' : reminder.priority === 'LOW' ? 'Low' : 'Normal'} priority
            </Text>
          </View>
          {reminder.scope === 'INVOICE' ? (
            <View style={styles.amounts}>
              <View style={styles.flex}>
                <Text style={styles.label}>Invoice</Text>
                <Text style={styles.value}>{invoice ? formatINR(invoice.invoice_amount) : '—'}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Paid</Text>
                <Text style={[styles.value, styles.green]}>{invoice ? formatINR(invoice.paid_amount) : '—'}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Pending</Text>
                <Text style={[styles.value, styles.red]}>{invoice ? formatINR(invoice.pending_amount) : '—'}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.amounts}>
              <View style={styles.flex}>
                <Text style={styles.label}>Total Outstanding</Text>
                <Text style={[styles.value, styles.red]}>{formatINR(outstanding)}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Pending Invoices</Text>
                <Text style={styles.value}>{customer?.unpaid.length ?? 0}</Text>
              </View>
            </View>
          )}
          <View style={styles.line} />
          <View style={styles.row}>
            <ClockIcon size={18} color={theme.textSecondary} />
            <Text style={styles.due}>
              {reminder.status === 'COMPLETED' ? `Completed ${fmtTimestamp(reminder.completed_at)}` : showDue(reminder.due_date, reminder.due_time)}
            </Text>
            {reminder.active && (
              <Text style={styles.link} onPress={() => openDialog('reschedule')} accessibilityRole="button">
                Reschedule
              </Text>
            )}
          </View>
          {!!schedule && (
            <View style={styles.row}>
              <RepeatIcon size={16} color={theme.accent} />
              <Text style={styles.meta}>{repeatText(schedule)}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Who to call</Text>
            {!!customerId && (
              <Text style={styles.link} onPress={() => openDialog('contact')} accessibilityRole="button">
                Add number
              </Text>
            )}
          </View>
          {contacts === null ? (
            <ActivityIndicator color={theme.primary} />
          ) : contacts.length === 0 ? (
            <Text style={styles.muted}>No phone number saved for this customer yet.</Text>
          ) : (
            contacts.map((c, i) => (
              <View key={c.id} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(c.name)}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.row}>
                    <Text style={styles.value} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {c.is_primary && <StatusBadge label="Primary" tone="success" dot={false} />}
                  </View>
                  <Text style={styles.phone}>{c.phone}</Text>
                </View>
                {i > 0 && (
                  <Pressable onPress={() => call(c.phone)} accessibilityRole="button" accessibilityLabel={`Call ${c.name}`} style={({ pressed }) => [styles.callSmall, pressed && styles.pressed]}>
                    <PhoneIcon size={20} color={theme.successText} />
                  </Pressable>
                )}
              </View>
            ))
          )}
          {!!primary && (
            <Pressable onPress={() => call(primary.phone)} accessibilityRole="button" testID="call-customer" style={({ pressed }) => [styles.call, pressed && styles.pressed]}>
              <PhoneIcon size={20} color="#FFFFFF" />
              <Text style={styles.callText}>Call Customer</Text>
            </Pressable>
          )}
        </View>

        {!!reminder.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.body}>{reminder.notes}</Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>History</Text>
            <Text style={styles.meta}>
              {updates} update{updates === 1 ? '' : 's'} · {files.length} file{files.length === 1 ? '' : 's'}
            </Text>
          </View>
          {[...history].reverse().map((h, i) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={[styles.dot, i === 0 && styles.dotOn]} />
              <View style={styles.flex}>
                <Text style={styles.historyTitle}>{historyTitle(h)}</Text>
                {h.action !== 'UPDATE' && h.action !== 'RESCHEDULE' && !!h.note && <Text style={styles.meta}>{h.note}</Text>}
                <Text style={styles.meta}>
                  {fmtTimestamp(h.changed_at)}
                  {h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                </Text>
              </View>
            </View>
          ))}
          {files.map((f) => (
            <View key={f.id} style={styles.file}>
              {(f.file_type || '').startsWith('image/') && authHeader ? (
                <Image
                  source={{ uri: `${API_BASE_URL}${tasksApi.attachmentViewPath(task.id, f.id)}`, headers: { Authorization: authHeader } }}
                  style={styles.thumb}
                />
              ) : (
                <View style={styles.thumb}>
                  <DocumentIcon size={22} color={theme.primary} />
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.value} numberOfLines={1}>
                  {f.file_name}
                </Text>
                <Text style={styles.meta}>{formatBytes(f.file_size)}</Text>
              </View>
            </View>
          ))}
          {reminder.active && (
            <Pressable onPress={() => openDialog('attach')} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.attach, pressed && styles.pressed]}>
              {busy && !dialog ? <ActivityIndicator color={theme.primary} /> : <PaperclipIcon size={18} color={theme.textSecondary} />}
              <Text style={styles.attachText}>Attach photo or file</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {reminder.active ? (
        <View style={styles.footer}>
          <PrimaryButton label="Update Reminder" variant="secondary" style={styles.flex} onPress={() => openDialog('update')} testID="update-reminder" />
          <PrimaryButton label="Mark Complete" style={styles.flex} onPress={() => openDialog('complete')} testID="complete-reminder" />
        </View>
      ) : reminder.status === 'COMPLETED' ? (
        <View style={styles.footer}>
          <PrimaryButton label="Reopen Reminder" variant="secondary" style={styles.flex} loading={busy} onPress={() => run(() => api.reopenReminder(task.id), 'Reminder reopened')} />
        </View>
      ) : null}

      <Sheet visible={dialog === 'update'} onClose={closeDialog} title="Update Reminder">
        <Text style={styles.sheetSub}>
          {reminder.customer_name} · {sheetSub}
        </Text>
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <FieldLabel required>Call Outcome</FieldLabel>
          <View style={styles.chips}>
            {OUTCOMES.map((o) => {
              const on = o.key === outcome;
              return (
                <Pressable key={o.key} onPress={() => setOutcome(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                  {on && <CheckIcon size={14} color={theme.primary} />}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {outcome === 'OTHER' && (
            <View style={styles.field}>
              <FieldLabel required>Outcome</FieldLabel>
              <TextInput value={other} onChangeText={setOther} placeholder="What did the customer say?" placeholderTextColor={theme.textMuted} style={styles.input} maxLength={100} />
            </View>
          )}
          {picked?.date !== false && dateTimeFields}
          <View style={styles.field}>
            <FieldLabel>Notes / Remarks</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Cheque will be ready on the 14th."
              placeholderTextColor={theme.textMuted}
              style={[styles.input, styles.multi]}
              maxLength={500}
              multiline
            />
          </View>
        </ScrollView>
        {!!err && <Text style={styles.error}>{err}</Text>}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={closeDialog} disabled={busy} />
          <PrimaryButton label="Save Update" style={styles.flex} onPress={saveUpdate} loading={busy} testID="save-update" />
        </View>
      </Sheet>

      <Sheet visible={dialog === 'reschedule'} onClose={closeDialog} title="Reschedule Reminder">
        {dateTimeFields}
        {!!err && <Text style={styles.error}>{err}</Text>}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={closeDialog} disabled={busy} />
          <PrimaryButton label="Save" style={styles.flex} onPress={saveReschedule} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={dialog === 'complete'} onClose={closeDialog} title="Complete Reminder">
        <Text style={styles.note}>
          {outstanding > 0
            ? `${formatINR(outstanding)} is still outstanding. Use Update Reminder to set a new date instead, or give a closing reason.`
            : 'The outstanding is cleared.'}
        </Text>
        <View style={styles.field}>
          <FieldLabel required={outstanding > 0}>{outstanding > 0 ? 'Closing Note' : 'Closing Note (optional)'}</FieldLabel>
          <TextInput
            value={closing}
            onChangeText={setClosing}
            placeholder="e.g. Customer settled the amount"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.multi]}
            maxLength={1000}
            multiline
          />
        </View>
        {!!err && <Text style={styles.error}>{err}</Text>}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={closeDialog} disabled={busy} />
          <PrimaryButton label="Complete" style={styles.flex} onPress={saveComplete} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={dialog === 'contact'} onClose={closeDialog} title="Add number">
        <View style={styles.field}>
          <FieldLabel required>Contact Name</FieldLabel>
          <TextInput value={contactName} onChangeText={setContactName} placeholder="e.g. Ramesh Kumar" placeholderTextColor={theme.textMuted} style={styles.input} maxLength={150} />
        </View>
        <View style={styles.field}>
          <FieldLabel required>Phone Number</FieldLabel>
          <TextInput
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </View>
        <Pressable onPress={() => setContactPrimary((p) => !p)} accessibilityRole="checkbox" accessibilityState={{ checked: contactPrimary }} style={[styles.row, styles.field]}>
          <View style={[styles.box, contactPrimary && styles.boxOn]}>{contactPrimary && <CheckIcon size={16} color="#FFFFFF" />}</View>
          <Text style={styles.body}>Primary number (the one Call Customer dials)</Text>
        </Pressable>
        {!!err && <Text style={styles.error}>{err}</Text>}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={closeDialog} disabled={busy} />
          <PrimaryButton label="Save Number" style={styles.flex} onPress={saveContact} loading={busy} />
        </View>
      </Sheet>

      <ActionSheet
        visible={dialog === 'attach'}
        onClose={() => setDialog(null)}
        title="Attach a file"
        actions={[
          { key: 'cam', label: 'Take a photo', icon: <CameraIcon size={18} color={theme.primary} />, onPress: pickCamera },
          { key: 'gal', label: 'Choose from gallery', icon: <GalleryIcon size={18} color={theme.primary} />, onPress: pickGallery },
          { key: 'doc', label: 'Pick a document', icon: <DocumentIcon size={18} color={theme.primary} />, onPress: pickDocument },
        ]}
      />

      <DateSheet visible={picker === 'date'} onClose={() => setPicker(null)} value={date} onPick={setDate} minDate={todayStr()} title="Next reminder date" />
      <TimeSheet visible={picker === 'time'} onClose={() => setPicker(null)} value={time} onPick={(t) => setTime(t || '10:00')} allowNone={false} />
    </SafeAreaView>
  );
}
