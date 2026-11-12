import { httpClient } from '../api/httpClient';
import { listTasks } from '../tasks/api';
import { isOverdue } from '../tasks/format';

/**
 * The numbers on the "Switch app" choices (as on the web's switch buttons): what waits in the other
 * app, added up from that app's own red numbers.
 */

/** Task Management: overdue tasks + reschedule requests waiting for this user. */
export async function taskSwitchCount(): Promise<number> {
  const [tasks, requests] = await Promise.all([
    listTasks(),
    httpClient.get<unknown[]>('/api/work-tasks/reschedule-requests', { params: { box: 'incoming' } }).then((r) => r.data),
  ]);
  // Same list as the app: reminders and lead follow-ups / meetings are worked elsewhere.
  const overdue = tasks.filter(
    (t) => t.task_type !== 'PERSONAL_REMINDER' && t.task_type !== 'LEAD_FOLLOW_UP' && t.task_type !== 'LEAD_MEETING' && isOverdue(t),
  ).length;
  return overdue + (Array.isArray(requests) ? requests.length : 0);
}

/** Customer Feedback: wrong-number requests waiting + open tickets. */
export async function feedbackSwitchCount(): Promise<number> {
  const { data } = await httpClient.get<{ open_requests?: number; open_tickets?: number }>('/api/feedback/badges');
  return (Number(data.open_requests) || 0) + (Number(data.open_tickets) || 0);
}
