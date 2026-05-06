const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth.middleware");


//view roles - as list with user count and permissions
router.get(
  "/",
  auth,
  requirePermission(PERMISSIONS.VIEW_ROLE),
  async (req, res) => {

    try {

      const [roles] = await pool.query(`
        SELECT
          r.id,
          r.name,
          DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          COUNT(DISTINCT u.id) AS users_count
        FROM roles r
        LEFT JOIN users u
          ON u.role_id = r.id
        GROUP BY r.id, r.name, r.created_at
        ORDER BY r.created_at ASC
      `);

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
        WHERE r.id = ?
        GROUP BY r.id, r.name, r.created_at
        LIMIT 1
        `,
        [roleId]
      );

      if (!roles.length) {
        return res.status(404).json({
          error: "Role not found"
        });
      }

      const role = roles[0];

      // permissions
      const [permissions] = await pool.query(
        `
        SELECT
          p.id,
          p.name
        FROM role_permissions rp
        JOIN permissions p
          ON p.id = rp.permission_id
        WHERE rp.role_id = ?
        ORDER BY p.name ASC
        `,
        [roleId]
      );

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
      const [[existingRole]] = await connection.query(
        `
        SELECT id
        FROM roles
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
        `,
        [name.trim()]
      );

      if (existingRole) {
        await connection.rollback();

        return res.status(400).json({
          error: "Role already exists"
        });
      }

      // create role
      const [roleResult] = await connection.query(
        `
        INSERT INTO roles (name)
        VALUES (?)
        `,
        [name.trim()]
      );

      const roleId = roleResult.insertId;

      // permissions handling
      if (permissions.length > 0) {

        const [permissionRows] = await connection.query(
          `
          SELECT id, name
          FROM permissions
          WHERE name IN (?)
          `,
          [permissions]
        );

        const foundPermissions = permissionRows.map(p => p.name);

        const invalidPermissions = permissions.filter(
          p => !foundPermissions.includes(p)
        );

        if (invalidPermissions.length > 0) {

          await connection.rollback();

          return res.status(400).json({
            error: "Invalid permissions",
            invalid_permissions: invalidPermissions
          });
        }

        const values = permissionRows.map(permission => [
          roleId,
          permission.id
        ]);

        await connection.query(
          `
          INSERT INTO role_permissions
            (role_id, permission_id)
          VALUES ?
          `,
          [values]
        );
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
      const [[existingRole]] = await connection.query(
        `
        SELECT id, name
        FROM roles
        WHERE id = ?
        LIMIT 1
        `,
        [roleId]
      );

      if (!existingRole) {

        await connection.rollback();

        return res.status(404).json({
          error: "Role not found"
        });
      }

      // reserved/system roles protection
      const reservedRoles = [
        "admin",
        "super_admin",
        "system"
      ];

      if (
        reservedRoles.includes(existingRole.name?.toLowerCase())
      ) {

        await connection.rollback();

        return res.status(400).json({
          error: "Cannot modify system role"
        });
      }

      // duplicate name check
      const [[duplicateRole]] = await connection.query(
        `
        SELECT id
        FROM roles
        WHERE LOWER(name) = LOWER(?)
          AND id != ?
        LIMIT 1
        `,
        [name.trim(), roleId]
      );

      if (duplicateRole) {

        await connection.rollback();

        return res.status(400).json({
          error: "Role name already exists"
        });
      }

      // validate permissions
      let permissionRows = [];

      if (permissions.length > 0) {

        const [rows] = await connection.query(
          `
          SELECT id, name
          FROM permissions
          WHERE name IN (?)
          `,
          [permissions]
        );

        permissionRows = rows;

        const foundPermissions = rows.map(p => p.name);

        const invalidPermissions = permissions.filter(
          p => !foundPermissions.includes(p)
        );

        if (invalidPermissions.length > 0) {

          await connection.rollback();

          return res.status(400).json({
            error: "Invalid permissions",
            invalid_permissions: invalidPermissions
          });
        }
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

      // remove old permissions
      await connection.query(
        `
        DELETE FROM role_permissions
        WHERE role_id = ?
        `,
        [roleId]
      );

      // insert new permissions
      if (permissionRows.length > 0) {

        const values = permissionRows.map(permission => [
          roleId,
          permission.id
        ]);

        await connection.query(
          `
          INSERT INTO role_permissions
            (role_id, permission_id)
          VALUES ?
          `,
          [values]
        );
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
      const [[role]] = await connection.query(
        `
        SELECT id, name
        FROM roles
        WHERE id = ?
        LIMIT 1
        `,
        [roleId]
      );

      if (!role) {

        await connection.rollback();

        return res.status(404).json({
          error: "Role not found"
        });
      }

      // protect system roles
      const reservedRoles = [
        "admin",
        "super_admin",
        "system"
      ];

      if (
        reservedRoles.includes(role.name?.toLowerCase())
      ) {

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

      // delete permissions mapping
      await connection.query(
        `
        DELETE FROM role_permissions
        WHERE role_id = ?
        `,
        [roleId]
      );

      // delete role
      await connection.query(
        `
        DELETE FROM roles
        WHERE id = ?
        `,
        [roleId]
      );

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