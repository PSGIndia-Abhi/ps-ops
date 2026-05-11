
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { resolveHeadOfficeBranchId } = require("../utils/branch");
const { resolveGroupTable } = require("../utils/groupTable");



// GET all contacts (active only)
// GET contacts (optionally filter by site)
//add logo object key here later
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {

  const { site_id } = req.query;

  try {
    const groupTable = await resolveGroupTable(pool);
    const groupRef = "`group_name`"; // Default to old column name for backward compatibility

    let sql = `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.company_id,
        co.name AS company_name,
        co.code AS company_code,
        co.type AS company_type,
        s.name AS company_site,
        g.name AS group_name,
        u.id AS user_id,
        u.invite_status

      FROM contacts c
      LEFT JOIN sites s ON c.company_id = s.id
      LEFT JOIN companies co ON s.company_id = co.id
      LEFT JOIN ${groupRef} g ON co.group_id = g.id
      LEFT JOIN users u ON u.contact_id = c.id
      WHERE c.is_verified = 1 AND c.is_active = 1
    `;

    const params = [];

    if (["branch_admin", "supervisor"].includes(req.user.role)) {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );
      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }
      sql += ` AND c.branch_id = ? `;
      params.push(me.branch_id);
    }

    if (site_id) {
      sql += ` AND c.company_id = ? `;
      params.push(site_id);
    }

    sql += ` ORDER BY c.name ASC`;

    const [rows] = await pool.query(sql, params);

    res.json(rows);

  } catch (err) {
    console.error("Error fetching contacts:", err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// GET single contact by ID
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req,res)=>{
  try {
    const [rows] = await pool.query(
      `SELECT * FROM contacts WHERE id = ? AND is_active = 1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

// CREATE contact
router.post(
  "/",
  auth,
  requirePermission(PERMISSIONS.CREATE_CONTACT),
  async (req, res) => {
    const {
      name,
      phone,
      email,
      company_id,
      role,
      is_primary
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" });
    }

    try {
      const id = uuid();

      // ✅ Resolve branch_id
      let resolvedBranchId = null;

      if (req.user.role === "admin") {
        resolvedBranchId = await resolveHeadOfficeBranchId(pool);

      } else {
        const [[me]] = await pool.query(
          "SELECT branch_id FROM users WHERE id = ?",
          [req.user.id]
        );

        if (!me?.branch_id) {
          return res.status(403).json({ error: "User has no branch assigned" });
        }

        resolvedBranchId = me.branch_id;
      }

      // ✅ Duplicate check
      const [existing] = await pool.query(
        `SELECT id FROM contacts WHERE phone = ? AND (company_id <=> ?)`,
        [phone, company_id || null]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          error: "Contact already exists for this company",
        });
      }

      // ✅ Insert
      await pool.query(
        `
        INSERT INTO contacts (
          id,
          company_id,
          name,
          phone,
          email,
          role,
          is_primary,
          is_verified,
          branch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `,
        [
          id,
          company_id || null,
          name,
          phone,
          email || null,
          role || null,
          is_primary ? 1 : 0,
          resolvedBranchId
        ]
      );

      // ✅ Fetch company meta
      let companyMeta = null;

      if (company_id) {
        const [[company]] = await pool.query(
          `
          SELECT
            co.id,
            co.name,
            co.code,
            co.type,
            g.name AS group_name,
            co.logo_object_key
          FROM companies co
          LEFT JOIN group_name g ON g.id = co.group_id
          WHERE co.id = ?
          `,
          [company_id]
        );

        if (company) {
          companyMeta = company;
        }
      }

      // ✅ Response
      res.json({
        success: true,
        contact: {
          id,
          name,
          phone,
          email: email || null,
          company_id: company_id || null,
          branch_id: resolvedBranchId,
          company_name: companyMeta?.name || null,
          company_code: companyMeta?.code || null,
          company_type: companyMeta?.type || null,
          group_name: companyMeta?.group_name || null,
          company_logo_url: companyMeta?.logo_object_key
            ? `/api/companies/${companyMeta.id}/logo`
            : null,
          role: role || null,
          is_primary: is_primary ? 1 : 0,
        },
      });

    } catch (err) {
      console.error("Create contact error:", err);
      res.status(500).json({ error: "Failed to create contact" });
    }
  }
);

//update contact
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_CONTACT), async (req,res)=>{
  const { name, phone, email, role, is_primary } = req.body;

  try {
    let sql = `
      UPDATE contacts
      SET name = ?, phone = ?, email = ?, role = ?, is_primary = ?
      WHERE id = ?
    `;

    const params = [
      name,
      phone,
      email || null,
      role || null,
      is_primary ? 1 : 0,
      req.params.id
    ];

    // ✅ restrict branch_admin BEFORE query runs
    if (req.user.role === "branch_admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );

      sql += ` AND branch_id = ?`;
      params.push(me.branch_id);
    }

    await pool.query(sql, params);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update contact" });
  }
});

//delete contact
router.delete("/:id", auth, requirePermission(PERMISSIONS.DELETE_CONTACT), async (req,res)=>{
  try {

    let sql = `UPDATE contacts SET is_active = 0 WHERE id = ?`;
    const params = [req.params.id];

    // restrict branch_admin
    if (req.user.role === "branch_admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );

      sql += ` AND branch_id = ?`;
      params.push(me.branch_id);
    }

    await pool.query(sql, params);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

module.exports = router;
