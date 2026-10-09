const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, nextQuotationNumber, hasPerm, resolveVisibleUserIds, isOwnLead,
} = require("../utils/crmLeadManagement");
const { nextCompanyId } = require("../utils/crmCustomerCompany");
const multer = require("multer");
const minioClient = require("../lib/minio");

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
// Still with the telecaller (null = a lead from before pipeline stages existed).
const UNVERIFIED_STAGES = [null, "NEW", "TO_CALL", "NEED_MORE_INFO"];

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
//
// Two ways to send one:
//   - JSON line items ({ items: [{ description, quantity, unitPrice }] }) --
//     the total is worked out from them.
//   - multipart/form-data with the quotation as a PDF: "file" (PDF, max 10 MB),
//     "totalAmount", optional "notes". The file goes to MinIO (same bucket as
//     every other upload) and its key into pdf_object_key; there are no line
//     items, the PDF is the quotation.
// ---------------------------------------------------------------------------
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } });

// Checks the lead and the caller's rights BEFORE any upload body is read.
async function precheckQuotationWrite(req, res, next) {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManageLead(req, lead)) throw new HttpError(403, "You cannot create a quotation for this lead");
    if (TERMINAL_STAGES.includes(lead.pipeline_stage)) {
      throw new HttpError(400, `Cannot create a quotation for a lead that is ${lead.pipeline_stage}`);
    }
    req.lead = lead;
    next();
  } catch (err) {
    sendError(res, err, "Failed to create quotation");
  }
}

// multer only reads multipart bodies; a JSON request passes straight through.
function acceptPdf(req, res, next) {
  pdfUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 10 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one PDF in the 'file' field." });
  });
}

async function createPdfQuotation(req, res) {
  const lead = req.lead;
  let objectKey = null;
  try {
    if (!req.file) throw new HttpError(400, "file is required");
    // Trust the content, not the label: a real PDF starts with "%PDF-".
    const isPdf = req.file.mimetype === "application/pdf" && req.file.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!isPdf) throw new HttpError(400, "The quotation must be a PDF file");

    const totalAmount = Number(req.body?.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > 99999999) {
      throw new HttpError(400, "A valid totalAmount is required");
    }
    const notes = optionalText(req.body?.notes, 300);
    if (notes === false) throw new HttpError(400, "notes is too long (max 300 characters)");

    const quotationId = uuid();
    objectKey = `crm-quotations/${lead.id}/${quotationId}.pdf`;
    // Same lazy bucket creation the other uploads already do.
    if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
    }
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": "application/pdf" });

    await inTransaction(async (conn) => {
      const quotationNumber = await nextQuotationNumber(conn);
      await conn.query(
        `INSERT INTO crm_lead_quotations (id, lead_id, quotation_number, total_amount, status, pdf_object_key, sent_at, created_by)
         VALUES (?, ?, ?, ?, 'SENT', ?, NOW(), ?)`,
        [quotationId, lead.id, quotationNumber, totalAmount, objectKey, req.user.id]
      );
      await conn.query("UPDATE crm_leads SET pipeline_stage = 'QUOTATION_SENT', row_version = row_version + 1 WHERE id = ?", [lead.id]);
      await logLeadHistory(conn, lead.id, "QUOTATION_SENT", {
        note: `${quotationNumber} for Rs. ${totalAmount} (PDF)${notes ? `: ${notes}` : ""}`.slice(0, 500),
        changedBy: req.user.id,
      });
    });

    const [[quotation]] = await pool.query(`SELECT ${QUOTATION_COLUMNS} FROM crm_lead_quotations WHERE id = ?`, [quotationId]);
    res.status(201).json({ ...quotation, total_amount: Number(quotation.total_amount), items: [] });
  } catch (err) {
    // DB failed after the file was stored: don't leave an orphan file behind.
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to create quotation");
  }
}

router.post("/leads/:id/quotations", auth, requirePermission("CRM_VIEW_LEAD"), precheckQuotationWrite, acceptPdf, async (req, res) => {
  if (req.file || req.is("multipart/form-data")) return createPdfQuotation(req, res);
  try {
    const lead = req.lead;

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

// GET /api/crm/leads/:id/quotations/:quotationId/pdf -- streams the uploaded
// quotation PDF to anyone who can see the lead.
router.get("/leads/:id/quotations/:quotationId/pdf", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [[row]] = await pool.query(
      "SELECT quotation_number, pdf_object_key FROM crm_lead_quotations WHERE id = ? AND lead_id = ?",
      [req.params.quotationId, lead.id]
    );
    if (!row) throw new HttpError(404, "Quotation not found");
    if (!row.pdf_object_key) throw new HttpError(404, "This quotation has no PDF");

    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, row.pdf_object_key);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(`${row.quotation_number}.pdf`)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.on("error", (err) => {
      console.error("Quotation PDF stream failed:", err.message);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to load quotation PDF");
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
    // Every lead is verified by a telecaller first - one still waiting for that is not a customer yet.
    if (UNVERIFIED_STAGES.includes(lead.pipeline_stage)) {
      throw new HttpError(400, "This lead has not been verified yet. It can be converted once it is qualified.");
    }

    const [[already]] = await pool.query("SELECT id FROM crm_lead_conversions WHERE lead_id = ?", [lead.id]);
    if (already) throw new HttpError(409, "This lead has already been converted");
    const notes = optionalText(req.body?.notes, 500);

    const conversionId = uuid();
    const companyName = (lead.company_name || lead.customer_name || "Customer").slice(0, 150);

    const companyId = await inTransaction(async (conn) => {
      // companies.id is VARCHAR(20), a short readable id (COMP1, COMP2, ...)
      // -- same convention companies.routes.js already uses, not a UUID.
      const newCompanyId = await nextCompanyId(conn);
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
