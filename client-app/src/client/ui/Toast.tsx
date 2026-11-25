import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The client app's toast: a floating dark pill near the bottom that slides up with a popping
 * tick (or "!" for a warning), then slides away by itself. Used for every success / info message
 * instead of inline banners. Mounted once in ClientNavigator; screens call useToast().show(...).
 */

export type ToastTone = 'success' | 'warning';

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const SHOW_MS = 2800;

function Mark({ tone, scale }: { tone: ToastTone; scale: Animated.Value }) {
  const bg = tone === 'success' ? '#22C55E' : '#F5A524';
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="12" fill={bg} />
        {tone === 'success' ? (
          <Path d="M7 12.4l3.2 3.1L17 8.8" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <Path d="M12 6.6v6.4" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
            <Circle cx="12" cy="17" r="1.5" fill="#FFFFFF" />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; key: number } | null>(null);
  const y = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.4)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(y, { toValue: 40, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [y, opacity]);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      if (!message) return;
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, tone, key: Date.now() });
      y.setValue(40);
      opacity.setValue(0);
      pop.setValue(0.4);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.sequence([Animated.delay(90), Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true })]),
      ]).start();
      timer.current = setTimeout(hide, SHOW_MS);
    },
    [y, opacity, pop, hide],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {!!toast && (
        <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 16) + 18 }]} pointerEvents="box-none">
          <Animated.View key={toast.key} style={[styles.toastShadow, { opacity, transform: [{ translateY: y }] }]}>
            <Pressable onPress={hide} style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Mark tone={toast.tone} scale={pop} />
              <Text style={styles.text} numberOfLines={3}>
                {toast.message}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100, elevation: 100 },
  toastShadow: {
    maxWidth: 520,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E2235',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 20,
    paddingVertical: 12,
  },
  text: { flexShrink: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
});
