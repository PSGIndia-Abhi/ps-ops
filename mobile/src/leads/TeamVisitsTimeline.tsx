import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRightIcon } from '../components/icons';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { CheckIcon } from '../crm/ui/crmIcons';
import { CrmSkeleton } from '../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../theme';
import type { TeamVisit } from './api';

// The sales manager's "Team visits today" card: the working day as a line (9 AM - 7 PM, wider when
// a visit falls outside it) with a dot for every visit at its time, coloured by how it is going,
// and a "Now" marker. The counts sit under it. A tap opens Team visits.

type VisitState = 'done' | 'live' | 'late' | 'upcoming';

const DOT = 20;
const LANE = DOT + 6; // dots closer than a dot's width stack upwards instead of overlapping
const DAY_START = 9;
const DAY_END = 19;

function stateOf(v: TeamVisit, now: Date): VisitState {
  if (v.status === 'COMPLETED' || v.checkOutAt) return 'done';
  if (v.checkInAt) return 'live';
  const [y, m, d] = v.date.split('-').map(Number);
  const [hh, mm] = v.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0) < now ? 'late' : 'upcoming';
}

const minutesOf = (time: string) => {
  const [hh, mm] = time.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

const hourLabel = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

export function TeamVisitsTimeline({ visits, onPress }: { visits: TeamVisit[] | null; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const [width, setWidth] = useState(0);

  const model = useMemo(() => {
    const now = new Date();
    const list = (visits ?? []).filter((v) => v.status !== 'CANCELLED');
    const items = list.map((v) => ({ id: v.id, minutes: minutesOf(v.time), state: stateOf(v, now) }));
    const hours = items.map((i) => i.minutes / 60);
    const start = Math.max(0, Math.min(DAY_START, Math.floor(Math.min(...hours, DAY_START))));
    const end = Math.min(24, Math.max(DAY_END, Math.ceil(Math.max(...hours, DAY_END) + 0.5)));
    const counts = { done: 0, live: 0, late: 0, upcoming: 0 };
    items.forEach((i) => (counts[i.state] += 1));
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return { items, start, end, counts, nowMinutes, total: items.length };
  }, [visits]);

  const span = (model.end - model.start) * 60;
  const xOf = (minutes: number) => ((minutes - model.start * 60) / span) * width;

  // Lanes: left to right, each dot takes the lowest lane it fits in without touching the one before.
  const placed = useMemo(() => {
    if (!width) return [];
    const laneEnds: number[] = [];
    return [...model.items]
      .sort((a, b) => a.minutes - b.minutes)
      .map((item) => {
        const x = Math.max(DOT / 2, Math.min(width - DOT / 2, xOf(item.minutes)));
        let lane = laneEnds.findIndex((end) => end <= x - DOT);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = x;
        return { ...item, x, lane };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, width]);
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const trackHeight = lanes * LANE + 8;

  const colors: Record<VisitState, { fill: string; border: string }> = {
    done: { fill: theme.success, border: theme.success },
    live: { fill: theme.warning, border: theme.warning },
    late: { fill: theme.danger, border: theme.danger },
    upcoming: { fill: theme.surface, border: theme.textMuted },
  };

  const ticks: number[] = [];
  for (let h = model.start; h <= model.end; h += 2) ticks.push(h);
  const showNow = model.nowMinutes >= model.start * 60 && model.nowMinutes <= model.end * 60;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Team visits today: ${model.total}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.head}>
        <Text style={styles.headText}>
          {visits === null ? 'Loading visits...' : model.total === 0 ? 'No visits booked today' : `${model.total} visit${model.total === 1 ? '' : 's'} today`}
        </Text>
        <ChevronRightIcon size={18} color={theme.textMuted} />
      </View>

      {visits === null ? (
        <CrmSkeleton height={70} radius={radii.md} />
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {/* the day line, the dots on it and the "Now" marker */}
          <View style={{ height: trackHeight + 14 }}>
            <View style={[styles.line, { top: 14 + trackHeight - LANE / 2 - 1 }]} />
            {showNow && width > 0 && (
              <View style={[styles.now, { left: xOf(model.nowMinutes) - 1, height: trackHeight + 14 }]} pointerEvents="none">
                <Text style={styles.nowText}>Now</Text>
              </View>
            )}
            {placed.map((p) => {
              const c = colors[p.state];
              return (
                <View
                  key={p.id}
                  style={[
                    styles.dot,
                    p.state === 'live' && styles.dotLive,
                    { left: p.x - DOT / 2, top: 14 + trackHeight - LANE / 2 - DOT / 2 - p.lane * LANE, backgroundColor: c.fill, borderColor: c.border },
                  ]}
                >
                  {p.state === 'done' && <CheckIcon size={11} color="#fff" />}
                  {p.state === 'late' && <Text style={styles.dotMark}>!</Text>}
                  {p.state === 'live' && <View style={styles.liveCore} />}
                </View>
              );
            })}
          </View>

          {/* hour labels under the line */}
          <View style={styles.ticks}>
            {width > 0 &&
              ticks.map((h, i) => {
                // The first and last labels line up with the ends of the line, the rest centre on their hour.
                const edge = i === 0 ? 'left' : i === ticks.length - 1 && xOf(h * 60) > width - 22 ? 'right' : null;
                const left = edge === 'left' ? 0 : edge === 'right' ? width - 44 : xOf(h * 60) - 22;
                return (
                  <Text key={h} style={[styles.tick, { left, textAlign: edge ?? 'center' }]}>
                    {hourLabel(h)}
                  </Text>
                );
              })}
          </View>

          {/* counts */}
          <View style={styles.legend}>
            <Legend color={theme.success} label="Done" value={model.counts.done} />
            <Legend color={theme.warning} label="On visit" value={model.counts.live} />
            <Legend color={theme.danger} label="Late" value={model.counts.late} />
            <Legend color={theme.textMuted} label="Upcoming" value={model.counts.upcoming} hollow />
          </View>
        </View>
      )}
    </Pressable>
  );
}

function Legend({ color, label, value, hollow }: { color: string; label: string; value: number; hollow?: boolean }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { borderColor: color, backgroundColor: hollow ? theme.surface : color }]} />
      <Text style={styles.legendValue}>{value}</Text>
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.8 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: spacing.xs },
  headText: { ...typography.bodyMedium, color: t.textPrimary },
  line: { position: 'absolute' as const, left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: t.border },
  now: { position: 'absolute' as const, top: 0, width: 2, backgroundColor: t.primary, borderRadius: 1, alignItems: 'center' as const },
  nowText: { ...typography.overline, fontSize: 9, color: t.primary, position: 'absolute' as const, top: -2, width: 30, left: 4 },
  dot: {
    position: 'absolute' as const,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dotLive: { shadowColor: t.warning, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  liveCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  dotMark: { color: '#fff', fontSize: 12, fontWeight: '800' as const, lineHeight: 14 },
  ticks: { height: 18, marginTop: 4 },
  tick: { position: 'absolute' as const, width: 44, textAlign: 'center' as const, ...typography.caption, fontSize: 10, color: t.textMuted },
  legend: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: t.border },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  legendValue: { ...typography.captionMedium, color: t.textPrimary },
  legendLabel: { ...typography.caption, color: t.textMuted },
});
