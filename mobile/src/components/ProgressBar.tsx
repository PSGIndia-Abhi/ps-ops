import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';

interface ProgressBarProps {
  /** 0-100, already computed by the caller from real counts - never guessed here. */
  percent: number;
  color?: string;
  trackColor?: string;
}

/** A plain, dependency-free linear progress bar - no charting library needed. */
export function ProgressBar({ percent, color = colors.primary, trackColor = colors.surfaceAlt }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
