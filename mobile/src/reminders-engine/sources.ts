import { httpClient } from '../api/httpClient';
import { todayStr } from '../tasks/format';
import type { WorkTask } from '../tasks/types';
import type { ReminderItem, ReminderKind, ReminderRoute } from './engine';

const OPEN = ['OPEN', 'IN_PROGRESS', 'PAUSED'];

/**
 * Everything due from today that is assigned to me, from the one place they all live: work tasks.
 * Lead meetings (LEAD_MEETING) and follow-ups (LEAD_FOLLOW_UP) are work tasks, Task Management's
 * tasks are, and payment follow-ups are too when they are created as tasks - so one request feeds
 * every module's reminders. GET /api/work-tasks needs no extra permission for your own tasks.
 */
export async function myUpcomingTasks(myId: string): Promise<WorkTask[]> {
  const { data } = await httpClient.get<WorkTask[]>('/api/work-tasks', {
    params: { assigned_to: myId, from_date: todayStr() },
  });
  return data.filter((t) => OPEN.includes(String(t.status)) && !!t.due_date);
}

function kindOf(t: WorkTask): ReminderKind {
  const type = String(t.task_type ?? '').toUpperCase();
  const source = String(t.source_module ?? '').toUpperCase();
  if (type === 'LEAD_MEETING') return 'meeting';
  if (type === 'LEAD_FOLLOW_UP') return 'followup';
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
  return { app: 'task', screen: 'TaskDetail', params: { taskId: t.id } };
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
    fromSomeoneElse: String(t.created_by) !== String(myId),
    route: routeOf(t, kind),
  };
}
