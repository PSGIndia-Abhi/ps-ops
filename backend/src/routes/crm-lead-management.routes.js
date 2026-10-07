const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, isValidDate, logLeadHistory, hasPerm, resolveVisibleUserIds, isOwnLead,
} = require("../utils/crmLeadManagement");

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

// Loads a commercial lead and checks the requester may see it. 404 (never
// 403) so visibility never leaks whether a lead exists.
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
// GET /api/crm/lead-sources, /api/crm/lead-loss-reasons -- configurable
// master data. Any signed-in user may read these.
// ---------------------------------------------------------------------------
router.get("/lead-sources", auth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM crm_lead_sources WHERE is_active = 1 ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load lead sources");
  }
});

router.get("/lead-loss-reasons", auth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM crm_lead_loss_reasons WHERE is_active = 1 ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load loss reasons");
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/crm/leads/:id -- edit permitted fields. Optimistic locking via
// row_version: the caller must send the version it last read; a stale write
// gets 409, not a silent overwrite.
// ---------------------------------------------------------------------------
router.patch("/leads/:id", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot edit this lead");
    if (lead.lead_status === "converted") throw new HttpError(400, "A converted lead cannot be edited");

    const body = req.body || {};
    if (!Number.isInteger(Number(body.row_version))) throw new HttpError(400, "row_version is required");

    const next = {
      company_name: lead.company_name, customer_name: lead.customer_name, phone: lead.phone,
      alternate_phone: lead.alternate_phone, customer_email: lead.customer_email,
      location: lead.location, notes: lead.notes, amount: lead.amount, lead_source: lead.lead_source,
    };
    if (body.company_name !== undefined) {
      const v = optionalText(body.company_name, 150);
      if (v === false) throw new HttpError(400, "Company name is too long (max 150 characters)");
      if (!v) throw new HttpError(400, "Company name is required");
      next.company_name = v;
    }
    if (body.contact_person !== undefined) {
      const v = optionalText(body.contact_person, 150);
      if (v === false) throw new HttpError(400, "Contact person is too long (max 150 characters)");
      if (!v) throw new HttpError(400, "Contact person is required");
      next.customer_name = v;
    }
    if (body.phone_number !== undefined) {
      const v = String(body.phone_number).replace(/\D/g, "");
      if (v.length !== 10) throw new HttpError(400, "A valid 10-digit phone number is required");
      next.phone = v;
    }
    if (body.alternate_phone !== undefined) {
      const v = String(body.alternate_phone || "").replace(/\D/g, "");
      if (v && v.length !== 10) throw new HttpError(400, "Alternate number must be a valid 10-digit phone number");
      next.alternate_phone = v || null;
    }
    if (body.email !== undefined) {
      const v = optionalText(body.email, 150);
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, "Enter a valid email address");
      next.customer_email = v || null;
    }
    if (body.address !== undefined) {
      const v = optionalText(body.address, 255);
      if (v === false) throw new HttpError(400, "Address is too long (max 255 characters)");
      if (!v) throw new HttpError(400, "Address is required");
      next.location = v;
    }
    if (body.requirement !== undefined) next.notes = optionalText(body.requirement);
    if (body.approx_quote_amount !== undefined) {
      const v = Number(body.approx_quote_amount);
      if (!Number.isFinite(v) || v <= 0 || v > 99999999) throw new HttpError(400, "A valid approximate quote is required");
      next.amount = v;
    }
    if (body.lead_source_id !== undefined) {
      const [[source]] = await pool.query("SELECT id, name FROM crm_lead_sources WHERE id = ? AND is_active = 1", [body.lead_source_id]);
      if (!source) throw new HttpError(400, "Invalid lead_source_id");
      next.lead_source = source.name;
    }

    await inTransaction(async (conn) => {
      const [upd] = await conn.query(
        `UPDATE crm_leads SET company_name=?, customer_name=?, phone=?, alternate_phone=?, customer_email=?,
                location=?, notes=?, amount=?, lead_source=?, row_version = row_version + 1
         WHERE id = ? AND row_version = ?`,
        [next.company_name, next.customer_name, next.phone, next.alternate_phone, next.customer_email,
         next.location, next.notes, next.amount, next.lead_source, lead.id, body.row_version]
      );
      if (!upd.affectedRows) throw new HttpError(409, "This lead was changed by someone else. Reload and try again.");
      await logLeadHistory(conn, lead.id, "UPDATE", { changedBy: req.user.id });
    });
    const [[updated]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [lead.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to update lead");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/assign-telecaller -- hand the lead to a telecaller
// for verification. A telecaller may self-claim an unassigned lead; assigning
// someone ELSE needs MANAGE_LEADS.
// ---------------------------------------------------------------------------
router.post("/leads/:id/assign-telecaller", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const telecallerId = parseId(req.body?.telecaller_id);
    if (!telecallerId) throw new HttpError(400, "telecaller_id is required");
    const selfClaim = telecallerId === Number(req.user.id);
    if (!selfClaim && !hasPerm(req, "MANAGE_LEADS")) throw new HttpError(403, "You cannot assign leads to someone else");

    const [[user]] = await pool.query("SELECT id, name FROM users WHERE id = ? AND is_active = 1", [telecallerId]);
    if (!user) throw new HttpError(400, "Invalid telecaller_id");

    await inTransaction(async (conn) => {
      await conn.query(
        `UPDATE crm_leads SET assigned_telecaller_id = ?, pipeline_stage = IF(pipeline_stage IS NULL OR pipeline_stage = 'NEW', 'TO_CALL', pipeline_stage), row_version = row_version + 1 WHERE id = ?`,
        [telecallerId, lead.id]
      );
      await logLeadHistory(conn, lead.id, "ASSIGN_TELECALLER", { note: `Assigned to ${user.name}`, changedBy: req.user.id });
    });
    const [[updated]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [lead.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to assign telecaller");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/call-activities -- log a call attempt. A pure log:
// it does not move pipeline_stage on its own -- /qualify and /reject are the
// deliberate actions that do that, so the lead's real status is always the
// result of an explicit decision, not inferred from a log entry.
// ---------------------------------------------------------------------------
const CALL_OUTCOMES = ["CONNECTED", "NO_ANSWER", "CALLBACK_REQUESTED", "INVALID_NUMBER"];

router.post("/leads/:id/call-activities", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot log a call on this lead");

    const body = req.body || {};
    const outcome = String(body.outcome || "").toUpperCase();
    if (!CALL_OUTCOMES.includes(outcome)) throw new HttpError(400, `outcome must be one of ${CALL_OUTCOMES.join(", ")}`);
    const comments = optionalText(body.comments, 2000);
    if (comments === false) throw new HttpError(400, "comments is too long (max 2000 characters)");
    let nextFollowUpAt = null;
    if (body.nextFollowUpAt !== undefined && body.nextFollowUpAt !== null) {
      const d = new Date(body.nextFollowUpAt);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, "nextFollowUpAt must be a valid date-time");
      nextFollowUpAt = d.toISOString().slice(0, 19).replace("T", " ");
    }
    const qualificationStatus = body.qualificationStatus ? String(body.qualificationStatus).toUpperCase() : null;
    if (qualificationStatus && !["GENUINE", "NEEDS_INFO", "NOT_GENUINE"].includes(qualificationStatus)) {
      throw new HttpError(400, "qualificationStatus must be GENUINE, NEEDS_INFO or NOT_GENUINE");
    }

    const id = uuid();
    await inTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO crm_lead_call_activities (id, lead_id, telecaller_id, outcome, qualification_status, comments, next_follow_up_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, lead.id, req.user.id, outcome, qualificationStatus, comments, nextFollowUpAt]
      );
      await logLeadHistory(conn, lead.id, "CALL_LOGGED", {
        note: `${outcome}${qualificationStatus ? ` (${qualificationStatus})` : ""}${comments ? `: ${comments}` : ""}`.slice(0, 500),
        changedBy: req.user.id,
      });
    });
    const [[row]] = await pool.query("SELECT * FROM crm_lead_call_activities WHERE id = ?", [id]);
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, "Failed to save call activity");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/qualify -- GENUINE -> QUALIFIED, or NEEDS_INFO ->
// NEED_MORE_INFO (the telecaller will call again later).
// ---------------------------------------------------------------------------
router.post("/leads/:id/qualify", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot qualify this lead");
    if (!["TO_CALL", "NEED_MORE_INFO", null].includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot qualify a lead that is ${lead.pipeline_stage}`);
    }
    const status = String(req.body?.status || "").toUpperCase();
    if (!["GENUINE", "NEEDS_INFO"].includes(status)) throw new HttpError(400, "status must be GENUINE or NEEDS_INFO");
    const stage = status === "GENUINE" ? "QUALIFIED" : "NEED_MORE_INFO";

    await inTransaction(async (conn) => {
      const [upd] = await conn.query(
        "UPDATE crm_leads SET pipeline_stage = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
        [stage, lead.id, lead.row_version]
      );
      if (!upd.affectedRows) throw new HttpError(409, "This lead was just changed by someone else. Reload and try again.");
      await logLeadHistory(conn, lead.id, "QUALIFY", { note: `Marked ${status}`, changedBy: req.user.id });
    });
    const [[updated]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [lead.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to qualify lead");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/reject -- NOT_GENUINE, with a mandatory reason.
// Terminal for the telecaller stage (separate from the later sales-side
// "mark lost", which is for a genuine opportunity that doesn't close).
// ---------------------------------------------------------------------------
router.post("/leads/:id/reject", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot reject this lead");
    if (["NOT_GENUINE", "WON", "CONVERTED", "LOST", "CANCELLED"].includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot reject a lead that is ${lead.pipeline_stage}`);
    }
    const reason = optionalText(req.body?.reason, 500);
    if (!reason) throw new HttpError(400, "reason is required");
    let lossReasonId = null;
    if (req.body?.loss_reason_id) {
      const [[lr]] = await pool.query("SELECT id FROM crm_lead_loss_reasons WHERE id = ? AND is_active = 1", [req.body.loss_reason_id]);
      if (!lr) throw new HttpError(400, "Invalid loss_reason_id");
      lossReasonId = lr.id;
    }

    await inTransaction(async (conn) => {
      const [upd] = await conn.query(
        "UPDATE crm_leads SET pipeline_stage = 'NOT_GENUINE', loss_reason_id = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
        [lossReasonId, lead.id, lead.row_version]
      );
      if (!upd.affectedRows) throw new HttpError(409, "This lead was just changed by someone else. Reload and try again.");
      await logLeadHistory(conn, lead.id, "REJECT", { note: reason, changedBy: req.user.id });
    });
    const [[updated]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [lead.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to reject lead");
  }
});

// GET /api/crm/leads/:id/timeline -- the unified audit trail, oldest first.
router.get("/leads/:id/timeline", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [rows] = await pool.query(
      `SELECT h.id, h.action, h.note, h.changed_at, h.changed_by, u.name AS changed_by_name
         FROM crm_lead_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.lead_id = ? ORDER BY h.id ASC`,
      [lead.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load timeline");
  }
});

module.exports = router;
