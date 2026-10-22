import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { errorCodes, isErrorWithCode, pick } from '@react-native-documents/picker';
import { getToken } from '../../auth/tokenStorage';
import { CalendarIcon, CameraIcon, ChevronRightIcon, ClockIcon, CloseIcon, DocumentIcon, EmailIcon, GalleryIcon, PhoneIcon } from '../../components/icons';
import { API_BASE_URL } from '../../config/env';
import { formatINR } from '../../crm/format';
import { whatsappUrl } from '../../crm/leadHelpers';
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
import { CheckIcon, EditIcon, PaperclipIcon, RepeatIcon, TrashIcon } from '../../tasks/ui/taskIcons';
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
  // One saved number: tap the row to tick it, the pencil to edit it.
  contactRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.md,
  },
  contactRowOn: { backgroundColor: t.primarySoftBg },
  avatarOn: { backgroundColor: t.surface },
  // The folded "Other numbers" row under the primary number.
  othersRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
  },
  chevron: { fontSize: 26, lineHeight: 28, color: t.primary, paddingHorizontal: spacing.xs },
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: t.primarySoftBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  disabled: { opacity: 0.5 },
  // The "who do you want to call / send to" lists, when more than one number is ticked.
  pickRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: spacing.sm,
  },
  pickRowOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.border },
  radioOn: { borderWidth: 7, borderColor: t.primary },
  sendBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.successBg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  // WhatsApp / Email, side by side under Call Customer.
  reachRow: { flexDirection: 'row' as const, gap: spacing.sm },
  reach: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
  },
  reachWhatsApp: { backgroundColor: t.successBg },
  reachEmail: { backgroundColor: t.primarySoftBg },
  reachText: { ...typography.button, color: t.textPrimary },
  pressed: { opacity: 0.85 },
  body: { ...typography.body, color: t.textPrimary },
  muted: { ...typography.body, color: t.textMuted },
  historyRow: { flexDirection: 'row' as const, gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: t.border },
  dotOn: { backgroundColor: t.primary },
  historyTitle: { ...typography.bodyMedium, color: t.textPrimary },
  file: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  // The file of a "File attached" row: its photo and name together, tap to view
  fileChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginVertical: 6,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.primarySoftBg,
  },
  fileName: { ...typography.bodyMedium, color: t.textPrimary },
  fileHint: { ...typography.caption, color: t.primary },
  fileDelete: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.dangerBg },
  fileGone: { ...typography.caption, color: t.textMuted },
  previewWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' as const },
  previewImg: { width: '100%' as const, height: '80%' as const },
  previewClose: {
    position: 'absolute' as const,
    right: spacing.lg,
    top: spacing.xxl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
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
  // A long list of ticked numbers scrolls inside the sheet; its buttons stay in view below.
  pickList: { flexGrow: 0, maxHeight: 320, marginBottom: spacing.sm },
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

type Dialog = null | 'update' | 'complete' | 'reschedule' | 'contact' | 'attach' | 'pickCall' | 'pickWhatsApp' | 'others';

/**
 * One payment reminder: what is owed, who to call, the notes and the history, with the two
 * things the accountant does after a call - Update Reminder (log the outcome, optionally
 * move the date) and Mark Complete. Every action is an existing Task Management endpoint.
 */

const WHATSAPP_GREEN = '#25D366';

/** WhatsApp's speech-bubble mark, in the icon set's 24x24 style. */
function WhatsAppIcon({ size = 20, color = WHATSAPP_GREEN }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.3 19.7l1.1-3.9A8.2 8.2 0 1 1 8.6 19l-4.3.7z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path
        d="M9.2 8.4c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.6l-.5.6c.4.9 1.2 1.7 2.1 2.1l.6-.5c.2-.1.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3-.1.6-.5.8-.6.3-1.4.4-2.3 0-1.7-.7-3.2-2.2-3.9-3.9-.4-.9-.3-1.7 0-2.3z"
        fill={color}
      />
    </Svg>
  );
}

/** The payment reminder the accountant sends by WhatsApp or email; they can edit it before sending. */
function paymentMessage(contactName: string, customerName: string, amount: number, invoiceNumber: string) {
  const pending = amount > 0 ? `${formatINR(amount)} is pending` : 'a payment is pending';
  const against = invoiceNumber ? ` against invoice ${invoiceNumber}` : '';
  return `Dear ${contactName || 'Sir/Madam'},

This is a gentle reminder from BestServe that ${pending}${against} for ${customerName}. Kindly arrange the payment at the earliest.

Thank you.`;
}

export function ReminderDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();
  const { reminderId } = useRoute<RouteProp<ReminderStackParamList, 'ReminderDetail'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { reminders, invoices, customers, schedules, ready, error, reload, showToast } = useReminders();
  const reminder = reminders.find((r) => r.id === reminderId) || null;

  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [files, setFiles] = useState<TaskAttachment[]>([]);
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
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
  // Add / edit number form (`editing` is the saved number being changed; null when adding)
  const [editing, setEditing] = useState<CustomerContact | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPrimary, setContactPrimary] = useState(false);
  // The ticked numbers Call / WhatsApp / Email use; the primary one is ticked to start with.
  const [selected, setSelected] = useState<string[]>([]);
  // With more than one ticked: the number to call, and the WhatsApp chats already opened.
  const [callId, setCallId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  // Search box in the "Other numbers" sheet
  const [query, setQuery] = useState('');

  const customerId = reminder?.customer_id || '';

  /** Shows a fresh list. Ticks on numbers still there are kept; with none left, the primary is ticked. */
  const applyContacts = useCallback((list: CustomerContact[]) => {
    setContacts(list);
    setSelected((prev) => {
      const kept = prev.filter((id) => list.some((c) => c.id === id));
      if (kept.length) return kept;
      const primary = list.find((c) => c.is_primary) || list[0];
      return primary ? [primary.id] : [];
    });
  }, []);

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
      .then((c) => applyContacts(c.contacts))
      .catch(() => applyContacts([]));
  }, [customerId, applyContacts]);

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
  // In list order, so the primary (listed first) leads.
  const ticked = (contacts || []).filter((c) => selected.includes(c.id));
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
    if (d === 'others') setQuery('');
    if (d === 'contact') {
      setEditing(null);
      setContactName('');
      setContactPhone('');
      setContactPrimary(!contacts?.length);
    }
    setDialog(d);
  }

  function openEdit(c: CustomerContact) {
    setErr('');
    setEditing(c);
    setContactName(c.name);
    setContactPhone(c.phone);
    setContactPrimary(c.is_primary);
    setDialog('contact');
  }

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
    const input = { name: contactName, phone: contactPhone, primary: contactPrimary };
    run(async () => {
      const list = editing
        ? await api.updateCustomerContact(customerId, editing.id, input)
        : await api.addCustomerContact(customerId, input);
      applyContacts(list.contacts);
    }, editing ? 'Contact updated' : 'Number saved');
  }

  const call = (phone: string) =>
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => showToast('Could not open the phone dialer.', 'error'));

  // WhatsApp and email open with the reminder already written, ready to edit and send.
  const customerName = reminder.customer_name || 'your account';
  const invoiceNumber = reminder.scope === 'INVOICE' ? reminder.invoice_number || '' : '';
  const whatsapp = (c: CustomerContact) =>
    Linking.openURL(whatsappUrl(c.phone, paymentMessage(c.name, customerName, outstanding, invoiceNumber))).catch(() =>
      showToast('Could not open WhatsApp on this device.', 'error'),
    );
  // One email to every ticked number that has an email saved; a single person is greeted by name.
  const email = (list: CustomerContact[]) => {
    const to = list.map((c) => c.email).filter(Boolean).join(',');
    const subject = `Payment reminder - ${customerName}${invoiceNumber ? ` (${invoiceNumber})` : ''}`;
    const body = paymentMessage(list.length === 1 ? list[0].name : '', customerName, outstanding, invoiceNumber);
    Linking.openURL(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`).catch(() =>
      showToast('No email app found on this device.', 'error'),
    );
  };

  // One ticked number goes straight through; with more, a call asks which one and
  // WhatsApp lists them, since each opens one number at a time.
  function callTicked() {
    if (ticked.length === 1) return call(ticked[0].phone);
    setCallId(ticked[0].id);
    setDialog('pickCall');
  }
  function whatsAppTicked() {
    if (ticked.length === 1) return whatsapp(ticked[0]);
    setSentIds([]);
    setDialog('pickWhatsApp');
  }
  const reachCount = ticked.length > 1 ? ` (${ticked.length})` : '';

  // The card shows only the ticked numbers (the primary to start with); every other number folds
  // into "Other numbers", so a customer with many numbers doesn't make the card long. With
  // nothing ticked the primary still shows, unticked, so the card is never empty.
  const mainContact = contacts?.find((c) => c.is_primary) || contacts?.[0];
  const topContacts = ticked.length > 0 ? ticked : mainContact ? [mainContact] : [];
  const otherCount = (contacts?.length ?? 0) - topContacts.length;
  // The "Other numbers" sheet lists every number, so ticking one there doesn't make it jump out of the list.
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const sheetContacts = q
    ? (contacts || []).filter((c) => c.name.toLowerCase().includes(q) || (qDigits.length > 0 && c.phone.replace(/\D/g, '').includes(qDigits)))
    : contacts || [];

  /** One saved number: tap the row to tick it, the pencil to edit it. */
  const contactRow = (c: CustomerContact) => {
    const on = selected.includes(c.id);
    return (
      <View key={c.id} style={[styles.contactRow, on && styles.contactRowOn]}>
        <Pressable
          onPress={() => toggle(c.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={`${c.name}, ${c.phone}`}
          style={[styles.row, styles.flex]}
        >
          <View style={[styles.box, on && styles.boxOn]}>{on && <CheckIcon size={16} color="#FFFFFF" />}</View>
          <View style={[styles.avatar, on && styles.avatarOn]}>
            <Text style={styles.avatarText}>{initials(c.name)}</Text>
          </View>
          <View style={styles.flex}>
            <View style={styles.row}>
              <Text style={[styles.value, styles.flex]} numberOfLines={1}>
                {c.name}
              </Text>
              {c.is_primary && <StatusBadge label="Primary" tone="success" dot={false} />}
            </View>
            <Text style={styles.phone}>{c.phone}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => openEdit(c)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${c.name}`}
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
        >
          <EditIcon size={18} color={theme.primary} />
        </Pressable>
      </View>
    );
  };

  // Each "File attached" row shows its file (matched by name, oldest first); a file with no such row
  // (an older upload) is listed under the history instead, so none goes missing.
  const fileOfRow = new Map<TaskHistoryEntry['id'], TaskAttachment>();
  {
    const left = [...files].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const h of history) {
      if (h.action !== 'ATTACH') continue;
      const at = left.findIndex((f) => f.file_name.slice(0, 500) === (h.note || ''));
      if (at >= 0) fileOfRow.set(h.id, left.splice(at, 1)[0]);
    }
  }
  const shownIds = new Set([...fileOfRow.values()].map((f) => f.id));
  const looseFiles = files.filter((f) => !shownIds.has(f.id));
  const isImage = (f: TaskAttachment) => (f.file_type || '').startsWith('image/');
  const viewFile = (f: TaskAttachment) => (isImage(f) ? setPreview(f) : showToast('Only photos can be opened in the app.', 'validation'));
  const fileSource = (f: TaskAttachment) => ({
    uri: `${API_BASE_URL}${tasksApi.attachmentViewPath(task.id, f.id)}`,
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
  // Delete a file (asks first). The server logs "File removed" in the history.
  const removeFile = (f: TaskAttachment) =>
    Alert.alert('Delete this file?', `${f.file_name}

It can't be undone.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => tasksApi.deleteAttachment(task.id, f.id), 'File deleted') },
    ]);
  // Names of files that were removed - their "File attached" rows say so.
  const removedNames = new Set(history.filter((h) => h.action === 'DETACH').map((h) => h.note || ''));
  const fileChip = (f: TaskAttachment) => (
    <Pressable onPress={() => viewFile(f)} accessibilityRole="button" accessibilityLabel={`View ${f.file_name}`} style={({ pressed }) => [styles.fileChip, pressed && styles.pressed]}>
      {isImage(f) && authHeader ? (
        <Image source={fileSource(f)} style={styles.thumb} />
      ) : (
        <View style={styles.thumb}>
          <DocumentIcon size={22} color={theme.primary} />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.fileName} numberOfLines={1}>
          {f.file_name}
        </Text>
        <Text style={styles.fileHint}>
          {formatBytes(f.file_size)}
          {isImage(f) ? '  ·  Tap to view' : ''}
        </Text>
      </View>
      {isImage(f) && <ChevronRightIcon size={16} color={theme.primary} />}
      {reminder.active && (
        <Pressable
          onPress={() => removeFile(f)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${f.file_name}`}
          hitSlop={6}
          style={({ pressed }) => [styles.fileDelete, pressed && styles.pressed]}
        >
          <TrashIcon size={16} color={theme.danger} />
        </Pressable>
      )}
    </Pressable>
  );

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
            <>
              {/* The buttons come first, so a long list of numbers never pushes them off screen. */}
              <Pressable
                onPress={callTicked}
                disabled={ticked.length === 0}
                accessibilityRole="button"
                testID="call-customer"
                style={({ pressed }) => [styles.call, ticked.length === 0 && styles.disabled, pressed && styles.pressed]}
              >
                <PhoneIcon size={20} color="#FFFFFF" />
                <Text style={styles.callText}>Call Customer</Text>
              </Pressable>
              <View style={styles.reachRow}>
                <Pressable
                  onPress={whatsAppTicked}
                  disabled={ticked.length === 0}
                  accessibilityRole="button"
                  testID="whatsapp-customer"
                  style={({ pressed }) => [styles.reach, styles.reachWhatsApp, ticked.length === 0 && styles.disabled, pressed && styles.pressed]}
                >
                  <WhatsAppIcon size={20} />
                  <Text style={styles.reachText}>WhatsApp{reachCount}</Text>
                </Pressable>
                <Pressable
                  onPress={() => email(ticked)}
                  disabled={ticked.length === 0}
                  accessibilityRole="button"
                  testID="email-customer"
                  style={({ pressed }) => [styles.reach, styles.reachEmail, ticked.length === 0 && styles.disabled, pressed && styles.pressed]}
                >
                  <EmailIcon size={20} color={theme.primary} />
                  <Text style={styles.reachText}>Email{reachCount}</Text>
                </Pressable>
              </View>
              {ticked.length === 0 && <Text style={styles.meta}>Tick at least one number to call or message.</Text>}
              {topContacts.map(contactRow)}
              {otherCount > 0 && (
                <Pressable
                  onPress={() => openDialog('others')}
                  accessibilityRole="button"
                  accessibilityLabel={`Other numbers, ${otherCount}`}
                  style={({ pressed }) => [styles.othersRow, pressed && styles.pressed]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{otherCount}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.value}>Other numbers</Text>
                    <Text style={styles.meta}>Tap to choose who to reach</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            </>
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
          {[...history].reverse().map((h, i) => {
            const file = h.action === 'ATTACH' ? fileOfRow.get(h.id) : undefined;
            return (
              <View key={h.id} style={styles.historyRow}>
                <View style={[styles.dot, i === 0 && styles.dotOn]} />
                <View style={styles.flex}>
                  <Text style={styles.historyTitle}>{historyTitle(h)}</Text>
                  {file ? (
                    fileChip(file)
                  ) : h.action === 'ATTACH' ? (
                    // Its file is gone: just the name, and that it was removed.
                    <Text style={styles.fileGone} numberOfLines={1}>
                      {h.note}
                      {removedNames.has(h.note || '') ? '  ·  removed' : ''}
                    </Text>
                  ) : (
                    h.action !== 'UPDATE' && h.action !== 'RESCHEDULE' && !!h.note && <Text style={styles.meta}>{h.note}</Text>
                  )}
                  <Text style={styles.meta}>
                    {fmtTimestamp(h.changed_at)}
                    {h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
          {looseFiles.map((f) => (
            <View key={f.id}>{fileChip(f)}</View>
          ))}
          {reminder.active && (
            <Pressable onPress={() => openDialog('attach')} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.attach, pressed && styles.pressed]}>
              {busy && !dialog ? <ActivityIndicator color={theme.primary} /> : <PaperclipIcon size={18} color={theme.textSecondary} />}
              <Text style={styles.attachText}>Attach photo or file</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)} statusBarTranslucent>
        <SafeAreaView style={styles.previewWrap}>
          {preview && <Image source={fileSource(preview)} style={styles.previewImg} resizeMode="contain" />}
          <Pressable style={styles.previewClose} onPress={() => setPreview(null)} accessibilityRole="button" accessibilityLabel="Close">
            <CloseIcon size={20} color={theme.textPrimary} />
          </Pressable>
        </SafeAreaView>
      </Modal>

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

      <Sheet visible={dialog === 'contact'} onClose={closeDialog} title={editing ? 'Edit contact' : 'Add number'}>
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
          <Text style={[styles.body, styles.flex]}>Primary number (ticked first on every reminder)</Text>
        </Pressable>
        {!!editing && contactPrimary && !editing.is_primary && (
          <Text style={styles.note}>Making this the primary number takes the mark off the current primary.</Text>
        )}
        {!!err && <Text style={styles.error}>{err}</Text>}
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={closeDialog} disabled={busy} />
          <PrimaryButton label={editing ? 'Save Changes' : 'Save Number'} style={styles.flex} onPress={saveContact} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={dialog === 'others'} onClose={() => setDialog(null)} title="Choose numbers">
        <Text style={styles.sheetSub}>Tick who to reach. Only the ticked numbers show on the reminder. Tap the pencil to edit.</Text>
        {(contacts?.length ?? 0) > 5 && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or number"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.field]}
            autoCorrect={false}
            accessibilityLabel="Search numbers"
          />
        )}
        <ScrollView style={styles.pickList} keyboardShouldPersistTaps="handled">
          {sheetContacts.length === 0 ? <Text style={styles.muted}>No number matches that.</Text> : sheetContacts.map(contactRow)}
        </ScrollView>
        <PrimaryButton
          label={ticked.length > 0 ? `Done · ${ticked.length} ticked` : 'Done'}
          onPress={() => setDialog(null)}
        />
      </Sheet>

      <Sheet visible={dialog === 'pickCall'} onClose={() => setDialog(null)} title="Who do you want to call?">
        <Text style={styles.sheetSub}>A call goes to one number at a time.</Text>
        <ScrollView style={styles.pickList}>
        {ticked.map((c) => {
          const on = c.id === callId;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCallId(c.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.pickRow, on && styles.pickRowOn]}
            >
              <View style={[styles.radio, on && styles.radioOn]} />
              <View style={styles.flex}>
                <View style={styles.row}>
                  <Text style={[styles.value, styles.flex]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.is_primary && <StatusBadge label="Primary" tone="success" dot={false} />}
                </View>
                <Text style={styles.phone}>{c.phone}</Text>
              </View>
            </Pressable>
          );
        })}
        </ScrollView>
        <View style={styles.buttons}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={() => setDialog(null)} />
          <PrimaryButton
            label="Call"
            style={styles.flex}
            disabled={!callId}
            onPress={() => {
              const c = ticked.find((x) => x.id === callId);
              setDialog(null);
              if (c) call(c.phone);
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={dialog === 'pickWhatsApp'} onClose={() => setDialog(null)} title="Send on WhatsApp">
        <Text style={styles.sheetSub}>WhatsApp opens one chat at a time. Tap Send for each person, then come back here.</Text>
        <ScrollView style={styles.pickList}>
        {ticked.map((c) => {
          const sent = sentIds.includes(c.id);
          return (
            <View key={c.id} style={styles.pickRow}>
              <View style={styles.flex}>
                <View style={styles.row}>
                  <Text style={[styles.value, styles.flex]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.is_primary && <StatusBadge label="Primary" tone="success" dot={false} />}
                </View>
                <Text style={styles.phone}>{sent ? 'Opened' : c.phone}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setSentIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
                  whatsapp(c);
                }}
                accessibilityRole="button"
                accessibilityLabel={`WhatsApp ${c.name}`}
                style={({ pressed }) => [styles.sendBtn, sent && styles.disabled, pressed && styles.pressed]}
              >
                <WhatsAppIcon size={18} />
                <Text style={styles.reachText}>{sent ? 'Again' : 'Send'}</Text>
              </Pressable>
            </View>
          );
        })}
        </ScrollView>
        <PrimaryButton label="Done" variant="secondary" onPress={() => setDialog(null)} />
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
