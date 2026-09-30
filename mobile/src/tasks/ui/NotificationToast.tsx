import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon, PauseIcon } from '../../components/icons';
import type { TaskNotification } from '../notifications';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { radii, spacing, typography } from '../../theme';
import { CheckIcon, ClipboardIcon } from './taskIcons';

const AUTO_HIDE_MS = 4500;

/**
 * Top-right task notification card. Slides in from the right edge, auto-hides
 * after ~4.5s, closes on the X, and opens the task when tapped. Rendered once
 * by TasksProvider over every Task Management screen; shows one at a time.
 */
export function NotificationToast({
  item,
  onOpen,
  onDismiss,
}: {
  item: TaskNotification | null;
  onOpen: (n: TaskNotification) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { styles, theme } = useCrmStyles(factory);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef<TaskNotification | null>(null);

  const hide = (after?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      onDismiss();
      after?.();
    });
  };

  useEffect(() => {
    if (!item) return;
    shown.current = item;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    timer.current = setTimeout(() => hide(), AUTO_HIDE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;
  const done = item.kind === 'completed';
  const paused = item.kind === 'paused';

  return (
    <View style={[styles.wrap, { top: insets.top + 10 }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: anim,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Pressable
          style={styles.body}
          onPress={() => hide(() => onOpen(item))}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}: ${item.taskTitle}. ${item.detail}. Open task`}
        >
          <View style={[styles.icon, done ? styles.iconDone : styles.iconNew, paused && { backgroundColor: theme.warning }]}>
            {done ? (
              <CheckIcon size={20} color={theme.textOnPrimary} />
            ) : paused ? (
              <PauseIcon size={19} color={theme.textOnPrimary} />
            ) : (
              <ClipboardIcon size={19} color={theme.textOnPrimary} />
            )}
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.task} numberOfLines={2}>
              {item.taskTitle}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {item.detail}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => hide()} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss notification">
          <CloseIcon size={16} color={theme.textMuted} />
        </Pressable>
        <View style={[styles.accent, { backgroundColor: done ? theme.success : paused ? theme.warning : theme.primary }]} />
      </Animated.View>
    </View>
  );
}

const factory = (t: CrmTheme) => ({
  wrap: { position: 'absolute' as const, right: spacing.sm, left: 48, alignItems: 'flex-end' as const, zIndex: 60, elevation: 60 },
  card: {
    width: '100%' as const,
    maxWidth: 380,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden' as const,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  body: { flex: 1, flexDirection: 'row' as const, gap: spacing.sm, padding: spacing.md, paddingRight: 4 },
  icon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  iconDone: { backgroundColor: t.success },
  iconNew: { backgroundColor: t.primary },
  text: { flex: 1 },
  title: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary },
  task: { ...typography.body, color: t.textPrimary, marginTop: 2 },
  detail: { ...typography.caption, color: t.textSecondary, marginTop: 2 },
  close: { padding: spacing.sm },
  accent: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 4 },
});
