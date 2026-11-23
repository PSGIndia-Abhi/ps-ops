// Files attached to the monthly SOS (optional): the Service Coordinator attaches them per customer
// and month; Accounts see them on the SOS, the draft and the issued invoice, and they go with the
// invoice email (manual and automatic) for every month the invoice period covers.
// Table: billing_sos_files (20261130_billing_sos_files.sql). Files are stored in MinIO.

const { v4: uuid } = require("uuid");
const minioClient = require("../../lib/minio");
const C = require("./common");
const S = require("./sos.service");

const MAX_FILE_BYTES = 10 * 1024 * 1024; // per file
const MAX_FILES = 10; // per customer and month
const MAX_EMAIL_BYTES = 20 * 1024 * 1024; // all SOS files on one email (mail servers refuse ~25 MB)

// Any file format is accepted (only the size and the number of files are limited).

const bucket = () => process.env.MINIO_BUCKET;
const NOT_SET_UP = "SOS attachments are not set up yet - run the migration 20261130_billing_sos_files.sql";
const missingTable = (err) => err?.code === "ER_NO_SUCH_TABLE" && /billing_sos_files/.test(err.message || "");

/** Runs fn; a missing billing_sos_files table becomes a clear 503 instead of the generic billing message. */
async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (missingTable(err)) throw new C.HttpError(503, NOT_SET_UP);
    throw err;
  }
}
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function out(r) {
  return {
    id: r.id,
    month: C.ymd(r.month),
    file_name: r.file_name,
    file_type: r.file_type || null,
    file_size: Number(r.file_size) || 0,
    uploaded_by: r.uploaded_by_name || null,
    uploaded_at: r.created_at,
  };
}

const LIST_SQL = `
  SELECT f.*, u.name AS uploaded_by_name
    FROM billing_sos_files f LEFT JOIN users u ON u.id = f.uploaded_by`;

/** Files of one customer and month, the latest upload first. */
async function listFor(db, companyId, month) {
  const [rows] = await db.query(`${LIST_SQL} WHERE f.company_id = ? AND f.month = ? ORDER BY f.created_at DESC, f.file_name`, [companyId, S.monthStart(month)]);
  return rows.map(out);
}

/** The calendar months an invoice uses (none for a manual invoice or one without a period). */
function invoiceMonths(inv) {
  if (Number(inv.is_manual) || !inv.period_start || !inv.period_end) return [];
  const ps = C.ymd(inv.period_start);
  const pe = C.ymd(inv.period_end);
  return S.monthStarts(ps, S.monthsIn(ps, pe));
}

/** Files for an invoice: every SOS month of its period, for its customer - the latest upload first. */
async function forInvoice(db, inv) {
  const months = invoiceMonths(inv);
  if (!months.length) return [];
  const [rows] = await db.query(`${LIST_SQL} WHERE f.company_id = ? AND f.month IN (?) ORDER BY f.created_at DESC, f.file_name`, [inv.company_id, months]);
  return rows.map(out);
}

/** Refuses a change when the SOS is submitted or the month is invoiced. */
async function assertEditable(db, companyId, month) {
  const m = S.monthStart(month);
  if (m > S.monthStart(C.todayIst())) throw C.bad("Files can be attached up to the current month");
  const [[company]] = await db.query("SELECT id FROM companies WHERE id = ?", [companyId]);
  if (!company) throw C.notFound("Customer not found");
  const [[so]] = await db.query("SELECT status FROM billing_sos WHERE company_id = ? AND month = ?", [companyId, m]);
  if (so?.status === "SUBMITTED") throw C.bad("This SOS is submitted. Reopen it to change the attachments.");
  const invoiced = await S.invoicedFor(db, companyId, m);
  if (invoiced.length) throw C.bad(`${C.monthName(m)} is already invoiced (${invoiced.join(", ")}). The attachments are locked.`);
  return m;
}

/** Stores an uploaded file (multer memory file) for the customer and month. */
async function addFile(db, req, companyId, month, file) {
  if (!file) throw C.bad("Choose a file to attach");
  const m = await assertEditable(db, companyId, month);
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM billing_sos_files WHERE company_id = ? AND month = ?", [companyId, m]);
  if (Number(n) >= MAX_FILES) throw C.bad(`At most ${MAX_FILES} files per SOS. Remove one to attach another.`);

  const name = String(file.originalname || "file").replace(/[^\w.\- ()]+/g, "_").slice(0, 200) || "file";
  const objectKey = `billing/sos/${companyId}/${m.slice(0, 7)}/${Date.now()}-${name}`;
  if (!(await minioClient.bucketExists(bucket()))) await minioClient.makeBucket(bucket(), process.env.MINIO_REGION || "us-east-1");
  await minioClient.putObject(bucket(), objectKey, file.buffer, file.buffer.length, { "Content-Type": file.mimetype || "application/octet-stream" });
  const id = uuid();
  await db.query(
    `INSERT INTO billing_sos_files (id, company_id, month, object_key, file_name, file_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, m, objectKey, name, file.mimetype || null, file.size, req.user.id]
  );
  return id;
}

/** Removes one file of the customer and month (the row, then the stored object). */
async function removeFile(db, companyId, month, fileId) {
  const m = await assertEditable(db, companyId, month);
  const [[f]] = await db.query("SELECT id, object_key FROM billing_sos_files WHERE id = ? AND company_id = ? AND month = ?", [fileId, companyId, m]);
  if (!f) throw C.notFound("File not found");
  await db.query("DELETE FROM billing_sos_files WHERE id = ?", [f.id]);
  await minioClient.removeObject(bucket(), f.object_key).catch((err) => console.error("SOS file not removed from storage:", err.message));
}

async function fileRow(db, fileId) {
  const [[f]] = await db.query("SELECT * FROM billing_sos_files WHERE id = ?", [fileId]);
  if (!f) throw C.notFound("File not found");
  return f;
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * The invoice's SOS files as email attachments: { attachments, count, tooLarge, totalBytes }.
 * When together they are over the email limit nothing is attached and tooLarge is true.
 */
async function emailAttachments(db, inv) {
  let files;
  try {
    files = await forInvoice(db, inv);
  } catch (err) {
    // Not set up yet: the invoice is still emailed, without SOS files.
    if (missingTable(err)) return { attachments: [], count: 0, tooLarge: false, totalBytes: 0 };
    throw err;
  }
  const totalBytes = files.reduce((t, f) => t + f.file_size, 0);
  if (!files.length) return { attachments: [], count: 0, tooLarge: false, totalBytes };
  if (totalBytes > MAX_EMAIL_BYTES) return { attachments: [], count: files.length, tooLarge: true, totalBytes };
  const [rows] = await db.query("SELECT id, object_key FROM billing_sos_files WHERE id IN (?)", [files.map((f) => f.id)]);
  const keyOf = new Map(rows.map((r) => [r.id, r.object_key]));
  const attachments = [];
  for (const f of files) {
    const content = await readAll(await minioClient.getObject(bucket(), keyOf.get(f.id)));
    attachments.push({ filename: f.file_name, content, contentType: f.file_type || "application/octet-stream" });
  }
  return { attachments, count: files.length, tooLarge: false, totalBytes };
}

module.exports = {
  MAX_FILE_BYTES, MAX_FILES, MAX_EMAIL_BYTES, mb,
  listFor: (...a) => guarded(() => listFor(...a)),
  forInvoice: (...a) => guarded(() => forInvoice(...a)),
  addFile: (...a) => guarded(() => addFile(...a)),
  removeFile: (...a) => guarded(() => removeFile(...a)),
  fileRow: (...a) => guarded(() => fileRow(...a)),
  emailAttachments,
};
