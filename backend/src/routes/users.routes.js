const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { notifyUserBranchChanged } = require("../services/notifications.service");
const buildScopeFilter = require("../utils/buildScopeFilter");

// users.role is a legacy NOT NULL enum column kept alongside role_id during the
// role_id/roles-table migration. Only these values are valid for it, so writes
// to it must be guarded — a custom role created via /api/roles would otherwise
// fail the enum constraint. role_id remains the source of truth everywhere else.
const LEGACY_ROLE_ENUM = new Set([
  "admin",
  "client",
  "technician",
  "supervisor",
  "telecaller",
  "branch_admin",
]);

function buildUserScope(user) {
  return buildScopeFilter(user, {
    branch: "u.branch_id",
    company: "u.branch_id",
    site: "u.branch_id",
  });
}

const USER_DETAIL_QUERY = `
  SELECT u.id, u.name, u.email, u.phone, u.role_id, r.name AS role,
         u.branch_id, b.name AS branch_name, u.is_active,
         u.invite_status, u.created_at
  FROM users u
  LEFT JOIN branches b ON b.id = u.branch_id
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.id = ?
`;

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
      SELECT u.id, u.name, u.email, u.branch_id, b.name AS branch_name, r.name AS role, u.created_at
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

// GET /api/users/:id/scopes
router.get("/:id/scopes", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  const userId = req.params.id;
  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT id, branch_id FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [scopes] = await pool.query(
      `SELECT id, scope_type, scope_id
       FROM user_scopes
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [userId]
    );

    res.json({
      user_id: userId,
      scopes: Array.isArray(scopes) ? scopes : [],
      fallback_branch_id: user.branch_id || null,
    });
  } catch (err) {
    console.error("Error fetching user scopes:", err);
    res.status(500).json({ error: "Failed to fetch user scopes" });
  }
});

// POST /api/users/:id/scopes
router.post("/:id/scopes", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  const userId = req.params.id;
  const { scopes } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }
  if (!Array.isArray(scopes)) {
    return res.status(400).json({ error: "scopes must be an array" });
  }

  const normalized = [];
  for (const scope of scopes) {
    const scopeType = String(scope?.scope_type || "").trim().toLowerCase();
    const scopeId = scope?.scope_id ? String(scope.scope_id).trim() : null;

    if (!["global", "branch", "company", "site"].includes(scopeType)) {
      return res.status(400).json({ error: `Invalid scope_type: ${scopeType}` });
    }
    if (scopeType !== "global" && !scopeId) {
      return res.status(400).json({ error: `${scopeType} scope requires scope_id` });
    }
    if (scopeType === "global" && scopeId) {
      return res.status(400).json({ error: "global scope must not include scope_id" });
    }

    normalized.push({
      scope_type: scopeType,
      scope_id: scopeType === "global" ? null : scopeId,
    });
  }

  try {
    const [[user]] = await pool.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const deduped = Array.from(
      new Map(
        normalized.map((item) => [
          `${item.scope_type}:${item.scope_id || ""}`,
          item,
        ])
      ).values()
    );

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query("DELETE FROM user_scopes WHERE user_id = ?", [userId]);

      for (const item of deduped) {
        await connection.query(
          `INSERT INTO user_scopes (user_id, scope_type, scope_id, created_at)
           VALUES (?, ?, ?, NOW())`,
          [userId, item.scope_type, item.scope_id]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ success: true, user_id: userId, scopes: deduped });
  } catch (err) {
    console.error("Error updating user scopes:", err);
    res.status(500).json({ error: "Failed to update user scopes" });
  }
});

// GET /api/users/:id — full single-record detail (User Management edit view)
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  const userId = req.params.id;

  try {
    const scope = buildUserScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    let query = USER_DETAIL_QUERY;
    const params = [userId];

    if (scope.condition) {
      query += ` AND ${scope.condition}`;
      params.push(...scope.params);
    }

    const [[user]] = await pool.query(query, params);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// POST /api/users — create a new internal user (supervisor/technician/branch_admin/client).
// The admin sets the initial password directly here (no self-service invite
// email) — the account is created ACTIVE and can log in immediately.
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_USER), async (req, res) => {
  const { name, email, phone, password, role_id, roleId, branch_id, branchId } = req.body || {};

  const resolvedRoleId = role_id || roleId || null;
  const resolvedBranchId = branch_id || branchId || null;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
  const rawPassword = typeof password === "string" ? password : "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!trimmedEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (rawPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (!resolvedRoleId) {
    return res.status(400).json({ error: "Role is required" });
  }
  if (!resolvedBranchId) {
    return res.status(400).json({ error: "Branch is required" });
  }

  try {
    const scope = buildUserScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }
    if (scope.condition && !scope.params.includes(resolvedBranchId)) {
      return res.status(403).json({ error: "You cannot create users outside your branch scope" });
    }

    const [[role]] = await pool.query(
      "SELECT id, name FROM roles WHERE id = ? LIMIT 1",
      [resolvedRoleId]
    );
    if (!role) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role.name === "admin") {
      return res.status(400).json({ error: "Cannot create another admin user" });
    }

    const [[branch]] = await pool.query("SELECT id FROM branches WHERE id = ?", [resolvedBranchId]);
    if (!branch) {
      return res.status(400).json({ error: "Invalid branch" });
    }

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [trimmedEmail]);
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const legacyRoleValue = LEGACY_ROLE_ENUM.has(role.name) ? role.name : "technician";
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const [result] = await pool.query(
      `
      INSERT INTO users (
        name, email, phone, password_hash, role, role_id, branch_id,
        invite_status, is_active, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, NOW())
      `,
      [trimmedName, trimmedEmail, trimmedPhone, passwordHash, legacyRoleValue, role.id, resolvedBranchId]
    );

    const newUserId = result.insertId;
    const [[createdUser]] = await pool.query(USER_DETAIL_QUERY, [newUserId]);

    res.status(201).json({ success: true, user: createdUser });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/
// /:id — edit an existing user's profile, role, and branch.
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  const userId = req.params.id;
  const { name, email, phone, role_id, roleId, branch_id, branchId } = req.body || {};

  const resolvedRoleId = role_id || roleId || null;
  const resolvedBranchId = branch_id || branchId || null;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }
  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!trimmedEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!resolvedRoleId) {
    return res.status(400).json({ error: "Role is required" });
  }
  if (!resolvedBranchId) {
    return res.status(400).json({ error: "Branch is required" });
  }

  try {
    const scope = buildUserScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }
    if (scope.condition && !scope.params.includes(resolvedBranchId)) {
      return res.status(403).json({ error: "You cannot move users outside your branch scope" });
    }

    let existingQuery = `
      SELECT u.id, u.branch_id, r.name AS role
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `;
    const existingParams = [userId];
    if (scope.condition) {
      existingQuery += ` AND ${scope.condition}`;
      existingParams.push(...scope.params);
    }
    const [[existingUser]] = await pool.query(existingQuery, existingParams);

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    if (existingUser.role === "admin") {
      return res.status(400).json({ error: "Cannot edit admin user" });
    }

    const [[role]] = await pool.query("SELECT id, name FROM roles WHERE id = ? LIMIT 1", [resolvedRoleId]);
    if (!role) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role.name === "admin") {
      return res.status(400).json({ error: "Cannot assign admin role" });
    }

    const [[branch]] = await pool.query("SELECT id FROM branches WHERE id = ?", [resolvedBranchId]);
    if (!branch) {
      return res.status(400).json({ error: "Invalid branch" });
    }

    const [[duplicateEmail]] = await pool.query(
      "SELECT id FROM users WHERE email = ? AND id != ?",
      [trimmedEmail, userId]
    );
    if (duplicateEmail) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const setClauses = ["name = ?", "email = ?", "phone = ?"];
    const setParams = [trimmedName, trimmedEmail, trimmedPhone];

    if (LEGACY_ROLE_ENUM.has(role.name)) {
      setClauses.push("role = ?");
      setParams.push(role.name);
    }

    setClauses.push("role_id = ?", "branch_id = ?", "updated_at = NOW()");
    setParams.push(role.id, resolvedBranchId);

    await pool.query(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`, [...setParams, userId]);

    const [[updatedUser]] = await pool.query(USER_DETAIL_QUERY, [userId]);

    res.json({ success: true, user: updatedUser });

    if (String(existingUser.branch_id || "") !== String(resolvedBranchId || "")) {
      notifyUserBranchChanged({
        userId,
        branchId: resolvedBranchId,
        actorUserId: req.user?.id,
        previousBranchId: existingUser.branch_id || null,
      }).catch((notifyErr) => {
        console.error("Branch change notification failed:", notifyErr);
      });
    }
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /api/users/:id — soft delete (is_active = 0). Refuses on self-delete.
router.delete("/:id", auth, requirePermission(PERMISSIONS.DELETE_USER), async (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "User id is required" });
  }
  if (String(userId) === String(req.user?.id)) {
    return res.status(400).json({ error: "You cannot deactivate your own account" });
  }

  try {
    const scope = buildUserScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    let query = `
      SELECT u.id, r.name AS role
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `;
    const params = [userId];
    if (scope.condition) {
      query += ` AND ${scope.condition}`;
      params.push(...scope.params);
    }
    const [[user]] = await pool.query(query, params);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "Cannot deactivate admin user" });
    }

    await pool.query("UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?", [userId]);

    res.json({ success: true, deactivated: true });
  } catch (err) {
    console.error("Error deactivating user:", err);
    res.status(500).json({ error: "Failed to deactivate user" });
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
