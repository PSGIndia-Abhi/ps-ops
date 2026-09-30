import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronLeftIcon, ClockIcon, CloseIcon, PauseIcon, PlayIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { StatusBadge } from '../../crm/ui/StatusBadge';
import { radii, spacing, typography } from '../../theme';
import { dueInfo, initials } from '../format';
import { dueLabel } from '../notifications';
import { avatarColor, PRIORITY_META, STATE_META, taskRef, taskState, TONE_GRADIENT, toneSolid } from '../theme';
import type { TaskPriority, WorkTask } from '../types';
import { CheckIcon, ClipboardIcon } from './taskIcons';

const factory = (t: CrmTheme) => ({
  square: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatar: { borderRadius: radii.pill, alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarText: { ...typography.captionMedium, color: '#FFFFFF' },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.85 },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  rowStripPad: { paddingLeft: spacing.md, overflow: 'hidden' as const, borderWidth: 0 },
  strip: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 5 },
  dueLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyMedium, color: t.textPrimary },
  rowRef: { ...typography.caption, color: t.textMuted },
  rowDue: { ...typography.captionMedium },
  rowRight: { alignItems: 'flex-end' as const, gap: spacing.xs },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    ...t.cardShadow,
  },
  summary: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  label: { ...typography.captionMedium, color: t.textSecondary, marginBottom: spacing.xs },
  required: { color: t.danger },
  infoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  infoIcon: { width: 22, alignItems: 'center' as const },
  infoLabel: { ...typography.body, color: t.textMuted, width: 118 },
  infoValue: { flex: 1, ...typography.bodyMedium, color: t.textPrimary },
  chips: { flexDirection: 'row' as const, gap: spacing.xs },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...typography.captionMedium, fontSize: 14 },
});

/** A rounded block filled with a soft light-to-deep gradient (icon squares, tile circles). */
export function GradientBlock({
  colors: [from, to],
  size,
  radius,
  children,
  glow,
}: {
  colors: [string, string];
  size: number;
  radius: number;
  children?: React.ReactNode;
  glow?: boolean;
}) {
  const { styles } = useCrmStyles(factory);
  const id = useRef(`tg${Math.round(Math.random() * 1e9)}`).current;
  return (
    <View
      style={[
        styles.square,
        { width: size, height: size, borderRadius: radius },
        glow && { shadowColor: to, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5, backgroundColor: to },
      ]}
    >
      <Svg style={StyleSheet.absoluteFill} width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} rx={radius} ry={radius} fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/** The gradient rounded square that leads every task (red = overdue, purple = in progress...). */
export function TaskIconSquare({ task, size = 44 }: { task: WorkTask; size?: number }) {
  const state = taskState(task);
  const glyph = size * 0.45;
  return (
    <GradientBlock colors={TONE_GRADIENT[STATE_META[state].tone]} size={size} radius={size * 0.3}>
      {state === 'done' ? (
        <CheckIcon size={glyph} color="#FFFFFF" />
      ) : state === 'progress' ? (
        <PlayIcon size={glyph} color="#FFFFFF" />
      ) : state === 'paused' ? (
        <PauseIcon size={glyph} color="#FFFFFF" />
      ) : (
        <ClipboardIcon size={glyph} color="#FFFFFF" />
      )}
    </GradientBlock>
  );
}

export function Avatar({ name, id, size = 32 }: { name?: string | null; id?: number | string | null; size?: number }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={[styles.avatar, { width: size, height: size, backgroundColor: avatarColor(id ?? name) }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(10, size * 0.36) }]}>{initials(name)}</Text>
    </View>
  );
}

export function TaskStatePill({ task }: { task: WorkTask }) {
  const meta = STATE_META[taskState(task)];
  return <StatusBadge label={meta.label} tone={meta.tone} dot={false} />;
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const meta = PRIORITY_META[priority];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

/**
 * One list row (Home "Recent Tasks", My Tasks): state-coloured strip, gradient
 * icon square, title, ref, due line with a clock, state pill. Rows slide in one
 * after another (`index` staggers them; capped so long lists don't lag).
 */
export function TaskRow({ task, onPress, showAssignee, index = 0 }: { task: WorkTask; onPress: () => void; showAssignee?: boolean; index?: number }) {
  const { styles, theme } = useCrmStyles(factory);
  const state = taskState(task);
  const strip = toneSolid(theme, STATE_META[state].tone);
  const dueColor = state === 'overdue' ? theme.dangerText : state === 'today' ? theme.warningText : theme.textSecondary;
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 6) * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${STATE_META[state].label}`}
        style={({ pressed }) => [styles.row, styles.rowStripPad, pressed && styles.rowPressed]}
      >
        <View style={[styles.strip, { backgroundColor: strip }]} />
        <TaskIconSquare task={task} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={styles.rowRef} numberOfLines={1}>
            {showAssignee && task.assigned_to_name ? `${task.assigned_to_name} · ` : ''}
            {taskRef(task.id)}
          </Text>
          <View style={styles.dueLine}>
            <ClockIcon size={12} color={dueColor} />
            <Text style={[styles.rowDue, { color: dueColor }]} numberOfLines={1}>
              {state === 'overdue' ? dueInfo(task).text : dueLabel(task.due_date, task.due_time)}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <TaskStatePill task={task} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The task summary card at the top of Details / Reassign / Reschedule / Complete. */
export function TaskSummaryCard({ task, right, style }: { task: WorkTask; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={[styles.card, style]}>
      <View style={styles.summary}>
        <TaskIconSquare task={task} size={50} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={styles.rowRef}>{taskRef(task.id)}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styles } = useCrmStyles(factory);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  const { styles } = useCrmStyles(factory);
  return (
    <Text style={styles.label}>
      {children}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

export function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const { styles } = useCrmStyles(factory);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.rowBody}>{typeof children === 'string' ? <Text style={styles.infoValue}>{children}</Text> : children}</View>
    </View>
  );
}

/** Low / Medium / High, as in the Create Task mockup. */
export function PriorityChips({ value, onChange }: { value: TaskPriority; onChange: (p: TaskPriority) => void }) {
  const { styles, theme } = useCrmStyles(factory);
  return (
    <View style={styles.chips}>
      {(Object.keys(PRIORITY_META) as TaskPriority[]).map((k) => {
        const meta = PRIORITY_META[k];
        const color = toneSolid(theme, meta.tone);
        const on = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? color : theme.border, backgroundColor: on ? color : `${color}14` }]}
          >
            <View style={[styles.chipDot, { backgroundColor: on ? '#FFFFFF' : color }]} />
            <Text style={[styles.chipText, { color: on ? '#FFFFFF' : color }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shared text-input look for every task form (same field treatment as the CRM forms). */
export const inputStyle = (t: CrmTheme) => ({
  backgroundColor: t.surface,
  borderWidth: 1,
  borderColor: t.border,
  borderRadius: radii.md,
  paddingHorizontal: spacing.md,
  minHeight: 50,
  ...typography.body,
  color: t.textPrimary,
});

const headerFactory = (t: CrmTheme) => ({
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  button: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: { flex: 1, ...typography.subtitle, color: t.textPrimary },
  titleLarge: { ...typography.title, fontSize: 24, lineHeight: 30, fontWeight: '800' as const },
});

/** CRM TopBar look (round back button + title) with an optional right-hand slot. */
export function ScreenHeader({
  title,
  onBack,
  right,
  icon = 'back',
  large,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  icon?: 'back' | 'close';
  /** Big bold title (Create Task) instead of the regular one. */
  large?: boolean;
}) {
  const { styles, theme } = useCrmStyles(headerFactory);
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={icon === 'close' ? 'Close' : 'Back'} style={styles.button}>
        {icon === 'close' ? <CloseIcon size={18} color={theme.textPrimary} /> : <ChevronLeftIcon size={20} color={theme.textPrimary} />}
      </Pressable>
      <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
