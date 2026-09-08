import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { BackgroundWash } from '../../components/BackgroundWash';
import { DecorativeSkyline } from '../../components/DecorativeSkyline';
import { Banner } from '../../components/Banner';
import { ArrowButton } from '../../components/ArrowButton';
import { TextField } from '../../components/TextField';
import { LockIcon, PersonIcon } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shown regardless of the backend's specific 401 message - deliberately
// generic (standard practice for a login form: don't reveal whether the
// email or the password was the wrong part).
const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password. Please try again.';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Derives every size/spacing value on this screen from the device's actual
 * available height/width, not a fixed set of breakpoints - a continuous
 * formula (clamped to sane min/max) scales smoothly from small phones
 * (~600dp tall) to large ones (~900dp+), rather than "looking right" on
 * only the one phone this was designed on. Touch targets never go below
 * Android's 48dp accessibility minimum.
 */
function useResponsiveLoginSizing() {
  const { height, width } = useWindowDimensions();

  return useMemo(() => {
    const isCompact = height < 700;
    return {
      logoSize: Math.round(clamp(height * 0.085, 56, 88)),
      brandGroupGap: Math.round(clamp(height * 0.022, 10, 24)),
      screenPaddingV: Math.round(clamp(height * 0.02, 12, 24)),
      screenPaddingH: Math.round(clamp(width * 0.06, 20, 28)),
      cardPadding: Math.round(clamp(height * 0.022, 14, 20)),
      headingSize: Math.round(clamp(height * 0.03, 20, 25)),
      headingGap: Math.round(clamp(height * 0.018, 10, 20)),
      buttonHeight: Math.round(clamp(height * 0.06, 48, 54)),
      isCompact,
    };
  }, [height, width]);
}

export function LoginScreen({ navigation }: Props) {
  const { login, status } = useAuth();
  const sizing = useResponsiveLoginSizing();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorVariant, setFormErrorVariant] = useState<'error' | 'network'>('error');
  const [submitting, setSubmitting] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  // Drives the Sign In button's badge sliding left -> right (see
  // ArrowButton's `confirmSwipe`) - set the moment credentials pass
  // validation, reset back to false on a failed attempt so the button is
  // visually ready for a retry rather than stuck on the right.
  const [confirmSwipe, setConfirmSwipe] = useState(false);

  const isBusy = submitting || status === 'signingIn';

  // ---------------- Launch intro animation ----------------
  // One continuous ~2.0s pass, entirely on the native driver, matching four
  // deliberate phases so the branding actually has time to register before
  // the form takes over:
  //   0.0-0.4s  logo fades in + very subtle scale (0.94 -> 1), no bounce
  //   0.4-0.8s  logo just sits there - no animation, so it can be read
  //   0.8-1.4s  tagline, then supporting text, fade in underneath it
  //   1.4-2.0s  the whole brand group eases upward and dims slightly while
  //             the sign-in form fades/slides in beneath it
  // No bounce, no spin, no overshoot - this is a professional operations
  // tool, not a marketing splash. Unchanged by the responsive-sizing work -
  // only the sizes being animated changed, not the choreography.
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(6)).current;
  const supportOpacity = useRef(new Animated.Value(0)).current;
  const supportTranslateY = useRef(new Animated.Value(6)).current;
  const groupTranslateY = useRef(new Animated.Value(0)).current;
  const groupOpacity = useRef(new Animated.Value(1)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(26)).current;

  useEffect(() => {
    const fade = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });

    const sequence = Animated.sequence([
      // 0.0-0.4s: logo fades in with a very subtle scale, no bounce
      Animated.parallel([fade(logoOpacity, 1, 400), fade(logoScale, 1, 400)]),
      // 0.4-0.8s: hold - let the logo actually be seen before anything else moves
      Animated.delay(400),
      // 0.8-1.4s: tagline, then supporting text, fade in underneath it
      Animated.stagger(150, [
        Animated.parallel([fade(taglineOpacity, 1, 300), fade(taglineTranslateY, 0, 300)]),
        Animated.parallel([fade(supportOpacity, 1, 300), fade(supportTranslateY, 0, 300)]),
      ]),
      Animated.delay(150),
      // 1.4-2.0s: brand group eases upward and dims slightly while the form
      // fades/slides in - one continuous motion, not two separate animations
      Animated.parallel([
        Animated.timing(groupTranslateY, {
          toValue: -32,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        fade(groupOpacity, 0.92, 600),
        fade(formOpacity, 1, 600),
        fade(formTranslateY, 0, 600),
      ]),
    ]);

    sequence.start(() => setIntroDone(true));

    return () => sequence.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Enter your email address.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Enter your password.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    setFormError(null);
    if (!validate()) return;

    // Credentials look valid - play the confirm swipe right away, in
    // parallel with the actual request, rather than waiting for the server
    // to respond before showing any reaction to the tap.
    setConfirmSwipe(true);
    setSubmitting(true);
    try {
      await login(email, password);
      // Navigation away from Login happens automatically in RootNavigator
      // once auth status becomes 'signedIn' - confirmSwipe is left true,
      // since this screen unmounts before it would ever need to reset.
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        setFormErrorVariant('network');
        setFormError(err.message);
      } else {
        // Covers both a real 401 and any other unexpected failure - a login
        // form intentionally doesn't distinguish "wrong password" from
        // "server hiccup" beyond network vs. not.
        setFormErrorVariant('error');
        setFormError(INVALID_CREDENTIALS_MESSAGE);
      }
      // Failed - slide the badge back to the left so the button looks
      // ready for another attempt, not stuck mid-"confirmed".
      setConfirmSwipe(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <BackgroundWash />
      <DecorativeSkyline />

      {/* <Animated.View
        style={[styles.sideCaption, { top: insets.top + spacing.sm, opacity: logoOpacity }]}
        pointerEvents="none"
      >
        <Text style={styles.sideCaptionText}>SAFER</Text>
        <Text style={styles.sideCaptionText}>CLEANER</Text>
        <Text style={styles.sideCaptionText}>HAPPIER</Text>
        <Text style={styles.sideCaptionText}>SPACES</Text>
        <View style={styles.sideCaptionUnderline} />
      </Animated.View> */}
      

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: sizing.screenPaddingH, paddingVertical: sizing.screenPaddingV },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.brandGroup,
              { marginBottom: sizing.brandGroupGap },
              { opacity: groupOpacity, transform: [{ translateY: groupTranslateY }] },
            ]}
          >
            <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
              <BrandMark size={sizing.logoSize} />
            </Animated.View>

            {/* {!sizing.isCompact && (
              <Animated.View
                style={{ opacity: taglineOpacity, transform: [{ translateY: taglineTranslateY }] }}
              >
                <Text style={styles.tagline}>Protecting spaces.</Text>
                <Text style={[styles.tagline, styles.taglineAccent]}>Empowering teams.</Text>
              </Animated.View>
            )} */}

            <Animated.View
              style={[
                styles.supportGroup,
                { opacity: supportOpacity, transform: [{ translateY: supportTranslateY }] },
              ]}
            >
              <Text style={styles.supportText}>PEOPLE  |  PLACES  |  A CLEANER TOMORROW</Text>
              <View style={styles.supportUnderline} />
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={[
              styles.form,
              { padding: sizing.cardPadding },
              { opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
            ]}
            pointerEvents={introDone ? 'auto' : 'none'}
          >
            <Text style={[styles.welcome, { fontSize: sizing.headingSize }]}>Welcome back!</Text>
            <Text style={[styles.welcomeHint, { marginBottom: sizing.headingGap }]}>
              Sign in to manage your operations seamlessly.
            </Text>

            {!!formError && <Banner message={formError} variant={formErrorVariant} />}

            <TextField
              label="Email address"
              icon={<PersonIcon size={19} color={colors.textMuted} />}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={fieldErrors.email}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              placeholder="name@company.com"
              returnKeyType="next"
              editable={!isBusy}
            />

            <TextField
              label="Password"
              icon={<LockIcon size={19} color={colors.textMuted} />}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (fieldErrors.password)
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={fieldErrors.password}
              secureToggle
              textContentType="password"
              autoComplete="password"
              placeholder="••••••••"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!isBusy}
            />

            <Pressable
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}
              style={[styles.forgotLink, { marginBottom: sizing.headingGap }]}
              disabled={isBusy}
            >
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </Pressable>

            <ArrowButton
              label="SIGN IN"
              color={colors.crestRed}
              onPress={handleSubmit}
              loading={isBusy}
              arrowSide="left"
              confirmSwipe={confirmSwipe}
              style={[styles.submit, { minHeight: sizing.buttonHeight }]}
              testID="login-submit"
            />
          </Animated.View>

          <Animated.Text style={[styles.contactAdmin, { opacity: formOpacity }]}>
            New here? Contact your administrator.
          </Animated.Text>

          <Animated.View style={[styles.bottomCaption, { opacity: formOpacity }]}>
            <Text style={styles.bottomCaptionText}>CARING FOR EVERY SPACE</Text>
            <View style={styles.bottomCaptionUnderline} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  brandGroup: {
    alignItems: 'center',
  },
  sideCaption: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
  },
  sideCaptionText: {
    ...typography.overline,
    color: colors.textMuted,
    lineHeight: 13,
  },
  sideCaptionUnderline: {
    width: 22,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.crestRed,
    marginTop: spacing.xxs,
  },
  tagline: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  taglineAccent: {
    color: colors.crestRed,
  },
  supportGroup: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  supportText: {
    ...typography.overline,
    color: colors.textMuted,
    textAlign: 'center',
  },
  supportUnderline: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.crestRed,
    marginTop: spacing.xxs,
  },
  form: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    ...shadows.raised,
  },
  welcome: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.xxs,
    textAlign: 'center',
  },
  welcomeHint: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xxs,
  },
  forgotLinkText: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  submit: {
    width: '100%',
    borderRadius: radii.xl,
    ...shadows.raised,
  },
  contactAdmin: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  bottomCaption: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  bottomCaptionText: {
    ...typography.overline,
    color: colors.textMuted,
  },
  bottomCaptionUnderline: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.crestRed,
    marginTop: spacing.xxs,
  },
});
