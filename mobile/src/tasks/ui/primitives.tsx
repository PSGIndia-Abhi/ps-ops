import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { initials } from '../format';
import { avatarColor, font, PRIORITY_META, radius, STATUS_META, t } from '../theme';
import type { TaskPriority, TaskStatus } from '../types';

/** Round icon button - `dark` is the near-black "+" style, otherwise white. */
export function CircleButton({
  children,
  onPress,
  dark,
  size = 52,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  dark?: boolean;
  size?: number;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.circle,
        { width: size, height: size, backgroundColor: dark ? t.ink : t.surface },
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Avatar({ name, id, size = 36, ring }: { name?: string | null; id?: number | string | null; size?: number; ring?: boolean }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          backgroundColor: avatarColor(id ?? name),
          borderWidth: ring ? 2 : 0,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

/** Overlapping avatars, as on the reference cards (assignee + creator). */
export function AvatarStack({ people, size = 34 }: { people: { id?: number | null; name?: string | null }[]; size?: number }) {
  const unique = people.filter((p, i) => p.name && people.findIndex((q) => q.id === p.id) === i);
  return (
    <View style={styles.row}>
      {unique.map((p, i) => (
        <View key={`${p.id}-${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} id={p.id} size={size} ring />
        </View>
      ))}
    </View>
  );
}

export function PriorityTag({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_META[priority];
  return (
    <View style={styles.priorityTag}>
      <View style={[styles.dot, { backgroundColor: p.color }]} />
      <Text style={styles.priorityText}>{p.label} Priority</Text>
    </View>
  );
}

export function StatusPill({ status, small }: { status: TaskStatus; small?: boolean }) {
  const s = STATUS_META[status];
  return (
    <View style={[styles.statusPill, { backgroundColor: s.color }, small && styles.statusPillSmall]}>
      <Text style={[styles.statusText, small && { fontSize: 11 }]}>{s.label}</Text>
    </View>
  );
}

/** Horizontal filter chip: `count` renders the round number bubble from the reference. */
export function Chip({
  label,
  active,
  onPress,
  count,
  icon,
  activeColor = t.ink,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  count?: number;
  icon?: React.ReactNode;
  activeColor?: string;
}) {
  const onActiveLime = activeColor === t.lime;
  const fg = active ? (onActiveLime ? t.ink : t.onInk) : t.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        count !== undefined && styles.chipWithCount,
        active ? { backgroundColor: activeColor, borderColor: activeColor } : null,
        pressed && { opacity: 0.85 },
      ]}
    >
      {count !== undefined && (
        <View style={[styles.countBubble, active && { backgroundColor: t.surface }]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
      {icon}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyBlock({ icon, title, text }: { icon?: React.ReactNode; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!text && <Text style={styles.emptyText}>{text}</Text>}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  tone = 'ink',
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'ink' | 'lime' | 'danger' | 'outline';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'ink' ? t.ink : tone === 'lime' ? t.lime : tone === 'danger' ? t.danger : t.surface;
  const fg = tone === 'lime' || tone === 'outline' ? t.ink : t.onInk;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: bg },
        tone === 'outline' && styles.primaryOutline,
        (disabled || busy) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.primaryText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export const primitiveStyles = StyleSheet.create({
  label: { fontFamily: font.medium, fontSize: 15, color: t.text, marginBottom: 10, marginTop: 18 },
  field: {
    backgroundColor: t.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 58,
    fontSize: 15,
    color: t.text,
    fontFamily: font.regular,
  },
  fieldMultiline: {
    borderRadius: radius.lg,
    paddingTop: 18,
    paddingBottom: 18,
    minHeight: 96,
    textAlignVertical: 'top',
  },
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatar: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderColor: t.surface },
  avatarText: { color: t.ink, fontFamily: font.medium, fontWeight: '600' },
  priorityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: t.surface,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  priorityText: { fontSize: 11, color: t.text, fontFamily: font.medium },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  statusPillSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: t.onInk, fontSize: 12, fontFamily: font.medium, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: t.surfaceGlass,
    borderWidth: 1,
    borderColor: t.border,
  },
  chipWithCount: { paddingLeft: 5, paddingRight: 22 },
  chipText: { fontSize: 15, fontFamily: font.medium },
  countBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 15, fontFamily: font.medium, color: t.ink },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontFamily: font.regular, color: t.text },
  sectionAction: { fontSize: 15, color: t.textSecondary, fontFamily: font.regular },
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    backgroundColor: t.surfaceGlass,
    borderRadius: radius.lg,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: font.medium, color: t.text },
  emptyText: { fontSize: 13, color: t.textMuted, textAlign: 'center' },
  primary: { minHeight: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  primaryOutline: { borderWidth: 1, borderColor: t.border },
  primaryText: { fontSize: 16, fontFamily: font.medium, fontWeight: '600' },
});
