
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { v4: uuid } = require("uuid");



// GET all contacts (active only)
// GET contacts (optionally filter by site)
router.get("/", auth, allowRoles("admin", "supervisor"), async (req, res) => {

  const { site_id } = req.query;

  try {

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
        co.site AS company_site
      FROM contacts c
      LEFT JOIN companies co ON c.company_id = co.id
      WHERE c.is_verified = 1
    `;

    const params = [];

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


// CREATE contact
router.post("/", auth, allowRoles("admin", "supervisor"), async (req, res) => {
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
        is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        id,
        company_id || null,
        name,
        phone,
        email || null,
        role || null,
        is_primary ? 1 : 0
      ]
    );

    let companyMeta = null;
    if (company_id) {
      const [[company]] = await pool.query(
        "SELECT id, name, code, type, site FROM companies WHERE id = ?",
        [company_id]
      );
      if (company) {
        companyMeta = {
          id: company.id,
          name: company.name || null,
          code: company.code || null,
          type: company.type || null,
          site: company.site || null,
        };
      }
    }

    res.json({
      success: true,
      contact: {
        id,
        name,
        phone,
        email: email || null,
        company_id: company_id || null,
        company_code: companyMeta?.code || null,
        company_name: companyMeta?.name || null,
        company_type: companyMeta?.type || null,
        company_site: companyMeta?.site || null,
        role: role || null,
        is_primary: is_primary ? 1 : 0,
      },
    });

  } catch (err) {
    console.error("Create contact error:", err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});


module.exports = router;
