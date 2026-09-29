import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarIcon, ClockIcon, CloseIcon, PlusIcon } from '../../components/icons';
import * as api from '../api';
import { addDays, fmtDateShort, fmtTime, MONTHS_LONG, todayStr, WEEKDAYS } from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import { font, PRIORITY_META, radius, t } from '../theme';
import type {
  CreateSeriesResponse,
  CreateTaskInput,
  RecurrenceEnd,
  RecurrenceFrequency,
  TaskPriority,
  WorkTask,
} from '../types';
import { Backdrop } from '../ui/Backdrop';
import { Avatar, CircleButton, PrimaryButton, primitiveStyles as ps } from '../ui/primitives';
import { DateSheet, PeopleSheet, TimeSheet } from '../ui/sheets';
import { CheckIcon, ChevronDownIcon, RepeatIcon } from '../ui/taskIcons';

const FREQUENCIES: RecurrenceFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const FREQ_UNIT: Record<RecurrenceFrequency, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };
const ENDS: [RecurrenceEnd, string][] = [
  ['NEVER', 'Never'],
  ['ON_DATE', 'On date'],
  ['AFTER_COUNT', 'After N times'],
];

type Picker = null | 'date' | 'time' | 'person' | 'recStart' | 'recTime' | 'recEnd';

export function NewTaskScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const route = useRoute<RouteProp<TaskStackParamList, 'NewTask'>>();
  const editId = route.params?.editId;
  const { viewer, assignable, patch, refresh, showToast, notifyLocal } = useTasks();

  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [assignedTo, setAssignedTo] = useState<number>(viewer.id);
  const [dueDate, setDueDate] = useState(route.params?.date ?? addDays(todayStr(), 1));
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [addingType, setAddingType] = useState(false);

  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFrequency>('WEEKLY');
  const [interval, setIntervalValue] = useState('1');
  const [weekdays, setWeekdays] = useState<number[]>([new Date().getDay()]);
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [lastDay, setLastDay] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [recStart, setRecStart] = useState(todayStr());
  const [recTime, setRecTime] = useState<string>('09:00');
  const [endType, setEndType] = useState<RecurrenceEnd>('NEVER');
  const [endDate, setEndDate] = useState(addDays(todayStr(), 30));
  const [endCount, setEndCount] = useState('10');

  const [picker, setPicker] = useState<Picker>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.fetchTaskTypes().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    api
      .getTask(editId)
      .then((task) => {
        setTitle(task.title);
        setDescription(task.description || '');
        setTaskType(task.task_type || '');
        setPriority(task.priority);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  // Keep the selection valid once the team list arrives.
  useEffect(() => {
    if (!assignable.some((p) => p.id === assignedTo) && assignable[0]) setAssignedTo(assignable[0].id);
  }, [assignable, assignedTo]);

  const person = assignable.find((p) => p.id === assignedTo);
  const typeOptions = useMemo(() => {
    const list = [...types];
    if (taskType && !list.includes(taskType)) list.unshift(taskType);
    return list.slice(0, 12);
  }, [types, taskType]);

  const toggleWeekday = (n: number) =>
    setWeekdays((w) => (w.includes(n) ? w.filter((d) => d !== n) : [...w, n].sort()));

  async function submit() {
    if (!title.trim()) return setError('Give the task a title.');
    setError('');

    if (editId) {
      setSaving(true);
      try {
        patch(
          await api.updateTask(editId, {
            title: title.trim(),
            description: description.trim() || null,
            task_type: taskType.trim() || null,
            priority,
          }),
        );
        showToast('Task updated');
        navigation.goBack();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const payload: CreateTaskInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      task_type: taskType.trim() || undefined,
      priority,
      assigned_to: assignedTo,
    };

    if (repeat) {
      if (freq === 'WEEKLY' && weekdays.length === 0) return setError('Pick at least one day of the week.');
      if (endType === 'ON_DATE' && endDate < recStart) return setError('The end date is before the start date.');
      payload.recurrence = {
        frequency: freq,
        interval_value: Math.max(1, Number(interval) || 1),
        start_date: recStart,
        time_of_day: `${recTime}:00`,
        end_type: endType,
        ...(freq === 'WEEKLY' ? { days_of_week: weekdays } : {}),
        ...(freq === 'MONTHLY'
          ? lastDay
            ? { use_last_day_of_month: true }
            : { day_of_month: Number(dayOfMonth) || 1 }
          : {}),
        ...(freq === 'YEARLY' ? { month_of_year: month, day_of_month: Number(dayOfMonth) || 1 } : {}),
        ...(endType === 'ON_DATE' ? { end_date: endDate } : {}),
        ...(endType === 'AFTER_COUNT' ? { end_count: Math.max(1, Number(endCount) || 1) } : {}),
      };
    } else {
      payload.due_date = dueDate;
      if (dueTime) payload.due_time = `${dueTime}:00`;
    }

    setSaving(true);
    try {
      const created = await api.createTask(payload);
      if (repeat) {
        const series = created as CreateSeriesResponse;
        const first = series.tasks?.[0];
        if (first) notifyLocal(first, 'created');
        else showToast('Schedule created · first occurrence is still ahead');
        await refresh();
      } else {
        patch(created as WorkTask);
        notifyLocal(created as WorkTask, 'created');
      }
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadingEdit) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Backdrop />
        <ActivityIndicator color={t.ink} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Backdrop />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <CircleButton label="Close" size={56} onPress={() => navigation.goBack()}>
          <CloseIcon size={22} color={t.ink} />
        </CircleButton>
        <Text style={styles.headerTitle}>{editId ? 'Edit Task' : 'Add New Task'}</Text>
        <CircleButton label={editId ? 'Save' : 'Create'} size={56} onPress={submit}>
          {saving ? <ActivityIndicator color={t.ink} /> : <CheckIcon size={22} color={t.ink} />}
        </CircleButton>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Text style={ps.label}>Task Title</Text>
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (error) setError('');
          }}
          placeholder="e.g. Call ABC Hotels about the payment"
          placeholderTextColor={t.textMuted}
          style={[ps.field, !!error && !title.trim() && styles.invalid]}
          maxLength={200}
          autoFocus={!editId}
        />

        <Text style={ps.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What needs to be done?"
          placeholderTextColor={t.textMuted}
          style={[ps.field, ps.fieldMultiline]}
          multiline
        />

        {!editId && !repeat && (
          <>
            <Text style={ps.label}>Due Date & time</Text>
            <View style={styles.duo}>
              <FieldButton icon={<CalendarIcon size={18} color={t.ink} />} text={fmtDateShort(dueDate)} onPress={() => setPicker('date')} />
              <FieldButton
                icon={<ClockIcon size={18} color={t.ink} />}
                text={dueTime ? fmtTime(dueTime) : 'Any time'}
                muted={!dueTime}
                onPress={() => setPicker('time')}
              />
            </View>
          </>
        )}

        <Text style={ps.label}>Priority</Text>
        <View style={styles.duo}>
          {(Object.keys(PRIORITY_META) as TaskPriority[]).map((k) => {
            const p = PRIORITY_META[k];
            const on = priority === k;
            return (
              <Pressable
                key={k}
                onPress={() => setPriority(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.priority,
                  { borderColor: p.border, backgroundColor: on ? p.color : p.soft },
                ]}
              >
                <Text style={[styles.priorityText, { color: on ? t.onInk : p.color }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!editId && (
          <>
            <Text style={ps.label}>Assign to</Text>
            <Pressable style={styles.select} onPress={() => setPicker('person')} accessibilityRole="button">
              <Avatar name={person?.name} id={person?.id} size={34} />
              <Text style={styles.selectText} numberOfLines={1}>
                {person ? `${person.name}${person.id === viewer.id ? ' (you)' : ''}` : 'Choose a person'}
              </Text>
              <ChevronDownIcon size={20} color={t.ink} />
            </Pressable>
          </>
        )}

        <Text style={ps.label}>Type</Text>
        <View style={styles.tags}>
          {typeOptions.map((x) => {
            const on = taskType === x;
            return (
              <Pressable
                key={x}
                onPress={() => setTaskType(on ? '' : x)}
                style={[styles.tag, on && styles.tagOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tagText, on && { color: t.onInk }]}>{x}</Text>
                {on && <CloseIcon size={14} color={t.onInk} />}
              </Pressable>
            );
          })}
          {addingType ? (
            <TextInput
              autoFocus
              placeholder="New type"
              placeholderTextColor={t.textMuted}
              style={[styles.tag, styles.tagInput]}
              maxLength={100}
              onSubmitEditing={(e) => {
                const v = e.nativeEvent.text.trim();
                if (v) setTaskType(v);
                setAddingType(false);
              }}
              onBlur={() => setAddingType(false)}
            />
          ) : (
            <Pressable onPress={() => setAddingType(true)} style={[styles.tag, styles.tagAdd]} accessibilityRole="button">
              <PlusIcon size={16} color={t.textSecondary} />
              <Text style={[styles.tagText, { color: t.textSecondary }]}>Add</Text>
            </Pressable>
          )}
        </View>

        {!editId && (
          <View style={styles.repeatCard}>
            <View style={styles.repeatHead}>
              <View style={styles.repeatIcon}>
                <RepeatIcon size={18} color={t.ink} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.repeatTitle}>Repeat this task</Text>
                <Text style={styles.repeatSub}>Creates a recurring schedule instead of one task</Text>
              </View>
              <Switch
                value={repeat}
                onValueChange={setRepeat}
                trackColor={{ true: t.lime, false: '#DDDCE1' }}
                thumbColor={repeat ? t.ink : t.surface}
              />
            </View>

            {repeat && (
              <View>
                <Text style={styles.recLabel}>Frequency</Text>
                <Segmented
                  options={FREQUENCIES.map((f) => [f, f.charAt(0) + f.slice(1).toLowerCase()])}
                  value={freq}
                  onChange={setFreq}
                />

                <View style={styles.recRow}>
                  <View style={styles.flex}>
                    <Text style={styles.recLabel}>Every</Text>
                    <View style={styles.inline}>
                      <TextInput
                        value={interval}
                        onChangeText={(v) => setIntervalValue(v.replace(/\D/g, '').slice(0, 3))}
                        keyboardType="number-pad"
                        style={styles.numInput}
                      />
                      <Text style={styles.unit}>
                        {FREQ_UNIT[freq]}
                        {Number(interval) === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.recLabel}>At</Text>
                    <FieldButton small icon={<ClockIcon size={16} color={t.ink} />} text={fmtTime(recTime)} onPress={() => setPicker('recTime')} />
                  </View>
                </View>

                <Text style={styles.recLabel}>Starts</Text>
                <FieldButton small icon={<CalendarIcon size={16} color={t.ink} />} text={fmtDateShort(recStart)} onPress={() => setPicker('recStart')} />

                {freq === 'WEEKLY' && (
                  <>
                    <Text style={styles.recLabel}>On these days</Text>
                    <View style={styles.weekdays}>
                      {WEEKDAYS.map((w, i) => {
                        const on = weekdays.includes(i);
                        return (
                          <Pressable key={w} onPress={() => toggleWeekday(i)} style={[styles.weekday, on && styles.weekdayOn]}>
                            <Text style={[styles.weekdayText, on && { color: t.onInk }]}>{w.slice(0, 2)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {freq === 'MONTHLY' && (
                  <>
                    <Text style={styles.recLabel}>On</Text>
                    <Segmented
                      options={[
                        ['day', 'Day of month'],
                        ['last', 'Last day'],
                      ]}
                      value={lastDay ? 'last' : 'day'}
                      onChange={(v) => setLastDay(v === 'last')}
                    />
                    {!lastDay && (
                      <TextInput
                        value={dayOfMonth}
                        onChangeText={(v) => setDayOfMonth(v.replace(/\D/g, '').slice(0, 2))}
                        keyboardType="number-pad"
                        style={[styles.numInput, styles.mt]}
                      />
                    )}
                  </>
                )}

                {freq === 'YEARLY' && (
                  <>
                    <Text style={styles.recLabel}>Month & day</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
                      {MONTHS_LONG.map((m, i) => (
                        <Pressable key={m} onPress={() => setMonth(i + 1)} style={[styles.tag, month === i + 1 && styles.tagOn]}>
                          <Text style={[styles.tagText, month === i + 1 && { color: t.onInk }]}>{m.slice(0, 3)}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <TextInput
                      value={dayOfMonth}
                      onChangeText={(v) => setDayOfMonth(v.replace(/\D/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      style={[styles.numInput, styles.mt]}
                    />
                  </>
                )}

                <Text style={styles.recLabel}>Ends</Text>
                <Segmented options={ENDS} value={endType} onChange={setEndType} />
                {endType === 'ON_DATE' && (
                  <View style={styles.mt}>
                    <FieldButton small icon={<CalendarIcon size={16} color={t.ink} />} text={fmtDateShort(endDate)} onPress={() => setPicker('recEnd')} />
                  </View>
                )}
                {endType === 'AFTER_COUNT' && (
                  <View style={[styles.inline, styles.mt]}>
                    <TextInput
                      value={endCount}
                      onChangeText={(v) => setEndCount(v.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="number-pad"
                      style={styles.numInput}
                    />
                    <Text style={styles.unit}>times</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          label={editId ? 'Save Changes' : repeat ? 'Create Schedule' : 'Create Task'}
          onPress={submit}
          busy={saving}
          style={styles.submit}
        />
      </ScrollView>

      <DateSheet visible={picker === 'date'} onClose={() => setPicker(null)} value={dueDate} onPick={setDueDate} minDate={todayStr()} />
      <TimeSheet visible={picker === 'time'} onClose={() => setPicker(null)} value={dueTime} onPick={setDueTime} />
      <DateSheet visible={picker === 'recStart'} onClose={() => setPicker(null)} value={recStart} onPick={setRecStart} title="Schedule starts" />
      <TimeSheet visible={picker === 'recTime'} onClose={() => setPicker(null)} value={recTime} onPick={(v) => setRecTime(v || '09:00')} allowNone={false} />
      <DateSheet visible={picker === 'recEnd'} onClose={() => setPicker(null)} value={endDate} onPick={setEndDate} minDate={recStart} title="Schedule ends" />
      <PeopleSheet
        visible={picker === 'person'}
        onClose={() => setPicker(null)}
        people={assignable}
        selectedId={assignedTo}
        meId={viewer.id}
        onPick={(p) => setAssignedTo(p.id)}
      />
    </KeyboardAvoidingView>
  );
}

function FieldButton({ icon, text, onPress, muted, small }: { icon: React.ReactNode; text: string; onPress: () => void; muted?: boolean; small?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.fieldBtn, small && styles.fieldBtnSmall]} accessibilityRole="button">
      {icon}
      <Text style={[styles.fieldBtnText, muted && { color: t.textMuted }]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable key={k} onPress={() => onChange(k)} style={[styles.segBtn, on && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && { color: t.onInk }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 6 },
  headerTitle: { flex: 1, fontSize: 20, color: t.text, fontFamily: font.regular },
  content: { paddingHorizontal: 20 },
  invalid: { borderWidth: 1.5, borderColor: t.danger },
  duo: { flexDirection: 'row', gap: 12 },
  fieldBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.surface,
    borderRadius: radius.pill,
    minHeight: 58,
    paddingHorizontal: 20,
  },
  fieldBtnSmall: { minHeight: 48, flex: 0, backgroundColor: '#F4F3F6' },
  fieldBtnText: { fontSize: 15, color: t.text, fontFamily: font.regular, flexShrink: 1 },
  priority: { flex: 1, minHeight: 50, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  priorityText: { fontSize: 15, fontFamily: font.medium },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.surface,
    borderRadius: radius.pill,
    minHeight: 58,
    paddingLeft: 12,
    paddingRight: 20,
  },
  selectText: { flex: 1, fontSize: 15, color: t.text, fontFamily: font.medium },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#B7A6E8',
    backgroundColor: '#EEE8FB',
  },
  tagOn: { backgroundColor: '#6B55C8', borderColor: '#6B55C8' },
  tagText: { fontSize: 14, color: '#5B47B5', fontFamily: font.medium },
  tagAdd: { backgroundColor: t.surface, borderColor: t.border },
  tagInput: { minWidth: 120, color: t.text, backgroundColor: t.surface, borderColor: t.ink, paddingVertical: 0 },
  repeatCard: { backgroundColor: t.surface, borderRadius: radius.lg, padding: 18, marginTop: 22 },
  repeatHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  repeatIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.limeSoft, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { fontSize: 15, fontFamily: font.medium, color: t.text },
  repeatSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  recLabel: { fontSize: 13, color: t.textSecondary, marginTop: 16, marginBottom: 8, fontFamily: font.medium },
  recRow: { flexDirection: 'row', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numInput: {
    width: 76,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: '#F4F3F6',
    textAlign: 'center',
    fontSize: 16,
    color: t.text,
  },
  unit: { fontSize: 15, color: t.textSecondary },
  mt: { marginTop: 10 },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F3F6', alignItems: 'center', justifyContent: 'center' },
  weekdayOn: { backgroundColor: t.ink },
  weekdayText: { fontSize: 13, color: t.text, fontFamily: font.medium },
  months: { gap: 8 },
  seg: { flexDirection: 'row', backgroundColor: '#F4F3F6', borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: { backgroundColor: t.ink },
  segText: { fontSize: 13, color: t.text, fontFamily: font.medium },
  error: { color: t.danger, fontSize: 14, marginTop: 18, textAlign: 'center' },
  submit: { marginTop: 28 },
});
