// Reminders on Task Management tasks.
//
// A task's reminder reuses the reminder module the Lead app uses: it is a work_tasks row of type
// PERSONAL_REMINDER, here pointing at the task (source_module 'WORK_TASK', source_id = the task's
// id) instead of a lead. It has its OWN date and time, chosen when it is set (it does not follow the
// task's due date, and it rings once - on the date chosen - also for a repeating task). It is always
// for the task's ASSIGNEE (whoever sets it): it moves to a new assignee on a reassign, stops while
// the task is finished and comes back if the task is reopened. The phone rings for it at its time
// (mobile/src/reminders-engine) and the backend's job tells the assignee then
// (jobs/taskReminder.cron.js).
//
// These rows never show in Task Management lists: GET /api/work-tasks leaves them out unless
// asked for (include_task_reminders=1, which only the phone's reminder engine sends).
const { v4: uuid } = require("uuid");

const TASK_REMINDER_MODULE = "WORK_TASK";
const REMINDER_TYPE = "PERSONAL_REMINDER";
const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "PAUSED"];

// SQL for "this task's live reminder" (t = the task's alias): its id, and when it rings
// ('YYYY-MM-DD HH:MM:SS').
const REMINDER_ID_SQL = `(SELECT r.id FROM work_tasks r
   WHERE r.source_module = '${TASK_REMINDER_MODULE}' AND r.source_id = t.id AND r.status = 'OPEN' LIMIT 1)`;
const REMINDER_AT_SQL = `(SELECT CONCAT(DATE_FORMAT(r.due_date, '%Y-%m-%d'), ' ', r.due_time) FROM work_tasks r
   WHERE r.source_module = '${TASK_REMINDER_MODULE}' AND r.source_id = t.id AND r.status = 'OPEN' LIMIT 1)`;

/** The reminder row of a task (live or stopped), or undefined. */
async function findReminder(db, taskId) {
  const [[row]] = await db.query(
    "SELECT id, status FROM work_tasks WHERE source_module = ? AND source_id = ? ORDER BY created_at DESC LIMIT 1",
    [TASK_REMINDER_MODULE, String(taskId)]
  );
  return row;
}

/**
 * Sets a task's reminder to ring on `date` ('YYYY-MM-DD') at `time` ('HH:MM:SS') - a new one, or
 * the existing one moved to that moment. `task` is a loaded work task.
 */
async function setReminder(db, task, userId, { date, time }) {
  const existing = await findReminder(db, task.id);
  if (existing) {
    await db.query("UPDATE work_tasks SET status = 'OPEN', due_date = ?, due_time = ?, created_by = ? WHERE id = ?", [
      date, time, userId, existing.id,
    ]);
    await followTask(db, task.id);
    return;
  }
  await db.query(
    `INSERT INTO work_tasks
       (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
     VALUES (?, ?, NULL, ?, 'NORMAL', ?, ?, ?, ?, ?, ?)`,
    [uuid(), String(task.title || "Task").slice(0, 200), REMINDER_TYPE, TASK_REMINDER_MODULE, String(task.id),
     task.assigned_to, userId, date, time]
  );
}

/** Takes a task's reminder off. */
async function removeReminder(db, taskId) {
  await db.query("DELETE FROM work_tasks WHERE source_module = ? AND source_id = ?", [TASK_REMINDER_MODULE, String(taskId)]);
}

/**
 * Keeps a task's reminder in step with the task after any change to it: handed to a new assignee,
 * renamed with the task, stopped while the task is finished, live again when it is reopened, and
 * gone with the task when it is deleted. Its own date and time never change here. Returns the
 * assignee ids whose phones should re-arm (none when the task has no reminder).
 */
async function followTask(db, taskId) {
  const reminder = await findReminder(db, taskId);
  if (!reminder) return [];
  const [[task]] = await db.query("SELECT id, title, status, assigned_to FROM work_tasks WHERE id = ?", [taskId]);
  if (!task) {
    await removeReminder(db, taskId);
    return [];
  }
  const live = OPEN_STATUSES.includes(task.status);
  await db.query("UPDATE work_tasks SET status = ?, title = ?, assigned_to = ? WHERE id = ?", [
    live ? "OPEN" : "CANCELLED", String(task.title || "Task").slice(0, 200), task.assigned_to, reminder.id,
  ]);
  return [task.assigned_to];
}

/**
 * A lead meeting's / follow-up's reminder, as the forms send it: { reminderDate: 'YYYY-MM-DD',
 * reminderTime: 'HH:MM' }. Optional - nothing rings for a meeting or follow-up unless one is set.
 * -> null (none asked for), { date, time } ('HH:MM:SS'), or { error }.
 */
function readLeadReminder(body = {}) {
  const date = body.reminderDate;
  const time = body.reminderTime;
  if (!date && !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { error: "Pick the reminder date" };
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(time || ""))) return { error: "Pick the reminder time" };
  const hms = String(time).length === 5 ? `${time}:00` : String(time);
  const at = new Date(`${date}T${hms}`);
  if (Number.isNaN(at.getTime())) return { error: "Pick a valid reminder date and time" };
  if (at.getTime() <= Date.now()) return { error: "Pick a reminder time in the future" };
  return { date: String(date), time: hms };
}

/**
 * Gives a lead meeting's / follow-up's task the reminder asked for - or none: an earlier one is
 * taken off when no reminder comes with the change (so it never rings for an old time).
 * `task` = { id, title, assigned_to }.
 */
async function applyLeadReminder(db, task, userId, reminder) {
  await removeReminder(db, task.id);
  if (reminder) await setReminder(db, task, userId, reminder);
}

module.exports = {
  TASK_REMINDER_MODULE, REMINDER_ID_SQL, REMINDER_AT_SQL, findReminder, setReminder, removeReminder, followTask,
  readLeadReminder, applyLeadReminder,
};
