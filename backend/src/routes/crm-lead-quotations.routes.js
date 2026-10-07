const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, nextQuotationNumber, hasPerm, resolveVisibleUserIds, isOwnLead,
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

const TERMINAL_STAGES = ["WON", "CONVERTED", "NOT_GENUINE", "LOST", "CANCELLED"];

// Same mysql2 timezone-shift gotcha as everywhere else in this codebase --
// DATETIME columns are always read back as plain strings, never raw Date objects.
const QUOTATION_COLUMNS = `
  id, lead_id, quotation_number, total_amount, status, pdf_object_key,
  DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') AS sent_at,
  DATE_FORMAT(responded_at, '%Y-%m-%d %H:%i:%s') AS responded_at,
  created_by, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
`;

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
// Quotation -- a narrow, lead-scoped record (not a general invoicing/quotation
// module -- none exists in this codebase to reuse). POST creates it already
// SENT: the API has no separate draft/send step, matching the endpoint list
// this was scoped against.
// ---------------------------------------------------------------------------
router.post("/leads/:id/quotations", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot create a quotation for this lead");
    if (TERMINAL_STAGES.includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot create a quotation for a lead that is ${lead.pipeline_stage}`);
    }

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw new HttpError(400, "At least one item is required");
    const cleanItems = [];
    for (const raw of items) {
      const description = optionalText(raw?.description, 255);
      if (!description) throw new HttpError(400, "Each item needs a description");
      const quantity = raw?.quantity === undefined ? 1 : Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, "Each item's quantity must be a whole number of at least 1");
      const unitPrice = Number(raw?.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpError(400, "Each item needs a valid unitPrice");
      cleanItems.push({ description, quantity, unitPrice });
    }
    const totalAmount = cleanItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    if (totalAmount <= 0) throw new HttpError(400, "The quotation total must be greater than 0");

    const quotationId = uuid();
    await inTransaction(async (conn) => {
      const quotationNumber = await nextQuotationNumber(conn);
      await conn.query(
        `INSERT INTO crm_lead_quotations (id, lead_id, quotation_number, total_amount, status, sent_at, created_by)
         VALUES (?, ?, ?, ?, 'SENT', NOW(), ?)`,
        [quotationId, lead.id, quotationNumber, totalAmount, req.user.id]
      );
      for (const item of cleanItems) {
        await conn.query(
          `INSERT INTO crm_lead_quotation_items (id, quotation_id, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
          [uuid(), quotationId, item.description, item.quantity, item.unitPrice]
        );
      }
      await conn.query("UPDATE crm_leads SET pipeline_stage = 'QUOTATION_SENT', row_version = row_version + 1 WHERE id = ?", [lead.id]);
      await logLeadHistory(conn, lead.id, "QUOTATION_SENT", { note: `${quotationNumber} for Rs. ${totalAmount}`, changedBy: req.user.id });
    });

    const [[quotation]] = await pool.query(`SELECT ${QUOTATION_COLUMNS} FROM crm_lead_quotations WHERE id = ?`, [quotationId]);
    const [lineItems] = await pool.query("SELECT id, description, quantity, unit_price FROM crm_lead_quotation_items WHERE quotation_id = ?", [quotationId]);
    res.status(201).json({ ...quotation, total_amount: Number(quotation.total_amount), items: lineItems.map((i) => ({ ...i, unit_price: Number(i.unit_price) })) });
  } catch (err) {
    sendError(res, err, "Failed to create quotation");
  }
});

// GET /api/crm/leads/:id/quotations
router.get("/leads/:id/quotations", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [rows] = await pool.query(`SELECT ${QUOTATION_COLUMNS} FROM crm_lead_quotations WHERE lead_id = ? ORDER BY created_at DESC`, [lead.id]);
    res.json(rows.map((r) => ({ ...r, total_amount: Number(r.total_amount) })));
  } catch (err) {
    sendError(res, err, "Failed to load quotations");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/mark-lost -- a genuine opportunity that doesn't
// close. Separate from /reject (telecaller-side, NOT_GENUINE) -- this is for
// a lead that was real but fell through later in the pipeline.
// ---------------------------------------------------------------------------
router.post("/leads/:id/mark-lost", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot close this lead");
    if (TERMINAL_STAGES.includes(lead.pipeline_stage)) throw new HttpError(400, `Cannot close a lead that is already ${lead.pipeline_stage}`);

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
        "UPDATE crm_leads SET pipeline_stage = 'LOST', loss_reason_id = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?",
        [lossReasonId, lead.id, lead.row_version]
      );
      if (!upd.affectedRows) throw new HttpError(409, "This lead was just changed by someone else. Reload and try again.");
      await logLeadHistory(conn, lead.id, "MARK_LOST", { note: reason, changedBy: req.user.id });
    });
    const [[updated]] = await pool.query("SELECT * FROM crm_leads WHERE id = ?", [lead.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to close lead");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/convert-to-customer -- the deliberate conversion
// action. Creates a real companies row (type CORPORATE, since this is always
// a commercial/business lead), links it via crm_lead_conversions (UNIQUE on
// lead_id enforces one conversion per lead), and moves the lead to CONVERTED.
// Gated by CONVERT_LEAD specifically -- a step up from ordinary lead
// management, since it creates a real customer record.
// ---------------------------------------------------------------------------
router.post("/leads/:id/convert-to-customer", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (req.user.role !== "admin" && !hasPerm(req, "CONVERT_LEAD")) throw new HttpError(403, "You do not have permission to convert leads");
    if (TERMINAL_STAGES.includes(lead.pipeline_stage)) throw new HttpError(400, `Cannot convert a lead that is ${lead.pipeline_stage}`);

    const [[already]] = await pool.query("SELECT id FROM crm_lead_conversions WHERE lead_id = ?", [lead.id]);
    if (already) throw new HttpError(409, "This lead has already been converted");
    const notes = optionalText(req.body?.notes, 500);

    const conversionId = uuid();
    const companyName = (lead.company_name || lead.customer_name || "Customer").slice(0, 150);

    const companyId = await inTransaction(async (conn) => {
      // companies.id is VARCHAR(20), a short readable id (COMP1, COMP2, ...)
      // -- same convention companies.routes.js already uses, not a UUID.
      const [[nextCompany]] = await conn.query(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)), 0) + 1 AS next FROM companies WHERE id LIKE 'COMP%' FOR UPDATE"
      );
      const newCompanyId = `COMP${nextCompany.next}`;
      await conn.query(
        "INSERT INTO companies (id, name, type, is_active, created_at) VALUES (?, ?, 'CORPORATE', 1, NOW())",
        [newCompanyId, companyName]
      );
      await conn.query(
        "INSERT INTO crm_lead_conversions (id, lead_id, company_id, converted_by, notes) VALUES (?, ?, ?, ?, ?)",
        [conversionId, lead.id, newCompanyId, req.user.id, notes]
      );
      const [upd] = await conn.query(
        "UPDATE crm_leads SET pipeline_stage = 'CONVERTED', lead_status = 'converted', row_version = row_version + 1 WHERE id = ? AND row_version = ?",
        [lead.id, lead.row_version]
      );
      if (!upd.affectedRows) throw new HttpError(409, "This lead was just changed by someone else. Reload and try again.");
      await logLeadHistory(conn, lead.id, "CONVERTED", { note: `Converted to company "${companyName}"${notes ? `: ${notes}` : ""}`, changedBy: req.user.id });
      return newCompanyId;
    });

    const [[conversion]] = await pool.query(
      `SELECT c.id, c.lead_id, c.company_id, c.converted_by, u.name AS converted_by_name,
              DATE_FORMAT(c.converted_at, '%Y-%m-%d %H:%i:%s') AS converted_at, c.notes,
              co.name AS company_name
         FROM crm_lead_conversions c
         LEFT JOIN users u ON u.id = c.converted_by
         LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.id = ?`,
      [conversionId]
    );
    res.status(201).json(conversion);
  } catch (err) {
    sendError(res, err, "Failed to convert lead");
  }
});

// GET /api/crm/leads/:id/conversion
router.get("/leads/:id/conversion", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [[conversion]] = await pool.query(
      `SELECT c.id, c.lead_id, c.company_id, c.converted_by, u.name AS converted_by_name,
              DATE_FORMAT(c.converted_at, '%Y-%m-%d %H:%i:%s') AS converted_at, c.notes,
              co.name AS company_name
         FROM crm_lead_conversions c
         LEFT JOIN users u ON u.id = c.converted_by
         LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.lead_id = ?`,
      [lead.id]
    );
    if (!conversion) throw new HttpError(404, "This lead has not been converted");
    res.json(conversion);
  } catch (err) {
    sendError(res, err, "Failed to load conversion");
  }
});

module.exports = router;
