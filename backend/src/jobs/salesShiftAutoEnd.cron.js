const cron = require("node-cron");
const { pool } = require("../../db");

/** A sales field day (sales_field_shifts) still open after its own date ended was forgotten - the
 * executive never pressed End Shift. Close it at the last GPS point received for it (the last moment
 * we know they were working), or at its start if no point ever arrived. end_latitude/end_longitude
 * are taken from that last point when there is one. Status AUTO_ENDED (not ENDED) tells the manager
 * the day was closed by the system. Same idea as shiftAutoEnd.cron.js for technicians. */
async function runSalesShiftAutoEnd() {
  try {
    const [result] = await pool.query(
      `UPDATE sales_field_shifts s
          LEFT JOIN (
            SELECT p.shift_id, p.captured_at, p.latitude, p.longitude
              FROM sales_field_points p
              JOIN (SELECT shift_id, MAX(captured_at) AS captured_at FROM sales_field_points GROUP BY shift_id) last
                ON last.shift_id = p.shift_id AND last.captured_at = p.captured_at
          ) lp ON lp.shift_id = s.id
          SET s.ended_at = GREATEST(s.started_at, COALESCE(lp.captured_at, s.started_at)),
              s.end_latitude = lp.latitude,
              s.end_longitude = lp.longitude,
              s.status = 'AUTO_ENDED'
        WHERE s.status = 'ACTIVE'
          AND DATE(s.started_at) < CURDATE()`
    );
    if (result.affectedRows) console.log(`Auto-ended ${result.affectedRows} forgotten sales field shift(s)`);
  } catch (err) {
    console.error("Sales shift auto-end cron failed:", err);
  }
}

function startSalesShiftAutoEndCron() {
  runSalesShiftAutoEnd(); // immediate run
  cron.schedule("*/30 * * * *", runSalesShiftAutoEnd);
}

module.exports = { startSalesShiftAutoEndCron };
