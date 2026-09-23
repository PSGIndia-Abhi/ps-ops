import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BANNER_VARIANT_STYLE, type BannerVariant } from './Banner';
import { radii, shadows, spacing, typography } from '../theme';

export interface ToastMessage {
  message: string;
  variant: BannerVariant;
}

const AUTO_HIDE_MS = 4000;

/**
 * A screen-fixed confirmation, not a banner inside the scrolling content. It renders as a sibling of the
 * page's ScrollView (anchored to the very top of the screen) so a technician who tapped "Start Visit" from
 * the bottom action bar - scrolled well past wherever an inline Banner would sit - still sees the result.
 * Same colors/icons as Banner (BANNER_VARIANT_STYLE), just positioned to always be visible. Auto-hides
 * after a few seconds, or dismiss early with a tap.
 */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState<ToastMessage | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    setRendered(toast);
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    if (toast) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(null);
    });
  }, [toast, progress]);

  if (!rendered) return null;
  const tone = BANNER_VARIANT_STYLE[rendered.variant];

  return (
    <View
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: tone.bg },
          {
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
            ],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            onDismiss();
          }}
          style={styles.pressable}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          {rendered.variant === 'loading' ? (
            <ActivityIndicator size="small" color={tone.text} />
          ) : (
            tone.icon?.(tone.text)
          )}
          <Text style={[styles.text, { color: tone.text }]}>{rendered.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
    elevation: 50,
  },
  card: {
    borderRadius: radii.lg,
    ...shadows.floating,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  text: {
    ...typography.captionMedium,
    flexShrink: 1,
  },
});
