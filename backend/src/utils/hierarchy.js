// Shared helpers for the org hierarchy (org_units, user_org_units,
// user_reporting_lines, designations, hierarchy_audit_log).
//
// Dates: db.js does not use dateStrings, so mysql2 hands DATE columns back as
// JS Dates (timezone-shifty). Everything here compares/does arithmetic on
// dates in SQL and formats them with DATE_FORMAT, and passes 'YYYY-MM-DD'
// strings around in JS — never Date objects.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

// SQL fragment: the row (aliased `alias`) is in effect on the given date.
function activeOn(alias, dateSql = "CURDATE()") {
  return `(${alias}.effective_from <= ${dateSql} AND (${alias}.effective_to IS NULL OR ${alias}.effective_to >= ${dateSql}))`;
}

// DATE_FORMAT shorthand for selecting a date column as 'YYYY-MM-DD'.
function fmtDate(column) {
  return `DATE_FORMAT(${column}, '%Y-%m-%d')`;
}

async function today(executor) {
  const [[row]] = await executor.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
  return row.d;
}

async function dayBefore(executor, date) {
  const [[row]] = await executor.query(
    "SELECT DATE_FORMAT(DATE_SUB(?, INTERVAL 1 DAY), '%Y-%m-%d') AS d",
    [date]
  );
  return row.d;
}

// Every hierarchy change is recorded here. `executor` may be the pool or a
// transaction connection, so the log row commits/rolls back with the change.
async function logAudit(executor, { entityType, entityId, action, oldValue = null, newValue = null, changedBy = null }) {
  await executor.query(
    `INSERT INTO hierarchy_audit_log
       (entity_type, entity_id, action, old_value, new_value, changed_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entityType,
      String(entityId),
      action,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      changedBy ?? null,
    ]
  );
}

// Everyone at or below `userId` by following every active reporting line
// (manager -> subordinate), excluding `userId` themself.
//
// Reporting loops are allowed (Operation Head <-> Quality Head), so this
// MUST use UNION (not UNION ALL) and select only user_id: that lets MySQL
// drop repeated rows and stop. Adding a depth column would defeat that.
async function getTeamUserIds(executor, userId, asOf = null) {
  const date = asOf || (await today(executor));
  const [rows] = await executor.query(
    `WITH RECURSIVE team AS (
       SELECT l.user_id
         FROM user_reporting_lines l
        WHERE l.manager_user_id = ?
          AND l.effective_from <= ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
       UNION
       SELECT l.user_id
         FROM user_reporting_lines l
         JOIN team t ON l.manager_user_id = t.user_id
        WHERE l.effective_from <= ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
     )
     SELECT DISTINCT user_id FROM team`,
    [userId, date, date, date, date]
  );
  return rows.map((r) => Number(r.user_id)).filter((id) => id !== Number(userId));
}

// Would making `userId` report to `managerId` create a loop? That is the case
// when `managerId` already (transitively) reports up to `userId`. Returns the
// path [managerId, ..., userId] if so, otherwise null. Uses lines active on
// `asOf` (defaults to today).
async function findLoopPath(executor, userId, managerId, asOf = null) {
  const date = asOf || (await today(executor));
  const [rows] = await executor.query(
    `SELECT user_id, manager_user_id
       FROM user_reporting_lines
      WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
    [date, date]
  );

  const managersOf = new Map();
  for (const r of rows) {
    const key = Number(r.user_id);
    if (!managersOf.has(key)) managersOf.set(key, []);
    managersOf.get(key).push(Number(r.manager_user_id));
  }

  const target = Number(userId);
  const start = Number(managerId);
  const cameFrom = new Map([[start, null]]);
  const queue = [start];

  while (queue.length) {
    const current = queue.shift();
    if (current === target) {
      const path = [];
      for (let node = current; node !== null; node = cameFrom.get(node)) path.push(node);
      return path.reverse();
    }
    for (const next of managersOf.get(current) || []) {
      if (!cameFrom.has(next)) {
        cameFrom.set(next, current);
        queue.push(next);
      }
    }
  }
  return null;
}

async function getUserNames(executor, ids) {
  const unique = [...new Set(ids.map(Number))].filter(Boolean);
  if (!unique.length) return new Map();
  const [rows] = await executor.query("SELECT id, name FROM users WHERE id IN (?)", [unique]);
  return new Map(rows.map((r) => [Number(r.id), r.name]));
}

// Short "card" for each user id: identity plus their current designation and
// home unit (as of today). One row per user, in no particular order.
async function loadUserCards(executor, ids) {
  const unique = [...new Set(ids.map(Number))].filter(Boolean);
  if (!unique.length) return [];
  const [rows] = await executor.query(
    `SELECT us.id, us.name, us.email, us.phone, r.name AS role, us.is_active,
            d.id AS designation_id, d.name AS designation, m.is_head,
            ou.id AS unit_id, ou.name AS unit_name
       FROM users us
       LEFT JOIN roles r ON r.id = us.role_id
       LEFT JOIN user_org_units m ON m.user_id = us.id AND m.is_primary = 1 AND ${activeOn("m")}
       LEFT JOIN designations d ON d.id = m.designation_id
       LEFT JOIN org_units ou ON ou.id = m.org_unit_id
      WHERE us.id IN (?)`,
    [unique]
  );
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(Number(row.id))) byId.set(Number(row.id), { ...row, id: Number(row.id) });
  }
  return [...byId.values()];
}

module.exports = {
  loadUserCards,
  isValidDate,
  activeOn,
  fmtDate,
  today,
  dayBefore,
  logAudit,
  getTeamUserIds,
  findLoopPath,
  getUserNames,
};
