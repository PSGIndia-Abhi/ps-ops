import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { font, t } from '../theme';

/** The white-track / lime-arc completion ring from the "Today's Progress" card. */
export function ProgressRing({ percent, size = 128 }: { percent: number; size?: number }) {
  const strokeW = 14;
  const r = (size - strokeW) / 2 - 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const len = (pct / 100) * c;
  const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
  const cx = size / 2;
  const knobX = cx + r * Math.cos(angle);
  const knobY = cx + r * Math.sin(angle);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r + strokeW / 2 + 1} fill={t.surface} />
        <Circle cx={cx} cy={cx} r={r - strokeW / 2 - 1} fill={t.surface} />
        <Circle cx={cx} cy={cx} r={r} stroke="#EDEDED" strokeWidth={strokeW} fill="none" />
        {pct > 0 && (
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={t.lime}
            strokeWidth={strokeW}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${len} ${c}`}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
        {pct > 0 && pct < 100 && <Circle cx={knobX} cy={knobY} r={strokeW / 2 + 1} fill={t.limeDeep} />}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.value}>
          {Math.round(pct)}
          <Text style={styles.unit}>%</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 26, color: t.ink, fontFamily: font.medium },
  unit: { fontSize: 14 },
});
