const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// GET /api/users?role=supervisor|technician
router.get("/", auth, allowRoles("admin","branch_admin","supervisor"), async (req, res) => {
  const { role } = req.query;

  try {
    let query = `
      SELECT id, name
      FROM users
      WHERE is_active = 1
    `;
    const params = [];

    if (req.user.role !== "admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );
      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }
      query += " AND branch_id = ?";
      params.push(me.branch_id);
    }

    if (role) {
      query += " AND role = ?";
      params.push(role);
    }

    query += " ORDER BY name ASC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/users/:id/remove-admin
router.post("/:id/remove-admin", auth, allowRoles("admin"), async (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE users SET role = 'supervisor' WHERE id = ?",
      [userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error removing branch admin:", err);
    res.status(500).json({ error: "Failed to remove branch admin" });
  }
});

// POST /api/users/:id/branch
router.post("/:id/branch", auth, allowRoles("admin"), async (req, res) => {
  const userId = req.params.id;
  const { branch_id, branchId } = req.body || {};
  const resolvedBranchId = branch_id || branchId || null;

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  if (!resolvedBranchId) {
    return res.status(400).json({ error: "branch_id is required" });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT id, role FROM users WHERE id = ?",
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Cannot change admin branch" });
    }

    const [[branch]] = await pool.query(
      "SELECT id FROM branches WHERE id = ?",
      [resolvedBranchId]
    );
    if (!branch) {
      return res.status(400).json({ error: "Invalid branch" });
    }

    await pool.query(
      "UPDATE users SET branch_id = ? WHERE id = ?",
      [resolvedBranchId, userId]
    );

    res.json({ success: true, branch_id: resolvedBranchId });
  } catch (err) {
    console.error("Error updating user branch:", err);
    res.status(500).json({ error: "Failed to update user branch" });
  }
});

// POST /api/users/:id/role
router.post("/:id/role", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  const userId = req.params.id;
  const { role, branch_id, branchId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  const requestedRole = role;
  const allowedRoles = new Set(["technician", "supervisor", "branch_admin", "client"]);
  if (!allowedRoles.has(requestedRole)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const resolvedBranchId = branch_id || branchId || null;

  try {
    const [[user]] = await pool.query(
      "SELECT id, role, branch_id FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ error: "Cannot change admin role" });
    }

    if (requestedRole === "branch_admin" && !resolvedBranchId) {
      return res.status(400).json({ error: "branch_id is required for branch admins" });
    }

    let finalBranchId = resolvedBranchId || user.branch_id || null;

    if (!finalBranchId) {
      return res.status(400).json({ error: "Branch is required for this user" });
    }

    const [[branch]] = await pool.query(
      "SELECT id FROM branches WHERE id = ?",
      [finalBranchId]
    );
    if (!branch) {
      return res.status(400).json({ error: "Invalid branch" });
    }

    const [result] = await pool.query(
      "UPDATE users SET role = ?, branch_id = ? WHERE id = ?",
      [requestedRole, finalBranchId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, role: requestedRole, branch_id: finalBranchId });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

module.exports = router;
