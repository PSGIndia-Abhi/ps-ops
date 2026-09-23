const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { activeOn, logAudit } = require("../utils/hierarchy");

const IN_USE_SQL = `(SELECT COUNT(*) FROM user_org_units m
                      WHERE m.designation_id = d.id AND ${activeOn("m")})`;

async function loadDesignation(id) {
  const [[row]] = await pool.query(
    `SELECT d.id, d.name, d.is_active, d.created_at, ${IN_USE_SQL} AS in_use
       FROM designations d WHERE d.id = ?`,
    [id]
  );
  return row || null;
}

// GET /api/designations — ?include_inactive=1 to also list deactivated titles
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_HIERARCHY), async (req, res) => {
  try {
    const where = req.query.include_inactive === "1" ? "" : "WHERE d.is_active = 1";
    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.is_active, d.created_at, ${IN_USE_SQL} AS in_use
         FROM designations d ${where}
        ORDER BY d.name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching designations:", err);
    res.status(500).json({ error: "Failed to fetch designations" });
  }
});

// POST /api/designations
router.post("/", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "Designation name is required" });
  if (name.length > 100) return res.status(400).json({ error: "Designation name is too long (max 100 characters)" });

  try {
    const [[existing]] = await pool.query("SELECT id, is_active FROM designations WHERE name = ?", [name]);
    if (existing) {
      return res.status(409).json({
        error: existing.is_active
          ? "Designation already exists"
          : "A deactivated designation with this name already exists. Reactivate it instead.",
      });
    }

    const id = uuid();
    await pool.query("INSERT INTO designations (id, name) VALUES (?, ?)", [id, name]);
    const created = await loadDesignation(id);
    await logAudit(pool, {
      entityType: "DESIGNATION", entityId: id, action: "CREATE",
      newValue: { name }, changedBy: req.user.id,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating designation:", err);
    if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Designation already exists" });
    res.status(500).json({ error: "Failed to create designation" });
  }
});

// PUT /api/designations/:id — rename and/or reactivate. Deactivating goes
// through DELETE so the in-use check lives in one place.
router.put("/:id", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const { id } = req.params;
  const hasName = req.body?.name !== undefined;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const reactivate = req.body?.is_active === true || req.body?.is_active === 1;

  if (req.body?.is_active === false || req.body?.is_active === 0) {
    return res.status(400).json({ error: "Use DELETE to deactivate a designation" });
  }
  if (hasName && !name) return res.status(400).json({ error: "Designation name is required" });
  if (name.length > 100) return res.status(400).json({ error: "Designation name is too long (max 100 characters)" });
  if (!hasName && !reactivate) return res.status(400).json({ error: "Nothing to update" });

  try {
    const existing = await loadDesignation(id);
    if (!existing) return res.status(404).json({ error: "Designation not found" });

    if (hasName && name !== existing.name) {
      const [dupes] = await pool.query("SELECT id FROM designations WHERE name = ? AND id != ?", [name, id]);
      if (dupes.length) return res.status(409).json({ error: "Designation already exists" });
    }

    await pool.query(
      "UPDATE designations SET name = ?, is_active = ? WHERE id = ?",
      [hasName ? name : existing.name, reactivate ? 1 : existing.is_active, id]
    );
    const updated = await loadDesignation(id);
    await logAudit(pool, {
      entityType: "DESIGNATION", entityId: id, action: "UPDATE",
      oldValue: { name: existing.name, is_active: existing.is_active },
      newValue: { name: updated.name, is_active: updated.is_active },
      changedBy: req.user.id,
    });
    res.json(updated);
  } catch (err) {
    console.error("Error updating designation:", err);
    if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Designation already exists" });
    res.status(500).json({ error: "Failed to update designation" });
  }
});

// DELETE /api/designations/:id — soft delete, blocked while anyone currently
// holds the title (same "clear it first" rule as groups/companies).
router.delete("/:id", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await loadDesignation(id);
    if (!existing) return res.status(404).json({ error: "Designation not found" });

    if (Number(existing.in_use) > 0) {
      return res.status(400).json({
        error: `${existing.in_use} ${Number(existing.in_use) === 1 ? "person has" : "people have"} the designation "${existing.name}". Change their designation first, then delete it.`,
        in_use: Number(existing.in_use),
      });
    }

    await pool.query("UPDATE designations SET is_active = 0 WHERE id = ?", [id]);
    await logAudit(pool, {
      entityType: "DESIGNATION", entityId: id, action: "DEACTIVATE",
      oldValue: { name: existing.name, is_active: existing.is_active },
      newValue: { name: existing.name, is_active: 0 },
      changedBy: req.user.id,
    });
    res.json({ success: true, deleted: true, soft_deleted: true });
  } catch (err) {
    console.error("Error deleting designation:", err);
    res.status(500).json({ error: "Failed to delete designation" });
  }
});

module.exports = router;
