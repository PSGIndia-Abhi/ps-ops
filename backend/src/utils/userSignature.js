// A person's own signature image (user_signatures + MinIO), printed on the quotations they make.
// Only ever read for the person themselves or for a document they are generating.

const { pool } = require("../../db");
const minioClient = require("../lib/minio");

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/** "image/png" / "image/jpeg" from the file's first bytes, or null - the name or browser type is not trusted. */
function signatureImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return null;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** The signature row for a user ({ object_key, content_type, uploaded_at }), or null. */
async function findSignature(userId, executor = pool) {
  try {
    const [[row]] = await executor.query(
      "SELECT object_key, content_type, uploaded_at FROM user_signatures WHERE user_id = ?",
      [userId]
    );
    return row || null;
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") return null; // migration not run yet: nobody has one
    throw err;
  }
}

/**
 * The user's signature image as a Buffer, or null when they have none. Never throws: a document
 * must still generate (just without the signature) if the image cannot be read.
 */
async function loadSignatureImage(userId) {
  try {
    const row = await findSignature(userId);
    if (!row) return null;
    const buffer = await streamToBuffer(await minioClient.getObject(process.env.MINIO_BUCKET, row.object_key));
    return signatureImageType(buffer) ? buffer : null;
  } catch (err) {
    console.error("Signature image could not be read:", err?.message || err);
    return null;
  }
}

module.exports = { MAX_SIGNATURE_BYTES, signatureImageType, streamToBuffer, findSignature, loadSignatureImage };
