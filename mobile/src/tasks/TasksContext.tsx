import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/httpClient';
import { Toast, type ToastMessage } from '../components/Toast';
import * as api from './api';
import type { TaskStackParamList } from './navigation';
import {
  buildNotification,
  detectEvents,
  emptyState,
  loadState,
  saveState,
  type NotificationState,
  type TaskNotification,
  type TaskNotificationKind,
} from './notifications';
import type { TeamMember, WorkTask } from './types';
import { NotificationToast } from './ui/NotificationToast';

/** How often the task list is quietly re-fetched to pick up other people's changes. */
const POLL_MS = 60000;

/**
 * The signed-in person plus one shared, cached task list - the mobile twin
 * of the web's ViewerProvider + tasksApi store. The server already scopes
 * GET /api/work-tasks to what this person may see, so every tab just filters
 * this one list; mutations patch it from what the server hands back.
 */
export interface Viewer {
  id: number;
  name: string;
  role: string;
  isAdmin: boolean;
  team: TeamMember[];
}

interface TasksContextValue {
  viewer: Viewer;
  tasks: WorkTask[];
  ready: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  patch: (task: WorkTask) => void;
  /** Drops a deleted task from the shared list. */
  removeTask: (id: string) => void;
  /** Self + team (or everyone, for admin) - who this viewer may assign to. */
  assignable: TeamMember[];
  showToast: (message: string, variant?: ToastMessage['variant']) => void;
  /** Stored task notifications for the bell, newest first. */
  notifications: TaskNotification[];
  unreadCount: number;
  /** Announce an event this device caused itself (create / complete response). */
  notifyLocal: (task: WorkTask, kind: TaskNotificationKind, opts?: { toast?: boolean }) => void;
  openNotification: (n: TaskNotification) => void;
  markAllNotificationsRead: () => void;
  /** Called once by the task stack so notifications can open a task from anywhere. */
  registerNavigator: (nav: NativeStackNavigationProp<TaskStackParamList>) => void;
}

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

/**
 * Merges a fresh download into the list on screen. Tasks that didn't change keep
 * their old object, and if nothing changed the same array comes back, so React
 * skips redrawing the screens (and rows) that show them.
 */
function mergeTasks(prev: WorkTask[], next: WorkTask[]): WorkTask[] {
  const byId = new Map(prev.map((t) => [t.id, t]));
  let changed = prev.length !== next.length;
  const merged = next.map((t, i) => {
    const old = byId.get(t.id);
    if (old && JSON.stringify(old) === JSON.stringify(t)) {
      if (prev[i] !== old) changed = true;
      return old;
    }
    changed = true;
    return t;
  });
  return changed ? merged : prev;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [allUsers, setAllUsers] = useState<TeamMember[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [queue, setQueue] = useState<TaskNotification[]>([]);
  const navRef = useRef<NativeStackNavigationProp<TaskStackParamList> | null>(null);
  const notifState = useRef<NotificationState>(emptyState());
  const baseline = useRef(true);
  const teamRef = useRef<TeamMember[]>([]);
  teamRef.current = team;

  const viewer = useMemo<Viewer>(
    () => ({
      id: Number(user?.id ?? session?.userId ?? 0),
      name: user?.name ?? '',
      role: String(user?.role ?? session?.role ?? ''),
      isAdmin: (user?.role ?? session?.role) === 'admin',
      team,
    }),
    [user, session, team],
  );

  const userId = viewer.id;

  // Stored notification state is per user; wait for it before the first diff.
  const stateLoaded = useMemo(
    () =>
      loadState(userId).then((stored) => {
        baseline.current = !stored;
        notifState.current = stored ?? emptyState();
        setNotifications(notifState.current.items);
      }),
    [userId],
  );

  /** Single entry point for every event source; drops anything already shown. */
  const ingest = useCallback(
    (events: TaskNotification[], popup = true) => {
      const st = notifState.current;
      const fresh = events.filter((e) => !st.seen.includes(e.key));
      if (!fresh.length) return;
      st.seen = [...st.seen, ...fresh.map((e) => e.key)];
      st.items = [...fresh.slice().reverse(), ...st.items].slice(0, 30);
      setNotifications(st.items);
      if (popup) setQueue((q) => [...q, ...fresh]);
      saveState(userId, st);
    },
    [userId],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const list = await api.listTasks();
        setTasks((prev) => mergeTasks(prev, list));
        setError(null);
        await stateLoaded;
        const before = JSON.stringify([notifState.current.known, notifState.current.knownReq, notifState.current.knownDue]);
        const { events, known, knownReq, knownDue } = detectEvents(list, notifState.current, userId, teamRef.current, baseline.current);
        notifState.current.known = known;
        notifState.current.knownReq = knownReq;
        notifState.current.knownDue = knownDue;
        if (baseline.current) {
          baseline.current = false;
          saveState(userId, notifState.current);
        } else if (events.length) {
          ingest(events);
        } else if (before !== JSON.stringify([known, knownReq, knownDue])) {
          // Only write to storage when the remembered statuses actually moved on.
          saveState(userId, notifState.current);
        }
      } catch (err) {
        if (!silent) setError(errorMessage(err));
      } finally {
        if (!silent) setRefreshing(false);
        setReady(true);
      }
    },
    [stateLoaded, userId, ingest],
  );
  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => {
    refresh();
    api.fetchMyTeam().then(setTeam).catch(() => setTeam([]));
  }, [refresh]);

  // Quiet background re-fetch while the app is open, and on returning to it.
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load(true);
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') load(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  const notifyLocal = useCallback(
    (task: WorkTask, kind: TaskNotificationKind, opts?: { toast?: boolean }) => {
      notifState.current.known[task.id] = task.status;
      ingest([buildNotification(task, kind)], opts?.toast ?? true);
    },
    [ingest],
  );

  const openNotification = useCallback(
    (n: TaskNotification) => {
      const st = notifState.current;
      st.items = st.items.map((x) => (x.key === n.key ? { ...x, read: true } : x));
      setNotifications(st.items);
      saveState(userId, st);
      navRef.current?.push('TaskDetail', { taskId: n.taskId });
    },
    [userId],
  );

  const markAllNotificationsRead = useCallback(() => {
    const st = notifState.current;
    if (!st.items.some((x) => !x.read)) return;
    st.items = st.items.map((x) => ({ ...x, read: true }));
    setNotifications(st.items);
    saveState(userId, st);
  }, [userId]);

  const registerNavigator = useCallback((nav: NativeStackNavigationProp<TaskStackParamList>) => {
    navRef.current = nav;
  }, []);

  const unreadCount = useMemo(() => notifications.filter((x) => !x.read).length, [notifications]);

  useEffect(() => {
    if (viewer.isAdmin) api.fetchAllUsers().then(setAllUsers);
  }, [viewer.isAdmin]);

  const patch = useCallback((task: WorkTask) => {
    setTasks((list) =>
      list.some((x) => x.id === task.id)
        ? list.map((x) => (x.id === task.id ? { ...x, ...task } : x))
        : [task, ...list],
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((list) => list.filter((x) => x.id !== id));
  }, []);

  const assignable = useMemo<TeamMember[]>(() => {
    if (!viewer.id) return [];
    if (viewer.isAdmin && allUsers.length) return allUsers;
    return [{ id: viewer.id, name: viewer.name, role: viewer.role }, ...team];
  }, [viewer, team, allUsers]);

  const showToast = useCallback((message: string, variant: ToastMessage['variant'] = 'success') => {
    setToast({ message, variant });
  }, []);

  const value = useMemo(
    () => ({
      viewer,
      tasks,
      ready,
      refreshing,
      error,
      refresh,
      patch,
      removeTask,
      assignable,
      showToast,
      notifications,
      unreadCount,
      notifyLocal,
      openNotification,
      markAllNotificationsRead,
      registerNavigator,
    }),
    [
      viewer,
      tasks,
      ready,
      refreshing,
      error,
      refresh,
      patch,
      removeTask,
      assignable,
      showToast,
      notifications,
      unreadCount,
      notifyLocal,
      openNotification,
      markAllNotificationsRead,
      registerNavigator,
    ],
  );

  return (
    <TasksContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <NotificationToast item={queue[0] ?? null} onOpen={openNotification} onDismiss={() => setQueue((q) => q.slice(1))} />
      </View>
    </TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider');
  return ctx;
}

/**
 * One task by id: the shared list's copy (always the latest the app wrote or
 * fetched), or a one-off GET when it isn't in the list yet.
 */
export function useTaskById(id: string): { task: WorkTask | null; error: string | null } {
  const { tasks, patch } = useTasks();
  const fromList = tasks.find((x) => x.id === id) ?? null;
  const [fetched, setFetched] = useState<WorkTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fromList) return;
    api
      .getTask(id)
      .then((x) => {
        setFetched(x);
        patch(x);
      })
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return { task: fromList ?? fetched, error };
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
