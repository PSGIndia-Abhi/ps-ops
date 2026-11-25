import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useCrmTheme } from '../crm/theme';
import { typography } from '../theme';
import { BrandMark } from './BrandMark';

/**
 * The BestServe loader: the logo, small and still, with a thin brand-red ring running around it.
 * The logo itself never moves or changes - only the ring turns.
 *
 * Where it belongs (any app - client, lead, task, ...):
 *  - BrandLoaderOverlay: something was SUBMITTED and the server is taking a moment
 *    (send a complaint, save details, prepare a document). Appears only if the wait is noticeable.
 *  - Not on app start or while a screen's data loads - those show skeletons in the shape of the
 *    content (components/Shimmer).
 */

const RING = '#B8202B';

interface BrandLoaderProps {
  /** Outer size of the ring, in dp. The logo fills about 60% of it. */
  size?: number;
  message?: string;
  style?: ViewStyle;
}

export function BrandLoader({ size = 64, message, style }: BrandLoaderProps) {
  const theme = useCrmTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const stroke = Math.max(2.5, size / 22);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={message || 'Loading'}>
      <View style={{ width: size, height: size }}>
        {/* Quiet full track */}
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.isDark ? 'rgba(255,255,255,0.12)' : '#EEF0F3'} strokeWidth={stroke} fill="none" />
        </Svg>
        {/* The running arc */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={RING}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${c * 0.28} ${c}`}
              fill="none"
            />
          </Svg>
        </Animated.View>
        {/* The logo - still */}
        <View style={styles.center} pointerEvents="none">
          <BrandMark size={size * 0.62} />
        </View>
      </View>
      {!!message && <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>}
    </View>
  );
}

interface OverlayProps {
  visible: boolean;
  /** What is happening, e.g. "Sending your complaint". */
  message?: string;
  /** Show only if still busy after this long, so quick saves never flash a loader. */
  delayMs?: number;
}

/** Covers the screen while a submit is in flight: dimmed page, small card with the loader. */
export function BrandLoaderOverlay({ visible, message, delayMs = 400 }: OverlayProps) {
  const theme = useCrmTheme();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs]);

  return (
    <Modal visible={shown} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <BrandLoader size={60} message={message} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  message: { ...typography.bodyMedium, marginTop: 16, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.32)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { minWidth: 168, maxWidth: 260, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 24, alignItems: 'center' },
});
