const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, hasPerm, resolveVisibleUserIds, isOwnLead,
} = require("../utils/crmLeadManagement");
const { logHistory: logTaskHistory } = require("../utils/workTasks");

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

// Reads a date-time the way the rest of this app does: the wall-clock value
// as written, never shifted by a timezone conversion. Any trailing offset
// (+05:30, Z, ...) is accepted and ignored -- what's stored is exactly the
// date and time the caller typed.
function parseLocalDateTime(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , s] = m;
  const date = `${y}-${mo}-${d}`;
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) return null;
  if (Number(h) > 23 || Number(mi) > 59) return null;
  const time = `${h}:${mi}:${s || "00"}`;
  return { date, time, sql: `${date} ${time}` };
}

const MEETING_TYPES = ["SITE_VISIT", "OFFICE"];
const ACTIVE_MEETING_STAGES = ["NEW", "TO_CALL", "QUALIFIED", "NEED_MORE_INFO", "MEETING_SCHEDULED", "VISIT_COMPLETED", "QUOTATION_SENT"];

// A commercial lead the requester may act on (same visibility rule as crm-lead-management.routes.js).
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

// mysql2 returns DATETIME columns as JS Date objects that shift by the
// server's timezone when serialised to JSON (the same gotcha documented in
// hierarchy.js/workTasks.js) -- every read formats them as plain strings instead.
const MEETING_COLUMNS = `
  id, lead_id, sales_employee_id,
  DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
  meeting_type, meeting_address, notes, status,
  DATE_FORMAT(check_in_at, '%Y-%m-%d %H:%i:%s') AS check_in_at, check_in_lat, check_in_lng,
  DATE_FORMAT(check_out_at, '%Y-%m-%d %H:%i:%s') AS check_out_at, check_out_lat, check_out_lng,
  outcome_notes, task_id, created_at, updated_at
`;

async function loadMeeting(id) {
  const [[row]] = await pool.query(`SELECT ${MEETING_COLUMNS} FROM crm_lead_meetings WHERE id = ?`, [id]);
  return row || null;
}
// A meeting the requester may see: they're the sales rep on it, or they can
// see the lead it belongs to (own lead, team, or company-wide).
async function loadVisibleMeeting(req, meetingId) {
  const meeting = await loadMeeting(meetingId);
  if (!meeting) throw new HttpError(404, "Meeting not found");
  if (Number(meeting.sales_employee_id) === Number(req.user.id) || req.user.role === "admin") return meeting;
  const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [meeting.lead_id]);
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && lead && !isOwnLead(lead, req.user.id) && !visibleIds.some((id) => isOwnLead(lead, id))) {
    throw new HttpError(404, "Meeting not found");
  }
  return meeting;
}

// ---------------------------------------------------------------------------
// GET /api/crm/sales-employees -- who a meeting can be assigned to. Scheduling
// needs a salesEmployeeId, but a telecaller has no VIEW_USER (so no
// GET /api/users) and nobody below them in the hierarchy (so GET
// /api/users/me/team is empty). This returns only what the picker shows --
// id, name, role -- for active users whose role can work a lead
// (CRM_VIEW_LEAD, which check-in/complete require anyway). Telecallers are
// left out: they verify leads, they don't visit customers.
// ---------------------------------------------------------------------------
router.get("/sales-employees", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT u.id, u.name, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE u.is_active = 1 AND p.name = 'CRM_VIEW_LEAD' AND r.name <> 'telecaller'
        ORDER BY u.name ASC`
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load sales employees");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/meetings -- schedule a sales meeting/site visit.
// Also creates the linked Task Management follow-up (source_module='LEAD',
// task_type='LEAD_MEETING'), in the same transaction as the meeting row.
// ---------------------------------------------------------------------------
router.post("/leads/:id/meetings", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot schedule a meeting for this lead");
    if (!ACTIVE_MEETING_STAGES.includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot schedule a meeting for a lead that is ${lead.pipeline_stage}`);
    }

    const body = req.body || {};
    const salesEmployeeId = parseId(body.salesEmployeeId);
    if (!salesEmployeeId) throw new HttpError(400, "salesEmployeeId is required");
    const [[employee]] = await pool.query("SELECT id, name FROM users WHERE id = ? AND is_active = 1", [salesEmployeeId]);
    if (!employee) throw new HttpError(400, "Invalid salesEmployeeId");

    const scheduled = parseLocalDateTime(body.scheduledAt);
    if (!scheduled) throw new HttpError(400, "scheduledAt is required (YYYY-MM-DDTHH:MM)");
    const meetingType = body.meetingType ? String(body.meetingType).toUpperCase() : "SITE_VISIT";
    if (!MEETING_TYPES.includes(meetingType)) throw new HttpError(400, `meetingType must be one of ${MEETING_TYPES.join(", ")}`);
    const meetingAddress = optionalText(body.meetingAddress, 255);
    if (meetingAddress === false) throw new HttpError(400, "meetingAddress is too long (max 255 characters)");
    const notes = optionalText(body.notes, 2000);
    if (notes === false) throw new HttpError(400, "notes is too long (max 2000 characters)");

    const meetingId = uuid();
    const taskId = uuid();
    const taskTitle = `${meetingType === "SITE_VISIT" ? "Site visit" : "Meeting"} - ${lead.company_name || lead.customer_name}`.slice(0, 200);

    await inTransaction(async (conn) => {
      // work_tasks must exist before crm_lead_meetings.task_id can reference it.
      await conn.query(
        `INSERT INTO work_tasks (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
         VALUES (?, ?, ?, 'LEAD_MEETING', 'NORMAL', 'LEAD', ?, ?, ?, ?, ?)`,
        [taskId, taskTitle, notes, lead.id, salesEmployeeId, req.user.id, scheduled.date, scheduled.time]
      );
      await logTaskHistory(conn, taskId, "CREATE", { toStatus: "OPEN", changedBy: req.user.id, note: "Created from a scheduled lead meeting" });

      await conn.query(
        `INSERT INTO crm_lead_meetings
           (id, lead_id, sales_employee_id, scheduled_at, meeting_type, meeting_address, notes, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [meetingId, lead.id, salesEmployeeId, scheduled.sql, meetingType, meetingAddress || lead.location, notes, taskId]
      );

      await conn.query(
        `UPDATE crm_leads SET pipeline_stage = 'MEETING_SCHEDULED', assigned_sales_employee_id = ?, row_version = row_version + 1 WHERE id = ?`,
        [salesEmployeeId, lead.id]
      );
      await logLeadHistory(conn, lead.id, "MEETING_SCHEDULED", {
        note: `Meeting scheduled with ${employee.name} for ${scheduled.sql}`, changedBy: req.user.id,
      });
    });

    const meeting = await loadMeeting(meetingId);
    res.status(201).json(meeting);
  } catch (err) {
    sendError(res, err, "Failed to schedule meeting");
  }
});

// GET /api/crm/meetings/today -- the logged-in sales employee's own meetings for today.
router.get("/meetings/today", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${MEETING_COLUMNS} FROM crm_lead_meetings WHERE sales_employee_id = ? AND DATE(scheduled_at) = CURDATE() AND status <> 'CANCELLED' ORDER BY scheduled_at ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load today's meetings");
  }
});

// GET /api/crm/meetings/upcoming -- the logged-in sales employee's own future, still-scheduled meetings.
router.get("/meetings/upcoming", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${MEETING_COLUMNS} FROM crm_lead_meetings WHERE sales_employee_id = ? AND scheduled_at > NOW() AND status = 'SCHEDULED' ORDER BY scheduled_at ASC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load upcoming meetings");
  }
});

// GET /api/crm/meetings/:id
router.get("/meetings/:id", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const meeting = await loadVisibleMeeting(req, req.params.id);
    res.json(meeting);
  } catch (err) {
    sendError(res, err, "Failed to load meeting");
  }
});

// PATCH /api/crm/meetings/:id/reschedule
router.patch("/meetings/:id/reschedule", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const meeting = await loadVisibleMeeting(req, req.params.id);
    const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [meeting.lead_id]);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot reschedule this meeting");
    if (meeting.status !== "SCHEDULED") throw new HttpError(400, `Cannot reschedule a meeting that is ${meeting.status}`);

    const scheduled = parseLocalDateTime(req.body?.scheduledAt);
    if (!scheduled) throw new HttpError(400, "scheduledAt is required (YYYY-MM-DDTHH:MM)");
    const reason = optionalText(req.body?.reason, 500);

    await inTransaction(async (conn) => {
      await conn.query("UPDATE crm_lead_meetings SET scheduled_at = ?, status = 'RESCHEDULED' WHERE id = ?", [scheduled.sql, meeting.id]);
      await conn.query("UPDATE crm_lead_meetings SET status = 'SCHEDULED' WHERE id = ?", [meeting.id]);
      if (meeting.task_id) {
        await conn.query("UPDATE work_tasks SET due_date = ?, due_time = ? WHERE id = ?", [scheduled.date, scheduled.time, meeting.task_id]);
        await logTaskHistory(conn, meeting.task_id, "RESCHEDULE", { note: `Meeting moved to ${scheduled.sql}${reason ? `: ${reason}` : ""}`, changedBy: req.user.id });
      }
      await logLeadHistory(conn, meeting.lead_id, "MEETING_RESCHEDULED", { note: `Moved to ${scheduled.sql}${reason ? `: ${reason}` : ""}`, changedBy: req.user.id });
    });
    res.json(await loadMeeting(meeting.id));
  } catch (err) {
    sendError(res, err, "Failed to reschedule meeting");
  }
});

// POST /api/crm/meetings/:id/check-in -- only the assigned sales employee, like starting a task.
router.post("/meetings/:id/check-in", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const meeting = await loadVisibleMeeting(req, req.params.id);
    if (req.user.role !== "admin" && Number(meeting.sales_employee_id) !== Number(req.user.id)) {
      throw new HttpError(403, "Only the assigned sales employee can check in");
    }
    if (meeting.status !== "SCHEDULED") throw new HttpError(400, `Cannot check in to a meeting that is ${meeting.status}`);
    if (meeting.check_in_at) throw new HttpError(400, "Already checked in");

    const lat = req.body?.lat !== undefined ? Number(req.body.lat) : null;
    const lng = req.body?.lng !== undefined ? Number(req.body.lng) : null;
    if ((lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
      throw new HttpError(400, "lat/lng must be valid coordinates");
    }

    await inTransaction(async (conn) => {
      await conn.query("UPDATE crm_lead_meetings SET check_in_at = NOW(), check_in_lat = ?, check_in_lng = ? WHERE id = ?", [lat, lng, meeting.id]);
      await logLeadHistory(conn, meeting.lead_id, "VISIT_CHECK_IN", { note: lat !== null ? `at ${lat},${lng}` : null, changedBy: req.user.id });
    });
    res.json(await loadMeeting(meeting.id));
  } catch (err) {
    sendError(res, err, "Failed to check in");
  }
});

// POST /api/crm/meetings/:id/complete -- save the visit outcome. Moves the
// lead's pipeline_stage to VISIT_COMPLETED.
router.post("/meetings/:id/complete", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const meeting = await loadVisibleMeeting(req, req.params.id);
    if (req.user.role !== "admin" && Number(meeting.sales_employee_id) !== Number(req.user.id)) {
      throw new HttpError(403, "Only the assigned sales employee can complete this meeting");
    }
    if (meeting.status !== "SCHEDULED") throw new HttpError(400, `Cannot complete a meeting that is ${meeting.status}`);

    const outcomeNotes = optionalText(req.body?.outcomeNotes, 2000);
    const lat = req.body?.checkOutLat !== undefined ? Number(req.body.checkOutLat) : null;
    const lng = req.body?.checkOutLng !== undefined ? Number(req.body.checkOutLng) : null;

    await inTransaction(async (conn) => {
      await conn.query(
        "UPDATE crm_lead_meetings SET status = 'COMPLETED', outcome_notes = ?, check_out_at = NOW(), check_out_lat = ?, check_out_lng = ? WHERE id = ? AND status = 'SCHEDULED'",
        [outcomeNotes, lat, lng, meeting.id]
      );
      if (meeting.task_id) await logTaskHistory(conn, meeting.task_id, "COMPLETE", { toStatus: "COMPLETED", changedBy: req.user.id, note: outcomeNotes });
      await conn.query("UPDATE work_tasks SET status = 'COMPLETED', completed_at = NOW(), completed_by = ?, completion_note = ? WHERE id = ? AND status IN ('OPEN','IN_PROGRESS')", [req.user.id, outcomeNotes, meeting.task_id]);
      await conn.query("UPDATE crm_leads SET pipeline_stage = 'VISIT_COMPLETED', row_version = row_version + 1 WHERE id = ?", [meeting.lead_id]);
      await logLeadHistory(conn, meeting.lead_id, "VISIT_COMPLETED", { note: outcomeNotes, changedBy: req.user.id });
    });
    res.json(await loadMeeting(meeting.id));
  } catch (err) {
    sendError(res, err, "Failed to complete meeting");
  }
});

// POST /api/crm/meetings/:id/cancel
router.post("/meetings/:id/cancel", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const meeting = await loadVisibleMeeting(req, req.params.id);
    const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [meeting.lead_id]);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot cancel this meeting");
    if (meeting.status !== "SCHEDULED") throw new HttpError(400, `Cannot cancel a meeting that is ${meeting.status}`);
    const reason = optionalText(req.body?.reason, 500);
    if (!reason) throw new HttpError(400, "reason is required");

    await inTransaction(async (conn) => {
      await conn.query("UPDATE crm_lead_meetings SET status = 'CANCELLED' WHERE id = ? AND status = 'SCHEDULED'", [meeting.id]);
      if (meeting.task_id) {
        await conn.query("UPDATE work_tasks SET status = 'CANCELLED' WHERE id = ? AND status IN ('OPEN','IN_PROGRESS')", [meeting.task_id]);
        await logTaskHistory(conn, meeting.task_id, "CANCEL", { toStatus: "CANCELLED", note: reason, changedBy: req.user.id });
      }
      await logLeadHistory(conn, meeting.lead_id, "MEETING_CANCELLED", { note: reason, changedBy: req.user.id });
    });
    res.json(await loadMeeting(meeting.id));
  } catch (err) {
    sendError(res, err, "Failed to cancel meeting");
  }
});

module.exports = router;
