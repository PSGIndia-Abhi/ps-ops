/**
 * Mirrors GET /api/dashboard/summary exactly
 * (backend/src/routes/dashboard.routes.js).
 *
 * This endpoint is already role/branch-scoped server-side: an admin gets an
 * org-wide (or branch-wide, for branch_admin) count, a supervisor gets a
 * count scoped to `j.supervisor_id = me`, and a technician gets a count
 * scoped to jobs whose `team` JSON array contains them. The mobile app does
 * not need to (and must not) re-derive these numbers - it only renders what
 * this one endpoint returns.
 *
 * Note: the backend's SQL compares `j.status` to the literals 'ASSIGNED' and
 * 'CANCELLED' (double-L), but the actual `jobs_status` enum only has
 * CREATED/NOT_STARTED/IN_PROGRESS/PAUSED/COMPLETED/CANCELED (single-L) - so
 * `status.assigned` and `status.cancelled` will always read 0 today. That's
 * a backend data-quality issue, not something this client should paper over
 * by inventing different numbers; it's called out in the Phase 3 report.
 */
export interface DashboardSummary {
  total: number;
  status: {
    created: number;
    assigned: number;
    inProgress: number;
    paused: number;
    completed: number;
    cancelled: number;
  };
  calendar: {
    today: number;
    overdue: number;
    upcoming: number;
  };
  customerType: {
    residential: number;
    corporate: number;
  };
  totalBookings: number;
}
