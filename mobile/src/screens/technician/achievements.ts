import type { Job } from '../../types/job';

export interface TechnicianAchievements {
  /** Jobs finished, and every job that still counts (cancelled ones are left out - they are not the technician's doing). */
  completed: number;
  counted: number;
  /** Not finished yet: created, not started, in progress or paused. */
  open: number;
  /** Open jobs whose due date has passed. */
  overdue: number;
  /** completed / counted as a whole percent (0 when there is nothing yet). */
  completionPercent: number;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * All-time numbers for the technician Home card, worked out from GET /api/jobs - the same call (and the
 * same "jobs this technician is on the team of" filter) as the Completed list, so it needs no extra
 * permission (GET /api/dashboard/summary would, and technicians do not have it).
 */
export function computeTechnicianAchievements(
  jobs: Job[],
  userId: string | number,
  now: Date = new Date(),
): TechnicianAchievements {
  const today = startOfDay(now);
  let completed = 0;
  let open = 0;
  let overdue = 0;

  for (const job of jobs) {
    if (job.is_archived || !job.team.some(member => String(member.id) === String(userId))) continue;
    if (job.status === 'CANCELED') continue;
    if (job.status === 'COMPLETED') {
      completed += 1;
      continue;
    }
    open += 1;
    if (job.dueDate && startOfDay(new Date(job.dueDate)) < today) overdue += 1;
  }

  const counted = completed + open;
  return {
    completed,
    counted,
    open,
    overdue,
    completionPercent: counted > 0 ? Math.round((completed / counted) * 100) : 0,
  };
}
