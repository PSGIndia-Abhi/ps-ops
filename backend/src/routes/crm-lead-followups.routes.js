const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, hasPerm, resolveVisibleUserIds, isOwnLead,
} = require("../utils/crmLeadManagement");
const { logHistory: logTaskHistory, isValidTime } = require("../utils/workTasks");

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
function optionalText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (max && trimmed.length > max) return false;
  return trimmed || null;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
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

async function loadVisibleLead(req, leadId) {
  const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ? AND lead_type = 'commercial'", [leadId]);
  if (!lead) throw new HttpError(404, "Lead not found");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && !isOwnLead(lead, req.user.id) && !visibleIds.some((id) => isOwnLead(lead, id))) {
    throw new HttpError(404, "Lead not found");
  }
  return lead;
}
function canManageLead(req, lead) {
  return req.user.role === "admin" || isOwnLead(lead, req.user.id) || hasPerm(req, "MANAGE_LEADS");
}

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/follow-ups -- a thin wrapper: this creates a real
// row in the existing Task Management module (work_tasks, task_type=
// 'LEAD_FOLLOW_UP', source_module='LEAD', source_id=lead.id). No separate
// follow-up table or reminder engine -- exactly the point of reusing it.
// ---------------------------------------------------------------------------
router.post("/leads/:id/follow-ups", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot schedule a follow-up for this lead");
    if (["WON", "CONVERTED", "NOT_GENUINE", "LOST", "CANCELLED"].includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot schedule a follow-up for a lead that is ${lead.pipeline_stage}`);
    }

    const body = req.body || {};
    if (!isValidDate(body.nextActionDate)) throw new HttpError(400, "nextActionDate is required (YYYY-MM-DD)");
    if (body.nextActionTime && !isValidTime(body.nextActionTime)) throw new HttpError(400, "nextActionTime must be a valid HH:MM or HH:MM:SS");
    const note = optionalText(body.note, 2000);
    if (note === false) throw new HttpError(400, "note is too long (max 2000 characters)");

    let assignedTo = parseId(body.assignedTo);
    if (assignedTo === null) {
      assignedTo = lead.assigned_telecaller_id || lead.assigned_sales_employee_id || Number(req.user.id);
    } else if (assignedTo !== Number(req.user.id) && !hasPerm(req, "MANAGE_LEADS") && req.user.role !== "admin") {
      throw new HttpError(403, "You cannot assign a follow-up to someone else");
    }
    const [[assignee]] = await pool.query("SELECT id FROM users WHERE id = ? AND is_active = 1", [assignedTo]);
    if (!assignee) throw new HttpError(400, "Invalid assignedTo");

    const taskId = uuid();
    const title = `Follow up - ${lead.company_name || lead.customer_name}`.slice(0, 200);
    await inTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO work_tasks (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
         VALUES (?, ?, ?, 'LEAD_FOLLOW_UP', 'NORMAL', 'LEAD', ?, ?, ?, ?, ?)`,
        [taskId, title, note, lead.id, assignedTo, req.user.id, body.nextActionDate, body.nextActionTime || null]
      );
      await logTaskHistory(conn, taskId, "CREATE", { toStatus: "OPEN", changedBy: req.user.id, note: "Created from a lead follow-up" });
      await logLeadHistory(conn, lead.id, "FOLLOW_UP_SCHEDULED", {
        note: `Due ${body.nextActionDate}${body.nextActionTime ? ` ${body.nextActionTime}` : ""}${note ? `: ${note}` : ""}`.slice(0, 500),
        changedBy: req.user.id,
      });
    });

    const [[task]] = await pool.query(
      `SELECT id, title, description, task_type, status, assigned_to, created_by,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time, created_at
         FROM work_tasks WHERE id = ?`,
      [taskId]
    );
    res.status(201).json(task);
  } catch (err) {
    sendError(res, err, "Failed to schedule follow-up");
  }
});

// ---------------------------------------------------------------------------
// GET /api/crm/my-tasks/today -- the logged-in employee's own lead-related
// tasks due today (source_module='LEAD'). A scoped convenience view for the
// Lead Management screens; the full task list still lives at
// GET /api/work-tasks, which this never duplicates or replaces.
// ---------------------------------------------------------------------------
router.get("/my-tasks/today", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.description, t.task_type, t.priority, t.status,
              DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.due_time,
              t.source_id AS lead_id, l.lead_number, l.company_name, l.customer_name
         FROM work_tasks t
         LEFT JOIN crm_leads l ON l.id = t.source_id AND t.source_module = 'LEAD'
        WHERE t.assigned_to = ? AND t.source_module = 'LEAD' AND t.due_date = CURDATE()
          AND t.status IN ('OPEN','IN_PROGRESS','PAUSED')
        ORDER BY t.due_time ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load today's tasks");
  }
});

module.exports = router;
