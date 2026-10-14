const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");

// "Due now" notifications for lead follow-ups and meetings, at their exact time. Saved like any
// other lead notification (the web bell lists it) and pushed to the person's phone, where Android
// shows it even when the app is asleep or held back by battery saving - so a follow-up still
// announces itself if the phone's own alarm could not be armed in time.
//
// Once per due time: a follow-up moved to a new time is announced again at that time. Only items
// that came due in the last LOOKBACK minutes are picked up, so a restart never floods anyone with
// old ones.
//
// Sent DELAY_MINUTES after the due time, not on it: the phone's own alarm rings at the exact
// minute, and Android's "notification cooldown" quietens an app's second alert that arrives right
// behind its first - a push landing a moment before the alarm would silence the alarm. A minute
// later the push is the backup: it still shows if the alarm could not be armed in time.

const LOOKBACK_MINUTES = 15;
const DELAY_MINUTES = 1;
let running = false;

const clock = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

async function sendLeadDueAlerts() {
  const dueAt = "TIMESTAMP(t.due_date, t.due_time)";
  const [due] = await pool.query(
    `SELECT t.id, t.task_type, t.assigned_to, t.source_id AS lead_id, t.due_time, t.description,
            l.company_name, l.customer_name, l.phone, m.meeting_type, m.meeting_address
       FROM work_tasks t
       JOIN crm_leads l ON l.id = t.source_id
       LEFT JOIN crm_lead_meetings m ON m.task_id = t.id
      WHERE t.source_module = 'LEAD' AND t.task_type IN ('LEAD_FOLLOW_UP', 'LEAD_MEETING')
        AND t.status IN ('OPEN', 'IN_PROGRESS', 'PAUSED') AND t.due_time IS NOT NULL
        AND ${dueAt} BETWEEN NOW() - INTERVAL ${LOOKBACK_MINUTES} MINUTE AND NOW() - INTERVAL ${DELAY_MINUTES} MINUTE
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.type IN ('LEAD_FOLLOW_UP_DUE', 'LEAD_MEETING_DUE') AND n.entity_type = 'lead'
             AND n.entity_id = t.source_id AND n.user_id = t.assigned_to
             AND n.created_at >= ${dueAt})`
  );

  for (const t of due) {
    const name = String(t.company_name || t.customer_name || "Lead").trim();
    const at = clock(t.due_time);
    const meeting = t.task_type === "LEAD_MEETING";
    await notifyUsers([t.assigned_to], {
      type: meeting ? "LEAD_MEETING_DUE" : "LEAD_FOLLOW_UP_DUE",
      title: (meeting ? `Meeting now: ${name}` : `Follow-up due: ${name}`).slice(0, 255),
      message: meeting
        ? `${t.meeting_type === "OFFICE" ? "Office meeting" : "Site visit"} at ${at}${t.meeting_address ? ` · ${t.meeting_address}` : ""}`.slice(0, 500)
        : `Call now (${at})${t.phone ? ` · ${t.phone}` : ""}${t.description ? ` · ${t.description}` : ""}`.slice(0, 500),
      entityType: "lead",
      entityId: t.lead_id,
    });
  }
  return due.length;
}

// A run still going when the next one starts is skipped, so an item is never picked up twice.
async function runLeadReminderAlerts() {
  if (running) return;
  running = true;
  try {
    const sent = await sendLeadDueAlerts();
    if (sent) console.log(`Lead reminders: ${sent} due alert(s) sent`);
  } catch (err) {
    console.error("Lead reminder cron failed:", err);
  } finally {
    running = false;
  }
}

function startLeadReminderCron() {
  runLeadReminderAlerts();
  // Every 30 seconds. A plain timer, not node-cron: its seconds schedule reports "missed execution"
  // and skips runs even on an idle server, which would hold this alert back by minutes.
  setInterval(runLeadReminderAlerts, 30000);
}

module.exports = { startLeadReminderCron, sendLeadDueAlerts };
