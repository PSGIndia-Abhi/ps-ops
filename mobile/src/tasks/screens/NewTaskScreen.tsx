import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CalendarIcon,
  ClockIcon,
  DocumentIcon,
  SparkleIcon,
  TagIcon,
} from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import * as api from '../api';
import {
  addDays,
  fmtDateShort,
  fmtTime,
  MONTHS_LONG,
  todayStr,
  WEEKDAYS,
} from '../format';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import type {
  CreateSeriesResponse,
  CreateTaskInput,
  RecurrenceEnd,
  RecurrenceFrequency,
  TaskPriority,
  WorkTask,
} from '../types';
import {
  Avatar,
  Card,
  FieldLabel,
  inputStyle,
  PriorityChips,
  ScreenHeader,
} from '../ui/parts';
import { DateSheet, PeopleSheet, TimeSheet } from '../ui/sheets';
import { ChevronDownIcon, RepeatIcon } from '../ui/taskIcons';

const FREQUENCIES: RecurrenceFrequency[] = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
];
const FREQ_UNIT: Record<RecurrenceFrequency, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};
const ENDS: [RecurrenceEnd, string][] = [
  ['NEVER', 'Never'],
  ['ON_DATE', 'On date'],
  ['AFTER_COUNT', 'After N times'],
];
// "Last" always means the final occurrence that month, whether it's the 4th or 5th.
const MONTH_WEEK_SEG: [string, string][] = [
  ['1', 'First'],
  ['2', 'Second'],
  ['3', 'Third'],
  ['4', 'Fourth'],
  ['-1', 'Last'],
];

type Picker =
  | null
  | 'date'
  | 'time'
  | 'person'
  | 'recStart'
  | 'recTime'
  | 'recEnd';

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  field: { marginBottom: spacing.md },
  input: inputStyle(t),
  invalid: { borderColor: t.danger },
  multi: {
    minHeight: 90,
    paddingTop: spacing.sm,
    textAlignVertical: 'top' as const,
  },
  duo: { flexDirection: 'row' as const, gap: spacing.sm },
  picker: {
    ...inputStyle(t),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  pickerText: { ...typography.body, color: t.textPrimary, flex: 1 },
  muted: { color: t.textMuted },
  // Type / description / repeat continue in the same card, after a thin divider.
  moreCard: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  optRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  optIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  optTitle: { ...typography.bodyMedium, color: t.textPrimary },
  optSub: { ...typography.caption, color: t.textMuted },
  tags: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
  },
  tagOn: { backgroundColor: t.primary, borderColor: t.primary },
  tagText: { ...typography.captionMedium, color: t.textSecondary },
  tagInput: {
    minWidth: 120,
    ...typography.caption,
    color: t.textPrimary,
    paddingVertical: 0,
  },
  onPrimary: { color: t.textOnPrimary },
  recLabel: {
    ...typography.captionMedium,
    color: t.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  seg: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceAlt,
    borderRadius: radii.pill,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  segOn: { backgroundColor: t.primary },
  segText: { ...typography.captionMedium, color: t.textPrimary },
  inline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
  },
  num: {
    ...inputStyle(t),
    width: 76,
    textAlign: 'center' as const,
    minHeight: 44,
  },
  unit: { ...typography.body, color: t.textSecondary },
  weekdays: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  weekday: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: t.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  weekdayOn: { backgroundColor: t.primary },
  weekdayText: { ...typography.captionMedium, color: t.textPrimary },
  mt: { marginTop: spacing.xs },
  mb: { marginBottom: spacing.sm },
  error: {
    ...typography.captionMedium,
    color: t.dangerText,
    textAlign: 'center' as const,
    marginTop: spacing.md,
  },
  submit: { marginTop: spacing.lg },
});

export function NewTaskScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const route = useRoute<RouteProp<TaskStackParamList, 'NewTask'>>();
  const editId = route.params?.editId;
  const duplicateOf = route.params?.duplicateOf;
  const { styles, theme } = useCrmStyles(factory);
  const { viewer, assignable, patch, refresh, showToast, notifyLocal } =
    useTasks();

  const [loadingEdit, setLoadingEdit] = useState(!!editId || !!duplicateOf);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [assignedTo, setAssignedTo] = useState<number>(viewer.id);
  const [dueDate, setDueDate] = useState(route.params?.date ?? todayStr());
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [typeFocused, setTypeFocused] = useState(false);

  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFrequency>('WEEKLY');
  const [interval, setIntervalValue] = useState('1');
  const [weekdays, setWeekdays] = useState<number[]>([new Date().getDay()]);
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [monthMode, setMonthMode] = useState<'day' | 'last' | 'weekday'>('day');
  const [monthWeeks, setMonthWeeks] = useState<number[]>([2]);
  const [monthWeekdays, setMonthWeekdays] = useState<number[]>([new Date().getDay()]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [recStart, setRecStart] = useState(todayStr());
  const [recTime, setRecTime] = useState('09:00');
  const [endType, setEndType] = useState<RecurrenceEnd>('NEVER');
  const [endDate, setEndDate] = useState(addDays(todayStr(), 30));
  const [endCount, setEndCount] = useState('10');

  const [picker, setPicker] = useState<Picker>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .fetchTaskTypes()
      .then(setTypes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    api
      .getTask(editId)
      .then(task => {
        setTitle(task.title);
        setDescription(task.description || '');
        setTaskType(task.task_type || '');
        setPriority(task.priority);
      })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  // Duplicate: a brand-new task filled in from the original, which the user
  // can change before tapping Create. A past due date moves up to today.
  useEffect(() => {
    if (!duplicateOf) return;
    api
      .getTask(duplicateOf)
      .then(task => {
        setTitle(`${task.title.replace(/( \(copy\))+$/, '')} (copy)`);
        setDescription(task.description || '');
        setTaskType(task.task_type || '');
        setPriority(task.priority);
        setAssignedTo(task.assigned_to);
        setDueDate(task.due_date && task.due_date >= todayStr() ? task.due_date : todayStr());
        setDueTime(task.due_time ? task.due_time.slice(0, 5) : null);
      })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoadingEdit(false));
  }, [duplicateOf]);

  // Keep the selection valid once the team list arrives.
  useEffect(() => {
    if (!assignable.some(p => p.id === assignedTo) && assignable[0])
      setAssignedTo(assignable[0].id);
  }, [assignable, assignedTo]);

  const person = assignable.find(p => p.id === assignedTo);
  // A few matches at a time, not the whole list - narrows as you type.
  // Typing something that matches nothing just becomes a new type on save.
  const typeSuggestions = useMemo(() => {
    const q = taskType.trim().toLowerCase();
    return types.filter(t => t.toLowerCase().includes(q)).slice(0, 6);
  }, [types, taskType]);

  const toggleWeekday = (n: number) =>
    setWeekdays(w =>
      w.includes(n) ? w.filter(d => d !== n) : [...w, n].sort(),
    );
  const toggleMonthWeek = (n: number) =>
    setMonthWeeks(w =>
      w.includes(n) ? w.filter(x => x !== n) : [...w, n].sort((a, b) => a - b),
    );
  const toggleMonthWeekday = (n: number) =>
    setMonthWeekdays(w =>
      w.includes(n) ? w.filter(x => x !== n) : [...w, n].sort(),
    );

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
      if (freq === 'WEEKLY' && weekdays.length === 0)
        return setError('Pick at least one day of the week.');
      if (
        freq === 'MONTHLY' &&
        monthMode === 'weekday' &&
        (monthWeeks.length === 0 || monthWeekdays.length === 0)
      )
        return setError('Pick at least one week and one weekday.');
      if (endType === 'ON_DATE' && endDate < recStart)
        return setError('The end date is before the start date.');
      payload.recurrence = {
        frequency: freq,
        interval_value: Math.max(1, Number(interval) || 1),
        start_date: recStart,
        time_of_day: `${recTime}:00`,
        end_type: endType,
        ...(freq === 'WEEKLY' ? { days_of_week: weekdays } : {}),
        ...(freq === 'MONTHLY'
          ? monthMode === 'weekday'
            ? { month_week: monthWeeks, days_of_week: monthWeekdays }
            : monthMode === 'last'
              ? { use_last_day_of_month: true }
              : { day_of_month: Number(dayOfMonth) || 1 }
          : {}),
        ...(freq === 'YEARLY'
          ? { month_of_year: month, day_of_month: Number(dayOfMonth) || 1 }
          : {}),
        ...(endType === 'ON_DATE' ? { end_date: endDate } : {}),
        ...(endType === 'AFTER_COUNT'
          ? { end_count: Math.max(1, Number(endCount) || 1) }
          : {}),
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
        await refresh();
        if (first) {
          // The success screen is the confirmation; the bell still keeps it.
          notifyLocal(first, 'created', { toast: false });
          navigation.replace('TaskCreated', {
            taskId: first.id,
            occurrences: series.occurrences_created,
          });
        } else {
          showToast('Schedule created · first occurrence is still ahead');
          navigation.goBack();
        }
      } else {
        const task = created as WorkTask;
        patch(task);
        notifyLocal(task, 'created', { toast: false });
        navigation.replace('TaskCreated', { taskId: task.id });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadingEdit) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScreenHeader
          title={editId ? 'Edit Task' : duplicateOf ? 'Duplicate Task' : 'Create Task'}
          onBack={() => navigation.goBack()}
          large
        />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          <Card>
            <View style={styles.field}>
              <FieldLabel required>Task Title</FieldLabel>
              <TextInput
                value={title}
                onChangeText={v => {
                  setTitle(v);
                  if (error) setError('');
                }}
                placeholder="e.g. Call customer - ABC Hotels"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.input,
                  !!error && !title.trim() && styles.invalid,
                ]}
                maxLength={200}
                autoFocus={!editId}
              />
            </View>

            {!editId && !repeat && (
              <View style={[styles.duo, styles.field]}>
                <View style={styles.flex}>
                  <FieldLabel required>Due Date</FieldLabel>
                  <Pressable
                    style={styles.picker}
                    onPress={() => setPicker('date')}
                    accessibilityRole="button"
                  >
                    <CalendarIcon size={18} color={theme.textSecondary} />
                    <Text style={styles.pickerText}>
                      {fmtDateShort(dueDate)}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.flex}>
                  <FieldLabel>Time</FieldLabel>
                  <Pressable
                    style={styles.picker}
                    onPress={() => setPicker('time')}
                    accessibilityRole="button"
                  >
                    <ClockIcon size={18} color={theme.textSecondary} />
                    <Text style={[styles.pickerText, !dueTime && styles.muted]}>
                      {dueTime ? fmtTime(dueTime) : 'Any time'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!editId && (
              <View style={styles.field}>
                <FieldLabel>Assign To</FieldLabel>
                <Pressable
                  style={styles.picker}
                  onPress={() => setPicker('person')}
                  accessibilityRole="button"
                >
                  <Avatar name={person?.name} id={person?.id} size={28} />
                  <Text style={styles.pickerText} numberOfLines={1}>
                    {person
                      ? `${person.name}${
                          person.id === viewer.id ? ' (you)' : ''
                        }`
                      : 'Choose a person'}
                  </Text>
                  <ChevronDownIcon size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            )}

            <FieldLabel required>Priority</FieldLabel>
            <PriorityChips value={priority} onChange={setPriority} />

            {/* Type, description and repeat follow straight on - no "More Details" toggle. */}
            <View style={styles.moreCard}>
              <OptionTitle
                icon={<TagIcon size={18} color={theme.accent} />}
                color={theme.accentBg}
                title="Task Type"
                sub={taskType || 'Choose or add a type'}
              />
              <TextInput
                value={taskType}
                onChangeText={setTaskType}
                onFocus={() => setTypeFocused(true)}
                // Delayed so a tap on a suggestion below still registers first.
                onBlur={() => setTimeout(() => setTypeFocused(false), 150)}
                placeholder="e.g. Follow-up, Site visit"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.mb]}
                maxLength={100}
              />
              {typeFocused && typeSuggestions.length > 0 && (
                <View style={styles.tags}>
                  {typeSuggestions.map(x => (
                    <Pressable
                      key={x}
                      onPress={() => {
                        setTaskType(x);
                        setTypeFocused(false);
                      }}
                      style={styles.tag}
                      accessibilityRole="button"
                    >
                      <Text style={styles.tagText}>{x}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <OptionTitle
                icon={<DocumentIcon size={18} color={theme.success} />}
                color={theme.successBg}
                title="Description"
                sub="Add task description..."
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What needs to be done?"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.multi, styles.field]}
                multiline
              />

              {!editId && (
                <>
                  <View style={styles.optRow}>
                    <View
                      style={[
                        styles.optIcon,
                        { backgroundColor: theme.primarySoftBg },
                      ]}
                    >
                      <RepeatIcon size={18} color={theme.primary} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.optTitle}>Repeat</Text>
                      <Text style={styles.optSub}>
                        {repeat
                          ? 'Creates a recurring schedule'
                          : 'Does this repeat?'}
                      </Text>
                    </View>
                    <Switch
                      value={repeat}
                      onValueChange={setRepeat}
                      trackColor={{
                        true: theme.primarySoft,
                        false: theme.border,
                      }}
                      thumbColor={repeat ? theme.primary : theme.surface}
                    />
                  </View>

                  {repeat && (
                    <View>
                      <Segmented
                        options={FREQUENCIES.map(f => [
                          f,
                          f.charAt(0) + f.slice(1).toLowerCase(),
                        ])}
                        value={freq}
                        onChange={setFreq}
                      />
                      <View style={styles.duo}>
                        <View style={styles.flex}>
                          <Text style={styles.recLabel}>Every</Text>
                          <View style={styles.inline}>
                            <TextInput
                              value={interval}
                              onChangeText={v =>
                                setIntervalValue(
                                  v.replace(/\D/g, '').slice(0, 3),
                                )
                              }
                              keyboardType="number-pad"
                              style={styles.num}
                            />
                            <Text style={styles.unit}>
                              {FREQ_UNIT[freq]}
                              {Number(interval) === 1 ? '' : 's'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.recLabel}>At</Text>
                          <Pressable
                            style={styles.picker}
                            onPress={() => setPicker('recTime')}
                          >
                            <ClockIcon size={16} color={theme.textSecondary} />
                            <Text style={styles.pickerText}>
                              {fmtTime(recTime)}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.recLabel}>Starts</Text>
                      <Pressable
                        style={styles.picker}
                        onPress={() => setPicker('recStart')}
                      >
                        <CalendarIcon size={16} color={theme.textSecondary} />
                        <Text style={styles.pickerText}>
                          {fmtDateShort(recStart)}
                        </Text>
                      </Pressable>

                      {freq === 'WEEKLY' && (
                        <>
                          <Text style={styles.recLabel}>On these days</Text>
                          <View style={styles.weekdays}>
                            {WEEKDAYS.map((w, i) => {
                              const on = weekdays.includes(i);
                              return (
                                <Pressable
                                  key={w}
                                  onPress={() => toggleWeekday(i)}
                                  style={[
                                    styles.weekday,
                                    on && styles.weekdayOn,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.weekdayText,
                                      on && styles.onPrimary,
                                    ]}
                                  >
                                    {w.slice(0, 2)}
                                  </Text>
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
                              ['weekday', 'Weekday'],
                            ]}
                            value={monthMode}
                            onChange={setMonthMode}
                          />
                          {monthMode === 'day' && (
                            <TextInput
                              value={dayOfMonth}
                              onChangeText={v =>
                                setDayOfMonth(v.replace(/\D/g, '').slice(0, 2))
                              }
                              keyboardType="number-pad"
                              style={[styles.num, styles.mt]}
                            />
                          )}
                          {monthMode === 'weekday' && (
                            <>
                              <View style={styles.seg}>
                                {MONTH_WEEK_SEG.map(([v, label]) => {
                                  const n = Number(v);
                                  const on = monthWeeks.includes(n);
                                  return (
                                    <Pressable
                                      key={v}
                                      onPress={() => toggleMonthWeek(n)}
                                      style={[styles.segBtn, on && styles.segOn]}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: on }}
                                    >
                                      <Text
                                        style={[
                                          styles.segText,
                                          on && styles.onPrimary,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              <View style={[styles.weekdays, styles.mt]}>
                                {WEEKDAYS.map((w, i) => {
                                  const on = monthWeekdays.includes(i);
                                  return (
                                    <Pressable
                                      key={w}
                                      onPress={() => toggleMonthWeekday(i)}
                                      style={[
                                        styles.weekday,
                                        on && styles.weekdayOn,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.weekdayText,
                                          on && styles.onPrimary,
                                        ]}
                                      >
                                        {w.slice(0, 2)}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </>
                          )}
                        </>
                      )}

                      {freq === 'YEARLY' && (
                        <>
                          <Text style={styles.recLabel}>Month & day</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.inline}
                          >
                            {MONTHS_LONG.map((m, i) => (
                              <Pressable
                                key={m}
                                onPress={() => setMonth(i + 1)}
                                style={[
                                  styles.tag,
                                  month === i + 1 && styles.tagOn,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.tagText,
                                    month === i + 1 && styles.onPrimary,
                                  ]}
                                >
                                  {m.slice(0, 3)}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                          <TextInput
                            value={dayOfMonth}
                            onChangeText={v =>
                              setDayOfMonth(v.replace(/\D/g, '').slice(0, 2))
                            }
                            keyboardType="number-pad"
                            style={[styles.num, styles.mt]}
                          />
                        </>
                      )}

                      <Text style={styles.recLabel}>Ends</Text>
                      <Segmented
                        options={ENDS}
                        value={endType}
                        onChange={setEndType}
                      />
                      {endType === 'ON_DATE' && (
                        <Pressable
                          style={[styles.picker, styles.mt]}
                          onPress={() => setPicker('recEnd')}
                        >
                          <CalendarIcon size={16} color={theme.textSecondary} />
                          <Text style={styles.pickerText}>
                            {fmtDateShort(endDate)}
                          </Text>
                        </Pressable>
                      )}
                      {endType === 'AFTER_COUNT' && (
                        <View style={[styles.inline, styles.mt]}>
                          <TextInput
                            value={endCount}
                            onChangeText={v =>
                              setEndCount(v.replace(/\D/g, '').slice(0, 4))
                            }
                            keyboardType="number-pad"
                            style={styles.num}
                          />
                          <Text style={styles.unit}>times</Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          </Card>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <PrimaryButton
            label={
              editId
                ? 'Save Changes'
                : repeat
                ? 'Create Schedule'
                : 'Create Task'
            }
            icon={
              !editId ? (
                <SparkleIcon size={18} color={theme.textOnPrimary} />
              ) : undefined
            }
            onPress={submit}
            loading={saving}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <DateSheet
        visible={picker === 'date'}
        onClose={() => setPicker(null)}
        value={dueDate}
        onPick={setDueDate}
        minDate={todayStr()}
      />
      <TimeSheet
        visible={picker === 'time'}
        onClose={() => setPicker(null)}
        value={dueTime}
        onPick={setDueTime}
      />
      <DateSheet
        visible={picker === 'recStart'}
        onClose={() => setPicker(null)}
        value={recStart}
        onPick={setRecStart}
        title="Schedule starts"
      />
      <TimeSheet
        visible={picker === 'recTime'}
        onClose={() => setPicker(null)}
        value={recTime}
        onPick={v => setRecTime(v || '09:00')}
        allowNone={false}
      />
      <DateSheet
        visible={picker === 'recEnd'}
        onClose={() => setPicker(null)}
        value={endDate}
        onPick={setEndDate}
        minDate={recStart}
        title="Schedule ends"
      />
      <PeopleSheet
        visible={picker === 'person'}
        onClose={() => setPicker(null)}
        people={assignable}
        selectedId={assignedTo}
        meId={viewer.id}
        onPick={p => setAssignedTo(p.id)}
      />
    </SafeAreaView>
  );
}

function OptionTitle({
  icon,
  color,
  title,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  sub: string;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.optRow}>
      <View style={[styles.optIcon, { backgroundColor: color }]}>{icon}</View>
      <View style={styles.flex}>
        <Text style={styles.optTitle}>{title}</Text>
        <Text style={styles.optSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.seg}>
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={[styles.segBtn, on && styles.segOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text
              style={[styles.segText, on && styles.onPrimary]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
