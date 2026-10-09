import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AlertTriangleIcon, BellIcon, CalendarIcon, ChevronLeftIcon, ClockIcon, PauseIcon, PlayIcon } from '../../components/icons';
import { useCrmStyles, type CrmTheme } from '../../crm/theme';
import { CrmEmptyState } from '../../crm/ui/CrmScreen';
import { radii, spacing, typography } from '../../theme';
import { byDue, isActive, isOverdue, LIST_MODES, timeAgo, todayStr, type ListMode } from '../format';
import type { TaskStackParamList } from '../navigation';
import { dueLabel, type TaskNotification } from '../notifications';
import { useTasks } from '../TasksContext';
import { TONE_GRADIENT } from '../theme';
import type { WorkTask } from '../types';
import { GradientBlock } from '../ui/parts';
import { BanIcon, CheckIcon, ClipboardIcon } from '../ui/taskIcons';

type Filter = 'all' | 'unread' | 'due';

/** Most notification cards shown at once. */
const MAX_SHOWN = 10;

const factory = (t: CrmTheme) => ({
  
  screen: { flex: 1, backgroundColor: t.background },
  flex1: { flex: 1 },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: { flex: 1, ...typography.title, fontSize: 24, lineHeight: 30, fontWeight: '800' as const, color: t.textPrimary },
  markAll: { backgroundColor: t.primarySoftBg, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  markAllText: { ...typography.captionMedium, fontWeight: '700' as const, color: t.primary },
  disabled: { opacity: 0.4 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  attn: { borderRadius: 22, padding: spacing.md, overflow: 'hidden' as const, marginTop: spacing.xs },
  attnTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  attnIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center' as const, justifyContent: 'center' as const },
  attnTitle: { ...typography.subtitle, color: '#FFFFFF' },
  attnSub: { ...typography.caption, color: 'rgba(255,255,255,0.9)' },
  attnRow: { flexDirection: 'row' as const, gap: spacing.xs, marginTop: spacing.sm },
  attnPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  attnValue: { ...typography.title, color: '#FFFFFF' },
  attnLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.92)' },
  chips: { flexDirection: 'row' as const, gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.xxs },
  chip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: t.surfaceAlt },
  chipOn: { backgroundColor: t.primary },
  chipText: { ...typography.captionMedium, fontSize: 14, color: t.textSecondary },
  chipTextOn: { color: t.textOnPrimary },
  chipCount: { backgroundColor: t.surface, borderRadius: radii.pill, paddingHorizontal: 6 },
  chipCountText: { fontSize: 11, fontWeight: '700' as const, color: t.primary },
  section: { ...typography.overline, color: t.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.surface,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    ...t.cardShadow,
  },
  cardUnread: { backgroundColor: t.primarySoftBg, borderColor: t.primarySoft },
  cardTitle: { ...typography.bodyMedium, fontWeight: '700' as const, color: t.textPrimary, paddingRight: spacing.md },
  cardTask: { ...typography.body, color: t.textSecondary, marginTop: 1 },
  cardMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 5 },
  cardMetaText: { ...typography.caption, color: t.textMuted },
  dueChip: { borderRadius: radii.pill, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  dueChipText: { fontSize: 11.5, fontWeight: '700' as const },
  dot: { position: 'absolute' as const, top: spacing.md, right: spacing.md, width: 9, height: 9, borderRadius: 5, backgroundColor: t.primary },
  pressed: { opacity: 0.8 },
  empty: { marginTop: spacing.lg },
});

/** Red gradient behind the "Needs attention" card. */
function AttentionBackground() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((p) => (p && p.w === width && p.h === height ? p : { w: width, h: height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {!!size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="attnBg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F87171" />
              <Stop offset="0.55" stopColor="#DC2626" />
              <Stop offset="1" stopColor="#B91C1C" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#attnBg)" />
          <Circle cx={size.w * 0.9} cy={-size.h * 0.05} r={size.h * 0.6} fill="#FFFFFF" fillOpacity={0.12} />
        </Svg>
      )}
    </View>
  );
}

const KIND_LOOK: Record<TaskNotification['kind'], { tone: 'info' | 'success' | 'accent' | 'warning'; Icon: typeof ClipboardIcon }> = {
  created: { tone: 'info', Icon: ClipboardIcon },
  completed: { tone: 'success', Icon: CheckIcon },
  started: { tone: 'accent', Icon: PlayIcon as typeof ClipboardIcon },
  paused: { tone: 'warning', Icon: PauseIcon as typeof ClipboardIcon },
  resumed: { tone: 'accent', Icon: PlayIcon as typeof ClipboardIcon },
  reschedule_requested: { tone: 'info', Icon: CalendarIcon as typeof ClipboardIcon },
  reschedule_approved: { tone: 'success', Icon: CheckIcon },
  reschedule_rejected: { tone: 'warning', Icon: BanIcon },
};

/** "From Prashanth" / "By Rohan" / "Pavan" for the grey meta line. */
function whoLine(n: TaskNotification): string | null {
  if (!n.by) return null;
  return n.kind === 'created' ? `From ${n.by}` : n.kind === 'completed' ? `By ${n.by}` : n.by;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Notifications (opened from the bell on Home): a "Needs attention" summary,
 * All / Unread / Due soon chips, and the stored task notifications grouped
 * into Today / Earlier alongside tasks that are due now.
 */
export function TaskNotificationsScreen() {
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const { styles, theme } = useCrmStyles(factory);
  const { tasks, viewer, notifications, unreadCount, openNotification, markAllNotificationsRead, refresh, refreshing } = useTasks();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      overdue: tasks.filter(isOverdue).length,
      // Same rule as Home's "Today's Tasks" tile and the list it opens.
      today: tasks.filter((x) => LIST_MODES.today.match(x, viewer.id)).length,
      tomorrow: tasks.filter((x) => LIST_MODES.tomorrow.match(x, viewer.id)).length,
    }),
    [tasks, viewer.id],
  );

  // Tasks needing action now: overdue, due today or tomorrow (same set the old sheet listed).
  const dueSoon = useMemo(
    () => tasks.filter((x) => isOverdue(x) || (isActive(x) && (x.due_date === todayStr() || LIST_MODES.tomorrow.match(x, viewer.id)))).sort(byDue),
    [tasks, viewer.id],
  );

  // At most MAX_SHOWN cards, in display order: today's notifications, tasks
  // due now, then earlier notifications.
  const shownNotifs = filter === 'unread' ? notifications.filter((n) => !n.read) : filter === 'all' ? notifications : [];
  const allToday = shownNotifs.filter((n) => isToday(n.at));
  const allDue = filter === 'unread' ? [] : dueSoon;
  const allEarlier = shownNotifs.filter((n) => !isToday(n.at));
  const todayNotifs = allToday.slice(0, MAX_SHOWN);
  const shownDue = allDue.slice(0, MAX_SHOWN - todayNotifs.length);
  const earlierNotifs = allEarlier.slice(0, MAX_SHOWN - todayNotifs.length - shownDue.length);
  const nothing = todayNotifs.length + earlierNotifs.length + shownDue.length === 0;

  const openList = (mode: ListMode) => navigation.navigate('TaskTabs', { screen: 'Tasks', params: { mode, q: '', at: Date.now() } });

  const renderNotif = (n: TaskNotification) => {
    const look = KIND_LOOK[n.kind] ?? KIND_LOOK.created;
    const who = whoLine(n);
    return (
      <Pressable
        key={n.key}
        onPress={() => openNotification(n)}
        style={({ pressed }) => [styles.card, !n.read && styles.cardUnread, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${n.title}: ${n.taskTitle}${n.read ? '' : ', unread'}`}
      >
        {!n.read && <View style={styles.dot} />}
        <GradientBlock colors={TONE_GRADIENT[look.tone]} size={44} radius={13}>
          <look.Icon size={19} color="#FFFFFF" />
        </GradientBlock>
        <View style={styles.flex1}>
          <Text style={styles.cardTitle}>{n.title}</Text>
          <Text style={styles.cardTask} numberOfLines={1}>
            {n.taskTitle}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>{[who, timeAgo(n.at)].filter(Boolean).join('  ·  ')}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderDue = (x: WorkTask) => {
    const late = isOverdue(x);
    const tone = late ? 'danger' : 'warning';
    return (
      <Pressable
        key={`due-${x.id}`}
        onPress={() => navigation.navigate('TaskDetail', { taskId: x.id })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${late ? 'Overdue' : 'Due'}: ${x.title}`}
      >
        <GradientBlock colors={TONE_GRADIENT[tone]} size={44} radius={13}>
          {late ? <AlertTriangleIcon size={19} color="#FFFFFF" /> : <ClockIcon size={19} color="#FFFFFF" />}
        </GradientBlock>
        <View style={styles.flex1}>
          <Text style={styles.cardTitle}>{late ? 'Overdue' : x.due_date === todayStr() ? 'Due today' : 'Due tomorrow'}</Text>
          <Text style={styles.cardTask} numberOfLines={1}>
            {x.title}
          </Text>
          <View style={styles.cardMeta}>
            <View style={[styles.dueChip, { backgroundColor: late ? theme.dangerBg : theme.warningBg }]}>
              <Text style={[styles.dueChipText, { color: late ? theme.dangerText : theme.warningText }]}>{dueLabel(x.due_date, x.due_time)}</Text>
            </View>
            {!!x.assigned_to_name && <Text style={styles.cardMetaText}>{x.assigned_to_name}</Text>}
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
        <Pressable
          style={[styles.markAll, unreadCount === 0 && styles.disabled]}
          onPress={markAllNotificationsRead}
          disabled={unreadCount === 0}
          accessibilityRole="button"
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <View style={styles.attn}>
          <AttentionBackground />
          <View style={styles.attnTop}>
            <View style={styles.attnIcon}>
              <AlertTriangleIcon size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.attnTitle}>Needs attention</Text>
              <Text style={styles.attnSub}>Tap to see these tasks</Text>
            </View>
          </View>
          <View style={styles.attnRow}>
            {(
              [
                [counts.overdue, 'Overdue', 'overdue'],
                [counts.today, 'Due today', 'today'],
                [counts.tomorrow, 'Due tomorrow', 'tomorrow'],
              ] as const
            ).map(([value, label, mode]) => (
              <Pressable
                key={label}
                style={({ pressed }) => [styles.attnPill, pressed && styles.pressed]}
                onPress={() => openList(mode)}
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

        <View style={styles.chips}>
          {(
            [
              ['all', 'All'],
              ['unread', 'Unread'],
              ['due', 'Due soon'],
            ] as const
          ).map(([k, label]) => {
            const on = filter === k;
            return (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                {k === 'unread' && unreadCount > 0 && (
                  <View style={styles.chipCount}>
                    <Text style={styles.chipCountText}>{unreadCount}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {nothing ? (
          <View style={styles.empty}>
            <CrmEmptyState
              title={filter === 'unread' ? 'All caught up' : 'Nothing here'}
              subtitle={filter === 'unread' ? 'You have no unread notifications.' : 'New tasks, updates and due dates will show up here.'}
              icon={<BellIcon size={28} color={theme.textMuted} />}
            />
          </View>
        ) : (
          <>
            {(todayNotifs.length > 0 || shownDue.length > 0) && <Text style={styles.section}>TODAY</Text>}
            {todayNotifs.map(renderNotif)}
            {shownDue.map(renderDue)}
            {earlierNotifs.length > 0 && <Text style={styles.section}>EARLIER</Text>}
            {earlierNotifs.map(renderNotif)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
