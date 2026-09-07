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

/** PATCH /api/notifications/:id/read - requires UPDATE_JOB. */
export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const { data } = await httpClient.patch(`/api/notifications/${id}/read`);
  return data;
}

/** POST /api/notifications/read-all - requires UPDATE_JOB. */
export async function markAllNotificationsRead(): Promise<{ success: boolean; updated: number }> {
  const { data } = await httpClient.post('/api/notifications/read-all');
  return data;
}
