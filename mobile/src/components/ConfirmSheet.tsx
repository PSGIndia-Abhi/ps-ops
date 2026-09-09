import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { colors, radii, spacing, typography } from '../theme';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}

/**
 * The one in-app confirmation surface for important/irreversible actions
 * (e.g. completing a job) - never a native Alert.alert. A plain, calm
 * bottom sheet: what will happen, Cancel, Confirm.
 */
export function ConfirmSheet({
  visible,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  destructive,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={loading ? undefined : onCancel}>
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={loading} style={styles.action} />
            <Button
              label={confirmLabel}
              variant="primary"
              onPress={onConfirm}
              loading={loading}
              style={[styles.action, destructive ? styles.destructive : null]}
            />
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
    // paddingBottom is set inline (spacing.xl + the device's actual bottom
    // safe-area inset) - a fixed value here would sit flush against, or
    // underneath, a 3-button Android nav bar's physical buttons.
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
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  destructive: {
    backgroundColor: colors.danger,
  },
});
