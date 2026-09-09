import { httpClient } from './httpClient';
import type { AppNotification } from '../types/notification';

/**
 * GET /api/notifications/unread-count - requires VIEW_JOB (same permission
 * gate every role dashboard already needs). Mirrors the exact response
 * shape the web app reads (frontend/src/hooks/useNotifications.js: `{count}`).
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await httpClient.get<{ count: number }>('/api/notifications/unread-count');
  return Number(data?.count || 0);
}

/** GET /api/notifications - requires VIEW_JOB. `limit` is clamped server-side to 1-50. */
export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data } = await httpClient.get<AppNotification[]>('/api/notifications', {
    params: { limit },
  });
  return data;
}

/**
 * PATCH /api/notifications/:id/read - requires UPDATE_JOB. Same contract the
 * web app uses (frontend/src/hooks/useNotifications.js markAsRead).
 *
 * KNOWN BACKEND GAP (verified against the actual role_permissions table,
 * not guessed): the `technician` role does not have UPDATE_JOB - only
 * ADD_JOB_COMMENT/START_SHIFT/START_VISIT/SUBMIT_VISIT/VIEW_JOB/VIEW_VISIT/
 * END_SHIFT/VIEW_OWN_SHIFT. That means this call (and read-all below) 403s
 * for every technician account today, on web as well as mobile - marking a
 * notification read is gated behind a job-editing permission that
 * conceptually has nothing to do with it. Fixing this requires a backend
 * change (either grant a narrower permission to technician, or gate these
 * two routes on something other than UPDATE_JOB) that mobile is not
 * authorized to make in this phase - see the final report's "backend gaps"
 * section. `supervisor` does have UPDATE_JOB, so this works for that role.
 */
export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/notifications/${id}/read`);
  return data;
}

/** POST /api/notifications/read-all - requires UPDATE_JOB. See markNotificationRead's doc comment for the technician-role permission gap this route shares. */
export async function markAllNotificationsRead(): Promise<{ success: boolean; updated: number }> {
  const { data } = await httpClient.post('/api/notifications/read-all');
  return data;
}
