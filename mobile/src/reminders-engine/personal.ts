import { httpClient } from '../api/httpClient';
import type { WorkTask } from '../tasks/types';
import type { ReminderItem } from './engine';

/**
 * Personal reminders: alarms a person sets for themselves ("Call Ravi back", "Send the GST copy").
 * Saved on the server as the person's own work task of type PERSONAL_REMINDER, so they survive a
 * reinstall or a new phone and ring through the same engine as meetings and follow-ups. Linked to
 * a lead through source_module REMINDER + source_id (kept apart from source_module LEAD, so they
 * never show up as lead follow-ups).
 */
export const PERSONAL_REMINDER = 'PERSONAL_REMINDER';

export interface ReminderInput {
  title: string;
  note: string;
  date: string;
  /** 'HH:MM' - a personal reminder always has a time. */
  time: string;
  leadId?: string | null;
}

export async function createReminder(myId: string, r: ReminderInput): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>('/api/work-tasks', {
    title: r.title,
    description: r.note || undefined,
    task_type: PERSONAL_REMINDER,
    priority: 'NORMAL',
    assigned_to: Number(myId),
    due_date: r.date,
    due_time: r.time,
    source_module: r.leadId ? 'REMINDER' : undefined,
    source_id: r.leadId || undefined,
  });
  return data;
}

/** Saves an edited reminder: its words, and its time only when that changed. */
export async function updateReminder(task: WorkTask, r: ReminderInput): Promise<void> {
  if (r.title !== task.title || (r.note || null) !== (task.description || null)) {
    await httpClient.put(`/api/work-tasks/${task.id}`, { title: r.title, description: r.note || null });
  }
  const oldTime = (task.due_time ?? '').slice(0, 5);
  if (r.date !== String(task.due_date).slice(0, 10) || r.time !== oldTime) {
    await httpClient.post(`/api/work-tasks/${task.id}/reschedule`, { due_date: r.date, due_time: r.time });
  }
}

export async function deleteReminder(taskId: string): Promise<void> {
  await httpClient.delete(`/api/work-tasks/${taskId}`);
}

export async function completeReminder(taskId: string): Promise<void> {
  await httpClient.post(`/api/work-tasks/${taskId}/complete`, {});
}

export async function getReminderTask(taskId: string): Promise<WorkTask> {
  const { data } = await httpClient.get<WorkTask>(`/api/work-tasks/${taskId}`);
  return data;
}

/** Open follow-ups already set on a lead (the "a follow-up is already there" check). */
export async function openFollowUpsFor(leadId: string): Promise<WorkTask[]> {
  const { data } = await httpClient.get<WorkTask[]>('/api/work-tasks', {
    params: { source_id: leadId, task_type: 'LEAD_FOLLOW_UP' },
  });
  return data.filter((t) => ['OPEN', 'IN_PROGRESS', 'PAUSED'].includes(String(t.status)));
}

/**
 * What already rings at this moment: anything of mine on the same day at the same minute (or, for
 * an item with no time, nothing - it only rings at 9:00). `exceptKey` leaves out the item being edited.
 */
export function clashesAt(items: ReminderItem[], date: string, time: string | null, exceptKey?: string): ReminderItem[] {
  if (!time) return [];
  const hhmm = time.slice(0, 5);
  return items.filter((i) => i.key !== exceptKey && i.date === date && !!i.time && i.time.slice(0, 5) === hhmm);
}
