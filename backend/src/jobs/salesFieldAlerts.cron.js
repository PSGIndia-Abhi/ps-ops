const cron = require("node-cron");
const { pool } = require("../../db");
const { notifyUsers } = require("../services/notifications.service");
const { distanceMeters } = require("../utils/salesFieldTracking");
const { v4: uuid } = require("uuid");

/**
 * "Stayed in one place" alerts for running sales shifts (table sales_field_alerts). Every 5 minutes:
 * for each open shift, take the GPS points uploaded so far and walk back from the latest one while
 * they stay within STOP_RADIUS_M of it. If that covers LONG_STOP_MINUTES or more, the executive is
 * not punched in at a client (a long client visit is normal work), and the latest point is fresh
 * (the phone is still sending - an old last point is a GPS gap, not a stop), one alert is written
 * and the executive and the sales managers are notified. The same stop (same arrival time) is
 * never notified twice.
 */
const LONG_STOP_MINUTES = 30;
const STOP_RADIUS_M = 150;
const MAX_ACCURACY_M = 100;
// The latest point must be this recent for the stop to count as "now".
const FRESH_MINUTES = 15;

/** Everyone who manages leads (MANAGE_LEADS): the sales manager, the Managing Director, the Personal Assistant. */
async function leadManagers() {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.name = 'MANAGE_LEADS' AND u.is_active = 1`
  );
  return rows.map((r) => Number(r.id));
}

/** "2026-11-06 16:10:00" -> "4:10 PM" */
function clock(value) {
  const m = String(value || "").match(/(\d{2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

async function checkShift(shift, nowTs) {
  const [points] = await pool.query(
    `SELECT UNIX_TIMESTAMP(captured_at) AS ts, DATE_FORMAT(captured_at, '%Y-%m-%d %H:%i:%s') AS at, latitude, longitude
       FROM sales_field_points
      WHERE shift_id = ? AND (accuracy_m IS NULL OR accuracy_m <= ?)
      ORDER BY captured_at DESC, id DESC
      LIMIT 200`,
    [shift.id, MAX_ACCURACY_M]
  );
  if (points.length < 2) return;
  const last = points[0];
  if (nowTs - Number(last.ts) > FRESH_MINUTES * 60) return; // no fresh point: a gap, not a stop

  // Walk back while still at the same spot.
  let first = last;
  for (const p of points.slice(1)) {
    const d = distanceMeters(Number(last.latitude), Number(last.longitude), Number(p.latitude), Number(p.longitude));
    if (d > STOP_RADIUS_M) break;
    first = p;
  }
  const minutes = Math.round((Number(last.ts) - Number(first.ts)) / 60);
  if (minutes < LONG_STOP_MINUTES) return;

  // Punched in at a client right now: a long visit is normal work.
  const [[visit]] = await pool.query(
    `SELECT id FROM crm_lead_meetings
      WHERE sales_employee_id = ? AND check_in_at IS NOT NULL AND check_out_at IS NULL AND check_in_at >= ?
      LIMIT 1`,
    [shift.user_id, shift.started_at]
  );
  if (visit) return;

  const [result] = await pool.query(
    `INSERT IGNORE INTO sales_field_alerts (id, shift_id, user_id, kind, started_at, minutes, latitude, longitude)
     VALUES (?, ?, ?, 'LONG_STOP', ?, ?, ?, ?)`,
    [uuid(), shift.id, shift.user_id, first.at, minutes, first.latitude, first.longitude]
  );
  if (!result.affectedRows) {
    // Already notified for this stop: only keep its length up to date for the web, no new notification.
    await pool.query(
      "UPDATE sales_field_alerts SET minutes = GREATEST(minutes, ?) WHERE shift_id = ? AND kind = 'LONG_STOP' AND started_at = ?",
      [minutes, shift.id, first.at]
    );
    return;
  }

  const since = clock(first.at);
  const base = { type: "FIELD_LONG_STOP", entityType: "field_shift", entityId: shift.id };
  await notifyUsers([shift.user_id], {
    ...base,
    title: "Still on shift?",
    message: `You have been at the same place for ${minutes} minutes (since ${since}). If you are on a break or personal work, please end your shift.`,
  });
  const managers = (await leadManagers()).filter((id) => id !== Number(shift.user_id));
  await notifyUsers(managers, {
    ...base,
    title: `${shift.name} stopped for ${minutes} min`,
    message: `${shift.name} has been at one place since ${since} with the shift running and no client punch-in. See Field Tracking.`,
  });
}

async function runSalesFieldAlerts() {
  try {
    const [shifts] = await pool.query(
      `SELECT s.id, s.user_id, DATE_FORMAT(s.started_at, '%Y-%m-%d %H:%i:%s') AS started_at, u.name
         FROM sales_field_shifts s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'ACTIVE'`
    );
    if (!shifts.length) return;
    const [[nowRow]] = await pool.query("SELECT UNIX_TIMESTAMP(NOW()) AS now_ts");
    for (const shift of shifts) {
      try {
        await checkShift(shift, Number(nowRow.now_ts));
      } catch (err) {
        console.error("Sales field alert check failed for shift", shift.id, err.message);
      }
    }
  } catch (err) {
    console.error("Sales field alerts cron failed:", err);
  }
}

function startSalesFieldAlertsCron() {
  cron.schedule("*/5 * * * *", runSalesFieldAlerts);
}

module.exports = { startSalesFieldAlertsCron, runSalesFieldAlerts, LONG_STOP_MINUTES };
