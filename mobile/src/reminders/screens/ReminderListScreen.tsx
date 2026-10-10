import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BellIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { errorMessage } from '../../tasks/TasksContext';
import { Sheet } from '../../tasks/ui/sheets';
import { RepeatIcon } from '../../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { byDue, repeatText, showDate, showDue } from '../format';
import type { ReminderListTab, ReminderStackParamList, ReminderTabParamList } from '../navigation';
import { useReminders } from '../RemindersContext';
import { REMINDER_MODULE, type Reminder, type ReminderSchedule } from '../types';
import { ReminderCard } from '../ui';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { ...typography.title, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  tabs: { flexGrow: 0, marginTop: spacing.md },
  tabsContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  tab: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tabOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  tabText: { ...typography.captionMedium, fontSize: 14, color: t.textSecondary },
  tabTextOn: { color: t.primary },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  intro: { ...typography.body, color: t.textSecondary, marginBottom: spacing.xs },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  body: { flex: 1, gap: 2 },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textSecondary },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: t.accentBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rule: { ...typography.bodyMedium, color: t.textPrimary, backgroundColor: t.surfaceAlt, borderRadius: radii.md, padding: spacing.sm },
  factLabel: { ...typography.caption, color: t.textMuted },
  factValue: { ...typography.bodyMedium, color: t.textPrimary },
  stop: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: t.danger,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stopText: { ...typography.button, color: t.dangerText },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.lg },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
});

// Same tabs as the web's Tasks & Reminders page (Repeating has its own bottom tab here).
const TABS: { key: ReminderListTab; label: string; test: (r: Reminder) => boolean }[] = [
  { key: 'ALL', label: 'All', test: () => true },
  { key: 'TODAY', label: 'Today', test: (r) => r.active && r.display_status === 'TODAY' },
  { key: 'OVERDUE', label: 'Overdue', test: (r) => r.active && r.display_status === 'OVERDUE' },
  { key: 'UPCOMING', label: 'Upcoming', test: (r) => r.active && r.display_status === 'UPCOMING' },
  { key: 'COMPLETED', label: 'Completed', test: (r) => r.status === 'COMPLETED' },
];

/** Live outstanding per reminder: the invoice's pending, or the customer's total pending. */
export function useOutstandingOf(): (r: Reminder) => number {
  const { invoices, customers } = useReminders();
  return useMemo(() => {
    const byInvoice = new Map(invoices.map((i) => [i.id, i.pending_amount]));
    const byCustomer = new Map(customers.map((c) => [c.id, c.outstanding]));
    return (r: Reminder) => (r.scope === 'INVOICE' ? byInvoice.get(r.invoice_id) ?? 0 : byCustomer.get(r.customer_id) ?? 0);
  }, [invoices, customers]);
}

/** The Reminders tab: every payment reminder, under All / Today / Overdue / Upcoming / Completed. */
export function ReminderListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();
  const params = useRoute<RouteProp<ReminderTabParamList, 'Reminders'>>().params;
  const { styles, theme } = useCrmStyles(factory);
  const { reminders, ready, refreshing, error, reload } = useReminders();
  const outstandingOf = useOutstandingOf();
  const [tab, setTab] = useState<ReminderListTab>(params?.tab ?? 'ALL');

  // A Home tile opens the list on its tab, also when the list was already open on another one.
  useEffect(() => {
    if (params?.tab) setTab(params.tab);
  }, [params?.tab, params?.at]);

  const counts = useMemo(() => {
    const out = {} as Record<ReminderListTab, number>;
    for (const t of TABS) out[t.key] = reminders.filter(t.test).length;
    return out;
  }, [reminders]);

  // Open ones first, soonest due on top; finished ones after.
  const rows = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    return reminders.filter(test).sort((a, b) => (a.active === b.active ? (a.active ? byDue(a, b) : byDue(b, a)) : a.active ? -1 : 1));
  }, [reminders, tab]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Reminders</Text>
        <Text style={styles.sub}>Payment reminders for your customers and invoices</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {t.label}
                {ready ? ` (${counts[t.key]})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReminderCard reminder={item} outstanding={outstandingOf(item)} onPress={() => navigation.navigate('ReminderDetail', { reminderId: item.id })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.primary} colors={[theme.primary]} />}
          ListHeaderComponent={<CrmErrorBanner message={error} onRetry={reload} />}
          ListEmptyComponent={
            error ? undefined : (
              <CrmEmptyState
                icon={<BellIcon size={30} color={theme.textMuted} />}
                title={tab === 'ALL' ? 'No reminders yet' : 'Nothing here'}
                subtitle={tab === 'ALL' ? 'Tap + to create a reminder for a customer or an invoice.' : 'No reminders match this tab right now.'}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

type ScheduleRow = ReminderSchedule & { customer_name: string; invoice_number: string; reminder: Reminder | null };

/** The Repeating tab: the schedules that keep a reminder coming back, each with Open and Stop. */
export function RepeatingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ReminderStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { invoices, reminders, schedules, ready, refreshing, error, reload, showToast } = useReminders();
  const [stopping, setStopping] = useState<ScheduleRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Who each schedule is for (from the invoices already loaded) and the reminder it keeps going.
  const rows = useMemo<ScheduleRow[]>(() => {
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const customerName = new Map(invoices.map((i) => [i.customer_id, i.customer_name]));
    return schedules.map((s) => {
      const inv = s.source_module === REMINDER_MODULE.INVOICE ? invoiceById.get(String(s.source_id)) : undefined;
      return {
        ...s,
        reminder: reminders.find((r) => r.series_id === s.id && r.active) || null,
        customer_name: inv?.customer_name || customerName.get(String(s.source_id)) || s.title.replace(/^Payment (Reminder|Follow-up) - /, ''),
        invoice_number: inv?.invoice_number || '',
      };
    });
  }, [schedules, invoices, reminders]);

  async function stop() {
    if (!stopping) return;
    setBusy(true);
    try {
      await api.stopSchedule(stopping.id);
      showToast(`The repeating reminder for ${stopping.invoice_number || stopping.customer_name} was stopped.`);
      setStopping(null);
      await reload();
    } catch (err) {
      setStopping(null);
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const renderSchedule = ({ item: s }: { item: ScheduleRow }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <RepeatIcon size={22} color={theme.accent} />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {s.customer_name}
          </Text>
          <Text style={styles.meta}>{s.invoice_number ? `Invoice ${s.invoice_number}` : 'Entire customer'}</Text>
        </View>
      </View>
      <Text style={styles.rule}>{repeatText(s)}</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.factLabel}>Reminder due</Text>
          <Text style={styles.factValue}>
            {s.reminder ? showDue(s.reminder.due_date, s.reminder.due_time) : s.next_occurrence_date ? showDue(s.next_occurrence_date, s.time_of_day) : '—'}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.factLabel}>Ends</Text>
          <Text style={styles.factValue}>{s.end_type === 'ON_DATE' && s.end_date ? showDate(s.end_date) : 'No end date'}</Text>
        </View>
      </View>
      <View style={styles.row}>
        {!!s.reminder && (
          <PrimaryButton label="Open" variant="secondary" style={styles.flex} onPress={() => navigation.navigate('ReminderDetail', { reminderId: s.reminder!.id })} />
        )}
        <Pressable onPress={() => setStopping(s)} accessibilityRole="button" style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.sub}>Payment Reminders</Text>
        <Text style={styles.title}>Repeating</Text>
      </View>

      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          renderItem={renderSchedule}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.primary} colors={[theme.primary]} />}
          ListHeaderComponent={
            <>
              <CrmErrorBanner message={error} onRetry={reload} />
              {rows.length > 0 && (
                <Text style={styles.intro}>
                  {rows.length} schedule{rows.length === 1 ? '' : 's'} running. Each one alerts you again every time it falls due.
                </Text>
              )}
            </>
          }
          ListEmptyComponent={
            error ? undefined : (
              <CrmEmptyState
                icon={<RepeatIcon size={30} color={theme.textMuted} />}
                title="No repeating reminders"
                subtitle="Choose Daily, Weekly or Monthly when you create a reminder to make it repeat."
              />
            )
          }
        />
      )}

      <Sheet visible={!!stopping} onClose={() => !busy && setStopping(null)} title="Stop this repeating reminder?">
        {!!stopping && (
          <>
            <Text style={styles.sheetText}>
              {stopping.customer_name}
              {stopping.invoice_number ? ` · ${stopping.invoice_number}` : ''} will no longer repeat ({repeatText(stopping).replace(/^E/, 'e')}).
              {stopping.reminder ? ` The current reminder stays on ${showDue(stopping.reminder.due_date, stopping.reminder.due_time)}.` : ''}
            </Text>
            <View style={styles.sheetButtons}>
              <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={() => setStopping(null)} disabled={busy} />
              <PrimaryButton label="Stop Repeating" variant="brand" style={styles.flex} onPress={stop} loading={busy} />
            </View>
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
