const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const {
  isValidDate,
  activeOn,
  fmtDate,
  today,
  dayBefore,
  logAudit,
  findLoopPath,
  getUserNames,
  getTeamUserIds,
  loadUserCards,
} = require("../utils/hierarchy");

// Mounted at /api/users (after users.routes.js), so every path below is
// /api/users/... — all are two segments deep, so none collide with users.routes'
// single-segment "/:id".

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// effective_from defaults to today; effective_to is optional (open-ended).
async function resolveDates(executor, body) {
  const from = body.effective_from ? String(body.effective_from) : await today(executor);
  const to = body.effective_to ? String(body.effective_to) : null;
  if (!isValidDate(from)) throw new HttpError(400, "effective_from must be a valid date (YYYY-MM-DD)");
  if (to !== null && !isValidDate(to)) throw new HttpError(400, "effective_to must be a valid date (YYYY-MM-DD)");
  if (to !== null && to < from) throw new HttpError(400, "effective_to cannot be before effective_from");
  return { from, to };
}

// Locks the user's row so two edits to the same person can't interleave.
async function lockActiveUser(conn, userId) {
  const [[user]] = await conn.query(
    "SELECT id, name FROM users WHERE id = ? AND is_active = 1 FOR UPDATE",
    [userId]
  );
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

async function loadMembership(executor, membershipId) {
  const [[row]] = await executor.query(
    `SELECT m.id AS membership_id, m.user_id, m.org_unit_id, u.name AS org_unit_name,
            m.designation_id, d.name AS designation, m.is_head, m.is_primary,
            ${fmtDate("m.effective_from")} AS effective_from,
            ${fmtDate("m.effective_to")} AS effective_to
       FROM user_org_units m
       JOIN org_units u ON u.id = m.org_unit_id
       LEFT JOIN designations d ON d.id = m.designation_id
      WHERE m.id = ?`,
    [membershipId]
  );
  return row || null;
}

// Lines that haven't ended yet (current and future-dated), oldest first.
async function listLines(executor, userId, fromDate) {
  const [rows] = await executor.query(
    `SELECT l.id AS line_id, l.manager_user_id, m.name AS manager_name, l.is_primary,
            ${fmtDate("l.effective_from")} AS effective_from,
            ${fmtDate("l.effective_to")} AS effective_to
       FROM user_reporting_lines l
       JOIN users m ON m.id = l.manager_user_id
      WHERE l.user_id = ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
      ORDER BY l.effective_from ASC, l.is_primary DESC, m.name ASC`,
    [userId, fromDate]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------

// Everything the User Hierarchy details panel shows for one person.
async function buildUserHierarchy(userId) {
  const [[user]] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, r.name AS role, u.is_active,
            u.branch_id, b.name AS branch_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.id = ?`,
    [userId]
  );
  if (!user) return null;

  const [[membership]] = await pool.query(
    `SELECT m.org_unit_id, ou.name AS unit_name, m.designation_id, d.name AS designation, m.is_head,
            ${fmtDate("m.effective_from")} AS effective_from, ${fmtDate("m.effective_to")} AS effective_to
       FROM user_org_units m
       JOIN org_units ou ON ou.id = m.org_unit_id
       LEFT JOIN designations d ON d.id = m.designation_id
      WHERE m.user_id = ? AND m.is_primary = 1 AND ${activeOn("m")}
      ORDER BY m.effective_from DESC LIMIT 1`,
    [userId]
  );

  let unit = null;
  if (membership) {
    // Walk up to the root. Units form a tree (the API refuses cycles), so this ends.
    const [path] = await pool.query(
      `WITH RECURSIVE up AS (
         SELECT id, name, parent_id, 0 AS depth FROM org_units WHERE id = ?
         UNION ALL
         SELECT p.id, p.name, p.parent_id, up.depth + 1 FROM org_units p JOIN up ON p.id = up.parent_id
       )
       SELECT id, name FROM up ORDER BY depth DESC`,
      [membership.org_unit_id]
    );
    unit = { id: membership.org_unit_id, name: membership.unit_name, path };
  }

  const [managers] = await pool.query(
    `SELECT l.id AS line_id, l.manager_user_id, mu.name, l.is_primary,
            ${fmtDate("l.effective_from")} AS effective_from, ${fmtDate("l.effective_to")} AS effective_to
       FROM user_reporting_lines l
       JOIN users mu ON mu.id = l.manager_user_id
      WHERE l.user_id = ? AND ${activeOn("l")}
      ORDER BY l.is_primary DESC, mu.name ASC`,
    [userId]
  );

  const [reports] = await pool.query(
    `SELECT l.id AS line_id, l.user_id, l.is_primary
       FROM user_reporting_lines l
       JOIN users su ON su.id = l.user_id AND su.is_active = 1
      WHERE l.manager_user_id = ? AND ${activeOn("l")}`,
    [userId]
  );

  // Chain up via each person's PRIMARY line (what the org chart draws). Loops
  // are legitimate here, so stop as soon as someone repeats.
  const [primaryLines] = await pool.query(
    `SELECT l.user_id, l.manager_user_id FROM user_reporting_lines l WHERE l.is_primary = 1 AND ${activeOn("l")}`
  );
  const primaryManagerOf = new Map(primaryLines.map((l) => [Number(l.user_id), Number(l.manager_user_id)]));
  const chainIds = [];
  const visited = new Set([Number(userId)]);
  for (let next = primaryManagerOf.get(Number(userId)); next && !visited.has(next); next = primaryManagerOf.get(next)) {
    visited.add(next);
    chainIds.push(next);
  }

  const [history] = await pool.query(
    `SELECT l.id AS line_id, l.manager_user_id, mu.name, l.is_primary,
            ${fmtDate("l.effective_from")} AS effective_from, ${fmtDate("l.effective_to")} AS effective_to
       FROM user_reporting_lines l
       JOIN users mu ON mu.id = l.manager_user_id
      WHERE l.user_id = ?
      ORDER BY l.effective_from DESC, mu.name ASC`,
    [userId]
  );

  const cards = new Map(
    (await loadUserCards(pool, [...managers.map((m) => m.manager_user_id), ...reports.map((r) => r.user_id), ...chainIds]))
      .map((c) => [c.id, c])
  );
  const card = (id) => {
    const c = cards.get(Number(id));
    return { designation: c?.designation || null, unit_name: c?.unit_name || null };
  };

  return {
    user: { ...user, id: Number(user.id) },
    unit,
    designation: membership?.designation_id ? { id: membership.designation_id, name: membership.designation } : null,
    is_head: membership ? membership.is_head : 0,
    managers: managers.map((m) => ({ ...m, manager_user_id: Number(m.manager_user_id), ...card(m.manager_user_id) })),
    direct_reports: reports
      .map((r) => ({ line_id: r.line_id, user_id: Number(r.user_id), name: cards.get(Number(r.user_id))?.name || null, is_primary: r.is_primary, ...card(r.user_id) }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    chain: chainIds.map((id) => ({ id, name: cards.get(id)?.name || null, ...card(id) })),
    team_count: (await getTeamUserIds(pool, userId)).length,
    line_history: history.map((h) => ({ ...h, manager_user_id: Number(h.manager_user_id) })),
  };
}

// These "me" routes are open to any signed-in user — everyone can see their
// own place in the hierarchy and their own team. They must stay above the
// "/:id/..." routes so "me" isn't read as a user id.

// GET /api/users/me/hierarchy
router.get("/me/hierarchy", auth, async (req, res) => {
  try {
    if (!req.user.id) return res.status(404).json({ error: "No hierarchy for this account" });
    const data = await buildUserHierarchy(req.user.id);
    if (!data) return res.status(404).json({ error: "User not found" });
    res.json(data);
  } catch (err) {
    sendError(res, err, "Failed to load hierarchy");
  }
});

// GET /api/users/me/team — everyone below me through any active line
// (Team Tasks and the assign-to picker read this).
router.get("/me/team", auth, async (req, res) => {
  try {
    if (!req.user.id) return res.json({ members: [] });
    const teamIds = await getTeamUserIds(pool, req.user.id);
    const [directRows] = await pool.query(
      `SELECT l.user_id FROM user_reporting_lines l WHERE l.manager_user_id = ? AND ${activeOn("l")}`,
      [req.user.id]
    );
    const direct = new Set(directRows.map((r) => Number(r.user_id)));

    const cards = (await loadUserCards(pool, teamIds)).filter((c) => c.is_active === 1);
    const members = cards
      .map((c) => ({
        id: c.id, name: c.name, email: c.email, role: c.role,
        designation: c.designation, unit_id: c.unit_id, unit_name: c.unit_name,
        is_direct: direct.has(c.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ members });
  } catch (err) {
    sendError(res, err, "Failed to load team");
  }
});

// GET /api/users/:id/hierarchy
router.get("/:id/hierarchy", auth, requirePermission(PERMISSIONS.VIEW_HIERARCHY), async (req, res) => {
  try {
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user id" });
    const data = await buildUserHierarchy(userId);
    if (!data) return res.status(404).json({ error: "User not found" });
    res.json(data);
  } catch (err) {
    sendError(res, err, "Failed to load hierarchy");
  }
});

// PUT /api/users/:id/org-unit — set (or clear) the person's home unit.
// Body: { org_unit_id | null, designation_id?, is_head?, effective_from?, effective_to? }
// The previous primary membership is ended the day before effective_from, so
// history is kept; a change made on the same day as the previous entry
// started just edits that entry in place.
router.put("/:id/org-unit", auth, requirePermission(PERMISSIONS.MANAGE_HIERARCHY), async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  const body = req.body || {};

  const conn = await pool.getConnection();
  try {
    if (body.org_unit_id === undefined) {
      throw new HttpError(400, "org_unit_id is required (use null to remove the person from their unit)");
    }
    const { from, to } = await resolveDates(conn, body);
    const unitId = body.org_unit_id || null;

    await conn.beginTransaction();
    const user = await lockActiveUser(conn, userId);

    const [existing] = await conn.query(
      `SELECT id, org_unit_id, designation_id, is_head,
              ${fmtDate("effective_from")} AS effective_from,
              ${fmtDate("effective_to")} AS effective_to
         FROM user_org_units
        WHERE user_id = ? AND is_primary = 1
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from ASC`,
      [userId, from]
    );
    if (existing.some((r) => r.effective_from > from)) {
      throw new HttpError(409, "This person already has a later-dated unit change. Adjust that one instead of adding an earlier change.");
    }

    // Clear the unit entirely.
    if (unitId === null) {
      for (const row of existing) {
        if (row.effective_from === from) {
          await conn.query("DELETE FROM user_org_units WHERE id = ?", [row.id]);
        } else {
          await conn.query("UPDATE user_org_units SET effective_to = ? WHERE id = ?", [await dayBefore(conn, from), row.id]);
        }
        await logAudit(conn, {
          entityType: "MEMBERSHIP", entityId: row.id, action: "END",
          oldValue: { user_id: userId, org_unit_id: row.org_unit_id, designation_id: row.designation_id },
          newValue: { user_id: userId, ended_on: from },
          changedBy: req.user.id,
        });
      }
      await conn.commit();
      return res.json({ success: true, membership: null });
    }

    const [[unit]] = await conn.query("SELECT id FROM org_units WHERE id = ? AND is_active = 1", [unitId]);
    if (!unit) throw new HttpError(400, "Invalid unit");

    const previous = existing[existing.length - 1] || null;
    let designationId;
    if (body.designation_id === undefined) designationId = previous?.designation_id ?? null;
    else designationId = body.designation_id || null;
    if (designationId) {
      const [[designation]] = await conn.query("SELECT id FROM designations WHERE id = ? AND is_active = 1", [designationId]);
      if (!designation) throw new HttpError(400, "Invalid designation");
    }

    // A head who moves to another unit is not automatically its head too.
    const isHead = body.is_head === undefined
      ? (previous && previous.org_unit_id === unitId ? previous.is_head : 0)
      : (body.is_head ? 1 : 0);

    const sameDay = existing.find((r) => r.effective_from === from) || null;
    for (const row of existing) {
      if (row === sameDay) continue;
      await conn.query("UPDATE user_org_units SET effective_to = ? WHERE id = ?", [await dayBefore(conn, from), row.id]);
      await logAudit(conn, {
        entityType: "MEMBERSHIP", entityId: row.id, action: "END",
        oldValue: { user_id: userId, org_unit_id: row.org_unit_id, designation_id: row.designation_id },
        newValue: { user_id: userId, ended_on: await dayBefore(conn, from) },
        changedBy: req.user.id,
      });
    }

    const next = { user_id: userId, org_unit_id: unitId, designation_id: designationId, is_head: isHead, effective_from: from, effective_to: to };
    let membershipId;
    if (sameDay) {
      membershipId = sameDay.id;
      await conn.query(
        `UPDATE user_org_units
            SET org_unit_id = ?, designation_id = ?, is_head = ?, effective_to = ?
          WHERE id = ?`,
        [unitId, designationId, isHead, to, membershipId]
      );
      await logAudit(conn, {
        entityType: "MEMBERSHIP", entityId: membershipId, action: "UPDATE",
        oldValue: { user_id: userId, org_unit_id: sameDay.org_unit_id, designation_id: sameDay.designation_id, is_head: sameDay.is_head },
        newValue: next, changedBy: req.user.id,
      });
    } else {
      membershipId = uuid();
      await conn.query(
        `INSERT INTO user_org_units
           (id, user_id, org_unit_id, designation_id, is_primary, is_head, effective_from, effective_to, created_by)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [membershipId, userId, unitId, designationId, isHead, from, to, req.user.id ?? null]
      );
      await logAudit(conn, {
        entityType: "MEMBERSHIP", entityId: membershipId, action: "CREATE",
        newValue: next, changedBy: req.user.id,
      });
    }

    await conn.commit();
    res.json({ success: true, user: { id: user.id, name: user.name }, membership: await loadMembership(pool, membershipId) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    sendError(res, err, "Failed to update unit assignment");
  } finally {
    conn.release();
  }
});

// PUT /api/users/:id/reporting-lines — replace who this person reports to.
// Body: { managers: [{ manager_user_id, is_primary? }], effective_from?,
//         effective_to?, confirm_loop? }
//
// One row per manager, several allowed. Managers already in place are kept
// (only their primary flag can change); managers no longer listed are ended
// the day before effective_from; new ones start on effective_from (and end on
// effective_to, if given). A line that starts the same day it is removed never
// took effect, so it is deleted instead of being given a backwards date range.
//
// A change that would create a reporting loop (e.g. Operation Head <->
// Quality Head) is refused with 409 { code: "LOOP" } unless confirm_loop is
// true — loops are legitimate here, but must be a deliberate choice.
router.put("/:id/reporting-lines", auth, requirePermission(PERMISSIONS.MANAGE_HIERARCHY), async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: "Invalid user id" });
  const body = req.body || {};

  const conn = await pool.getConnection();
  try {
    if (!Array.isArray(body.managers)) {
      throw new HttpError(400, "managers must be an array (send [] to remove all managers)");
    }
    const { from, to } = await resolveDates(conn, body);

    const desired = body.managers.map((m) => (typeof m === "object" && m !== null ? m : { manager_user_id: m }));
    const seen = new Set();
    for (const m of desired) {
      const managerId = parseId(m.manager_user_id);
      if (!managerId) throw new HttpError(400, "Each manager needs a valid manager_user_id");
      if (managerId === userId) throw new HttpError(400, "A person cannot report to themselves");
      if (seen.has(managerId)) throw new HttpError(400, "The same manager is listed more than once");
      seen.add(managerId);
      m.manager_user_id = managerId;
    }
    const primaryCount = desired.filter((m) => m.is_primary).length;
    if (primaryCount > 1) throw new HttpError(400, "Only one manager can be marked primary");
    if (desired.length && primaryCount === 0) desired[0].is_primary = true;

    if (desired.length) {
      const [found] = await conn.query("SELECT id FROM users WHERE id IN (?) AND is_active = 1", [desired.map((m) => m.manager_user_id)]);
      const foundIds = new Set(found.map((r) => Number(r.id)));
      const missing = desired.find((m) => !foundIds.has(m.manager_user_id));
      if (missing) throw new HttpError(400, `Manager not found: ${missing.manager_user_id}`);
    }

    await conn.beginTransaction();
    await lockActiveUser(conn, userId);

    const [current] = await conn.query(
      `SELECT id, manager_user_id, is_primary,
              ${fmtDate("effective_from")} AS effective_from,
              ${fmtDate("effective_to")} AS effective_to
         FROM user_reporting_lines
        WHERE user_id = ? AND (effective_to IS NULL OR effective_to >= ?)`,
      [userId, from]
    );
    if (current.some((r) => r.effective_from > from)) {
      throw new HttpError(409, "This person already has a later-dated manager change. Adjust that one instead of adding an earlier change.");
    }

    const currentByManager = new Map(current.map((r) => [Number(r.manager_user_id), r]));
    const desiredByManager = new Map(desired.map((m) => [m.manager_user_id, m]));
    const added = desired.filter((m) => !currentByManager.has(m.manager_user_id));
    const removed = current.filter((r) => !desiredByManager.has(Number(r.manager_user_id)));

    // Loop check: only for managers being newly added.
    const loops = [];
    for (const m of added) {
      const path = await findLoopPath(conn, userId, m.manager_user_id, from);
      if (path) loops.push({ manager_user_id: m.manager_user_id, path });
    }
    if (loops.length && body.confirm_loop !== true) {
      const names = await getUserNames(conn, [userId, ...loops.flatMap((l) => l.path)]);
      const shaped = loops.map((l) => ({
        manager_user_id: l.manager_user_id,
        manager_name: names.get(l.manager_user_id),
        // Full cycle: this person -> new manager -> ... -> back to this person
        path: [userId, ...l.path].map((id) => ({ id, name: names.get(id) || null })),
      }));
      throw new HttpError(
        409,
        "This change creates a reporting loop. Send confirm_loop: true to proceed.",
        { code: "LOOP", loops: shaped }
      );
    }

    const endedOn = await dayBefore(conn, from);

    for (const row of removed) {
      if (row.effective_from === from) {
        await conn.query("DELETE FROM user_reporting_lines WHERE id = ?", [row.id]);
      } else {
        await conn.query("UPDATE user_reporting_lines SET effective_to = ? WHERE id = ?", [endedOn, row.id]);
      }
      await logAudit(conn, {
        entityType: "REPORTING_LINE", entityId: row.id, action: "END",
        oldValue: { user_id: userId, manager_user_id: Number(row.manager_user_id), is_primary: row.is_primary },
        newValue: { user_id: userId, ended_on: row.effective_from === from ? from : endedOn },
        changedBy: req.user.id,
      });
    }

    for (const m of desired) {
      const existing = currentByManager.get(m.manager_user_id);
      const wantPrimary = m.is_primary ? 1 : 0;
      if (existing) {
        if (Number(existing.is_primary) !== wantPrimary) {
          await conn.query("UPDATE user_reporting_lines SET is_primary = ? WHERE id = ?", [wantPrimary, existing.id]);
          await logAudit(conn, {
            entityType: "REPORTING_LINE", entityId: existing.id, action: "UPDATE",
            oldValue: { user_id: userId, manager_user_id: m.manager_user_id, is_primary: existing.is_primary },
            newValue: { user_id: userId, manager_user_id: m.manager_user_id, is_primary: wantPrimary },
            changedBy: req.user.id,
          });
        }
        continue;
      }
      const lineId = uuid();
      await conn.query(
        `INSERT INTO user_reporting_lines
           (id, user_id, manager_user_id, is_primary, effective_from, effective_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lineId, userId, m.manager_user_id, wantPrimary, from, to, req.user.id ?? null]
      );
      await logAudit(conn, {
        entityType: "REPORTING_LINE", entityId: lineId, action: "CREATE",
        newValue: { user_id: userId, manager_user_id: m.manager_user_id, is_primary: wantPrimary, effective_from: from, effective_to: to },
        changedBy: req.user.id,
      });
    }

    await conn.commit();
    res.json({
      success: true,
      user_id: userId,
      loops_confirmed: loops.length,
      managers: await listLines(pool, userId, await today(pool)),
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "This manager is already assigned to this person for that date" });
    }
    sendError(res, err, "Failed to update reporting lines");
  } finally {
    conn.release();
  }
});

module.exports = router;
