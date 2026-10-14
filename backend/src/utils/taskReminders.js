// Reminders on Task Management tasks.
//
// A task's reminder reuses the reminder module the Lead app uses: it is a work_tasks row of type
// PERSONAL_REMINDER, here pointing at the task (source_module 'WORK_TASK', source_id = the task's
// id) instead of a lead. It is always for the task's ASSIGNEE (whoever sets it), and it follows
// the task: same due date and time, same assignee; it stops when the task is finished and comes
// back if the task is reopened. The phone rings for it 30 minutes before and at the time, like
// every lead reminder (mobile/src/reminders-engine), and the backend's due-now job tells the
// assignee (jobs/leadReminder.cron.js).
//
// These rows never show in Task Management lists: GET /api/work-tasks leaves them out unless
// asked for (include_task_reminders=1, which only the phone's reminder engine sends).
const { v4: uuid } = require("uuid");

const TASK_REMINDER_MODULE = "WORK_TASK";
const REMINDER_TYPE = "PERSONAL_REMINDER";
const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "PAUSED"];

// SQL for "this task's reminder id, if it has a live one" (t = the task's alias).
const REMINDER_ID_SQL = `(SELECT r.id FROM work_tasks r
   WHERE r.source_module = '${TASK_REMINDER_MODULE}' AND r.source_id = t.id AND r.status = 'OPEN' LIMIT 1)`;

/** The reminder row of a task (live or stopped), or undefined. */
async function findReminder(db, taskId) {
  const [[row]] = await db.query(
    "SELECT id, status FROM work_tasks WHERE source_module = ? AND source_id = ? ORDER BY created_at DESC LIMIT 1",
    [TASK_REMINDER_MODULE, String(taskId)]
  );
  return row;
}

/** Adds a reminder to a task (a no-op when it already has one). `task` is a loaded work task. */
async function addReminder(db, task, userId) {
  const existing = await findReminder(db, task.id);
  if (existing) {
    await db.query("UPDATE work_tasks SET status = 'OPEN' WHERE id = ?", [existing.id]);
    return followTask(db, task.id);
  }
  await db.query(
    `INSERT INTO work_tasks
       (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
     VALUES (?, ?, NULL, ?, 'NORMAL', ?, ?, ?, ?, ?, ?)`,
    [uuid(), String(task.title || "Task").slice(0, 200), REMINDER_TYPE, TASK_REMINDER_MODULE, String(task.id),
     task.assigned_to, userId, task.due_date, task.due_time]
  );
}

/** Takes a task's reminder off. */
async function removeReminder(db, taskId) {
  await db.query("DELETE FROM work_tasks WHERE source_module = ? AND source_id = ?", [TASK_REMINDER_MODULE, String(taskId)]);
}

/**
 * Keeps a task's reminder in step with the task after any change to it: moved with its date and
 * time, handed to a new assignee, stopped while the task is finished (or has no time to ring at),
 * live again when it is reopened, and gone with the task when it is deleted. Returns the assignee
 * ids whose phones should re-arm (none when the task has no reminder).
 */
async function followTask(db, taskId) {
  const reminder = await findReminder(db, taskId);
  if (!reminder) return [];
  const [[task]] = await db.query(
    "SELECT id, title, status, assigned_to, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time FROM work_tasks WHERE id = ?",
    [taskId]
  );
  if (!task) {
    await removeReminder(db, taskId);
    return [];
  }
  const live = OPEN_STATUSES.includes(task.status) && !!task.due_time;
  await db.query(
    "UPDATE work_tasks SET status = ?, title = ?, assigned_to = ?, due_date = ?, due_time = ? WHERE id = ?",
    [live ? "OPEN" : "CANCELLED", String(task.title || "Task").slice(0, 200), task.assigned_to, task.due_date, task.due_time, reminder.id]
  );
  return [task.assigned_to];
}

module.exports = { TASK_REMINDER_MODULE, REMINDER_ID_SQL, findReminder, addReminder, removeReminder, followTask };
