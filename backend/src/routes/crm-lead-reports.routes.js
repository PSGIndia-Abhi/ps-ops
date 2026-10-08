const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { isValidDate, hasPerm, resolveVisibleUserIds } = require("../utils/crmLeadManagement");

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
        WHERE created_by = ? AND DATE(sent_at) BETWEEN ? AND ?`,
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

module.exports = router;
