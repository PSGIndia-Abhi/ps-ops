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
    if (decoded?.token_type === "temporary_worker" && decoded?.temp_access_id) {
      const [[temporaryAccess]] = await pool.query(
        `SELECT ta.id, ta.job_id, ta.role_id, ta.worker_name, ta.phone_number, ta.expires_at, ta.used_at, ta.revoked_at, r.name AS role_name
         FROM temporary_access ta
         JOIN roles r ON r.id = ta.role_id
         WHERE ta.id = ?
         LIMIT 1`,
        [decoded.temp_access_id]
      );

      if (!temporaryAccess) {
        return res.status(401).json({ error: "Temporary access not found" });
      }

      if (temporaryAccess.revoked_at) {
        return res.status(401).json({ error: "Temporary access revoked" });
      }

      if (!temporaryAccess.used_at) {
        return res.status(401).json({ error: "Temporary access not activated" });
      }

      if (new Date(temporaryAccess.expires_at) < new Date()) {
        return res.status(401).json({ error: "Temporary access expired" });
      }

      const [permissions] = await pool.query(
        `
        SELECT p.name
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?
        `,
        [temporaryAccess.role_id]
      );

      req.user = {
        id: null,
        role: temporaryAccess.role_name,
        role_id: temporaryAccess.role_id,
        permissions: permissions.map((p) => p.name),
        scopes: [],
        is_temporary_worker: true,
        temp_access_id: temporaryAccess.id,
        temp_access_job_id: temporaryAccess.job_id,
        temp_worker_name: temporaryAccess.worker_name || null,
        temp_worker_phone: temporaryAccess.phone_number || null,
      };

      return next();
    }

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
