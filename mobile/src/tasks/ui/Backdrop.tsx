import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { t } from '../theme';

/** The soft pink / lavender / peach wash behind every Task Management screen. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 200">
        <Defs>
          <RadialGradient id="pink" cx="10" cy="0" r="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={t.washPink} stopOpacity="1" />
            <Stop offset="1" stopColor={t.washPink} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="lav" cx="95" cy="10" r="65" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={t.washLavender} stopOpacity="1" />
            <Stop offset="1" stopColor={t.washLavender} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="peach" cx="0" cy="200" r="80" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={t.washPeach} stopOpacity="0.9" />
            <Stop offset="1" stopColor={t.washPeach} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="lav2" cx="100" cy="190" r="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={t.washLavender} stopOpacity="0.8" />
            <Stop offset="1" stopColor={t.washLavender} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="200" fill={t.washBase} />
        <Rect x="0" y="0" width="100" height="200" fill="url(#pink)" />
        <Rect x="0" y="0" width="100" height="200" fill="url(#lav)" />
        <Rect x="0" y="0" width="100" height="200" fill="url(#peach)" />
        <Rect x="0" y="0" width="100" height="200" fill="url(#lav2)" />
      </Svg>
    </View>
  );
}
