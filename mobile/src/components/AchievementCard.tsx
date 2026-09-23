import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radii, spacing, typography } from '../theme';

const TICKS = 60;
const SIZE = 112;
const CENTER = SIZE / 2;
const OUTER = CENTER - 3;
const FILLED_LENGTH = 10;
const EMPTY_LENGTH = 5;

function Gauge({ filled }: { filled: number }) {
  return (
    <Svg width={SIZE} height={SIZE}>
      {Array.from({ length: TICKS }, (_, i) => {
        const angle = ((-90 + (i * 360) / TICKS) * Math.PI) / 180;
        const on = i < filled;
        const length = on ? FILLED_LENGTH : EMPTY_LENGTH;
        return (
          <Line
            key={i}
            x1={CENTER + Math.cos(angle) * OUTER}
            y1={CENTER + Math.sin(angle) * OUTER}
            x2={CENTER + Math.cos(angle) * (OUTER - length)}
            y2={CENTER + Math.sin(angle) * (OUTER - length)}
            stroke="#FFFFFF"
            strokeOpacity={on ? 1 : 0.3}
            strokeWidth={on ? 3 : 2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

export interface AchievementTile {
  value: string;
  label: string;
}

interface AchievementCardProps {
  title: string;
  /** Small chip in the corner, e.g. the month name. */
  chip?: string;
  /** 0-100: how many of the ring's ticks are lit. */
  percent: number;
  /** Big line under the percentage (e.g. "₹16,000" or "12 done"). Leave out when there is nothing to show yet. */
  centerPrimary?: string;
  centerSecondary?: string;
  /** Shown instead of the two lines above when there is no data yet, e.g. "no leads yet". */
  centerEmpty?: string;
  tiles: AchievementTile[];
  accessibilityLabel: string;
  /** Change this (e.g. add 1) to play the sweep again - screens do after a refresh and whenever they are shown. */
  replayKey?: number;
}

/**
 * The blue "achievements" hero card used on Home for every role: a ring of ticks that sweeps up to
 * `percent` (counting the number as it goes) and up to three one-line tiles beside it.
 */
export function AchievementCard({
  title,
  chip,
  percent,
  centerPrimary,
  centerSecondary,
  centerEmpty,
  tiles,
  accessibilityLabel,
  replayKey = 0,
}: AchievementCardProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const sweep = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = sweep.addListener(({ value }) => setProgress(value));
    sweep.setValue(0);
    const animation = Animated.timing(sweep, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      sweep.removeListener(id);
    };
  }, [percent, replayKey, sweep]);

  const shownPercent = Math.round(progress * percent);
  const filled = Math.round(progress * (percent / 100) * TICKS);

  return (
    <View style={styles.card} onLayout={onLayout}>
      {!!size && (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id="achieveBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#5C8DF7" />
              <Stop offset="1" stopColor="#2247D6" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill="url(#achieveBg)" />
          <Circle cx={size.width * 0.92} cy={-size.height * 0.05} r={90} fill="#FFFFFF" fillOpacity={0.1} />
        </Svg>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {!!chip && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.gauge} accessible accessibilityLabel={accessibilityLabel}>
          <Gauge filled={filled} />
          <View style={styles.gaugeCenter} pointerEvents="none">
            <View style={styles.percentRow}>
              <Text style={styles.percentBig}>{shownPercent}</Text>
              <Text style={styles.percentSign}>%</Text>
            </View>
            {centerEmpty ? (
              <Text style={styles.gaugeSub}>{centerEmpty}</Text>
            ) : (
              <>
                {!!centerPrimary && <Text style={styles.gaugeMoney}>{centerPrimary}</Text>}
                {!!centerSecondary && <Text style={styles.gaugeSub}>{centerSecondary}</Text>}
              </>
            )}
          </View>
        </View>

        <View style={styles.tiles}>
          {tiles.map(tile => (
            <View key={tile.label} style={styles.tile}>
              <Text style={styles.tileValue}>{tile.value}</Text>
              <Text style={styles.tileLabel}>{tile.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { ...typography.bodyMedium, color: '#FFFFFF' },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  chipText: { ...typography.captionMedium, color: '#FFFFFF' },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gauge: { width: SIZE, height: SIZE },
  gaugeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentRow: { flexDirection: 'row', alignItems: 'flex-end' },
  percentBig: { ...typography.display, fontSize: 30, lineHeight: 34, color: '#FFFFFF' },
  percentSign: { ...typography.bodyMedium, color: '#FFFFFF', marginBottom: 4, marginLeft: 1 },
  gaugeMoney: { ...typography.captionMedium, color: '#FFFFFF' },
  gaugeSub: { ...typography.caption, fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  tiles: { flex: 1, gap: 6 },
  tile: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
  },
  tileValue: { ...typography.captionMedium, fontSize: 13, color: '#FFFFFF' },
  tileLabel: { ...typography.caption, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
});
