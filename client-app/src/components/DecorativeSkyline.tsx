import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

interface DecorativeSkylineProps {
  height?: number;
}

interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  /** A thin spire on the roofline - only the tallest couple of buildings get one, for skyline variety rather than six identical flat tops. */
  antenna?: boolean;
}

const BUILDINGS: Building[] = [
  { x: 0, y: 60, width: 48, height: 90, fill: 'url(#skylineSoft)' },
  { x: 44, y: 25, width: 40, height: 125, fill: 'url(#skylineDeep)', antenna: true },
  { x: 80, y: 78, width: 54, height: 72, fill: 'url(#skylineSoft)' },
  { x: 300, y: 72, width: 46, height: 78, fill: 'url(#skylineSoft)' },
  { x: 340, y: 12, width: 38, height: 138, fill: 'url(#skylineDeep)', antenna: true },
  { x: 372, y: 55, width: 40, height: 95, fill: 'url(#skylineSoft)' },
];

/** A small grid of lit "windows" punched into a building - the detail that turns a flat silhouette into something that reads as an actual building rather than a colored block. */
function Windows({ x, y, width, height }: Building) {
  const cols = Math.max(2, Math.floor(width / 16));
  const colGap = width / (cols + 1);
  const rows = Math.max(2, Math.floor((height - 20) / 20));
  const rowGap = (height - 16) / (rows + 1);

  const windows: React.ReactNode[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      windows.push(
        <Rect
          key={`${r}-${c}`}
          x={x + c * colGap - 2.5}
          y={y + 12 + r * rowGap - 3}
          width={5}
          height={6}
          rx={1}
          fill={colors.surface}
          opacity={0.4}
        />,
      );
    }
  }
  return <>{windows}</>;
}

/** Two soft, overlapping-circle clouds drifting in the open sky gap between the two building clusters - fills what was previously just empty space. */
function Cloud({ cx, cy, scale = 1, opacity = 0.5 }: { cx: number; cy: number; scale?: number; opacity?: number }) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={10 * scale} fill={colors.surface} opacity={opacity} />
      <Circle cx={cx + 12 * scale} cy={cy + 3 * scale} r={7 * scale} fill={colors.surface} opacity={opacity} />
      <Circle cx={cx - 11 * scale} cy={cy + 4 * scale} r={7 * scale} fill={colors.surface} opacity={opacity} />
    </>
  );
}

/**
 * A city-skyline silhouette anchored to the bottom of the screen - lit
 * windows, a couple of rooftop antennas, soft rounded corners and two
 * drifting clouds in the open gap between the two building clusters, all
 * dressing up what used to be six flat, featureless gradient rectangles.
 * Each building still fades from a light brand tint at its roofline into a
 * deeper shade at ground level (a gradient, not a flat fill) for real depth
 * instead of a flat paper cut-out look. Purely presentational (absolutely
 * positioned, pointerEvents none).
 */
export function DecorativeSkyline({ height = 150 }: DecorativeSkylineProps) {
  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="skylineSoft" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primarySoft} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0.4} />
          </LinearGradient>
          <LinearGradient id="skylineDeep" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.crestBlue} stopOpacity={0.14} />
            <Stop offset="1" stopColor={colors.crestBlue} stopOpacity={0.32} />
          </LinearGradient>
        </Defs>

        <Cloud cx={200} cy={34} scale={1.1} opacity={0.55} />
        <Cloud cx={245} cy={58} scale={0.75} opacity={0.4} />

        {BUILDINGS.map((b, i) => (
          <React.Fragment key={i}>
            {b.antenna && (
              <Rect x={b.x + b.width / 2 - 1} y={b.y - 14} width={2} height={14} fill={colors.crestBlue} opacity={0.35} />
            )}
            <Rect x={b.x} y={b.y} width={b.width} height={b.height} rx={5} fill={b.fill} />
            <Windows {...b} />
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
