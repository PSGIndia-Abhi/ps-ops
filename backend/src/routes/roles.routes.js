const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const {
  getAllPermissions,
  getRolePermissions,
  assignPermissionsToRole,
  createRole,
  deleteRole,
} = require("../utils/roles.services");

const RESERVED_ROLES = new Set(["admin", "super_admin", "system"]);

function getScopedUserJoin(user) {
  const scopes = Array.isArray(user?.scopes) ? user.scopes : [];

  if (!scopes.length) {
    return { forbidden: true };
  }

  const hasGlobal = scopes.some((scope) => scope.scope_type === "global");
  if (hasGlobal) {
    return { clause: "", params: [] };
  }

  const branchScopeIds = scopes
    .filter((scope) => scope.scope_type === "branch" && scope.scope_id)
    .map((scope) => scope.scope_id);

  if (!branchScopeIds.length) {
    return { forbidden: true };
  }

  const placeholders = branchScopeIds.map(() => "?").join(",");
  return {
    clause: ` AND u.branch_id IN (${placeholders})`,
    params: branchScopeIds,
  };
}

async function getRoleById(executor, roleId) {
  const [[role]] = await executor.query(
    `
    SELECT id, name
    FROM roles
    WHERE id = ?
    LIMIT 1
    `,
    [roleId]
  );

  return role || null;
}

async function getRoleByName(executor, name) {
  const [[role]] = await executor.query(
    `
    SELECT id, name
    FROM roles
    WHERE LOWER(name) = LOWER(?)
    LIMIT 1
    `,
    [name.trim()]
  );

  return role || null;
}

router.get(
  "/permissions",
  auth,
  requirePermission(PERMISSIONS.VIEW_ROLE),
  async (req, res) => {
    try {
      const permissions = await getAllPermissions(pool);
      res.json(permissions);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  }
);


//view roles - as list with user count and permissions
router.get(
  "/",
  auth,
  requirePermission(PERMISSIONS.VIEW_ROLE),
  async (req, res) => {

    try {
      const scopedUserJoin = getScopedUserJoin(req.user);
      if (scopedUserJoin.forbidden) {
        return res.status(403).json({ error: "No scope assigned" });
      }

      const [roles] = await pool.query(`
        SELECT
          r.id,
          r.name,
          DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          COUNT(DISTINCT u.id) AS users_count
        FROM roles r
        LEFT JOIN users u
          ON u.role_id = r.id
          AND u.is_active = 1
          ${scopedUserJoin.clause}
        GROUP BY r.id, r.name, r.created_at
        ORDER BY r.created_at ASC
      `, scopedUserJoin.params);

      const [permissions] = await pool.query(`
        SELECT
          rp.role_id,
          p.name
        FROM role_permissions rp
        JOIN permissions p
          ON p.id = rp.permission_id
      `);

      const permissionMap = {};

      for (const row of permissions) {

        if (!permissionMap[row.role_id]) {
          permissionMap[row.role_id] = [];
        }

        permissionMap[row.role_id].push(row.name);
      }

      const finalRoles = roles.map(role => ({
        ...role,
        permissions: permissionMap[role.id] || []
      }));

      res.json(finalRoles);

    } catch (err) {

      console.error("Error fetching roles:", err);

      res.status(500).json({
        error: "Failed to fetch roles"
      });

    }
  }
);

// GET /api/roles/:id - - all details + permissions
router.get(
  "/:id",
  auth,
  requirePermission(PERMISSIONS.VIEW_ROLE),
  async (req, res) => {

    const roleId = req.params.id;

    if (!roleId) {
      return res.status(400).json({
        error: "Role id is required"
      });
    }

    try {
      const scopedUserJoin = getScopedUserJoin(req.user);
      if (scopedUserJoin.forbidden) {
        return res.status(403).json({ error: "No scope assigned" });
      }

      // role details
      const [roles] = await pool.query(
        `
        SELECT
          r.id,
          r.name,
          DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          COUNT(DISTINCT u.id) AS users_count
        FROM roles r
        LEFT JOIN users u
          ON u.role_id = r.id
          AND u.is_active = 1
          ${scopedUserJoin.clause}
        WHERE r.id = ?
        GROUP BY r.id, r.name, r.created_at
        LIMIT 1
        `,
        [...scopedUserJoin.params, roleId]
      );

      if (!roles.length) {
        return res.status(404).json({
          error: "Role not found"
        });
      }

      const role = roles[0];

      const permissions = await getRolePermissions(roleId);

      res.json({
        ...role,
        permissions
      });

    } catch (err) {

      console.error("Error fetching role:", err);

      res.status(500).json({
        error: "Failed to fetch role"
      });

    }
  }
);

//create roles
router.post(
  "/",
  auth,
  requirePermission(PERMISSIONS.CREATE_ROLE),
  async (req, res) => {

    const { name, permissions = [] } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Role name is required"
      });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        error: "Permissions must be an array"
      });
    }

    const connection = await pool.getConnection();

    try {

      await connection.beginTransaction();

      // prevent duplicates
      const existingRole = await getRoleByName(connection, name);

      if (existingRole) {
        await connection.rollback();

        return res.status(400).json({
          error: "Role already exists"
        });
      }

      // create role
      const roleId = await createRole(connection, name);

      try {
        await assignPermissionsToRole(connection, roleId, permissions);
      } catch (assignErr) {
        await connection.rollback();
        return res.status(400).json({ error: assignErr.message });
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        role: {
          id: roleId,
          name: name.trim(),
          permissions
        }
      });

    } catch (err) {

      await connection.rollback();

      console.error("Error creating role:", err);

      res.status(500).json({
        error: "Failed to create role"
      });

    } finally {
      connection.release();
    }
  }
);


//udate role
// PATCH /api/roles/:id
router.patch(
  "/:id",
  auth,
  requirePermission(PERMISSIONS.UPDATE_ROLE),
  async (req, res) => {

    const roleId = req.params.id;

    const {
      name,
      permissions = []
    } = req.body || {};

    if (!roleId) {
      return res.status(400).json({
        error: "Role id is required"
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Role name is required"
      });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        error: "Permissions must be an array"
      });
    }

    const connection = await pool.getConnection();

    try {

      await connection.beginTransaction();

      // role exists
      const existingRole = await getRoleById(connection, roleId);

      if (!existingRole) {

        await connection.rollback();

        return res.status(404).json({
          error: "Role not found"
        });
      }

      // reserved/system roles protection
      if (RESERVED_ROLES.has(existingRole.name?.toLowerCase())) {

        await connection.rollback();

        return res.status(400).json({
          error: "Cannot modify system role"
        });
      }

      // duplicate name check
      const duplicateRole = await getRoleByName(connection, name);

      if (duplicateRole && Number(duplicateRole.id) !== Number(roleId)) {

        await connection.rollback();

        return res.status(400).json({
          error: "Role name already exists"
        });
      }

      // update role name
      await connection.query(
        `
        UPDATE roles
        SET name = ?
        WHERE id = ?
        `,
        [name.trim(), roleId]
      );

      try {
        await assignPermissionsToRole(connection, roleId, permissions);
      } catch (assignErr) {
        await connection.rollback();
        return res.status(400).json({ error: assignErr.message });
      }

      await connection.commit();

      res.json({
        success: true,
        role: {
          id: Number(roleId),
          name: name.trim(),
          permissions
        }
      });

    } catch (err) {

      await connection.rollback();

      console.error("Error updating role:", err);

      res.status(500).json({
        error: "Failed to update role"
      });

    } finally {

      connection.release();

    }
  }
);



//delete Roles
 // DELETE /api/roles/:id
router.delete(
  "/:id",
  auth,
  requirePermission(PERMISSIONS.DELETE_ROLE),
  async (req, res) => {

    const roleId = req.params.id;

    if (!roleId) {
      return res.status(400).json({
        error: "Role id is required"
      });
    }

    const connection = await pool.getConnection();

    try {

      await connection.beginTransaction();

      // role exists
      const role = await getRoleById(connection, roleId);

      if (!role) {

        await connection.rollback();

        return res.status(404).json({
          error: "Role not found"
        });
      }

      // protect system roles
      if (RESERVED_ROLES.has(role.name?.toLowerCase())) {

        await connection.rollback();

        return res.status(400).json({
          error: "Cannot delete system role"
        });
      }

      // check users assigned
      const [[assignedUsers]] = await connection.query(
        `
        SELECT COUNT(*) AS total
        FROM users
        WHERE role_id = ?
        `,
        [roleId]
      );

      if (assignedUsers.total > 0) {

        await connection.rollback();

        return res.status(400).json({
          error: "Role is assigned to users"
        });
      }

      await deleteRole(connection, roleId);

      await connection.commit();

      res.json({
        success: true
      });

    } catch (err) {

      await connection.rollback();

      console.error("Error deleting role:", err);

      res.status(500).json({
        error: "Failed to delete role"
      });

    } finally {

      connection.release();

    }
  }
);

module.exports = router;
