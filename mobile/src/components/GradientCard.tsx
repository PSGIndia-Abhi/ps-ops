import React, { useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { shadeColor } from '../utils/color';
import { colors, radii } from '../theme';

interface GradientCardProps {
  children: React.ReactNode;
  /** Base color the diagonal gradient is built from (auto light/dark shades) - defaults to the app's primary blue. */
  color?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A rounded card filled with a diagonal two-tone gradient built from a
 * single brand color, instead of a flat fill - the "hero" treatment for a
 * screen's single most important summary (Technician Home's today's-work
 * card). Same measure-then-fill approach as `ArrowButton`'s gradient (see
 * that component's comment on why react-native-svg needs real pixel
 * dimensions, not percentage strings, to avoid a squashed fill).
 */
export function GradientCard({ children, color = colors.primary, radius = radii.xl, style }: GradientCardProps) {
  const gradId = useRef(`gradCard${Math.round(Math.random() * 1e6)}`).current;
  const light = shadeColor(color, 0.14);
  const dark = shadeColor(color, -0.28);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View onLayout={onLayout} style={[styles.card, { borderRadius: radius, backgroundColor: color }, style]}>
      {!!size && (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={light} />
              <Stop offset="1" stopColor={dark} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} rx={radius} fill={`url(#${gradId})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
