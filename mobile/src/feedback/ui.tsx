import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PersonIcon, PinIcon } from '../components/icons';
import { CloseIcon } from '../components/icons';
import { CheckIcon, ChevronDownIcon } from '../crm/ui/crmIcons';
import { StatusBadge } from '../crm/ui/StatusBadge';
import { DateSheet, Sheet } from '../tasks/ui/sheets';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';
import { PRIORITY, longDay, monthLabel, questionModes, type Period, type QuestionMode } from './format';
import type { Department, Question, Response, Submission } from './types';

/** Small building blocks shared by the Customer Feedback screens. */
const factory = (t: CrmTheme) => ({
  chipRow: { flexDirection: 'row' as const, gap: spacing.xs },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chipOn: { backgroundColor: t.primary, borderColor: t.primary },
  chipText: { ...typography.captionMedium, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  card: { backgroundColor: t.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: t.border, padding: spacing.md, marginBottom: spacing.sm, ...t.cardShadow },
  cardTitle: { ...typography.subtitle, color: t.textPrimary, flex: 1 },
  cardHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  accent: { width: 4, height: 20, borderRadius: 2, backgroundColor: t.primary },
  cardIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  q: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt },
  qText: { ...typography.bodyMedium, color: t.textPrimary, marginBottom: spacing.xs },
  req: { color: t.danger },
  optional: { ...typography.caption, color: t.textMuted },
  svcTag: { ...typography.caption, fontWeight: '700' as const, color: t.accentText },
  qSkipped: { opacity: 0.7 },
  modes: { marginBottom: spacing.xs },
  skip: { alignSelf: 'flex-start' as const, marginBottom: spacing.xs },
  skipText: { ...typography.caption, color: t.primary, textDecorationLine: 'underline' as const },
  opts: { flexDirection: 'row' as const, gap: spacing.xs },
  opt: { flex: 1, minHeight: 44, borderRadius: radii.md, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  optGood: { borderColor: '#BBF7D0' },
  optBad: { borderColor: '#FECACA' },
  optGoodOn: { backgroundColor: t.success, borderColor: t.success },
  optBadOn: { backgroundColor: t.danger, borderColor: t.danger },
  optText: { ...typography.bodyMedium, fontWeight: '700' as const },
  optTextGood: { color: t.successText },
  optTextBad: { color: t.dangerText },
  optTextOn: { color: '#FFFFFF' },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: t.textPrimary,
    backgroundColor: t.surface,
    textAlignVertical: 'top' as const,
    ...typography.body,
  },
  alert: { borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm, borderWidth: 1 },
  alertBad: { backgroundColor: t.dangerBg, borderColor: '#FECACA' },
  alertGood: { backgroundColor: t.successBg, borderColor: '#BBF7D0' },
  alertText: { ...typography.caption },
  radio: { flexDirection: 'row' as const, gap: spacing.sm, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.xs },
  radioOn: { borderColor: t.primary, backgroundColor: t.primarySoftBg },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.textMuted, marginTop: 2 },
  dotOn: { borderWidth: 6, borderColor: t.primary },
  radioTitle: { ...typography.bodyMedium, color: t.textPrimary },
  radioHint: { ...typography.caption, color: t.textMuted },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt },
  rowText: { ...typography.caption, color: t.textPrimary, flex: 1 },
  rowRight: { flexDirection: 'row' as const, gap: 4 },
  said: { ...typography.caption, color: t.textSecondary, marginTop: spacing.xs },
  // modern question cards
  progress: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.sm },
  progressText: { ...typography.captionMedium, color: t.textSecondary },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' as const },
  barFill: { height: 6, borderRadius: 3, backgroundColor: t.success },
  qCard: { borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm, backgroundColor: t.surface },
  qCardDone: { borderColor: t.success },
  qHead: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, marginBottom: spacing.sm },
  qNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  qNoDone: { backgroundColor: t.success },
  qNoText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.primary },
  qTitle: { ...typography.bodyMedium, color: t.textPrimary, flex: 1 },
  tags: { flexDirection: 'row' as const, gap: 4, marginTop: 4, flexWrap: 'wrap' as const },
  tag: { ...typography.caption, fontWeight: '600' as const, paddingHorizontal: 8, paddingVertical: 1, borderRadius: radii.pill, overflow: 'hidden' as const },
  tagSvc: { color: t.accentText, backgroundColor: t.accentBg },
  tagOpt: { color: t.textMuted, backgroundColor: t.surfaceAlt },
  tagReq: { color: t.dangerText, backgroundColor: t.dangerBg },
  optRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  // modern answers
  ans: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt },
  ansIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const },
  ansQ: { ...typography.caption, color: t.textPrimary, flex: 1 },
  ansA: { ...typography.captionMedium, fontWeight: '700' as const },
  quote: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: t.surfaceAlt, borderLeftWidth: 3, borderLeftColor: t.primary },
  quoteLabel: { ...typography.caption, color: t.textMuted, marginBottom: 2 },
  quoteText: { ...typography.caption, color: t.textPrimary },
  // a feedback round (first call, follow-up calls)
  round: { borderWidth: 1, borderColor: t.border, borderRadius: radii.lg, padding: spacing.sm, marginBottom: spacing.sm },
  roundHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginBottom: 2 },
  roundTitle: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary, flex: 1 },
  roundMeta: { ...typography.caption, color: t.textMuted, marginBottom: spacing.xs },
  score: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.xs },
  scoreText: { ...typography.caption, color: t.textSecondary },
  roundToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, minHeight: 38, marginTop: spacing.xs, borderRadius: radii.md, backgroundColor: t.primarySoftBg },
  roundToggleText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.primary },
  issueLine: { ...typography.caption, color: t.dangerText, marginBottom: 2 },
  // customer card
  cust: { flexDirection: 'row' as const, gap: spacing.sm, alignItems: 'center' as const },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textOnPrimary },
  custName: { ...typography.subtitle, color: t.textPrimary },
  siteTag: { alignSelf: 'flex-start' as const, marginTop: 4, paddingHorizontal: 10, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: t.accentBg },
  siteTagText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.accentText },
  custRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: spacing.sm },
  custRowText: { ...typography.caption, color: t.textSecondary, flex: 1 },
  svcRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: spacing.sm },
  svcChip: { ...typography.caption, fontWeight: '600' as const, color: t.primary, backgroundColor: t.primarySoftBg, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' as const },
  ansFold: { paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.surfaceAlt },
  ansFoldHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 32 },
  ansBody: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginTop: spacing.xs, marginLeft: 34, padding: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: t.surfaceAlt },
  ansLabel: { ...typography.caption, color: t.textMuted },
  flip: { transform: [{ rotate: '180deg' }] },
  // The down arrow that opens a feedback round's answers.
  roundArrow: { width: 30, height: 30, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.primarySoftBg },
});

export function useFeedbackStyles() {
  return useCrmStyles(factory);
}

/** A row of filter chips; the selected one is solid blue. */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value || 'all'} onPress={() => onChange(o.value)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Panel({ title, icon, right, children }: { title?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.card}>
      {!!title && (
        <View style={styles.cardHead}>
          {icon ? <View style={styles.cardIcon}>{icon}</View> : <View style={styles.accent} />}
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/**
 * The feedback questions (Masters > Questions) with answer buttons - good answers green, bad red -
 * and the customer's own words.
 */
export function QuestionForm({
  questions,
  answers,
  onAnswer,
  other,
  onOther,
  otherEnabled,
  mode,
  onMode,
  counts,
  onSkip,
  departments = [],
}: {
  questions: Question[];
  answers: Record<number, number>;
  onAnswer: (questionId: number, optionId: number) => void;
  other: string;
  onOther: (text: string) => void;
  otherEnabled: boolean;
  /** Which questions are asked: General, Service-based, Both or a department (with how many each gives). */
  mode: QuestionMode;
  onMode: (mode: QuestionMode) => void;
  counts: Record<string, number>;
  /** The departments whose questions can be asked instead. */
  departments?: Department[];
  /** Clears the answer of an optional question (skips it). */
  onSkip: (questionId: number) => void;
}) {
  const { styles, theme } = useCrmStyles(factory);
  const done = questions.filter((q) => answers[q.id]).length;
  const pct = questions.length ? Math.round((done / questions.length) * 100) : 0;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modes}>
        <Chips options={questionModes(departments).filter((m) => counts[m.value] > 0).map((m) => ({ value: m.value, label: `${m.label} · ${counts[m.value]}` }))} value={mode} onChange={onMode} />
      </ScrollView>
      {questions.length > 0 && (
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {done} of {questions.length} answered
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}
      {questions.map((q, n) => {
        const answered = !!answers[q.id];
        return (
          <View key={q.id} style={[styles.qCard, answered && styles.qCardDone]}>
            <View style={styles.qHead}>
              <View style={[styles.qNo, answered && styles.qNoDone]}>
                {answered ? <CheckIcon size={14} color="#FFFFFF" /> : <Text style={styles.qNoText}>{n + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.qTitle}>{q.question_text}</Text>
                <View style={styles.tags}>
                  {q.is_required ? <Text style={[styles.tag, styles.tagReq]}>Required</Text> : <Text style={[styles.tag, styles.tagOpt]}>Optional</Text>}
                  {q.question_type === 'SERVICE' && <Text style={[styles.tag, styles.tagSvc]}>Service</Text>}
                </View>
              </View>
            </View>
            <View style={styles.opts} accessibilityRole="radiogroup">
              {q.options.map((o) => {
                const on = answers[q.id] === o.id;
                const tint = on ? '#FFFFFF' : o.is_bad ? theme.danger : theme.success;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => onAnswer(q.id, o.id)}
                    style={[styles.opt, o.is_bad ? styles.optBad : styles.optGood, on && (o.is_bad ? styles.optBadOn : styles.optGoodOn)]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={styles.optRow}>
                      {o.is_bad ? <CloseIcon size={14} color={tint} /> : <CheckIcon size={14} color={tint} />}
                      <Text style={[styles.optText, o.is_bad ? styles.optTextBad : styles.optTextGood, on && styles.optTextOn]}>{o.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {!q.is_required && answered && (
              <Pressable onPress={() => onSkip(q.id)} hitSlop={8} style={[styles.skip, { marginTop: spacing.xs, marginBottom: 0 }]} accessibilityRole="button">
                <Text style={styles.skipText}>Skip this question</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {otherEnabled && (
        <View style={styles.qCard}>
          <Text style={[styles.qTitle, { marginBottom: spacing.xs }]}>Other feedback (optional)</Text>
          <TextInput style={styles.input} value={other} onChangeText={onOther} multiline maxLength={2000} placeholder="What the customer said" placeholderTextColor={theme.textMuted} />
        </View>
      )}
    </View>
  );
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthFactory = (t: CrmTheme) => ({
  yearBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.md },
  yearBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceAlt, alignItems: 'center' as const, justifyContent: 'center' as const },
  yearText: { ...typography.subtitle, color: t.textPrimary },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  cell: { width: '31.5%' as const, minHeight: 52, borderRadius: radii.md, borderWidth: 1, borderColor: t.border, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  cellNow: { borderColor: t.primary },
  cellOn: { backgroundColor: t.primary, borderColor: t.primary },
  cellOff: { opacity: 0.35 },
  cellText: { ...typography.bodyMedium, color: t.textPrimary },
  cellTextOn: { color: t.textOnPrimary },
  now: { alignSelf: 'center' as const, marginTop: spacing.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  nowText: { ...typography.bodyMedium, color: t.primary },
});

/**
 * A month calendar in a sheet: the year with arrows, its 12 months as a grid (months still to come
 * are greyed out) and "This month". value / onPick use "2026-11".
 */
export function MonthCalendarSheet({ visible, value, onPick, onClose }: { visible: boolean; value: string; onPick: (month: string) => void; onClose: () => void }) {
  const { styles, theme } = useCrmStyles(monthFactory);
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  useEffect(() => {
    if (visible) setYear(Number(value.slice(0, 4)));
  }, [visible, value]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a month">
      <View style={styles.yearBar}>
        <Pressable onPress={() => setYear((y) => y - 1)} style={styles.yearBtn} accessibilityLabel="Previous year">
          <ChevronLeftIcon size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.yearText}>{year}</Text>
        <Pressable onPress={() => setYear((y) => y + 1)} disabled={year >= now.getFullYear()} style={[styles.yearBtn, year >= now.getFullYear() && styles.cellOff]} accessibilityLabel="Next year">
          <ChevronRightIcon size={20} color={theme.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {MONTH_SHORT.map((label, i) => {
          const m = `${year}-${String(i + 1).padStart(2, '0')}`;
          const future = m > current;
          const on = m === value;
          return (
            <Pressable
              key={m}
              disabled={future}
              onPress={() => {
                onPick(m);
                onClose();
              }}
              style={[styles.cell, m === current && styles.cellNow, on && styles.cellOn, future && styles.cellOff]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: future }}
            >
              <Text style={[styles.cellText, on && styles.cellTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => {
          onPick(current);
          onClose();
        }}
        style={styles.now}
      >
        <Text style={styles.nowText}>This month</Text>
      </Pressable>
    </Sheet>
  );
}

const periodFactory = (t: CrmTheme) => ({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  field: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, borderWidth: 1, borderColor: t.border, borderRadius: radii.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: t.surface },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: t.primarySoftBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  hint: { ...typography.caption, fontSize: 11, color: t.textMuted },
  value: { ...typography.bodyMedium, color: t.textPrimary },
  pressed: { opacity: 0.75 },
});

/**
 * Month wise / Date wise, inline (no card of its own): month wise picks a month on a month
 * calendar, date wise picks From and To on a day calendar (To is never before From).
 */
/** withDue: also "Due today" and "All" (the call list). */
export function PeriodPicker({ value, onChange, withDue = false }: { value: Period; onChange: (p: Period) => void; withDue?: boolean }) {
  const { styles, theme } = useCrmStyles(periodFactory);
  const [picking, setPicking] = useState<'month' | 'from' | 'to' | null>(null);
  const field = (key: 'month' | 'from' | 'to', label: string, text: string, chevron = false) => (
    <Pressable key={key} onPress={() => setPicking(key)} style={({ pressed }) => [styles.field, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${label} ${text}. Change`}>
      <View style={styles.icon}>
        <CalendarIcon size={17} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.hint}>{label}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {text}
        </Text>
      </View>
      {chevron && <ChevronDownIcon size={18} color={theme.textMuted} />}
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <Chips
        options={[
          ...(withDue
            ? [
                { value: 'today' as const, label: 'Due today' },
                { value: 'all' as const, label: 'All' },
              ]
            : []),
          { value: 'month' as const, label: 'Month wise' },
          { value: 'range' as const, label: 'Date wise' },
        ]}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      {value.mode === 'today' || value.mode === 'all' ? null : value.mode === 'month' ? (
        <View style={styles.row}>{field('month', 'Month', monthLabel(value.month), true)}</View>
      ) : (
        <View style={styles.row}>
          {field('from', 'From', longDay(value.from))}
          {field('to', 'To', longDay(value.to))}
        </View>
      )}
      <MonthCalendarSheet visible={picking === 'month'} value={value.month} onPick={(month) => onChange({ ...value, month })} onClose={() => setPicking(null)} />
      <DateSheet
        visible={picking === 'from'}
        title="From date"
        value={value.from}
        onPick={(from) => onChange({ ...value, from, to: from > value.to ? from : value.to })}
        onClose={() => setPicking(null)}
      />
      <DateSheet visible={picking === 'to'} title="To date" value={value.to} minDate={value.from} onPick={(to) => onChange({ ...value, to })} onClose={() => setPicking(null)} />
    </View>
  );
}

/** One choice of a radio list (the ticket's next step). */
export function RadioCard({ title, hint, on, onPress }: { title: string; hint?: string; on: boolean; onPress: () => void }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Pressable onPress={onPress} style={[styles.radio, on && styles.radioOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <View style={[styles.dot, on && styles.dotOn]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.radioTitle}>{title}</Text>
        {!!hint && <Text style={styles.radioHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

/** A feedback's answers: a green tick or red cross, the question and the answer; onlyBad = just the issues. */
export function AnswersList({ submission, onlyBad = false }: { submission: Submission; onlyBad?: boolean }) {
  const { styles, theme } = useCrmStyles(factory);
  const rows = onlyBad ? submission.responses.filter((r) => r.is_bad) : submission.responses;
  return (
    <View>
      {rows.map((r) => (
        <View key={r.question_id} style={styles.ans}>
          <View style={[styles.ansIcon, { backgroundColor: r.is_bad ? theme.dangerBg : theme.successBg }]}>
            {r.is_bad ? <CloseIcon size={14} color={theme.danger} /> : <CheckIcon size={14} color={theme.success} />}
          </View>
          <Text style={styles.ansQ}>{r.question}</Text>
          <Text style={[styles.ansA, { color: r.is_bad ? theme.dangerText : theme.successText }]}>{r.answer}</Text>
          {r.is_bad && r.suggested_priority && <StatusBadge label={PRIORITY[r.suggested_priority].label} tone={PRIORITY[r.suggested_priority].tone} dot={false} />}
        </View>
      ))}
      {!!submission.other_feedback && (
        <View style={styles.quote}>
          <Text style={styles.quoteLabel}>Customer said</Text>
          <Text style={styles.quoteText}>“{submission.other_feedback}”</Text>
        </View>
      )}
    </View>
  );
}

/**
 * One round of feedback (the first call or a follow-up): title, result badge and how many answers were
 * good; the down arrow opens the answers (folded at first, so a call with several rounds stays short).
 */
export function FeedbackRound({ title, submission, meta }: { title: string; submission: Submission; meta: string }) {
  const { styles, theme } = useCrmStyles(factory);
  const [open, setOpen] = useState(false);
  const good = submission.responses.filter((r) => !r.is_bad).length;
  const total = submission.responses.length;
  const pct = total ? Math.round((good / total) * 100) : 0;
  return (
    <View style={styles.round}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? 'Hide' : 'Show'} the answers`}
      >
      <View style={styles.roundHead}>
        <Text style={styles.roundTitle}>{title}</Text>
        <StatusBadge label={submission.has_issue ? 'Issue' : 'Good'} tone={submission.has_issue ? 'danger' : 'success'} dot={false} />
        <View style={[styles.roundArrow, open && styles.flip]}>
          <ChevronDownIcon size={18} color={theme.primary} />
        </View>
      </View>
      <Text style={styles.roundMeta}>{meta}</Text>
      {total > 0 && (
        <View style={styles.score}>
          <Text style={styles.scoreText}>
            {good} of {total} good
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}
      </Pressable>
      {open &&
        submission.responses.map((r) => (
          <AnswerRow key={r.question_id} response={r} />
        ))}
      {open && !!submission.other_feedback && (
        <View style={styles.quote}>
          <Text style={styles.quoteLabel}>Customer said</Text>
          <Text style={styles.quoteText}>“{submission.other_feedback}”</Text>
        </View>
      )}
    </View>
  );
}

/** One answer, folded to the question and a tick / cross; its own arrow opens the answer and priority. */
function AnswerRow({ response: r }: { response: Response }) {
  const { styles, theme } = useCrmStyles(factory);
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={styles.ansFold} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <View style={styles.ansFoldHead}>
        <View style={[styles.ansIcon, { backgroundColor: r.is_bad ? theme.dangerBg : theme.successBg }]}>
          {r.is_bad ? <CloseIcon size={14} color={theme.danger} /> : <CheckIcon size={14} color={theme.success} />}
        </View>
        <Text style={styles.ansQ} numberOfLines={open ? undefined : 1}>
          {r.question}
        </Text>
        <View style={open ? styles.flip : undefined}>
          <ChevronDownIcon size={16} color={theme.textMuted} />
        </View>
      </View>
      {open && (
        <View style={styles.ansBody}>
          <Text style={styles.ansLabel}>Answer</Text>
          <Text style={[styles.ansA, { color: r.is_bad ? theme.dangerText : theme.successText }]}>{r.answer}</Text>
          {r.is_bad && r.suggested_priority && <StatusBadge label={`${PRIORITY[r.suggested_priority].label} priority`} tone={PRIORITY[r.suggested_priority].tone} dot={false} />}
        </View>
      )}
    </Pressable>
  );
}

/** Who the call is for: the customer and their site (highlighted), then short icon rows. */
export function CustomerCard({ customer, site, place, services = [], by }: { customer: string; site: string; place?: string | null; services?: string[]; by?: string | null }) {
  const { styles, theme } = useCrmStyles(factory);
  const initials = customer
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <View style={styles.card}>
      <View style={styles.cust}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.custName} numberOfLines={1}>
            {customer}
          </Text>
          <View style={styles.siteTag}>
            <Text style={styles.siteTagText} numberOfLines={1}>
              {site}
            </Text>
          </View>
        </View>
      </View>
      {!!place && (
        <View style={styles.custRow}>
          <PinIcon size={14} color={theme.textMuted} />
          <Text style={styles.custRowText} numberOfLines={1}>
            {place}
          </Text>
        </View>
      )}
      {services.length > 0 && (
        <View style={styles.svcRow}>
          {services.map((s) => (
            <Text key={s} style={styles.svcChip} numberOfLines={1}>
              {s}
            </Text>
          ))}
        </View>
      )}
      {!!by && (
        <View style={styles.custRow}>
          <PersonIcon size={14} color={theme.textMuted} />
          <Text style={styles.custRowText} numberOfLines={1}>
            {by}
          </Text>
        </View>
      )}
    </View>
  );
}
