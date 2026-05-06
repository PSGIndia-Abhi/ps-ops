
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const multer = require("multer");
const minioClient = require("../lib/minio");
const { v4: uuid } = require("uuid");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const upload = multer({
  storage: multer.memoryStorage(),
});
router.get("/:id/view", auth, requirePermission(PERMISSIONS.VIEW_JOB), async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    // 1. Fetch attachment metadata
    const [[att]] = await connection.query(
      `
      SELECT object_key, file_type, file_name
      FROM job_attachments
      WHERE id = ?
      `,
      [id]
    );

    if (!att) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // 2. Get file stream from MinIO
    const stream = await minioClient.getObject(
      process.env.MINIO_BUCKET,
      att.object_key
    );

    // 3. Set headers
    res.setHeader("Content-Type", att.file_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${att.file_name}"`
    );

    // 4. Pipe to response
    stream.pipe(res);
  } catch (err) {
    console.error("Failed to stream attachment:", err);
    res.status(500).json({ error: "Failed to load attachment" });
  } finally {
    connection.release();
  }

  
});



module.exports = router;
