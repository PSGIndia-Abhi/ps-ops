import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { shadeColor } from '../utils/color';

interface GlossyBadgeProps {
  color: string;
  icon: React.ReactNode;
  size: number;
}

/**
 * A glossy circular icon badge - a diagonal two-tone gradient sphere (the
 * same measure-then-fill react-native-svg pattern as ArrowButton/
 * GradientCard, just circular) rather than a flat tinted circle, so an
 * icon badge reads as a genuine raised button instead of a plain chip.
 * Originated on the Technician dashboard's Quick Access tiles, promoted
 * here once Profile's Account tiles needed the exact same treatment.
 */
export function GlossyBadge({ color, icon, size }: GlossyBadgeProps) {
  const gradId = useRef(`glossyBadge${Math.round(Math.random() * 1e6)}`).current;
  const light = shadeColor(color, 0.3);
  const dark = shadeColor(color, -0.12);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={light} />
            <Stop offset="1" stopColor={dark} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
      </Svg>
      <View style={styles.iconWrap}>{icon}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
