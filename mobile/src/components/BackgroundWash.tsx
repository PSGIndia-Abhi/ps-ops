import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * A whisper-soft full-screen color wash - a faint blue hint top-right
 * fading through the app's own neutral background into a faint red hint
 * bottom-left. Deliberately not shapes/blobs (that treatment was tried and
 * explicitly removed from Login) - just barely-there tint, the same
 * restrained color story (brand blue + brand red) with none of the visual
 * weight. Purely presentational: absolutely positioned behind everything
 * else, pointerEvents none, never affects layout.
 */
export function BackgroundWash() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="loginWash" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.crestBlue} stopOpacity={0.1} />
          <Stop offset="0.45" stopColor={colors.background} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.crestRed} stopOpacity={0.08} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#loginWash)" />
    </Svg>
  );
}
