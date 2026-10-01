import { kvGet, kvSet } from '../crm/secureKv';
import { addDays, fmtDateShort, fmtTime, isActive, todayStr } from './format';
import type { TeamMember, WorkTask } from './types';

/**
 * Task notifications ("New Task Created" / "Task Completed").
 *
 * The work-tasks backend doesn't emit notifications (and /api/notifications is
 * gated on job permissions task roles don't have), so events are derived on
 * the device from the same task API responses the screens already use:
 *  - local: the create/complete call's own response (see notifyLocal callers)
 *  - remote: diffing each server refresh of GET /api/work-tasks against the
 *    last known status of every relevant task (detectEvents)
 * Both paths produce the same TaskNotification and share one de-dup key per
 * event (`<taskId>:created` / `<taskId>:completed`), persisted per user, so an
 * event is shown once no matter how often it's seen. A push/socket source can
 * later feed events in through the same `ingest` path in TasksContext.
 */

export type TaskNotificationKind = 'created' | 'completed' | 'started' | 'paused' | 'resumed';

export interface TaskNotification {
  key: string;
  kind: TaskNotificationKind;
  taskId: string;
  title: string;
  taskTitle: string;
  detail: string;
  /** Who it came from, when known (assigner / person who started or finished it). */
  by?: string | null;
  at: string;
  read: boolean;
}

export interface NotificationState {
  /** Last known status of each task we track, for diffing. */
  known: Record<string, string>;
  /** Event keys already shown (de-dup), newest last. */
  seen: string[];
  /** History shown in the bell, newest first. */
  items: TaskNotification[];
}

const STORE_KEY = 'tasks.notifications';
const MAX_SEEN = 400;
const MAX_ITEMS = 30;

export const emptyState = (): NotificationState => ({ known: {}, seen: [], items: [] });

export async function loadState(userId: number): Promise<NotificationState | null> {
  return kvGet<NotificationState>(String(userId), STORE_KEY);
}

export function saveState(userId: number, s: NotificationState): Promise<void> {
  return kvSet(String(userId), STORE_KEY, {
    known: s.known,
    seen: s.seen.slice(-MAX_SEEN),
    items: s.items.slice(0, MAX_ITEMS),
  });
}

/** One key per event, for de-dup. Pause / resume can happen many times, so their
 *  keys include when it happened (the task's updated_at). */
export const eventKey = (taskId: string, kind: TaskNotificationKind, at?: string | null) =>
  (kind === 'paused' || kind === 'resumed') && at ? `${taskId}:${kind}:${at}` : `${taskId}:${kind}`;

/** "Today, 10:00 AM" / "Tomorrow" / "Oct 3, 2026, 9:00 AM" */
export function dueLabel(date: string | null, time: string | null): string {
  if (!date) return 'No due date';
  const day = date === todayStr() ? 'Today' : date === addDays(todayStr(), 1) ? 'Tomorrow' : fmtDateShort(date);
  const tm = fmtTime(time);
  return tm ? `${day}, ${tm}` : day;
}

const TITLES: Record<TaskNotificationKind, string> = {
  created: 'New Task Created',
  started: 'Task Started',
  paused: 'Task Paused',
  resumed: 'Task Resumed',
  completed: 'Task Completed',
};

export function buildNotification(task: WorkTask, kind: TaskNotificationKind, byName?: string | null): TaskNotification {
  return {
    key: eventKey(task.id, kind, task.updated_at),
    kind,
    taskId: task.id,
    title: TITLES[kind],
    taskTitle: task.title,
    detail:
      kind === 'created'
        ? `Due: ${dueLabel(task.due_date, task.due_time)}`
        : kind === 'started' || kind === 'paused' || kind === 'resumed'
          ? `${kind === 'started' ? 'Started' : kind === 'paused' ? 'Paused' : 'Resumed'} by ${byName || task.assigned_to_name || 'the assignee'}.`
          : byName
            ? `Completed by ${byName}.`
            : 'has been completed successfully.',
    by: kind === 'created' ? task.created_by_name : byName ?? null,
    at: new Date().toISOString(),
    read: false,
  };
}

/** Someone else assigned this task to me. */
const isCreatedForMe = (x: WorkTask, me: number) => x.assigned_to === me && x.created_by !== me;

/** Someone else finished a task I created, or one belonging to my direct report. */
const isCompletionForMe = (x: WorkTask, me: number, directIds: Set<number>) =>
  x.completed_by !== me && (x.created_by === me || directIds.has(x.assigned_to));

/**
 * Diffs a fresh server task list against the last known statuses.
 * `baseline` = first run for this user: remember everything, announce nothing.
 */
export function detectEvents(
  tasks: WorkTask[],
  state: NotificationState,
  me: number,
  team: TeamMember[],
  baseline: boolean,
): { events: TaskNotification[]; known: Record<string, string> } {
  const directIds = new Set(team.filter((m) => m.is_direct).map((m) => m.id));
  const known: Record<string, string> = {};
  const events: TaskNotification[] = [];

  for (const x of tasks) {
    const tracked = isCreatedForMe(x, me) || x.created_by === me || directIds.has(x.assigned_to);
    if (!tracked) continue;
    const prev = state.known[x.id];
    known[x.id] = x.status;
    if (baseline) continue;

    if (prev === undefined) {
      if (isCreatedForMe(x, me) && isActive(x)) events.push(buildNotification(x, 'created'));
    } else if (
      prev === 'IN_PROGRESS' &&
      x.status === 'PAUSED' &&
      x.assigned_to !== me &&
      (x.created_by === me || directIds.has(x.assigned_to))
    ) {
      // Only the assignee can pause or resume, so "someone else" = assignee isn't me.
      events.push(buildNotification(x, 'paused', x.assigned_to_name));
    } else if (
      prev === 'PAUSED' &&
      x.status === 'IN_PROGRESS' &&
      x.assigned_to !== me &&
      (x.created_by === me || directIds.has(x.assigned_to))
    ) {
      events.push(buildNotification(x, 'resumed', x.assigned_to_name));
    } else if (prev === 'OPEN' && x.status === 'IN_PROGRESS' && x.started_by !== me && (x.created_by === me || directIds.has(x.assigned_to))) {
      events.push(buildNotification(x, 'started', x.assigned_to_name));
    } else if (prev !== 'COMPLETED' && x.status === 'COMPLETED' && isCompletionForMe(x, me, directIds)) {
      const by = x.completed_by === x.assigned_to ? x.assigned_to_name : null;
      events.push(buildNotification(x, 'completed', by));
    }
  }
  return { events, known };
}
