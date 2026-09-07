/**
 * Mirrors GET /api/notifications exactly
 * (backend/src/services/notifications.service.js listNotificationsForUser).
 *
 * `entity_type` is only ever "job" or "branch" in the actual backend code
 * (backend/src/services/notifications.service.js - every call site that
 * builds a notification payload) - "job"-type notifications always carry a
 * job id in `entity_id` (even ones about a visit use `visit.job_id`), so
 * they can all open the existing JobDetail screen. "branch"-type
 * notifications have no corresponding mobile screen and are just marked
 * read.
 */
export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string | null;
  entity_type: 'job' | 'branch' | string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}
