const cron = require("node-cron");
const { pool } = require("../../db");
const { localDate } = require("../utils/userActivity");

// The admin User Activity report shows only today and yesterday, so older days are not kept:
// anything before yesterday is deleted. Dates are the server's own (the container runs in IST),
// the same days the report and the recording use.
async function runUserActivityCleanup() {
  try {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const [result] = await pool.query("DELETE FROM user_daily_activity WHERE activity_date < ?", [localDate(d)]);
    if (result.affectedRows) console.log(`User activity cleanup: ${result.affectedRows} old rows deleted`);
  } catch (err) {
    // No table yet (migration not run) or a passing DB error: the next run tries again.
    console.error("User activity cleanup failed:", err.message);
  }
}

function startUserActivityCleanupCron() {
  runUserActivityCleanup(); // also on start, so a server that was down at midnight still cleans up
  cron.schedule("10 0 * * *", runUserActivityCleanup); // every day just after midnight, when yesterday rolls over
}

module.exports = { startUserActivityCleanupCron };
