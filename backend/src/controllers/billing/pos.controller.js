// Customer purchase orders: standard POs, Open POs (no expiry) and advance POs (Termite: the
// customer pays in advance and each invoice is adjusted against it).
// Payloads: docs/Invoice Generation - API Payloads.docx §8.

const multer = require("multer");
const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const minioClient = require("../../lib/minio");
const C = require("../../services/billing/common");
const calc = require("../../services/billing/calc");
const { logAudit } = require("../../services/Audit.service");

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const FILE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** multer for one file in the "file" field, with readable errors. */
function acceptFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 3 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one file in the 'file' field." });
  });
}

// The PO's current copy = its newest file in customer_po_files (a PO can hold several files).
const LATEST_FILE_SQL = `
  SELECT f.id, f.object_key, f.file_name, f.file_type
    FROM customer_po_files f
   WHERE f.po_id = ?
   ORDER BY f.created_at DESC, f.id DESC
   LIMIT 1`;

// Balance of each PO: STANDARD -> invoiced = issued invoices carrying the PO;
// ADVANCE -> invoiced = advance adjusted on issued invoices; balance = PO amount - invoiced.
const PO_SQL = `
  SELECT po.*, c.name AS customer, bc.contract_code,
         (SELECT f.file_name FROM customer_po_files f WHERE f.po_id = po.id
           ORDER BY f.created_at DESC, f.id DESC LIMIT 1) AS file_name,
         DATEDIFF(po.expiry_date, CURDATE()) AS expires_in_days,
         CASE WHEN po.po_kind = 'ADVANCE'
              THEN (SELECT COALESCE(SUM(baa.amount), 0) FROM billing_advance_adjustments baa
                     WHERE baa.po_id = po.id AND baa.is_reversed = 0)
              ELSE (SELECT COALESCE(SUM(bi.total), 0) FROM billing_invoice_pos bp
                      JOIN billing_invoices bi ON bi.id = bp.invoice_id AND bi.status = 'ISSUED'
                     WHERE bp.po_id = po.id)
         END AS invoiced
    FROM customer_pos po
    JOIN companies c ON c.id = po.company_id
    LEFT JOIN billing_contracts bc ON bc.id = po.contract_id`;

function poOut(r) {
  const amount = C.n2(r.po_amount);
  const invoiced = Number(r.invoiced || 0);
  const expires = r.expires_in_days === null || r.expires_in_days === undefined ? null : Number(r.expires_in_days);
  let display = r.status === "CLOSED" ? "CLOSED" : "ACTIVE";
  if (display === "ACTIVE" && expires !== null && expires < 0) display = "EXPIRED";
  else if (display === "ACTIVE" && expires !== null && expires <= 30) display = "EXPIRING";
  return {
    id: r.id,
    source: r.source,
    po_number: r.po_number,
    company_id: r.company_id,
    customer: r.customer,
    contract_id: r.contract_id,
    contract_code: r.contract_code || null,
    po_date: C.ymd(r.po_date),
    valid_from: C.ymd(r.valid_from),
    expiry_date: C.ymd(r.expiry_date),
    is_open_po: r.expiry_date === null,
    kind: r.po_kind,
    po_source: r.po_source || null,
    po_amount: amount,
    invoiced: calc.round2(invoiced),
    balance: amount === null ? null : calc.round2(amount - invoiced),
    status: r.status,
    display_status: display,
    expires_in_days: expires,
    remarks: r.remarks,
    file_name: r.file_name || null,
  };
}

/** PO fields from the request (create and update). */
async function readPo(db, b, { existing = null } = {}) {
  const merged = existing ? { ...existing, ...b } : b;
  const companyId = existing ? existing.company_id : C.str(b.company_id, "company_id", { required: true, max: 20 });
  if (!existing) {
    const [[company]] = await db.query("SELECT id FROM companies WHERE id = ?", [companyId]);
    if (!company) throw C.notFound("Customer not found");
  }
  const contractId = C.str(merged.contract_id, "contract_id", { max: 36 });
  if (contractId) {
    const [[contract]] = await db.query("SELECT company_id FROM billing_contracts WHERE id = ?", [contractId]);
    if (!contract || contract.company_id !== companyId) throw C.bad("The contract does not belong to this customer");
  }
  const po = {
    company_id: companyId,
    contract_id: contractId,
    po_number: C.str(merged.po_number, "po_number", { required: true, max: 100 }),
    po_date: C.date(merged.po_date, "po_date", { required: true }),
    valid_from: C.date(merged.valid_from, "valid_from"),
    expiry_date: C.date(merged.expiry_date, "expiry_date"),
    po_amount: C.num(merged.po_amount, "po_amount", { min: 0, max: 99999999999 }),
    po_kind: C.oneOf(merged.kind ?? merged.po_kind, "kind", ["STANDARD", "ADVANCE"], { fallback: "STANDARD" }),
    po_source: C.str(merged.po_source, "po_source", { max: 255 }),
    status: C.oneOf(merged.status, "status", ["ACTIVE", "CLOSED"], { fallback: "ACTIVE" }),
    remarks: C.str(merged.remarks, "remarks", { max: 1000 }),
  };
  if (po.expiry_date && po.expiry_date < (po.valid_from || po.po_date)) throw C.bad("expiry_date cannot be before the PO starts");
  // The PO amount is required on every PO (an advance PO always needed it).
  if (po.po_amount === null || po.po_amount <= 0) throw C.bad(po.po_kind === "ADVANCE" ? "An advance PO needs the PO amount" : "Enter the PO amount");
  return po;
}

// GET /pos?company_id&contract_id&expiring_in_days&kind&status&open_po&expired&q
const listPos = C.handle("Failed to load purchase orders", async (req, res) => {
  const companyId = C.str(req.query.company_id, "company_id", { max: 20 });
  const contractId = C.str(req.query.contract_id, "contract_id", { max: 36 });
  const kind = C.oneOf(req.query.kind, "kind", ["STANDARD", "ADVANCE"], { required: false });
  const status = C.oneOf(req.query.status, "status", ["ACTIVE", "CLOSED"], { required: false });
  const expiring = C.num(req.query.expiring_in_days, "expiring_in_days", { min: 0, max: 365, integer: true });
  const q = C.str(req.query.q, "q", { max: 100 });
  const [rows] = await pool.query(
    `${PO_SQL}
      WHERE po.source = 'BILLING' AND (? IS NULL OR po.company_id = ?) AND (? IS NULL OR po.contract_id = ?) AND (? IS NULL OR po.po_kind = ?)
        AND (? IS NULL OR po.status = ?)
        AND (? IS NULL OR (po.expiry_date IS NOT NULL AND po.expiry_date >= CURDATE() AND po.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)))
        AND (? IS NULL OR po.po_number LIKE CONCAT('%', ?, '%') OR c.name LIKE CONCAT('%', ?, '%'))
      ORDER BY (po.expiry_date IS NULL), po.expiry_date, po.po_date DESC`,
    [companyId, companyId, contractId, contractId, kind, kind, status, status, expiring, expiring, q, q, q]
  );
  let out = rows.map(poOut);
  if (C.bool(req.query.open_po)) out = out.filter((p) => p.is_open_po);
  if (C.bool(req.query.expired)) out = out.filter((p) => p.display_status === "EXPIRED");

  const [[s]] = await pool.query(
    `SELECT SUM(status = 'ACTIVE') AS active,
            SUM(status = 'ACTIVE' AND expiry_date IS NULL) AS open_po,
            SUM(status = 'ACTIVE' AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_30_days,
            SUM(status = 'ACTIVE' AND expiry_date < CURDATE()) AS expired
       FROM customer_pos WHERE source = 'BILLING'`
  );
  const [[adv]] = await pool.query(
    `SELECT COALESCE(SUM(p.received_amount - COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0)), 0) AS remaining
       FROM customer_po_advances a
       JOIN customer_pos po ON po.id = a.po_id AND po.status = 'ACTIVE'
       JOIN payments p ON p.id = a.payment_id AND p.status = 'POSTED'`
  );
  res.json({
    rows: out,
    summary: {
      active: Number(s.active || 0),
      open_po: Number(s.open_po || 0),
      expiring_30_days: Number(s.expiring_30_days || 0),
      expired: Number(s.expired || 0),
      advance_remaining: calc.round2(adv.remaining),
    },
  });
});

async function poDetail(db, id) {
  const [[row]] = await db.query(`${PO_SQL} WHERE po.id = ?`, [id]);
  if (!row) throw C.notFound("PO not found");
  const [invoices] = await db.query(
    `SELECT bi.id, bi.invoice_number, DATE_FORMAT(bi.invoice_date, '%Y-%m-%d') AS date, bi.total AS amount, bi.advance_adjusted, bi.status
       FROM billing_invoice_pos bp JOIN billing_invoices bi ON bi.id = bp.invoice_id
      WHERE bp.po_id = ? AND bi.status IN ('ISSUED', 'CANCELLED')
      ORDER BY bi.invoice_date DESC`,
    [id]
  );
  const [advances] = await db.query(
    `SELECT p.id AS payment_id, p.payment_number, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS date, p.received_amount AS received,
            COALESCE((SELECT SUM(baa.amount) FROM billing_advance_adjustments baa WHERE baa.payment_id = p.id AND baa.is_reversed = 0), 0) AS adjusted,
            p.received_amount - COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0) AS remaining
       FROM customer_po_advances a JOIN payments p ON p.id = a.payment_id
      WHERE a.po_id = ?
      ORDER BY p.payment_date`,
    [id]
  );
  return {
    ...poOut(row),
    invoices: invoices.map((i) => ({ ...i, amount: Number(i.amount), advance_adjusted: Number(i.advance_adjusted) })),
    advances: advances.map((a) => ({ ...a, received: Number(a.received), adjusted: Number(a.adjusted), remaining: calc.round2(a.remaining) })),
    file: row.file_name ? { name: row.file_name, url: `/api/billing/pos/${id}/file` } : null,
  };
}

// POST /pos
const createPo = C.handle("Failed to save the PO", async (req, res) => {
  const po = await readPo(pool, req.body || {});
  const id = uuid();
  try {
    await pool.query(
      `INSERT INTO customer_pos (id, company_id, contract_id, po_number, po_date, valid_from, expiry_date, po_amount, po_kind, po_source, status, remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, po.company_id, po.contract_id, po.po_number, po.po_date, po.valid_from, po.expiry_date, po.po_amount, po.po_kind, po.po_source, po.status, po.remarks, req.user.id, req.user.id]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw C.conflict(`PO ${po.po_number} already exists for this customer`);
    throw err;
  }
  await logAudit(pool, req, {
    module: "BILLING", action: "PO_CREATED", entity_type: "CUSTOMER_PO", entity_id: id, entity_label: po.po_number,
    customer_id: po.company_id, summary: `PO ${po.po_number} added${po.expiry_date ? ` (expires ${C.dmy(po.expiry_date)})` : " (Open PO)"}`,
  });
  res.status(201).json({ id, po_number: po.po_number, status: po.status });
});

// GET /pos/:id
const getPo = C.handle("Failed to load the PO", async (req, res) => {
  res.json(await poDetail(pool, req.params.id));
});

// PUT /pos/:id
const updatePo = C.handle("Failed to update the PO", async (req, res) => {
  const [[existing]] = await pool.query("SELECT * FROM customer_pos WHERE id = ?", [req.params.id]);
  if (!existing) throw C.notFound("PO not found");
  const current = { ...existing, po_date: C.ymd(existing.po_date), valid_from: C.ymd(existing.valid_from), expiry_date: C.ymd(existing.expiry_date), kind: existing.po_kind };
  const po = await readPo(pool, req.body || {}, { existing: current });
  const [[used]] = await pool.query("SELECT COUNT(*) AS n FROM billing_invoice_pos bp JOIN billing_invoices bi ON bi.id = bp.invoice_id AND bi.status = 'ISSUED' WHERE bp.po_id = ?", [req.params.id]);
  if (Number(used.n) && (po.po_number !== existing.po_number || po.po_kind !== existing.po_kind)) {
    throw C.bad("The PO number and type cannot change once invoices are issued against it");
  }
  try {
    await pool.query(
      `UPDATE customer_pos SET contract_id = ?, po_number = ?, po_date = ?, valid_from = ?, expiry_date = ?, po_amount = ?, po_kind = ?,
              po_source = ?, status = ?, remarks = ?, updated_by = ? WHERE id = ?`,
      [po.contract_id, po.po_number, po.po_date, po.valid_from, po.expiry_date, po.po_amount, po.po_kind, po.po_source, po.status, po.remarks, req.user.id, req.params.id]
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw C.conflict(`PO ${po.po_number} already exists for this customer`);
    throw err;
  }
  res.json(await poDetail(pool, req.params.id));
});

// POST /pos/:id/file  (multipart, field "file": PDF, JPG or PNG, max 3 MB)
// Adds a file to the PO; the newest one is the PO's current copy. Earlier copies are kept.
const uploadPoFile = C.handle("Failed to upload the PO copy", async (req, res) => {
  const [[po]] = await pool.query("SELECT id FROM customer_pos WHERE id = ?", [req.params.id]);
  if (!po) throw C.notFound("PO not found");
  if (!req.file) throw C.bad("Send the PO copy in the 'file' field");
  if (!FILE_TYPES.has(req.file.mimetype)) throw C.bad("The PO copy must be a PDF, JPG or PNG");
  const name = String(req.file.originalname || "po").replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const objectKey = `billing/pos/${po.id}/${Date.now()}-${name}`;
  if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
    await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
  }
  await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": req.file.mimetype });
  await pool.query(
    `INSERT INTO customer_po_files (id, po_id, object_key, file_name, file_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), po.id, objectKey, name, req.file.mimetype, req.file.size, req.user.id]
  );
  await pool.query("UPDATE customer_pos SET updated_by = ? WHERE id = ?", [req.user.id, po.id]);
  res.json({ name, size: req.file.size });
});

// GET /pos/:id/file  -> the PO's current (newest) copy
const downloadPoFile = C.handle("Failed to open the PO copy", async (req, res) => {
  const [[file]] = await pool.query(LATEST_FILE_SQL, [req.params.id]);
  if (!file) throw C.notFound("No PO copy uploaded");
  const stream = await minioClient.getObject(process.env.MINIO_BUCKET, file.object_key);
  const ext = String(file.file_name || "").toLowerCase().split(".").pop();
  const type = file.file_type || (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg");
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || "po")}`);
  stream.on("error", () => res.end());
  stream.pipe(res);
});

// POST /pos/:id/advances { payment_id }
const linkAdvance = C.handle("Failed to link the advance", async (req, res) => {
  const paymentId = C.str(req.body?.payment_id, "payment_id", { required: true, max: 36 });
  await C.inTransaction(pool, async (conn) => {
    const [[po]] = await conn.query("SELECT * FROM customer_pos WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!po) throw C.notFound("PO not found");
    if (po.po_kind !== "ADVANCE") throw C.bad("Advances can only be linked to an advance PO");
    const [[payment]] = await conn.query("SELECT id, customer_id, status, payment_number FROM payments WHERE id = ?", [paymentId]);
    if (!payment) throw C.notFound("Payment not found");
    if (payment.status !== "POSTED") throw C.bad("Only a posted payment can be linked as an advance");
    if (payment.customer_id !== po.company_id) throw C.bad("This payment belongs to another customer");
    const [[linked]] = await conn.query(
      "SELECT po.po_number FROM customer_po_advances a JOIN customer_pos po ON po.id = a.po_id WHERE a.payment_id = ?",
      [paymentId]
    );
    if (linked) throw C.conflict(`This payment is already linked to PO ${linked.po_number}`);
    await conn.query("INSERT INTO customer_po_advances (id, po_id, payment_id, created_by) VALUES (?, ?, ?, ?)", [uuid(), po.id, paymentId, req.user.id]);
    await logAudit(conn, req, {
      module: "BILLING", action: "PO_ADVANCE_LINKED", entity_type: "CUSTOMER_PO", entity_id: po.id, entity_label: po.po_number,
      customer_id: po.company_id, summary: `Payment ${payment.payment_number} linked as advance to PO ${po.po_number}`,
    });
  });
  const detail = await poDetail(pool, req.params.id);
  res.json({
    advance_received: calc.round2(detail.advances.reduce((t, a) => t + a.received, 0)),
    advance_remaining: calc.round2(detail.advances.reduce((t, a) => t + a.remaining, 0)),
  });
});

// GET /payments?company_id=  -> the customer's posted payments with money not yet allocated
// (what can be linked as an advance), and whether each is already linked to a PO.
const advanceCandidates = C.handle("Failed to load payments", async (req, res) => {
  const companyId = C.str(req.query.company_id, "company_id", { required: true, max: 20 });
  const [rows] = await pool.query(
    `SELECT p.id AS payment_id, p.payment_number, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS payment_date, p.received_amount,
            p.received_amount - COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0) AS unallocated,
            (SELECT po.po_number FROM customer_po_advances a JOIN customer_pos po ON po.id = a.po_id WHERE a.payment_id = p.id) AS linked_po
       FROM payments p
      WHERE p.customer_id = ? AND p.status = 'POSTED'
      ORDER BY p.payment_date DESC`,
    [companyId]
  );
  res.json(
    rows
      .map((r) => ({ ...r, received_amount: Number(r.received_amount), unallocated: calc.round2(r.unallocated) }))
      .filter((r) => r.unallocated > 0 || r.linked_po)
  );
});

module.exports = { acceptFile, listPos, createPo, getPo, updatePo, uploadPoFile, downloadPoFile, linkAdvance, advanceCandidates };
