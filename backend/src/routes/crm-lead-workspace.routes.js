const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { hasPerm, resolveVisibleUserIds } = require("../utils/crmLeadManagement");

function sendError(res, err, fallback) {
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

// Same cap the lead list itself uses (GET /api/crm/leads).
const LEAD_LIMIT = 500;

// DATETIME columns are read back as plain wall-clock strings, never raw Date
// objects (the mysql2 timezone-shift gotcha noted throughout this module).
const dt = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

// ---------------------------------------------------------------------------
// GET /api/crm/lead-workspace -- everything the web Lead Management area shows
// for the signed-in internal user, in one read:
//
//   leads       the commercial leads they may see (the exact visibility rule
//               GET /api/crm/leads?lead_type=commercial applies), each with
//               its loss reason, latest provider feedback and next open
//               follow-up
//   meetings    every meeting on those leads
//   activities  the history of those leads
//   people      id / name / role for everyone those rows refer to, plus who
//               a meeting can be given to (can_visit) -- names only
//   providers   lead provider organisations, for whoever manages leads
//
// Read-only. The web screens were built around one data set like this; the
// per-item endpoints (meetings/today, leads/:id/timeline, ...) stay as they
// are for the mobile app. Lead providers have no CRM_VIEW_LEAD and use
// /api/crm/provider/* instead, which never exposes any of this.
// ---------------------------------------------------------------------------
router.get("/lead-workspace", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const where = ["l.lead_type = 'commercial'"];
    const params = [];
    const visibleIds = await resolveVisibleUserIds(pool, req);
    if (visibleIds !== null) {
      where.push("(l.created_by_user_id IN (?) OR l.assigned_telecaller_id IN (?) OR l.assigned_sales_employee_id IN (?))");
      params.push(visibleIds, visibleIds, visibleIds);
    }

    const [leadRows] = await pool.query(
      `SELECT l.id, l.lead_number, l.company_name, l.customer_name, l.phone, l.alternate_phone, l.customer_email,
              l.location, l.lead_source, l.amount, l.notes, l.pipeline_stage, l.row_version,
              l.provider_id, l.created_by_user_id, l.assigned_telecaller_id, l.assigned_sales_employee_id,
              l.created_at, l.updated_at, lr.name AS loss_reason
         FROM crm_leads l
         LEFT JOIN crm_lead_loss_reasons lr ON lr.id = l.loss_reason_id
        WHERE ${where.join(" AND ")}
        ORDER BY l.created_at DESC
        LIMIT ${LEAD_LIMIT}`,
      params
    );
    const leadIds = leadRows.map((l) => l.id);

    let meetings = [];
    let history = [];
    let feedback = [];
    let followUps = [];
    if (leadIds.length > 0) {
      [[meetings], [history], [feedback], [followUps]] = await Promise.all([
        pool.query(
          `SELECT id, lead_id, sales_employee_id, ${dt("scheduled_at")} AS scheduled_at, meeting_type, meeting_address,
                  notes, status, ${dt("check_in_at")} AS check_in_at, ${dt("check_out_at")} AS check_out_at, outcome_notes
             FROM crm_lead_meetings WHERE lead_id IN (?) ORDER BY scheduled_at ASC`,
          [leadIds]
        ),
        pool.query(
          `SELECT h.id, h.lead_id, h.action, h.note, h.changed_at, h.changed_by, u.name AS changed_by_name
             FROM crm_lead_history h LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.lead_id IN (?) ORDER BY h.id ASC`,
          [leadIds]
        ),
        pool.query("SELECT lead_id, message FROM crm_lead_feedback WHERE lead_id IN (?) ORDER BY created_at ASC", [leadIds]),
        // The earliest still-open follow-up is the lead's "next follow-up".
        pool.query(
          `SELECT source_id AS lead_id, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time
             FROM work_tasks
            WHERE source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND status IN ('OPEN','IN_PROGRESS','PAUSED')
              AND due_date IS NOT NULL AND source_id IN (?)
            ORDER BY due_date ASC, due_time ASC`,
          [leadIds]
        ),
      ]);
    }

    const latestFeedback = new Map();
    for (const f of feedback) latestFeedback.set(f.lead_id, f.message); // ascending, so the last one wins
    const nextFollowUp = new Map();
    for (const t of followUps) {
      if (!nextFollowUp.has(t.lead_id)) nextFollowUp.set(t.lead_id, `${t.due_date} ${t.due_time || "09:00:00"}`);
    }

    const leads = leadRows.map((l) => ({
      id: l.id,
      lead_number: l.lead_number || null,
      company_name: l.company_name || "",
      customer_name: l.customer_name,
      phone: l.phone,
      alternate_phone: l.alternate_phone || "",
      email: l.customer_email || "",
      location: l.location || "",
      lead_source: l.lead_source || null,
      amount: Number(l.amount),
      notes: l.notes || "",
      pipeline_stage: l.pipeline_stage || null,
      row_version: Number(l.row_version),
      provider_id: l.provider_id === null ? null : String(l.provider_id),
      created_by_user_id: l.created_by_user_id === null ? null : String(l.created_by_user_id),
      assigned_telecaller_id: l.assigned_telecaller_id === null ? null : String(l.assigned_telecaller_id),
      assigned_sales_employee_id: l.assigned_sales_employee_id === null ? null : String(l.assigned_sales_employee_id),
      loss_reason: l.loss_reason || null,
      latest_feedback: latestFeedback.get(l.id) || null,
      next_follow_up_at: nextFollowUp.get(l.id) || null,
      created_at: l.created_at,
      updated_at: l.updated_at,
    }));

    // Everyone the rows above mention, plus everyone who can work a lead.
    const mentioned = new Set([Number(req.user.id)]);
    for (const l of leadRows) {
      for (const id of [l.provider_id, l.created_by_user_id, l.assigned_telecaller_id, l.assigned_sales_employee_id]) {
        if (id !== null && id !== undefined) mentioned.add(Number(id));
      }
    }
    for (const m of meetings) mentioned.add(Number(m.sales_employee_id));
    const [peopleRows] = await pool.query(
      `SELECT u.id, u.name, r.name AS role,
              MAX(CASE WHEN p.name = 'CRM_VIEW_LEAD' THEN 1 ELSE 0 END) AS works_leads
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id AND p.name = 'CRM_VIEW_LEAD'
        WHERE u.id IN (?) OR (u.is_active = 1 AND p.name = 'CRM_VIEW_LEAD')
        GROUP BY u.id, u.name, r.name
        ORDER BY u.name ASC`,
      [[...mentioned]]
    );
    const people = peopleRows.map((u) => ({
      id: String(u.id),
      name: u.name,
      role: u.role || null,
      // Same rule as GET /api/crm/sales-employees: can work a lead, and is not a telecaller.
      can_visit: Number(u.works_leads) === 1 && u.role !== "telecaller",
    }));
    const me = people.find((u) => u.id === String(req.user.id)) || { id: String(req.user.id), name: "", role: req.user.role };

    let providers = [];
    if (hasPerm(req, "MANAGE_LEADS") || hasPerm(req, "VIEW_ALL_LEADS")) {
      const [rows] = await pool.query(
        `SELECT pp.user_id, pp.organization_name, pp.is_active, u.name, u.email, u.phone
           FROM crm_lead_provider_profiles pp JOIN users u ON u.id = pp.user_id
          ORDER BY pp.organization_name ASC`
      );
      providers = rows.map((p) => ({
        user_id: String(p.user_id),
        organization_name: p.organization_name,
        contact_name: p.name,
        email: p.email,
        phone: p.phone || "",
        is_active: Number(p.is_active) === 1,
      }));
    }

    res.json({
      me: { id: me.id, name: me.name, role: req.user.role, can_manage: hasPerm(req, "MANAGE_LEADS"), can_convert: hasPerm(req, "CONVERT_LEAD") },
      leads,
      meetings: meetings.map((m) => ({ ...m, sales_employee_id: String(m.sales_employee_id) })),
      activities: history.map((h) => ({
        id: String(h.id),
        lead_id: h.lead_id,
        action: h.action,
        note: h.note || "",
        changed_at: h.changed_at,
        changed_by: h.changed_by === null ? null : String(h.changed_by),
        changed_by_name: h.changed_by_name || "",
      })),
      people,
      providers,
    });
  } catch (err) {
    sendError(res, err, "Failed to load the lead workspace");
  }
});

module.exports = router;
