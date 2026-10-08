const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, hasPerm, nextLeadNumber, resolveVisibleUserIds, isOwnLead,
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

// The provider role deliberately holds none of the internal CRM_* permissions
// (least privilege) -- these endpoints are gated by role, not by that
// permission system. Admin can use them too, for support/testing.
function requireProvider(req, res, next) {
  if (req.user.role !== "lead_provider" && req.user.role !== "admin") {
    return res.status(403).json({ error: "This account cannot access the provider portal" });
  }
  next();
}

// Maps a pipeline_stage onto the 5 buckets the provider portal shows. A
// provider sees where their lead stands, never the internal stage names or
// who's working it.
function providerBucket(stage) {
  if (stage === null || ["NEW", "TO_CALL", "NEED_MORE_INFO"].includes(stage)) return "under_review";
  if (["NOT_GENUINE", "LOST", "CANCELLED"].includes(stage)) return "rejected";
  if (["WON", "CONVERTED"].includes(stage)) return "converted";
  return "qualified"; // QUALIFIED, MEETING_SCHEDULED, VISIT_COMPLETED, QUOTATION_SENT
}

function toProviderLead(row) {
  return {
    id: row.id,
    lead_number: row.lead_number,
    company_name: row.company_name,
    contact_person: row.customer_name,
    phone_number: row.phone,
    alternate_phone: row.alternate_phone || null,
    email: row.customer_email || null,
    address: row.location,
    lead_source: row.lead_source,
    approx_quote_amount: row.amount === null ? null : Number(row.amount),
    requirement: row.notes,
    status: providerBucket(row.pipeline_stage),
    created_at: row.created_at_formatted,
  };
}

// Same mysql2 timezone-shift gotcha as everywhere else -- crm_leads.created_at
// is a TIMESTAMP and must never be read back as a raw Date object.
const LEAD_SELECT_WITH_FORMATTED_DATE = `*, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at_formatted`;

// ---------------------------------------------------------------------------
// GET /api/crm/provider/dashboard
// ---------------------------------------------------------------------------
router.get("/provider/dashboard", auth, requireProvider, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT pipeline_stage FROM crm_leads WHERE lead_type = 'commercial' AND provider_id = ?",
      [req.user.id]
    );
    const counts = { total: rows.length, under_review: 0, qualified: 0, converted: 0, rejected: 0 };
    for (const r of rows) counts[providerBucket(r.pipeline_stage)] += 1;
    res.json(counts);
  } catch (err) {
    sendError(res, err, "Failed to load dashboard");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/provider/leads -- submit a new commercial lead. provider_id
// and created_by are always derived from the authenticated account, never
// trusted from the request body.
// ---------------------------------------------------------------------------
router.post("/provider/leads", auth, requireProvider, async (req, res) => {
  try {
    const body = req.body || {};
    const companyName = optionalText(body.companyName, 150);
    if (!companyName) throw new HttpError(400, "companyName is required");
    const contactPerson = optionalText(body.contactPerson, 150);
    if (!contactPerson) throw new HttpError(400, "contactPerson is required");
    const phone = typeof body.phoneNumber === "string" ? body.phoneNumber.replace(/\D/g, "") : "";
    if (phone.length !== 10) throw new HttpError(400, "A valid 10-digit phoneNumber is required");
    const email = optionalText(body.email, 150);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address");
    const address = optionalText(body.address, 255);
    if (!address) throw new HttpError(400, "address is required");
    const requirement = optionalText(body.requirement, 2000);
    if (!requirement) throw new HttpError(400, "requirement is required");
    const city = optionalText(body.city, 100);
    const area = optionalText(body.area, 150);
    const fullAddress = [address, area, city].filter(Boolean).join(", ").slice(0, 255);

    let leadSourceName = null;
    if (body.leadSourceId) {
      const [[source]] = await pool.query("SELECT name FROM crm_lead_sources WHERE id = ? AND is_active = 1", [body.leadSourceId]);
      if (!source) throw new HttpError(400, "Invalid leadSourceId");
      leadSourceName = source.name;
    }
    // crm_leads.amount is NOT NULL, and the internal create-lead path already
    // treats the quote amount as required -- matching that here, not silently
    // defaulting to 0.
    const approxQuoteAmount = Number(body.approxQuoteAmount);
    if (!Number.isFinite(approxQuoteAmount) || approxQuoteAmount <= 0 || approxQuoteAmount > 99999999) {
      throw new HttpError(400, "approxQuoteAmount is required and must be a valid positive number");
    }

    // Duplicate detection: an active lead already using this phone number gets
    // a warning instead of a silent duplicate, unless the caller confirms it.
    if (!body.confirmDuplicate) {
      const [[dupe]] = await pool.query(
        `SELECT id, lead_number, company_name FROM crm_leads
          WHERE lead_type = 'commercial' AND phone = ?
            -- "IS NULL OR": a lead from before pipeline stages existed has no stage, and
            -- NULL NOT IN (...) is never true, so it would be missed as a duplicate.
            AND (pipeline_stage IS NULL OR pipeline_stage NOT IN ('NOT_GENUINE','LOST','CANCELLED'))
          LIMIT 1`,
        [phone]
      );
      if (dupe) {
        return res.status(409).json({
          error: "A lead with this phone number already exists",
          possible_duplicate: true,
          existing_lead: { id: dupe.id, lead_number: dupe.lead_number, company_name: dupe.company_name },
        });
      }
    }

    const leadId = uuid();
    await inTransaction(async (conn) => {
      const leadNumber = await nextLeadNumber(conn);
      await conn.query(
        `INSERT INTO crm_leads
          (id, lead_number, lead_type, customer_name, company_name, phone, customer_email,
           house_type, service_name, plan_type, amount, location, lead_source, notes,
           payment_method, payment_status, lead_status, pipeline_stage, provider_id, created_by_user_id)
         VALUES (?, ?, 'commercial', ?, ?, ?, ?, '', '', '', ?, ?, ?, ?, 'none', 'na', 'new', 'NEW', ?, ?)`,
        [leadId, leadNumber, contactPerson, companyName, phone, email, approxQuoteAmount, fullAddress, leadSourceName, requirement, req.user.id, req.user.id]
      );
      await logLeadHistory(conn, leadId, "CREATE", { note: "Submitted via the provider portal", changedBy: req.user.id });
    });

    const [[row]] = await pool.query(`SELECT ${LEAD_SELECT_WITH_FORMATTED_DATE} FROM crm_leads WHERE id = ?`, [leadId]);
    res.status(201).json(toProviderLead(row));
  } catch (err) {
    sendError(res, err, "Failed to submit lead");
  }
});

// GET /api/crm/provider/leads -- only this provider's own submissions.
router.get("/provider/leads", auth, requireProvider, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${LEAD_SELECT_WITH_FORMATTED_DATE} FROM crm_leads WHERE lead_type = 'commercial' AND provider_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map(toProviderLead));
  } catch (err) {
    sendError(res, err, "Failed to load leads");
  }
});

// GET /api/crm/provider/leads/:id -- own lead detail, 404 for anyone else's.
router.get("/provider/leads/:id", auth, requireProvider, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT ${LEAD_SELECT_WITH_FORMATTED_DATE} FROM crm_leads WHERE id = ? AND lead_type = 'commercial' AND provider_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!row) throw new HttpError(404, "Lead not found");
    res.json(toProviderLead(row));
  } catch (err) {
    sendError(res, err, "Failed to load lead");
  }
});

// GET /api/crm/provider/lead-sources
router.get("/provider/lead-sources", auth, requireProvider, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM crm_lead_sources WHERE is_active = 1 ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load lead sources");
  }
});

// GET /api/crm/provider/leads/:id/feedback -- only feedback explicitly
// published to this lead's provider; never internal call notes.
router.get("/provider/leads/:id/feedback", auth, requireProvider, async (req, res) => {
  try {
    const [[lead]] = await pool.query(
      "SELECT id FROM crm_leads WHERE id = ? AND lead_type = 'commercial' AND provider_id = ?",
      [req.params.id, req.user.id]
    );
    if (!lead) throw new HttpError(404, "Lead not found");
    const [rows] = await pool.query(
      "SELECT id, message, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM crm_lead_feedback WHERE lead_id = ? ORDER BY created_at ASC",
      [lead.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load feedback");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/feedback -- the INTERNAL side: staff publish
// feedback to the provider. Not under requireProvider -- this is a normal
// CRM-permissioned action, the mirror image of the read-only endpoint above.
// ---------------------------------------------------------------------------
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

router.post("/leads/:id/feedback", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot send feedback on this lead");
    if (!lead.provider_id) throw new HttpError(400, "This lead has no external provider to notify");
    const message = optionalText(req.body?.message, 1000);
    if (!message) throw new HttpError(400, "message is required");

    const id = uuid();
    await inTransaction(async (conn) => {
      await conn.query("INSERT INTO crm_lead_feedback (id, lead_id, message, created_by) VALUES (?, ?, ?, ?)", [id, lead.id, message, req.user.id]);
      await logLeadHistory(conn, lead.id, "FEEDBACK_SENT", { note: message.slice(0, 500), changedBy: req.user.id });
    });
    const [[row]] = await pool.query("SELECT id, message, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM crm_lead_feedback WHERE id = ?", [id]);
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, "Failed to send feedback");
  }
});

module.exports = router;
