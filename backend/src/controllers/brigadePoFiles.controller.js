// Brigade PO files: documents attached to a client PO (the PO copy, the email it
// came in, ...). Kept per PO number, so the booking form's Client PO section and
// the Billing PO page share them. Files live in MinIO; brigade_po_files holds
// only where each one is (database/brigade/04_brigade_po_files.sql).

const multer = require("multer");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const minioClient = require("../lib/minio");

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
// Any format may be uploaded. Only these open in the browser; everything else
// (html, svg, ...) is always downloaded, so a file can never run as a page here.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

const FILE_COLUMNS = `f.id, f.po_number, f.file_name, f.file_type, f.file_size, f.created_at,
                      f.uploaded_by_user_id, u.name AS uploaded_by_name`;
const FILE_SQL = `SELECT ${FILE_COLUMNS} FROM brigade_po_files f LEFT JOIN users u ON u.id = f.uploaded_by_user_id`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // The table comes from a separate script; say so instead of a bare 500.
  if (err?.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({ error: "PO files are not set up yet - run database/brigade/04_brigade_po_files.sql" });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

function readPoNumber(value) {
  const number = typeof value === "string" ? value.trim() : "";
  if (!number) throw new HttpError(400, "po_number is required");
  if (number.length > 100) throw new HttpError(400, "po_number is too long (max 100 characters)");
  return number;
}

// multer for one file in the "file" field, with readable errors.
function acceptFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 3 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one file in the 'file' field." });
  });
}

// GET /api/brigade/po-files?po_number=
async function listPoFiles(req, res) {
  try {
    const number = readPoNumber(req.query.po_number);
    const [rows] = await pool.query(`${FILE_SQL} WHERE f.po_number = ? ORDER BY f.created_at ASC`, [number]);
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load PO files");
  }
}

// POST /api/brigade/po-files - multipart/form-data: po_number + one file in "file"
async function uploadPoFile(req, res) {
  let objectKey = null;
  try {
    const number = readPoNumber(req.body?.po_number);
    if (!req.file) throw new HttpError(400, "file is required");
    // multer decodes filenames as latin1; restore the real UTF-8 name.
    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8").slice(0, 255);
    const rawExt = (fileName.split(".").pop() || "").toLowerCase();
    const ext = /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : "bin";
    const fileType = (req.file.mimetype || "application/octet-stream").slice(0, 100);
    const id = uuid();
    objectKey = `brigade/po-files/${uuid()}.${ext}`;

    // Same lazy bucket creation the other uploads do.
    if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
    }
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": fileType });
    await pool.query(
      `INSERT INTO brigade_po_files (id, po_number, object_key, file_name, file_type, file_size, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, number, objectKey, fileName, fileType, req.file.buffer.length, req.user.id]
    );
    const [[row]] = await pool.query(`${FILE_SQL} WHERE f.id = ?`, [id]);
    res.status(201).json(row);
  } catch (err) {
    // Saving the row failed after the file was stored: don't leave an orphan file behind.
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to upload the file");
  }
}

// GET /api/brigade/po-files/:id/view - streams the file
async function viewPoFile(req, res) {
  try {
    const [[file]] = await pool.query("SELECT object_key, file_type, file_name FROM brigade_po_files WHERE id = ?", [req.params.id]);
    if (!file) throw new HttpError(404, "File not found");
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, file.object_key);
    const inline = INLINE_TYPES.has(file.file_type);
    res.setHeader("Content-Type", inline ? file.file_type : "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.on("error", (err) => {
      console.error("PO file stream failed:", err.message);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to open the file");
  }
}

// DELETE /api/brigade/po-files/:id
async function deletePoFile(req, res) {
  try {
    const [[file]] = await pool.query("SELECT object_key FROM brigade_po_files WHERE id = ?", [req.params.id]);
    if (!file) throw new HttpError(404, "File not found");
    await pool.query("DELETE FROM brigade_po_files WHERE id = ?", [req.params.id]);
    // The file goes after the row; a failed removal leaves an unreferenced file, never a broken row.
    minioClient.removeObject(process.env.MINIO_BUCKET, file.object_key).catch((err) => {
      console.error(`Failed to remove PO file ${file.object_key}:`, err.message);
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to remove the file");
  }
}

module.exports = { acceptFile, listPoFiles, uploadPoFile, viewPoFile, deletePoFile };
