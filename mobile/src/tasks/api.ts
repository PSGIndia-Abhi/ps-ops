import { httpClient } from '../api/httpClient';
import type {
  CreateSeriesResponse,
  CreateTaskInput,
  TaskAttachment,
  TaskComment,
  TaskHistoryEntry,
  TaskSeries,
  TeamMember,
  WorkTask,
} from './types';

/**
 * Task Management data access - the same endpoints the web TaskPro area uses
 * (frontend/src/pages/taskpro/tasksApi.js). Never re-implements a business
 * rule: the server scopes every list and refuses any action the user may not
 * take, and a refusal surfaces as a normal ApiError the screen shows as a toast.
 */

export async function listTasks(): Promise<WorkTask[]> {
  const { data } = await httpClient.get<WorkTask[]>('/api/work-tasks');
  return data;
}

export async function getTask(id: string): Promise<WorkTask> {
  const { data } = await httpClient.get<WorkTask>(`/api/work-tasks/${id}`);
  return data;
}

export async function createTask(input: CreateTaskInput): Promise<WorkTask | CreateSeriesResponse> {
  const { data } = await httpClient.post('/api/work-tasks', input);
  return data;
}

export async function updateTask(
  id: string,
  fields: Partial<Pick<WorkTask, 'title' | 'description' | 'task_type' | 'priority'>>,
): Promise<WorkTask> {
  const { data } = await httpClient.put<WorkTask>(`/api/work-tasks/${id}`, fields);
  return data;
}

export async function startTask(id: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/start`);
  return data;
}

/** IN_PROGRESS -> PAUSED. Only the assignee; a reason is required. */
export async function pauseTask(id: string, reason: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/pause`, { reason });
  return data;
}

/** PAUSED -> IN_PROGRESS. The paused time is kept out of "time worked". */
export async function resumeTask(id: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/resume`);
  return data;
}

export async function addProgress(id: string, note: string, nextAction?: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/progress`, {
    note,
    next_action: nextAction || undefined,
  });
  return data;
}

export async function completeTask(id: string, completionNote?: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(
    `/api/work-tasks/${id}/complete`,
    completionNote ? { completion_note: completionNote } : {},
  );
  return data;
}

export async function reassignTask(id: string, assignedTo: number, note?: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/reassign`, {
    assigned_to: assignedTo,
    note: note || undefined,
  });
  return data;
}

export async function rescheduleTask(
  id: string,
  dueDate: string,
  dueTime: string | null,
  reason?: string,
): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/reschedule`, {
    due_date: dueDate,
    due_time: dueTime,
    reason: reason || undefined,
  });
  return data;
}

/** Cancels one recurring occurrence - the series and its other occurrences are untouched. */
export async function skipTask(id: string, reason?: string): Promise<WorkTask> {
  const { data } = await httpClient.post<WorkTask>(`/api/work-tasks/${id}/skip`, reason ? { reason } : {});
  return data;
}

/**
 * Permanently deletes the task with its comments, files, reschedule requests
 * and history (DELETE /api/work-tasks/:id). Only the task's creator may; the
 * backend refuses anyone else. There is no undo.
 */
export async function deleteTask(id: string): Promise<void> {
  await httpClient.delete(`/api/work-tasks/${id}`);
}

export async function fetchTaskTypes(): Promise<string[]> {
  const { data } = await httpClient.get<string[]>('/api/work-tasks/types');
  return data;
}

/** GET /api/users/me/team - everyone below the signed-in user in the org hierarchy. */
export async function fetchMyTeam(): Promise<TeamMember[]> {
  const { data } = await httpClient.get<{ members: TeamMember[] }>('/api/users/me/team');
  return data?.members ?? [];
}

/** VIEW_USER-gated server-side (admin); anyone else gets [] - "not available", not an error. */
export async function fetchAllUsers(): Promise<TeamMember[]> {
  try {
    const { data } = await httpClient.get('/api/users');
    const list = Array.isArray(data) ? data : data?.users ?? [];
    return list.filter((u: { is_active?: number | boolean }) => u.is_active !== 0 && u.is_active !== false);
  } catch {
    return [];
  }
}

// ---- comments / attachments / history ------------------------------------

export async function listComments(id: string): Promise<TaskComment[]> {
  const { data } = await httpClient.get<TaskComment[]>(`/api/work-tasks/${id}/comments`);
  return data;
}

export async function addComment(id: string, comment: string): Promise<TaskComment> {
  const { data } = await httpClient.post<TaskComment>(`/api/work-tasks/${id}/comments`, { comment });
  return data;
}

export async function listAttachments(id: string): Promise<TaskAttachment[]> {
  const { data } = await httpClient.get<TaskAttachment[]>(`/api/work-tasks/${id}/attachments`);
  return data;
}

export async function uploadAttachment(
  id: string,
  file: { uri: string; name: string; type: string },
): Promise<TaskAttachment> {
  const form = new FormData();
  // RN's FormData streams this {uri,name,type} shape from the uri (see api/jobs.ts).
  form.append('file', file as unknown as Blob);
  const { data } = await httpClient.post<TaskAttachment>(`/api/work-tasks/${id}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteAttachment(id: string, attachmentId: string): Promise<void> {
  await httpClient.delete(`/api/work-tasks/${id}/attachments/${attachmentId}`);
}

/** Relative path - the viewer adds API_BASE_URL and the Bearer header itself. */
export const attachmentViewPath = (id: string, attachmentId: string) =>
  `/api/work-tasks/${id}/attachments/${attachmentId}/view`;

export async function listHistory(id: string): Promise<TaskHistoryEntry[]> {
  const { data } = await httpClient.get<TaskHistoryEntry[]>(`/api/work-tasks/${id}/history`);
  return data;
}

// ---- recurring series ------------------------------------------------------

export async function getSeries(id: string): Promise<TaskSeries> {
  const { data } = await httpClient.get<TaskSeries>(`/api/work-task-series/${id}`);
  return data;
}

export async function pauseSeries(id: string, pauseFrom: string, pauseUntil?: string): Promise<void> {
  await httpClient.post(`/api/work-task-series/${id}/pause`, {
    pause_from: pauseFrom,
    pause_until: pauseUntil || undefined,
  });
}

export async function resumeSeries(id: string): Promise<void> {
  await httpClient.post(`/api/work-task-series/${id}/resume`);
}

export async function stopSeries(id: string): Promise<void> {
  await httpClient.post(`/api/work-task-series/${id}/stop`);
}
