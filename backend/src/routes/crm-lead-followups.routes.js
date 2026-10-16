const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, hasPerm, resolveVisibleUserIds, isOwnLead, isHiddenSalesOwnLead,
} = require("../utils/crmLeadManagement");
const { logHistory: logTaskHistory, isValidTime } = require("../utils/workTasks");
const { notifyLead } = require("../utils/crmLeadNotifications");
const { syncReminders } = require("../services/push.service");

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

// A residential (consumer) lead is seen by whoever added it, and by roles that see every lead or
// manage leads - as GET /api/crm/leads/:id (crm.routes.js) plus the lead managers.
function canViewAllConsumerLeads(req) {
  return req.user.role === "admin" || hasPerm(req, "CRM_VIEW_ALL_LEADS") || hasPerm(req, "MANAGE_LEADS");
}

async function loadVisibleLead(req, leadId, { residential = false } = {}) {
  const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [leadId]);
  if (!lead) throw new HttpError(404, "Lead not found");
  if (lead.lead_type !== "commercial") {
    // Residential leads only get call follow-ups (see /residential-calls below).
    if (!residential) throw new HttpError(404, "Lead not found");
    if (!canViewAllConsumerLeads(req) && Number(lead.created_by_user_id) !== Number(req.user.id)) {
      throw new HttpError(404, "Lead not found");
    }
    return lead;
  }
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && !isOwnLead(lead, req.user.id) && !visibleIds.some((id) => isOwnLead(lead, id))) {
    throw new HttpError(404, "Lead not found");
  }
  // A sales executive's own lead stays with them and lead managers.
  if (await isHiddenSalesOwnLead(pool, req, lead)) throw new HttpError(404, "Lead not found");
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
//
// Which task the follow-up goes into:
//  - body.taskId: that open follow-up of this lead moves to the new date and time
//    (the old time and the note go into its history) - "Change date & time";
//  - body.newTask = true: always a new follow-up, next to any already open - "Add follow-up";
//  - neither (the web, older app versions): the person's open follow-up on the
//    lead moves, and a new one is made only when they have none.
// The lead's own history records every follow-up that was set. Residential leads
// use it too, for their call follow-ups.
// ---------------------------------------------------------------------------
router.post("/leads/:id/follow-ups", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id, { residential: true });
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot schedule a follow-up for this lead");
    if (["WON", "CONVERTED", "NOT_GENUINE", "LOST", "CANCELLED"].includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot schedule a follow-up for a lead that is ${lead.pipeline_stage}`);
    }
    if (lead.lead_type !== "commercial" && ["converted", "lost"].includes(lead.lead_status)) {
      throw new HttpError(400, `Cannot schedule a follow-up for a lead that is ${lead.lead_status}`);
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

    let open = null;
    if (body.taskId) {
      [[open]] = await pool.query(
        `SELECT id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time
           FROM work_tasks
          WHERE id = ? AND source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ?
            AND status IN ('OPEN','IN_PROGRESS','PAUSED')`,
        [String(body.taskId), lead.id]
      );
      if (!open) throw new HttpError(404, "That follow-up is no longer open");
    } else if (body.newTask !== true) {
      [[open]] = await pool.query(
        `SELECT id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time
           FROM work_tasks
          WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ? AND assigned_to = ?
            AND status IN ('OPEN','IN_PROGRESS','PAUSED')
          ORDER BY due_date ASC, due_time ASC LIMIT 1`,
        [lead.id, assignedTo]
      );
    }
    const taskId = open ? open.id : uuid();
    const title = `Follow up - ${lead.company_name || lead.customer_name}`.slice(0, 200);
    await inTransaction(async (conn) => {
      if (open) {
        // The lead's follow-up task moves on: same task, new time; the latest note becomes its description.
        await conn.query("UPDATE work_tasks SET due_date = ?, due_time = ?, description = COALESCE(?, description) WHERE id = ?", [
          body.nextActionDate, body.nextActionTime || null, note, open.id,
        ]);
        const from = `${open.due_date}${open.due_time ? ` ${open.due_time}` : ""}`;
        const to = `${body.nextActionDate}${body.nextActionTime ? ` ${body.nextActionTime}` : ""}`;
        await logTaskHistory(conn, open.id, "RESCHEDULE", { changedBy: req.user.id, note: `Due ${from} moved to ${to}: Next follow-up${note ? ` - ${note}` : ""}`.slice(0, 500) });
      } else {
        await conn.query(
          `INSERT INTO work_tasks (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
           VALUES (?, ?, ?, 'LEAD_FOLLOW_UP', 'NORMAL', 'LEAD', ?, ?, ?, ?, ?)`,
          [taskId, title, note, lead.id, assignedTo, req.user.id, body.nextActionDate, body.nextActionTime || null]
        );
        await logTaskHistory(conn, taskId, "CREATE", { toStatus: "OPEN", changedBy: req.user.id, note: "Created from a lead follow-up" });
      }
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
    if (Number(assignedTo) !== Number(req.user.id)) {
      notifyLead(lead.id, "FOLLOW_UP_ASSIGNED", { actorId: req.user.id, extra: { assignedTo, dueAt: `${body.nextActionDate} ${body.nextActionTime || "09:00"}` } });
    }
    syncReminders([assignedTo]); // the follow-up rings on the phone, also when it was set on the web
    res.status(201).json(task);
  } catch (err) {
    sendError(res, err, "Failed to schedule follow-up");
  }
});

// ---------------------------------------------------------------------------
// Residential call follow-ups. A residential lead is not worked through the
// commercial pipeline: its follow-ups are calls only, until it is converted.
//
// GET  /api/crm/leads/:id/residential-calls -> { lead_status, open: [follow-ups], history: [calls, next calls set] }
// POST /api/crm/leads/:id/residential-calls { outcome, note?, nextDate?, nextTime?, taskId? }
//   outcome: INTERESTED | NOT_INTERESTED | CALL_BACK | NOT_REACHABLE.
//   Logs the call in the lead's history. NOT_INTERESTED closes the lead (lead_status
//   'lost') and its open follow-ups; any other outcome needs the next call's date
//   (taskId's follow-up - or the person's open one - moves there, else a new one is
//   made), and INTERESTED moves a 'new' lead to 'contacted'.
// ---------------------------------------------------------------------------
const CALL_OUTCOMES = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  CALL_BACK: "Call back later",
  NOT_REACHABLE: "Not reachable",
};

async function loadResidentialLead(req, leadId) {
  const lead = await loadVisibleLead(req, leadId, { residential: true });
  if (lead.lead_type === "commercial") throw new HttpError(400, "Use the lead's pipeline for a commercial lead");
  return lead;
}

router.get("/leads/:id/residential-calls", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadResidentialLead(req, req.params.id);
    const [open] = await pool.query(
      `SELECT t.id, t.description, t.assigned_to, u.name AS assigned_to_name,
              DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.due_time
         FROM work_tasks t LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.source_module = 'LEAD' AND t.task_type = 'LEAD_FOLLOW_UP' AND t.source_id = ?
          AND t.status IN ('OPEN','IN_PROGRESS','PAUSED')
        ORDER BY t.due_date ASC, t.due_time ASC`,
      [lead.id]
    );
    const [history] = await pool.query(
      `SELECT h.id, h.action, h.note, h.changed_at, u.name AS changed_by_name
         FROM crm_lead_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.lead_id = ? AND h.action IN ('CALL_LOGGED', 'FOLLOW_UP_SCHEDULED')
        ORDER BY h.changed_at DESC, h.id DESC LIMIT 100`,
      [lead.id]
    );
    res.json({ lead_status: lead.lead_status, open, history });
  } catch (err) {
    sendError(res, err, "Failed to load the calls");
  }
});

router.post("/leads/:id/residential-calls", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadResidentialLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot log a call for this lead");
    if (["converted", "lost"].includes(lead.lead_status)) {
      throw new HttpError(400, `This lead is already ${lead.lead_status}`);
    }
    const body = req.body || {};
    const outcome = String(body.outcome || "");
    if (!CALL_OUTCOMES[outcome]) throw new HttpError(400, "outcome must be INTERESTED, NOT_INTERESTED, CALL_BACK or NOT_REACHABLE");
    const note = optionalText(body.note, 400);
    if (note === false) throw new HttpError(400, "note is too long (max 400 characters)");
    const closing = outcome === "NOT_INTERESTED";
    if (!closing) {
      if (!isValidDate(body.nextDate)) throw new HttpError(400, "Pick the date of the next call");
      if (body.nextTime && !isValidTime(body.nextTime)) throw new HttpError(400, "nextTime must be a valid HH:MM");
    }
    const me = Number(req.user.id);

    await inTransaction(async (conn) => {
      await logLeadHistory(conn, lead.id, "CALL_LOGGED", {
        note: `${CALL_OUTCOMES[outcome]}${note ? `: ${note}` : ""}`.slice(0, 500),
        changedBy: me,
      });
      if (closing) {
        const [openTasks] = await conn.query(
          `SELECT id, status FROM work_tasks WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ?
              AND status IN ('OPEN','IN_PROGRESS','PAUSED')`,
          [lead.id]
        );
        for (const t of openTasks) {
          await conn.query("UPDATE work_tasks SET status = 'CANCELLED' WHERE id = ?", [t.id]);
          await logTaskHistory(conn, t.id, "CANCEL", { fromStatus: t.status, toStatus: "CANCELLED", changedBy: me, note: "Customer not interested" });
        }
        await conn.query("UPDATE crm_leads SET lead_status = 'lost' WHERE id = ?", [lead.id]);
        return;
      }
      if (outcome === "INTERESTED" && (lead.lead_status || "new") === "new") {
        await conn.query("UPDATE crm_leads SET lead_status = 'contacted' WHERE id = ?", [lead.id]);
      }
      const [[open]] = body.taskId
        ? await conn.query(
            `SELECT id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time FROM work_tasks
              WHERE id = ? AND source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ?
                AND status IN ('OPEN','IN_PROGRESS','PAUSED')`,
            [String(body.taskId), lead.id]
          )
        : await conn.query(
            `SELECT id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time FROM work_tasks
              WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ? AND assigned_to = ?
                AND status IN ('OPEN','IN_PROGRESS','PAUSED')
              ORDER BY due_date ASC, due_time ASC LIMIT 1`,
            [lead.id, me]
          );
      const when = `${body.nextDate}${body.nextTime ? ` ${body.nextTime}` : ""}`;
      const desc = `Call ${lead.customer_name}${note ? ` - ${note}` : ""}`.slice(0, 2000);
      if (open) {
        await conn.query("UPDATE work_tasks SET due_date = ?, due_time = ?, description = ? WHERE id = ?", [
          body.nextDate, body.nextTime || null, desc, open.id,
        ]);
        await logTaskHistory(conn, open.id, "RESCHEDULE", {
          changedBy: me,
          note: `Due ${open.due_date}${open.due_time ? ` ${open.due_time}` : ""} moved to ${when}: ${CALL_OUTCOMES[outcome]}`.slice(0, 500),
        });
      } else {
        const id = uuid();
        await conn.query(
          `INSERT INTO work_tasks (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
           VALUES (?, ?, ?, 'LEAD_FOLLOW_UP', 'NORMAL', 'LEAD', ?, ?, ?, ?, ?)`,
          [id, `Call - ${lead.customer_name}`.slice(0, 200), desc, lead.id, me, me, body.nextDate, body.nextTime || null]
        );
        await logTaskHistory(conn, id, "CREATE", { toStatus: "OPEN", changedBy: me, note: "Created from a residential call" });
      }
      await logLeadHistory(conn, lead.id, "FOLLOW_UP_SCHEDULED", { note: `Next call ${when}`, changedBy: me });
    });

    syncReminders([me]);
    res.status(201).json({ ok: true });
  } catch (err) {
    sendError(res, err, "Failed to log the call");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/residential-convert { amount?, note? } -- the residential lead became a
// customer: lead_status 'converted' (the final amount, when given, replaces the lead's), its open
// follow-up calls stop, and the lead's history records it. Whoever may work the lead may convert it.
// ---------------------------------------------------------------------------
router.post("/leads/:id/residential-convert", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadResidentialLead(req, req.params.id);
    if (!canManageLead(req, lead) && !canViewAllConsumerLeads(req)) throw new HttpError(403, "You cannot convert this lead");
    if (lead.lead_status === "converted") throw new HttpError(400, "This lead is already converted");
    const body = req.body || {};
    let amount = null;
    if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
      amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) throw new HttpError(400, "Enter a valid amount");
      amount = Math.round(amount * 100) / 100;
    }
    const note = optionalText(body.note, 400);
    if (note === false) throw new HttpError(400, "note is too long (max 400 characters)");
    const me = Number(req.user.id);

    await inTransaction(async (conn) => {
      await conn.query("UPDATE crm_leads SET lead_status = 'converted', amount = COALESCE(?, amount) WHERE id = ?", [amount, lead.id]);
      const [openTasks] = await conn.query(
        `SELECT id, status FROM work_tasks WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND source_id = ?
            AND status IN ('OPEN','IN_PROGRESS','PAUSED')`,
        [lead.id]
      );
      for (const t of openTasks) {
        await conn.query("UPDATE work_tasks SET status = 'CANCELLED' WHERE id = ?", [t.id]);
        await logTaskHistory(conn, t.id, "CANCEL", { fromStatus: t.status, toStatus: "CANCELLED", changedBy: me, note: "Lead converted to a customer" });
      }
      const changed = amount !== null && amount !== Number(lead.amount) ? ` (amount ${Number(lead.amount) || 0} -> ${amount})` : "";
      await logLeadHistory(conn, lead.id, "CONVERTED", { note: `Converted to a customer${changed}${note ? `: ${note}` : ""}`.slice(0, 500), changedBy: me });
    });

    syncReminders([me]);
    const [[updated]] = await pool.query("SELECT id, lead_status, amount FROM crm_leads WHERE id = ?", [lead.id]);
    res.json({ id: updated.id, lead_status: updated.lead_status, amount: Number(updated.amount) });
  } catch (err) {
    sendError(res, err, "Failed to convert the lead");
  }
});

// ---------------------------------------------------------------------------
// GET /api/crm/follow-ups -- the lead follow-ups for the Lead app's Follow-ups screens (they are
// LEAD_FOLLOW_UP rows in work_tasks, kept out of Task Management's lists).
//   ?scope=team (sales manager / admin): everyone's; otherwise only the caller's own.
//   ?assigned_to=<id> (team only): one person's.  ?done=1: also those completed in the last 7 days.
//   ?lead_type=commercial | consumer: only that kind of lead's follow-ups.
// Each row carries its lead (commercial or residential) so the screen can open and call it.
// ---------------------------------------------------------------------------
router.get("/follow-ups", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const team = req.query.scope === "team" && (req.user.role === "admin" || hasPerm(req, "MANAGE_LEADS"));
    const where = ["t.source_module = 'LEAD'", "t.task_type = 'LEAD_FOLLOW_UP'"];
    const params = [];
    if (!team) {
      where.push("t.assigned_to = ?");
      params.push(Number(req.user.id));
    } else if (parseId(req.query.assigned_to)) {
      where.push("t.assigned_to = ?");
      params.push(parseId(req.query.assigned_to));
    }
    if (req.query.lead_type === "commercial") where.push("l.lead_type = 'commercial'");
    if (req.query.lead_type === "consumer") where.push("l.lead_type <> 'commercial'");
    where.push(
      req.query.done === "1"
        ? "(t.status IN ('OPEN','IN_PROGRESS','PAUSED') OR (t.status = 'COMPLETED' AND t.completed_at >= NOW() - INTERVAL 7 DAY))"
        : "t.status IN ('OPEN','IN_PROGRESS','PAUSED')"
    );
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.description, t.status, t.assigned_to, u.name AS assigned_to_name,
              DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.due_time, t.completed_at,
              t.source_id AS lead_id, l.lead_type, l.lead_number, l.company_name, l.customer_name, l.phone,
              l.pipeline_stage, l.lead_status
         FROM work_tasks t
         JOIN crm_leads l ON l.id = t.source_id
         LEFT JOIN users u ON u.id = t.assigned_to
        WHERE ${where.join(" AND ")}
        ORDER BY t.due_date IS NULL, t.due_date ASC, t.due_time IS NULL, t.due_time ASC
        LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load follow-ups");
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
