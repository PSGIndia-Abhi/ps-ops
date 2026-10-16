import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangleIcon, BellIcon, BriefcaseIcon, CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, PhoneIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { CrmTextField } from '../../crm/ui/CrmTextField';
import { toneColors, type Tone } from '../../crm/ui/StatusBadge';
import type { ReminderItem, ReminderKind } from '../../reminders-engine/engine';
import {
  clashesAt,
  completeReminder,
  createReminder,
  deleteReminder,
  getReminderTask,
  updateReminder,
} from '../../reminders-engine/personal';
import { myUpcomingTasks, taskToReminder } from '../../reminders-engine/sources';
import { refreshReminders } from '../../reminders-engine/useReminders';
import { addDays, fmtDateShort, fmtTime, todayStr } from '../../tasks/format';
import { DateSheet, TimeSheet } from '../../tasks/ui/sheets';
import type { WorkTask } from '../../tasks/types';
import { radii, spacing, typography } from '../../theme';
import type { LeadStackParamList } from '../navigation';
import { errorMessage, FieldRow, PickField, useLoad, useMe, LeadButton as PrimaryButton, LeadTopBar as TopBar, LeadScreen } from '../ui';

type Nav = NativeStackNavigationProp<LeadStackParamList>;

const factory = (t: CrmTheme) => ({
  body: { padding: spacing.lg, paddingBottom: 120 },
  intro: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  group: { ...typography.overline, color: t.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  timeCol: { width: 62, alignItems: 'center' as const },
  time: { ...typography.bodyMedium, color: t.textPrimary },
  ampm: { ...typography.caption, color: t.textMuted },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  text: { flex: 1 },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  kindPill: { alignSelf: 'flex-start' as const, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, marginTop: 4 },
  kindText: { ...typography.caption, fontWeight: '600' as const },
  dim: { opacity: 0.5 },
  doneBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: t.success, alignItems: 'center' as const, justifyContent: 'center' as const },
  empty: { alignItems: 'center' as const, paddingVertical: spacing.xxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.md },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptyText: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xs },
  fab: {
    position: 'absolute' as const,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: t.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    height: 52,
    ...t.raisedShadow,
  },
  fabText: { ...typography.bodyMedium, color: t.textOnPrimary },

  // Form
  formBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  linkCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.primarySoftBg,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  linkText: { ...typography.bodyMedium, color: t.primary, flex: 1 },
  how: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
  },
  howText: { ...typography.caption, color: t.textSecondary, flex: 1, lineHeight: 18 },
  notes: { minHeight: 90, textAlignVertical: 'top' as const },
  rowButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  flex1: { flex: 1 },
});

const KIND_LOOK: Record<ReminderKind, { label: string; tone: Tone; icon: (c: string) => React.ReactNode }> = {
  personal: { label: 'My reminder', tone: 'info', icon: (c) => <BellIcon size={18} color={c} /> },
  meeting: { label: 'Meeting', tone: 'accent', icon: (c) => <BriefcaseIcon size={18} color={c} /> },
  followup: { label: 'Follow-up', tone: 'warning', icon: (c) => <PhoneIcon size={18} color={c} /> },
  task: { label: 'Task', tone: 'success', icon: (c) => <CheckCircleIcon size={18} color={c} /> },
  payment: { label: 'Payment', tone: 'danger', icon: (c) => <ClockIcon size={18} color={c} /> },
};

const taskIdOf = (key: string) => key.replace(/^task:/, '');
const sortKey = (i: ReminderItem) => `${i.date}T${i.time ?? '09:00'}`;

/** Everything of mine that will ring, from today on (my reminders, meetings, follow-ups, tasks). */
async function loadAll(myId: string): Promise<ReminderItem[]> {
  const tasks = await myUpcomingTasks(myId);
  return tasks.map((t) => taskToReminder(t, myId)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** "Sure?" when something of mine already rings at that minute. Resolves true to go ahead. */
function confirmClash(items: ReminderItem[], date: string, time: string | null, exceptKey?: string): Promise<boolean> {
  const clash = clashesAt(items, date, time, exceptKey);
  if (clash.length === 0) return Promise.resolve(true);
  const what = clash.map((c) => `• ${KIND_LOOK[c.kind].label}: ${c.title}`).join('\n');
  return new Promise((resolve) =>
    Alert.alert(`You already have something at ${fmtTime(time as string)}`, `${fmtDateShort(date)}\n${what}`, [
      { text: 'Pick another time', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Keep both', onPress: () => resolve(true) },
    ]),
  );
}

/**
 * What already rings at the chosen minute, worked out while the form is open: everything of mine
 * is loaded once, then checked against each date and time picked. `exceptKey` leaves out the item
 * being edited. Off (no request, nothing shown) when `on` is false.
 */
function useClashes(myId: string, date: string, time: string | null, exceptKey?: string, on = true): ReminderItem[] {
  const [items, setItems] = useState<ReminderItem[]>([]);
  useEffect(() => {
    if (!on || !myId) return;
    let alive = true;
    loadAll(myId)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [myId, on]);
  return useMemo(() => (on ? clashesAt(items, date, time, exceptKey) : []), [on, items, date, time, exceptKey]);
}

const clashFactory = (t: CrmTheme) => ({
  box: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    backgroundColor: t.warningBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.bodyMedium, color: t.warningText },
  line: { ...typography.caption, color: t.textPrimary },
  hint: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
});

/** "Already at 10:00 AM on Oct 14: Follow-up: Client cradle" - nothing when the minute is free. */
function ClashNotice({ clashes, date, time }: { clashes: ReminderItem[]; date: string; time: string | null }) {
  const { styles, theme } = useCrmStyles(clashFactory);
  if (clashes.length === 0 || !time) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <AlertTriangleIcon size={18} color={theme.warningText} />
      <View style={styles.body}>
        <Text style={styles.title}>
          Already at {fmtTime(time)} on {fmtDateShort(date)}:
        </Text>
        {clashes.map((c) => (
          <Text key={c.key} style={styles.line} numberOfLines={1}>
            • {KIND_LOOK[c.kind].label}: {c.title}
          </Text>
        ))}
        <Text style={styles.hint}>Pick another time, or keep both.</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reminders: everything that will ring
// ---------------------------------------------------------------------------

/**
 * Everything of mine that rings. `embedded`: shown as the Reminders tab of the Follow-ups screen -
 * no header of its own, and follow-ups are left out (they have their own tab).
 */
export function RemindersScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const navigation = useNavigation<Nav>();
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(() => loadAll(myId), [myId]);
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load your reminders.');

  const groups = useMemo(() => {
    const today = todayStr();
    const tomorrow = addDays(today, 1);
    const g: { title: string; items: ReminderItem[] }[] = [
      { title: 'TODAY', items: [] },
      { title: 'TOMORROW', items: [] },
      { title: 'LATER', items: [] },
    ];
    for (const i of data ?? []) {
      if (embedded && i.kind === 'followup') continue;
      (i.date === today ? g[0] : i.date === tomorrow ? g[1] : g[2]).items.push(i);
    }
    return g.filter((x) => x.items.length > 0);
  }, [data, embedded]);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  const open = (i: ReminderItem) => {
    if (i.kind === 'personal') return navigation.navigate('LeadReminderEdit', { taskId: taskIdOf(i.key) });
    const leadId = i.route?.params?.leadId;
    if (typeof leadId === 'string') navigation.navigate('LeadDetail', { leadId });
  };

  const markDone = async (i: ReminderItem) => {
    setBusy(i.key);
    setActionError(null);
    try {
      await completeReminder(taskIdOf(i.key));
      refreshReminders();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not mark it done.'));
    } finally {
      setBusy(null);
    }
  };

  const content = (
    <>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />
        {!!data && shownCount > 0 && (
          <Text style={styles.intro}>
            {embedded ? 'Your reminders, meetings and task reminders ring at their time.' : 'Your reminders, meetings, follow-ups and task reminders ring at their time.'}
          </Text>
        )}
        {loading && !data && [0, 1, 2].map((i) => <CrmSkeleton key={i} height={76} radius={radii.lg} style={{ marginBottom: spacing.sm }} />)}

        {!!data && shownCount === 0 && !error && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <BellIcon size={32} color={theme.primary} />
            </View>
            <Text style={styles.emptyTitle}>Nothing to remind you of</Text>
            <Text style={styles.emptyText}>Set a reminder and your phone will ring at that time, even with the app closed.</Text>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.title}>
            <Text style={styles.group}>{g.title}</Text>
            {g.items.map((i) => {
              const look = KIND_LOOK[i.kind];
              const c = toneColors(theme, look.tone);
              const [clock, ampm] = i.time ? fmtTime(i.time).split(' ') : ['Any', 'time'];
              const sub = [g.title === 'LATER' ? fmtDateShort(i.date) : null, i.kind === 'personal' ? i.detail : i.detail].filter(Boolean).join(' · ');
              return (
                <Pressable key={i.key} onPress={() => open(i)} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && { opacity: 0.9 }]}>
                  <View style={styles.timeCol}>
                    <Text style={styles.time}>{clock}</Text>
                    <Text style={styles.ampm}>{ampm}</Text>
                  </View>
                  <View style={[styles.icon, { backgroundColor: c.bg }]}>{look.icon(c.fg)}</View>
                  <View style={styles.text}>
                    <Text style={styles.title} numberOfLines={1}>
                      {i.title}
                    </Text>
                    {!!sub && (
                      <Text style={styles.sub} numberOfLines={1}>
                        {sub}
                      </Text>
                    )}
                    <View style={[styles.kindPill, { backgroundColor: c.bg }]}>
                      <Text style={[styles.kindText, { color: c.fg }]}>{look.label}</Text>
                    </View>
                  </View>
                  {i.kind === 'personal' ? (
                    <Pressable
                      onPress={() => markDone(i)}
                      disabled={busy !== null}
                      accessibilityRole="button"
                      accessibilityLabel="Mark done"
                      hitSlop={6}
                      style={[styles.doneBtn, busy === i.key && styles.dim]}
                    >
                      <CheckCircleIcon size={20} color={theme.success} />
                    </Pressable>
                  ) : (
                    <ChevronRightIcon size={16} color={theme.textMuted} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Pressable onPress={() => navigation.navigate('LeadReminderEdit', {})} accessibilityRole="button" style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}>
        <PlusIcon size={20} color={theme.textOnPrimary} />
        <Text style={styles.fabText}>New reminder</Text>
      </Pressable>
    </>
  );

  if (embedded) return <View style={{ flex: 1 }}>{content}</View>;
  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title="Reminders" subtitle="Everything that will ring" onBack={() => navigation.goBack()} />
      {content}
    </LeadScreen>
  );
}

// ---------------------------------------------------------------------------
// New / edit a reminder
// ---------------------------------------------------------------------------

/** The next round half-hour from now, as 'HH:MM' (a sensible default time). */
function nextSlot(): { date: string; time: string } {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function ReminderEditScreen() {
  const navigation = useNavigation<Nav>();
  const { taskId, leadId, leadName } = useRoute<RouteProp<LeadStackParamList, 'LeadReminderEdit'>>().params ?? {};
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  const slot = useMemo(nextSlot, []);
  const [task, setTask] = useState<WorkTask | null>(null);
  const [title, setTitle] = useState(leadName ? `Call ${leadName}` : '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [sheet, setSheet] = useState<'date' | 'time' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!taskId;

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    getReminderTask(taskId)
      .then((t) => {
        if (!alive) return;
        setTask(t);
        setTitle(t.title);
        setNote(t.description ?? '');
        setDate(String(t.due_date).slice(0, 10));
        setTime((t.due_time ?? '09:00').slice(0, 5));
      })
      .catch((err) => alive && setError(errorMessage(err, 'Could not load this reminder.')));
    return () => {
      alive = false;
    };
  }, [taskId]);

  const linkedLead = leadId ?? task?.source_id ?? null;
  const clashes = useClashes(myId, date, time, taskId ? `task:${taskId}` : undefined);

  const save = async () => {
    const t = title.trim();
    if (!t) return setError('Give the reminder a title.');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if (new Date(y, m - 1, d, hh, mm) <= new Date()) return setError('Pick a time in the future.');
    setError(null);
    setSaving(true);
    try {
      // "Already something at this time?" - against everything that will ring.
      const items = await loadAll(myId).catch(() => [] as ReminderItem[]);
      if (!(await confirmClash(items, date, time, taskId ? `task:${taskId}` : undefined))) {
        setSaving(false);
        return;
      }
      const input = { title: t, note: note.trim(), date, time, leadId: linkedLead };
      if (task) await updateReminder(task, input);
      else await createReminder(myId, input);
      refreshReminders();
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the reminder.'));
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this reminder?', 'It will not ring.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReminder(taskId as string);
            refreshReminders();
            navigation.goBack();
          } catch (err) {
            setError(errorMessage(err, 'Could not delete it.'));
          }
        },
      },
    ]);

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <TopBar title={editing ? 'Edit reminder' : 'New reminder'} onBack={() => navigation.goBack()} icon="close" />
      <CrmScreen edges={[]} transparent contentStyle={styles.formBody}>
        <CrmErrorBanner message={error} />
        {!!linkedLead && (
          <Pressable onPress={() => navigation.navigate('LeadDetail', { leadId: linkedLead })} style={styles.linkCard} accessibilityRole="button">
            <BriefcaseIcon size={18} color={theme.primary} />
            <Text style={styles.linkText} numberOfLines={1}>
              For lead: {leadName || 'Open the lead'}
            </Text>
            <ChevronRightIcon size={16} color={theme.primary} />
          </Pressable>
        )}
        <CrmTextField label="Remind me to" value={title} onChangeText={setTitle} placeholder="e.g. Call Ravi about the quotation" maxLength={200} />
        <FieldRow>
          <PickField label="Date" value={fmtDateShort(date)} placeholder="Pick a date" icon={<CalendarIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('date')} />
          <PickField label="Time" value={fmtTime(time)} placeholder="Pick a time" icon={<ClockIcon size={18} color={theme.textMuted} />} onPress={() => setSheet('time')} />
        </FieldRow>
        <ClashNotice clashes={clashes} date={date} time={time} />
        <CrmTextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything to remember" multiline maxLength={1000} style={styles.notes} />

        <View style={styles.how}>
          <BellIcon size={18} color={theme.primary} />
          <Text style={styles.howText}>
            Your phone rings like an alarm at {fmtTime(time)} on {fmtDateShort(date)} - even with the app closed - with Snooze 10 min and Dismiss.
          </Text>
        </View>

        <PrimaryButton label={editing ? 'Save changes' : 'Set reminder'} onPress={save} loading={saving} />
        {editing && <PrimaryButton label="Delete reminder" variant="secondary" onPress={remove} disabled={saving} />}

        <DateSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={date} minDate={todayStr()} onPick={(d) => { setDate(d); setSheet(null); }} />
        <TimeSheet visible={sheet === 'time'} onClose={() => setSheet(null)} value={time} allowNone={false} onPick={(t) => { if (t) setTime(t); setSheet(null); }} />
      </CrmScreen>
    </LeadScreen>
  );
}

export { ClashNotice, confirmClash, loadAll as loadAllReminderItems, useClashes };
