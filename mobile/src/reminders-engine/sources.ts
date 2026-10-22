import { httpClient } from '../api/httpClient';
import { fmtDateShort, fmtTime, todayStr } from '../tasks/format';
import type { WorkTask } from '../tasks/types';
import type { ReminderItem, ReminderKind, ReminderRoute } from './engine';

const OPEN = ['OPEN', 'IN_PROGRESS', 'PAUSED'];

/**
 * Everything due from today that is assigned to me, from the one place they all live: work tasks.
 * Lead meetings (LEAD_MEETING) and follow-ups (LEAD_FOLLOW_UP) are work tasks, Task Management's
 * tasks are, and payment follow-ups are too when they are created as tasks - so one request feeds
 * every module's reminders. GET /api/work-tasks needs no extra permission for your own tasks.
 */
export async function myUpcomingTasks(myId: string, { withTaskReminders = false } = {}): Promise<WorkTask[]> {
  const { data } = await httpClient.get<WorkTask[]>('/api/work-tasks', {
    // The reminders set on Task Management tasks are left out of every list unless asked for: only
    // the engine that arms the alarms asks (the Lead app's own reminder list never shows them).
    params: { assigned_to: myId, from_date: todayStr(), include_task_reminders: withTaskReminders ? '1' : undefined },
  });
  return data.filter((t) => OPEN.includes(String(t.status)) && !!t.due_date);
}

/**
 * A reminder set on a Task Management task: the same PERSONAL_REMINDER work task the Lead app uses,
 * pointing at the task (source_module WORK_TASK) - always for the task's assignee, kept at the task's
 * due time by the server. Only these make a task ring; a task without one does not.
 */
const isTaskReminder = (t: WorkTask) =>
  String(t.task_type ?? '').toUpperCase() === 'PERSONAL_REMINDER' && String(t.source_module ?? '').toUpperCase() === 'WORK_TASK';

function kindOf(t: WorkTask): ReminderKind {
  const type = String(t.task_type ?? '').toUpperCase();
  const source = String(t.source_module ?? '').toUpperCase();
  if (type === 'LEAD_MEETING') return 'meeting';
  if (type === 'LEAD_FOLLOW_UP') return 'followup';
  if (isTaskReminder(t)) return 'task';
  if (type === 'PERSONAL_REMINDER') return 'personal';
  if (type.includes('PAYMENT') || source === 'PAYMENT' || source === 'INVOICE') return 'payment';
  return 'task';
}

function routeOf(t: WorkTask, kind: ReminderKind): ReminderRoute | null {
  if (kind === 'personal') {
    return t.source_id
      ? { app: 'lead', screen: 'LeadDetail', params: { leadId: t.source_id } }
      : { app: 'lead', screen: 'LeadReminders' };
  }
  if ((kind === 'meeting' || kind === 'followup') && t.source_id) return { app: 'lead', screen: 'LeadDetail', params: { leadId: t.source_id } };
  if (kind === 'payment') return { app: 'payment', screen: 'ReminderDetail', params: { reminderId: t.id } };
  return { app: 'task', screen: 'TaskDetail', params: { taskId: isTaskReminder(t) && t.source_id ? t.source_id : t.id } };
}

/** "Site visit - TestToday" -> "TestToday" (the meeting kind is said by the reminder's title). */
function cleanTitle(t: WorkTask, kind: ReminderKind): string {
  const title = t.title || '';
  if (kind === 'meeting') return title.replace(/^(Site visit|Meeting)\s*-\s*/i, '');
  return title;
}

export function taskToReminder(t: WorkTask, myId: string): ReminderItem {
  const kind = kindOf(t);
  return {
    key: `task:${t.id}`,
    kind,
    title: cleanTitle(t, kind),
    detail:
      kind === 'meeting'
        ? /^meeting/i.test(t.title)
          ? 'Office meeting'
          : 'Site visit'
        : kind === 'followup'
        ? 'Call back'
        : kind === 'personal'
        ? t.description || undefined
        : undefined,
    date: String(t.due_date).slice(0, 10),
    time: t.due_time ? String(t.due_time).slice(0, 8) : null,
    // The task itself already announced itself when it was given to you; its reminder does not again.
    fromSomeoneElse: !isTaskReminder(t) && String(t.created_by) !== String(myId),
    // A Task Management task, a lead meeting and a lead follow-up ring only through a reminder set
    // on them (see tasksToReminders) - none rings at its own time by default.
    ring: (kind !== 'task' && kind !== 'meeting' && kind !== 'followup') || isTaskReminder(t),
    route: routeOf(t, kind),
  };
}

/**
 * Every work task (and every reminder set on one) as reminder items. A reminder set on a lead
 * meeting or follow-up rings at its own date and time as a "Meeting / Follow-up reminder" that
 * opens the lead; the meeting / follow-up itself does not ring.
 */
export function tasksToReminders(tasks: WorkTask[], myId: string): ReminderItem[] {
  const byId = new Map(tasks.map((t) => [String(t.id), t]));
  return tasks.map((t) => {
    const base = taskToReminder(t, myId);
    if (!isTaskReminder(t) || !t.source_id) return base;
    const item = { ...base, parentTaskId: String(t.source_id) };
    const parent = byId.get(String(t.source_id));
    const parentKind = parent ? kindOf(parent) : null;
    if (!parent || (parentKind !== 'meeting' && parentKind !== 'followup')) return item;
    const at = `${fmtDateShort(String(parent.due_date).slice(0, 10)).replace(/, \d{4}$/, '')}${parent.due_time ? `, ${fmtTime(String(parent.due_time))}` : ''}`;
    const parentItem = taskToReminder(parent, myId);
    return {
      ...item,
      kind: parentKind,
      title: cleanTitle(parent, parentKind),
      detail: `${parentItem.detail} · ${at}`,
      ring: true,
      fromSomeoneElse: false,
      route: parent.source_id ? { app: 'lead', screen: 'LeadDetail', params: { leadId: parent.source_id } } : item.route,
    };
  });
}
