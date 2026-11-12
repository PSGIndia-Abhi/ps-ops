const { pool } = require("../../db");

// Customer Feedback (feedback_* tables) - the timed work, every minute: a call waiting for the
// customer's form (FORM_SENT) whose links have all expired unused:
//  - the customer had not answered at least one call: the call is finished without feedback by
//    itself - DONE, result NO_RESPONSE ("Not responded"), note "Customer not answered";
//  - otherwise (no missed call) it goes back to NOT_ANSWERED, so it shows again in the list.
// History says why. (No notifications: call-backs that are due show as a count on the sidebar.)

let running = false;
let lastSchedule = 0;

async function expireFormLinks() {
  const [calls] = await pool.query(
    `SELECT r.id,
            (SELECT COUNT(*) FROM feedback_call_attempts a WHERE a.request_id = r.id AND a.outcome <> 'ANSWERED') AS missed
     FROM feedback_requests r
     WHERE r.status = 'FORM_SENT'
       AND NOT EXISTS (SELECT 1 FROM feedback_form_links l
                       WHERE l.request_id = r.id AND l.submitted_at IS NULL AND l.revoked_at IS NULL AND l.expires_at > NOW())`
  );
  let closed = 0;
  for (const { id, missed } of calls) {
    const noResponse = Number(missed) >= 1;
    const [result] = await pool.query(
      noResponse
        ? "UPDATE feedback_requests SET status = 'DONE', result = 'NO_RESPONSE', done_at = NOW(), next_call_at = NULL, row_version = row_version + 1 WHERE id = ? AND status = 'FORM_SENT'"
        : "UPDATE feedback_requests SET status = 'NOT_ANSWERED', row_version = row_version + 1 WHERE id = ? AND status = 'FORM_SENT'",
      [id]
    );
    if (result.affectedRows) {
      if (noResponse) closed += 1;
      await pool.query(
        `INSERT INTO feedback_history (request_id, event, from_status, to_status, note) VALUES (?, 'FORM_EXPIRED', 'FORM_SENT', ?, ?)`,
        noResponse
          ? [id, "DONE", "Customer not answered"]
          : [id, "NOT_ANSWERED", "The form link expired without an answer"]
      );
    }
  }
  return { expired: calls.length, closed };
}

// A run still going when the next one starts is skipped, so nothing is picked up twice.
async function runFeedbackJobs() {
  if (running) return;
  running = true;
  try {
    const { expired, closed } = await expireFormLinks();
    if (expired) console.log(`Feedback jobs: ${expired} form link call(s) expired, ${closed} closed as not responded`);
    // The calls the schedules make (Masters > Call schedule), every 15 minutes.
    if (Date.now() - lastSchedule > 15 * 60000) {
      lastSchedule = Date.now();
      // Required here, not at the top: the schedule service needs the feedback service loaded first.
      const added = await require("../services/feedbackSchedule.service").generateDueCalls();
      if (added) console.log(`Feedback jobs: ${added} scheduled call(s) added`);
    }
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
