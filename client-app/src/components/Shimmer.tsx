import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCrmTheme } from '../crm/theme';

/**
 * Skeletons with a soft shine sweeping across - shown while an API is slow, in the SHAPE of the
 * content that is coming (a document row looks like a document row), so the screen does not jump
 * when it arrives.
 *
 *   <SkeletonGroup>
 *     <Bone width={44} height={44} radius={12} />
 *     <Bone width="60%" height={14} />
 *   </SkeletonGroup>
 *
 * One SkeletonGroup = one shine band drawn over all its bones (a single animation, not one per bone).
 */

const BoneColor = createContext<string>('#EEF0F3');

interface GroupProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function SkeletonGroup({ children, style }: GroupProps) {
  const theme = useCrmTheme();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(250),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x, width]);

  const band = Math.max(120, width * 0.45);
  const bone = theme.isDark ? theme.surfaceAlt : '#EEF0F3';
  const shine = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)';

  return (
    <BoneColor.Provider value={bone}>
      <View style={[styles.group, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Loading" accessibilityRole="progressbar">
        {children}
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.band,
              { width: band, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-band, width] }) }] },
            ]}
          >
            <Svg width={band} height="100%">
              <Defs>
                <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={shine} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={shine} stopOpacity="1" />
                  <Stop offset="1" stopColor={shine} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={band} height="100%" fill="url(#shine)" />
            </Svg>
          </Animated.View>
        )}
      </View>
    </BoneColor.Provider>
  );
}

interface BoneProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** One grey placeholder shape. Use inside a SkeletonGroup. */
export function Bone({ width = '100%', height = 14, radius = 7, style }: BoneProps) {
  const color = useContext(BoneColor);
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  group: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
