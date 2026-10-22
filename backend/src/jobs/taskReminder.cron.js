const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");
const { TASK_REMINDER_MODULE } = require("../utils/taskReminders");

// The notification for a Task Management task's reminder (utils/taskReminders.js), at the date and
// time the reminder was set for - once. Only the task's ASSIGNEE is told - never its creator or a
// manager above. Saved like any other notification (the web's Task Management pops it up and lists
// it in its bell) and pushed to the assignee's phone, which also rings on its own at that time.
//
// Works like jobs/leadReminder.cron.js: once per reminder time (a reminder moved to a new time is
// announced again then), only reminders that came due in the last LOOKBACK minutes (a restart never
// floods anyone), and DELAY_MINUTES after the time so it never silences the phone's own alarm.

const LOOKBACK_MINUTES = 15;
const DELAY_MINUTES = 1;
let running = false;

const clock = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const day = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

async function sendTaskDueAlerts() {
  const remindAt = "TIMESTAMP(r.due_date, r.due_time)";
  const [due] = await pool.query(
    `SELECT r.source_id AS task_id, r.assigned_to, t.title, t.description, t.task_type,
            t.source_module AS task_source, t.source_id AS task_source_id,
            DATE_FORMAT(t.due_date, '%Y-%m-%d') AS task_date, t.due_time AS task_time
       FROM work_tasks r
       JOIN work_tasks t ON t.id = r.source_id
      WHERE r.source_module = ? AND r.status = 'OPEN' AND r.due_time IS NOT NULL
        AND t.status IN ('OPEN', 'IN_PROGRESS', 'PAUSED')
        AND ${remindAt} BETWEEN NOW() - INTERVAL ${LOOKBACK_MINUTES} MINUTE AND NOW() - INTERVAL ${DELAY_MINUTES} MINUTE
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.type = 'TASK_REMINDER_DUE' AND n.user_id = r.assigned_to AND n.created_at >= ${remindAt}
             AND ((n.entity_type = 'work_task' AND n.entity_id = r.source_id)
               OR (n.entity_type = 'lead' AND t.source_module = 'LEAD' AND n.entity_id = t.source_id)))`,
    [TASK_REMINDER_MODULE]
  );

  for (const t of due) {
    const name = String(t.title || "Task").trim();
    const when = `${day(t.task_date)}${t.task_time ? `, ${clock(t.task_time)}` : ""}`;
    // A lead meeting's / follow-up's reminder opens the lead (the web's Lead Management bell, the app).
    const lead = String(t.task_source || "").toUpperCase() === "LEAD" && !!t.task_source_id;
    const what = t.task_type === "LEAD_MEETING" ? "Meeting" : t.task_type === "LEAD_FOLLOW_UP" ? "Follow-up" : "Task";
    await notifyUsers([t.assigned_to], {
      type: "TASK_REMINDER_DUE",
      title: `Reminder: ${name}`.slice(0, 255),
      message: `${what} due ${when}${t.description ? ` · ${t.description}` : ""}`.slice(0, 500),
      entityType: lead ? "lead" : "work_task",
      entityId: lead ? t.task_source_id : t.task_id,
    });
  }
  return due.length;
}

// A run still going when the next one starts is skipped, so an item is never picked up twice.
async function runTaskReminderAlerts() {
  if (running) return;
  running = true;
  try {
    const sent = await sendTaskDueAlerts();
    if (sent) console.log(`Task reminders: ${sent} alert(s) sent`);
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
