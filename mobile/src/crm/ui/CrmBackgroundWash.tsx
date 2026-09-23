import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../theme';
import { useCrmTheme } from '../theme';

/** The same whisper-soft brand wash Technician Home sits on, with its middle stop following the theme so dark mode stays dark. */
export function CrmBackgroundWash() {
  const theme = useCrmTheme();
  const gradId = useRef(`crmWash${Math.round(Math.random() * 1e6)}`).current;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={gradId} x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.crestBlue} stopOpacity={theme.isDark ? 0.16 : 0.1} />
          <Stop offset="0.45" stopColor={theme.background} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.crestRed} stopOpacity={theme.isDark ? 0.1 : 0.08} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gradId})`} />
    </Svg>
  );
}
