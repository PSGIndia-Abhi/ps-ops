import { buildNotification, detectEvents, dueLabel, emptyState, eventKey } from '../src/tasks/notifications';
import { isActive, isOverdue, todayStr } from '../src/tasks/format';
import { taskState } from '../src/tasks/theme';
import type { TeamMember, WorkTask } from '../src/tasks/types';

const ME = 10;
const BOSS = 20;
const REPORT = 30;
const team: TeamMember[] = [{ id: REPORT, name: 'Report', is_direct: true }];

function task(over: Partial<WorkTask>): WorkTask {
  return {
    id: 't1',
    series_id: null,
    title: 'Payment Follow-up – ABC Hotels',
    description: null,
    task_type: null,
    priority: 'NORMAL',
    status: 'OPEN',
    source_module: null,
    source_id: null,
    assigned_to: ME,
    assigned_to_name: 'Me',
    created_by: BOSS,
    created_by_name: 'Boss',
    due_date: todayStr(),
    due_time: '10:00:00',
    next_action: null,
    next_action_date: null,
    started_at: null,
    started_by: null,
    completed_at: null,
    completed_by: null,
    completion_note: null,
    created_at: '2026-09-28T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
    ...over,
  };
}

describe('task notifications', () => {
  it('announces nothing on the first (baseline) run', () => {
    const { events, known } = detectEvents([task({})], emptyState(), ME, team, true);
    expect(events).toHaveLength(0);
    expect(known.t1).toBe('OPEN');
  });

  it('A. a task someone else assigned to me -> "New Task Created" with due date/time', () => {
    const { events } = detectEvents([task({})], emptyState(), ME, team, false);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('New Task Created');
    expect(events[0].taskTitle).toBe('Payment Follow-up – ABC Hotels');
    expect(events[0].detail).toBe('Due: Today, 10:00 AM');
    expect(events[0].key).toBe(eventKey('t1', 'created'));
  });

  it('does not re-announce a task it already knows about', () => {
    const state = { ...emptyState(), known: { t1: 'OPEN' } };
    expect(detectEvents([task({})], state, ME, team, false).events).toHaveLength(0);
  });

  it('B. my direct report completes a task -> "Task Completed" naming them', () => {
    const state = { ...emptyState(), known: { t2: 'IN_PROGRESS' } };
    const done = task({ id: 't2', assigned_to: REPORT, assigned_to_name: 'Report', created_by: BOSS, status: 'COMPLETED', completed_by: REPORT });
    const { events } = detectEvents([done], state, ME, team, false);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Task Completed');
    expect(events[0].detail).toBe('Completed by Report.');
  });

  it('my direct report starts a task -> "Task Started" naming them', () => {
    const state = { ...emptyState(), known: { t3: 'OPEN' } };
    const started = task({ id: 't3', assigned_to: REPORT, assigned_to_name: 'Report', status: 'IN_PROGRESS', started_by: REPORT });
    const { events } = detectEvents([started], state, ME, team, false);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Task Started');
    expect(events[0].by).toBe('Report');
  });

  it('my direct report pauses, then resumes -> "Task Paused" then "Task Resumed"', () => {
    const inProgress = { ...emptyState(), known: { t4: 'IN_PROGRESS' } };
    const paused = task({ id: 't4', assigned_to: REPORT, assigned_to_name: 'Report', status: 'PAUSED', updated_at: '2026-09-30T10:00:00Z' });
    const p = detectEvents([paused], inProgress, ME, team, false).events;
    expect(p).toHaveLength(1);
    expect(p[0].title).toBe('Task Paused');

    const resumed = { ...paused, status: 'IN_PROGRESS' as const, updated_at: '2026-09-30T11:00:00Z' };
    const r = detectEvents([resumed], { ...emptyState(), known: { t4: 'PAUSED' } }, ME, team, false).events;
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Task Resumed');
    // A second pause later is a separate event, not swallowed by the first one's key.
    const again = buildNotification({ ...paused, updated_at: '2026-09-30T12:00:00Z' }, 'paused');
    expect(again.key).not.toBe(p[0].key);
  });

  it('a paused task is still active, and overdue once its date passes', () => {
    expect(isActive(task({ status: 'PAUSED' }))).toBe(true);
    expect(isOverdue(task({ status: 'PAUSED', due_date: '2020-01-01' }))).toBe(true);
    expect(taskState(task({ status: 'PAUSED' }))).toBe('paused');
  });

  it('does not announce my own start', () => {
    const state = { ...emptyState(), known: { t1: 'OPEN' } };
    expect(detectEvents([task({ status: 'IN_PROGRESS', started_by: ME })], state, ME, team, false).events).toHaveLength(0);
  });

  it('does not announce my own completion from the list diff (the local path does)', () => {
    const state = { ...emptyState(), known: { t1: 'IN_PROGRESS' } };
    const done = task({ status: 'COMPLETED', completed_by: ME });
    expect(detectEvents([done], state, ME, team, false).events).toHaveLength(0);
  });

  it('local completion uses the success wording and the shared de-dup key', () => {
    const n = buildNotification(task({ status: 'COMPLETED' }), 'completed');
    expect(n.title).toBe('Task Completed');
    expect(n.detail).toBe('has been completed successfully.');
    expect(n.key).toBe('t1:completed');
  });

  it('formats due labels', () => {
    expect(dueLabel(null, null)).toBe('No due date');
    expect(dueLabel(todayStr(), null)).toBe('Today');
  });
});
