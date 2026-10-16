const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { isValidDate, hasPerm, resolveVisibleUserIds, LEAD_ASSIGNEE_ROLES } = require("../utils/crmLeadManagement");

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
function firstDayOfThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
// The server's own date (the container runs in IST). toISOString() would give the UTC date,
// which is still "yesterday" until 5:30 in the morning and would cut today out of the report.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// GET /api/crm/reports/sales-performance?from=YYYY-MM-DD&to=YYYY-MM-DD&employeeId=102
//
// Own numbers need no permission (same "acting on yourself" convention as
// everywhere else). Looking at someone else's needs VIEW_TEAM_LEADS /
// MANAGE_LEADS (and that person must actually be in the requester's team) or
// VIEW_ALL_LEADS / admin for anyone company-wide.
// ---------------------------------------------------------------------------
router.get("/reports/sales-performance", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const from = req.query.from || firstDayOfThisMonth();
    const to = req.query.to || today();
    if (!isValidDate(from)) throw new HttpError(400, "from must be a valid date (YYYY-MM-DD)");
    if (!isValidDate(to)) throw new HttpError(400, "to must be a valid date (YYYY-MM-DD)");
    if (to < from) throw new HttpError(400, "to cannot be before from");

    let employeeId = parseId(req.query.employeeId);
    if (employeeId === null) {
      employeeId = Number(req.user.id);
    } else if (employeeId !== Number(req.user.id) && req.user.role !== "admin") {
      if (!hasPerm(req, "VIEW_TEAM_LEADS") && !hasPerm(req, "MANAGE_LEADS") && !hasPerm(req, "VIEW_ALL_LEADS")) {
        throw new HttpError(403, "You cannot view this person's performance");
      }
      if (!hasPerm(req, "VIEW_ALL_LEADS")) {
        const visibleIds = await resolveVisibleUserIds(pool, req);
        if (visibleIds !== null && !visibleIds.includes(employeeId)) {
          throw new HttpError(403, "You cannot view this person's performance");
        }
      }
    }

    // Leads generated: created by this employee in the period (their own
    // submissions, as telecaller or sales-generated -- not leads merely
    // assigned to them).
    const [[{ leadsGenerated }]] = await pool.query(
      `SELECT COUNT(*) AS leadsGenerated FROM crm_leads
        WHERE lead_type = 'commercial' AND created_by_user_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    // Genuine leads: distinct leads this employee marked GENUINE in the period.
    const [[{ genuineLeads }]] = await pool.query(
      `SELECT COUNT(DISTINCT lead_id) AS genuineLeads FROM crm_lead_history
        WHERE action = 'QUALIFY' AND note LIKE 'Marked GENUINE%' AND changed_by = ? AND DATE(changed_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    const [[{ meetingsScheduled }]] = await pool.query(
      `SELECT COUNT(*) AS meetingsScheduled FROM crm_lead_meetings
        WHERE sales_employee_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    // Visits completed: from completed meeting records, not merely scheduled ones.
    const [[{ visitsCompleted }]] = await pool.query(
      `SELECT COUNT(*) AS visitsCompleted FROM crm_lead_meetings
        WHERE sales_employee_id = ? AND status = 'COMPLETED' AND DATE(updated_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    const [[{ locationsVisited }]] = await pool.query(
      `SELECT COUNT(*) AS locationsVisited FROM crm_lead_meetings
        WHERE sales_employee_id = ? AND check_in_at IS NOT NULL AND DATE(check_in_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    const [[{ quotationsSent }]] = await pool.query(
      `SELECT COUNT(*) AS quotationsSent FROM crm_lead_quotations
        WHERE created_by = ? AND status <> 'CANCELLED' AND DATE(sent_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    const [[{ leadsConverted }]] = await pool.query(
      `SELECT COUNT(DISTINCT lead_id) AS leadsConverted FROM crm_lead_conversions
        WHERE converted_by = ? AND DATE(converted_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    const [[{ leadsLost }]] = await pool.query(
      `SELECT COUNT(DISTINCT lead_id) AS leadsLost FROM crm_lead_history
        WHERE action = 'MARK_LOST' AND changed_by = ? AND DATE(changed_at) BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    // Follow-ups due: Task Management tasks created from this module
    // (source_module='LEAD', task_type='LEAD_FOLLOW_UP') due in the period.
    const [[{ followUpsDue }]] = await pool.query(
      `SELECT COUNT(*) AS followUpsDue FROM work_tasks
        WHERE assigned_to = ? AND source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND due_date BETWEEN ? AND ?`,
      [employeeId, from, to]
    );

    res.json({
      employeeId,
      from,
      to,
      leadsGenerated: Number(leadsGenerated),
      genuineLeads: Number(genuineLeads),
      meetingsScheduled: Number(meetingsScheduled),
      visitsCompleted: Number(visitsCompleted),
      locationsVisited: Number(locationsVisited),
      quotationsSent: Number(quotationsSent),
      leadsConverted: Number(leadsConverted),
      leadsLost: Number(leadsLost),
      followUpsDue: Number(followUpsDue),
    });
  } catch (err) {
    sendError(res, err, "Failed to load sales performance report");
  }
});

// ---------------------------------------------------------------------------
// Monthly sales targets (crm_sales_targets). The sales manager sets what each sales executive should
// convert in a month; achieved = the amounts of the commercial leads that person converted that
// month (the lead's sales person, or whoever converted it when it had none).
//
// GET /api/crm/targets?month=YYYY-MM -> [{ user_id, name, role, target, achieved, converted }]
//   the sales manager / admin: every sales executive and sales manager; anyone else: themselves.
// PUT /api/crm/targets/:userId { month, target_amount } -- sales manager / admin only;
//   0 or empty removes the target.
// ---------------------------------------------------------------------------
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => today().slice(0, 7);
const canSetTargets = (req) => req.user.role === "admin" || hasPerm(req, "MANAGE_LEADS");

router.get("/targets", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const month = req.query.month ? String(req.query.month) : thisMonth();
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const everyone = canSetTargets(req);
    const [people] = await pool.query(
      `SELECT DISTINCT u.id, u.name, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE ${everyone ? "u.is_active = 1 AND r.name IN (?)" : "u.id = ?"}
        ORDER BY u.name ASC`,
      [everyone ? LEAD_ASSIGNEE_ROLES : Number(req.user.id)]
    );
    if (people.length === 0) return res.json([]);
    const ids = people.map((p) => p.id);
    const [targets] = await pool.query(
      "SELECT user_id, target_amount FROM crm_sales_targets WHERE month = ? AND user_id IN (?)",
      [month, ids]
    );
    const [won] = await pool.query(
      `SELECT COALESCE(l.assigned_sales_employee_id, c.converted_by) AS user_id,
              COUNT(*) AS converted, COALESCE(SUM(l.amount), 0) AS achieved
         FROM crm_lead_conversions c JOIN crm_leads l ON l.id = c.lead_id
        WHERE DATE_FORMAT(c.converted_at, '%Y-%m') = ?
          AND COALESCE(l.assigned_sales_employee_id, c.converted_by) IN (?)
        GROUP BY COALESCE(l.assigned_sales_employee_id, c.converted_by)`,
      [month, ids]
    );
    const targetOf = new Map(targets.map((t) => [Number(t.user_id), Number(t.target_amount)]));
    const wonOf = new Map(won.map((w) => [Number(w.user_id), w]));
    res.json(
      people.map((p) => ({
        user_id: p.id,
        name: p.name,
        role: p.role,
        month,
        target: targetOf.get(Number(p.id)) ?? null,
        achieved: Number(wonOf.get(Number(p.id))?.achieved || 0),
        converted: Number(wonOf.get(Number(p.id))?.converted || 0),
      }))
    );
  } catch (err) {
    sendError(res, err, "Failed to load targets");
  }
});

router.put("/targets/:userId", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    if (!canSetTargets(req)) throw new HttpError(403, "Only the sales manager can set targets");
    const userId = parseId(req.params.userId);
    const month = String(req.body?.month || "");
    if (!userId) throw new HttpError(400, "Invalid person");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const raw = req.body?.target_amount;
    const amount = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999) throw new HttpError(400, "Enter a valid target amount");
    const [[person]] = await pool.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_active = 1 AND r.name IN (?)",
      [userId, LEAD_ASSIGNEE_ROLES]
    );
    if (!person) throw new HttpError(400, "Targets are set for sales executives and sales managers");
    if (amount === 0) {
      await pool.query("DELETE FROM crm_sales_targets WHERE user_id = ? AND month = ?", [userId, month]);
    } else {
      await pool.query(
        `INSERT INTO crm_sales_targets (user_id, month, target_amount, set_by) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount), set_by = VALUES(set_by)`,
        [userId, month, amount, req.user.id]
      );
    }
    res.json({ user_id: userId, month, target: amount || null });
  } catch (err) {
    sendError(res, err, "Failed to save the target");
  }
});

module.exports = router;
