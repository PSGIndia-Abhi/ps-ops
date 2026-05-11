const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");

// GET /api/branches
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_BRANCH), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.name,
        b.created_at,
        u.id AS user_id,
        u.name AS user_name
      FROM branches b
      LEFT JOIN users u
        ON u.branch_id = b.id
        AND u.role = 'branch_admin'
      ORDER BY b.created_at DESC, b.name ASC
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching branches:", err);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

// POST /api/branches
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_BRANCH), async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      return res.status(400).json({ error: "Branch name is required" });
    }

    const [existing] = await pool.query(
      "SELECT id FROM branches WHERE name = ?",
      [name]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Branch already exists" });
    }

    const id = uuid();

    await pool.query(
      "INSERT INTO branches (id, name) VALUES (?, ?)",
      [id, name]
    );

    res.status(201).json({ id, name });
  } catch (err) {
    console.error("Error creating branch:", err);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

// POST /api/branches/:id/assign-admin
router.post("/:id/assign-admin", auth, requirePermission(PERMISSIONS.ASSIGN_BRANCH_ADMIN), async (req, res) => {
  const branchId = req.params.id;
  const userId = req.body?.userId || req.body?.user_id;

  if (!branchId || !userId) {
    return res.status(400).json({ error: "Branch id and user id are required" });
  }

  try {
    const [branches] = await pool.query(
      "SELECT id FROM branches WHERE id = ?",
      [branchId]
    );
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branch not found" });
    }

    const [users] = await pool.query(
      "SELECT id, role FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (users[0].role === "client") {
      return res.status(400).json({ error: "Clients cannot be branch admins" });
    }

    await pool.query(
      "UPDATE users SET branch_id = ?, role = 'branch_admin' WHERE id = ?",
      [branchId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error assigning branch admin:", err);
    res.status(500).json({ error: "Failed to assign branch admin" });
  }
});

module.exports = router;
