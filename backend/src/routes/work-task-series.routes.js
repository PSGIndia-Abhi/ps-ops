const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const PERMISSIONS = require("../access/permissions");
const { today: dbToday } = require("../utils/hierarchy");
const { hasPerm, resolveVisibleUserIds, isRealDate: isValidDate } = require("../utils/workTasks");
const {
  DATE_FMT, REC_COLUMNS, addDays, maxStr, nextOccurrenceDate, generateDueOccurrences,
} = require("../utils/workTaskRecurrence");

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
function requireRealUser(req, res, next) {
  if (!req.user?.id) return res.status(403).json({ error: "Not available for this account" });
  next();
}
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

const SERIES_COLUMNS = `s.id, s.title, s.description, s.task_type, s.priority, s.source_module, s.source_id,
  s.assigned_to, u.name AS assigned_to_name, s.status,
  ${DATE_FMT("s.pause_from")} AS pause_from, ${DATE_FMT("s.pause_until")} AS pause_until,
  s.created_by, s.created_at, s.updated_at`;

async function loadSeries(executor, id) {
  const [[row]] = await executor.query(
    `SELECT ${SERIES_COLUMNS} FROM work_task_series s LEFT JOIN users u ON u.id = s.assigned_to WHERE s.id = ?`,
    [id]
  );
  return row || null;
}
async function loadRecurrence(executor, seriesId) {
  const [[row]] = await executor.query(
    `SELECT id, series_id, ${REC_COLUMNS}, created_at FROM work_task_recurrence WHERE series_id = ?`,
    [seriesId]
  );
  return row || null;
}

// 404 (never 403) for a series the requester can't see.
async function loadVisibleSeries(req, id) {
  const series = await loadSeries(pool, id);
  if (!series) throw new HttpError(404, "Series not found");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  const isMine = Number(series.created_by) === Number(req.user.id);
  if (visibleIds !== null && !isMine && !visibleIds.includes(Number(series.assigned_to))) {
    throw new HttpError(404, "Series not found");
  }
  return series;
}
function canManageSeries(req, series) {
  return (
    req.user.role === "admin" ||
    Number(series.created_by) === Number(req.user.id) ||
    Number(series.assigned_to) === Number(req.user.id) ||
    hasPerm(req, PERMISSIONS.MANAGE_TEAM_WORK_TASKS)
  );
}

// GET /api/work-task-series -- schedules the requester may see.
// Filters: status, assigned_to (must be within the visible set).
router.get("/", auth, requireRealUser, async (req, res) => {
  try {
    const visibleIds = await resolveVisibleUserIds(pool, req);
    const where = [];
    const params = [];
    if (req.query.assigned_to) {
      const assignedTo = parseId(req.query.assigned_to);
      if (!assignedTo) throw new HttpError(400, "Invalid assigned_to");
      if (visibleIds !== null && !visibleIds.includes(assignedTo)) throw new HttpError(403, "You cannot view this person's schedules");
      where.push("s.assigned_to = ?");
      params.push(assignedTo);
    } else if (visibleIds !== null) {
      where.push("(s.assigned_to IN (?) OR s.created_by = ?)");
      params.push(visibleIds, Number(req.user.id));
    }
    if (req.query.status) { where.push("s.status = ?"); params.push(String(req.query.status)); }

    const [rows] = await pool.query(
      `SELECT ${SERIES_COLUMNS}, r.frequency, r.interval_value, r.days_of_week, r.day_of_month, r.use_last_day_of_month,
              r.month_of_year, r.time_of_day, ${DATE_FMT("r.start_date")} AS start_date, r.end_type,
              ${DATE_FMT("r.end_date")} AS end_date, r.end_count, r.occurrences_created,
              ${DATE_FMT("r.last_generated_until")} AS last_generated_until
         FROM work_task_series s
         LEFT JOIN users u ON u.id = s.assigned_to
         LEFT JOIN work_task_recurrence r ON r.series_id = s.id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY s.created_at DESC`,
      params
    );
    const todayStr = await dbToday(pool);
    res.json(rows.map((r) => ({ ...r, next_occurrence_date: r.frequency ? nextOccurrenceDate(r, r, todayStr) : null })));
  } catch (err) {
    sendError(res, err, "Failed to load schedules");
  }
});

// GET /api/work-task-series/:id -- the schedule, its rule, the next date and recent occurrences.
router.get("/:id", auth, requireRealUser, async (req, res) => {
  try {
    const series = await loadVisibleSeries(req, req.params.id);
    const recurrence = await loadRecurrence(pool, series.id);
    const [occurrences] = await pool.query(
      `SELECT id, ${DATE_FMT("due_date")} AS due_date, due_time, status
         FROM work_tasks WHERE series_id = ? ORDER BY due_date DESC, due_time DESC LIMIT 50`,
      [series.id]
    );
    res.json({
      ...series,
      recurrence,
      next_occurrence_date: recurrence ? nextOccurrenceDate(series, recurrence, await dbToday(pool)) : null,
      occurrences,
    });
  } catch (err) {
    sendError(res, err, "Failed to load schedule");
  }
});

// POST /api/work-task-series/:id/pause -- body: { pause_from, pause_until? }
// Dates inside the window are skipped for good (never created later). Without
// pause_until it stays paused until resumed.
router.post("/:id/pause", auth, requireRealUser, async (req, res) => {
  try {
    const series = await loadVisibleSeries(req, req.params.id);
    if (!canManageSeries(req, series)) throw new HttpError(403, "You cannot pause this schedule");
    if (series.status !== "ACTIVE") throw new HttpError(400, `Cannot pause a schedule that is ${series.status}`);

    const { pause_from: from, pause_until: until } = req.body || {};
    if (!isValidDate(from)) throw new HttpError(400, "pause_from is required (YYYY-MM-DD)");
    if (until !== undefined && until !== null && !isValidDate(until)) throw new HttpError(400, "pause_until must be YYYY-MM-DD");
    if (until && until < from) throw new HttpError(400, "pause_until cannot be before pause_from");

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_task_series SET status = 'PAUSED', pause_from = ?, pause_until = ? WHERE id = ? AND status = 'ACTIVE'",
        [from, until || null, series.id]
      );
      if (!result.affectedRows) throw new HttpError(409, "This schedule was just changed by someone else. Reload and try again.");
    });
    res.json(await loadSeries(pool, series.id));
  } catch (err) {
    sendError(res, err, "Failed to pause schedule");
  }
});

// POST /api/work-task-series/:id/resume -- clears the pause and creates today's
// occurrence if it is due. Days that passed while paused are not back-filled.
router.post("/:id/resume", auth, requireRealUser, async (req, res) => {
  try {
    const series = await loadVisibleSeries(req, req.params.id);
    if (!canManageSeries(req, series)) throw new HttpError(403, "You cannot resume this schedule");
    if (series.status !== "PAUSED") throw new HttpError(400, `Cannot resume a schedule that is ${series.status}`);

    const todayStr = await dbToday(pool);
    const created = await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_task_series SET status = 'ACTIVE', pause_from = NULL, pause_until = NULL WHERE id = ? AND status = 'PAUSED'",
        [series.id]
      );
      if (!result.affectedRows) throw new HttpError(409, "This schedule was just changed by someone else. Reload and try again.");
      if (series.pause_from && series.pause_from <= todayStr) {
        // The pause was in effect: everything up to yesterday is settled, don't back-fill it.
        const [[rec]] = await conn.query(`SELECT ${DATE_FMT("last_generated_until")} AS last_generated_until FROM work_task_recurrence WHERE series_id = ?`, [series.id]);
        const bookmark = maxStr(rec?.last_generated_until, addDays(todayStr, -1));
        await conn.query("UPDATE work_task_recurrence SET last_generated_until = ? WHERE series_id = ?", [bookmark, series.id]);
      }
      return generateDueOccurrences(conn, series.id, todayStr);
    });
    res.json({ ...(await loadSeries(pool, series.id)), occurrences_created: created });
  } catch (err) {
    sendError(res, err, "Failed to resume schedule");
  }
});

// POST /api/work-task-series/:id/stop -- permanent. No more occurrences; the
// ones already created are left as they are.
router.post("/:id/stop", auth, requireRealUser, async (req, res) => {
  try {
    const series = await loadVisibleSeries(req, req.params.id);
    if (!canManageSeries(req, series)) throw new HttpError(403, "You cannot stop this schedule");
    if (series.status === "CANCELLED") return res.json({ success: true, already_stopped: true });

    await pool.query("UPDATE work_task_series SET status = 'CANCELLED', pause_from = NULL, pause_until = NULL WHERE id = ?", [series.id]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to stop schedule");
  }
});

module.exports = router;
