import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CalendarIcon } from '../../components/icons';
import { useCrmTheme } from '../../crm/theme';
import { radii, shadows, spacing, typography } from '../../theme';
import type { DashboardKpis } from '../api';
import type { PeriodKey } from '../format';
import { ICON_DEEP } from './ClientIcons';

/**
 * Home's "At a glance": a white card with a verdict, range chips, and a donut (pie) chart of the
 * period's visits - done / missed / still to come - with the on-schedule share in the middle.
 * Two tappable figures (jobs, open issues) close it.
 */

const RANGE_CHIPS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const DONE = '#1E8E3E';
const MISSED = '#D93025';
const COMING = '#1A73E8';
const SIZE = 136;
const STROKE = 20;

function verdict(score: number | null) {
  if (score === null)
    return { word: 'No visits finished yet', bg: '#F1F3F4', fg: '#5F6368' };
  if (score >= 90) return { word: 'Excellent', bg: '#E6F4EA', fg: '#137333' };
  if (score >= 75) return { word: 'Good', bg: '#E6F4EA', fg: '#137333' };
  if (score >= 50) return { word: 'Fair', bg: '#FEF7E0', fg: '#B06000' };
  return { word: 'Needs attention', bg: '#FCE8E6', fg: '#C5221F' };
}

/** Donut: one arc per non-zero part, with a small gap between parts. */
function Donut({
  parts,
  track,
}: {
  parts: { value: number; color: string }[];
  track: string;
}) {
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter(p => p.value > 0);
  const gap = shown.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <Svg width={SIZE} height={SIZE} style={styles.rotate}>
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={r}
        stroke={track}
        strokeWidth={STROKE}
        fill="none"
      />
      {total > 0 &&
        shown.map(p => {
          const len = (p.value / total) * c;
          const arc = (
            <Circle
              key={p.color}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={r}
              stroke={p.color}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return arc;
        })}
    </Svg>
  );
}

interface Props {
  kpis: DashboardKpis;
  onJobs: () => void;
  onComplaints: () => void;
  period: PeriodKey;
  /** The exact dates of the chosen period, e.g. "19 Oct – 18 Nov 2026". */
  rangeText: string;
  onPeriod: (key: PeriodKey) => void;
  /** New numbers are loading for a just-picked period: the figures dim until they arrive. */
  busy?: boolean;
  /** The Jobs / Open issues tiles at the bottom (off when the page shows them elsewhere). */
  showFigures?: boolean;
}

export function HealthCard({
  kpis,
  onJobs,
  onComplaints,
  period,
  rangeText,
  onPeriod,
  busy,
  showFigures = true,
}: Props) {
  const theme = useCrmTheme();
  const finished = kpis.visits_done + kpis.visits_missed;
  const score =
    finished > 0 ? Math.round((kpis.visits_done / finished) * 100) : null;
  const v = verdict(score);
  const toCome = kpis.upcoming_visits + kpis.visits_in_progress;
  const ink = theme.textPrimary;
  const muted = theme.textMuted;
  const soft = theme.isDark ? theme.surfaceAlt : '#F1F3F4';

  const legend = [
    { key: 'done', label: 'Done', value: kpis.visits_done, color: DONE },
    {
      key: 'missed',
      label: 'Missed',
      value: kpis.visits_missed,
      color: MISSED,
    },
    { key: 'coming', label: 'Still to come', value: toCome, color: COMING },
  ];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: theme.isDark ? 1 : 0,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: ink }]}>Service health</Text>
        <View style={[styles.verdict, { backgroundColor: v.bg }]}>
          <Text style={[styles.verdictText, { color: v.fg }]}>{v.word}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        {RANGE_CHIPS.map(chip => {
          const on = chip.key === period;
          return (
            <Pressable
              key={chip.key}
              onPress={() => onPeriod(chip.key)}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: on ? ICON_DEEP : soft },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                chip.key === 'custom' ? 'Custom dates' : chip.label
              }
              hitSlop={4}
            >
              {chip.key === 'custom' && (
                <CalendarIcon
                  size={13}
                  color={on ? '#FFFFFF' : theme.textSecondary}
                />
              )}
              <Text
                style={[
                  styles.chipText,
                  { color: on ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.range, { color: muted }]}>{rangeText}</Text>

      <View style={busy ? styles.dim : undefined}>
        <View style={styles.body}>
          <View style={styles.donut}>
            <Donut parts={legend} track={soft} />
            <View style={styles.center} pointerEvents="none">
              <Text style={[styles.score, { color: ink }]}>
                {score === null ? '—' : `${score}%`}
              </Text>
              <Text style={[styles.scoreLabel, { color: muted }]}>
                on schedule
              </Text>
            </View>
          </View>
          <View style={styles.legend}>
            {legend.map(l => (
              <View key={l.key} style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: l.color }]} />
                <Text
                  style={[styles.legendLabel, { color: theme.textSecondary }]}
                >
                  {l.label}
                </Text>
                <Text style={[styles.legendValue, { color: ink }]}>
                  {l.value}
                </Text>
              </View>
            ))}
            <Text style={[styles.note, { color: muted }]}>
              {kpis.visits_total > 0
                ? `${kpis.visits_total} visits in this period`
                : 'No visits planned in this period'}
            </Text>
          </View>
        </View>

        {showFigures && (
          <View style={styles.figures}>
            <Pressable
              onPress={onJobs}
              style={({ pressed }) => [
                styles.figure,
                { backgroundColor: soft },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Jobs: ${kpis.jobs_in_period}`}
            >
              <Text style={[styles.figureValue, { color: ink }]}>
                {kpis.jobs_in_period}
              </Text>
              <Text style={[styles.figureLabel, { color: muted }]}>Jobs</Text>
            </Pressable>
            <Pressable
              onPress={onComplaints}
              style={({ pressed }) => [
                styles.figure,
                {
                  backgroundColor: kpis.open_complaints > 0 ? '#FEF7E0' : soft,
                },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open issues: ${kpis.open_complaints}`}
            >
              <Text
                style={[
                  styles.figureValue,
                  { color: kpis.open_complaints > 0 ? '#B06000' : ink },
                ]}
              >
                {kpis.open_complaints}
              </Text>
              <Text style={[styles.figureLabel, { color: muted }]}>
                Open issues
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: spacing.lg, ...shadows.card },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.subtitle, fontSize: 17, flex: 1 },
  verdict: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verdictText: { fontSize: 12.5, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  range: { fontSize: 12, marginTop: 8 },
  dim: { opacity: 0.5 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  donut: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotate: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  center: { alignItems: 'center' },
  score: { fontSize: 26, lineHeight: 30, fontWeight: '800' },
  scoreLabel: { fontSize: 11.5, marginTop: 1 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...typography.caption, fontSize: 13.5, flex: 1 },
  legendValue: { fontSize: 15, fontWeight: '800' },
  note: { fontSize: 11.5, marginTop: 2 },
  figures: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  figure: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  figureValue: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  figureLabel: { fontSize: 12, marginTop: 1 },
});
