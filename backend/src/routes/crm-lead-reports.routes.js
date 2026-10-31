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

// The period a report covers: ?from / ?to (YYYY-MM-DD, both days included; this month by default).
function reportPeriod(req) {
  const from = req.query.from || firstDayOfThisMonth();
  const to = req.query.to || today();
  if (!isValidDate(from)) throw new HttpError(400, "from must be a valid date (YYYY-MM-DD)");
  if (!isValidDate(to)) throw new HttpError(400, "to must be a valid date (YYYY-MM-DD)");
  if (to < from) throw new HttpError(400, "to cannot be before from");
  return { from, to };
}

// Whose numbers a report is for: the signed-in person, or ?employeeId. Someone else's needs
// VIEW_TEAM_LEADS / MANAGE_LEADS (and that person in the requester's team), or VIEW_ALL_LEADS /
// admin for anyone company-wide.
async function reportSubject(req) {
  const employeeId = parseId(req.query.employeeId);
  if (employeeId === null || employeeId === Number(req.user.id) || req.user.role === "admin") {
    return employeeId ?? Number(req.user.id);
  }
  if (!hasPerm(req, "VIEW_TEAM_LEADS") && !hasPerm(req, "MANAGE_LEADS") && !hasPerm(req, "VIEW_ALL_LEADS")) {
    throw new HttpError(403, "You cannot view this person's performance");
  }
  if (!hasPerm(req, "VIEW_ALL_LEADS")) {
    const visibleIds = await resolveVisibleUserIds(pool, req);
    if (visibleIds !== null && !visibleIds.includes(employeeId)) {
      throw new HttpError(403, "You cannot view this person's performance");
    }
  }
  return employeeId;
}

// What a converted lead is worth: its closure amount - the deal amount entered when it was
// converted, which convert-to-customer saves as the lead's amount (crm-lead-quotations.routes.js).
// Only when that is empty does it fall back to the latest quotation's final total. Needs the lead as `l`.
const LEAD_VALUE_SQL = `COALESCE(NULLIF(l.amount, 0), (SELECT q.total_amount FROM crm_lead_quotations q
  WHERE q.lead_id = l.id AND q.status <> 'CANCELLED' ORDER BY q.sent_at DESC, q.created_at DESC LIMIT 1), 0)`;
// One row per converted lead: who it counts for (the lead's sales person, or whoever converted it
// when it had none), when it was converted and what it is worth. Targets, the Converted number and
// the achievement history all read this, so they always agree.
const CONVERTED_LEADS_SQL = `SELECT c.lead_id, COALESCE(l.assigned_sales_employee_id, c.converted_by) AS user_id,
    MAX(c.converted_at) AS converted_at, MAX(${LEAD_VALUE_SQL}) AS value
  FROM crm_lead_conversions c JOIN crm_leads l ON l.id = c.lead_id
  GROUP BY c.lead_id, COALESCE(l.assigned_sales_employee_id, c.converted_by)`;

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
    const { from, to } = reportPeriod(req);
    const employeeId = await reportSubject(req);
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

    // Converted: the leads that count for them (the same rule as their target).
    const [[{ leadsConverted }]] = await pool.query(
      `SELECT COUNT(*) AS leadsConverted FROM (${CONVERTED_LEADS_SQL}) w
        WHERE w.user_id = ? AND DATE(w.converted_at) BETWEEN ? AND ?`,
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
// GET /api/crm/reports/sales-performance/items?metric=leadsConverted&from=&to=&employeeId=
//   -> { metric, items: [{ lead_id, lead_number, company, contact, stage, at, detail, amount }] }
//      (leadsConverted items also carry contract_type: ONE_TIME | AMC | null)
// The records behind one number of the report above, by the same rules, so a list always matches
// its number. Same period and permission rules as the report. Newest first, at most 500.
// ---------------------------------------------------------------------------
const MEETING_TYPES = { SITE_VISIT: "Site visit", OFFICE_MEETING: "Office meeting", OFFICE: "Office meeting", CALL: "Call" };
const pretty = (code) => String(code || "").toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const PERFORMANCE_ITEMS = {
  leadsGenerated: `SELECT l.id AS lead_id, l.created_at AS at, NULL AS a, NULL AS b, l.amount AS amount
      FROM crm_leads l WHERE l.lead_type = 'commercial' AND l.created_by_user_id = ? AND DATE(l.created_at) BETWEEN ? AND ?`,
  genuineLeads: `SELECT h.lead_id, MAX(h.changed_at) AS at, NULL AS a, NULL AS b, NULL AS amount
      FROM crm_lead_history h WHERE h.action = 'QUALIFY' AND h.note LIKE 'Marked GENUINE%' AND h.changed_by = ? AND DATE(h.changed_at) BETWEEN ? AND ?
      GROUP BY h.lead_id`,
  meetingsScheduled: `SELECT m.lead_id, m.scheduled_at AS at, m.meeting_type AS a, m.status AS b, NULL AS amount
      FROM crm_lead_meetings m WHERE m.sales_employee_id = ? AND DATE(m.created_at) BETWEEN ? AND ?`,
  visitsCompleted: `SELECT m.lead_id, COALESCE(m.check_out_at, m.updated_at) AS at, m.meeting_type AS a, m.outcome_notes AS b, NULL AS amount
      FROM crm_lead_meetings m WHERE m.sales_employee_id = ? AND m.status = 'COMPLETED' AND DATE(m.updated_at) BETWEEN ? AND ?`,
  quotationsSent: `SELECT q.lead_id, q.sent_at AS at, q.quotation_number AS a, NULL AS b, q.total_amount AS amount
      FROM crm_lead_quotations q WHERE q.created_by = ? AND q.status <> 'CANCELLED' AND DATE(q.sent_at) BETWEEN ? AND ?`,
  followUpsDue: `SELECT t.source_id AS lead_id, TIMESTAMP(t.due_date, COALESCE(t.due_time, '00:00:00')) AS at, t.status AS a, NULL AS b, NULL AS amount
      FROM work_tasks t WHERE t.assigned_to = ? AND t.source_module = 'LEAD' AND t.task_type = 'LEAD_FOLLOW_UP' AND t.due_date BETWEEN ? AND ?`,
  // a = One-time or AMC: chosen at conversion, else the latest standing quotation's choice, else NULL
  leadsConverted: `SELECT w.lead_id, w.converted_at AS at,
        COALESCE((SELECT c2.contract_type FROM crm_lead_conversions c2 WHERE c2.lead_id = w.lead_id),
          (SELECT JSON_UNQUOTE(JSON_EXTRACT(d.content, '$.contractType'))
             FROM crm_lead_quotations q JOIN crm_lead_quotation_documents d ON d.quotation_id = q.id
            WHERE q.lead_id = w.lead_id AND q.status <> 'CANCELLED'
              AND JSON_UNQUOTE(JSON_EXTRACT(d.content, '$.contractType')) IN ('ONE_TIME', 'AMC')
            ORDER BY q.created_at DESC LIMIT 1)) AS a,
        NULL AS b, w.value AS amount
      FROM (${CONVERTED_LEADS_SQL}) w WHERE w.user_id = ? AND DATE(w.converted_at) BETWEEN ? AND ?`,
  leadsLost: `SELECT h.lead_id, MAX(h.changed_at) AS at, NULL AS a, NULL AS b, NULL AS amount
      FROM crm_lead_history h WHERE h.action = 'MARK_LOST' AND h.changed_by = ? AND DATE(h.changed_at) BETWEEN ? AND ?
      GROUP BY h.lead_id`,
};
// The short line under each record.
function itemDetail(metric, row) {
  if (metric === "meetingsScheduled") return [MEETING_TYPES[row.a] || pretty(row.a), pretty(row.b)].filter(Boolean).join(" · ");
  if (metric === "visitsCompleted") return [MEETING_TYPES[row.a] || pretty(row.a), row.b].filter(Boolean).join(" · ");
  if (metric === "quotationsSent") return row.a || "";
  if (metric === "followUpsDue") return row.a === "COMPLETED" ? "Done" : "Open";
  if (metric === "leadsLost") return row.loss_reason || "";
  return "";
}

router.get("/reports/sales-performance/items", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const metric = String(req.query.metric || "");
    const sql = PERFORMANCE_ITEMS[metric];
    if (!sql) throw new HttpError(400, "Unknown metric");
    const { from, to } = reportPeriod(req);
    const employeeId = await reportSubject(req);
    const [rows] = await pool.query(
      `SELECT x.lead_id, x.at, x.a, x.b, x.amount, ld.lead_number, ld.company_name, ld.customer_name, ld.pipeline_stage,
              lr.name AS loss_reason
         FROM (${sql}) x
         JOIN crm_leads ld ON ld.id = x.lead_id
         LEFT JOIN crm_lead_loss_reasons lr ON lr.id = ld.loss_reason_id
        ORDER BY x.at DESC LIMIT 500`,
      [employeeId, from, to]
    );
    res.json({
      metric,
      items: rows.map((r) => ({
        lead_id: r.lead_id,
        lead_number: r.lead_number || null,
        company: r.company_name || r.customer_name || "",
        contact: r.customer_name || "",
        stage: r.pipeline_stage || null,
        at: r.at,
        detail: itemDetail(metric, r),
        amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
        // converted leads only: "ONE_TIME" | "AMC" | null (not known)
        ...(metric === "leadsConverted" ? { contract_type: r.a === "ONE_TIME" || r.a === "AMC" ? r.a : null } : {}),
      })),
    });
  } catch (err) {
    sendError(res, err, "Failed to load the records");
  }
});

// ---------------------------------------------------------------------------
// Monthly sales targets (crm_sales_targets). The sales manager sets what each sales executive should
// convert in a month; achieved = what the commercial leads that person converted that month are
// worth (see CONVERTED_LEADS_SQL: the final quotation amount, else the approximate quote).
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
      `SELECT w.user_id, COUNT(*) AS converted, COALESCE(SUM(w.value), 0) AS achieved
         FROM (${CONVERTED_LEADS_SQL}) w
        WHERE DATE_FORMAT(w.converted_at, '%Y-%m') = ? AND w.user_id IN (?)
        GROUP BY w.user_id`,
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

// ---------------------------------------------------------------------------
// GET /api/crm/targets/history?userId=102&months=6
//   -> { months: [{ month, target, achieved, converted }], lifetime: { achieved, converted, since } }
// One sales person's achievement: the last few months (oldest first, this month last) against
// their targets, and everything they have converted so far. The sales manager / admin may read
// anyone's; everyone else only their own.
// ---------------------------------------------------------------------------
router.get("/targets/history", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const userId = parseId(req.query.userId) ?? Number(req.user.id);
    if (userId !== Number(req.user.id) && !canSetTargets(req)) throw new HttpError(403, "You cannot view this person's achievement");
    const count = Math.min(24, Math.max(1, Number(req.query.months) || 6));
    const [y, m] = thisMonth().split("-").map(Number);
    const months = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(y, m - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const [targets] = await pool.query(
      "SELECT month, target_amount FROM crm_sales_targets WHERE user_id = ? AND month IN (?)",
      [userId, months]
    );
    const [won] = await pool.query(
      `SELECT DATE_FORMAT(w.converted_at, '%Y-%m') AS month, COUNT(*) AS converted, COALESCE(SUM(w.value), 0) AS achieved
         FROM (${CONVERTED_LEADS_SQL}) w
        WHERE w.user_id = ? AND DATE_FORMAT(w.converted_at, '%Y-%m') IN (?)
        GROUP BY DATE_FORMAT(w.converted_at, '%Y-%m')`,
      [userId, months]
    );
    const [[life]] = await pool.query(
      `SELECT COUNT(*) AS converted, COALESCE(SUM(w.value), 0) AS achieved, MIN(w.converted_at) AS since
         FROM (${CONVERTED_LEADS_SQL}) w WHERE w.user_id = ?`,
      [userId]
    );
    const targetOf = new Map(targets.map((t) => [t.month, Number(t.target_amount)]));
    const wonOf = new Map(won.map((w) => [w.month, w]));
    res.json({
      user_id: userId,
      months: months.map((month) => ({
        month,
        target: targetOf.get(month) ?? null,
        achieved: Number(wonOf.get(month)?.achieved || 0),
        converted: Number(wonOf.get(month)?.converted || 0),
      })),
      lifetime: { achieved: Number(life.achieved || 0), converted: Number(life.converted || 0), since: life.since || null },
    });
  } catch (err) {
    sendError(res, err, "Failed to load the achievement");
  }
});

module.exports = router;
