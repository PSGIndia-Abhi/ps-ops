import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClockIcon } from '../../components/icons';
import { dueInfo, fmtDateShort, fmtTime } from '../format';
import { cardShadow, font, radius, t, TONE_COLOR } from '../theme';
import type { WorkTask } from '../types';
import { AvatarStack, PriorityTag, StatusPill } from './primitives';
import { ArrowUpRightIcon, RepeatIcon } from './taskIcons';

/** The "Design Landing page" card from the reference Home screen. */
export function TaskCard({ task, onPress }: { task: WorkTask; onPress: () => void }) {
  const due = dueInfo(task);
  const time = fmtTime(task.due_time);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${due.text}`}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={styles.top}>
        <View style={styles.tags}>
          <PriorityTag priority={task.priority} />
          {!!task.series_id && (
            <View style={styles.repeat}>
              <RepeatIcon size={12} color={t.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.arrow}>
          <ArrowUpRightIcon size={18} color={t.ink} />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {task.title}
      </Text>
      <View style={styles.bottom}>
        <View style={styles.flex}>
          <View style={styles.when}>
            <ClockIcon size={16} color={t.ink} />
            <Text style={styles.whenText}>
              {task.due_date ? fmtDateShort(task.due_date) : 'No date'}
              {time ? `  ·  ${time}` : ''}
            </Text>
          </View>
          <Text style={[styles.due, { color: TONE_COLOR[due.tone] }]}>{due.text}</Text>
        </View>
        <View style={styles.right}>
          {task.status !== 'OPEN' && <StatusPill status={task.status} small />}
          <AvatarStack
            size={36}
            people={[
              { id: task.assigned_to, name: task.assigned_to_name },
              { id: task.created_by, name: task.created_by_name },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: t.surface, borderRadius: radius.lg, padding: 18, marginBottom: 12, ...cardShadow },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repeat: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F4F3F6', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, color: t.text, fontFamily: font.medium, marginTop: 12, marginBottom: 16 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { fontSize: 14, color: t.text, fontFamily: font.regular },
  due: { fontSize: 12, marginTop: 4, marginLeft: 22, fontFamily: font.medium },
  right: { alignItems: 'flex-end', gap: 8 },
});
