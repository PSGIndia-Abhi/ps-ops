import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface BrandMarkProps {
  size?: number;
}

/**
 * The real BestServe logo (mobile/assets/logo.png) - a square, transparent
 * PNG of the brand's interlocking puzzle-piece mark. `size` sets both
 * dimensions since the source art is already 1:1; `resizeMode="contain"`
 * keeps it from ever being stretched or cropped regardless.
 *
 * No card/background wrapper: the PNG is genuinely transparent (verified -
 * not a white-background asset), so it composites cleanly straight onto the
 * screen's own background at any size.
 */
export function BrandMark({ size = 120 }: BrandMarkProps) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={[styles.image, { width: size, height: size }]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="BestServe"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
  },
});
