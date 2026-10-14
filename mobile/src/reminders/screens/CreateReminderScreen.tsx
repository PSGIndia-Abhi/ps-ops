import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, ClockIcon } from '../../components/icons';
import { formatINR } from '../../crm/format';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { SegmentedControl } from '../../crm/ui/SegmentedControl';
import { fmtTime, todayStr } from '../../tasks/format';
import { errorMessage } from '../../tasks/TasksContext';
import type { TaskPriority } from '../../tasks/types';
import { FieldLabel, inputStyle, PriorityChips, ScreenHeader } from '../../tasks/ui/parts';
import { DateSheet, Sheet, TimeSheet } from '../../tasks/ui/sheets';
import { CheckIcon, ChevronDownIcon, SearchIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { REPEATS, repeatText, recurrenceFor, showDate } from '../format';
import type { ReminderStackParamList } from '../navigation';
import { useReminders } from '../RemindersContext';
import type { ReminderScope, Repeat } from '../types';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  input: inputStyle(t),
  multi: { minHeight: 100, paddingTop: spacing.sm, textAlignVertical: 'top' as const },
  picker: { ...inputStyle(t), flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  pickerText: { ...typography.body, color: t.textPrimary, flex: 1 },
  muted: { color: t.textMuted },
  stats: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
  },
  statLabel: { ...typography.caption, color: t.textSecondary },
  statRed: { ...typography.subtitle, color: t.dangerText },
  statValue: { ...typography.subtitle, color: t.textPrimary },
  note: { ...typography.caption, color: t.warningText, marginTop: spacing.xs },
  invoices: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' as const },
  invoice: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.md, minHeight: 60 },
  invoiceLine: { borderTopWidth: 1, borderTopColor: t.border },
  disabled: { opacity: 0.5 },
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
  invoiceNo: { ...typography.bodyMedium, color: t.textPrimary },
  invoiceDue: { ...typography.caption, color: t.textSecondary },
  amount: { ...typography.bodyMedium, color: t.dangerText },
  chips: { flexDirection: 'row' as const, gap: spacing.xs },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  chipText: { ...typography.captionMedium, fontSize: 14, color: t.textPrimary },
  chipTextOn: { color: t.primary },
  hint: { ...typography.caption, color: t.textSecondary, marginTop: spacing.xs },
  clear: { ...typography.captionMedium, color: t.primary },
  twoCol: { flexDirection: 'row' as const, gap: spacing.sm },
  error: { ...typography.captionMedium, color: t.dangerText, textAlign: 'center' as const },
  footer: { flexDirection: 'row' as const, gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 46, ...typography.body, color: t.textPrimary },
  customerList: { maxHeight: 420 },
  customerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 56, borderRadius: radii.md, paddingHorizontal: spacing.xxs },
  pressedRow: { backgroundColor: t.surfaceAlt },
  empty: { ...typography.body, textAlign: 'center' as const, color: t.textMuted, padding: spacing.lg },
});

const SCOPES: { value: ReminderScope; label: string }[] = [
  { value: 'CUSTOMER', label: 'Entire Customer' },
  { value: 'INVOICE', label: 'Specific Invoice' },
];

/**
 * Create Payment Reminder: for a customer's whole outstanding, or for one or several of
 * their unpaid invoices (each ticked invoice gets its own reminder). Same rules as the web's
 * dialog; the reminder is always assigned to the accountant creating it.
 */
export function CreateReminderScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { userId, customers, reminders, reload, showToast } = useReminders();
  const [customerId, setCustomerId] = useState('');
  const [scope, setScope] = useState<ReminderScope>('CUSTOMER');
  const [picks, setPicks] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<Repeat>('ONCE');
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('10:00');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState<null | 'customer' | 'date' | 'time' | 'end'>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const customer = customers.find((c) => c.id === customerId) || null;
  const repeating = repeat !== 'ONCE';

  // Invoices and customers that already have an open reminder of their own.
  const taken = useMemo(() => {
    const open = reminders.filter((r) => r.active);
    return {
      invoices: new Set(open.filter((r) => r.scope === 'INVOICE').map((r) => r.invoice_id)),
      customers: new Set(open.filter((r) => r.scope === 'CUSTOMER').map((r) => r.customer_id)),
    };
  }, [reminders]);
  const picked = customer ? customer.unpaid.filter((i) => picks.includes(i.id) && !taken.invoices.has(i.id)) : [];
  const shownCustomers = customers.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));

  function problem(): string {
    if (!customer) return 'Please select a customer.';
    if (scope === 'INVOICE' && !picked.length) return 'Please tick at least one invoice.';
    if (!date) return repeating ? 'Please choose the start date.' : 'Please choose the next reminder date.';
    if (date < todayStr()) return "The reminder date can't be in the past.";
    if (repeating && endDate && endDate < date) return "The end date can't be before the start date.";
    return '';
  }

  async function submit() {
    const message = problem();
    if (message) return setErr(message);
    setBusy(true);
    setErr('');
    try {
      const common = { assignedTo: userId, customer: customer!, date: date!, time, priority, notes, repeat, endDate: repeating ? endDate || undefined : undefined };
      if (scope === 'INVOICE') {
        for (const invoice of picked) await api.createReminder({ ...common, invoice });
      } else {
        await api.createReminder(common);
      }
      const count = scope === 'INVOICE' ? picked.length : 1;
      showToast(count > 1 ? `${count} reminders created` : 'Reminder created');
      await reload();
      navigation.goBack();
    } catch (e) {
      // Some of several reminders may already be saved: show what is there now.
      reload();
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScreenHeader title="Create Payment Reminder" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <FieldLabel>Customer</FieldLabel>
            <Pressable style={styles.picker} onPress={() => setSheet('customer')} accessibilityRole="button" testID="pick-customer">
              <Text style={[styles.pickerText, !customer && styles.muted]} numberOfLines={1}>
                {customer ? customer.name : 'Select customer'}
              </Text>
              <ChevronDownIcon size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {!!customer && (
            <View style={styles.stats}>
              <View style={styles.flex}>
                <Text style={styles.statLabel}>Outstanding Amount</Text>
                <Text style={styles.statRed}>{formatINR(customer.outstanding)}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.statLabel}>Pending Invoices</Text>
                <Text style={styles.statValue}>
                  {customer.unpaid.length} invoice{customer.unpaid.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          )}

          <View>
            <FieldLabel>Reminder For</FieldLabel>
            <SegmentedControl options={SCOPES} value={scope} onChange={setScope} />
            {scope === 'CUSTOMER' && !!customer && taken.customers.has(customer.id) && (
              <Text style={styles.note}>This customer already has an open reminder.</Text>
            )}
          </View>

          {scope === 'INVOICE' && !!customer && (
            <View>
              <FieldLabel required>Select Invoices</FieldLabel>
              <View style={styles.invoices}>
                {customer.unpaid.map((inv, i) => {
                  const has = taken.invoices.has(inv.id);
                  const on = picks.includes(inv.id) && !has;
                  return (
                    <Pressable
                      key={inv.id}
                      disabled={has}
                      onPress={() => setPicks((p) => (p.includes(inv.id) ? p.filter((x) => x !== inv.id) : [...p, inv.id]))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: has }}
                      style={[styles.invoice, i > 0 && styles.invoiceLine, has && styles.disabled]}
                    >
                      <View style={[styles.box, on && styles.boxOn]}>{on && <CheckIcon size={16} color="#FFFFFF" />}</View>
                      <View style={styles.flex}>
                        <Text style={styles.invoiceNo}>{inv.invoice_number}</Text>
                        <Text style={styles.invoiceDue}>{has ? 'Already has a reminder' : `Due ${showDate(inv.due_date)}`}</Text>
                      </View>
                      <Text style={styles.amount}>{formatINR(inv.pending_amount)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View>
            <FieldLabel>Repeat</FieldLabel>
            <View style={styles.chips}>
              {REPEATS.map((r) => {
                const on = r.value === repeat;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setRepeat(r.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {repeat !== 'ONCE' && !!date && <Text style={styles.hint}>{repeatText(recurrenceFor(repeat, date, time))}</Text>}
          </View>

          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <FieldLabel required>{repeating ? 'Start Date' : 'Next Reminder Date'}</FieldLabel>
              <Pressable style={styles.picker} onPress={() => setSheet('date')} accessibilityRole="button" testID="pick-date">
                <CalendarIcon size={18} color={theme.textSecondary} />
                <Text style={[styles.pickerText, !date && styles.muted]}>{date ? showDate(date) : 'Select date'}</Text>
              </Pressable>
            </View>
            <View style={styles.flex}>
              <FieldLabel required>Time</FieldLabel>
              <Pressable style={styles.picker} onPress={() => setSheet('time')} accessibilityRole="button">
                <ClockIcon size={18} color={theme.textSecondary} />
                <Text style={styles.pickerText}>{fmtTime(time)}</Text>
              </Pressable>
            </View>
          </View>

          {repeating && (
            <View>
              <FieldLabel>Ends (optional)</FieldLabel>
              <Pressable style={styles.picker} onPress={() => setSheet('end')} accessibilityRole="button">
                <CalendarIcon size={18} color={theme.textSecondary} />
                <Text style={[styles.pickerText, !endDate && styles.muted]}>{endDate ? showDate(endDate) : 'No end date'}</Text>
                {!!endDate && (
                  <Text style={styles.clear} onPress={() => setEndDate(null)}>
                    Clear
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          <View>
            <FieldLabel>Priority</FieldLabel>
            <PriorityChips value={priority} onChange={setPriority} />
          </View>

          <View>
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Customer asked to call back about the pending amount"
              placeholderTextColor={theme.textMuted}
              style={[styles.input, styles.multi]}
              maxLength={1000}
              multiline
            />
          </View>

          {!!err && <Text style={styles.error}>{err}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={() => navigation.goBack()} disabled={busy} />
          <PrimaryButton label={picked.length > 1 && scope === 'INVOICE' ? `Create ${picked.length} Reminders` : 'Create Reminder'} style={styles.flex} onPress={submit} loading={busy} testID="save-reminder" />
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={sheet === 'customer'} onClose={() => setSheet(null)} title="Select customer">
        <View style={styles.search}>
          <SearchIcon size={18} color={theme.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search customers..." placeholderTextColor={theme.textMuted} style={styles.searchInput} />
        </View>
        <ScrollView style={styles.customerList} keyboardShouldPersistTaps="handled">
          {shownCustomers.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                setCustomerId(c.id);
                setPicks([]);
                setSheet(null);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.customerRow, pressed && styles.pressedRow]}
            >
              <View style={styles.flex}>
                <Text style={styles.invoiceNo} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.invoiceDue}>
                  {c.unpaid.length} pending invoice{c.unpaid.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.amount}>{formatINR(c.outstanding)}</Text>
            </Pressable>
          ))}
          {shownCustomers.length === 0 && (
            <Text style={styles.empty}>{customers.length ? `No customer matches “${q}”.` : 'No customer has an outstanding amount.'}</Text>
          )}
        </ScrollView>
      </Sheet>
      <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} onPick={setDate} minDate={todayStr()} />
      <DateSheet visible={sheet === 'end'} onClose={() => setSheet(null)} value={endDate} onPick={setEndDate} minDate={date || todayStr()} title="Last reminder date" />
      <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} onPick={(t) => setTime(t || '10:00')} allowNone={false} />
    </SafeAreaView>
  );
}
