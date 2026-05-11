const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { resolveGroupTable } = require("../utils/groupTable");

// GET /api/groups
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {
  try {
    const groupTable = await resolveGroupTable(pool);
    const tableRef ="`group_name`";
    const [rows] = await pool.query(
      `SELECT id, name, created_at FROM ${tableRef} ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// POST /api/groups
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_CONTACT), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const groupTable = await resolveGroupTable(pool);
    const tableRef = "`group_name`";
    const [existing] = await pool.query(
      `SELECT id FROM ${tableRef} WHERE name = ?`,
      [name]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Group already exists" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO ${tableRef} (id, name, created_at) VALUES (?, ?, NOW())`,
      [id, name]
    );

    res.status(201).json({ id, name });
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json({ error: "Failed to create group" });
  }
});

module.exports = router;
