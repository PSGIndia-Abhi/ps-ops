const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { v4: uuid } = require("uuid");
const { getTeamUserIds, loadUserCards } = require("../utils/hierarchy");

// ---------------------------------------------------------------------------
// Employee feedback (Task Management) - the Managing Director's private notes on their employees:
// a free type ("Punctuality", "Customer handling"...), what they have to say, and 1-5 stars.
// Only the Managing Director can see or touch any of it (not the employee, their managers, the
// Personal Assistant or admin). Stored per employee (users.id), for an HRMS to pick up later.
//
//   GET    /api/employee-feedback/employees          -> the MD's team, each with count / average stars
//   GET    /api/employee-feedback/types              -> types used before (suggestions, like task types)
//   GET    /api/employee-feedback?employee_id=        -> entries, newest first
//   GET    /api/employee-feedback/report/:employeeId -> one employee: average, per type, every entry
//   POST   /api/employee-feedback                    -> { employee_id, feedback_type, comments, rating }
//   PUT    /api/employee-feedback/:id                -> the same fields (any of them)
//   DELETE /api/employee-feedback/:id
// ---------------------------------------------------------------------------

const MD_ROLE = "Managing Director";
const MAX_TYPE = 100;
const MAX_COMMENTS = 2000;

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

function requireMD(req, res, next) {
  if (!req.user?.id || req.user.role !== MD_ROLE) return res.status(403).json({ error: "Only the Managing Director can see employee feedback" });
  next();
}

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** The people the MD can give feedback to: their team in Task Management (same as the assign-to picker). */
async function myTeam(userId) {
  const ids = await getTeamUserIds(pool, userId);
  const cards = (await loadUserCards(pool, ids)).filter((c) => c.is_active === 1);
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

function readBody(body, { partial = false } = {}) {
  const b = body || {};
  const out = {};
  if (!partial || b.employee_id !== undefined) {
    const id = Number(b.employee_id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Choose the employee");
    out.employee_id = id;
  }
  if (!partial || b.feedback_type !== undefined) {
    const t = text(b.feedback_type);
    if (!t) throw new HttpError(400, "Enter the feedback type");
    if (t.length > MAX_TYPE) throw new HttpError(400, `The type is too long (max ${MAX_TYPE} characters)`);
    out.feedback_type = t;
  }
  if (!partial || b.comments !== undefined) {
    const c = text(b.comments);
    if (c.length < 3) throw new HttpError(400, "Write the feedback");
    if (c.length > MAX_COMMENTS) throw new HttpError(400, `The feedback is too long (max ${MAX_COMMENTS} characters)`);
    out.comments = c;
  }
  if (!partial || b.rating !== undefined) {
    const r = Number(b.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new HttpError(400, "Give 1 to 5 stars");
    out.rating = r;
  }
  return out;
}

const ENTRY_SQL = `
  SELECT f.id, f.employee_id, e.name AS employee_name, f.feedback_type, f.comments, f.rating,
         f.created_by, c.name AS created_by_name,
         DATE_FORMAT(f.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(f.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM employee_feedback f
    LEFT JOIN users e ON e.id = f.employee_id
    LEFT JOIN users c ON c.id = f.created_by`;

const round1 = (n) => Math.round(Number(n) * 10) / 10;

router.get("/employees", auth, requireMD, async (req, res) => {
  try {
    const team = await myTeam(req.user.id);
    const [stats] = team.length
      ? await pool.query(
          `SELECT employee_id, COUNT(*) AS count, AVG(rating) AS average,
                  DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i:%s') AS last_at
             FROM employee_feedback WHERE employee_id IN (?) GROUP BY employee_id`,
          [team.map((c) => c.id)]
        )
      : [[]];
    const byId = new Map(stats.map((s) => [Number(s.employee_id), s]));
    res.json(
      team.map((c) => {
        const s = byId.get(c.id);
        return {
          id: c.id, name: c.name, role: c.role, designation: c.designation, unit_name: c.unit_name,
          count: s ? Number(s.count) : 0, average: s ? round1(s.average) : null, last_at: s ? s.last_at : null,
        };
      })
    );
  } catch (err) {
    sendError(res, err, "Failed to load employees");
  }
});

router.get("/types", auth, requireMD, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT feedback_type, COUNT(*) AS n FROM employee_feedback GROUP BY feedback_type ORDER BY n DESC, feedback_type ASC LIMIT 50"
    );
    res.json(rows.map((r) => r.feedback_type));
  } catch (err) {
    sendError(res, err, "Failed to load feedback types");
  }
});

router.get("/", auth, requireMD, async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.query.employee_id) {
      where.push("f.employee_id = ?");
      params.push(Number(req.query.employee_id));
    }
    const [rows] = await pool.query(
      `${ENTRY_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.created_at DESC LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load feedback");
  }
});

router.get("/report/:employeeId", auth, requireMD, async (req, res) => {
  try {
    const id = Number(req.params.employeeId);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid employee");
    const [card] = await loadUserCards(pool, [id]);
    if (!card) throw new HttpError(404, "Employee not found");
    const [entries] = await pool.query(`${ENTRY_SQL} WHERE f.employee_id = ? ORDER BY f.created_at DESC`, [id]);
    const [types] = await pool.query(
      `SELECT feedback_type AS type, COUNT(*) AS count, AVG(rating) AS average
         FROM employee_feedback WHERE employee_id = ? GROUP BY feedback_type ORDER BY count DESC, type ASC`,
      [id]
    );
    const total = entries.reduce((s, e) => s + Number(e.rating), 0);
    res.json({
      employee: { id: card.id, name: card.name, role: card.role, designation: card.designation, unit_name: card.unit_name },
      count: entries.length,
      average: entries.length ? round1(total / entries.length) : null,
      by_type: types.map((t) => ({ type: t.type, count: Number(t.count), average: round1(t.average) })),
      entries,
    });
  } catch (err) {
    sendError(res, err, "Failed to load the report");
  }
});

router.post("/", auth, requireMD, async (req, res) => {
  try {
    const input = readBody(req.body);
    const team = await getTeamUserIds(pool, req.user.id);
    if (!team.map(Number).includes(input.employee_id)) throw new HttpError(400, "Choose someone from your team");
    const id = uuid();
    await pool.query(
      `INSERT INTO employee_feedback (id, employee_id, feedback_type, comments, rating, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.employee_id, input.feedback_type, input.comments, input.rating, req.user.id]
    );
    const [[row]] = await pool.query(`${ENTRY_SQL} WHERE f.id = ?`, [id]);
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, "Failed to save the feedback");
  }
});

router.put("/:id", auth, requireMD, async (req, res) => {
  try {
    const [[existing]] = await pool.query("SELECT id FROM employee_feedback WHERE id = ?", [req.params.id]);
    if (!existing) throw new HttpError(404, "Feedback not found");
    const input = readBody(req.body, { partial: true });
    if (input.employee_id !== undefined) {
      const team = await getTeamUserIds(pool, req.user.id);
      if (!team.map(Number).includes(input.employee_id)) throw new HttpError(400, "Choose someone from your team");
    }
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(400, "Nothing to change");
    await pool.query(
      `UPDATE employee_feedback SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = NOW() WHERE id = ?`,
      [...keys.map((k) => input[k]), existing.id]
    );
    const [[row]] = await pool.query(`${ENTRY_SQL} WHERE f.id = ?`, [existing.id]);
    res.json(row);
  } catch (err) {
    sendError(res, err, "Failed to update the feedback");
  }
});

router.delete("/:id", auth, requireMD, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM employee_feedback WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) throw new HttpError(404, "Feedback not found");
    res.json({ deleted: true });
  } catch (err) {
    sendError(res, err, "Failed to delete the feedback");
  }
});

module.exports = router;
