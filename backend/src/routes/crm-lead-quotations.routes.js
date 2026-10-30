const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const {
  uuid, logLeadHistory, nextQuotationNumber, hasPerm, resolveVisibleUserIds, isOwnLead, isHiddenSalesOwnLead,
  findLeadAssignee,
} = require("../utils/crmLeadManagement");
const { nextCompanyId } = require("../utils/crmCustomerCompany");
const { notifyLead } = require("../utils/crmLeadNotifications");
const multer = require("multer");
const minioClient = require("../lib/minio");
const { normalizeQuotationContent, renderQuotationPdf, QuotationInputError } = require("../utils/crmQuotationDocument");

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

// Who a quotation is for when it carries no name of its own (an uploaded PDF).
const leadClientName = (lead) => lead.company_name || lead.customer_name || "Customer";

// The file a quotation PDF downloads as: CLIENTNAME_PROPOSAL_YEAR.pdf, e.g.
// ABC_Foods_Pvt_Ltd_PROPOSAL_2026.pdf (the year the quotation was made).
function proposalFileName(clientName, createdAt) {
  const name = String(clientName || "Customer").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Customer";
  const year = /^\d{4}/.test(String(createdAt || "")) ? String(createdAt).slice(0, 4) : String(new Date().getFullYear());
  return `${name}_PROPOSAL_${year}.pdf`;
}

async function loadVisibleLead(req, leadId) {
  const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ? AND lead_type = 'commercial'", [leadId]);
  if (!lead) throw new HttpError(404, "Lead not found");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && !isOwnLead(lead, req.user.id) && !visibleIds.some((id) => isOwnLead(lead, id))) {
    throw new HttpError(404, "Lead not found");
  }
  // A sales executive's own lead stays with them and lead managers.
  if (await isHiddenSalesOwnLead(pool, req, lead)) throw new HttpError(404, "Lead not found");
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
    notifyLead(lead.id, "QUOTATION_SENT", { actorId: req.user.id, extra: { reason: quotation.quotation_number } });
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
    notifyLead(lead.id, "QUOTATION_SENT", { actorId: req.user.id, extra: { reason: quotation.quotation_number } });
    res.status(201).json({ ...quotation, total_amount: Number(quotation.total_amount), items: lineItems.map((i) => ({ ...i, unit_price: Number(i.unit_price) })) });
  } catch (err) {
    sendError(res, err, "Failed to create quotation");
  }
});

// ---------------------------------------------------------------------------
// Quotations built from the quotation master (the web / app quotation builder).
// The body is the quotation's content -- customer block, subject, services with
// their treatment rows and prices, pricing mode, clauses; see
// utils/crmQuotationDocument.js for the exact shape and limits.
//
// POST /api/crm/leads/:id/quotations/preview  -> the PDF (marked DRAFT), nothing saved
// POST /api/crm/leads/:id/quotations/generate -> numbers it, stores the PDF in MinIO
//   and the content in crm_lead_quotation_documents, and moves the lead to
//   QUOTATION_SENT -- the same outcome as uploading a PDF.
// Same rights as uploading one (precheckQuotationWrite).
// ---------------------------------------------------------------------------
// The checked content, with the master's locked clauses (is_default = "always included")
// put first in their list if the request left any out -- they go on every quotation.
async function readContent(req) {
  let content;
  try {
    content = normalizeQuotationContent(req.body);
  } catch (err) {
    if (err instanceof QuotationInputError) throw new HttpError(400, err.message);
    throw err;
  }
  const [locked] = await pool.query(
    "SELECT kind, text FROM crm_quote_clauses WHERE is_active = 1 AND is_default = 1 ORDER BY sort_order, created_at"
  );
  for (const [kind, key] of [["VALUE_ADDED", "valueAdded"], ["TERMS", "terms"]]) {
    const missing = locked.filter((c) => c.kind === kind && !content[key].includes(c.text)).map((c) => c.text);
    content[key] = [...missing, ...content[key]];
  }
  return content;
}

// Who is making the quotation -- they sign it: name, designation (their org designation, else
// their role, e.g. "Sales Executive") and phone.
async function preparedBy(userId) {
  const [[u]] = await pool.query(
    `SELECT u.name, u.phone, r.name AS role,
            (SELECT d.name FROM user_org_units uo JOIN designations d ON d.id = uo.designation_id
              WHERE uo.user_id = u.id AND (uo.effective_to IS NULL OR uo.effective_to >= CURDATE())
              ORDER BY uo.is_primary DESC, uo.effective_from DESC LIMIT 1) AS designation
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!u) return null;
  const roleLabel = (u.role || "").replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  return { name: u.name || "", designation: u.designation || roleLabel, phone: u.phone || "" };
}

router.post("/leads/:id/quotations/preview", auth, requirePermission("CRM_VIEW_LEAD"), precheckQuotationWrite, async (req, res) => {
  try {
    const content = await readContent(req);
    const by = await preparedBy(req.user.id);
    const pdf = await renderQuotationPdf(content, { number: "", date: new Date(), leadNumber: req.lead.lead_number, draft: true, preparedBy: by });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"quotation-preview.pdf\"");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(pdf);
  } catch (err) {
    sendError(res, err, "Failed to preview the quotation");
  }
});

// Body: the quotation content, plus optional replacesQuotationId when it is an edit of an existing
// quotation. An edit never changes the old one: the new quotation gets its own number and the old
// one is marked CANCELLED ("replaced by QT-..."), in the same transaction. Replacing needs the same
// right as cancelling (whoever sent it, a lead manager or admin).
router.post("/leads/:id/quotations/generate", auth, requirePermission("CRM_VIEW_LEAD"), precheckQuotationWrite, async (req, res) => {
  const lead = req.lead;
  let objectKey = null;
  try {
    let replaces = null;
    if (req.body?.replacesQuotationId) {
      const [[old]] = await pool.query(
        "SELECT id, quotation_number, status, created_by FROM crm_lead_quotations WHERE id = ? AND lead_id = ?",
        [String(req.body.replacesQuotationId), lead.id]
      );
      if (!old) throw new HttpError(404, "The quotation being edited was not found");
      if (old.status === "CANCELLED") throw new HttpError(400, "A cancelled quotation cannot be edited");
      const uploader = Number(old.created_by) === Number(req.user.id);
      if (!uploader && req.user.role !== "admin" && !hasPerm(req, "MANAGE_LEADS")) {
        throw new HttpError(403, "Only the person who sent this quotation or a sales manager can edit it");
      }
      replaces = old;
    }
    const content = await readContent(req);
    content.preparedBy = await preparedBy(req.user.id); // saved with the quotation's content
    const quotationId = uuid();
    objectKey = `crm-quotations/${lead.id}/${quotationId}.pdf`;
    if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
    }

    const total = content.totals.final; // after any special discount
    const quotationNumber = await inTransaction(async (conn) => {
      const number = await nextQuotationNumber(conn);
      const pdf = await renderQuotationPdf(content, { number, date: new Date(), leadNumber: lead.lead_number, draft: false, preparedBy: content.preparedBy });
      await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, pdf, pdf.length, { "Content-Type": "application/pdf" });
      await conn.query(
        `INSERT INTO crm_lead_quotations (id, lead_id, quotation_number, total_amount, status, pdf_object_key, sent_at, created_by)
         VALUES (?, ?, ?, ?, 'SENT', ?, NOW(), ?)`,
        [quotationId, lead.id, number, total, objectKey, req.user.id]
      );
      await conn.query("INSERT INTO crm_lead_quotation_documents (quotation_id, content) VALUES (?, ?)", [quotationId, JSON.stringify(content)]);
      await conn.query("UPDATE crm_leads SET pipeline_stage = 'QUOTATION_SENT', row_version = row_version + 1 WHERE id = ?", [lead.id]);
      const per = { MONTHLY: " per month", YEARLY: " per year", ONE_TIME: "" }[content.totals.primaryBilling];
      await logLeadHistory(conn, lead.id, "QUOTATION_SENT", {
        note: `${number}${replaces ? ` (revised, replaces ${replaces.quotation_number})` : ""} for Rs. ${total}${per}${content.totals.discount ? ` (after Rs. ${content.totals.discount} discount)` : ""}: ${content.services.map((s) => s.name).join(", ")}`.slice(0, 500),
        changedBy: req.user.id,
      });
      if (replaces) {
        const [done] = await conn.query("UPDATE crm_lead_quotations SET status = 'CANCELLED' WHERE id = ? AND status <> 'CANCELLED'", [replaces.id]);
        if (done.affectedRows === 0) throw new HttpError(409, "The quotation being edited was cancelled meanwhile");
        await logLeadHistory(conn, lead.id, "QUOTATION_CANCELLED", {
          note: `${replaces.quotation_number} cancelled: replaced by ${number}`,
          changedBy: req.user.id,
        });
      }
      return number;
    });

    const [[quotation]] = await pool.query(`SELECT ${QUOTATION_COLUMNS} FROM crm_lead_quotations WHERE id = ?`, [quotationId]);
    notifyLead(lead.id, "QUOTATION_SENT", { actorId: req.user.id, extra: { reason: quotationNumber } });
    res.status(201).json({ ...quotation, total_amount: Number(quotation.total_amount), items: [] });
  } catch (err) {
    // Anything failed after the file was stored: don't leave an orphan file behind.
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to create quotation");
  }
});

// GET /api/crm/leads/:id/quotations
router.get("/leads/:id/quotations", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    // has_content: built with Create Quotation, so it can be opened again to edit or duplicate.
    // client_name: the name on the quotation (else the lead's), shown in place of the number.
    const [rows] = await pool.query(
      `SELECT ${QUOTATION_COLUMNS},
              (SELECT JSON_UNQUOTE(JSON_EXTRACT(d.content, '$.customer.name')) FROM crm_lead_quotation_documents d
                WHERE d.quotation_id = crm_lead_quotations.id) AS client_name,
              (SELECT JSON_UNQUOTE(JSON_EXTRACT(d.content, '$.contractType')) FROM crm_lead_quotation_documents d
                WHERE d.quotation_id = crm_lead_quotations.id) AS contract_type
       FROM crm_lead_quotations WHERE lead_id = ? ORDER BY created_at DESC`,
      [lead.id]
    );
    res.json(
      rows.map(({ client_name: name, contract_type: kind, ...r }) => ({
        ...r,
        // One-time or AMC, chosen when it was saved (null for older and uploaded quotations).
        contract_type: kind === "ONE_TIME" || kind === "AMC" ? kind : null,
        total_amount: Number(r.total_amount),
        has_content: name !== null,
        client_name: name || leadClientName(lead),
        file_name: proposalFileName(name || leadClientName(lead), r.created_at),
      }))
    );
  } catch (err) {
    sendError(res, err, "Failed to load quotations");
  }
});

// GET /api/crm/leads/:id/quotations/:quotationId/content -- what went into a quotation built
// with Create Quotation (customer, services, prices, clauses), to open it again in the builder.
// Uploaded-PDF quotations have none (404).
router.get("/leads/:id/quotations/:quotationId/content", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [[row]] = await pool.query(
      `SELECT d.content FROM crm_lead_quotation_documents d
       JOIN crm_lead_quotations q ON q.id = d.quotation_id
       WHERE q.id = ? AND q.lead_id = ?`,
      [req.params.quotationId, lead.id]
    );
    if (!row) throw new HttpError(404, "This quotation has no saved details to open");
    res.json(typeof row.content === "string" ? JSON.parse(row.content) : row.content);
  } catch (err) {
    sendError(res, err, "Failed to load the quotation");
  }
});

// ---------------------------------------------------------------------------
// POST /api/crm/leads/:id/quotations/:quotationId/cancel { reason } -- takes a
// quotation back (sent by mistake, or replaced). Nothing is deleted: the row is
// marked CANCELLED and keeps its number and PDF, the lead's history records
// it, and reports stop counting it. If no other quotation on the lead is still
// standing, the lead steps back from QUOTATION_SENT to where it was before.
// Allowed for whoever uploaded it, a lead manager or admin, while the lead is open.
// ---------------------------------------------------------------------------
router.post("/leads/:id/quotations/:quotationId/cancel", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [[quotation]] = await pool.query(
      "SELECT id, quotation_number, status, created_by FROM crm_lead_quotations WHERE id = ? AND lead_id = ?",
      [req.params.quotationId, lead.id]
    );
    if (!quotation) throw new HttpError(404, "Quotation not found");
    const uploader = Number(quotation.created_by) === Number(req.user.id);
    if (!uploader && req.user.role !== "admin" && !hasPerm(req, "MANAGE_LEADS")) {
      throw new HttpError(403, "Only the person who sent this quotation or a sales manager can cancel it");
    }
    if (TERMINAL_STAGES.includes(lead.pipeline_stage)) throw new HttpError(400, `Cannot change a quotation on a lead that is ${lead.pipeline_stage}`);
    if (quotation.status === "CANCELLED") throw new HttpError(400, "This quotation is already cancelled");
    const reason = optionalText(req.body?.reason, 300);
    if (reason === false) throw new HttpError(400, "reason is too long (max 300 characters)");
    if (!reason) throw new HttpError(400, "reason is required");

    await inTransaction(async (conn) => {
      await conn.query("UPDATE crm_lead_quotations SET status = 'CANCELLED' WHERE id = ? AND status <> 'CANCELLED'", [quotation.id]);
      await logLeadHistory(conn, lead.id, "QUOTATION_CANCELLED", { note: `${quotation.quotation_number} cancelled: ${reason}`.slice(0, 500), changedBy: req.user.id });

      // No quotation left standing: the lead goes back to the step it had reached before one was sent.
      const [[{ standing }]] = await conn.query(
        "SELECT COUNT(*) AS standing FROM crm_lead_quotations WHERE lead_id = ? AND status <> 'CANCELLED'",
        [lead.id]
      );
      if (Number(standing) === 0 && lead.pipeline_stage === "QUOTATION_SENT") {
        const [[m]] = await conn.query(
          `SELECT SUM(status = 'COMPLETED') AS done, SUM(status = 'SCHEDULED') AS open FROM crm_lead_meetings WHERE lead_id = ?`,
          [lead.id]
        );
        const back = Number(m?.done) > 0 ? "VISIT_COMPLETED" : Number(m?.open) > 0 ? "MEETING_SCHEDULED" : "QUALIFIED";
        await conn.query("UPDATE crm_leads SET pipeline_stage = ?, row_version = row_version + 1 WHERE id = ?", [back, lead.id]);
      }
    });

    const [[row]] = await pool.query(`SELECT ${QUOTATION_COLUMNS} FROM crm_lead_quotations WHERE id = ?`, [quotation.id]);
    res.json({ ...row, total_amount: Number(row.total_amount) });
  } catch (err) {
    sendError(res, err, "Failed to cancel quotation");
  }
});

// GET /api/crm/leads/:id/quotations/:quotationId/pdf -- streams the uploaded
// quotation PDF to anyone who can see the lead.
router.get("/leads/:id/quotations/:quotationId/pdf", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [[row]] = await pool.query(
      `SELECT q.pdf_object_key, DATE_FORMAT(q.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              JSON_UNQUOTE(JSON_EXTRACT(d.content, '$.customer.name')) AS client_name
       FROM crm_lead_quotations q
       LEFT JOIN crm_lead_quotation_documents d ON d.quotation_id = q.id
       WHERE q.id = ? AND q.lead_id = ?`,
      [req.params.quotationId, lead.id]
    );
    if (!row) throw new HttpError(404, "Quotation not found");
    if (!row.pdf_object_key) throw new HttpError(404, "This quotation has no PDF");

    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, row.pdf_object_key);
    const fileName = proposalFileName(row.client_name || leadClientName(lead), row.created_at);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
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
    notifyLead(lead.id, "LOST", { actorId: req.user.id, extra: { reason } });
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
//
// credit_to (optional): who the conversion counts for - the sales manager converting a sales
// executive's lead picks them or themselves. The lead's sales person becomes that person, so their
// target, Converted count and achievement show it (see CONVERTED_LEADS_SQL in the reports).
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
    // The closure amount: the deal's final amount, agreed at conversion - it replaces the lead's
    // approximate quote and is what the conversion counts for in targets / reports. Not given (the
    // web form) = the latest quotation's total, when a quotation was sent; else the lead keeps its amount.
    let amount = null;
    if (req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== "") {
      amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new HttpError(400, "Enter a valid amount");
      amount = Math.round(amount * 100) / 100;
    } else {
      const [[latest]] = await pool.query(
        `SELECT total_amount FROM crm_lead_quotations
          WHERE lead_id = ? AND status <> 'CANCELLED' ORDER BY sent_at DESC, created_at DESC LIMIT 1`,
        [lead.id]
      );
      if (latest && Number(latest.total_amount) > 0) amount = Number(latest.total_amount);
    }

    // Who it counts for. Only someone who manages leads may credit another person.
    let creditTo = null;
    if (req.body?.credit_to !== undefined && req.body?.credit_to !== null && req.body?.credit_to !== "") {
      const wanted = Number(req.body.credit_to);
      if (wanted !== Number(req.user.id) && req.user.role !== "admin" && !hasPerm(req, "MANAGE_LEADS")) {
        throw new HttpError(403, "You cannot count this conversion for someone else");
      }
      creditTo = await findLeadAssignee(pool, wanted, req.user.id);
      if (!creditTo) throw new HttpError(400, "Choose who this conversion counts for");
    }

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
      if (amount !== null && amount !== Number(lead.amount)) {
        await conn.query("UPDATE crm_leads SET amount = ? WHERE id = ?", [amount, lead.id]);
      }
      if (creditTo && Number(lead.assigned_sales_employee_id) !== creditTo.id) {
        await conn.query("UPDATE crm_leads SET assigned_sales_employee_id = ? WHERE id = ?", [creditTo.id, lead.id]);
      }
      const amountNote = amount !== null && amount !== Number(lead.amount) ? ` (amount ${Number(lead.amount) || 0} -> ${amount})` : "";
      const creditNote = creditTo && creditTo.id !== Number(req.user.id) ? ` - counted for ${creditTo.name}` : "";
      await logLeadHistory(conn, lead.id, "CONVERTED", {
        note: `Converted to company "${companyName}"${amountNote}${creditNote}${notes ? `: ${notes}` : ""}`.slice(0, 500),
        changedBy: req.user.id,
      });
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
    notifyLead(lead.id, "CONVERTED", { actorId: req.user.id });
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
