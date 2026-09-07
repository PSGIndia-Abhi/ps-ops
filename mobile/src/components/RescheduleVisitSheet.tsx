import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Banner } from './Banner';
import { TextField } from './TextField';
import { colors, radii, spacing, typography } from '../theme';

interface RescheduleVisitSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: string, time: string) => Promise<void>;
  submitting: boolean;
  error: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * PATCH /api/visits/:visitId/reschedule only accepts "YYYY-MM-DD" +
 * "HH:MM" (backend's normalizeScheduledDateTime) - validated client-side
 * before submitting so a malformed value never round-trips as a confusing
 * 400.
 */
export function RescheduleVisitSheet({ visible, onClose, onConfirm, submitting, error }: RescheduleVisitSheetProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDate('');
    setTime('');
    setValidationError(null);
  }, [visible]);

  async function handleConfirm() {
    if (!DATE_PATTERN.test(date)) {
      setValidationError('Enter the date as YYYY-MM-DD.');
      return;
    }
    if (!TIME_PATTERN.test(time)) {
      setValidationError('Enter the time as HH:MM (24-hour).');
      return;
    }
    setValidationError(null);
    await onConfirm(date, time);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={submitting ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Reschedule visit</Text>

          {!!validationError && <Banner message={validationError} variant="validation" />}
          {!!error && <Banner message={error} variant="error" />}

          <TextField label="New date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" editable={!submitting} />
          <TextField label="New time" value={time} onChangeText={setTime} placeholder="HH:MM" editable={!submitting} />

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={submitting} style={styles.action} />
            <Button label="Confirm" onPress={handleConfirm} loading={submitting} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
