import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { GradientCard } from '../../components/GradientCard';
import { CheckIcon } from '../../crm/ui/crmIcons';
import { LockIcon, SparkleIcon } from '../../components/icons';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { TechnicianAchievements } from './achievements';
import { LEVELS, levelFor, milestoneBadges } from './levels';

/** Bronze -> violet: one colour per milestone, so a row of earned badges reads like a collection. */
const TIER_COLORS = ['#CD7F32', '#64748B', '#F59E0B', '#2563EB', '#7C3AED'];
const TIER_LIGHT = ['#F0B27A', '#94A3B8', '#FCD34D', '#60A5FA', '#A78BFA'];

/** 0 -> 1 over ~1s each time `replayKey` changes (screen shown / refreshed) or the target changes. */
function useSweep(replayKey: number, target: number): number {
  const value = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setProgress(v));
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      value.removeListener(id);
    };
  }, [replayKey, target, value]);
  return progress;
}

// ---------------------------------------------------------------- hero: level ring

const RING = 120;
const RING_STROKE = 9;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

function LevelRing({ percent, number }: { percent: number; number: number }) {
  return (
    <View style={styles.ringWrap}>
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.25)" strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          stroke="#FFFFFF"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - percent / 100)}
          rotation={-90}
          origin={`${RING / 2}, ${RING / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringLabel}>LEVEL</Text>
        <Text style={styles.ringNumber}>{number}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- journey (roadmap of levels)

function Journey({ completed, replayKey }: { completed: number; replayKey: number }) {
  const level = levelFor(completed);
  const index = level.number - 1;
  const target = (index + (level.next ? level.percent / 100 : 0)) / (LEVELS.length - 1);
  const sweep = useSweep(replayKey, completed);

  // This lives on a bottom tab, kept mounted by React Navigation while another tab is open -
  // gated on focus so the loop doesn't keep animating (and re-rendering) forever off-screen.
  const isFocused = useIsFocused();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, pulse]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your journey</Text>
      <View style={styles.journey}>
        <View style={styles.journeyLine}>
          <View style={[styles.journeyFill, { width: `${Math.min(100, sweep * target * 100)}%` }]} />
        </View>
        {LEVELS.map((lv, i) => {
          const passed = i < index;
          const current = i === index;
          return (
            <View key={lv.name} style={styles.node} accessible accessibilityLabel={`${lv.name}: ${passed ? 'reached' : current ? 'current level' : 'locked'}`}>
              <View style={styles.nodeCircleWrap}>
                {current && (
                  <Animated.View
                    style={[
                      styles.nodeGlow,
                      { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] },
                    ]}
                  />
                )}
                <View style={[styles.nodeCircle, passed && styles.nodePassed, current && styles.nodeCurrent]}>
                  {passed ? (
                    <CheckIcon size={14} color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.nodeNumber, current && styles.nodeNumberCurrent]}>{i + 1}</Text>
                  )}
                </View>
              </View>
              <Text style={[styles.nodeName, (passed || current) && styles.nodeNameOn]} numberOfLines={2}>
                {lv.name}
              </Text>
              <Text style={styles.nodeAt}>{lv.at === 0 ? 'Start' : `${lv.at} jobs`}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- medals

const MEDAL = 56;
const MEDAL_STROKE = 4;
const MEDAL_R = (MEDAL - MEDAL_STROKE) / 2;
const MEDAL_C = 2 * Math.PI * MEDAL_R;

function Medal({ tier, earned, progress }: { tier: number; earned: boolean; progress: number }) {
  const id = `medal${tier}`;
  return (
    <View style={styles.medal}>
      <Svg width={MEDAL} height={MEDAL}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={TIER_LIGHT[tier]} />
            <Stop offset="1" stopColor={TIER_COLORS[tier]} />
          </LinearGradient>
        </Defs>
        {earned ? (
          <>
            <Circle cx={MEDAL / 2} cy={MEDAL / 2} r={MEDAL / 2 - 2} fill={`url(#${id})`} />
            <Circle cx={MEDAL / 2} cy={MEDAL / 2} r={MEDAL / 2 - 8} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.5} />
            <Path d="M14 12 A 20 20 0 0 1 30 8" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <Circle cx={MEDAL / 2} cy={MEDAL / 2} r={MEDAL_R} fill={colors.surfaceAlt} stroke={colors.border} strokeWidth={MEDAL_STROKE} />
            {progress > 0 && (
              <Circle
                cx={MEDAL / 2}
                cy={MEDAL / 2}
                r={MEDAL_R}
                fill="none"
                stroke={TIER_COLORS[tier]}
                strokeWidth={MEDAL_STROKE}
                strokeLinecap="round"
                strokeDasharray={MEDAL_C}
                strokeDashoffset={MEDAL_C * (1 - progress)}
                rotation={-90}
                origin={`${MEDAL / 2}, ${MEDAL / 2}`}
              />
            )}
          </>
        )}
      </Svg>
      <View style={styles.medalIcon} pointerEvents="none">
        {earned ? <CheckIcon size={22} color="#FFFFFF" /> : <LockIcon size={17} color={colors.textMuted} />}
      </View>
    </View>
  );
}

function Medals({ completed, replayKey }: { completed: number; replayKey: number }) {
  const badges = milestoneBadges(completed);
  const nextIndex = badges.findIndex(b => !b.earned);
  const sweep = useSweep(replayKey, completed);
  const earnedCount = badges.filter(b => b.earned).length;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Milestones</Text>
        <Text style={styles.cardMeta}>
          {earnedCount} of {badges.length} earned
        </Text>
      </View>
      <View style={styles.badgeRow}>
        {badges.map((badge, i) => (
          <View key={badge.target} style={styles.badge} accessible accessibilityLabel={`${badge.label}: ${badge.earned ? 'earned' : `${badge.remaining} to go`}`}>
            <Medal tier={i} earned={badge.earned} progress={i === nextIndex ? sweep * (completed / badge.target) : 0} />
            <Text style={[styles.badgeLabel, !badge.earned && styles.badgeLabelLocked]} numberOfLines={1}>
              {badge.label}
            </Text>
            <Text style={[styles.badgeSub, i === nextIndex && { color: TIER_COLORS[i] }]}>
              {badge.earned ? 'Earned' : i === nextIndex ? `${badge.remaining} to go` : 'Locked'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- completion gauge

const GAUGE_W = 250;
const GAUGE_R = 100;
const GAUGE_STROKE = 16;
const GAUGE_LEN = Math.PI * GAUGE_R;
const GAUGE_PATH = `M ${GAUGE_STROKE / 2 + 5} ${GAUGE_R + GAUGE_STROKE / 2} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_STROKE / 2 + 5 + GAUGE_R * 2} ${GAUGE_R + GAUGE_STROKE / 2}`;

function Gauge({ percent, counted, completed, overdue, open, replayKey }: { percent: number; counted: number; completed: number; overdue: number; open: number; replayKey: number }) {
  const sweep = useSweep(replayKey, percent);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Completion rate</Text>
      <View style={styles.gaugeWrap}>
        <Svg width={GAUGE_W} height={GAUGE_R + GAUGE_STROKE + 6}>
          <Defs>
            <LinearGradient id="gaugeFill" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#4ADE80" />
              <Stop offset="1" stopColor="#15803D" />
            </LinearGradient>
          </Defs>
          <Path d={GAUGE_PATH} stroke={colors.successBg} strokeWidth={GAUGE_STROKE} strokeLinecap="round" fill="none" />
          <Path
            d={GAUGE_PATH}
            stroke="url(#gaugeFill)"
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={GAUGE_LEN}
            strokeDashoffset={GAUGE_LEN * (1 - (sweep * percent) / 100)}
          />
        </Svg>
        <View style={styles.gaugeCenter} pointerEvents="none">
          <Text style={styles.gaugePercent}>{Math.round(sweep * percent)}%</Text>
          <Text style={styles.gaugeCaption}>{counted > 0 ? `${completed} of ${counted} jobs finished` : 'No jobs yet'}</Text>
        </View>
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, overdue === 0 ? styles.chipGood : styles.chipWarn]}>
          <Text style={[styles.chipText, { color: overdue === 0 ? colors.successText : colors.warningText }]}>
            {overdue === 0 ? 'Nothing overdue' : `${overdue} overdue`}
          </Text>
        </View>
        <View style={[styles.chip, styles.chipNeutral]}>
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>{open} open</Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the whole page

function encouragement(a: TechnicianAchievements): string {
  const level = levelFor(a.completed);
  if (a.counted === 0) return 'Your journey starts with your first job. Finish one and your first badge is yours.';
  if (!level.next) return 'You are at the top level. Keep the standard high!';
  if (a.overdue > 0) return `Clear your ${a.overdue === 1 ? 'overdue job' : `${a.overdue} overdue jobs`} to keep your record spotless - ${level.toNext} more to ${level.next.name}.`;
  return `${level.toNext} more ${level.toNext === 1 ? 'job' : 'jobs'} and you become ${level.next.name}. You've got this!`;
}

/** The technician's Performance page: level ring, journey roadmap, milestone medals, completion gauge. */
export function PerformanceView({ achievements, replayKey }: { achievements: TechnicianAchievements; replayKey: number }) {
  const { completed, open, overdue, completionPercent, counted } = achievements;
  const level = levelFor(completed);
  const sweep = useSweep(replayKey, completed);

  return (
    <View>
      <GradientCard color={colors.primary} style={styles.hero}>
        <View style={styles.blob} />
        <View style={styles.heroTop}>
          <LevelRing percent={sweep * level.percent} number={level.number} />
          <View style={styles.heroText}>
            <View style={styles.heroTitleRow}>
              <SparkleIcon size={16} color="#FFFFFF" />
              <Text style={styles.heroName}>{level.name}</Text>
            </View>
            <Text style={styles.heroCount}>
              {Math.round(sweep * completed)}
              <Text style={styles.heroCountUnit}> jobs done</Text>
            </Text>
            <Text style={styles.heroNext}>
              {level.next ? `${level.toNext} more to reach ${level.next.name}` : 'Top level reached'}
            </Text>
          </View>
        </View>
        <View style={styles.heroTiles}>
          <View style={styles.heroTile}>
            <Text style={styles.heroTileValue}>{completed}</Text>
            <Text style={styles.heroTileLabel}>Completed</Text>
          </View>
          <View style={styles.heroTile}>
            <Text style={styles.heroTileValue}>{open}</Text>
            <Text style={styles.heroTileLabel}>Open</Text>
          </View>
          <View style={styles.heroTile}>
            <Text style={styles.heroTileValue}>{overdue}</Text>
            <Text style={styles.heroTileLabel}>Overdue</Text>
          </View>
        </View>
      </GradientCard>

      <Journey completed={completed} replayKey={replayKey} />
      <Medals completed={completed} replayKey={replayKey} />
      <Gauge percent={completionPercent} counted={counted} completed={completed} overdue={overdue} open={open} replayKey={replayKey} />

      <View style={styles.message}>
        <SparkleIcon size={20} color={colors.primary} />
        <Text style={styles.messageText}>{encouragement(achievements)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.lg, marginBottom: spacing.md, overflow: 'hidden' },
  blob: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ringWrap: { width: RING, height: RING },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: { ...typography.overline, fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  ringNumber: { ...typography.display, fontSize: 44, lineHeight: 48, color: '#FFFFFF' },
  heroText: { flex: 1 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroName: { ...typography.title, color: '#FFFFFF' },
  heroCount: { ...typography.display, fontSize: 30, lineHeight: 36, color: '#FFFFFF', marginTop: 2 },
  heroCountUnit: { ...typography.body, color: 'rgba(255,255,255,0.85)' },
  heroNext: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroTiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  heroTile: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  heroTileValue: { ...typography.title, color: '#FFFFFF' },
  heroTileLabel: { ...typography.caption, fontSize: 11, color: 'rgba(255,255,255,0.85)' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  cardMeta: { ...typography.caption, color: colors.textMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },

  journey: { flexDirection: 'row', marginTop: spacing.lg },
  journeyLine: {
    position: 'absolute',
    top: 16,
    left: '10%',
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  journeyFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  node: { flex: 1, alignItems: 'center' },
  nodeCircleWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  nodeGlow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  nodeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodePassed: { backgroundColor: colors.primary, borderColor: colors.primary },
  nodeCurrent: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, borderColor: colors.surface, borderWidth: 3 },
  nodeNumber: { ...typography.captionMedium, color: colors.textMuted },
  nodeNumberCurrent: { color: '#FFFFFF' },
  nodeName: { ...typography.captionMedium, fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  nodeNameOn: { color: colors.textPrimary },
  nodeAt: { ...typography.caption, fontSize: 10, color: colors.textMuted, textAlign: 'center' },

  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  badge: { flex: 1, alignItems: 'center' },
  medal: { width: MEDAL, height: MEDAL, alignItems: 'center', justifyContent: 'center' },
  medalIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { ...typography.captionMedium, color: colors.textPrimary, marginTop: 6 },
  badgeLabelLocked: { color: colors.textMuted },
  badgeSub: { ...typography.caption, fontSize: 10, color: colors.textMuted },

  gaugeWrap: { alignItems: 'center', marginTop: spacing.sm },
  gaugeCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  gaugePercent: { ...typography.display, fontSize: 38, lineHeight: 44, color: colors.textPrimary },
  gaugeCaption: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  chip: { borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
  chipGood: { backgroundColor: colors.successBg },
  chipWarn: { backgroundColor: colors.warningBg },
  chipNeutral: { backgroundColor: colors.surfaceAlt },
  chipText: { ...typography.captionMedium },

  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoftBg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  messageText: { ...typography.body, color: colors.primary, flex: 1 },
});
