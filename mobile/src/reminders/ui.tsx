import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ClockIcon } from '../components/icons';
import { formatINR } from '../crm/format';
import { useCrmStyles, type CrmTheme } from '../crm/theme';
import { StatusBadge } from '../crm/ui/StatusBadge';
import { RepeatIcon } from '../tasks/ui/taskIcons';
import { radii, spacing, typography } from '../theme';
import { reminderFor, showDue, STATUS_META } from './format';
import type { Reminder } from './types';

const factory = (t: CrmTheme) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...t.cardShadow,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  body: { flex: 1, gap: 2 },
  name: { ...typography.bodyMedium, color: t.textPrimary },
  meta: { ...typography.caption, color: t.textSecondary },
  amount: { ...typography.bodyMedium, color: t.dangerText },
  due: { ...typography.captionMedium, flex: 1 },
});

/** One reminder in a list (Home "Up Next", Reminders): who, what for, what is owed, when, and its state. */
export function ReminderCard({ reminder: r, outstanding, onPress }: { reminder: Reminder; outstanding: number; onPress: () => void }) {
  const { styles, theme } = useCrmStyles(factory);
  const meta = STATUS_META[r.display_status];
  const dueColor = r.display_status === 'OVERDUE' ? theme.dangerText : r.display_status === 'TODAY' ? theme.warningText : theme.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${r.customer_name}, ${reminderFor(r)}, ${meta.label}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {r.customer_name || 'Customer'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {reminderFor(r)}
            {r.priority === 'HIGH' ? ' · High priority' : ''}
          </Text>
        </View>
        {r.active && <Text style={styles.amount}>{formatINR(outstanding)}</Text>}
      </View>
      <View style={styles.row}>
        {r.series_id ? <RepeatIcon size={14} color={dueColor} /> : <ClockIcon size={14} color={dueColor} />}
        <Text style={[styles.due, { color: dueColor }]} numberOfLines={1}>
          {showDue(r.due_date, r.due_time)}
        </Text>
        <StatusBadge label={meta.label} tone={meta.tone} dot={false} />
      </View>
    </Pressable>
  );
}
