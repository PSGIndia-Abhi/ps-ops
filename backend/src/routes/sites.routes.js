const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { v4: uuid } = require("uuid");
const { resolveGroupTable } = require("../utils/groupTable");

// GET /api/sites
// add logo object key later
router.get("/", auth, allowRoles("admin", "branch_admin", "supervisor", "client"), async (req, res) => {
  const { company_id } = req.query;



  try {
    const groupTable = await resolveGroupTable(pool);
    const groupRef = "`group_name`";

    let sql = `
      SELECT
        s.id,
        s.name,
        s.address,
        s.city,
        s.state,
        s.is_active,
        s.company_id,
        co.name AS company_name,
        co.code AS company_code,
        co.type AS company_type,
        co.gst_number AS company_gst_number,
        g.id AS group_id,
        g.name AS group_name
      FROM sites s
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN ${groupRef} g ON g.id = co.group_id
    `;

    const params = [];
    let whereAdded = false;

    // ✅ existing filter
    if (company_id) {
      sql += " WHERE s.company_id = ?";
      params.push(company_id);
      whereAdded = true;
    }

    // 🔥 NEW: branch filter
    if (req.user.role !== "admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );

      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }

      sql += whereAdded ? " AND s.branch_id = ?" : " WHERE s.branch_id = ?";
      params.push(me.branch_id);
      whereAdded = true;
    }

    sql += " ORDER BY co.name ASC, s.name ASC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error("Error fetching sites:", err);
    res.status(500).json({ error: "Failed to fetch sites" });
  }
});

// POST /api/sites
router.post("/", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  const {
    company_id,
    name,
    address,
    city,
    state
  } = req.body || {};

  const [[me]] = await pool.query(
    "SELECT branch_id FROM users WHERE id = ?",
    [req.user.id]
  );

  if (!me?.branch_id) {
    return res.status(403).json({ error: "Branch not assigned" });
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedAddress = typeof address === "string" ? address.trim() : "";
  const trimmedCity = typeof city === "string" ? city.trim() : "";
  const trimmedState = typeof state === "string" ? state.trim() : "";

  if (!company_id) {
    return res.status(400).json({ error: "Company is required" });
  }

  if (!trimmedName) {
    return res.status(400).json({ error: "Site name is required" });
  }

  try {
    const [[company]] = await pool.query(
      "SELECT id FROM companies WHERE id = ?",
      [company_id]
    );
    if (!company) {
      return res.status(400).json({ error: "Invalid company" });
    }

    const [existing] = await pool.query(
      "SELECT id FROM sites WHERE company_id = ? AND name = ?",
      [company_id, trimmedName]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Site already exists for this company" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO sites
  (id, company_id, branch_id, name, address, city, state, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        company_id,
        me.branch_id, // ✅ correct position
        trimmedName,
        trimmedAddress || null,
        trimmedCity || null,
        trimmedState || null
      ]
    );
    const groupTable = await resolveGroupTable(pool);
    const groupRef = "`group_name`";
    const [[created]] = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.address,
        s.city,
        s.state,
        s.is_active,
        s.company_id,
        co.name AS company_name,
        co.code AS company_code,
        co.type AS company_type,
        co.gst_number AS company_gst_number,
        g.id AS group_id,
        g.name AS group_name
      FROM sites s
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN ${groupRef} g ON g.id = co.group_id
      WHERE s.id = ?
      `,
      [id]
    );

    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating site:", err);
    res.status(500).json({ error: "Failed to create site" });
  }
});

module.exports = router;
