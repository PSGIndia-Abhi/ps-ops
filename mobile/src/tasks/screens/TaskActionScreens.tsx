import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, ClockIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { spacing, typography } from '../../theme';
import * as api from '../api';
import { fmtDateShort, fmtDateTime, fmtTime, todayStr } from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTaskById, useTasks } from '../TasksContext';
import type { TeamMember } from '../types';
import { Card, FieldLabel, inputStyle, ScreenHeader, TaskSummaryCard } from '../ui/parts';
import { DateSheet, PeopleList, TimeSheet } from '../ui/sheets';

/**
 * Reassign / Reschedule / Complete as full screens (mockup 8-10). Each calls
 * the same endpoint the old sheets did; the server still decides who may.
 */

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  input: inputStyle(t),
  multi: { minHeight: 100, paddingTop: spacing.sm, textAlignVertical: 'top' as const },
  picker: { ...inputStyle(t), flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  pickerText: { ...typography.body, color: t.textPrimary, flex: 1 },
  muted: { color: t.textMuted },
  footer: { flexDirection: 'row' as const, gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  footerSingle: { padding: spacing.lg, paddingTop: spacing.sm },
  error: { ...typography.captionMedium, color: t.dangerText, textAlign: 'center' as const },
});

function useTaskScreen<R extends 'Reassign' | 'Reschedule'>() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { taskId } = useRoute<RouteProp<TaskStackParamList, R>>().params as { taskId: string };
  const { task, error } = useTaskById(taskId);
  return { navigation, task, error };
}

function Loading({ error, onBack, title }: { error: string | null; onBack: () => void; title: string }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={title} onBack={onBack} />
      <View style={styles.center}>{error ? <CrmEmptyState title="Task not found" subtitle={error} /> : <ActivityIndicator color={theme.primary} />}</View>
    </SafeAreaView>
  );
}

// ---- Reassign -------------------------------------------------------------------

export function ReassignScreen() {
  const { navigation, task, error } = useTaskScreen<'Reassign'>();
  const { styles, theme } = useCrmStyles(factory);
  const { viewer, assignable, patch, showToast } = useTasks();
  const [pickId, setPickId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!task) return <Loading error={error} onBack={() => navigation.goBack()} title="Reassign Task" />;
  const people = assignable.filter((p) => p.id !== task.assigned_to);
  const picked: TeamMember | undefined = people.find((p) => p.id === pickId);

  async function submit() {
    if (!picked) return setErr('Choose who should take this task.');
    setBusy(true);
    try {
      patch(await api.reassignTask(task!.id, picked.id, note.trim() || undefined));
      showToast(`Reassigned to ${picked.name}`);
      navigation.goBack();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScreenHeader title="Reassign Task" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TaskSummaryCard task={task} />
          <Card>
            {people.length === 0 ? (
              <CrmEmptyState title="No one to reassign to" subtitle="Only you and your team can take your tasks." />
            ) : (
              <PeopleList people={people} selectedId={pickId} meId={viewer.id} onPick={(p) => setPickId(p.id)} />
            )}
          </Card>
          {!!picked && (
            <View>
              <FieldLabel>{`Note for ${picked.name.split(' ')[0]} (optional)`}</FieldLabel>
              <TextInput value={note} onChangeText={setNote} placeholder="Why are you handing this over?" placeholderTextColor={theme.textMuted} style={styles.input} />
            </View>
          )}
          {!!err && <Text style={styles.error}>{err}</Text>}
        </ScrollView>
        <View style={styles.footerSingle}>
          <PrimaryButton label="Reassign" onPress={submit} loading={busy} disabled={!picked} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Reschedule ---------------------------------------------------------------------

export function RescheduleScreen() {
  const { navigation, task, error } = useTaskScreen<'Reschedule'>();
  const { styles, theme } = useCrmStyles(factory);
  const { patch, showToast } = useTasks();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<null | 'date' | 'time'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!task) return <Loading error={error} onBack={() => navigation.goBack()} title="Reschedule Task" />;
  const newDate = date ?? (task.due_date && task.due_date >= todayStr() ? task.due_date : todayStr());
  const newTime = time === undefined ? (task.due_time ? task.due_time.slice(0, 5) : null) : time;

  async function submit() {
    setBusy(true);
    try {
      patch(await api.rescheduleTask(task!.id, newDate, newTime ? `${newTime}:00` : null, reason.trim() || undefined));
      showToast(`Moved to ${fmtDateTime(newDate, newTime)}`);
      navigation.goBack();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScreenHeader title="Reschedule Task" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TaskSummaryCard task={task} />
          <View>
            <FieldLabel required>New Date</FieldLabel>
            <Pressable style={styles.picker} onPress={() => setPicker('date')} accessibilityRole="button">
              <CalendarIcon size={18} color={theme.textSecondary} />
              <Text style={styles.pickerText}>{fmtDateShort(newDate)}</Text>
            </Pressable>
          </View>
          <View>
            <FieldLabel>New Time</FieldLabel>
            <Pressable style={styles.picker} onPress={() => setPicker('time')} accessibilityRole="button">
              <ClockIcon size={18} color={theme.textSecondary} />
              <Text style={[styles.pickerText, !newTime && styles.muted]}>{newTime ? fmtTime(newTime) : 'Any time'}</Text>
            </Pressable>
          </View>
          <View>
            <FieldLabel>Reason (Optional)</FieldLabel>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Customer requested to call next week..."
              placeholderTextColor={theme.textMuted}
              style={[styles.input, styles.multi]}
              multiline
            />
          </View>
          {!!err && <Text style={styles.error}>{err}</Text>}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Cancel" variant="secondary" style={styles.flex} onPress={() => navigation.goBack()} />
          <PrimaryButton label="Update" style={styles.flex} onPress={submit} loading={busy} />
        </View>
      </KeyboardAvoidingView>
      <DateSheet visible={picker === 'date'} onClose={() => setPicker(null)} value={newDate} onPick={setDate} minDate={todayStr()} />
      <TimeSheet visible={picker === 'time'} onClose={() => setPicker(null)} value={newTime} onPick={setTime} />
    </SafeAreaView>
  );
}
