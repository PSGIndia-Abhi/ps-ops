import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GlossyBadge } from '../../components/GlossyBadge';
import { ChevronRightIcon, LockIcon, PlusIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState, CrmErrorBanner, CrmScreen, CrmSkeleton } from '../../crm/ui/CrmScreen';
import { PrimaryButton } from '../../crm/ui/PrimaryButton';
import { radii, spacing, typography } from '../../theme';
import { formatDate, formatTime } from '../../utils/date';
import * as fb from '../feedbackApi';
import type { TaskStackParamList } from '../navigation';
import { errorMessage, useTasks } from '../TasksContext';
import type { TeamMember } from '../types';
import { Avatar, ScreenHeader, inputStyle } from '../ui/parts';
import { PeopleSheet, Sheet } from '../ui/sheets';

// Employee feedback (Managing Director only, opened from Profile): every note written, newest
// first, as small cards - the employee, the type, the stars, what was said - with Edit / Delete;
// a filter by employee (which also shows that person's average). The form picks the employee
// from the team, a free type (types used before are chips), the note and 1-5 stars.

const STAR = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z';
const GOLD = '#f59e0b';
const WORDS = ['', 'Poor', 'Needs work', 'Good', 'Very good', 'Excellent'];

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.stars} accessibilityLabel={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <Path d={STAR} fill={i <= Math.round(value) ? GOLD : theme.border} />
        </Svg>
      ))}
    </View>
  );
}

const when = (at: string) => {
  const iso = at.replace(' ', 'T');
  return `${formatDate(iso)}, ${formatTime(iso)}`;
};

export function EmployeeFeedbackScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { viewer } = useTasks();
  const [filter, setFilter] = useState<TeamMember | null>(null);
  const [picking, setPicking] = useState(false);
  const [list, setList] = useState<fb.FeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<fb.FeedbackEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fb.listFeedback(filter?.id)
      .then((rows) => {
        setList(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [filter]);
  // Again each time the screen comes back (after adding or editing one).
  useFocusEffect(load);

  const average = useMemo(() => {
    if (!list || list.length === 0) return null;
    return Math.round((list.reduce((s, e) => s + e.rating, 0) / list.length) * 10) / 10;
  }, [list]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await fb.deleteFeedback(removing.id);
      setRemoving(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader
          title="Employee feedback"
          onBack={() => navigation.goBack()}
          right={
            <Pressable
              onPress={() => navigation.navigate('FeedbackForm', { employeeId: filter?.id })}
              accessibilityRole="button"
              accessibilityLabel="Add feedback"
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            >
              <PlusIcon size={16} color="#fff" />
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          }
        />
      </SafeAreaView>
      <CrmScreen edges={[]} contentStyle={styles.body}>
        {/* private note + who it is about */}
        <View style={styles.private}>
          <LockIcon size={14} color={theme.textMuted} />
          <Text style={styles.privateText}>Only you can see this.</Text>
        </View>
        <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.filter, pressed && styles.pressed]}>
          {filter ? <Avatar name={filter.name} id={filter.id} size={34} /> : <GlossyBadge color={theme.accent} size={34} icon={<UsersIcon size={16} color="#fff" />} />}
          <View style={styles.flex}>
            <Text style={styles.filterTitle}>{filter ? filter.name : 'All employees'}</Text>
            <Text style={styles.filterSub}>{filter ? filter.designation || filter.role || 'Tap to change' : 'Tap to see one person'}</Text>
          </View>
          {filter ? (
            <Pressable onPress={() => setFilter(null)} hitSlop={8} accessibilityRole="button" style={styles.clear}>
              <Text style={styles.clearText}>All</Text>
            </Pressable>
          ) : (
            <ChevronRightIcon size={16} color={theme.textMuted} />
          )}
        </Pressable>

        {/* one person: their average */}
        {filter && list && list.length > 0 && (
          <View style={styles.score}>
            <Text style={styles.scoreNum}>{average}</Text>
            <View style={styles.flex}>
              <Stars value={average ?? 0} size={18} />
              <Text style={styles.scoreSub}>
                {list.length} feedback{list.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        )}

        <CrmErrorBanner message={error} onRetry={load} />

        {!list ? (
          <>
            <CrmSkeleton height={120} radius={18} />
            <CrmSkeleton height={120} radius={18} />
          </>
        ) : list.length === 0 ? (
          <CrmEmptyState
            title="No feedback yet"
            subtitle={filter ? `Add the first note for ${filter.name}.` : 'Tap Add to write about someone in your team.'}
            icon={<Stars value={0} size={20} />}
          />
        ) : (
          list.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Avatar name={e.employee_name} id={e.employee_id} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.employee_name}
                  </Text>
                  <Text style={styles.date}>
                    {when(e.created_at)}
                    {e.updated_at ? ' · edited' : ''}
                  </Text>
                </View>
                <Stars value={e.rating} size={15} />
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{e.feedback_type}</Text>
              </View>
              <Text style={styles.note}>{e.comments}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => navigation.navigate('FeedbackForm', { id: e.id })} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => setRemoving(e)} accessibilityRole="button" style={({ pressed }) => [styles.action, styles.actionDanger, pressed && styles.pressed]}>
                  <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </CrmScreen>

      <PeopleSheet
        visible={picking}
        onClose={() => setPicking(false)}
        people={viewer.team}
        selectedId={filter?.id ?? null}
        meId={viewer.id}
        title="Show feedback for"
        onPick={(p) => setFilter(p)}
      />
      <Sheet visible={!!removing} onClose={() => setRemoving(null)} title="Delete this feedback?">
        <Text style={styles.sheetText}>
          {removing ? `"${removing.feedback_type}" for ${removing.employee_name} will be removed for good.` : ''}
        </Text>
        <View style={styles.sheetButtons}>
          <PrimaryButton label="Keep" variant="secondary" style={styles.flex} onPress={() => setRemoving(null)} />
          <PrimaryButton label="Delete" variant="brand" style={styles.flex} loading={busy} onPress={remove} />
        </View>
      </Sheet>
    </View>
  );
}

/** Add (or, with `id`, edit) one feedback. */
export function FeedbackFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { id, employeeId } = useRoute<RouteProp<TaskStackParamList, 'FeedbackForm'>>().params ?? {};
  const { styles, theme } = useCrmStyles(factory);
  const { viewer } = useTasks();
  const [person, setPerson] = useState<TeamMember | null>(() => viewer.team.find((m) => m.id === employeeId) ?? null);
  const [type, setType] = useState('');
  const [comments, setComments] = useState('');
  const [rating, setRating] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fb.feedbackTypes().then(setTypes).catch(() => setTypes([]));
  }, []);
  // Editing: start from the saved entry.
  useEffect(() => {
    if (!id) return;
    fb.listFeedback()
      .then((rows) => {
        const e = rows.find((x) => x.id === id);
        if (!e) return setError('This feedback was not found.');
        setPerson(viewer.team.find((m) => m.id === e.employee_id) ?? { id: e.employee_id, name: e.employee_name });
        setType(e.feedback_type);
        setComments(e.comments);
        setRating(e.rating);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, viewer.team]);

  const q = type.trim().toLowerCase();
  const suggestions = types.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q))).slice(0, 8);

  const save = async () => {
    setError(null);
    if (!person) return setError('Choose the employee.');
    if (!type.trim()) return setError('Enter the feedback type.');
    if (comments.trim().length < 3) return setError('Write the feedback.');
    if (!rating) return setError('Give 1 to 5 stars.');
    setSaving(true);
    try {
      const input = { employee_id: person.id, feedback_type: type.trim(), comments: comments.trim(), rating };
      if (id) await fb.updateFeedback(id, input);
      else await fb.createFeedback(input);
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader title={id ? 'Edit feedback' : 'Add feedback'} icon="close" onBack={() => navigation.goBack()} />
      </SafeAreaView>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Employee</Text>
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.picker, pressed && styles.pressed]}>
            {person ? <Avatar name={person.name} id={person.id} size={34} /> : <GlossyBadge color={theme.accent} size={34} icon={<UsersIcon size={16} color="#fff" />} />}
            <View style={styles.flex}>
              <Text style={[styles.pickerText, !person && styles.placeholder]}>{person ? person.name : 'Choose an employee'}</Text>
              {!!person && !!(person.designation || person.role) && <Text style={styles.filterSub}>{person.designation || person.role}</Text>}
            </View>
            <ChevronRightIcon size={16} color={theme.textMuted} />
          </Pressable>

          <Text style={styles.label}>Type</Text>
          <TextInput
            value={type}
            onChangeText={setType}
            maxLength={100}
            placeholder="e.g. Punctuality, Customer handling"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
          />
          {suggestions.length > 0 && (
            <View style={styles.suggest}>
              {suggestions.map((t) => (
                <Pressable key={t} onPress={() => setType(t)} accessibilityRole="button" style={({ pressed }) => [styles.chip, styles.chipPick, pressed && styles.pressed]}>
                  <Text style={styles.chipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.label}>Feedback</Text>
          <TextInput
            value={comments}
            onChangeText={setComments}
            maxLength={2000}
            multiline
            placeholder="What do you want to note about them?"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.textarea]}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Rating</Text>
          <View style={styles.rateBox}>
            <View style={styles.rateRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} onPress={() => setRating(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}>
                  <Svg width={40} height={40} viewBox="0 0 24 24">
                    <Path d={STAR} fill={i <= rating ? GOLD : 'none'} stroke={i <= rating ? GOLD : theme.textMuted} strokeWidth={1.4} strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.rateWord, !!rating && styles.rateWordOn]}>{rating ? WORDS[rating] : 'Tap a star'}</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton label={id ? 'Save changes' : 'Save feedback'} onPress={save} loading={saving} style={styles.save} />
        </ScrollView>
      )}

      <PeopleSheet
        visible={picking}
        onClose={() => setPicking(false)}
        people={viewer.team}
        selectedId={person?.id ?? null}
        meId={viewer.id}
        title="Feedback for"
        onPick={(p) => setPerson(p)}
      />
    </View>
  );
}

const factory = (t: CrmTheme) => ({
  screen: { flex: 1, backgroundColor: t.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  addBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, height: 38, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: t.primary },
  addText: { ...typography.captionMedium, color: '#fff' },
  private: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  privateText: { ...typography.caption, color: t.textMuted },
  filter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    ...t.cardShadow,
  },
  filterTitle: { ...typography.bodyMedium, color: t.textPrimary },
  filterSub: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  clear: { paddingHorizontal: spacing.md, height: 32, borderRadius: radii.pill, backgroundColor: t.primarySoftBg, justifyContent: 'center' as const },
  clearText: { ...typography.captionMedium, color: t.primary },
  score: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: '#fff7e6',
    borderWidth: 1,
    borderColor: '#fde3b0',
  },
  scoreNum: { fontSize: 32, fontWeight: '800' as const, color: '#b45309' },
  scoreSub: { ...typography.caption, color: '#92400e', marginTop: 3 },
  card: { backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.md, gap: spacing.sm, ...t.cardShadow },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2 },
  name: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  date: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  chip: { alignSelf: 'flex-start' as const, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  chipPick: { borderWidth: 1, borderColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.primary },
  note: { ...typography.body, color: t.textSecondary, lineHeight: 21 },
  actions: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, height: 38, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surfaceAlt },
  actionDanger: { backgroundColor: t.dangerBg },
  actionText: { ...typography.captionMedium, color: t.textPrimary },
  actionTextDanger: { color: t.dangerText },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  // form
  form: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: { ...typography.captionMedium, color: t.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  picker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm + 2,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  pickerText: { ...typography.bodyMedium, color: t.textPrimary },
  placeholder: { color: t.textMuted, fontWeight: '400' as const },
  input: inputStyle(t),
  textarea: { minHeight: 120, paddingTop: spacing.sm + 2 },
  suggest: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs + 2, marginTop: spacing.sm },
  rateBox: { alignItems: 'center' as const, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  rateRow: { flexDirection: 'row' as const, gap: spacing.sm },
  rateWord: { ...typography.captionMedium, color: t.textMuted, marginTop: spacing.xs },
  rateWordOn: { color: '#b45309' },
  stars: { flexDirection: 'row' as const, gap: 2 },
  error: { ...typography.caption, color: t.danger, marginTop: spacing.md },
  save: { marginTop: spacing.xl },
});
