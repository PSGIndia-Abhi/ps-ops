import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { GlossyBadge } from '../components/GlossyBadge';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { radii, spacing, typography } from '../theme';

/**
 * The Field Tracking screens' own message / confirm dialog - used instead of Android's built-in
 * Alert.alert so it matches the app: a centred card with a glossy coloured icon badge, a title,
 * a short message and full-width buttons (the main action first).
 */

export type DialogTone = 'primary' | 'success' | 'warning' | 'danger' | 'accent';

export interface DialogAction {
  label: string;
  onPress: () => void;
  /** primary = filled in the dialog's colour, danger = filled red, secondary = outline. */
  variant?: 'primary' | 'danger' | 'secondary';
  /** Shows a spinner on this button and blocks the others. */
  loading?: boolean;
}

export interface FieldDialogProps {
  visible: boolean;
  tone?: DialogTone;
  /** An icon component (size, color) - drawn white on the glossy badge. */
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  message: string;
  actions: DialogAction[];
  /** Back button / tap outside. Left out = the dialog can only be closed with a button. */
  onClose?: () => void;
}

const WHITE = '#FFFFFF';

export function toneColor(t: CrmTheme, tone: DialogTone): string {
  switch (tone) {
    case 'success':
      return t.success;
    case 'warning':
      return t.warning;
    case 'danger':
      return t.danger;
    case 'accent':
      return t.accent;
    default:
      return t.primary;
  }
}

const factory = (t: CrmTheme) => ({
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  card: {
    width: '100%' as const,
    maxWidth: 400,
    backgroundColor: t.surface,
    borderRadius: radii.xl + 4,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center' as const,
    ...t.raisedShadow,
  },
  halo: { width: 84, height: 84, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: spacing.md },
  haloFill: { position: 'absolute' as const, width: 84, height: 84, borderRadius: 42, opacity: 0.14 },
  inner: { alignItems: 'center' as const, alignSelf: 'stretch' as const },
  title: { ...typography.title, color: t.textPrimary, textAlign: 'center' as const },
  message: { ...typography.body, color: t.textSecondary, textAlign: 'center' as const, marginTop: spacing.xs },
  actions: { alignSelf: 'stretch' as const, gap: spacing.sm, marginTop: spacing.lg },
  button: { minHeight: 50, borderRadius: radii.lg, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: spacing.md },
  outline: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  label: { ...typography.button },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.5 },
});

export function FieldDialog({ visible, tone = 'primary', icon: Icon, title, message, actions, onClose }: FieldDialogProps) {
  const { styles, theme } = useCrmStyles(factory);
  const color = toneColor(theme, tone);
  const busy = actions.some((a) => a.loading);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    Animated.timing(pop, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [visible, pop]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.overlay} onPress={busy ? undefined : onClose}>
        <Animated.View
          style={[
            styles.card,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
          ]}
        >
          {/* Stops a tap on the card from reaching the backdrop. */}
          <Pressable style={styles.inner} onPress={(e) => e.stopPropagation()}>
            <View style={styles.halo}>
              <View style={[styles.haloFill, { backgroundColor: color }]} />
              <GlossyBadge color={color} size={60} icon={<Icon size={28} color={WHITE} />} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.actions}>
              {actions.map((a) => {
                const variant = a.variant ?? 'primary';
                const filled = variant !== 'secondary';
                const fill = variant === 'danger' ? theme.danger : color;
                const disabled = busy && !a.loading;
                return (
                  <Pressable
                    key={a.label}
                    onPress={busy ? undefined : a.onPress}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy, busy: !!a.loading }}
                    style={({ pressed }) => [
                      styles.button,
                      filled ? { backgroundColor: fill } : styles.outline,
                      disabled && styles.off,
                      pressed && !busy && styles.pressed,
                    ]}
                  >
                    {a.loading ? (
                      <ActivityIndicator color={filled ? WHITE : color} />
                    ) : (
                      <Text style={[styles.label, { color: filled ? WHITE : theme.textPrimary }]}>{a.label}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
