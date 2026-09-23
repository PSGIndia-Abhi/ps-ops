const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const { activeOn, fmtDate, logAudit } = require("../utils/hierarchy");

const UNIT_FIELDS = `u.id, u.name, u.parent_id, u.unit_type, u.branch_id, b.name AS branch_name,
                     u.sort_order, u.is_active, u.created_at, u.updated_at`;

async function loadUnit(executor, id) {
  const [[row]] = await executor.query(
    `SELECT ${UNIT_FIELDS} FROM org_units u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?`,
    [id]
  );
  return row || null;
}

// Is `candidateParentId` the unit itself or anywhere below it? Moving a unit
// under its own descendant would cut the tree into a loop.
async function isSelfOrDescendant(unitId, candidateParentId) {
  const seen = new Set();
  let current = candidateParentId;
  while (current) {
    if (current === unitId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const [[row]] = await pool.query("SELECT parent_id FROM org_units WHERE id = ?", [current]);
    current = row?.parent_id || null;
  }
  return false;
}

function cleanOptionalString(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > max) return false;
  return trimmed || null;
}

// GET /api/org-units — flat list, or nested with ?tree=1.
// ?include_inactive=1 also returns deactivated units.
router.get("/", auth, requirePermission(PERMISSIONS.VIEW_HIERARCHY), async (req, res) => {
  try {
    const where = req.query.include_inactive === "1" ? "" : "WHERE u.is_active = 1";
    const [units] = await pool.query(
      `SELECT ${UNIT_FIELDS},
              (SELECT COUNT(*) FROM user_org_units m
                 JOIN users us ON us.id = m.user_id
                WHERE m.org_unit_id = u.id AND ${activeOn("m")} AND us.is_active = 1) AS member_count
         FROM org_units u
         LEFT JOIN branches b ON b.id = u.branch_id
         ${where}
        ORDER BY u.sort_order ASC, u.name ASC`
    );

    const [heads] = await pool.query(
      `SELECT m.org_unit_id, us.id AS user_id, us.name
         FROM user_org_units m
         JOIN users us ON us.id = m.user_id
        WHERE m.is_head = 1 AND ${activeOn("m")} AND us.is_active = 1`
    );
    const headsByUnit = new Map();
    for (const h of heads) {
      if (!headsByUnit.has(h.org_unit_id)) headsByUnit.set(h.org_unit_id, []);
      headsByUnit.get(h.org_unit_id).push({ user_id: Number(h.user_id), name: h.name });
    }

    const rows = units.map((u) => ({
      ...u,
      member_count: Number(u.member_count),
      heads: headsByUnit.get(u.id) || [],
    }));

    if (req.query.tree !== "1") return res.json(rows);

    const byId = new Map(rows.map((u) => [u.id, { ...u, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    res.json(roots);
  } catch (err) {
    console.error("Error fetching org units:", err);
    res.status(500).json({ error: "Failed to fetch units" });
  }
});

// GET /api/org-units/:id/members — people currently in the unit
router.get("/:id/members", auth, requirePermission(PERMISSIONS.VIEW_HIERARCHY), async (req, res) => {
  try {
    const unit = await loadUnit(pool, req.params.id);
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    const [rows] = await pool.query(
      `SELECT m.id AS membership_id, us.id AS user_id, us.name, us.email, us.phone,
              r.name AS role, d.name AS designation, m.designation_id,
              m.is_head, m.is_primary,
              ${fmtDate("m.effective_from")} AS effective_from,
              ${fmtDate("m.effective_to")} AS effective_to
         FROM user_org_units m
         JOIN users us ON us.id = m.user_id
         LEFT JOIN roles r ON r.id = us.role_id
         LEFT JOIN designations d ON d.id = m.designation_id
        WHERE m.org_unit_id = ? AND ${activeOn("m")} AND us.is_active = 1
        ORDER BY m.is_head DESC, us.name ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching unit members:", err);
    res.status(500).json({ error: "Failed to fetch unit members" });
  }
});

// POST /api/org-units
router.post("/", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const parentId = req.body?.parent_id || null;
  const unitType = cleanOptionalString(req.body?.unit_type, 50);
  const branchId = req.body?.branch_id || null;

  if (!name) return res.status(400).json({ error: "Unit name is required" });
  if (name.length > 150) return res.status(400).json({ error: "Unit name is too long (max 150 characters)" });
  if (unitType === false) return res.status(400).json({ error: "Unit type is too long (max 50 characters)" });
  // The root ("BestServe") is seeded; every other unit must sit under something.
  if (!parentId) return res.status(400).json({ error: "Parent unit is required" });

  try {
    const parent = await loadUnit(pool, parentId);
    if (!parent || !parent.is_active) return res.status(400).json({ error: "Invalid parent unit" });

    if (branchId) {
      const [[branch]] = await pool.query("SELECT id FROM branches WHERE id = ?", [branchId]);
      if (!branch) return res.status(400).json({ error: "Invalid branch" });
    }

    const [dupes] = await pool.query("SELECT id FROM org_units WHERE parent_id = ? AND name = ?", [parentId, name]);
    if (dupes.length) return res.status(409).json({ error: "A unit with this name already exists under this parent" });

    let sortOrder = req.body?.sort_order;
    if (sortOrder === undefined || sortOrder === null || sortOrder === "") {
      const [[max]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM org_units WHERE parent_id = ?", [parentId]);
      sortOrder = max.next;
    }
    if (!Number.isInteger(Number(sortOrder))) return res.status(400).json({ error: "Sort order must be a whole number" });

    const id = uuid();
    await pool.query(
      `INSERT INTO org_units (id, name, parent_id, unit_type, branch_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, parentId, unitType ?? null, branchId, Number(sortOrder)]
    );
    const created = await loadUnit(pool, id);
    await logAudit(pool, {
      entityType: "UNIT", entityId: id, action: "CREATE",
      newValue: { name, parent_id: parentId, unit_type: unitType ?? null, branch_id: branchId },
      changedBy: req.user.id,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating unit:", err);
    if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A unit with this name already exists under this parent" });
    res.status(500).json({ error: "Failed to create unit" });
  }
});

// PUT /api/org-units/:id — rename, move, retype, relink to a branch, reorder,
// or reactivate. Deactivating goes through DELETE.
router.put("/:id", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  if (body.is_active === false || body.is_active === 0) {
    return res.status(400).json({ error: "Use DELETE to deactivate a unit" });
  }

  try {
    const existing = await loadUnit(pool, id);
    if (!existing) return res.status(404).json({ error: "Unit not found" });

    const next = {
      name: existing.name,
      parent_id: existing.parent_id,
      unit_type: existing.unit_type,
      branch_id: existing.branch_id,
      sort_order: existing.sort_order,
      is_active: existing.is_active,
    };

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "Unit name is required" });
      if (name.length > 150) return res.status(400).json({ error: "Unit name is too long (max 150 characters)" });
      next.name = name;
    }

    if (body.unit_type !== undefined) {
      const unitType = cleanOptionalString(body.unit_type, 50);
      if (unitType === false) return res.status(400).json({ error: "Unit type is too long (max 50 characters)" });
      next.unit_type = unitType;
    }

    if (body.sort_order !== undefined) {
      if (!Number.isInteger(Number(body.sort_order))) return res.status(400).json({ error: "Sort order must be a whole number" });
      next.sort_order = Number(body.sort_order);
    }

    if (body.branch_id !== undefined) {
      if (body.branch_id) {
        const [[branch]] = await pool.query("SELECT id FROM branches WHERE id = ?", [body.branch_id]);
        if (!branch) return res.status(400).json({ error: "Invalid branch" });
      }
      next.branch_id = body.branch_id || null;
    }

    if (body.parent_id !== undefined && (body.parent_id || null) !== existing.parent_id) {
      if (!existing.parent_id) {
        return res.status(400).json({ error: "The top-level unit cannot be moved" });
      }
      if (!body.parent_id) {
        return res.status(400).json({ error: "Parent unit is required" });
      }
      const newParent = await loadUnit(pool, body.parent_id);
      if (!newParent || !newParent.is_active) return res.status(400).json({ error: "Invalid parent unit" });
      if (await isSelfOrDescendant(id, body.parent_id)) {
        return res.status(400).json({ error: "A unit cannot be moved under itself or one of its own sub-units" });
      }
      next.parent_id = body.parent_id;
    }

    if (body.is_active === true || body.is_active === 1) {
      if (existing.parent_id) {
        const parent = await loadUnit(pool, next.parent_id);
        if (!parent || !parent.is_active) {
          return res.status(400).json({ error: "Reactivate the parent unit first" });
        }
      }
      next.is_active = 1;
    }

    const [dupes] = await pool.query(
      "SELECT id FROM org_units WHERE parent_id <=> ? AND name = ? AND id != ?",
      [next.parent_id, next.name, id]
    );
    if (dupes.length) return res.status(409).json({ error: "A unit with this name already exists under this parent" });

    await pool.query(
      `UPDATE org_units
          SET name = ?, parent_id = ?, unit_type = ?, branch_id = ?, sort_order = ?, is_active = ?
        WHERE id = ?`,
      [next.name, next.parent_id, next.unit_type, next.branch_id, next.sort_order, next.is_active, id]
    );

    const updated = await loadUnit(pool, id);
    await logAudit(pool, {
      entityType: "UNIT", entityId: id, action: "UPDATE",
      oldValue: {
        name: existing.name, parent_id: existing.parent_id, unit_type: existing.unit_type,
        branch_id: existing.branch_id, sort_order: existing.sort_order, is_active: existing.is_active,
      },
      newValue: next,
      changedBy: req.user.id,
    });
    res.json(updated);
  } catch (err) {
    console.error("Error updating unit:", err);
    if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A unit with this name already exists under this parent" });
    res.status(500).json({ error: "Failed to update unit" });
  }
});

// DELETE /api/org-units/:id — soft delete. Blocked while the unit still has
// active sub-units or people, and the top-level unit can never be removed.
router.delete("/:id", auth, requirePermission(PERMISSIONS.MANAGE_DEPARTMENTS), async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await loadUnit(pool, id);
    if (!existing) return res.status(404).json({ error: "Unit not found" });
    if (!existing.parent_id) {
      return res.status(400).json({ error: "The top-level unit cannot be deleted" });
    }

    const [[{ child_count }]] = await pool.query(
      "SELECT COUNT(*) AS child_count FROM org_units WHERE parent_id = ? AND is_active = 1",
      [id]
    );
    if (child_count > 0) {
      return res.status(400).json({
        error: `This unit has ${child_count} sub-unit${child_count === 1 ? "" : "s"}. Delete ${child_count === 1 ? "that sub-unit" : "those sub-units"} first, then delete the unit.`,
        active_children: child_count,
      });
    }

    const [[{ member_count }]] = await pool.query(
      `SELECT COUNT(*) AS member_count
         FROM user_org_units m JOIN users us ON us.id = m.user_id
        WHERE m.org_unit_id = ? AND ${activeOn("m")} AND us.is_active = 1`,
      [id]
    );
    if (member_count > 0) {
      return res.status(400).json({
        error: `This unit has ${member_count} ${member_count === 1 ? "person" : "people"} assigned to it. Move them to another unit first, then delete the unit.`,
        active_members: member_count,
      });
    }

    await pool.query("UPDATE org_units SET is_active = 0 WHERE id = ?", [id]);
    await logAudit(pool, {
      entityType: "UNIT", entityId: id, action: "DEACTIVATE",
      oldValue: { name: existing.name, is_active: existing.is_active },
      newValue: { name: existing.name, is_active: 0 },
      changedBy: req.user.id,
    });
    res.json({ success: true, deleted: true, soft_deleted: true });
  } catch (err) {
    console.error("Error deleting unit:", err);
    res.status(500).json({ error: "Failed to delete unit" });
  }
});

module.exports = router;
