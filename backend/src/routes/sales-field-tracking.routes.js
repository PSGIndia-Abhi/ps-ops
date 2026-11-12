const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { uuid, hasPerm, resolveVisibleUserIds, SALES_EXECUTIVE_ROLES } = require("../utils/crmLeadManagement");
const { computeDay } = require("../utils/salesFieldTracking");
const { buildFieldReport, fieldReportWorkbook, MAX_DAYS } = require("../services/salesFieldReport.service");

// Sales Executive Field Tracking. The executive's own day (shift start/end, GPS batches) and the
// sales manager's after-the-day review (team list, one executive's route). Mounted at
// /api/field-tracking. Punches at clients are the existing crm_lead_meetings check-in/out.
//
// Access: the executive works on their own data with CRM_VIEW_LEAD (every lead-working role has
// it). Reading someone else's day needs MANAGE_LEADS and is limited to the people the manager may
// see (resolveVisibleUserIds - the same rule as Team Visits). Petrol km is counted from where the
// shift was started - there is no home location (see utils/salesFieldTracking.js).

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function readDate(value) {
  const date = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
// lat/lng from a request body: both or neither. Returns null for "not given", throws when invalid.
function readPoint(lat, lng, required, label) {
  if ((lat === undefined || lat === null || lat === "") && (lng === undefined || lng === null || lng === "")) {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new HttpError(400, `${label} must be valid coordinates`);
  }
  return { latitude, longitude };
}
function optionalNumber(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function isManager(req) {
  return req.user.role === "admin" || hasPerm(req, "MANAGE_LEADS");
}
// Throws unless the requester may see this user's field data: themselves, or a manager whose
// visible people include them.
async function assertCanSeeUser(req, userId) {
  if (Number(userId) === Number(req.user.id)) return;
  if (!isManager(req)) throw new HttpError(403, "You can only see your own field tracking");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && !visibleIds.includes(Number(userId))) throw new HttpError(404, "User not found");
}

// mysql2 returns DATETIME as JS Dates that shift with the server timezone - read them as strings.
const SHIFT_COLUMNS = `
  id, user_id,
  DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at, start_latitude, start_longitude,
  DATE_FORMAT(ended_at, '%Y-%m-%d %H:%i:%s') AS ended_at, end_latitude, end_longitude,
  status
`;
async function loadActiveShift(userId) {
  const [[shift]] = await pool.query(
    `SELECT ${SHIFT_COLUMNS} FROM sales_field_shifts WHERE user_id = ? AND status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );
  return shift || null;
}
async function loadShift(id) {
  const [[shift]] = await pool.query(`SELECT ${SHIFT_COLUMNS} FROM sales_field_shifts WHERE id = ?`, [id]);
  return shift || null;
}

// Active sales executives the requester may see.
async function listExecutives(req) {
  const visibleIds = await resolveVisibleUserIds(pool, req);
  const where = ["u.is_active = 1", "r.name IN (?)"];
  const params = [SALES_EXECUTIVE_ROLES];
  if (visibleIds !== null) {
    where.push("u.id IN (?)");
    params.push(visibleIds);
  }
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.phone
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE ${where.join(" AND ")}
      ORDER BY u.name ASC`,
    params
  );
  return rows.map((row) => ({ id: Number(row.id), name: row.name, phone: row.phone }));
}

// ---------------------------------------------------------------------------
// GET /api/field-tracking/executives -- sales executives the manager/admin may see (the Field
// Tracking employee picker).
// ---------------------------------------------------------------------------
router.get("/executives", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!isManager(req)) throw new HttpError(403, "Only sales managers can see the team");
    res.json({ executives: await listExecutives(req) });
  } catch (err) {
    sendError(res, err, "Failed to load sales executives");
  }
});

// ---------------------------------------------------------------------------
// GET /api/field-tracking/shift/current -- the executive's open shift, or null.
// ---------------------------------------------------------------------------
router.get("/shift/current", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    res.json({ shift: await loadActiveShift(req.user.id) });
  } catch (err) {
    sendError(res, err, "Failed to load current shift");
  }
});

// ---------------------------------------------------------------------------
// POST /api/field-tracking/shift/start -- body: { latitude, longitude }.
// Returns the already-open shift instead of opening a second one.
// ---------------------------------------------------------------------------
router.post("/shift/start", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const point = readPoint(req.body?.latitude, req.body?.longitude, true, "Current location");
    const existing = await loadActiveShift(req.user.id);
    if (existing) return res.json({ shift: existing });

    const id = uuid();
    await pool.query(
      `INSERT INTO sales_field_shifts (id, user_id, started_at, start_latitude, start_longitude, status)
       VALUES (?, ?, NOW(), ?, ?, 'ACTIVE')`,
      [id, req.user.id, point.latitude, point.longitude]
    );
    res.status(201).json({ shift: await loadShift(id) });
  } catch (err) {
    sendError(res, err, "Failed to start shift");
  }
});

// ---------------------------------------------------------------------------
// POST /api/field-tracking/shift/end -- body: { latitude, longitude }. Location is optional so a
// day can still be closed when GPS is unavailable; the end point is then left empty.
// ---------------------------------------------------------------------------
router.post("/shift/end", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const point = readPoint(req.body?.latitude, req.body?.longitude, false, "Current location");
    const shift = await loadActiveShift(req.user.id);
    if (!shift) throw new HttpError(404, "No active shift");

    await pool.query(
      `UPDATE sales_field_shifts
          SET ended_at = NOW(), end_latitude = ?, end_longitude = ?, status = 'ENDED'
        WHERE id = ? AND status = 'ACTIVE'`,
      [point?.latitude ?? null, point?.longitude ?? null, shift.id]
    );
    res.json({ shift: await loadShift(shift.id) });
  } catch (err) {
    sendError(res, err, "Failed to end shift");
  }
});

// ---------------------------------------------------------------------------
// POST /api/field-tracking/points -- batch upload of background GPS points for one of the
// executive's own shifts (may arrive after the shift ended - the phone queues offline).
// Body: { shiftId, points: [{ clientPointId, capturedAtMs, latitude, longitude,
//                             accuracy?, speedKmph?, bearing?, batteryPercent? }] }
// capturedAtMs is epoch milliseconds; FROM_UNIXTIME stores it on the same DB clock as NOW(), so
// points line up with shift start/end and meeting check-ins whatever the server timezone is.
// Duplicates (same clientPointId) are ignored, so a retried batch is safe.
// ---------------------------------------------------------------------------
const MAX_BATCH = 500;
// Points this far outside the shift window are dropped (clock skew allowance).
const SHIFT_WINDOW_SLACK_SEC = 10 * 60;

router.post("/points", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const body = req.body || {};
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : null;
    if (!shiftId) throw new HttpError(400, "shiftId is required");
    if (!Array.isArray(body.points)) throw new HttpError(400, "points must be an array");
    if (body.points.length > MAX_BATCH) throw new HttpError(400, `At most ${MAX_BATCH} points per batch`);

    const [[shift]] = await pool.query(
      `SELECT id, user_id, UNIX_TIMESTAMP(started_at) AS start_ts, UNIX_TIMESTAMP(COALESCE(ended_at, NOW())) AS end_ts
         FROM sales_field_shifts WHERE id = ?`,
      [shiftId]
    );
    if (!shift || Number(shift.user_id) !== Number(req.user.id)) throw new HttpError(404, "Shift not found");
    const minTs = Number(shift.start_ts) - SHIFT_WINDOW_SLACK_SEC;
    const maxTs = Number(shift.end_ts) + SHIFT_WINDOW_SLACK_SEC;

    const rows = [];
    let rejected = 0;
    for (const p of body.points) {
      const clientPointId = typeof p?.clientPointId === "string" ? p.clientPointId.trim().slice(0, 64) : "";
      const ts = Number(p?.capturedAtMs) / 1000;
      const lat = Number(p?.latitude);
      const lng = Number(p?.longitude);
      if (
        !clientPointId || !Number.isFinite(ts) || ts < minTs || ts > maxTs ||
        !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180
      ) {
        rejected += 1;
        continue;
      }
      rows.push([
        shift.id, req.user.id, clientPointId, ts, lat, lng,
        optionalNumber(p.accuracy, 0, 999999),
        optionalNumber(p.speedKmph, 0, 999999),
        optionalNumber(p.bearing, 0, 360),
        optionalNumber(p.batteryPercent, 0, 100),
      ]);
    }

    let stored = 0;
    if (rows.length) {
      const placeholders = rows.map(() => "(?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?)").join(", ");
      const [result] = await pool.query(
        `INSERT IGNORE INTO sales_field_points
           (shift_id, user_id, client_point_id, captured_at, latitude, longitude, accuracy_m, speed_kmph, bearing, battery_percent)
         VALUES ${placeholders}`,
        rows.flat()
      );
      stored = result.affectedRows;
    }
    // accepted = valid points (new + already stored); the phone may delete all of them locally.
    res.json({ accepted: rows.length, stored, duplicates: rows.length - stored, rejected });
  } catch (err) {
    sendError(res, err, "Failed to save location points");
  }
});

// ---------------------------------------------------------------------------
// GET /api/field-tracking/day/:userId?date=YYYY-MM-DD -- one executive's full day: shifts, GPS
// points, client visits, stops, gaps, GPS km and the petrol legs (start -> clients -> return).
// The executive may read their own day; managers read their team's.
// ---------------------------------------------------------------------------
router.get("/day/:userId", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const userId = parseId(req.params.userId);
    if (!userId) throw new HttpError(400, "Invalid user id");
    const date = readDate(req.query.date);
    if (!date) throw new HttpError(400, "date is required (YYYY-MM-DD)");
    await assertCanSeeUser(req, userId);

    const [[user]] = await pool.query("SELECT id, name, phone FROM users WHERE id = ?", [userId]);
    if (!user) throw new HttpError(404, "User not found");

    res.json(await computeDay(pool, { id: Number(user.id), name: user.name, phone: user.phone }, date));
  } catch (err) {
    sendError(res, err, "Failed to load field day");
  }
});

// ---------------------------------------------------------------------------
// PUT /api/field-tracking/day/:userId/route?date=YYYY-MM-DD -- the direct road km of each petrol
// leg and the road route line, measured once by the manager's browser with Google's Routes API.
// Body: { fingerprint,
//         legRoadMeters: one entry per shift (as petrol.waypoints): the road metres of each of its
//                        legs, or null for a shift with no visit | null,
//         roadPath: the route line - a JSON list of Google encoded polylines, one per shift | null }
// The server works the petrol out from them (utils/salesFieldTracking.js) and returns the day's
// petrol. A CLOSED day is also saved, so no later view (any manager, any computer) asks Google
// again and the day keeps one fixed petrol km; a day still running is only worked out, not saved.
// The fingerprint must be the one GET /day returned: if points or punches arrived since, 409.
// ---------------------------------------------------------------------------
const MAX_ROAD_PATH_CHARS = 400000;

router.put("/day/:userId/route", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!isManager(req)) throw new HttpError(403, "Only a sales manager or admin can save a day's route");
    const userId = parseId(req.params.userId);
    if (!userId) throw new HttpError(400, "Invalid user id");
    const date = readDate(req.query.date);
    if (!date) throw new HttpError(400, "date is required (YYYY-MM-DD)");
    await assertCanSeeUser(req, userId);

    const body = req.body || {};
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
    if (!/^[0-9a-f]{40}$/.test(fingerprint)) throw new HttpError(400, "fingerprint is required");
    let legRoadMeters = null;
    if (body.legRoadMeters !== null && body.legRoadMeters !== undefined) {
      const bad = (m) => !Number.isFinite(Number(m)) || Number(m) < 0 || Number(m) > 2000000;
      const badGroup = (g) => g !== null && (!Array.isArray(g) || g.some(bad));
      if (!Array.isArray(body.legRoadMeters) || body.legRoadMeters.some(badGroup)) {
        throw new HttpError(400, "legRoadMeters must be a list (one per shift) of distances in metres");
      }
      legRoadMeters = body.legRoadMeters.map((g) => (g === null ? null : g.map((m) => Math.round(Number(m)))));
    }
    let roadPath = null;
    if (body.roadPath !== null && body.roadPath !== undefined) {
      if (typeof body.roadPath !== "string" || !body.roadPath || body.roadPath.length > MAX_ROAD_PATH_CHARS) {
        throw new HttpError(400, "roadPath must be an encoded polyline");
      }
      roadPath = body.roadPath;
    }

    const [[user]] = await pool.query("SELECT id, name FROM users WHERE id = ?", [userId]);
    if (!user) throw new HttpError(404, "User not found");
    const who = { id: Number(user.id), name: user.name };
    const before = await computeDay(pool, who, date);
    if (!before.shifts.length) throw new HttpError(409, "No field day on this date");
    if (before.fingerprint !== fingerprint) throw new HttpError(409, "The day has changed since it was opened - reload the page");
    // one group per shift, each as long as that shift's legs
    const expected = (before.petrol.waypoints || []).map((g) => (g ? g.length - 1 : null));
    if (legRoadMeters && (legRoadMeters.length !== expected.length || legRoadMeters.some((g, i) => (g === null ? null : g.length) !== expected[i]))) {
      throw new HttpError(400, "The leg distances do not match the day's trips - reload the page");
    }
    // Already worked out and saved: the petrol stays. Only a road line Google could not draw before
    // is filled in later (the map otherwise keeps the plain GPS track).
    if (before.closed && before.savedRoute && !before.petrol.waypoints) {
      if (roadPath && !before.savedRoute.roadPath) {
        await pool.query("UPDATE sales_field_day_routes SET road_path = ? WHERE user_id = ? AND work_date = ? AND fingerprint = ?", [
          roadPath, userId, date, fingerprint,
        ]);
        return res.json({ saved: true, petrol: before.petrol });
      }
      return res.json({ saved: false, petrol: before.petrol });
    }

    const day = await computeDay(pool, who, date, legRoadMeters);
    if (!day.closed) return res.json({ saved: false, petrol: day.petrol });

    await pool.query(
      `INSERT INTO sales_field_day_routes (user_id, work_date, fingerprint, petrol_km, leg_road_m, road_path, computed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint), petrol_km = VALUES(petrol_km), leg_road_m = VALUES(leg_road_m),
                               road_path = VALUES(road_path), computed_by = VALUES(computed_by),
                               computed_at = CURRENT_TIMESTAMP`,
      [userId, date, fingerprint, day.petrol.km, legRoadMeters ? JSON.stringify(legRoadMeters) : null, roadPath, req.user.id]
    );
    res.status(201).json({ saved: true, petrol: day.petrol });
  } catch (err) {
    sendError(res, err, "Failed to save the day's route");
  }
});

// ---------------------------------------------------------------------------
// GET /api/field-tracking/team?date=YYYY-MM-DD -- every executive the manager may see, with that
// day's summary (shift times, visits, GPS km, petrol km). Click-through goes to
// /day/:userId.
// ---------------------------------------------------------------------------
router.get("/team", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!isManager(req)) throw new HttpError(403, "Only sales managers can see team tracking");
    const date = readDate(req.query.date);
    if (!date) throw new HttpError(400, "date is required (YYYY-MM-DD)");

    const executives = await listExecutives(req);
    const team = [];
    for (const exec of executives) {
      const day = await computeDay(pool, exec, date);
      team.push({
        user: { id: exec.id, name: exec.name },
        shiftCount: day.shifts.length,
        status: day.shifts.some((s) => s.status === "ACTIVE") ? "ACTIVE" : day.shifts.length ? "ENDED" : "NOT_STARTED",
        ...day.summary,
      });
    }
    res.json({ date, team });
  } catch (err) {
    sendError(res, err, "Failed to load team tracking");
  }
});

// ---------------------------------------------------------------------------
// GET /api/field-tracking/report?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=12&format=xlsx
// Every field day of one executive (userId) or all the executives the manager may see, over at
// most 31 days: day summaries, client visits, petrol trips, stops, GPS gaps and alerts
// (services/salesFieldReport.service.js). JSON for the Report tab; format=xlsx downloads it.
// ---------------------------------------------------------------------------
router.get("/report", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!isManager(req)) throw new HttpError(403, "Only sales managers can see the field report");
    const from = readDate(req.query.from);
    const to = readDate(req.query.to);
    if (!from || !to) throw new HttpError(400, "from and to are required (YYYY-MM-DD)");
    if (to < from) throw new HttpError(400, "to cannot be before from");
    const span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    if (span > MAX_DAYS) throw new HttpError(400, `Choose ${MAX_DAYS} days or fewer`);

    let executives = await listExecutives(req);
    const userId = req.query.userId ? parseId(req.query.userId) : null;
    if (req.query.userId && !userId) throw new HttpError(400, "Invalid user id");
    if (userId) {
      executives = executives.filter((e) => e.id === userId);
      if (!executives.length) throw new HttpError(404, "Sales executive not found");
    }

    const report = await buildFieldReport(pool, executives, from, to);
    if (req.query.format !== "xlsx") return res.json(report);

    const title = userId ? executives[0].name : "All sales executives";
    const buffer = await fieldReportWorkbook(report, title);
    const safe = title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "field";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Field-Report-${safe}-${from}-to-${to}.xlsx"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(buffer);
  } catch (err) {
    sendError(res, err, "Failed to build the field report");
  }
});

module.exports = router;
