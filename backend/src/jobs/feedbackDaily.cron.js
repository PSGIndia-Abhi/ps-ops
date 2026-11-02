const { pool } = require("../../db");

// Customer Feedback (feedback_* tables) - the timed work, every minute: a call waiting for the
// customer's form (FORM_SENT) whose links have all expired unused goes back to NOT_ANSWERED, so it
// shows again in the collector's list. History says why. (No notifications: call-backs that are due
// show as a count on the Feedback Desk sidebar.)

let running = false;

async function expireFormLinks() {
  const [calls] = await pool.query(
    `SELECT r.id FROM feedback_requests r
     WHERE r.status = 'FORM_SENT'
       AND NOT EXISTS (SELECT 1 FROM feedback_form_links l
                       WHERE l.request_id = r.id AND l.submitted_at IS NULL AND l.revoked_at IS NULL AND l.expires_at > NOW())`
  );
  for (const { id } of calls) {
    const [result] = await pool.query(
      "UPDATE feedback_requests SET status = 'NOT_ANSWERED', row_version = row_version + 1 WHERE id = ? AND status = 'FORM_SENT'",
      [id]
    );
    if (result.affectedRows) {
      await pool.query(
        `INSERT INTO feedback_history (request_id, event, from_status, to_status, note)
         VALUES (?, 'FORM_EXPIRED', 'FORM_SENT', 'NOT_ANSWERED', 'The form link expired without an answer')`,
        [id]
      );
    }
  }
  return calls.length;
}

// A run still going when the next one starts is skipped, so nothing is picked up twice.
async function runFeedbackJobs() {
  if (running) return;
  running = true;
  try {
    const expired = await expireFormLinks();
    if (expired) console.log(`Feedback jobs: ${expired} form link call(s) expired`);
  } catch (err) {
    console.error("Feedback cron failed:", err);
  } finally {
    running = false;
  }
}

function startFeedbackCron() {
  runFeedbackJobs();
  setInterval(runFeedbackJobs, 60000);
}

module.exports = { startFeedbackCron, runFeedbackJobs, expireFormLinks };
