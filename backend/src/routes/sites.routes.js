const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { resolveGroupTable } = require("../utils/groupTable");

function siteDetailQuery(groupRef) {
  return `
    SELECT
      s.id,
      s.name,
      s.address,
      s.city,
      s.state,
      s.is_active,
      s.company_id,
      s.branch_id,
      s.location_id,
      s.created_at,
      s.updated_at,
      co.name AS company_name,
      co.code AS company_code,
      co.type AS company_type,
      co.gst_number AS company_gst_number,
      g.id AS group_id,
      g.name AS group_name,
      b.name AS branch_name,
      l.latitude,
      l.longitude,
      l.provider_place_id,
      l.postal_code,
      l.country
    FROM sites s
    LEFT JOIN companies co ON co.id = s.company_id
    LEFT JOIN ${groupRef} g ON g.id = co.group_id
    LEFT JOIN branches b ON b.id = s.branch_id
    LEFT JOIN locations l ON s.location_id = l.id
    WHERE s.id = ?
  `;
}

// Non-admins may only see/edit/delete sites in their own branch.
async function assertSiteInScope(req, site) {
  if (req.user.role === "admin") return true;
  const [[me]] = await pool.query("SELECT branch_id FROM users WHERE id = ?", [req.user.id]);
  return Boolean(me?.branch_id) && String(site.branch_id || "") === String(me.branch_id);
}

// GET /api/sites
// add logo object key later
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {
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
        s.created_at,
        co.name AS company_name,
        co.code AS company_code,
        co.type AS company_type,
        co.gst_number AS company_gst_number,
        g.id AS group_id,
        g.name AS group_name,
        l.latitude,
        l.longitude,
        l.provider_place_id,
        l.postal_code,
        l.country,
        (SELECT COUNT(*) FROM contacts WHERE contacts.company_id = s.id) AS contact_count,
        (SELECT COUNT(*) FROM jobs WHERE jobs.company_id = s.id) AS job_count
      FROM sites s
      LEFT JOIN companies co ON co.id = s.company_id
      LEFT JOIN ${groupRef} g ON g.id = co.group_id
      LEFT JOIN locations l ON s.location_id = l.id
      WHERE s.is_active = 1
    `;

    const params = [];
    let whereAdded = true;

    // ✅ existing filter
    if (company_id) {
      sql += " AND s.company_id = ?";
      params.push(company_id);
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
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_CONTACT), async (req, res) => {
  const {
  company_id,
  name,
  address,
  city,
  state,
  postal_code,
  country,
  latitude,
  longitude,
  place_id,
} = req.body || {};

const trimmedPostalCode =
  typeof postal_code === "string" ? postal_code.trim() : "";

const trimmedCountry =
  typeof country === "string" ? country.trim() : "";

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
      "SELECT id FROM sites WHERE company_id = ? AND name = ? AND is_active = 1",
      [company_id, trimmedName]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Site already exists for this company" });
    }

    const id = uuid();
    const locationId = uuid();

await pool.query(
  `
  INSERT INTO locations (
    id,
    provider,
    provider_place_id,
    formatted_address,
    latitude,
    longitude,
    city,
    state,
    postal_code,
    country
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    locationId,
    "google",
    place_id || null,
    trimmedAddress || null,
    latitude || null,
    longitude || null,
    trimmedCity || null,
    trimmedState || null,
    trimmedPostalCode || null,
    trimmedCountry || null,
  ]
);
    await pool.query(
      `INSERT INTO sites
(
  id,
  company_id,
  branch_id,
  location_id,
  name,
  address,
  city,
  state,
  is_active
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
          id,
  company_id,
  me.branch_id,
  locationId,
  trimmedName,
  trimmedAddress || null,
  trimmedCity || null,
  trimmedState || null,
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
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Site already exists for this company" });
    }
    res.status(500).json({ error: "Failed to create site" });
  }
});

// GET /api/sites/:id — full detail for the "View" action
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {
  const { id } = req.params;

  try {
    const groupRef = "`group_name`";
    const [[site]] = await pool.query(siteDetailQuery(groupRef), [id]);

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    if (!(await assertSiteInScope(req, site))) {
      return res.status(404).json({ error: "Site not found" });
    }

    res.json(site);
  } catch (err) {
    console.error("Error fetching site:", err);
    res.status(500).json({ error: "Failed to fetch site" });
  }
});

// PUT /api/sites/:id — edit a site. Contacts/jobs join to it live by
// company_id (their legacy name for "site id"), and the Companies/Groups
// views join through s.company_id too, so a rename or company reassignment
// shows up everywhere that reads it — no denormalized copies to update.
// Note: this does not touch the linked `locations` row (lat/lng/geocode) —
// re-geocoding on address edit is not implemented here.
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_CONTACT), async (req, res) => {
  const { id } = req.params;
  const { company_id, name, address, city, state } = req.body || {};

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
    const [[existingSite]] = await pool.query("SELECT id, branch_id FROM sites WHERE id = ?", [id]);
    if (!existingSite) {
      return res.status(404).json({ error: "Site not found" });
    }
    if (!(await assertSiteInScope(req, existingSite))) {
      return res.status(404).json({ error: "Site not found" });
    }

    const [[company]] = await pool.query("SELECT id FROM companies WHERE id = ?", [company_id]);
    if (!company) {
      return res.status(400).json({ error: "Invalid company" });
    }

    const [duplicates] = await pool.query(
      "SELECT id FROM sites WHERE company_id = ? AND name = ? AND id != ? AND is_active = 1",
      [company_id, trimmedName, id]
    );
    if (duplicates.length > 0) {
      return res.status(409).json({ error: "Site already exists for this company" });
    }

    await pool.query(
      `UPDATE sites
       SET company_id = ?, name = ?, address = ?, city = ?, state = ?, updated_at = NOW()
       WHERE id = ?`,
      [company_id, trimmedName, trimmedAddress || null, trimmedCity || null, trimmedState || null, id]
    );

    const groupRef = "`group_name`";
    const [[updated]] = await pool.query(siteDetailQuery(groupRef), [id]);

    res.json(updated);
  } catch (err) {
    console.error("Error updating site:", err);
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Site already exists for this company" });
    }
    res.status(500).json({ error: "Failed to update site" });
  }
});

// DELETE /api/sites/:id — soft delete. contacts.company_id and jobs.company_id
// are both (confusingly named, but real) foreign keys to sites.id with no ON
// DELETE action, so a hard DELETE here would be refused by the DB while
// either still references the site — and historical contacts/jobs shouldn't
// be forced out just to remove a site. Instead this only ever flips
// is_active off: the site drops out of every list/picker (GET / already
// filters is_active = 1) but existing contacts/jobs/bookings still resolve
// it fine by id. The admin confirms this once client-side (the sites list
// carries contact_count/job_count so the UI can warn before calling this),
// so no linked-record check or block happens here.
router.delete("/:id", auth, requirePermission(PERMISSIONS.DELETE_CONTACT), async (req, res) => {
  const { id } = req.params;

  try {
    const [[existingSite]] = await pool.query("SELECT id, branch_id FROM sites WHERE id = ?", [id]);
    if (!existingSite) {
      return res.status(404).json({ error: "Site not found" });
    }
    if (!(await assertSiteInScope(req, existingSite))) {
      return res.status(404).json({ error: "Site not found" });
    }

    await pool.query("UPDATE sites SET is_active = 0, updated_at = NOW() WHERE id = ?", [id]);

    res.json({ success: true, deleted: true, soft_deleted: true });
  } catch (err) {
    console.error("Error deleting site:", err);
    res.status(500).json({ error: "Failed to delete site" });
  }
});

module.exports = router;
