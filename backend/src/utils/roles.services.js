// src/services/roles.service.js

const { pool } = require("../../db");

// -----------------------------------
// GET ROLE PERMISSIONS
// -----------------------------------

async function getRolePermissions(roleId) {

  const [rows] = await pool.query(
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

  return rows;
}

// -----------------------------------
// ASSIGN PERMISSIONS TO ROLE
// -----------------------------------

async function assignPermissionsToRole(connection, roleId, permissions = []) {

  // clear existing permissions
  await connection.query(
    `
    DELETE FROM role_permissions
    WHERE role_id = ?
    `,
    [roleId]
  );

  // no permissions
  if (!permissions.length) {
    return [];
  }

  // fetch valid permissions
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
    throw new Error(
      `Invalid permissions: ${invalidPermissions.join(", ")}`
    );
  }

  // bulk insert
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

  return permissionRows;
}

// -----------------------------------
// CREATE ROLE
// -----------------------------------

async function createRole(connection, name) {

  const [result] = await connection.query(
    `
    INSERT INTO roles (name)
    VALUES (?)
    `,
    [name.trim()]
  );

  return result.insertId;
}

// -----------------------------------
// DELETE ROLE
// -----------------------------------

async function deleteRole(connection, roleId) {

  // delete mappings first
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

  return true;
}

module.exports = {
  getRolePermissions,
  assignPermissionsToRole,
  createRole,
  deleteRole
};