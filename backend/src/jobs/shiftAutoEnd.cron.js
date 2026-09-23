const cron = require("node-cron");
const { pool } = require("../../db");

/** A shift left running this long was almost certainly forgotten, not worked - nobody does a
 * genuine 12-hour shift without ending it themselves. Matches the mobile app's own "stale shift"
 * warning (ShiftScreen's STALE_SHIFT_MS), just enforced server-side instead of only shown as a
 * banner nobody may see. */
const SHIFT_MAX_HOURS = 12;

async function runShiftAutoEnd() {
  console.log("Running shift auto-end cron...");

  try {
    const [shifts] = await pool.query(
      `
      SELECT id
      FROM technician_shifts
      WHERE status = 'ACTIVE'
        AND started_at < (NOW() - INTERVAL ? HOUR)
      `,
      [SHIFT_MAX_HOURS]
    );

    if (!shifts.length) return;

    for (const s of shifts) {
      // No device is present to give a real end location for an automatic close - end_latitude/
      // end_longitude stay NULL (unlike a normal /api/shifts/end call), which is itself the
      // honest signal on this row that it was closed by the system, not by the technician.
      await pool.query(
        `
        UPDATE technician_shifts
        SET ended_at = NOW(),
            status = 'ENDED'
        WHERE id = ?
        `,
        [s.id]
      );
    }

    console.log(`Auto-ended ${shifts.length} shift(s) running longer than ${SHIFT_MAX_HOURS}h`);
  } catch (err) {
    console.error("Shift auto-end cron failed:", err);
  }
}

function startShiftAutoEndCron() {
  runShiftAutoEnd(); // immediate run
  cron.schedule("*/10 * * * *", runShiftAutoEnd); // scheduled run, same cadence as the missed-visit cron
}

module.exports = { startShiftAutoEndCron };
