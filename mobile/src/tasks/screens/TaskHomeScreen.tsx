import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { BellIcon, CheckCircleIcon, PlusIcon } from '../../components/icons';
import {
  dueInfo,
  firstName,
  greeting,
  isActive,
  isOverdue,
  byDue,
  byNewest,
  todayStr,
  addDays,
  timeAgo,
} from '../format';
import type { TaskStackParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { font, radius, t, TONE_COLOR } from '../theme';
import type { WorkTask } from '../types';
import { Backdrop } from '../ui/Backdrop';
import {
  Avatar,
  Chip,
  CircleButton,
  EmptyBlock,
  SectionHeader,
} from '../ui/primitives';
import { ProgressRing } from '../ui/ProgressRing';
import { Sheet } from '../ui/sheets';
import { CheckIcon, ClipboardIcon } from '../ui/taskIcons';
import { TaskCard } from '../ui/TaskCard';

type Bucket = 'todo' | 'progress' | 'overdue' | 'done';

const BUCKETS: {
  key: Bucket;
  label: string;
  match: (x: WorkTask) => boolean;
}[] = [
  {
    key: 'todo',
    label: 'To Do',
    match: x => x.status === 'OPEN' && !isOverdue(x),
  },
  {
    key: 'progress',
    label: 'In Progress',
    match: x => x.status === 'IN_PROGRESS' && !isOverdue(x),
  },
  { key: 'overdue', label: 'Overdue', match: x => isOverdue(x) },
  { key: 'done', label: 'Completed', match: x => x.status === 'COMPLETED' },
];

export function TaskHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const {
    viewer,
    tasks,
    ready,
    refreshing,
    refresh,
    error,
    notifications,
    unreadCount,
    openNotification,
    markAllNotificationsRead,
  } = useTasks();
  const [bucket, setBucket] = useState<Bucket>('todo');
  const [bellOpen, setBellOpen] = useState(false);

  // "Today's progress" is about the viewer's own work: everything assigned to
  // them that is due today (or overdue and still open), and how much is done.
  const progress = useMemo(() => {
    const today = todayStr();
    const mine = tasks.filter(
      x => x.assigned_to === viewer.id && x.status !== 'CANCELLED',
    );
    const todays = mine.filter(
      x =>
        x.due_date === today ||
        (isActive(x) && !!x.due_date && x.due_date < today),
    );
    const completed = todays.filter(x => x.status === 'COMPLETED').length;
    return {
      total: todays.length,
      completed,
      pending: todays.length - completed,
      pct: todays.length ? (completed / todays.length) * 100 : 0,
    };
  }, [tasks, viewer.id]);

  // Everything visible to the viewer (own + team), same scope as the web dashboard.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        BUCKETS.map(b => [b.key, tasks.filter(b.match).length]),
      ) as Record<Bucket, number>,
    [tasks],
  );
  const shown = useMemo(() => {
    const match = BUCKETS.find(b => b.key === bucket)!.match;
    const list = tasks.filter(match);
    return bucket === 'done'
      ? list
          .sort((a, b) =>
            (b.completed_at || '').localeCompare(a.completed_at || ''),
          )
          .slice(0, 5)
      : list.sort(byNewest).slice(0, 5);
  }, [tasks, bucket]);

  const alerts = useMemo(() => {
    const soon = addDays(todayStr(), 1);
    return tasks
      .filter(x => isActive(x) && !!x.due_date && x.due_date <= soon)
      .sort(byDue);
  }, [tasks]);

  const openTask = (id: string) =>
    navigation.navigate('TaskDetail', { taskId: id });

  return (
    <View style={styles.flex}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing && ready}
            onRefresh={refresh}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Avatar name={viewer.name} id={viewer.id} size={58} />
          <View style={styles.hello}>
            <Text style={styles.greet}>{greeting()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {viewer.name || ' '}
            </Text>
          </View>
          <CircleButton
            dark
            label="New task"
            onPress={() => navigation.navigate('NewTask')}
            size={58}
          >
            <PlusIcon size={24} color={t.onInk} />
          </CircleButton>
          <CircleButton
            label={
              unreadCount
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
            onPress={() => setBellOpen(true)}
            size={58}
            style={styles.bell}
          >
            <BellIcon size={22} color={t.ink} />
            {(unreadCount > 0 || alerts.length > 0) && (
              <View style={styles.bellDot} />
            )}
          </CircleButton>
        </View>

        <Text style={styles.headline}>Let’s Make{'\n'}Today Productive</Text>

        <View style={styles.progressCard}>
          <View style={styles.progressLeft}>
            <Text style={styles.progressTitle}>Today’s Progress</Text>
            <ProgressRing percent={progress.pct} size={132} />
          </View>
          <View style={styles.divider} />
          <View style={styles.progressStats}>
            <ProgressStat value={progress.total} label="Total Task" />
            <ProgressStat value={progress.completed} label="Completed Task" />
            <ProgressStat value={progress.pending} label="Pending Task" />
          </View>
        </View>

        <SectionHeader
          title={`Hi ${firstName(viewer.name)}, your tasks`}
          action="View All"
          onAction={() =>
            navigation.navigate('TaskTabs', {
              screen: 'Tasks',
              params: { mode: 'all' },
            })
          }
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {BUCKETS.map(b => (
            <Chip
              key={b.key}
              label={b.label}
              count={ready ? counts[b.key] : undefined}
              active={bucket === b.key}
              activeColor={t.lime}
              onPress={() => setBucket(b.key)}
            />
          ))}
        </ScrollView>

        <View style={styles.list}>
          {!ready && [0, 1].map(i => <View key={i} style={styles.skeleton} />)}
          {ready && error && tasks.length === 0 && (
            <EmptyBlock
              title="Couldn’t load tasks"
              text={`${error}\nPull down to try again.`}
            />
          )}
          {ready && !error && shown.length === 0 && (
            <EmptyBlock
              icon={<CheckCircleIcon size={34} color={t.limeDeep} />}
              title="All clear"
              text="Nothing here right now."
            />
          )}
          {shown.map(x => (
            <TaskCard key={x.id} task={x} onPress={() => openTask(x.id)} />
          ))}
        </View>
      </ScrollView>

      <Sheet
        visible={bellOpen}
        onClose={() => {
          setBellOpen(false);
          markAllNotificationsRead();
        }}
        title="Notifications"
      >
        <ScrollView style={styles.alertList}>
          {notifications.length > 0 && (
            <Text style={styles.sheetSection}>Recent</Text>
          )}
          {notifications.slice(0, 10).map(n => {
            const done = n.kind === 'completed';
            return (
              <Pressable
                key={n.key}
                style={({ pressed }) => [
                  styles.alertRow,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  setBellOpen(false);
                  markAllNotificationsRead();
                  openNotification(n);
                }}
              >
                <View
                  style={[
                    styles.alertIcon,
                    { backgroundColor: done ? t.lime : t.ink },
                  ]}
                >
                  {done ? (
                    <CheckIcon size={18} color={t.ink} />
                  ) : (
                    <ClipboardIcon size={17} color={t.onInk} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.alertTitle} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text style={styles.alertSub} numberOfLines={1}>
                    {n.taskTitle} · {n.detail}
                  </Text>
                </View>
                <View style={styles.alertMeta}>
                  <Text style={styles.alertSub}>{timeAgo(n.at)}</Text>
                  {!n.read && <View style={styles.unreadDot} />}
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.sheetSection}>Needs attention</Text>
          {alerts.length === 0 ? (
            <EmptyBlock
              icon={<CheckCircleIcon size={30} color={t.limeDeep} />}
              title="Nothing overdue or due soon"
            />
          ) : (
            alerts.map(x => {
              const due = dueInfo(x);
              return (
                <Pressable
                  key={x.id}
                  style={({ pressed }) => [
                    styles.alertRow,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    setBellOpen(false);
                    openTask(x.id);
                  }}
                >
                  <View
                    style={[
                      styles.alertIcon,
                      {
                        backgroundColor:
                          due.tone === 'late' ? t.dangerSoft : '#FDF1DE',
                      },
                    ]}
                  >
                    <ClipboardIcon size={18} color={TONE_COLOR[due.tone]} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.alertTitle} numberOfLines={1}>
                      {x.title}
                    </Text>
                    <Text style={styles.alertSub} numberOfLines={1}>
                      {x.assigned_to_name}
                    </Text>
                  </View>
                  <Text
                    style={[styles.alertDue, { color: TONE_COLOR[due.tone] }]}
                  >
                    {due.text}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function ProgressStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIcon}>
        <ClipboardIcon size={16} color="#BDBDC4" />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hello: { flex: 1, marginLeft: 4 },
  greet: { fontSize: 20, color: t.text, fontFamily: font.regular },
  name: { fontSize: 15, color: t.textSecondary, marginTop: 2 },
  bell: { position: 'relative' },
  bellDot: {
    position: 'absolute',
    top: 16,
    right: 18,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: t.danger,
    borderWidth: 1.5,
    borderColor: t.surface,
  },
  headline: {
    fontSize: 36,
    lineHeight: 44,
    color: t.text,
    fontFamily: font.regular,
    marginTop: 26,
    marginBottom: 22,
    letterSpacing: -0.6,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#1F1F22',
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3A3A3F',
  },
  progressLeft: { gap: 16 },
  progressTitle: { color: t.onInk, fontSize: 17, fontFamily: font.medium },
  divider: { width: 1, backgroundColor: '#3E3E44', marginHorizontal: 18 },
  progressStats: { flex: 1, justifyContent: 'space-around' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2E2E33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { color: t.onInk, fontSize: 16, fontFamily: font.medium },
  statLabel: { color: '#A7A7AE', fontSize: 11 },
  chips: { gap: 10, paddingRight: 20 },
  list: { marginTop: 16 },
  skeleton: {
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  alertList: { maxHeight: 420 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { fontSize: 15, fontFamily: font.medium, color: t.text },
  alertSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  alertDue: { fontSize: 12, fontFamily: font.medium },
  alertMeta: { alignItems: 'flex-end', gap: 6 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.danger,
  },
  sheetSection: {
    fontSize: 13,
    color: t.textMuted,
    fontFamily: font.medium,
    marginTop: 8,
    marginBottom: 4,
  },
});
