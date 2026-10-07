const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");

function sendError(res, err, fallback) {
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

// ---------------------------------------------------------------------------
// GET /api/crm/mobile/home-summary -- the one new piece a mobile home screen
// actually needs: several counts bundled into a single round trip. Always
// "my own" numbers (no employeeId param) -- everything else a mobile client
// needs (today's meetings/follow-ups in full, lead lists, check-in/complete,
// performance figures) already has its own endpoint and is fetched from
// there directly; this does not duplicate any of them.
// ---------------------------------------------------------------------------
router.get("/mobile/home-summary", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const userId = req.user.id;

    const [[{ todayMeetingsCount }]] = await pool.query(
      `SELECT COUNT(*) AS todayMeetingsCount FROM crm_lead_meetings
        WHERE sales_employee_id = ? AND DATE(scheduled_at) = CURDATE() AND status <> 'CANCELLED'`,
      [userId]
    );

    // LEAD_FOLLOW_UP only -- a LEAD_MEETING task due today is already counted
    // in todayMeetingsCount above, so it's excluded here to avoid double-counting.
    const [[{ todayFollowUpsCount }]] = await pool.query(
      `SELECT COUNT(*) AS todayFollowUpsCount FROM work_tasks
        WHERE assigned_to = ? AND source_module = 'LEAD' AND task_type = 'LEAD_FOLLOW_UP' AND due_date = CURDATE()
          AND status IN ('OPEN','IN_PROGRESS','PAUSED')`,
      [userId]
    );

    const [stageRows] = await pool.query(
      `SELECT pipeline_stage, COUNT(*) AS count FROM crm_leads
        WHERE lead_type = 'commercial'
          AND (created_by_user_id = ? OR assigned_telecaller_id = ? OR assigned_sales_employee_id = ?)
        GROUP BY pipeline_stage`,
      [userId, userId, userId]
    );
    const leadsByStage = {};
    let totalMyLeads = 0;
    for (const row of stageRows) {
      const stage = row.pipeline_stage || "NEW";
      leadsByStage[stage] = Number(row.count);
      totalMyLeads += Number(row.count);
    }

    const [[{ pendingQuotationsCount }]] = await pool.query(
      `SELECT COUNT(*) AS pendingQuotationsCount FROM crm_lead_quotations
        WHERE created_by = ? AND status = 'SENT'`,
      [userId]
    );

    res.json({
      todayMeetingsCount: Number(todayMeetingsCount),
      todayFollowUpsCount: Number(todayFollowUpsCount),
      totalMyLeads,
      leadsByStage,
      pendingQuotationsCount: Number(pendingQuotationsCount),
    });
  } catch (err) {
    sendError(res, err, "Failed to load home summary");
  }
});

module.exports = router;
