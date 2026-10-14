import { alarmFor, DEFAULT_SETTINGS, dueAlarmFor, type ReminderItem } from '../src/reminders-engine/engine';
import { taskToReminder } from '../src/reminders-engine/sources';
import type { WorkTask } from '../src/tasks/types';

jest.mock('../src/crm/secureKv', () => ({ kvGet: jest.fn(async () => null), kvSet: jest.fn(async () => {}) }));

const meeting: ReminderItem = {
  key: 'task:1',
  kind: 'meeting',
  title: 'TestToday',
  detail: 'Site visit',
  date: '2030-01-15',
  time: '11:00:00',
  fromSomeoneElse: true,
  route: { app: 'lead', screen: 'LeadDetail', params: { leadId: 'L1' } },
};

describe('dueAlarmFor', () => {
  const payment: ReminderItem = { ...meeting, key: 'task:9', kind: 'payment', title: 'Payment Reminder - Kims', detail: undefined, route: null };
  const now = new Date(2030, 0, 15, 8, 0).getTime();

  it('rings a payment reminder again at its own time', () => {
    const early = alarmFor(payment, DEFAULT_SETTINGS, now)!;
    const due = dueAlarmFor(payment, now)!;
    expect(early.title).toBe('Payment reminder in 30 min');
    expect(due.title).toBe('Payment reminder due');
    expect(due.fireAt).toBe(new Date(2030, 0, 15, 11, 0).getTime());
    expect(due.id).not.toBe(early.id);
  });

  it('still rings at the time when the early alarm has already passed', () => {
    const soon = new Date(2030, 0, 15, 10, 57).getTime();
    expect(alarmFor(payment, DEFAULT_SETTINGS, soon)).toBeNull();
    expect(dueAlarmFor(payment, soon)).not.toBeNull();
  });

  it('rings a personal reminder 30 minutes before and at its time', () => {
    const mine: ReminderItem = { ...meeting, kind: 'personal', title: 'Call Ravi', detail: undefined };
    expect(alarmFor(mine, DEFAULT_SETTINGS, now)!.title).toBe('Reminder in 30 min');
    expect(alarmFor(mine, DEFAULT_SETTINGS, now)!.fireAt).toBe(new Date(2030, 0, 15, 10, 30).getTime());
    expect(dueAlarmFor(mine, now)!.title).toBe('⏰ Call Ravi');
    expect(dueAlarmFor(mine, now)!.fireAt).toBe(new Date(2030, 0, 15, 11, 0).getTime());
  });

  it('rings lead meetings and follow-ups again at their time too', () => {
    expect(dueAlarmFor(meeting, now)!.title).toBe('Meeting now');
    expect(dueAlarmFor(meeting, now)!.fireAt).toBe(new Date(2030, 0, 15, 11, 0).getTime());
    expect(dueAlarmFor({ ...meeting, kind: 'followup' }, now)!.title).toBe('Follow-up due');
  });

  it('is only for timed payment reminders, meetings and follow-ups that are still ahead', () => {
    expect(dueAlarmFor({ ...meeting, kind: 'task' }, now)).toBeNull();
    expect(dueAlarmFor({ ...payment, time: null }, now)).toBeNull();
    expect(dueAlarmFor(payment, new Date(2030, 0, 15, 11, 1).getTime())).toBeNull();
  });
});

describe('alarmFor', () => {
  const now = new Date(2030, 0, 15, 8, 0).getTime();

  it('rings 30 minutes before a timed item', () => {
    const alarm = alarmFor(meeting, DEFAULT_SETTINGS, now)!;
    expect(alarm.fireAt).toBe(new Date(2030, 0, 15, 10, 30).getTime());
    expect(alarm.kind).toBe('alarm');
    expect(alarm.title).toBe('Meeting in 30 min');
    expect(alarm.body).toContain('TestToday');
    expect(JSON.parse(alarm.route)).toEqual(meeting.route);
  });

  it('follows the chosen lead time', () => {
    const alarm = alarmFor(meeting, { enabled: true, leadMinutes: 15 }, now)!;
    expect(alarm.fireAt).toBe(new Date(2030, 0, 15, 10, 45).getTime());
    expect(alarm.title).toBe('Meeting in 15 min');
  });

  it('rings at 9:00 on the day for an item with no time', () => {
    const alarm = alarmFor({ ...meeting, time: null }, DEFAULT_SETTINGS, new Date(2030, 0, 15, 7, 0).getTime())!;
    expect(alarm.fireAt).toBe(new Date(2030, 0, 15, 9, 0).getTime());
    expect(alarm.title).toBe('Meeting today');
  });

  it('skips an alarm whose moment has passed', () => {
    expect(alarmFor(meeting, DEFAULT_SETTINGS, new Date(2030, 0, 15, 10, 45).getTime())).toBeNull();
  });

  it('gives a moved meeting a new alarm id, so the old alarm is dropped', () => {
    const a = alarmFor(meeting, DEFAULT_SETTINGS, now)!;
    const b = alarmFor({ ...meeting, time: '12:00:00' }, DEFAULT_SETTINGS, now)!;
    expect(a.id).not.toBe(b.id);
  });
});

describe('taskToReminder', () => {
  const base = {
    id: 'T1',
    title: 'Site visit - TestToday',
    task_type: 'LEAD_MEETING',
    source_module: 'LEAD',
    source_id: 'L1',
    status: 'OPEN',
    due_date: '2030-01-15',
    due_time: '11:00:00',
    created_by: 5,
    assigned_to: 7,
  } as unknown as WorkTask;

  it('turns a lead meeting task into a meeting that opens its lead', () => {
    const r = taskToReminder(base, '7');
    expect(r.kind).toBe('meeting');
    expect(r.title).toBe('TestToday');
    expect(r.detail).toBe('Site visit');
    expect(r.fromSomeoneElse).toBe(true);
    expect(r.route).toEqual({ app: 'lead', screen: 'LeadDetail', params: { leadId: 'L1' } });
  });

  it('marks your own items so they do not pop up', () => {
    expect(taskToReminder({ ...base, created_by: 7 } as WorkTask, '7').fromSomeoneElse).toBe(false);
  });

  it('sends a Task Management task to its task screen', () => {
    const r = taskToReminder({ ...base, task_type: 'GENERAL', source_module: 'TASK', title: 'Send GST summary' } as unknown as WorkTask, '7');
    expect(r.kind).toBe('task');
    expect(r.route).toEqual({ app: 'task', screen: 'TaskDetail', params: { taskId: 'T1' } });
  });

  it('recognises a payment follow-up', () => {
    expect(taskToReminder({ ...base, task_type: 'PAYMENT_FOLLOW_UP', source_module: 'PAYMENT' } as unknown as WorkTask, '7').kind).toBe('payment');
  });
});
