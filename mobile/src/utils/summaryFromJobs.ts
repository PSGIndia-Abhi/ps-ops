import { isBeforeToday, isToday } from './date';
import type { Job } from '../types/job';
import type { DashboardSummary } from '../types/dashboard';

/**
 * Fallback for the supervisor Home stat cards when GET /api/dashboard/summary
 * is refused (it needs VIEW_ANALYTICS, which the supervisor role does not have).
 *
 * Built from the same GET /api/jobs list the Jobs tab shows, using exactly the
 * Jobs list's own filter rules (screens/jobs/JobsListScreen.tsx), so each
 * card's count matches the list it opens. Fields the cards do not show are 0.
 */
export function summaryFromJobs(jobs: Job[]): DashboardSummary {
  const count = (pred: (j: Job) => boolean) => jobs.filter(pred).length;
  return {
    total: jobs.length,
    status: {
      created: count(j => j.status === 'CREATED'),
      assigned: 0,
      inProgress: count(j => j.status === 'IN_PROGRESS'),
      paused: count(j => j.status === 'PAUSED'),
      completed: count(j => j.status === 'COMPLETED'),
      cancelled: 0,
    },
    calendar: {
      today: count(j => isToday(j.dueDate)),
      overdue: count(j => isBeforeToday(j.dueDate) && j.status !== 'COMPLETED'),
      upcoming: 0,
    },
    customerType: { residential: 0, corporate: 0 },
    totalBookings: 0,
  };
}
