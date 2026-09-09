import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { ScreenContainer } from '../../components/ScreenContainer';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { LockIcon } from '../../components/icons';
import { authApi, ApiError } from '../../api';
import { spacing } from '../../theme';

/**
 * Uses the existing POST /api/auth/me/password (backend/src/routes/
 * auth.routes.js) - already wired in api/auth.ts, just never had a mobile
 * screen until now.
 */
export function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string; confirm?: string }>(
    {},
  );
  const [feedback, setFeedback] = useState<{ message: string; variant: 'success' | 'error' | 'network' | 'validation' } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!currentPassword) errors.current = 'Enter your current password.';
    if (!newPassword) {
      errors.next = 'Enter a new password.';
    } else if (newPassword.length < 6) {
      errors.next = 'New password must be at least 6 characters.';
    }
    if (confirmPassword !== newPassword) errors.confirm = 'Passwords do not match.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    setFeedback(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setFeedback({ message: 'Password updated successfully', variant: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        setFeedback({ message: 'Unable to connect. Check your connection and try again.', variant: 'network' });
      } else if (err instanceof ApiError && err.status === 400) {
        setFeedback({ message: err.message, variant: 'validation' });
      } else {
        setFeedback({
          message: err instanceof ApiError ? err.message : 'Unable to update your password right now.',
          variant: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer edges={['bottom']}>
      {!!feedback && <Banner message={feedback.message} variant={feedback.variant} />}

      <TextField
        label="Current password"
        icon={<LockIcon size={19} />}
        value={currentPassword}
        onChangeText={(text) => {
          setCurrentPassword(text);
          if (fieldErrors.current) setFieldErrors((prev) => ({ ...prev, current: undefined }));
        }}
        error={fieldErrors.current}
        secureToggle
        textContentType="password"
        returnKeyType="next"
        editable={!submitting}
      />

      <TextField
        label="New password"
        icon={<LockIcon size={19} />}
        value={newPassword}
        onChangeText={(text) => {
          setNewPassword(text);
          if (fieldErrors.next) setFieldErrors((prev) => ({ ...prev, next: undefined }));
        }}
        error={fieldErrors.next}
        secureToggle
        textContentType="newPassword"
        returnKeyType="next"
        editable={!submitting}
      />

      <TextField
        label="Confirm new password"
        icon={<LockIcon size={19} />}
        value={confirmPassword}
        onChangeText={(text) => {
          setConfirmPassword(text);
          if (fieldErrors.confirm) setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        error={fieldErrors.confirm}
        secureToggle
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
      />

      <Button
        label="Update password"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submit}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  submit: {
    width: '100%',
    marginTop: spacing.md,
  },
});
