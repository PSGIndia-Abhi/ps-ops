// Payments against issued invoices, recorded in Billing (services/billing/payment.service.js).
//   GET    /invoices/:id/payments          summary + payments
//   POST   /invoices/:id/payments          multipart: the form fields + optional "proof" file (PDF/JPG/PNG, max 5 MB)
//   GET    /invoice-payments/:id/proof     the proof file
//   DELETE /invoice-payments/:id           { reason }  (removes a wrong entry, kept with the reason)

const multer = require("multer");
const { pool } = require("../../../db");
const minioClient = require("../../lib/minio");
const C = require("../../services/billing/common");
const PAY = require("../../services/billing/payment.service");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** multer for an optional file in the "proof" field, with readable errors. */
function acceptProof(req, res, next) {
  upload.single("proof")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "The proof file is too large (max 5 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send the proof as one file in the 'proof' field." });
  });
}

const list = C.handle("Failed to load the payments", async (req, res) => {
  res.json(await PAY.forInvoice(pool, req.params.id));
});

const create = C.handle("Failed to record the payment", async (req, res) => {
  const p = PAY.readPayment(req.body || {}); // check the form before storing any file
  let proof = null;
  if (req.file) {
    if (!FILE_TYPES.has(req.file.mimetype)) throw C.bad("The proof must be a PDF, JPG or PNG");
    const name = String(req.file.originalname || "proof").replace(/[^\w.\- ]+/g, "_").slice(0, 200);
    const objectKey = `billing/payments/${req.params.id}/${Date.now()}-${name}`;
    if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
    }
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": req.file.mimetype });
    proof = { object_key: objectKey, file_name: name, file_type: req.file.mimetype };
  }
  await C.inTransaction(pool, (conn) => PAY.recordPayment(conn, req, req.params.id, p, proof));
  res.status(201).json(await PAY.forInvoice(pool, req.params.id));
});

const proof = C.handle("Failed to open the proof", async (req, res) => {
  const [[f]] = await pool.query(
    "SELECT proof_object_key, proof_file_name, proof_file_type FROM billing_invoice_payments WHERE id = ? AND deleted_at IS NULL",
    [req.params.id]
  );
  if (!f || !f.proof_object_key) throw C.notFound("No proof uploaded for this payment");
  const stream = await minioClient.getObject(process.env.MINIO_BUCKET, f.proof_object_key);
  res.setHeader("Content-Type", f.proof_file_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.proof_file_name || "proof")}`);
  stream.on("error", () => res.end());
  stream.pipe(res);
});

const remove = C.handle("Failed to remove the payment", async (req, res) => {
  const reason = C.str(req.body?.reason, "Reason", { required: true, max: 500 });
  const invoiceId = await C.inTransaction(pool, (conn) => PAY.removePayment(conn, req, req.params.id, reason));
  res.json(await PAY.forInvoice(pool, invoiceId));
});

module.exports = { acceptProof, list, create, proof, remove };
