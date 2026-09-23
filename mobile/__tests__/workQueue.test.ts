import { buildQueueItems, dayLabel, mostRecentCompleted, type JobQueueRow } from '../src/screens/technician/workQueue';

const now = new Date('2026-09-21T12:00:00');
const row = (key: string, sortDate: string | null): JobQueueRow => ({
  rowKey: key, jobId: key, code: key, title: key, company: undefined, siteArea: undefined, address: null,
  sortDate, status: 'SCHEDULED', timeMain: '', timeSub: '',
});

describe('dayLabel', () => {
  it('uses plain words for today, tomorrow and yesterday', () => {
    expect(dayLabel('2026-09-21T09:00:00', now)).toBe('Today');
    expect(dayLabel('2026-09-22T23:30:00', now)).toBe('Tomorrow');
    expect(dayLabel('2026-09-20T00:10:00', now)).toBe('Yesterday');
  });

  it('shows the weekday and date for other days, and copes with a missing date', () => {
    expect(dayLabel('2026-09-07T02:07:00', now)).toMatch(/Mon.*7|7.*Mon/);
    expect(dayLabel(null, now)).toBe('No date');
    expect(dayLabel('not a date', now)).toBe('No date');
  });
});

describe('buildQueueItems', () => {
  it('puts a heading, with its job count, before each day', () => {
    const items = buildQueueItems(
      [row('a', '2026-09-20T10:00:00'), row('b', '2026-09-20T15:00:00'), row('c', '2026-09-07T02:00:00')],
      true,
      now,
    );
    expect(items.map(i => (i.kind === 'header' ? `H:${i.label}:${i.count}` : `R:${i.key}`))).toEqual([
      'H:Yesterday:2', 'R:a', 'R:b', expect.stringMatching(/^H:Mon.*:1$/), 'R:c',
    ]);
  });

  it('returns plain rows when grouping is off (sorted by status)', () => {
    const items = buildQueueItems([row('a', '2026-09-20T10:00:00'), row('b', null)], false, now);
    expect(items.every(i => i.kind === 'row')).toBe(true);
    expect(items).toHaveLength(2);
  });
});

describe('mostRecentCompleted', () => {
  const job = (id: string, over: Record<string, unknown> = {}) =>
    ({ id, status: 'COMPLETED', dueDate: '2026-09-01T00:00:00', start_date: null, team: [{ id: 42 }], ...over }) as never;

  it('keeps only this technician\'s completed jobs, newest first, capped at the limit', () => {
    const jobs: ReturnType<typeof job>[] = [];
    for (let day = 1; day <= 15; day += 1) jobs.push(job(`d${day}`, { dueDate: `2026-09-${String(day).padStart(2, '0')}T00:00:00` }));
    jobs.push(job('other', { team: [{ id: 7 }], dueDate: '2026-09-30T00:00:00' }));
    jobs.push(job('open', { status: 'IN_PROGRESS', dueDate: '2026-09-29T00:00:00' }));
    const result = mostRecentCompleted(jobs, '42');
    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({ id: 'd15' });
    expect(result[9]).toMatchObject({ id: 'd6' });
    expect(result.some(j => j.id === 'other' || j.id === 'open')).toBe(false);
  });

  it('returns them all when there are fewer than the limit, and puts undated jobs last', () => {
    const result = mostRecentCompleted([job('undated', { dueDate: null }), job('dated', { dueDate: '2026-09-02T00:00:00' })], 42);
    expect(result.map(j => j.id)).toEqual(['dated', 'undated']);
  });
});
