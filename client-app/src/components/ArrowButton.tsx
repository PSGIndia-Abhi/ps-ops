import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronRightIcon } from './icons';
import { shadeColor } from '../utils/color';
import { colors, radii, spacing, typography } from '../theme';

interface ArrowButtonProps {
  label: string;
  onPress: () => void;
  /** Base color the gradient/badge/glow are built from - defaults to the app's primary blue, but callers (e.g. onboarding) can theme it per-context. */
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Badge glyph - defaults to a forward chevron ("next" affordance); a caller starting a real-world action (e.g. "Start Visit") can swap in something more literal like a play triangle. */
  icon?: (color: string) => React.ReactNode;
  /**
   * Opts into "slider" mode: the circular badge starts on this side and
   * becomes an absolutely-positioned overlay that can animate across the
   * pill via `confirmSwipe`, instead of a plain flex-row child that always
   * trails the label. Omit entirely for the original fixed-trailing-badge
   * look every other caller already uses - existing buttons are completely
   * unaffected by this prop existing.
   */
  arrowSide?: 'left' | 'right';
  /**
   * Only meaningful together with `arrowSide` - animates the badge sliding
   * to the right edge once (a "confirm" swipe) and leaves it there, e.g.
   * Login's Sign In sliding its badge left -> right the moment credentials
   * validate, while the async `login()` call is in flight and before
   * RootNavigator swaps to the signed-in app. Set back to false (e.g. after
   * a failed attempt) to slide it back to `arrowSide`, ready for a retry.
   */
  confirmSwipe?: boolean;
}

/** The circular badge's own size/inset - shared by both the static (flex) and sliding (absolute) layouts so they line up pixel-for-pixel. */
const BADGE_SIZE = 34;
const BADGE_INSET = 4;

/**
 * A more distinctive primary CTA than the plain form `Button` - a full pill
 * shape with a diagonal two-tone gradient (built from a single `color`, not
 * a second hand-picked one), a circular arrow badge, and a soft glow shadow
 * tinted to match instead of a generic dark drop-shadow. Used for a
 * screen's single most important action (Login's "Sign in", Job Detail's
 * "Start Visit"). Originated on the (since-removed) onboarding screen,
 * promoted here once Login needed the exact same treatment, rather than
 * duplicating it.
 */
export function ArrowButton({
  label,
  onPress,
  color = colors.primary,
  loading = false,
  disabled = false,
  style,
  testID,
  icon,
  arrowSide,
  confirmSwipe = false,
}: ArrowButtonProps) {
  const sliderMode = arrowSide !== undefined;
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  const gradId = useRef(`arrowBtnGrad${Math.round(Math.random() * 1e6)}`).current;
  const light = shadeColor(color, 0.16);
  const dark = shadeColor(color, -0.22);

  // The gradient fill needs real pixel dimensions - react-native-svg has no
  // reliable viewBox-less percentage sizing (it falls back to SVG's own
  // default replaced-element box, stretching/squashing the rect), so this
  // measures the button's actual rendered size via onLayout rather than
  // guessing. Falls back to a flat `color` background for the one frame
  // before that measurement lands, so there's never a flash of an
  // unstyled/transparent button. Slider mode reuses this same measurement to
  // compute the badge's left/right resting pixel offsets.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  // Slider-mode badge position, 0 (left edge) to 1 (right edge) - starts
  // wherever `arrowSide` says and animates to the right the moment
  // `confirmSwipe` turns on, or back to `arrowSide` if it turns off again
  // (a failed attempt resetting for a retry). No-op outside slider mode.
  const badgeProgress = useRef(new Animated.Value(arrowSide === 'left' ? 0 : 1)).current;
  useEffect(() => {
    if (!sliderMode) return;
    Animated.timing(badgeProgress, {
      toValue: confirmSwipe || arrowSide === 'right' ? 1 : 0,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmSwipe, sliderMode, arrowSide]);

  const badgeTranslateX = size
    ? badgeProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [BADGE_INSET, size.width - BADGE_SIZE - BADGE_INSET],
      })
    : BADGE_INSET;

  // Slider mode never swaps the badge glyph for a spinner - a spinning
  // indicator mid-slide (or one that pops in the instant `loading` goes
  // true, before the slide has even finished) read as broken, not "loading".
  // The slide itself *is* the confirmation; if the request is still in
  // flight once the badge arrives, it just sits there until success
  // navigates away or failure slides it back (see LoginScreen).
  const badgeGlyph = sliderMode ? (
    icon ? (
      icon(dark)
    ) : (
      <ChevronRightIcon size={18} color={dark} />
    )
  ) : loading ? (
    <ActivityIndicator size="small" color={dark} />
  ) : icon ? (
    icon(dark)
  ) : (
    <ChevronRightIcon size={18} color={dark} />
  );

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={() => !isDisabled && animateTo(0.97)}
      onPressOut={() => !isDisabled && animateTo(1)}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={style}
    >
      <Animated.View
        onLayout={onLayout}
        style={[
          styles.cta,
          sliderMode && styles.ctaSlider,
          { backgroundColor: color, shadowColor: color, transform: [{ scale }] },
          isDisabled && styles.disabled,
        ]}
      >
        {!!size && (
          <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={light} />
                <Stop offset="1" stopColor={dark} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.width} height={size.height} rx={size.height / 2} fill={`url(#${gradId})`} />
          </Svg>
        )}

        {sliderMode ? (
          // The badge is an absolutely-positioned overlay here (not a flex
          // child) so it can slide across the pill independently of the
          // label, which stays centered in the full width the whole time -
          // the label never reflows/jumps as the badge moves.
          <>
            <Text style={styles.label}>{label}</Text>
            <Animated.View
              style={[
                styles.arrowBadge,
                styles.arrowBadgeFloating,
                {
                  top: size ? (size.height - BADGE_SIZE) / 2 : undefined,
                  shadowColor: dark,
                  transform: [{ translateX: badgeTranslateX }],
                },
              ]}
            >
              {badgeGlyph}
            </Animated.View>
          </>
        ) : loading ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <>
            <Text style={styles.label}>{label}</Text>
            <View style={[styles.arrowBadge, { shadowColor: dark }]}>
              {icon ? icon(dark) : <ChevronRightIcon size={18} color={dark} />}
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radii.pill,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    overflow: 'hidden',
    // A glow tinted to the button's own color (set inline) reads as far more
    // premium than the app's generic neutral card shadow - bigger/softer on
    // iOS via shadowOpacity/Radius; Android only honors color via elevation
    // tint on API 28+, so a slightly higher elevation carries the rest.
    ...Platform.select({
      android: { elevation: 8 },
      default: { shadowOpacity: 0.38, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  // Slider mode's badge floats independently of the label (see render), so
  // the label gets even padding on both sides instead of the static
  // layout's asymmetric xl/xs (which assumed a fixed trailing badge) -
  // otherwise the badge would sit flush against the label's own edge at
  // whichever side it currently rests on.
  ctaSlider: {
    paddingHorizontal: BADGE_SIZE + spacing.sm,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    ...typography.button,
    fontSize: 15,
    color: colors.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  arrowBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.textOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 3 },
      default: { shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    }),
  },
  arrowBadgeFloating: {
    position: 'absolute',
    left: 0,
  },
});
