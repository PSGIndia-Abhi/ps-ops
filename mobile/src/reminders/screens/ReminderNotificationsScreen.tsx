import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { AlertTriangleIcon, BellIcon, ChevronLeftIcon, ClockIcon } from '../../components/icons';
import { formatINR } from '../../crm/format';
import { useCrmStyles } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { addDays, todayStr } from '../../tasks/format';
import { dueLabel } from '../../tasks/notifications';
import { AttentionBackground, factory as notificationStyles } from '../../tasks/screens/TaskNotificationsScreen';
import { TONE_GRADIENT } from '../../tasks/theme';
import { GradientBlock } from '../../tasks/ui/parts';
import { byDue, reminderFor } from '../format';
import type { ReminderListTab, ReminderStackParamList } from '../navigation';
import { useReminders } from '../RemindersContext';
import type { Reminder } from '../types';
import { useOutstandingOf } from './ReminderListScreen';

/**
 * Notifications (opened from the bell on Home) - the same screen as Task Management's
 * (tasks/screens/TaskNotificationsScreen.tsx), for payment reminders: a "Needs attention"
 * summary and the reminders that are overdue or due today or tomorrow. The accountant creates
 * their own reminders, so there are no "assigned to you" events to list, only what is due.
 */
export function ReminderNotificationsScreen() {
  const navigation = useNavigation<NavigationProp<ReminderStackParamList>>();
  const { styles, theme } = useCrmStyles(notificationStyles);
  const { reminders, refreshing, reload } = useReminders();
  const outstandingOf = useOutstandingOf();

  const { overdue, today, tomorrow } = useMemo(() => {
    const open = reminders.filter((r) => r.active);
    const next = addDays(todayStr(), 1);
    return {
      overdue: open.filter((r) => r.display_status === 'OVERDUE').sort(byDue),
      today: open.filter((r) => r.display_status === 'TODAY').sort(byDue),
      tomorrow: open.filter((r) => r.due_date === next).sort(byDue),
    };
  }, [reminders]);

  const openList = (tab: ReminderListTab) => navigation.navigate('ReminderTabs', { screen: 'Reminders', params: { tab, at: Date.now() } });

  const renderDue = (r: Reminder) => {
    const late = r.display_status === 'OVERDUE';
    return (
      <Pressable
        key={r.id}
        onPress={() => navigation.navigate('ReminderDetail', { reminderId: r.id })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${late ? 'Overdue' : 'Due'}: ${r.customer_name}, ${reminderFor(r)}`}
      >
        <GradientBlock colors={TONE_GRADIENT[late ? 'danger' : 'warning']} size={44} radius={13}>
          {late ? <AlertTriangleIcon size={19} color="#FFFFFF" /> : <ClockIcon size={19} color="#FFFFFF" />}
        </GradientBlock>
        <View style={styles.flex1}>
          <Text style={styles.cardTitle}>{late ? 'Overdue' : r.display_status === 'TODAY' ? 'Due today' : 'Due tomorrow'}</Text>
          <Text style={styles.cardTask} numberOfLines={1}>
            {r.customer_name || 'Customer'} · {reminderFor(r)}
          </Text>
          <View style={styles.cardMeta}>
            <View style={[styles.dueChip, { backgroundColor: late ? theme.dangerBg : theme.warningBg }]}>
              <Text style={[styles.dueChipText, { color: late ? theme.dangerText : theme.warningText }]}>{dueLabel(r.due_date, r.due_time)}</Text>
            </View>
            <Text style={styles.cardMetaText}>{formatINR(outstandingOf(r))} outstanding</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.bar}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeftIcon size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <View style={styles.attn}>
          <AttentionBackground />
          <View style={styles.attnTop}>
            <View style={styles.attnIcon}>
              <AlertTriangleIcon size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.attnTitle}>Needs attention</Text>
              <Text style={styles.attnSub}>Tap to see these reminders</Text>
            </View>
          </View>
          <View style={styles.attnRow}>
            {(
              [
                [overdue.length, 'Overdue', 'OVERDUE'],
                [today.length, 'Due today', 'TODAY'],
                [tomorrow.length, 'Due tomorrow', 'UPCOMING'],
              ] as const
            ).map(([value, label, tab]) => (
              <Pressable
                key={label}
                style={({ pressed }) => [styles.attnPill, pressed && styles.pressed]}
                onPress={() => openList(tab)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value}`}
              >
                <Text style={styles.attnValue}>{value}</Text>
                <Text style={styles.attnLabel} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {overdue.length + today.length + tomorrow.length === 0 ? (
          <View style={styles.empty}>
            <CrmEmptyState title="All caught up" subtitle="Reminders that fall due will show up here." icon={<BellIcon size={28} color={theme.textMuted} />} />
          </View>
        ) : (
          <>
            {overdue.length + today.length > 0 && <Text style={styles.section}>TODAY</Text>}
            {[...overdue, ...today].map(renderDue)}
            {tomorrow.length > 0 && <Text style={styles.section}>TOMORROW</Text>}
            {tomorrow.map(renderDue)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
