import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { InboxIcon, PlusIcon } from '../../components/icons';
import { byNewest, LIST_MODES, type ListMode } from '../format';
import type { TaskStackParamList, TaskTabParamList } from '../navigation';
import { useTasks } from '../TasksContext';
import { font, radius, t } from '../theme';
import { Backdrop } from '../ui/Backdrop';
import { Chip, CircleButton, EmptyBlock } from '../ui/primitives';
import { SearchIcon } from '../ui/taskIcons';
import { TaskCard } from '../ui/TaskCard';

const MODE_ORDER: ListMode[] = ['my', 'team', 'overdue', 'upcoming', 'completed', 'all'];

export function TaskListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<TaskStackParamList>>();
  const route = useRoute<RouteProp<TaskTabParamList, 'Tasks'>>();
  const { tasks, viewer, ready, refreshing, refresh, error } = useTasks();
  const [mode, setMode] = useState<ListMode>(route.params?.mode ?? 'my');
  const [q, setQ] = useState('');

  // A drill-down from Home / Schedule ("View All", overdue banner) picks the view.
  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
  }, [route.params?.mode]);

  const hasTeam = viewer.team.length > 0 || viewer.isAdmin;
  const modes = useMemo(() => MODE_ORDER.filter((m) => m !== 'team' || hasTeam), [hasTeam]);

  const counts = useMemo(
    () => Object.fromEntries(modes.map((m) => [m, tasks.filter((x) => LIST_MODES[m].match(x, viewer.id)).length])),
    [tasks, viewer.id, modes],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tasks
      .filter((x) => LIST_MODES[mode].match(x, viewer.id))
      .filter(
        (x) =>
          !needle ||
          x.title.toLowerCase().includes(needle) ||
          (x.assigned_to_name || '').toLowerCase().includes(needle) ||
          (x.task_type || '').toLowerCase().includes(needle),
      );
    return mode === 'completed'
      ? list.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
      : list.sort(byNewest);
  }, [tasks, mode, q, viewer.id]);

  return (
    <View style={styles.flex}>
      <Backdrop />
      <FlatList
        data={ready ? shown : []}
        keyExtractor={(x) => x.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}
        refreshControl={<RefreshControl refreshing={refreshing && ready} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.title}>{LIST_MODES[mode].label === 'All' ? 'All Tasks' : LIST_MODES[mode].label}</Text>
              <CircleButton dark label="New task" size={56} onPress={() => navigation.navigate('NewTask')}>
                <PlusIcon size={22} color={t.onInk} />
              </CircleButton>
            </View>
            <View style={styles.search}>
              <SearchIcon size={20} color={t.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search by title, person or type"
                placeholderTextColor={t.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {modes.map((m) => (
                <Chip
                  key={m}
                  label={LIST_MODES[m].label}
                  count={ready ? counts[m] : undefined}
                  active={mode === m}
                  activeColor={m === 'overdue' ? t.danger : t.ink}
                  onPress={() => setMode(m)}
                />
              ))}
            </ScrollView>
            {!ready && [0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
          </View>
        }
        ListEmptyComponent={
          ready ? (
            error ? (
              <EmptyBlock title="Couldn’t load tasks" text={`${error}\nPull down to try again.`} />
            ) : (
              <EmptyBlock
                icon={<InboxIcon size={36} color={t.textMuted} />}
                title={q ? 'No matches' : 'Nothing here'}
                text={q ? `No task matches “${q}”.` : 'Tasks in this view will show up here.'}
              />
            )
          ) : undefined
        }
        renderItem={({ item }) => (
          <TaskCard task={item} onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { fontSize: 34, color: t.text, fontFamily: font.regular, letterSpacing: -0.5 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchInput: { flex: 1, minHeight: 54, fontSize: 15, color: t.text, fontFamily: font.regular },
  chips: { gap: 10, paddingRight: 20, marginBottom: 18 },
  skeleton: { height: 150, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.6)', marginBottom: 12 },
});
