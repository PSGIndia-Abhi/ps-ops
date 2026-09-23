const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { activeOn } = require("../utils/hierarchy");

// GET /api/hierarchy/tree — the whole org chart in one call, for the User
// Hierarchy screen.
//
//   units:      the unit tree (active units only). Each unit lists its current
//               members. A member carries primary_manager_id + manager_count (+ report_count),
//               so the UI can nest people under their primary manager inside a
//               unit and show a "+N manager" badge for the rest.
//   unassigned: active users with no current home unit (includes their role,
//               since the API can't tell staff from external users — the UI
//               decides what to show).
router.get("/tree", auth, requirePermission(PERMISSIONS.VIEW_HIERARCHY), async (req, res) => {
  try {
    const [units] = await pool.query(
      `SELECT id, name, parent_id, unit_type, branch_id, sort_order
         FROM org_units WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC`
    );

    const [members] = await pool.query(
      `SELECT m.org_unit_id, us.id AS user_id, us.name, us.email, r.name AS role,
              d.name AS designation, m.is_head,
              (SELECT l.manager_user_id FROM user_reporting_lines l
                WHERE l.user_id = us.id AND l.is_primary = 1 AND ${activeOn("l")} LIMIT 1) AS primary_manager_id,
              (SELECT COUNT(*) FROM user_reporting_lines l
                WHERE l.user_id = us.id AND ${activeOn("l")}) AS manager_count,
              (SELECT COUNT(*) FROM user_reporting_lines l
                WHERE l.manager_user_id = us.id AND ${activeOn("l")}) AS report_count
         FROM user_org_units m
         JOIN users us ON us.id = m.user_id AND us.is_active = 1
         LEFT JOIN roles r ON r.id = us.role_id
         LEFT JOIN designations d ON d.id = m.designation_id
        WHERE m.is_primary = 1 AND ${activeOn("m")}
        ORDER BY m.is_head DESC, us.name ASC`
    );

    const [unassigned] = await pool.query(
      `SELECT us.id AS user_id, us.name, us.email, r.name AS role,
              (SELECT COUNT(*) FROM user_reporting_lines l
                WHERE l.user_id = us.id AND ${activeOn("l")}) AS manager_count,
              (SELECT COUNT(*) FROM user_reporting_lines l
                WHERE l.manager_user_id = us.id AND ${activeOn("l")}) AS report_count
         FROM users us
         LEFT JOIN roles r ON r.id = us.role_id
        WHERE us.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM user_org_units m
             WHERE m.user_id = us.id AND m.is_primary = 1 AND ${activeOn("m")})
        ORDER BY us.name ASC`
    );

    const membersByUnit = new Map();
    for (const m of members) {
      if (!membersByUnit.has(m.org_unit_id)) membersByUnit.set(m.org_unit_id, []);
      membersByUnit.get(m.org_unit_id).push({
        user_id: Number(m.user_id),
        name: m.name,
        email: m.email,
        role: m.role,
        designation: m.designation,
        is_head: m.is_head,
        primary_manager_id: m.primary_manager_id === null ? null : Number(m.primary_manager_id),
        manager_count: Number(m.manager_count),
        report_count: Number(m.report_count),
      });
    }

    const byId = new Map(units.map((u) => [u.id, { ...u, members: membersByUnit.get(u.id) || [], children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    res.json({
      units: roots,
      unassigned: unassigned.map((u) => ({
        ...u,
        user_id: Number(u.user_id),
        manager_count: Number(u.manager_count),
        report_count: Number(u.report_count),
      })),
    });
  } catch (err) {
    console.error("Error building hierarchy tree:", err);
    res.status(500).json({ error: "Failed to load hierarchy" });
  }
});

// GET /api/hierarchy/audit — who changed what. Filters: entity_type,
// entity_id, limit (default 50, max 200), offset. Newest first.
router.get("/audit", auth, requirePermission(PERMISSIONS.MANAGE_HIERARCHY), async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.query.entity_type) { where.push("a.entity_type = ?"); params.push(String(req.query.entity_type)); }
    if (req.query.entity_id) { where.push("a.entity_id = ?"); params.push(String(req.query.entity_id)); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM hierarchy_audit_log a ${whereSql}`, params);
    const [items] = await pool.query(
      `SELECT a.id, a.entity_type, a.entity_id, a.action, a.old_value, a.new_value,
              a.changed_by, u.name AS changed_by_name, a.changed_at
         FROM hierarchy_audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
         ${whereSql}
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ total: Number(total), limit, offset, items });
  } catch (err) {
    console.error("Error fetching hierarchy audit:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

module.exports = router;
