import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { shadeColor } from '../../utils/color';
import { GlossyBadge } from '../../components/GlossyBadge';
import { ChevronRightIcon, CloseIcon, EyeIcon, LockIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { StarIcon } from '../../crm/ui/crmIcons';
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
// first, as small cards - the employee, the type, the tone, the mark, what was said, the reward -
// with Edit / Delete; filters by employee (which also shows that person's average) and tone. The
// form picks the employee from the team, a free type (types used before are chips), the note, a
// tone (Positive / Neutral / Negative), a mark out of 10 and an optional reward.

const GOLD = '#f59e0b';
const MARKS = Array.from({ length: fb.MAX_MARK }, (_, i) => i + 1);
const MARK_WORDS = ['', 'Very poor', 'Poor', 'Weak', 'Below average', 'Average', 'Fair', 'Good', 'Very good', 'Excellent', 'Outstanding'];

/** Colour of a mark: red when low, amber in the middle, blue when good, green at the top. */
function markColors(mark: number) {
  if (mark >= 9) return { fg: '#15803d', bg: '#dcfce7' };
  if (mark >= 7) return { fg: '#1d4ed8', bg: '#dbeafe' };
  if (mark >= 5) return { fg: '#b45309', bg: '#fef3c7' };
  return { fg: '#b91c1c', bg: '#fee2e2' };
}

const TONES: Record<fb.Sentiment, { fg: string; bg: string; dot: string }> = {
  Positive: { fg: '#15803d', bg: '#dcfce7', dot: '#22c55e' },
  Neutral: { fg: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
  Negative: { fg: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
};

const REWARD_TITLE = 'Reward / Achievement';

/** The mark as a ring that fills up to it, the number in the middle; `value` may be an average. */
function ScoreRing({ value, size = 50, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const { styles } = useCrmStyles(factory);
  const c = markColors(value);
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const mid = size / 2;
  const gradId = useRef(`ring${Math.round(Math.random() * 1e6)}`).current;
  return (
    <View style={[styles.ring, { width: size, height: size }]} accessibilityLabel={`${value} out of ${fb.MAX_MARK}`}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={shadeColor(c.fg, 0.35)} />
            <Stop offset="1" stopColor={c.fg} />
          </LinearGradient>
        </Defs>
        {/* soft glow, the track, then the filled arc */}
        <Circle cx={mid} cy={mid} r={r - stroke / 2 - 1} fill={c.bg} opacity={0.55} />
        <Circle cx={mid} cy={mid} r={r} stroke={c.bg} strokeWidth={stroke} fill="none" />
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${len} ${len}`}
          strokeDashoffset={len * (1 - Math.min(value, fb.MAX_MARK) / fb.MAX_MARK)}
          rotation={-90}
          origin={`${mid}, ${mid}`}
        />
      </Svg>
      <Text style={[styles.ringNum, { color: c.fg, fontSize: Math.round(size * 0.32) }]}>{value}</Text>
    </View>
  );
}

// Red -> amber -> green along the marks track, a clean heat scale.
const METER_STOPS: [number, string][] = [
  [0, '#f43f5e'],
  [0.45, '#f59e0b'],
  [0.75, '#84cc16'],
  [1, '#16a34a'],
];

/** The marks as one rounded track: it fills up to the picked mark, which sits in a raised bubble. */
function MarkMeter({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const { styles } = useCrmStyles(factory);
  const [width, setWidth] = useState(0);
  const fill = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: value, duration: 260, useNativeDriver: false }).start();
  }, [fill, value]);
  const fillWidth = fill.interpolate({ inputRange: [0, fb.MAX_MARK], outputRange: [0, width] });
  return (
    <View style={styles.meter} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={[styles.meterFill, { width: fillWidth }]}>
          {/* the gradient spans the whole track, so each mark keeps its own colour */}
          <Svg width={width} height="100%">
            <Defs>
              <LinearGradient id="meterGrad" x1="0" y1="0" x2="1" y2="0">
                {METER_STOPS.map(([at, color]) => (
                  <Stop key={at} offset={at} stopColor={color} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height="100%" fill="url(#meterGrad)" />
          </Svg>
        </Animated.View>
      )}
      {MARKS.map((m) => {
        const on = m === value;
        const filled = m < value;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityLabel={`${m} out of ${fb.MAX_MARK}`}
            accessibilityState={{ selected: on }}
            style={styles.meterCell}
          >
            {on ? (
              <View style={styles.meterBubble}>
                <Text style={[styles.meterBubbleText, { color: markColors(m).fg }]}>{m}</Text>
              </View>
            ) : (
              <Text style={[styles.meterText, filled && styles.meterTextOn]}>{m}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Thumbs up / a level line / thumbs down. */
function ToneIcon({ tone, color, size = 16 }: { tone: fb.Sentiment; color: string; size?: number }) {
  const d =
    tone === 'Positive'
      ? 'M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3m7-2V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z'
      : tone === 'Negative'
        ? 'M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17m-7 2v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z'
        : 'M8 12h8';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {tone === 'Neutral' && <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />}
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A trophy, for the reward / achievement. */
function TrophyIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </Svg>
  );
}

/** A form label; `required` adds the red star. */
function Label({ text, required }: { text: string; required?: boolean }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={styles.req}> *</Text>}
    </Text>
  );
}

function ToneTag({ tone }: { tone: fb.Sentiment }) {
  const { styles } = useCrmStyles(factory);
  const c = TONES[tone];
  return (
    <View style={[styles.tone, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.dot }]} />
      <Text style={[styles.toneText, { color: c.fg }]}>{tone}</Text>
    </View>
  );
}

type ToneFilter = 'all' | fb.Sentiment;
const TONE_FILTERS: { key: ToneFilter; label: string }[] = [{ key: 'all', label: 'All' }, ...fb.SENTIMENTS.map((t) => ({ key: t, label: t }))];

/** One filter chip; `lead` goes before the label (an avatar), `dot` puts a small coloured dot before the label. */
function FilterChip({ label, on, dot, lead, onPress }: { label: string; on: boolean; dot?: string; lead?: React.ReactNode; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.fChip, on && styles.fChipOn, pressed && styles.pressed]}
    >
      {lead}
      {!!dot && <View style={[styles.dot, { backgroundColor: dot }, on && styles.dotOn]} />}
      <Text style={[styles.fChipText, on && styles.fChipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const when = (at: string) => {
  const iso = at.replace(' ', 'T');
  return `${formatDate(iso)}, ${formatTime(iso)}`;
};

export function EmployeeFeedbackScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const [list, setList] = useState<fb.FeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<fb.FeedbackEntry | null>(null);
  const [viewing, setViewing] = useState<fb.FeedbackEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const { viewer } = useTasks();
  const [picking, setPicking] = useState(false);
  // Employee and tone filters - applied here, on everything already loaded.
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');

  const load = useCallback(() => {
    fb.listFeedback()
      .then((rows) => {
        setList(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  // Again each time the screen comes back (after adding or editing one).
  useFocusEffect(load);

  // The chosen person's entries, and their average.
  const theirs = useMemo(() => (list ?? []).filter((e) => !person || e.employee_id === person.id), [list, person]);
  const average = useMemo(() => {
    if (theirs.length === 0) return null;
    return Math.round((theirs.reduce((s, e) => s + e.rating, 0) / theirs.length) * 10) / 10;
  }, [theirs]);

  const shown = useMemo(
    () => theirs.filter((e) => toneFilter === 'all' || e.sentiment === toneFilter),
    [theirs, toneFilter],
  );
  const filtering = !!person || toneFilter !== 'all';
  const clearFilters = () => {
    setPerson(null);
    setToneFilter('all');
  };

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
              onPress={() => navigation.navigate('FeedbackForm', { employeeId: person?.id })}
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

        {/* one person: their average */}
        {person && theirs.length > 0 && (
          <View style={styles.score}>
            <ScoreRing value={average ?? 0} size={60} stroke={6} />
            <View style={styles.flex}>
              <Text style={styles.scoreTitle}>Average {average}/{fb.MAX_MARK}</Text>
              <Text style={styles.scoreSub}>
                {theirs.length} feedback{theirs.length === 1 ? '' : 's'} for {person.name}
              </Text>
            </View>
          </View>
        )}

        {/* employee and tone */}
        {list && list.length > 0 && (
          <View style={styles.filters}>
            {/* employee: a dropdown over the whole team */}
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={person ? `Employee: ${person.name}` : 'Employee: all'}
              style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
            >
              {person ? (
                <Avatar name={person.name} id={person.id} size={28} />
              ) : (
                <GlossyBadge color={theme.accent} size={28} icon={<UsersIcon size={14} color="#fff" />} />
              )}
              <Text style={[styles.dropdownText, !person && styles.dropdownAll]} numberOfLines={1}>
                {person ? person.name : 'All employees'}
              </Text>
              {person ? (
                <Pressable onPress={() => setPerson(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Show all employees" style={styles.dropdownClear}>
                  <CloseIcon size={14} color={theme.textSecondary} />
                </Pressable>
              ) : null}
              <View style={styles.chevronDown}>
                <ChevronRightIcon size={18} color={theme.textMuted} />
              </View>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {TONE_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  dot={f.key === 'all' ? undefined : TONES[f.key].dot}
                  on={toneFilter === f.key}
                  onPress={() => setToneFilter(f.key)}
                />
              ))}
            </ScrollView>
            {filtering && (
              <View style={styles.matchRow}>
                <Text style={styles.matchText}>
                  {shown.length} of {list.length}
                </Text>
                <Pressable onPress={clearFilters} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.matchClear}>Clear filters</Text>
                </Pressable>
              </View>
            )}
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
            subtitle="Tap Add to write about someone in your team."
            icon={<StarIcon size={22} color={GOLD} />}
          />
        ) : shown.length === 0 ? (
          <CrmEmptyState
            title="Nothing matches"
            subtitle="No feedback with these filters."
            icon={<StarIcon size={22} color={GOLD} />}
            action={<PrimaryButton label="Clear filters" variant="secondary" onPress={clearFilters} />}
          />
        ) : (
          shown.map((e) => (
            // The card stays short (1 line of note, 1 of reward); a tap opens everything in a sheet.
            <Pressable key={e.id} onPress={() => setViewing(e)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <View style={styles.cardHead}>
                <Avatar name={e.employee_name} id={e.employee_id} size={44} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.employee_name}
                  </Text>
                  <Text style={styles.date}>
                    {when(e.created_at)}
                    {e.updated_at ? ' · edited' : ''}
                  </Text>
                </View>
                <ScoreRing value={e.rating} />
              </View>
              <View style={styles.tags}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{e.feedback_type}</Text>
                </View>
                {!!e.sentiment && <ToneTag tone={e.sentiment} />}
              </View>
              <Text style={styles.note} numberOfLines={1}>
                {e.comments}
              </Text>
              <View style={styles.cardFoot}>
                {/* the reward shares the row with the actions */}
                {e.reward ? (
                  <View style={styles.reward}>
                    <GlossyBadge color="#f59e0b" size={28} icon={<TrophyIcon size={14} color="#fff" />} />
                    <View style={styles.flex}>
                      {/* the trophy says what it is; the full title is in the View sheet */}
                      <Text style={styles.rewardText} numberOfLines={1}>
                        {e.reward}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.flex} />
                )}
                <Pressable
                  onPress={() => setViewing(e)}
                  accessibilityRole="button"
                  accessibilityLabel="View full feedback"
                  hitSlop={6}
                  style={({ pressed }) => [styles.viewBtn, pressed && styles.pressed]}
                >
                  <EyeIcon size={15} color={theme.primary} />
                  <Text style={styles.viewText}>View</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('FeedbackForm', { id: e.id })}
                  accessibilityRole="button"
                  accessibilityLabel="Edit"
                  hitSlop={6}
                  style={({ pressed }) => [styles.actionBadge, styles.actionBadgeBlue, pressed && styles.pressed]}
                >
                  <GlossyBadge color="#3b82f6" size={40} icon={<PencilIcon size={17} color="#fff" />} />
                </Pressable>
                <Pressable
                  onPress={() => setRemoving(e)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                  hitSlop={6}
                  style={({ pressed }) => [styles.actionBadge, styles.actionBadgeRed, pressed && styles.pressed]}
                >
                  <GlossyBadge color="#ef4444" size={40} icon={<TrashIcon size={17} color="#fff" />} />
                </Pressable>
              </View>
            </Pressable>
          ))
        )}
      </CrmScreen>

      <PeopleSheet
        visible={picking}
        onClose={() => setPicking(false)}
        people={viewer.team}
        selectedId={person?.id ?? null}
        meId={viewer.id}
        title="Show feedback for"
        onPick={(p) => setPerson({ id: p.id, name: p.name })}
      />
      {/* everything about one feedback, in full */}
      <Sheet visible={!!viewing} onClose={() => setViewing(null)}>
        {viewing && (
          <ScrollView style={styles.viewScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.cardHead}>
              <Avatar name={viewing.employee_name} id={viewing.employee_id} size={52} />
              <View style={styles.flex}>
                <Text style={styles.viewName}>{viewing.employee_name}</Text>
                <Text style={styles.date}>
                  {when(viewing.created_at)}
                  {viewing.updated_at ? ' · edited' : ''}
                </Text>
              </View>
              <View style={styles.viewScore}>
                <ScoreRing value={viewing.rating} size={64} stroke={6} />
                <Text style={[styles.viewWord, { color: markColors(viewing.rating).fg }]}>{MARK_WORDS[viewing.rating]}</Text>
              </View>
            </View>
            <View style={[styles.tags, styles.viewGap]}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{viewing.feedback_type}</Text>
              </View>
              {!!viewing.sentiment && <ToneTag tone={viewing.sentiment} />}
            </View>
            <Text style={styles.viewLabel}>Feedback</Text>
            <Text style={styles.viewNote}>{viewing.comments}</Text>
            {!!viewing.reward && (
              <View style={[styles.reward, styles.rewardFull]}>
                <GlossyBadge color="#f59e0b" size={32} icon={<TrophyIcon size={15} color="#fff" />} />
                <View style={styles.flex}>
                  <Text style={styles.rewardLabel}>{REWARD_TITLE}</Text>
                  <Text style={styles.rewardText}>{viewing.reward}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}
        <View style={[styles.sheetButtons, styles.viewGap]}>
          <PrimaryButton
            label="Edit"
            variant="secondary"
            style={styles.flex}
            onPress={() => {
              const e = viewing;
              setViewing(null);
              if (e) navigation.navigate('FeedbackForm', { id: e.id });
            }}
          />
          <PrimaryButton
            label="Delete"
            variant="brand"
            style={styles.flex}
            onPress={() => {
              const e = viewing;
              setViewing(null);
              // one sheet at a time: let this one slide away first
              setTimeout(() => setRemoving(e), 350);
            }}
          />
        </View>
      </Sheet>
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
  const [sentiment, setSentiment] = useState<fb.Sentiment | null>(null);
  const [reward, setReward] = useState('');
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
        setSentiment(e.sentiment);
        setReward(e.reward ?? '');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, viewer.team]);

  const q = type.trim().toLowerCase();
  // A few at a time, not the whole list - narrows as you type (like the task type).
  const suggestions = types.filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q))).slice(0, 4);

  const save = async () => {
    setError(null);
    if (!person) return setError('Choose the employee.');
    if (!type.trim()) return setError('Enter the feedback type.');
    if (comments.trim().length < 3) return setError('Write the feedback.');
    if (!sentiment) return setError('Choose Positive, Neutral or Negative.');
    if (!rating) return setError(`Give a mark out of ${fb.MAX_MARK}.`);
    setSaving(true);
    try {
      const input = { employee_id: person.id, feedback_type: type.trim(), comments: comments.trim(), rating, sentiment, reward: reward.trim() };
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
        <>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {/* who and what */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Who & what</Text>
              <Label text="Employee" required />
              <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.picker, pressed && styles.pressed]}>
                {person ? <Avatar name={person.name} id={person.id} size={36} /> : <GlossyBadge color={theme.accent} size={36} icon={<UsersIcon size={16} color="#fff" />} />}
                <View style={styles.flex}>
                  <Text style={[styles.pickerText, !person && styles.placeholder]}>{person ? person.name : 'Choose an employee'}</Text>
                  {!!person && !!(person.designation || person.role) && <Text style={styles.filterSub}>{person.designation || person.role}</Text>}
                </View>
                <View style={styles.chevronDown}>
                  <ChevronRightIcon size={16} color={theme.textMuted} />
                </View>
              </Pressable>

              <Label text="Type" required />
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
                    <Pressable key={t} onPress={() => setType(t)} accessibilityRole="button" style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                      <PlusIcon size={12} color={theme.primary} />
                      <Text style={styles.pickText}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Label text="Feedback" required />
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
              <Text style={styles.counter}>{comments.length}/2000</Text>
            </View>

            {/* rating: live score, tone, marks */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rating</Text>
              <View style={styles.scoreHead}>
                <Text style={[styles.scoreBig, !!rating && { color: markColors(rating).fg }]}>
                  {rating}
                  <Text style={styles.scoreBigOf}> /{fb.MAX_MARK}</Text>
                </Text>
                <Text style={[styles.scoreWord, !!rating && { color: markColors(rating).fg }]}>{rating ? MARK_WORDS[rating] : 'Not rated yet'}</Text>
              </View>
              <View style={styles.scoreBar}>
                {!!rating && <View style={[styles.scoreBarFill, { width: `${(rating / fb.MAX_MARK) * 100}%`, backgroundColor: markColors(rating).fg }]} />}
              </View>

              <Label text="Tone" required />
              <View style={styles.seg}>
                {fb.SENTIMENTS.map((t) => {
                  const on = sentiment === t;
                  const c = TONES[t];
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setSentiment(t)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [styles.segBtn, on && styles.segBtnOn, on && { backgroundColor: c.bg }, pressed && styles.pressed]}
                    >
                      <ToneIcon tone={t} color={on ? c.fg : theme.textMuted} />
                      <Text style={[styles.segText, on && { color: c.fg }]}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Label text="Marks" required />
              <MarkMeter value={rating} onChange={setRating} />
            </View>

            {/* reward */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{REWARD_TITLE}</Text>
                <Text style={styles.optional}>Optional</Text>
              </View>
              <View style={styles.inputRow}>
                <TrophyIcon size={18} color="#b45309" />
                <TextInput
                  value={reward}
                  onChangeText={setReward}
                  maxLength={500}
                  placeholder="e.g. Gift voucher, Top performer"
                  placeholderTextColor={theme.textMuted}
                  style={styles.inputBare}
                />
                {!!reward && (
                  <Pressable onPress={() => setReward('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear reward" style={styles.dropdownClear}>
                    <CloseIcon size={13} color={theme.textSecondary} />
                  </Pressable>
                )}
              </View>
            </View>

            {!!error && <CrmErrorBanner message={error} />}
          </ScrollView>

          {/* save stays in reach */}
          <SafeAreaView edges={['bottom']} style={styles.footer}>
            <PrimaryButton label={id ? 'Save changes' : 'Save feedback'} onPress={save} loading={saving} />
          </SafeAreaView>
        </>
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
    backgroundColor: t.surface,
    ...t.cardShadow,
  },
  scoreTitle: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  scoreSub: { ...typography.caption, color: t.textMuted, marginTop: 2 },
  ring: { alignItems: 'center' as const, justifyContent: 'center' as const },
  ringSvg: { position: 'absolute' as const, top: 0, left: 0 },
  ringNum: { fontWeight: '800' as const },
  filters: { gap: spacing.sm },
  dropdown: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm + 2,
    height: 52,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    ...t.cardShadow,
  },
  dropdownText: { flex: 1, ...typography.bodyMedium, fontWeight: '600' as const, color: t.textPrimary },
  dropdownAll: { color: t.textSecondary },
  dropdownClear: { width: 26, height: 26, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surfaceAlt },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  chipRow: { gap: spacing.xs + 2, paddingRight: spacing.lg },
  fChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  fChipOn: { backgroundColor: t.primary, borderColor: t.primary },
  fChipText: { ...typography.captionMedium, color: t.textSecondary },
  fChipTextOn: { color: '#fff' },
  matchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 2 },
  matchText: { ...typography.caption, color: t.textMuted },
  matchClear: { ...typography.captionMedium, color: t.primary },
  card: { backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.md, gap: spacing.sm + 2, ...t.cardShadow },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm + 2 },
  name: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  date: { ...typography.caption, color: t.textMuted, marginTop: 1 },
  tags: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs + 2 },
  tone: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radii.pill },
  toneText: { ...typography.captionMedium },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#fff' },
  reward: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    height: 44,
    paddingLeft: 6,
    paddingRight: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: '#fff8eb',
    borderWidth: 1,
    borderColor: '#fde7bf',
  },
  rewardLabel: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: '#c2780a' },
  rewardText: { ...typography.captionMedium, fontWeight: '700' as const, color: '#7c3d06' },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  viewBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, height: 36, paddingHorizontal: spacing.sm + 4, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  viewText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.primary },
  req: { color: t.danger, fontWeight: '700' as const },
  // the full view sheet
  viewScroll: { maxHeight: 460 },
  viewName: { ...typography.subtitle, color: t.textPrimary },
  viewScore: { alignItems: 'center' as const, gap: 4 },
  viewWord: { fontSize: 11, fontWeight: '700' as const },
  viewGap: { marginTop: spacing.md },
  viewLabel: { ...typography.overline, color: t.textMuted, marginTop: spacing.lg, marginBottom: spacing.xs },
  viewNote: { ...typography.body, color: t.textPrimary, lineHeight: 23 },
  rewardFull: { flex: 0, height: undefined, paddingVertical: spacing.sm, borderRadius: radii.lg, marginTop: spacing.md },
  // glossy round actions with a soft coloured shadow
  actionBadge: { borderRadius: 20, elevation: 4, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  actionBadgeBlue: { shadowColor: '#3b82f6' },
  actionBadgeRed: { shadowColor: '#ef4444' },
  chip: { alignSelf: 'flex-start' as const, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  chipText: { ...typography.captionMedium, color: t.primary },
  note: { ...typography.body, color: t.textSecondary, lineHeight: 21 },
  // edit / delete: two small round icons, bottom right, under a hairline
  cardFoot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  sheetText: { ...typography.body, color: t.textSecondary, marginBottom: spacing.md },
  sheetButtons: { flexDirection: 'row' as const, gap: spacing.sm },
  // form
  form: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  section: { backgroundColor: t.surface, borderRadius: radii.xl, padding: spacing.md, ...t.cardShadow },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  sectionTitle: { ...typography.overline, color: t.textMuted, marginBottom: spacing.xs },
  optional: { ...typography.caption, color: t.textMuted, marginBottom: spacing.xs },
  label: { ...typography.captionMedium, color: t.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  counter: { ...typography.caption, color: t.textMuted, textAlign: 'right' as const, marginTop: 4 },
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
  pick: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, height: 32, paddingHorizontal: spacing.sm + 2, borderRadius: radii.pill, backgroundColor: t.primarySoftBg },
  pickText: { ...typography.captionMedium, color: t.primary },
  // live score at the top of the rating card
  scoreHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  scoreBig: { fontSize: 40, lineHeight: 46, fontWeight: '800' as const, color: t.textMuted },
  scoreBigOf: { fontSize: 18, fontWeight: '700' as const, color: t.textMuted },
  scoreWord: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textMuted },
  scoreBar: { height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const, marginTop: spacing.xs },
  scoreBarFill: { height: 6, borderRadius: 3 },
  // tone: one segmented switch
  seg: { flexDirection: 'row' as const, padding: 4, gap: 4, borderRadius: radii.pill, backgroundColor: t.surfaceAlt },
  segBtn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, height: 42, borderRadius: radii.pill },
  segBtnOn: { ...t.cardShadow },
  segText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.textSecondary },
  // marks: one rounded meter track
  meter: { flexDirection: 'row' as const, height: 50, borderRadius: radii.pill, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const, padding: 3 },
  meterFill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, overflow: 'hidden' as const, borderRadius: radii.pill },
  meterCell: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  meterText: { fontSize: 15, fontWeight: '700' as const, color: t.textSecondary },
  meterTextOn: { color: '#fff' },
  meterBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  meterBubbleText: { fontSize: 17, fontWeight: '900' as const },
  // reward
  inputRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, ...inputStyle(t), paddingVertical: 0, marginTop: spacing.xs },
  inputBare: { flex: 1, ...typography.body, color: t.textPrimary, paddingVertical: spacing.sm + 2 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border },
});
