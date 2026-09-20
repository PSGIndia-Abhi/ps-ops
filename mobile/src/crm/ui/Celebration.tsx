import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radii, spacing, typography } from '../../theme';
import { formatINR } from '../format';
import { useCrmStyles, type CrmTheme } from '../theme';

const CONFETTI_COLORS = ['#F59E0B', '#EF4444', '#3B82F6', '#22C55E', '#EC4899', '#8B5CF6', '#FACC15', '#14B8A6'];
const PARTICLE_COUNT = 34;
const BURST_MS = 1500;
const GRAVITY = 170;

interface Particle {
  key: number;
  progress: Animated.Value;
  dx: number;
  dy: number;
  spin: number;
  size: number;
  color: string;
  shape: 'rect' | 'dot' | 'bar';
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 190;
    const shapes: Particle['shape'][] = ['rect', 'dot', 'bar'];
    return {
      key: i,
      progress: new Animated.Value(0),
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 60,
      spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 540),
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape: shapes[i % shapes.length],
    };
  });
}

const STEPS = [0, 0.25, 0.5, 0.75, 1];

function ParticleView({ p }: { p: Particle }) {
  // Fast burst outward, then gravity pulls it down: y = dy*t + G*t^2.
  const translateX = p.progress.interpolate({
    inputRange: STEPS,
    outputRange: STEPS.map((t) => p.dx * (1 - (1 - t) * (1 - t))),
  });
  const translateY = p.progress.interpolate({
    inputRange: STEPS,
    outputRange: STEPS.map((t) => p.dy * (1 - (1 - t) * (1 - t)) + GRAVITY * t * t),
  });
  const rotate = p.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
  const opacity = p.progress.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const scale = p.progress.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0.2, 1, 0.9] });

  const shapeStyle =
    p.shape === 'dot'
      ? { width: p.size, height: p.size, borderRadius: p.size / 2 }
      : p.shape === 'bar'
        ? { width: p.size * 0.45, height: p.size * 1.8, borderRadius: 2 }
        : { width: p.size, height: p.size * 0.7, borderRadius: 2 };

  return (
    <Animated.View
      style={[
        styles.particle,
        shapeStyle,
        { backgroundColor: p.color, opacity, transform: [{ translateX }, { translateY }, { rotate }, { scale }] },
      ]}
    />
  );
}

interface ConfettiBurstProps {
  /** Change (e.g. increment) to fire a burst. 0 = never fired. */
  burstKey: number;
  /** Where the burst starts, as a fraction of the screen height (default 0.4). */
  originY?: number;
}

/** A one-shot party burst of confetti and sparks. Covers its parent, never blocks touches. */
export function ConfettiBurst({ burstKey, originY = 0.4 }: ConfettiBurstProps) {
  const { height } = useWindowDimensions();
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (burstKey === 0) return;
    const next = makeParticles();
    setParticles(next);
    const animation = Animated.parallel(
      next.map((p) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: BURST_MS + Math.random() * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    animation.start(({ finished }) => {
      if (finished) setParticles([]);
    });
    return () => animation.stop();
  }, [burstKey]);

  if (particles.length === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.origin, { top: height * originY }]}>
        {particles.map((p) => (
          <ParticleView key={p.key} p={p} />
        ))}
      </View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const factory = (t: CrmTheme) => ({
  card: {
    width: '82%' as const,
    maxWidth: 340,
    alignItems: 'center' as const,
    backgroundColor: t.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    ...t.cardShadow,
  },
  ringWrap: { width: 112, height: 112, alignItems: 'center' as const, justifyContent: 'center' as const },
  ring: {
    position: 'absolute' as const,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: t.success,
  },
  disc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: t.success,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  textBlock: { alignItems: 'center' as const },
  title: { ...typography.title, color: t.textPrimary, marginTop: spacing.md, textAlign: 'center' as const },
  amount: { ...typography.display, color: t.textPrimary, marginTop: spacing.xs },
  sub: { ...typography.body, color: t.textMuted, marginTop: spacing.xs, textAlign: 'center' as const },
  done: {
    marginTop: spacing.lg,
    alignSelf: 'stretch' as const,
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: t.successBg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  doneText: { ...typography.button, color: t.successText },
});

interface PaymentSuccessOverlayProps {
  visible: boolean;
  amount: number;
  customerName: string;
  onDone: () => void;
}

const AUTO_CLOSE_MS = 3800;

/** Full-screen "payment successful" moment: pulsing ring, drawn check mark, confetti (Google Pay style). */
export function PaymentSuccessOverlay({ visible, amount, customerName, onDone }: PaymentSuccessOverlayProps) {
  const { styles: s } = useCrmStyles(factory);
  const backdrop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const [burstKey, setBurstKey] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!visible) return;
    backdrop.setValue(0);
    pop.setValue(0);
    draw.setValue(0);
    pulse.setValue(0);
    text.setValue(0);

    const sequence = Animated.sequence([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(draw, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(text, { toValue: 1, duration: 420, delay: 120, useNativeDriver: true }),
      ]),
    ]);
    sequence.start();
    const burst = setTimeout(() => setBurstKey((k) => k + 1), 520);
    const close = setTimeout(() => doneRef.current(), AUTO_CLOSE_MS);
    return () => {
      sequence.stop();
      clearTimeout(burst);
      clearTimeout(close);
    };
  }, [visible, backdrop, pop, draw, pulse, text]);

  const checkOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] });
  const textShift = text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel="Close" />
        <Animated.View style={[s.card, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
          <View style={s.ringWrap}>
            <Animated.View style={[s.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <Animated.View style={[s.disc, { transform: [{ scale: pop }] }]}>
              <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
                <AnimatedPath
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#FFFFFF"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={24}
                  strokeDashoffset={checkOffset}
                />
              </Svg>
            </Animated.View>
          </View>
          <Animated.View style={{ ...s.textBlock, opacity: text, transform: [{ translateY: textShift }] }}>
            <Text style={s.title}>Payment Successful</Text>
            <Text style={s.amount}>{formatINR(amount)}</Text>
            <Text style={s.sub}>Received from {customerName}</Text>
          </Animated.View>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            style={({ pressed }) => [s.done, pressed && { opacity: 0.8 }]}
            testID="payment-success-done"
          >
            <Text style={s.doneText}>Done</Text>
          </Pressable>
        </Animated.View>
        <ConfettiBurst burstKey={burstKey} originY={0.42} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 24, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  origin: { position: 'absolute', left: '50%', width: 0, height: 0 },
  particle: { position: 'absolute' },
});
