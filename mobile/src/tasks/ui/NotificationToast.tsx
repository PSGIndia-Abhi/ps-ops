import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon } from '../../components/icons';
import type { TaskNotification } from '../notifications';
import { font, radius, t } from '../theme';
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
          <View style={[styles.icon, done ? styles.iconDone : styles.iconNew]}>
            {done ? <CheckIcon size={20} color={t.ink} /> : <ClipboardIcon size={19} color={t.onInk} />}
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
          <CloseIcon size={16} color={t.textMuted} />
        </Pressable>
        <View style={[styles.accent, { backgroundColor: done ? t.lime : t.ink }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 12, left: 48, alignItems: 'flex-end', zIndex: 60, elevation: 60 },
  card: {
    width: '100%',
    maxWidth: 380,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: t.surface,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: t.border,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  body: { flex: 1, flexDirection: 'row', gap: 12, padding: 14, paddingRight: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconDone: { backgroundColor: t.lime },
  iconNew: { backgroundColor: t.ink },
  text: { flex: 1 },
  title: { fontSize: 14, fontFamily: font.medium, fontWeight: '600', color: t.text },
  task: { fontSize: 14, color: t.text, marginTop: 3, fontFamily: font.regular },
  detail: { fontSize: 12, color: t.textSecondary, marginTop: 3 },
  close: { padding: 12 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
});
