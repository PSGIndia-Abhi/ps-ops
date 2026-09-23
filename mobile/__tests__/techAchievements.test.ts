import { computeTechnicianAchievements } from '../src/screens/technician/achievements';
import type { Job } from '../src/types/job';

const now = new Date('2026-09-21T12:00:00');
const job = (over: Partial<Job>): Job =>
  ({
    id: 'j', code: 'JOB', status: 'ASSIGNED', is_archived: false, dueDate: '2026-09-30T00:00:00',
    team: [{ id: 42, name: 'Ravi' }], ...over,
  }) as unknown as Job;

describe('computeTechnicianAchievements', () => {
  it("counts only this technician's jobs and works out completion, open and overdue", () => {
    const jobs = [
      job({ status: 'COMPLETED' }),
      job({ status: 'COMPLETED' }),
      job({ status: 'COMPLETED' }),
      job({ status: 'IN_PROGRESS' }),
      job({ status: 'NOT_STARTED', dueDate: '2026-09-10T00:00:00' }),
      job({ status: 'CANCELED' }),
      job({ status: 'COMPLETED', team: [{ id: 99, name: 'Someone else' }] }),
      job({ status: 'COMPLETED', is_archived: true }),
    ];
    const a = computeTechnicianAchievements(jobs, '42', now);
    expect(a.completed).toBe(3);
    expect(a.open).toBe(2);
    expect(a.overdue).toBe(1);
    expect(a.counted).toBe(5);
    expect(a.completionPercent).toBe(60);
  });

  it('does not call a finished job overdue, and handles a job with no due date', () => {
    const a = computeTechnicianAchievements(
      [job({ status: 'COMPLETED', dueDate: '2026-01-01T00:00:00' }), job({ status: 'PAUSED', dueDate: null })],
      42,
      now,
    );
    expect(a.overdue).toBe(0);
    expect(a.open).toBe(1);
  });

  it('is all zeros when there are no jobs, without dividing by zero', () => {
    expect(computeTechnicianAchievements([], 42, now)).toEqual({
      completed: 0, counted: 0, open: 0, overdue: 0, completionPercent: 0,
    });
  });
});
