const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { resolveGroupTable } = require("../utils/groupTable");

// GET /api/groups
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {
  try {
    const groupTable = await resolveGroupTable(pool);
    const tableRef = "`group_name`";

    const [rows] = await pool.query(
      `SELECT id, name, created_at
       FROM ${tableRef}
       WHERE is_active = 1
       ORDER BY name ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching groups:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// POST /api/groups
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_CONTACT), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const groupTable = await resolveGroupTable(pool);
    const tableRef = "`group_name`";
    const [existing] = await pool.query(
      `SELECT id FROM ${tableRef} WHERE name = ?`,
      [name]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Group already exists" });
    }

    const id = uuid();
    await pool.query(
      `INSERT INTO ${tableRef} (id, name, created_at) VALUES (?, ?, NOW())`,
      [id, name]
    );

    res.status(201).json({ id, name });
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json({ error: "Failed to create group" });
  }
});

// GET /api/groups/:id — single group detail, with a live count of companies under it
router.get("/:id", auth, requirePermission(PERMISSIONS.VIEW_CONTACT), async (req, res) => {
  const { id } = req.params;

  try {
    const tableRef = "`group_name`";
    const [[group]] = await pool.query(
      `SELECT id, name, created_at FROM ${tableRef} WHERE id = ?`,
      [id]
    );

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const [[{ company_count }]] = await pool.query(
      "SELECT COUNT(*) AS company_count FROM companies WHERE group_id = ?",
      [id]
    );

    res.json({ ...group, company_count });
  } catch (err) {
    console.error("Error fetching group:", err);
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

// PUT /api/groups/:id — rename a group. Companies join to the group live by
// group_id, so every module that shows a company's group (Companies page,
// Sites, Contacts) picks up the new name automatically — no denormalized
// copies to update.
router.put("/:id", auth, requirePermission(PERMISSIONS.UPDATE_CONTACT), async (req, res) => {
  const { id } = req.params;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const tableRef = "`group_name`";
    const [[existingGroup]] = await pool.query(`SELECT id FROM ${tableRef} WHERE id = ?`, [id]);
    if (!existingGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    const [duplicates] = await pool.query(
      `SELECT id FROM ${tableRef} WHERE name = ? AND id != ?`,
      [name, id]
    );
    if (duplicates.length > 0) {
      return res.status(409).json({ error: "Group already exists" });
    }

    await pool.query(`UPDATE ${tableRef} SET name = ? WHERE id = ?`, [name, id]);

    res.json({ id, name });
  } catch (err) {
    console.error("Error updating group:", err);
    res.status(500).json({ error: "Failed to update group" });
  }
});

// DELETE /api/groups/:id — soft delete. A group can only be removed once it
// has no remaining *active* companies — soft-deleted companies don't count,
// so soft-deleting a group's last company (via the companies soft delete
// above) unblocks this. The group itself is never hard-deleted either: this
// only flips is_active off, so it drops out of GET / (and every dropdown
// built from it) while historical companies/sites that joined through it
// keep resolving its name fine.
router.delete("/:id", auth, requirePermission(PERMISSIONS.DELETE_CONTACT), async (req, res) => {
  const { id } = req.params;

  try {
    const tableRef = "`group_name`";
    const [[existingGroup]] = await pool.query(`SELECT id FROM ${tableRef} WHERE id = ?`, [id]);
    if (!existingGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    const [[{ company_count }]] = await pool.query(
      "SELECT COUNT(*) AS company_count FROM companies WHERE group_id = ? AND is_active = 1",
      [id]
    );

    if (company_count > 0) {
      return res.status(400).json({
        error: `This group has ${company_count} compan${company_count === 1 ? "y" : "ies"} assigned to it. Delete ${company_count === 1 ? "that company" : "those companies"} first, then delete the group.`,
        active_companies: company_count,
      });
    }

    await pool.query(`UPDATE ${tableRef} SET is_active = 0 WHERE id = ?`, [id]);

    res.json({ success: true, deleted: true, soft_deleted: true });
  } catch (err) {
    console.error("Error deleting group:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

module.exports = router;
