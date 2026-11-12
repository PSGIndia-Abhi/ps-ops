// Admin > Client Accounts: create and manage client portal logins for a company.
//
// Two kinds of login, both with role "client":
//   - Company admin: one user_scopes row  (company, <company id>) -> sees every outlet
//   - Outlet user:   one row per outlet   (site, <site id>)       -> sees only those outlets
//
// Admin can manage every company. Other users with the user permissions (e.g. branch admin)
// can manage only companies that have at least one outlet in their own branch.

const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { CLIENT_ROLE, getClientRoleId } = require("../services/clientPortal.service");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const minioClient = require("../lib/minio");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getUserBranchId(userId) {
  const [[row]] = await pool.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
  return row?.branch_id || null;
}

// Throws a status-coded error when the signed-in user may not manage this company.
async function assertCanManageCompany(req, companyId) {
  const [[company]] = await pool.query(
    "SELECT id, name, display_name, code, type, is_active FROM companies WHERE id = ?",
    [companyId]
  );
  if (!company) throw httpError(404, "Company not found");
  if (req.user.role === "admin") return company;

  const branchId = await getUserBranchId(req.user.id);
  if (!branchId) throw httpError(403, "Branch not assigned");
  const [[site]] = await pool.query(
    "SELECT id FROM sites WHERE company_id = ? AND branch_id = ? LIMIT 1",
    [companyId, branchId]
  );
  if (!site) throw httpError(403, "This company has no outlet in your branch");
  return company;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendError(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

// Validates the access part of a request body against the company's outlets.
// Returns { access: 'company' | 'sites', siteIds }.
async function parseAccess(body, companyId) {
  const access = body?.access === "sites" ? "sites" : "company";
  if (access === "company") return { access, siteIds: [] };

  const requested = Array.isArray(body?.site_ids) ? body.site_ids.map(String) : [];
  const unique = Array.from(new Set(requested));
  if (!unique.length) throw httpError(400, "Select at least one outlet");

  const [rows] = await pool.query(
    `SELECT id FROM sites WHERE company_id = ? AND id IN (${unique.map(() => "?").join(",")})`,
    [companyId, ...unique]
  );
  if (rows.length !== unique.length) throw httpError(400, "One or more outlets do not belong to this company");
  return { access, siteIds: unique };
}

async function writeScopes(connection, userId, companyId, { access, siteIds }) {
  await connection.query("DELETE FROM user_scopes WHERE user_id = ?", [userId]);
  if (access === "company") {
    await connection.query(
      "INSERT INTO user_scopes (user_id, scope_type, scope_id, created_at) VALUES (?, 'company', ?, NOW())",
      [userId, companyId]
    );
    return;
  }
  for (const siteId of siteIds) {
    await connection.query(
      "INSERT INTO user_scopes (user_id, scope_type, scope_id, created_at) VALUES (?, 'site', ?, NOW())",
      [userId, siteId]
    );
  }
}

// Branch for the user row: the first chosen outlet's branch, else any outlet of the company.
async function resolveBranchId(companyId, siteIds) {
  if (siteIds.length) {
    const [[row]] = await pool.query(
      "SELECT branch_id FROM sites WHERE id = ? AND branch_id IS NOT NULL",
      [siteIds[0]]
    );
    if (row?.branch_id) return row.branch_id;
  }
  const [[row]] = await pool.query(
    "SELECT branch_id FROM sites WHERE company_id = ? AND branch_id IS NOT NULL ORDER BY created_at LIMIT 1",
    [companyId]
  );
  return row?.branch_id || null;
}

// Client logins of one company, with their access.
async function loadLogins(companyId) {
  const [users] = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.is_active, u.invite_status, u.created_at
     FROM users u
     JOIN roles r ON r.id = u.role_id AND r.name = ?
     JOIN user_scopes us ON us.user_id = u.id
     LEFT JOIN sites s ON us.scope_type = 'site' AND s.id = us.scope_id
     WHERE (us.scope_type = 'company' AND us.scope_id = ?)
        OR (us.scope_type = 'site' AND s.company_id = ?)
     ORDER BY u.created_at DESC`,
    [CLIENT_ROLE, companyId, companyId]
  );
  if (!users.length) return [];

  const ids = users.map((u) => u.id);
  const [scopes] = await pool.query(
    `SELECT us.user_id, us.scope_type, us.scope_id, s.name AS site_name
     FROM user_scopes us
     LEFT JOIN sites s ON us.scope_type = 'site' AND s.id = us.scope_id
     WHERE us.user_id IN (${ids.map(() => "?").join(",")})`,
    ids
  );

  return users.map((u) => {
    const own = scopes.filter((s) => String(s.user_id) === String(u.id));
    const isCompany = own.some((s) => s.scope_type === "company");
    const sites = own
      .filter((s) => s.scope_type === "site")
      .map((s) => ({ id: s.scope_id, name: s.site_name }));
    return {
      ...u,
      is_active: !!u.is_active,
      access: isCompany ? "company" : "sites",
      sites: isCompany ? [] : sites,
    };
  });
}

// Loads a client user and checks it belongs to a company the caller may manage.
async function loadManagedLogin(req, userId) {
  const [[user]] = await pool.query(
    `SELECT u.id, r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId]
  );
  if (!user || user.role !== CLIENT_ROLE) throw httpError(404, "Client login not found");

  const [[scope]] = await pool.query(
    `SELECT COALESCE(IF(us.scope_type = 'company', us.scope_id, NULL), s.company_id) AS company_id
     FROM user_scopes us
     LEFT JOIN sites s ON us.scope_type = 'site' AND s.id = us.scope_id
     WHERE us.user_id = ? AND us.scope_type IN ('company','site')
     LIMIT 1`,
    [userId]
  );
  if (!scope?.company_id) throw httpError(400, "This login is not linked to a company");
  await assertCanManageCompany(req, scope.company_id);
  return { userId: user.id, companyId: scope.company_id };
}

// GET /api/client-accounts/companies?search=  -> companies with outlet and login counts
router.get("/companies", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conditions = ["COALESCE(c.is_active, 1) = 1"];
    const params = [];

    if (req.user.role !== "admin") {
      const branchId = await getUserBranchId(req.user.id);
      if (!branchId) return res.status(403).json({ error: "Branch not assigned" });
      conditions.push("EXISTS (SELECT 1 FROM sites bs WHERE bs.company_id = c.id AND bs.branch_id = ?)");
      params.push(branchId);
    }
    if (search) {
      conditions.push("(c.name LIKE ? OR c.display_name LIKE ? OR c.code LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.display_name, c.code, c.type,
              (SELECT COUNT(*) FROM sites s WHERE s.company_id = c.id AND COALESCE(s.is_active, 1) = 1) AS outlet_count,
              (SELECT COUNT(DISTINCT u.id)
                 FROM users u
                 JOIN roles r ON r.id = u.role_id AND r.name = ?
                 JOIN user_scopes us ON us.user_id = u.id
                 LEFT JOIN sites s2 ON us.scope_type = 'site' AND s2.id = us.scope_id
                WHERE (us.scope_type = 'company' AND us.scope_id = c.id)
                   OR (us.scope_type = 'site' AND s2.company_id = c.id)) AS login_count
       FROM companies c
       WHERE ${conditions.join(" AND ")}
       ORDER BY COALESCE(c.display_name, c.name)`,
      [CLIENT_ROLE, ...params]
    );
    res.json(rows.map((r) => ({ ...r, outlet_count: Number(r.outlet_count), login_count: Number(r.login_count) })));
  } catch (err) {
    sendError(res, err, "Failed to load companies");
  }
});

// GET /api/client-accounts/companies/:companyId -> company, outlets, logins
router.get("/companies/:companyId", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  try {
    const company = await assertCanManageCompany(req, req.params.companyId);
    const [sites] = await pool.query(
      `SELECT id, name, address, city, branch_id
       FROM sites WHERE company_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY name`,
      [company.id]
    );
    const logins = await loadLogins(company.id);
    res.json({ company, sites, logins });
  } catch (err) {
    sendError(res, err, "Failed to load company");
  }
});

// POST /api/client-accounts/companies/:companyId/logins
// body: { name, email, phone, password, access: 'company' | 'sites', site_ids: [] }
router.post("/companies/:companyId/logins", auth, requirePermission(PERMISSIONS.CREATE_USER), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const phone = typeof req.body?.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : null;
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  let connection;
  try {
    const company = await assertCanManageCompany(req, req.params.companyId);
    const accessSpec = await parseAccess(req.body, company.id);

    const roleId = await getClientRoleId();
    if (!roleId) {
      return res.status(500).json({ error: "The client role is missing. Run migration 20261111_client_portal_01_role.sql." });
    }

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const branchId = await resolveBranchId(company.id, accessSpec.siteIds);
    const passwordHash = await bcrypt.hash(password, 10);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO users (name, email, phone, password_hash, role, role_id, branch_id, invite_status, is_active, created_at)
       VALUES (?, ?, ?, ?, 'client', ?, ?, 'ACTIVE', 1, NOW())`,
      [name, email, phone, passwordHash, roleId, branchId]
    );
    await writeScopes(connection, result.insertId, company.id, accessSpec);
    await connection.commit();

    const logins = await loadLogins(company.id);
    res.status(201).json({ login: logins.find((l) => String(l.id) === String(result.insertId)) || null });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    sendError(res, err, "Failed to create client login");
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/client-accounts/logins/:userId
// body: { name?, phone?, is_active?, access?, site_ids? }
router.put("/logins/:userId", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  let connection;
  try {
    const { userId, companyId } = await loadManagedLogin(req, req.params.userId);
    const body = req.body || {};
    const sets = [];
    const params = [];

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return res.status(400).json({ error: "Name is required" });
      sets.push("name = ?");
      params.push(name);
    }
    if (body.phone !== undefined) {
      sets.push("phone = ?");
      params.push(String(body.phone || "").trim() || null);
    }
    if (body.is_active !== undefined) {
      sets.push("is_active = ?");
      params.push(body.is_active ? 1 : 0);
    }
    const accessSpec = body.access !== undefined ? await parseAccess(body, companyId) : null;

    connection = await pool.getConnection();
    await connection.beginTransaction();
    if (sets.length) {
      await connection.query(`UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE id = ?`, [...params, userId]);
    }
    if (accessSpec) {
      await writeScopes(connection, userId, companyId, accessSpec);
      const branchId = await resolveBranchId(companyId, accessSpec.siteIds);
      await connection.query("UPDATE users SET branch_id = ? WHERE id = ?", [branchId, userId]);
    }
    await connection.commit();

    const logins = await loadLogins(companyId);
    res.json({ login: logins.find((l) => String(l.id) === String(userId)) || null });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    sendError(res, err, "Failed to update client login");
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/client-accounts/logins/:userId/password  body: { password }
router.post("/logins/:userId/password", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  try {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const { userId } = await loadManagedLogin(req, req.params.userId);
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users SET password_hash = ?, invite_status = 'ACTIVE', invite_token = NULL, invite_expiry = NULL, updated_at = NOW()
       WHERE id = ?`,
      [hash, userId]
    );
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to reset password");
  }
});

// ---------- Shared documents (client_documents) ----------

const DOC_TYPES = ["CERTIFICATE", "CONTRACT", "MSDS", "REPORT", "OTHER"];
const DOC_MIME = /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-excel$)/;

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = DOC_MIME.test(file.mimetype);
    cb(ok ? null : httpError(400, "Only PDF, image, Word or Excel files can be uploaded"), ok);
  },
});

function acceptDocument(req, res, next) {
  docUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "The file must be 20 MB or smaller" : err.message || "Upload failed";
    res.status(err.status || 400).json({ error: message });
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Validates title/type/outlet/expiry from a request body. `partial` = only check given fields.
async function parseDocFields(body, companyId, partial = false) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || "").trim().slice(0, 200);
    if (!title) throw httpError(400, "Title is required");
    out.title = title;
  }
  if (!partial || body.doc_type !== undefined) {
    const type = String(body.doc_type || "OTHER").toUpperCase();
    out.doc_type = DOC_TYPES.includes(type) ? type : "OTHER";
  }
  if (!partial || body.site_id !== undefined) {
    const siteId = String(body.site_id || "").trim();
    if (siteId) {
      const [[site]] = await pool.query("SELECT id FROM sites WHERE id = ? AND company_id = ?", [siteId, companyId]);
      if (!site) throw httpError(400, "That outlet does not belong to this company");
    }
    out.site_id = siteId || null;
  }
  if (!partial || body.valid_until !== undefined) {
    const v = String(body.valid_until || "").trim();
    if (v && !DATE_ONLY.test(v)) throw httpError(400, "Invalid expiry date");
    out.valid_until = v || null;
  }
  if (!partial || body.notes !== undefined) {
    out.notes = String(body.notes || "").trim().slice(0, 500) || null;
  }
  return out;
}

const DOC_SELECT = `
  SELECT d.id, d.company_id, d.site_id, s.name AS site_name, d.title, d.doc_type, d.file_name, d.file_type,
         d.size_bytes, d.valid_until, d.notes, d.created_at, d.updated_at, u.name AS uploaded_by_name
  FROM client_documents d
  LEFT JOIN sites s ON s.id = d.site_id
  LEFT JOIN users u ON u.id = d.uploaded_by`;

async function loadManagedDocument(req, docId) {
  const [[doc]] = await pool.query(
    "SELECT id, company_id, object_key, file_name, file_type FROM client_documents WHERE id = ? AND is_active = 1",
    [docId]
  );
  if (!doc) throw httpError(404, "Document not found");
  await assertCanManageCompany(req, doc.company_id);
  return doc;
}

// GET /api/client-accounts/companies/:companyId/documents
router.get("/companies/:companyId/documents", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  try {
    const company = await assertCanManageCompany(req, req.params.companyId);
    const [docs] = await pool.query(
      `${DOC_SELECT} WHERE d.company_id = ? AND d.is_active = 1 ORDER BY d.created_at DESC`,
      [company.id]
    );
    res.json(docs);
  } catch (err) {
    sendError(res, err, "Failed to load documents");
  }
});

// POST /api/client-accounts/companies/:companyId/documents  (multipart: file, title, doc_type, site_id?, valid_until?, notes?)
router.post("/companies/:companyId/documents", auth, requirePermission(PERMISSIONS.CREATE_USER), acceptDocument, async (req, res) => {
  try {
    const company = await assertCanManageCompany(req, req.params.companyId);
    if (!req.file) return res.status(400).json({ error: "Choose a file to upload" });
    const fields = await parseDocFields(req.body || {}, company.id);

    const id = uuid();
    const safeName = String(req.file.originalname || "document").replace(/[^\w.-]+/g, "_").slice(-120);
    const objectKey = `client-documents/${company.id}/${id}_${safeName}`;
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, {
      "Content-Type": req.file.mimetype,
    });
    try {
      await pool.query(
        `INSERT INTO client_documents
           (id, company_id, site_id, title, doc_type, object_key, file_name, file_type, size_bytes, valid_until, notes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, company.id, fields.site_id, fields.title, fields.doc_type, objectKey, req.file.originalname || safeName,
          req.file.mimetype, req.file.size, fields.valid_until, fields.notes, req.user.id]
      );
    } catch (err) {
      await minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
      throw err;
    }
    const [[doc]] = await pool.query(`${DOC_SELECT} WHERE d.id = ?`, [id]);
    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err, "Failed to upload document");
  }
});

// PUT /api/client-accounts/documents/:docId  body: { title?, doc_type?, site_id?, valid_until?, notes? }
router.put("/documents/:docId", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  try {
    const doc = await loadManagedDocument(req, req.params.docId);
    const fields = await parseDocFields(req.body || {}, doc.company_id, true);
    const keys = Object.keys(fields);
    if (keys.length) {
      await pool.query(
        `UPDATE client_documents SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
        [...keys.map((k) => fields[k]), doc.id]
      );
    }
    const [[updated]] = await pool.query(`${DOC_SELECT} WHERE d.id = ?`, [doc.id]);
    res.json(updated);
  } catch (err) {
    sendError(res, err, "Failed to update document");
  }
});

// DELETE /api/client-accounts/documents/:docId -> hides it from the client (file kept for history)
router.delete("/documents/:docId", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  try {
    const doc = await loadManagedDocument(req, req.params.docId);
    await pool.query("UPDATE client_documents SET is_active = 0 WHERE id = ?", [doc.id]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to remove document");
  }
});

// GET /api/client-accounts/documents/:docId/file -> staff preview/download
router.get("/documents/:docId/file", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  try {
    const doc = await loadManagedDocument(req, req.params.docId);
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, doc.object_key);
    res.setHeader("Content-Type", doc.file_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${String(doc.file_name).replace(/"/g, "")}"`);
    stream.on("error", () => (res.headersSent ? res.destroy() : res.status(500).end()));
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to load file");
  }
});

module.exports = router;
