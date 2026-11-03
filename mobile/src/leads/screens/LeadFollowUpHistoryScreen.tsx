import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { appAlert } from '../AppDialog';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BellIcon, CalendarIcon, CheckCircleIcon, ClockIcon, ExternalLinkIcon, PauseIcon, PhoneIcon, PlayIcon, PlusIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { StatusBadge, type Tone } from '../../crm/ui/StatusBadge';
import { refreshReminders } from '../../reminders-engine/useReminders';
import { addDays, fmtDateShort, fmtDateTime, fmtTime, fmtTimestamp, todayStr } from '../../tasks/format';
import { DotsIcon, EditIcon, TrashIcon } from '../../tasks/ui/taskIcons';
import { ActionSheet, Sheet, type SheetAction } from '../../tasks/ui/sheets';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import type { LeadStackParamList } from '../navigation';
import type { TimelineEntry } from '../types';
import { errorMessage, useLoad, useMe, LeadButton, LeadScreen, LeadTopBar } from '../ui';

const factory = (t: CrmTheme) => ({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { backgroundColor: t.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: t.border, padding: spacing.md },
  name: { ...typography.title, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textMuted },
  sub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  buttons: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
  button: { flex: 1 },
  cardTitle: { ...typography.subtitle, color: t.textPrimary },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.xs },
  none: { ...typography.caption, color: t.textMuted, marginTop: spacing.xs },
  late: { color: t.danger },
  note: { ...typography.caption, color: t.textSecondary },
  forWho: { ...typography.captionMedium, color: t.primary, marginTop: spacing.sm },
  dim: { opacity: 0.4 },
  // Next follow-up: the one to work on now, with the big Start / Pause / Completed / Resume buttons
  hero: { borderColor: t.primary, borderWidth: 1.5 },
  heroLate: { borderColor: t.danger },
  overline: { ...typography.overline, color: t.textMuted },
  change: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  changeText: { ...typography.captionMedium, color: t.primary },
  heroWhen: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: spacing.sm, marginTop: spacing.xs },
  heroTime: { ...typography.display, color: t.textPrimary },
  heroDay: { ...typography.bodyMedium, color: t.textSecondary },
  heroNote: { ...typography.body, color: t.textSecondary, marginTop: 2 },
  chips: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' as const },
  worked: { ...typography.caption, color: t.textMuted },
  // A follow-up's reminder: when it rings, with change / remove (or "+ Set reminder")
  reminder: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: t.primarySoftBg },
  reminderText: { ...typography.caption, color: t.primary, flex: 1 },
  reminderBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  setReminder: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, marginTop: spacing.sm, paddingVertical: 4 },
  setReminderText: { ...typography.captionMedium, color: t.primary },
  rowReminder: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  rowReminderText: { ...typography.caption, color: t.primary },
  stepIconCall: { backgroundColor: t.successBg },
  // Later follow-ups: one plain row each - date box, time + note + status, one action, the ⋯ menu
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: t.border },
  rowFirst: { borderTopWidth: 0 },
  dateBox: { width: 46, paddingVertical: 4, borderRadius: radii.md, backgroundColor: t.primarySoftBg, alignItems: 'center' as const },
  dateBoxLate: { backgroundColor: t.dangerBg },
  dateDay: { ...typography.subtitle, color: t.primary },
  dateMon: { ...typography.caption, color: t.primary },
  dateLate: { color: t.danger },
  text: { flex: 1, gap: 2 },
  rowTime: { ...typography.bodyMedium, color: t.textPrimary },
  rowStatus: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: 2 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center' as const, justifyContent: 'center' as const },
  roundStart: { backgroundColor: t.primarySoftBg },
  roundDone: { backgroundColor: t.successBg },
  more: { width: 34, height: 38, alignItems: 'center' as const, justifyContent: 'center' as const },
  add: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, marginTop: spacing.sm, minHeight: 44, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: t.primary },
  addText: { ...typography.bodyMedium, color: t.primary },
  sheetText: { ...typography.caption, color: t.textSecondary, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    color: t.textPrimary,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top' as const,
    marginBottom: spacing.md,
  },
  // History
  step: { flexDirection: 'row' as const, gap: spacing.sm, paddingVertical: spacing.xs + 2 },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.warningBg },
  stepIconDone: { backgroundColor: t.successBg },
  stepIconStart: { backgroundColor: t.primarySoftBg },
  stepTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, flexWrap: 'wrap' as const },
  stepTitle: { ...typography.bodyMedium, color: t.textPrimary },
  stepSmall: { ...typography.caption, color: t.textMuted },
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OPEN = ['OPEN', 'IN_PROGRESS', 'PAUSED'];
const WORK_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
};

/** Time worked on a follow-up: start -> now (or -> the pause / completion), minus earlier pauses (as Task Management). */
function workedMs(t: api.LeadFollowUpTask): number {
  if (!t.startedAt) return 0;
  const end = t.status === 'PAUSED' && t.pausedAt ? new Date(t.pausedAt).getTime() : t.completedAt ? new Date(t.completedAt).getTime() : Date.now();
  return Math.max(0, end - new Date(t.startedAt).getTime() - t.pausedSeconds * 1000);
}
function fmtWorked(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}
const STORY_STATUS: Record<string, { label: string; tone: Tone }> = {
  current: { label: 'Current', tone: 'info' },
  moved: { label: 'Moved', tone: 'neutral' },
  done: { label: 'Done', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
// The lead history note of a follow-up set: "Due 2026-10-16 10:00: the note".
// A residential lead's next call: "Next call 2026-10-16 10:00".
const DUE_NOTE = /^(?:Due|Next call) (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)?(?:: ([\s\S]*))?$/;

interface StoryEntry {
  id: string;
  kind: 'set' | 'start' | 'done' | 'call';
  at: string;
  due: string;
  note: string;
  by: string;
  /** 'YYYY-MM-DD HH:MM' of a follow-up set - matched to the follow-up that has that time now. */
  key?: string;
  status?: string;
  /** Time worked, on a "done" entry of a follow-up that was started. */
  worked?: string;
}

/** Every follow-up set on the lead and every one marked done, newest first (the web's follow-up history). */
function followUpStory(timeline: TimelineEntry[], tasks: api.LeadFollowUpTask[]): StoryEntry[] {
  const events: StoryEntry[] = [
    ...timeline
      .filter((e) => e.action === 'FOLLOW_UP_SCHEDULED')
      .map((e) => {
        const m = DUE_NOTE.exec(e.note || '');
        return {
          id: e.id,
          kind: 'set' as const,
          at: e.at,
          due: m ? fmtDateTime(m[1], m[2] ?? null) : '',
          note: m ? m[3] || '' : e.note || '',
          by: e.by,
          key: m ? `${m[1]} ${m[2] ?? ''}` : undefined,
        };
      }),
    // A residential lead's calls (what each came to).
    ...timeline
      .filter((e) => e.action === 'CALL_LOGGED')
      .map((e) => ({ id: e.id, kind: 'call' as const, at: e.at, due: '', note: e.note || '', by: e.by })),
    ...tasks
      .filter((t) => !!t.startedAt)
      .map((t) => ({ id: `start-${t.id}`, kind: 'start' as const, at: t.startedAt as string, due: fmtDateTime(t.dueDate, t.dueTime), note: '', by: t.assignedToName })),
    ...tasks
      .filter((t) => t.status === 'COMPLETED' && !!t.completedAt)
      .map((t) => ({
        id: `done-${t.id}`,
        kind: 'done' as const,
        at: t.completedAt as string,
        due: fmtDateTime(t.dueDate, t.dueTime),
        note: t.completionNote || '',
        by: t.assignedToName,
        worked: t.startedAt ? fmtWorked(workedMs(t)) : undefined,
      })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // A lead can have several follow-ups open at once: each time set is Current while a follow-up is
  // still open at that time, Done once that one was done, else it was Moved (or Closed: none open).
  const taskKey = (t: api.LeadFollowUpTask) => `${t.dueDate ?? ''} ${t.dueTime ? t.dueTime.slice(0, 5) : ''}`;
  const openKeys = new Set(tasks.filter((t) => OPEN.includes(t.status)).map(taskKey));
  const doneKeys = new Set(tasks.filter((t) => t.status === 'COMPLETED').map(taskKey));
  const anyOpen = openKeys.size > 0;
  for (const e of events) {
    if (e.kind !== 'set') continue;
    e.status = e.key && openKeys.has(e.key) ? 'current' : e.key && doneKeys.has(e.key) ? 'done' : anyOpen ? 'moved' : 'closed';
  }
  return events.reverse();
}

const dueKey = (t: api.LeadFollowUpTask) => `${t.dueDate ?? '9999-99-99'}T${t.dueTime ?? '99:99'}`;

/**
 * One lead's follow-ups, like the web's follow-up page: the next one (change it or add another),
 * every open one (Start / Pause / Completed / Resume like a task, change, delete), and the history of
 * every follow-up set, started and done.
 */
export function LeadFollowUpHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LeadStackParamList>>();
  const { leadId, name, number, phone, leadType } = useRoute<RouteProp<LeadStackParamList, 'LeadFollowUpHistory'>>().params;
  const residential = leadType === 'consumer';
  const { styles, theme } = useCrmStyles(factory);
  const { myId } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The follow-up being paused (asks for a reason, like a task).
  const [pausing, setPausing] = useState<api.LeadFollowUpTask | null>(null);
  const [reason, setReason] = useState('');

  const loader = useCallback(
    () =>
      Promise.all([
        api.leadFollowUpTasks(leadId),
        // A residential lead's history is its calls and the next calls set.
        residential
          ? api
              .residentialCalls(leadId)
              .then((r) => r.history.map((h): TimelineEntry => ({ id: String(h.id), action: h.action, note: h.note ?? '', at: h.at, by: h.by ?? '' })))
              .catch(() => [] as TimelineEntry[])
          : api.getTimeline(leadId).catch(() => [] as TimelineEntry[]),
      ]).then(([tasks, timeline]) => ({ tasks, timeline })),
    [leadId, residential],
  );
  const { data, loading, refreshing, error, refresh, reload } = useLoad(loader, 'Could not load the follow-ups.');
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const open = useMemo(() => (data?.tasks ?? []).filter((t) => OPEN.includes(t.status)).sort((a, b) => dueKey(a).localeCompare(dueKey(b))), [data]);
  const story = useMemo(() => (data ? followUpStory(data.timeline, data.tasks) : []), [data]);
  // While one is running its "Worked" time moves on.
  const [, setTick] = useState(0);
  const running = open.some((t) => t.status === 'IN_PROGRESS');
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [running]);
  const next = open[0];
  const today = todayStr();
  const isLate = (t: api.LeadFollowUpTask) => !!t.dueDate && (t.dueDate < today || (t.dueDate === today && !!t.dueTime && t.dueTime.slice(0, 5) < new Date().toTimeString().slice(0, 5)));
  const dayOf = (d: string | null) => (!d || d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : fmtDateShort(d));

  const call = () => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
  // Edit = change that one follow-up (its date, time and note); Add = a new one.
  const edit = (t: api.LeadFollowUpTask) => navigation.navigate('LeadFollowUp', { leadId, name, taskId: t.id });
  // A residential lead's next call is set by logging the call.
  const add = () => (residential ? navigation.navigate('LeadResidentialCall', { leadId, name }) : navigation.navigate('LeadFollowUp', { leadId, name }));
  // The follow-up's reminder: set / change it (rings once), or take it off.
  const reminderOn = (t: api.LeadFollowUpTask) => (t.reminderAt ? { date: t.reminderAt.slice(0, 10), time: t.reminderAt.slice(11, 16) } : null);
  const reminderText = (t: api.LeadFollowUpTask) => {
    const r = reminderOn(t);
    return r ? `${dayOf(r.date)}, ${fmtTime(r.time)}` : '';
  };
  const editReminder = (t: api.LeadFollowUpTask) => {
    const r = reminderOn(t);
    navigation.navigate('LeadReminderTime', {
      parentTaskId: t.id,
      title: name,
      date: r?.date ?? t.dueDate ?? todayStr(),
      time: r?.time ?? (t.dueTime ? t.dueTime.slice(0, 5) : null),
    });
  };
  const removeReminder = (t: api.LeadFollowUpTask) =>
    appAlert('Remove this reminder?', `It will not ring at ${reminderText(t)}.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => work(t, () => api.removeTaskReminder(t.id), 'Could not remove the reminder.') },
    ]);
  const mine = (t: api.LeadFollowUpTask) => t.assignedTo === myId;
  // The ⋯ menu of a later follow-up.
  const [menu, setMenu] = useState<api.LeadFollowUpTask | null>(null);
  // A sheet or alert opened right as the menu closes is dropped on Android - wait for it to go.
  const afterMenu = (fn: () => void) => setTimeout(fn, 350);
  const askPause = (t: api.LeadFollowUpTask) => {
    setReason('');
    setPausing(t);
  };

  const remove = (t: api.LeadFollowUpTask) =>
    appAlert('Delete this follow-up?', `${name} · ${fmtDateTime(t.dueDate, t.dueTime)}`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(t.id);
          setActionError(null);
          try {
            await api.deleteFollowUp(t.id);
            refreshReminders();
            reload();
          } catch (err) {
            setActionError(errorMessage(err, 'Could not delete the follow-up.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  /** Start / pause / resume / complete one follow-up, then read the page again. */
  const work = async (t: api.LeadFollowUpTask, step: () => Promise<void>, failed: string) => {
    setBusy(t.id);
    setActionError(null);
    try {
      await step();
      refreshReminders();
      reload();
    } catch (err) {
      setActionError(errorMessage(err, failed));
    } finally {
      setBusy(null);
    }
  };
  const pause = () => {
    const t = pausing;
    if (!t || !reason.trim()) return;
    setPausing(null);
    work(t, () => api.pauseFollowUp(t.id, reason.trim()), 'Could not pause the follow-up.');
  };

  const later = open.slice(1);
  const status = (t: api.LeadFollowUpTask) => WORK_STATUS[t.status] ?? { label: t.status, tone: 'neutral' as Tone };

  /** The step buttons of the next follow-up: Start, then Pause / Completed, or Resume. */
  const heroButtons = (t: api.LeadFollowUpTask) => (
    <View style={styles.buttons}>
      {t.status === 'OPEN' && (
        <LeadButton
          label="Start"
          loading={busy === t.id}
          disabled={busy !== null}
          onPress={() => work(t, () => api.startFollowUp(t.id), 'Could not start the follow-up.')}
          icon={<PlayIcon size={18} color={theme.textOnPrimary} />}
          style={styles.button}
        />
      )}
      {t.status === 'IN_PROGRESS' && (
        <>
          <LeadButton label="Pause" variant="secondary" disabled={busy !== null} onPress={() => askPause(t)} icon={<PauseIcon size={18} color={theme.primary} />} style={styles.button} />
          <LeadButton
            label="Completed"
            loading={busy === t.id}
            disabled={busy !== null}
            onPress={() => work(t, () => api.completeFollowUp(t.id), 'Could not mark it done.')}
            icon={<CheckCircleIcon size={18} color={theme.textOnPrimary} />}
            style={styles.button}
          />
        </>
      )}
      {t.status === 'PAUSED' && (
        <LeadButton
          label="Resume"
          loading={busy === t.id}
          disabled={busy !== null}
          onPress={() => work(t, () => api.resumeFollowUp(t.id), 'Could not resume the follow-up.')}
          icon={<PlayIcon size={18} color={theme.textOnPrimary} />}
          style={styles.button}
        />
      )}
    </View>
  );

  const menuActions: SheetAction[] = menu
    ? [
        { key: 'edit', label: 'Change date, time & note', icon: <EditIcon size={18} color={theme.primary} />, onPress: () => edit(menu) },
        {
          key: 'reminder',
          label: menu.reminderAt ? 'Change reminder' : 'Set reminder',
          sub: menu.reminderAt ? `Rings ${reminderText(menu)}` : undefined,
          icon: <BellIcon size={18} color={theme.primary} />,
          onPress: () => editReminder(menu),
        },
        ...(menu.reminderAt
          ? [{ key: 'unremind', label: 'Remove reminder', icon: <BellIcon size={18} color={theme.danger} />, iconBg: theme.dangerBg, onPress: () => afterMenu(() => removeReminder(menu)) }]
          : []),
        ...(menu.status === 'IN_PROGRESS'
          ? [{ key: 'pause', label: 'Pause', icon: <PauseIcon size={18} color={theme.primary} />, onPress: () => afterMenu(() => askPause(menu)) }]
          : []),
        { key: 'delete', label: 'Delete follow-up', danger: true, icon: <TrashIcon size={18} color={theme.danger} />, iconBg: theme.dangerBg, onPress: () => afterMenu(() => remove(menu)) },
      ]
    : [];

  return (
    <LeadScreen edges={['top', 'bottom']}>
      <LeadTopBar title="Follow-ups" subtitle={name} onBack={() => navigation.goBack()} />
      <CrmScreen edges={[]} transparent refreshing={refreshing} onRefresh={refresh} contentStyle={styles.body}>
        <CrmErrorBanner message={error} onRetry={reload} />
        <CrmErrorBanner message={actionError} />

        {/* The lead */}
        <View style={styles.card}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.sub}>{[number, phone].filter(Boolean).join(' · ')}</Text>
          <View style={styles.buttons}>
            {!!phone && <LeadButton label="Call" onPress={call} icon={<PhoneIcon size={18} color={theme.textOnPrimary} />} style={styles.button} />}
            <LeadButton
              label="Open lead"
              variant="secondary"
              onPress={() => navigation.navigate('LeadDetail', { leadId })}
              icon={<ExternalLinkIcon size={18} color={theme.primary} />}
              style={styles.button}
            />
          </View>
        </View>

        {loading && !data && (
          <>
            <CrmSkeleton height={170} radius={radii.xl} />
            <CrmSkeleton height={140} radius={radii.xl} />
          </>
        )}

        {!!data && (
          <>
            {/* Next follow-up - the one to work on now */}
            <View style={[styles.card, !!next && styles.hero, !!next && isLate(next) && styles.heroLate]}>
              <View style={styles.cardHead}>
                <Text style={styles.overline}>NEXT FOLLOW-UP</Text>
                {!!next && mine(next) && (
                  <Pressable onPress={() => edit(next)} accessibilityRole="button" accessibilityLabel="Change this follow-up" hitSlop={6} style={styles.change}>
                    <EditIcon size={14} color={theme.primary} />
                    <Text style={styles.changeText}>Change</Text>
                  </Pressable>
                )}
              </View>
              {next ? (
                <>
                  <View style={styles.heroWhen}>
                    <Text style={[styles.heroTime, isLate(next) && styles.late]}>{next.dueTime ? fmtTime(next.dueTime) : 'Any time'}</Text>
                    <Text style={[styles.heroDay, isLate(next) && styles.late]}>{dayOf(next.dueDate)}</Text>
                  </View>
                  {!!next.description && <Text style={styles.heroNote}>{next.description}</Text>}
                  <View style={styles.chips}>
                    <StatusBadge label={status(next).label} tone={status(next).tone} />
                    {isLate(next) && <StatusBadge label="Overdue" tone="danger" />}
                    {!!next.startedAt && <Text style={styles.worked}>Worked {fmtWorked(workedMs(next))}</Text>}
                  </View>
                  {mine(next) &&
                    (next.reminderAt ? (
                      <View style={styles.reminder}>
                        <BellIcon size={15} color={theme.primary} />
                        <Text style={styles.reminderText}>Reminder · {reminderText(next)}</Text>
                        <Pressable onPress={() => editReminder(next)} accessibilityRole="button" accessibilityLabel="Change the reminder" hitSlop={6} style={styles.reminderBtn}>
                          <EditIcon size={14} color={theme.primary} />
                        </Pressable>
                        <Pressable onPress={() => removeReminder(next)} disabled={busy !== null} accessibilityRole="button" accessibilityLabel="Remove the reminder" hitSlop={6} style={styles.reminderBtn}>
                          <TrashIcon size={14} color={theme.danger} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => editReminder(next)} accessibilityRole="button" hitSlop={6} style={styles.setReminder}>
                        <BellIcon size={15} color={theme.primary} />
                        <Text style={styles.setReminderText}>+ Set reminder</Text>
                      </Pressable>
                    ))}
                  {mine(next) ? heroButtons(next) : <Text style={styles.forWho}>For {next.assignedToName}</Text>}
                </>
              ) : (
                <>
                  <Text style={styles.none}>No follow-up is open on this lead.</Text>
                  <View style={styles.buttons}>
                    <LeadButton label={residential ? 'Log call' : 'Add follow-up'} onPress={add} icon={<CalendarIcon size={18} color={theme.textOnPrimary} />} style={styles.button} />
                  </View>
                </>
              )}
            </View>

            {/* Later follow-ups - one plain row each */}
            {!!next && (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Later follow-ups</Text>
                  {later.length > 0 && <Text style={styles.meta}>{later.length}</Text>}
                </View>
                {later.length === 0 && <Text style={styles.none}>Nothing else is planned for this lead.</Text>}
                {later.map((t, i) => {
                  const late = isLate(t);
                  const [, mm, dd] = (t.dueDate ?? '').split('-');
                  return (
                    <View key={t.id} style={[styles.row, i === 0 && styles.rowFirst]}>
                      <View style={[styles.dateBox, late && styles.dateBoxLate]}>
                        <Text style={[styles.dateDay, late && styles.dateLate]}>{dd ? Number(dd) : '-'}</Text>
                        <Text style={[styles.dateMon, late && styles.dateLate]}>{mm ? MONTHS[Number(mm) - 1] : ''}</Text>
                      </View>
                      <View style={styles.text}>
                        <Text style={[styles.rowTime, late && styles.late]}>{t.dueTime ? fmtTime(t.dueTime) : 'Any time'}</Text>
                        {!!t.description && (
                          <Text style={styles.note} numberOfLines={1}>
                            {t.description}
                          </Text>
                        )}
                        {!!t.reminderAt && mine(t) && (
                          <View style={styles.rowReminder}>
                            <BellIcon size={12} color={theme.primary} />
                            <Text style={styles.rowReminderText}>{reminderText(t)}</Text>
                          </View>
                        )}
                        {(t.status !== 'OPEN' || !mine(t)) && (
                          <View style={styles.rowStatus}>
                            {t.status !== 'OPEN' && <StatusBadge label={status(t).label} tone={status(t).tone} />}
                            {!!t.startedAt && <Text style={styles.worked}>Worked {fmtWorked(workedMs(t))}</Text>}
                            {!mine(t) && <Text style={styles.worked}>For {t.assignedToName}</Text>}
                          </View>
                        )}
                      </View>
                      {mine(t) && (
                        <>
                          <Pressable
                            onPress={() =>
                              t.status === 'IN_PROGRESS'
                                ? work(t, () => api.completeFollowUp(t.id), 'Could not mark it done.')
                                : t.status === 'PAUSED'
                                  ? work(t, () => api.resumeFollowUp(t.id), 'Could not resume the follow-up.')
                                  : work(t, () => api.startFollowUp(t.id), 'Could not start the follow-up.')
                            }
                            disabled={busy !== null}
                            accessibilityRole="button"
                            accessibilityLabel={t.status === 'IN_PROGRESS' ? 'Completed' : t.status === 'PAUSED' ? 'Resume' : 'Start'}
                            hitSlop={4}
                            style={[styles.round, t.status === 'IN_PROGRESS' ? styles.roundDone : styles.roundStart, busy === t.id && styles.dim]}
                          >
                            {t.status === 'IN_PROGRESS' ? <CheckCircleIcon size={18} color={theme.successText} /> : <PlayIcon size={16} color={theme.primary} />}
                          </Pressable>
                          <Pressable onPress={() => setMenu(t)} accessibilityRole="button" accessibilityLabel="More" hitSlop={4} style={styles.more}>
                            <DotsIcon size={18} color={theme.textMuted} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })}
                <Pressable onPress={add} accessibilityRole="button" style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
                  <PlusIcon size={16} color={theme.primary} />
                  <Text style={styles.addText}>{residential ? 'Log call & set next call' : 'Add follow-up'}</Text>
                </Pressable>
              </View>
            )}

            {/* History, newest first */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>History</Text>
                <Text style={styles.meta}>
                  {story.length} {story.length === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
              {story.length === 0 && <Text style={styles.none}>Follow-ups set on this lead appear here.</Text>}
              {story.map((e) => {
                const badge = e.kind === 'set' && e.status ? STORY_STATUS[e.status] : null;
                return (
                  <View key={e.id} style={styles.step}>
                    <View style={[styles.stepIcon, e.kind === 'done' && styles.stepIconDone, e.kind === 'start' && styles.stepIconStart, e.kind === 'call' && styles.stepIconCall]}>
                      {e.kind === 'call' ? (
                        <PhoneIcon size={14} color={theme.successText} />
                      ) : e.kind === 'done' ? (
                        <CheckCircleIcon size={15} color={theme.successText} />
                      ) : e.kind === 'start' ? (
                        <PlayIcon size={13} color={theme.primary} />
                      ) : (
                        <ClockIcon size={15} color={theme.warningText} />
                      )}
                    </View>
                    <View style={styles.text}>
                      <View style={styles.stepTop}>
                        <Text style={styles.stepTitle}>
                          {e.kind === 'call'
                            ? 'Call logged'
                            : e.kind === 'done'
                              ? 'Follow-up done'
                              : e.kind === 'start'
                                ? 'Follow-up started'
                                : `${residential ? 'Next call' : 'Call due'} ${e.due || '-'}`}
                        </Text>
                        {badge && <StatusBadge label={badge.label} tone={badge.tone} />}
                      </View>
                      {(e.kind === 'start' || e.kind === 'done') && !!e.due && <Text style={styles.note}>Due {e.due}</Text>}
                      {!!e.note && <Text style={styles.note}>{e.note}</Text>}
                      {!!e.worked && <Text style={styles.note}>Worked {e.worked}</Text>}
                      <Text style={styles.stepSmall}>
                        {e.kind === 'call' ? 'Called' : e.kind === 'done' ? 'Marked done' : e.kind === 'start' ? 'Started' : 'Set'} {fmtTimestamp(e.at)}
                        {e.by ? ` by ${e.by}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </CrmScreen>

      <ActionSheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? fmtDateTime(menu.dueDate, menu.dueTime) : undefined} actions={menuActions} />

      <Sheet visible={!!pausing} onClose={() => setPausing(null)} title="Pause this follow-up?">
        <Text style={styles.sheetText}>The timer stops until you resume. The due date doesn't change.</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Why are you pausing? (required)"
          placeholderTextColor={theme.textMuted}
          style={styles.input}
          multiline
          maxLength={500}
        />
        <LeadButton label="Pause follow-up" onPress={pause} disabled={!reason.trim()} icon={<PauseIcon size={18} color={theme.textOnPrimary} />} />
      </Sheet>
    </LeadScreen>
  );
}
