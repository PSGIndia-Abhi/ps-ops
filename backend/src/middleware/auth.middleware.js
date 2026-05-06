// const jwt = require("jsonwebtoken");
// const { pool } = require("../../db");

// async function authMiddleware(req, res, next) {
//   const header = req.headers.authorization;

//   if (!header) {
//     return res.status(401).json({ error: "No token provided" });
//   }

//   const token = header.split(" ")[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);


//     // 🔹 user + role
//     const [[user]] = await pool.query(
//       `
//       SELECT u.id, u.role_id, r.name AS role_name
//       FROM users u
//       LEFT JOIN roles r ON u.role_id = r.id
//       WHERE u.id = ?
//       `,
//       [decoded.id]
//     );

//     if (!user) {
//       return res.status(401).json({ error: "User not found" });
//     }

//     // 🔹 permissions
//     const [permissions] = await pool.query(
//       `
//       SELECT p.name
//       FROM role_permissions rp
//       JOIN permissions p ON p.id = rp.permission_id
//       WHERE rp.role_id = ?
//       `,
//       [user.role_id]
//     );

//     // Scope

//     const [scopes] = await pool.query(
//       `
//   SELECT branch_id, company_id, site_id, is_global
//   FROM user_scopes
//   WHERE user_id = ?
//   `,
//       [user.id]
//     );

//     const scope = {
//   is_global: false,
//   branch_id: null,
//   company_ids: [],
//   site_ids: []
// };

// for (const row of scopes) {
//   if (row.is_global) {
//     scope.is_global = true;
//   }

//   if (row.branch_id) {
//     scope.branch_id = row.branch_id;
//   }

//   if (row.company_id) {
//     scope.company_ids.push(row.company_id);
//   }

//   if (row.site_id) {
//     scope.site_ids.push(row.site_id);
//   }
// }



//     // 🔹 attach to req
//     req.user = {
//       id: user.id,
//       role: user.role_name, // TEMP bridge
//       role_id: user.role_id,
//       permissions: permissions.map(p => p.name),
//       scope

//     };

//     next();

//   } catch (err) {
//     return res.status(401).json({ error: "Invalid or expired token" });
//   }
// }

const jwt = require("jsonwebtoken");
const { pool } = require("../../db");

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [[user]] = await pool.query(
      `SELECT u.id, u.role_id, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const [permissions] = await pool.query(
      `
      SELECT p.name
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      `,
      [user.role_id]
    );

    const [scopes] = await pool.query(
      `
      SELECT scope_type, scope_id
      FROM user_scopes
      WHERE user_id = ?
      `,
      [user.id]
    );

    req.user = {
      id: user.id,
      role: user.role_name,
      role_id: user.role_id,
      permissions: permissions.map(p => p.name),
      scopes
    };

    

    next();

  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
