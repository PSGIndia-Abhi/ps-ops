const cron = require("node-cron");
const { pool } = require("../../db");
const { notifyVisitMissed } = require("../services/notifications.service");

async function runMissedVisitCheck() {
  console.log("Running missed visit cron...");

  try {
    const [visits] = await pool.query(`
      SELECT id
      FROM job_visits
      WHERE DATE(scheduled_date) < CURDATE()
      AND status = 'SCHEDULED'
    `);

    if (!visits.length) return;

    for (const v of visits) {
      await pool.query(
        `UPDATE job_visits
         SET status = 'MISSED', updated_at = NOW()
         WHERE id = ?`,
        [v.id]
      );

      await notifyVisitMissed({
        visitId: v.id
      });
    }

    console.log(`Marked ${visits.length} visits as MISSED`);

  } catch (err) {
    console.error("Missed cron failed:", err);
  }
}

function startVisitMissedCron() {
  runMissedVisitCheck(); // immediate run
  cron.schedule("*/10 * * * *", runMissedVisitCheck); // scheduled run
}

module.exports = { startVisitMissedCron };