import type { Job } from '../types/job';
import { isToday } from './date';

export interface TodaysOperationsSummary {
  jobs: Job[];
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  /** Genuinely computed from real counts - never a guessed number. */
  percentComplete: number;
}

/**
 * Derives "today's operations" purely from the same GET /api/jobs list the
 * Jobs tab already uses (already scoped server-side per role) - no new
 * endpoint, no invented numbers. A job counts as "today" if it's due today
 * or has a visit scheduled today.
 */
export function summarizeTodaysOperations(jobs: Job[]): TodaysOperationsSummary {
  const todays = jobs.filter((job) => isToday(job.dueDate) || isToday(job.next_visit_date));

  const completed = todays.filter((j) => j.status === 'COMPLETED').length;
  const inProgress = todays.filter((j) => j.status === 'IN_PROGRESS' || j.status === 'PAUSED').length;
  const pending = todays.length - completed - inProgress;

  return {
    jobs: todays,
    total: todays.length,
    completed,
    inProgress,
    pending,
    percentComplete: todays.length ? Math.round((completed / todays.length) * 100) : 0,
  };
}
