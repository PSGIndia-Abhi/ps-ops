const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { notifyUserBranchChanged } = require("../services/notifications.service");
const buildScopeFilter = require("../utils/buildScopeFilter");

// GET /api/users?role=supervisor|technician
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  const { role } = req.query;

  try {
    const scope = buildScopeFilter(req.user, {
      branch: "u.branch_id",
      company: "u.branch_id",
      site: "u.branch_id",
    });

    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    let query = `
      SELECT u.id, u.name, u.email, u.branch_id, b.name AS branch_name, r.name AS role
  FROM users u
  LEFT JOIN branches b ON b.id = u.branch_id
  LEFT JOIN roles r ON r.id = u.role_id   
  WHERE u.is_active = 1
    `;
    const params = [];

    if (scope.condition) {
      query += ` AND ${scope.condition}`;
      params.push(...scope.params);
    }

    if (role) {
      query += " AND r.name = ?";
      params.push(role);
    }

    query += " ORDER BY u.name ASC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/users/:id/remove-admin
router.post("/:id/remove-admin", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  try {
    const [[supervisorRole]] = await pool.query(
      `
      SELECT id
      FROM roles
      WHERE name = 'supervisor'
      LIMIT 1
      `
    );

    if (!supervisorRole) {
      return res.status(400).json({ error: "Supervisor role not found" });
    }

    const [result] = await pool.query(
      `
      UPDATE users
      SET role_id = ?
      WHERE id = ?
      `,
      [supervisorRole.id, userId]
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
router.post("/:id/branch", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
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
      "SELECT u.id, u.branch_id, r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?",
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

    if (String(user.branch_id || "") !== String(resolvedBranchId)) {
      notifyUserBranchChanged({
        userId,
        branchId: resolvedBranchId,
        actorUserId: req.user?.id,
        previousBranchId: user.branch_id || null,
      }).catch((notifyErr) => {
        console.error("Branch change notification failed:", notifyErr);
      });
    }
  } catch (err) {
    console.error("Error updating user branch:", err);
    res.status(500).json({ error: "Failed to update user branch" });
  }
});

// POST /api/users/:id/role
router.post("/:id/role", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  const userId = req.params.id;
  const { role, role_id, roleId, branch_id, branchId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  const resolvedBranchId = branch_id || branchId || null;

  try {
    const resolvedRoleId = role_id || roleId || null;
    let requestedRole = null;

    if (resolvedRoleId) {
      [[requestedRole]] = await pool.query(
        `
        SELECT id, name
        FROM roles
        WHERE id = ?
        LIMIT 1
        `,
        [resolvedRoleId]
      );
    } else if (role) {
      [[requestedRole]] = await pool.query(
        `
        SELECT id, name
        FROM roles
        WHERE name = ?
        LIMIT 1
        `,
        [role]
      );
    }

    if (!requestedRole) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const [[user]] = await pool.query(
      "SELECT u.id, u.branch_id, r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ error: "Cannot change admin role" });
    }

    if (requestedRole.name === "branch_admin" && !resolvedBranchId) {
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
      "UPDATE users SET role_id = ?, branch_id = ? WHERE id = ?",
      [requestedRole.id, finalBranchId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      role_id: requestedRole.id,
      role: requestedRole.name,
      branch_id: finalBranchId
    });

    if (String(user.branch_id || "") !== String(finalBranchId || "")) {
      notifyUserBranchChanged({
        userId,
        branchId: finalBranchId,
        actorUserId: req.user?.id,
        previousBranchId: user.branch_id || null,
      }).catch((notifyErr) => {
        console.error("Role/branch change notification failed:", notifyErr);
      });
    }
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

module.exports = router;
