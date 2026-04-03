const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const multer = require("multer");
const minioClient = require("../lib/minio");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { v4: uuid } = require("uuid");
const { resolveGroupTable } = require("../utils/groupTable");

const upload = multer({
  storage: multer.memoryStorage(),
});

const buildLogoUrl = (companyId) => `/api/companies/${companyId}/logo`;

// GET /api/companies (legal entities)
router.get("/", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  const { group_id } = req.query;

  try {
    const groupTable = await resolveGroupTable(pool);
     const groupRef = "`group_name`";
    let sql = `
      SELECT
        c.id,
        c.name,
        c.code,
        c.gst_number,
        c.type,
        c.is_active,
        c.group_id,
        g.name AS group_name,
        c.logo_object_key,
        c.logo_file_name,
        c.logo_file_type
      FROM companies c
      LEFT JOIN ${groupRef} g ON g.id = c.group_id
    `;

    const params = [];
    if (group_id) {
      sql += " WHERE c.group_id = ?";
      params.push(group_id);
    }

    sql += " ORDER BY c.name ASC";

    let rows = [];
    try {
      const [result] = await pool.query(sql, params);
      rows = result;
    } catch (err) {
      if (err?.code === "ER_BAD_FIELD_ERROR") {
        const fallbackSql = `
          SELECT
            c.id,
            c.name,
            c.code,
            c.gst_number,
            c.type,
            c.is_active,
            c.group_id,
            g.name AS group_name
          FROM companies c
          LEFT JOIN ${groupRef} g ON g.id = c.group_id
          ${group_id ? "WHERE c.group_id = ?" : ""}
          ORDER BY c.name ASC
        `;
        const [fallbackRows] = await pool.query(
          fallbackSql,
          group_id ? params : []
        );
        rows = fallbackRows;
      } else {
        throw err;
      }
    }
    res.json(
      rows.map((row) => ({
        ...row,
        logo_url: row.logo_object_key ? buildLogoUrl(row.id) : null,
      }))
    );
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

// POST /api/companies (legal entity)
router.post("/", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  const { group_id, name, code, gst_number, type } = req.body || {};

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const trimmedGst = typeof gst_number === "string" ? gst_number.trim() : "";
  const normalizedType = typeof type === "string" ? type.trim().toUpperCase() : "";
  const allowedTypes = new Set(["INDIVIDUAL", "CORPORATE", "RWA"]);

  if (!trimmedName) {
    return res.status(400).json({ error: "Company name is required" });
  }

  if (normalizedType && !allowedTypes.has(normalizedType)) {
    return res.status(400).json({ error: "Invalid company type" });
  }

  try {
    const groupTable = await resolveGroupTable(pool);
     const groupRef = "`group_name`";
    let resolvedGroupId = group_id || null;
    if (resolvedGroupId) {
      const [[group]] = await pool.query(
      `SELECT id FROM ${groupRef} WHERE id = ?`,
        [resolvedGroupId]
      );
      if (!group) {
        return res.status(400).json({ error: "Invalid group" });
      }
    }

    const [existing] = await pool.query(
      "SELECT id FROM companies WHERE name = ? AND (group_id <=> ?)",
      [trimmedName, resolvedGroupId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Company already exists for this group" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO companies
      (id, group_id, name, code, gst_number, type, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        id,
        resolvedGroupId,
        trimmedName,
        trimmedCode || null,
        trimmedGst || null,
        normalizedType || null
      ]
    );

    let created = null;
    try {
      const [[row]] = await pool.query(
        `
        SELECT
          c.id,
          c.name,
          c.code,
          c.gst_number,
          c.type,
          c.is_active,
          c.group_id,
          g.name AS group_name,
          c.logo_object_key,
          c.logo_file_name,
          c.logo_file_type
        FROM companies c
        LEFT JOIN ${groupRef} g ON g.id = c.group_id
        WHERE c.id = ?
        `,
        [id]
      );
      created = row;
    } catch (err) {
      if (err?.code === "ER_BAD_FIELD_ERROR") {
        const [[row]] = await pool.query(
          `
          SELECT
            c.id,
            c.name,
            c.code,
            c.gst_number,
            c.type,
            c.is_active,
            c.group_id,
            g.name AS group_name
          FROM companies c
          LEFT JOIN ${groupRef} g ON g.id = c.group_id
          WHERE c.id = ?
          `,
          [id]
        );
        created = row;
      } else {
        throw err;
      }
    }

    res.status(201).json({
      ...created,
      logo_url: created?.logo_object_key ? buildLogoUrl(created.id) : null,
    });
  } catch (err) {
    console.error("Error creating company:", err);
    res.status(500).json({ error: "Failed to create company" });
  }
});

// POST /api/companies/:id/logo
router.post(
  "/:id/logo",
  auth,
  allowRoles("admin", "branch_admin"),
  upload.single("file"),
  async (req, res) => {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Logo file is required" });
    }

    try {
      if (
        !process.env.MINIO_ENDPOINT ||
        !process.env.MINIO_PORT ||
        !process.env.MINIO_ACCESS_KEY ||
        !process.env.MINIO_SECRET_KEY ||
        !process.env.MINIO_BUCKET
      ) {
        return res.status(500).json({
          error:
            "MinIO is not configured. Please set MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, and MINIO_BUCKET.",
        });
      }

      const [[company]] = await pool.query(
        "SELECT id FROM companies WHERE id = ?",
        [id]
      );
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const ext =
        file.originalname.includes(".")
          ? file.originalname.split(".").pop()
          : (file.mimetype || "image/png").split("/").pop();
      const objectKey = `companies/${id}/logo/${uuid()}.${ext}`;

      try {
        const exists = await minioClient.bucketExists(process.env.MINIO_BUCKET);
        if (!exists) {
          await minioClient.makeBucket(
            process.env.MINIO_BUCKET,
            process.env.MINIO_REGION || "us-east-1"
          );
        }
      } catch (bucketErr) {
        console.error("MinIO bucket error:", bucketErr);
        return res.status(500).json({
          error: "MinIO bucket is not available. Please check storage setup.",
        });
      }

      await minioClient.putObject(
        process.env.MINIO_BUCKET,
        objectKey,
        file.buffer,
        file.size,
        {
          "Content-Type": file.mimetype,
        }
      );

      try {
        await pool.query(
          `UPDATE companies
           SET logo_object_key = ?,
               logo_file_name = ?,
               logo_file_type = ?,
               logo_updated_at = NOW()
           WHERE id = ?`,
          [objectKey, file.originalname, file.mimetype, id]
        );
      } catch (dbErr) {
        if (dbErr?.code === "ER_BAD_FIELD_ERROR") {
          return res.status(500).json({
            error:
              "Logo columns are missing in the database. Please run migration 20260402_add_company_logo.sql.",
          });
        }
        throw dbErr;
      }

      res.json({
        success: true,
        logo_url: buildLogoUrl(id),
      });
    } catch (err) {
      console.error("Error uploading company logo:", err);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  }
);

// GET /api/companies/:id/logo
router.get(
  "/:id/logo",
  auth,
  allowRoles("admin", "branch_admin", "supervisor", "technician", "client"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [[company]] = await pool.query(
        `SELECT logo_object_key, logo_file_type, logo_file_name
         FROM companies
         WHERE id = ?`,
        [id]
      );

      if (!company?.logo_object_key) {
        return res.status(404).json({ error: "Logo not found" });
      }

      const stream = await minioClient.getObject(
        process.env.MINIO_BUCKET,
        company.logo_object_key
      );

      res.setHeader("Content-Type", company.logo_file_type || "image/png");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${company.logo_file_name || "logo"}"`
      );

      stream.pipe(res);
    } catch (err) {
      console.error("Error streaming company logo:", err);
      res.status(500).json({ error: "Failed to load logo" });
    }
  }
);

module.exports = router;
