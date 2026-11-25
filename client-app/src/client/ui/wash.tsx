import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCrmTheme } from '../../crm/theme';

/**
 * The soft brand background (pale blue to rose, corner to corner) drawn behind a full screen.
 * Same look as the staff app's lead screens.
 */
export function BrandWash() {
  const theme = useCrmTheme();
  const id = useRef(`brandWash${Math.round(Math.random() * 1e9)}`).current;
  // Light: the pale blue and rose of the brand. Dark: the same hues as a faint glow.
  const top = theme.isDark ? '#12213D' : '#D9E9FB';
  const bottom = theme.isDark ? '#1A1420' : '#F8EEF1';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.42" stopColor={theme.background} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
