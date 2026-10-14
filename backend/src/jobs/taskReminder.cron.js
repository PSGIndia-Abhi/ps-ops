const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");
const { TASK_REMINDER_MODULE } = require("../utils/taskReminders");

// Notifications for Task Management tasks that have a reminder set (utils/taskReminders.js): one
// 30 minutes before (TASK_REMINDER_SOON) and one at the due time (TASK_REMINDER_DUE), the same two
// moments the phone rings on its own. Only the task's ASSIGNEE is told - never its creator or a
// manager above. Saved like any other notification (the web's Task Management pops it up and lists
// it in its bell) and pushed to the assignee's phone.
//
// Works like jobs/leadReminder.cron.js: once per due time (a task moved to a new time is announced
// again then), only items that came due in the last LOOKBACK minutes (a restart never floods anyone),
// and DELAY_MINUTES after the time so it never silences the phone's own alarm ringing on the minute.

const LOOKBACK_MINUTES = 15;
const DELAY_MINUTES = 1;
const SOON_MINUTES = 30;
const SOON_LOOKBACK_MINUTES = 5;
let running = false;

const clock = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// `before`: minutes ahead of the due time this alert is for (0 = at the time).
async function sendTaskAlerts(before) {
  const type = before ? "TASK_REMINDER_SOON" : "TASK_REMINDER_DUE";
  const dueAt = `TIMESTAMP(r.due_date, r.due_time) - INTERVAL ${before} MINUTE`;
  // "Due in 30 minutes" is only worth saying close to that moment; the at-the-time one may be later.
  const lookback = before ? SOON_LOOKBACK_MINUTES : LOOKBACK_MINUTES;
  const [due] = await pool.query(
    `SELECT r.source_id AS task_id, r.assigned_to, r.due_time, t.title, t.description
       FROM work_tasks r
       JOIN work_tasks t ON t.id = r.source_id
      WHERE r.source_module = ? AND r.status = 'OPEN' AND r.due_time IS NOT NULL
        AND t.status IN ('OPEN', 'IN_PROGRESS', 'PAUSED')
        AND ${dueAt} BETWEEN NOW() - INTERVAL ${lookback} MINUTE AND NOW() - INTERVAL ${DELAY_MINUTES} MINUTE
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.type = ? AND n.entity_type = 'work_task'
             AND n.entity_id = r.source_id AND n.user_id = r.assigned_to
             AND n.created_at >= ${dueAt})`,
    [TASK_REMINDER_MODULE, type]
  );

  for (const t of due) {
    const name = String(t.title || "Task").trim();
    await notifyUsers([t.assigned_to], {
      type,
      title: (before ? `Task due in ${before} min: ${name}` : `Task due: ${name}`).slice(0, 255),
      message: `Due at ${clock(t.due_time)}${t.description ? ` · ${t.description}` : ""}`.slice(0, 500),
      entityType: "work_task",
      entityId: t.task_id,
    });
  }
  return due.length;
}

async function sendTaskDueAlerts() {
  return (await sendTaskAlerts(SOON_MINUTES)) + (await sendTaskAlerts(0));
}

// A run still going when the next one starts is skipped, so an item is never picked up twice.
async function runTaskReminderAlerts() {
  if (running) return;
  running = true;
  try {
    const sent = await sendTaskDueAlerts();
    if (sent) console.log(`Task reminders: ${sent} due alert(s) sent`);
  } catch (err) {
    console.error("Task reminder cron failed:", err);
  } finally {
    running = false;
  }
}

function startTaskReminderCron() {
  runTaskReminderAlerts();
  setInterval(runTaskReminderAlerts, 30000); // a plain timer, as in leadReminder.cron.js
}

module.exports = { startTaskReminderCron, sendTaskDueAlerts };
