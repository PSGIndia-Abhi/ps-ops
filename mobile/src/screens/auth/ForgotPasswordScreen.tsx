import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { authApi, ApiError } from '../../api';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Real two-step OTP flow against the existing backend:
 *   POST /api/auth/forgot-password/send-otp    { email }
 *   POST /api/auth/forgot-password/verify-otp  { email, otp, newPassword }
 * (see backend/src/routes/auth.routes.js - no new backend behavior added.)
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formErrorVariant, setFormErrorVariant] = useState<'error' | 'network'>('error');
  const [submitting, setSubmitting] = useState(false);

  async function handleSendOtp() {
    setFormError(null);
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await authApi.sendForgotPasswordOtp(email.trim());
      setStep('reset');
    } catch (err) {
      applyError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (!otp.trim()) nextErrors.otp = 'Enter the code sent to your email.';
    if (!newPassword || newPassword.length < 6) {
      nextErrors.newPassword = 'Use at least 6 characters.';
    }
    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await authApi.resetPasswordWithOtp(email.trim(), otp.trim(), newPassword);
      setStep('done');
    } catch (err) {
      applyError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function applyError(err: unknown) {
    if (err instanceof ApiError) {
      setFormErrorVariant(err.isNetworkError ? 'network' : 'error');
      setFormError(err.message);
    } else {
      setFormErrorVariant('error');
      setFormError('Something went wrong. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'email' && (
            <View>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.hint}>
                Enter the email on your BestServe account. We'll send you a one-time code.
              </Text>

              {!!formError && <Banner message={formError} variant={formErrorVariant} />}

              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@company.com"
                editable={!submitting}
              />

              <Button label="Send code" onPress={handleSendOtp} loading={submitting} />
            </View>
          )}

          {step === 'reset' && (
            <View>
              <Text style={styles.title}>Enter your code</Text>
              <Text style={styles.hint}>
                We sent a code to {email}. Enter it below with your new password.
              </Text>

              {!!formError && <Banner message={formError} variant={formErrorVariant} />}

              <TextField
                label="One-time code"
                value={otp}
                onChangeText={setOtp}
                error={errors.otp}
                keyboardType="number-pad"
                placeholder="123456"
                editable={!submitting}
              />

              <TextField
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                error={errors.newPassword}
                secureToggle
                placeholder="••••••••"
                editable={!submitting}
              />

              <TextField
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={errors.confirmPassword}
                secureToggle
                placeholder="••••••••"
                editable={!submitting}
              />

              <Button label="Reset password" onPress={handleResetPassword} loading={submitting} />
            </View>
          )}

          {step === 'done' && (
            <View>
              <Text style={styles.title}>Password updated</Text>
              <Text style={styles.hint}>
                Your password has been reset. Sign in with your new password.
              </Text>
              <Button label="Back to sign in" onPress={() => navigation.goBack()} />
            </View>
          )}
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
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
});
