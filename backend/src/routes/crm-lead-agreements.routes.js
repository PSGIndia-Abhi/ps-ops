const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const multer = require("multer");
const minioClient = require("../lib/minio");
const {
  uuid, logLeadHistory, hasPerm, resolveVisibleUserIds, isOwnLead, isHiddenSalesOwnLead,
} = require("../utils/crmLeadManagement");
const { normalizeAgreementContent, renderAgreementPdf, AgreementInputError } = require("../utils/crmAgreementDocument");

// ---------------------------------------------------------------------------
// Service agreements for converted commercial leads (customers).
//
//   GET  /api/crm/leads/:id/agreements                     -> the lead's agreements, newest first, and the final one
//   GET  /api/crm/leads/:id/agreements/prefill             -> form defaults (customer, quotation rows)
//   POST /api/crm/leads/:id/agreements/preview             -> the PDF, nothing saved
//   POST /api/crm/leads/:id/agreements                     -> numbers it (AG-YYYY-NNNNNN), stores the PDF
//   GET  /api/crm/leads/:id/agreements/:agreementId/pdf    -> the generated agreement
//   GET  /api/crm/leads/:id/agreements/:agreementId/content-> what went into it (to make another from it)
//   POST /api/crm/leads/:id/agreements/final               -> upload / replace THE final (signed) agreement
//   GET  /api/crm/leads/:id/agreements/:agreementId/signed -> a signed copy
//
// Sales managers (MANAGE_LEADS) and admin only - making, seeing and uploading; sales executives
// never see agreements. Any number can be made; each new one cancels the older ones (only the
// newest is active). A customer has ONE final agreement: the uploaded signed copy, kept on the
// active agreement - uploading again replaces it.
// ---------------------------------------------------------------------------

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
const nextAgreementNumber = async (conn) => {
  const [[locked]] = await conn.query("SELECT value FROM sequences WHERE name = 'crm_agreement_number' FOR UPDATE");
  if (!locked) throw new Error("The crm_agreement_number sequence is missing - run the agreements migration");
  const next = Number(locked.value) + 1;
  await conn.query("UPDATE sequences SET value = ? WHERE name = 'crm_agreement_number'", [next]);
  return `AG-${new Date().getFullYear()}-${String(next).padStart(6, "0")}`;
};
async function ensureBucket() {
  if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
    await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
  }
}

const AGREEMENT_COLUMNS = `
  a.id, a.lead_id, a.agreement_number, a.status, a.monthly_amount,
  DATE_FORMAT(a.term_start, '%Y-%m-%d') AS term_start, DATE_FORMAT(a.term_end, '%Y-%m-%d') AS term_end,
  a.pdf_object_key IS NOT NULL AS has_pdf, a.signed_object_key IS NOT NULL AS has_signed,
  DATE_FORMAT(a.signed_uploaded_at, '%Y-%m-%d %H:%i:%s') AS signed_uploaded_at, su.name AS signed_uploaded_by_name,
  a.created_by, cu.name AS created_by_name, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  JSON_UNQUOTE(JSON_EXTRACT(a.content, '$.customer.name')) AS client_name
`;
const AGREEMENT_FROM = `
  FROM crm_lead_agreements a
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users su ON su.id = a.signed_uploaded_by
`;
const shape = (r) => ({
  ...r,
  monthly_amount: Number(r.monthly_amount),
  has_pdf: Boolean(r.has_pdf),
  has_signed: Boolean(r.has_signed),
  file_name: fileName(r.client_name, r.created_at, false),
  signed_file_name: fileName(r.client_name, r.created_at, true),
});

// CLIENTNAME_AGREEMENT_YEAR.pdf / CLIENTNAME_AGREEMENT_SIGNED_YEAR.pdf
function fileName(clientName, createdAt, signed) {
  const name = String(clientName || "Customer").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Customer";
  const year = /^\d{4}/.test(String(createdAt || "")) ? String(createdAt).slice(0, 4) : String(new Date().getFullYear());
  return `${name}_AGREEMENT${signed ? "_SIGNED" : ""}_${year}.pdf`;
}

async function loadVisibleLead(req, leadId) {
  const [[lead]] = await pool.query("SELECT * FROM crm_leads WHERE id = ? AND lead_type = 'commercial'", [leadId]);
  if (!lead) throw new HttpError(404, "Lead not found");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  if (visibleIds !== null && !isOwnLead(lead, req.user.id) && !visibleIds.some((id) => isOwnLead(lead, id))) {
    throw new HttpError(404, "Lead not found");
  }
  if (await isHiddenSalesOwnLead(pool, req, lead)) throw new HttpError(404, "Lead not found");
  return lead;
}
const isConverted = (lead) => lead.lead_status === "converted" || ["WON", "CONVERTED"].includes(lead.pipeline_stage);
const canManage = (req) => req.user.role === "admin" || hasPerm(req, "MANAGE_LEADS");

// Seeing agreements: sales managers and admin only.
function precheckRead(req, res, next) {
  if (!canManage(req)) return sendError(res, new HttpError(403, "Only a sales manager can see agreements"));
  next();
}

// Making an agreement / uploading the signed copy: a sales manager, on a customer.
async function precheckWrite(req, res, next) {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    if (!canManage(req)) throw new HttpError(403, "Only a sales manager can make agreements");
    if (!isConverted(lead)) throw new HttpError(400, "An agreement can be made once the lead is converted to a customer");
    req.lead = lead;
    next();
  } catch (err) {
    sendError(res, err, "Failed to save the agreement");
  }
}

function readContent(body) {
  try {
    return normalizeAgreementContent(body);
  } catch (err) {
    if (err instanceof AgreementInputError) throw new HttpError(400, err.message);
    throw err;
  }
}

// Who signs for BestServe by default: the manager making it (their org designation, else role).
async function signatoryFor(userId) {
  const [[u]] = await pool.query(
    `SELECT u.name, r.name AS role,
            (SELECT d.name FROM user_org_units uo JOIN designations d ON d.id = uo.designation_id
              WHERE uo.user_id = u.id AND (uo.effective_to IS NULL OR uo.effective_to >= CURDATE())
              ORDER BY uo.is_primary DESC, uo.effective_from DESC LIMIT 1) AS designation
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!u) return { name: "", designation: "" };
  // "sales_manager" / "sales manager" -> "Sales Manager" (a designation already in mixed case stays as it is)
  const title = (v) => {
    const t = String(v || "").replace(/_/g, " ").trim();
    return t === t.toLowerCase() ? t.replace(/\b\w/g, (ch) => ch.toUpperCase()) : t;
  };
  return { name: u.name || "", designation: title(u.designation || u.role) };
}

// The word used for the customer in the agreement text, from the lead's industry type.
const INDUSTRY_WORD = {
  restaurant: "Restaurant", apartment: "Apartment", hospital: "Hospital", it: "IT", qsr: "QSR", builder: "Builder", other: "Company",
};
// "The Promont Tata Housing" -> "PROMONT"
function shortNameOf(name) {
  const words = String(name || "").replace(/[^A-Za-z0-9& ]+/g, " ").split(/\s+/).filter(Boolean);
  const first = words.find((w) => !/^(the|m\/s|ms|mr|mrs)$/i.test(w)) || words[0] || "Customer";
  return first.toUpperCase().slice(0, 40);
}
const joinAnd = (list) => (list.length <= 1 ? list[0] || "" : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------------

router.get("/leads/:id/agreements", auth, requirePermission("CRM_VIEW_LEAD"), precheckRead, async (req, res) => {
  try {
    const lead = await loadVisibleLead(req, req.params.id);
    const [rows] = await pool.query(`SELECT ${AGREEMENT_COLUMNS} ${AGREEMENT_FROM} WHERE a.lead_id = ? ORDER BY a.created_at DESC`, [lead.id]);
    const agreements = rows.map(shape);
    // The final agreement: the signed copy uploaded last (there is one).
    const held = agreements
      .filter((a) => a.has_signed)
      .sort((x, y) => String(y.signed_uploaded_at).localeCompare(String(x.signed_uploaded_at)))[0];
    const final = held
      ? {
          agreement_id: held.id,
          agreement_number: held.agreement_number,
          file_name: held.signed_file_name,
          uploaded_at: held.signed_uploaded_at,
          uploaded_by_name: held.signed_uploaded_by_name,
        }
      : null;
    res.json({ can_manage: isConverted(lead), agreements, final });
  } catch (err) {
    sendError(res, err, "Failed to load agreements");
  }
});

// Form defaults: the customer from the lead, the closure amount, and the latest quotation's
// address, contract period and treatment rows (Annexure-1). Everything stays editable on the form.
router.get("/leads/:id/agreements/prefill", auth, requirePermission("CRM_VIEW_LEAD"), precheckWrite, async (req, res) => {
  try {
    const lead = req.lead;
    const [[conv]] = await pool.query(
      "SELECT co.name AS company_name FROM crm_lead_conversions c LEFT JOIN companies co ON co.id = c.company_id WHERE c.lead_id = ?",
      [lead.id]
    );
    const [[q]] = await pool.query(
      `SELECT q.id, q.quotation_number, d.content
         FROM crm_lead_quotations q JOIN crm_lead_quotation_documents d ON d.quotation_id = q.id
        WHERE q.lead_id = ? AND q.status <> 'CANCELLED'
        ORDER BY q.sent_at DESC, q.created_at DESC LIMIT 1`,
      [lead.id]
    );
    const content = q ? (typeof q.content === "string" ? JSON.parse(q.content) : q.content) : null;
    const services = (content?.services || []).map((s) => ({
      name: s.name,
      rows: (s.rows || []).map((r) => ({
        defense_area: r.defense_area || "", material_used: r.material_used || "", treatment_area: r.treatment_area || "", frequency: r.frequency || "",
      })),
    }));
    const name = content?.customer?.name || conv?.company_name || lead.company_name || lead.customer_name || "";
    const months = Number(content?.contractMonths) || 12;
    const start = new Date();
    const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate() - 1);
    // "Weekly Thrice Rat Control / Monitoring, Monthly Twice Cockroaches Control, ..."
    const frequencySummary = services
      .map((s) => `${[...new Set(s.rows.map((r) => r.frequency).filter(Boolean))].join(" / ")} ${s.name}`.trim())
      .join(", ");
    const amount = Number(lead.amount) > 0 ? Number(lead.amount) : Number(content?.totals?.final) || 0;
    // The customer's signatory, from "Represented by": "Ramesh (Facility Manager)" -> Ramesh / Facility Manager.
    const representative = content?.customer?.attention || lead.customer_name || "";
    const rep = /^(.+?)\s*\((.+)\)\s*$/.exec(representative);

    res.json({
      quotation: q ? { id: q.id, number: q.quotation_number } : null,
      content: {
        customer: {
          name,
          shortName: shortNameOf(name),
          industryWord: INDUSTRY_WORD[lead.industry_type] || "Company",
          address: content?.customer?.address || lead.location || "",
          representative,
        },
        signatory: await signatoryFor(req.user.id),
        customerSignatory: { name: rep ? rep[1] : representative, designation: rep ? rep[2] : "", date: toIso(start) },
        termStart: toIso(start),
        termEnd: toIso(end),
        signingDate: toIso(start),
        pestsCovered: joinAnd(services.map((s) => s.name)),
        frequencySummary,
        servicesPhrase: joinAnd(services.map((s) => s.name)),
        monthlyCharge: amount,
        months,
        total: Math.round(amount * months * 100) / 100,
        services,
        quotationId: q ? q.id : null,
      },
    });
  } catch (err) {
    sendError(res, err, "Failed to load the agreement details");
  }
});

router.post("/leads/:id/agreements/preview", auth, requirePermission("CRM_VIEW_LEAD"), precheckWrite, async (req, res) => {
  try {
    const content = readContent(req.body);
    const pdf = await renderAgreementPdf(content, { number: "", draft: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"agreement-preview.pdf\"");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(pdf);
  } catch (err) {
    sendError(res, err, "Failed to preview the agreement");
  }
});

router.post("/leads/:id/agreements", auth, requirePermission("CRM_VIEW_LEAD"), precheckWrite, async (req, res) => {
  const lead = req.lead;
  let objectKey = null;
  try {
    const content = readContent(req.body);
    const agreementId = uuid();
    objectKey = `crm-agreements/${lead.id}/${agreementId}.pdf`;
    await ensureBucket();

    const number = await inTransaction(async (conn) => {
      const n = await nextAgreementNumber(conn);
      const pdf = await renderAgreementPdf(content, { number: n, draft: false });
      await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, pdf, pdf.length, { "Content-Type": "application/pdf" });
      await conn.query(
        `INSERT INTO crm_lead_agreements (id, lead_id, agreement_number, status, term_start, term_end, monthly_amount, content, pdf_object_key, created_by)
         VALUES (?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?)`,
        [agreementId, lead.id, n, content.termStart, content.termEnd, content.monthlyCharge, JSON.stringify(content), objectKey, req.user.id]
      );
      // Only the newest agreement is active - the older ones are cancelled (their PDFs stay viewable;
      // the final signed copy stays until a new one is uploaded).
      await conn.query(
        "UPDATE crm_lead_agreements SET status = 'CANCELLED' WHERE lead_id = ? AND id <> ? AND status <> 'CANCELLED'",
        [lead.id, agreementId]
      );
      await logLeadHistory(conn, lead.id, "AGREEMENT_CREATED", {
        note: `${n}: ${content.customer.name}, ${content.termStart} to ${content.termEnd}, Rs. ${content.monthlyCharge} per month`.slice(0, 500),
        changedBy: req.user.id,
      });
      return n;
    });

    const [[row]] = await pool.query(`SELECT ${AGREEMENT_COLUMNS} ${AGREEMENT_FROM} WHERE a.id = ?`, [agreementId]);
    res.status(201).json({ ...shape(row), agreement_number: number });
  } catch (err) {
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to create the agreement");
  }
});

async function loadAgreement(req) {
  const lead = await loadVisibleLead(req, req.params.id);
  const [[row]] = await pool.query(
    `SELECT a.*, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_text,
            JSON_UNQUOTE(JSON_EXTRACT(a.content, '$.customer.name')) AS client_name
       FROM crm_lead_agreements a WHERE a.id = ? AND a.lead_id = ?`,
    [req.params.agreementId, lead.id]
  );
  if (!row) throw new HttpError(404, "Agreement not found");
  return { lead, row };
}

async function streamPdf(res, objectKey, name) {
  const stream = await minioClient.getObject(process.env.MINIO_BUCKET, objectKey);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("X-Content-Type-Options", "nosniff");
  stream.on("error", (err) => {
    console.error("Agreement PDF stream failed:", err.message);
    res.destroy(err);
  });
  stream.pipe(res);
}

router.get("/leads/:id/agreements/:agreementId/pdf", auth, requirePermission("CRM_VIEW_LEAD"), precheckRead, async (req, res) => {
  try {
    const { row } = await loadAgreement(req);
    if (!row.pdf_object_key) throw new HttpError(404, "This agreement has no PDF");
    await streamPdf(res, row.pdf_object_key, fileName(row.client_name, row.created_at_text, false));
  } catch (err) {
    sendError(res, err, "Failed to load the agreement");
  }
});

router.get("/leads/:id/agreements/:agreementId/content", auth, requirePermission("CRM_VIEW_LEAD"), precheckRead, async (req, res) => {
  try {
    const { row } = await loadAgreement(req);
    res.json(typeof row.content === "string" ? JSON.parse(row.content) : row.content);
  } catch (err) {
    sendError(res, err, "Failed to load the agreement");
  }
});

// The signed copy: one PDF (max 15 MB). Uploading again replaces the earlier signed copy.
const MAX_SIGNED_BYTES = 15 * 1024 * 1024;
const signedUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SIGNED_BYTES, files: 1 } });
function acceptSignedPdf(req, res, next) {
  signedUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 15 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one PDF in the 'file' field." });
  });
}

// The final agreement: the signed copy, kept on the active (newest) agreement. Uploading again
// replaces it - wherever the earlier one was kept, it is removed.
router.post("/leads/:id/agreements/final", auth, requirePermission("CRM_VIEW_LEAD"), precheckWrite, acceptSignedPdf, async (req, res) => {
  const lead = req.lead;
  let objectKey = null;
  try {
    if (!req.file) throw new HttpError(400, "Choose the signed agreement (PDF)");
    const isPdf = req.file.mimetype === "application/pdf" && req.file.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!isPdf) throw new HttpError(400, "The signed agreement must be a PDF file");
    const [[active]] = await pool.query(
      "SELECT id, agreement_number FROM crm_lead_agreements WHERE lead_id = ? AND status <> 'CANCELLED' ORDER BY created_at DESC LIMIT 1",
      [lead.id]
    );
    if (!active) throw new HttpError(400, "Create the agreement first, then upload its signed copy");
    const [earlier] = await pool.query("SELECT signed_object_key FROM crm_lead_agreements WHERE lead_id = ? AND signed_object_key IS NOT NULL", [lead.id]);

    objectKey = `crm-agreements/${lead.id}/${active.id}-signed-${Date.now()}.pdf`;
    await ensureBucket();
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": "application/pdf" });
    await inTransaction(async (conn) => {
      // the earlier final copy goes (an agreement that held it falls back from SIGNED)
      await conn.query(
        `UPDATE crm_lead_agreements SET signed_object_key = NULL, signed_uploaded_by = NULL, signed_uploaded_at = NULL,
                status = IF(status = 'SIGNED', 'CREATED', status)
          WHERE lead_id = ? AND signed_object_key IS NOT NULL`,
        [lead.id]
      );
      await conn.query(
        "UPDATE crm_lead_agreements SET status = 'SIGNED', signed_object_key = ?, signed_uploaded_by = ?, signed_uploaded_at = NOW() WHERE id = ?",
        [objectKey, req.user.id, active.id]
      );
      await logLeadHistory(conn, lead.id, "AGREEMENT_SIGNED", {
        note: `${active.agreement_number}: final signed agreement ${earlier.length ? "replaced" : "uploaded"}`,
        changedBy: req.user.id,
      });
    });
    for (const e of earlier) minioClient.removeObject(process.env.MINIO_BUCKET, e.signed_object_key).catch(() => {});

    const [[updated]] = await pool.query(`SELECT ${AGREEMENT_COLUMNS} ${AGREEMENT_FROM} WHERE a.id = ?`, [active.id]);
    res.json(shape(updated));
  } catch (err) {
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to upload the signed agreement");
  }
});

router.get("/leads/:id/agreements/:agreementId/signed", auth, requirePermission("CRM_VIEW_LEAD"), precheckRead, async (req, res) => {
  try {
    const { row } = await loadAgreement(req);
    if (!row.signed_object_key) throw new HttpError(404, "The signed agreement has not been uploaded yet");
    await streamPdf(res, row.signed_object_key, fileName(row.client_name, row.created_at_text, true));
  } catch (err) {
    sendError(res, err, "Failed to load the signed agreement");
  }
});

module.exports = router;
