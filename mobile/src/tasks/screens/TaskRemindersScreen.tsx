import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellIcon, CalendarIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmScreen } from '../../crm/ui/CrmScreen';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import { addDays, fmtDateShort, fmtTime, isActive, todayStr } from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import { PRIORITY_META, STATE_META, taskState } from '../theme';
import type { WorkTask } from '../types';
import { ScreenHeader } from '../ui/parts';
import { EditIcon, TrashIcon } from '../ui/taskIcons';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  intro: { ...typography.caption, color: t.textMuted, marginBottom: spacing.md },
  group: { ...typography.overline, color: t.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  timeCol: { width: 64, alignItems: 'center' as const, paddingVertical: 4, borderRadius: radii.md, backgroundColor: t.warningBg },
  time: { ...typography.bodyMedium, color: t.warningText },
  ampm: { ...typography.caption, color: t.warningText },
  text: { flex: 1, gap: 3 },
  title: { ...typography.bodyMedium, color: t.textPrimary },
  due: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  dueText: { ...typography.caption, color: t.textMuted },
  chips: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  actions: { flexDirection: 'row' as const, gap: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.primarySoftBg },
  iconBtnDanger: { backgroundColor: t.dangerBg },
  dim: { opacity: 0.4 },
  empty: { alignItems: 'center' as const, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.md },
  emptyTitle: { ...typography.subtitle, color: t.textPrimary },
  emptyText: { ...typography.body, color: t.textMuted, textAlign: 'center' as const, marginTop: spacing.xs },
});

/** When a task's reminder rings, as a Date (null if it has none). */
const ringsAt = (t: WorkTask) => (t.reminder_id && t.reminder_at ? new Date(t.reminder_at.replace(' ', 'T')) : null);

/**
 * The task reminders that will ring for me (opened from Profile): Today / Tomorrow / Later, each
 * with the task it is for. Change or remove one here; a tap opens its task. Passed reminders and
 * finished tasks are left out (they will not ring). Lead follow-ups / meetings are not tasks here.
 */
export function TaskRemindersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { viewer, tasks, refreshing, refresh, patch, showToast } = useTasks();
  const [busy, setBusy] = useState<string | null>(null);
  // Re-check every minute so a reminder leaves the list once its time passes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Back from changing a reminder: read the list again.
  useFocusEffect(
    useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const groups = useMemo(() => {
    const today = todayStr();
    const tomorrow = addDays(today, 1);
    const mine = tasks
      .filter((t) => t.assigned_to === viewer.id && isActive(t))
      .map((t) => ({ t, at: ringsAt(t) }))
      .filter((x): x is { t: WorkTask; at: Date } => !!x.at && x.at.getTime() > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const out: { title: string; items: { t: WorkTask; at: Date }[] }[] = [
      { title: 'TODAY', items: [] },
      { title: 'TOMORROW', items: [] },
      { title: 'LATER', items: [] },
    ];
    for (const x of mine) {
      const day = (x.t.reminder_at as string).slice(0, 10);
      (day === today ? out[0] : day === tomorrow ? out[1] : out[2]).items.push(x);
    }
    return out.filter((g) => g.items.length > 0);
  }, [tasks, viewer.id, now]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  const edit = (t: WorkTask) =>
    navigation.navigate('TaskReminderTime', {
      parentTaskId: t.id,
      title: t.title,
      date: (t.reminder_at as string).slice(0, 10),
      time: (t.reminder_at as string).slice(11, 16),
    });
  const remove = (t: WorkTask) =>
    Alert.alert('Remove this reminder?', `${t.title}\n\nIt will not ring.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(t.id);
          try {
            patch(await api.removeTaskReminder(t.id));
            showToast('Reminder removed');
          } catch (err) {
            showToast(errorMessage(err), 'error');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader title="My reminders" onBack={() => navigation.goBack()} />
      </SafeAreaView>
      <CrmScreen edges={['bottom']} refreshing={refreshing} onRefresh={refresh}>
        {count > 0 ? (
          <Text style={styles.intro}>Your task reminders ring once, at their time. Tap one to open its task.</Text>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <BellIcon size={32} color={theme.primary} />
            </View>
            <Text style={styles.emptyTitle}>No reminders set</Text>
            <Text style={styles.emptyText}>Open a task and use Set reminder - your phone rings at that time.</Text>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.title}>
            <Text style={styles.group}>
              {g.title} · {g.items.length}
            </Text>
            {g.items.map(({ t, at }) => {
              const [clock, ampm] = fmtTime(`${at.getHours()}:${at.getMinutes()}`).split(' ');
              const state = STATE_META[taskState(t)];
              const prio = PRIORITY_META[t.priority];
              return (
                <Pressable
                  key={t.id}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: t.id })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.timeCol}>
                    <Text style={styles.time}>{clock}</Text>
                    <Text style={styles.ampm}>{g.title === 'LATER' ? fmtDateShort((t.reminder_at as string).slice(0, 10)).replace(/, \d{4}$/, '') : ampm}</Text>
                  </View>
                  <View style={styles.text}>
                    <Text style={styles.title} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <View style={styles.due}>
                      <CalendarIcon size={13} color={theme.textMuted} />
                      <Text style={styles.dueText} numberOfLines={1}>
                        Task due {fmtDateShort(String(t.due_date).slice(0, 10)).replace(/, \d{4}$/, '')}
                        {t.due_time ? `, ${fmtTime(t.due_time)}` : ''}
                        {g.title === 'LATER' ? ` · rings ${clock} ${ampm}` : ''}
                      </Text>
                    </View>
                    <View style={styles.chips}>
                      <StatusBadge label={state.label} tone={state.tone} dot={false} />
                      {t.priority !== 'NORMAL' && <StatusBadge label={prio.label} tone={prio.tone} dot={false} />}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => edit(t)} disabled={busy !== null} accessibilityRole="button" accessibilityLabel="Change the reminder" hitSlop={4} style={styles.iconBtn}>
                      <EditIcon size={16} color={theme.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => remove(t)}
                      disabled={busy !== null}
                      accessibilityRole="button"
                      accessibilityLabel="Remove the reminder"
                      hitSlop={4}
                      style={[styles.iconBtn, styles.iconBtnDanger, busy === t.id && styles.dim]}
                    >
                      <TrashIcon size={16} color={theme.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </CrmScreen>
    </View>
  );
}
