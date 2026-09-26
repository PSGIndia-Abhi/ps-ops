// Shared helpers for the generic Task Management module (work_tasks and its
// work_task_* tables). Separate from the Accountant module's `tasks` table.

const PERMISSIONS = require("../access/permissions");
const { getTeamUserIds } = require("./hierarchy");

// db.js does not use dateStrings, so mysql2 returns DATE columns as JS Dates
// that shift by the server's timezone offset (see hierarchy.js). due_date and
// next_action_date are calendar dates, so every SELECT formats them in SQL.
const TASK_COLUMNS = `
  id, series_id, title, description, task_type, priority, status,
  source_module, source_id, assigned_to, created_by,
  DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, due_time,
  next_action, DATE_FORMAT(next_action_date, '%Y-%m-%d') AS next_action_date,
  started_at, started_by, completed_at, completed_by, completion_note,
  created_at, updated_at
`;

// Same columns, prefixed for queries that alias work_tasks as `t`.
const TASK_COLUMNS_T = `
  t.id, t.series_id, t.title, t.description, t.task_type, t.priority, t.status,
  t.source_module, t.source_id, t.assigned_to, t.created_by,
  DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.due_time,
  t.next_action, DATE_FORMAT(t.next_action_date, '%Y-%m-%d') AS next_action_date,
  t.started_at, t.started_by, t.completed_at, t.completed_by, t.completion_note,
  t.created_at, t.updated_at
`;

async function loadTask(executor, id) {
  const [[row]] = await executor.query(`SELECT ${TASK_COLUMNS} FROM work_tasks WHERE id = ?`, [id]);
  return row || null;
}

async function logHistory(executor, taskId, action, { fromStatus = null, toStatus = null, note = null, changedBy = null } = {}) {
  await executor.query(
    `INSERT INTO work_task_history (task_id, action, from_status, to_status, note, changed_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, action, fromStatus, toStatus, note, changedBy]
  );
}

function hasPerm(req, permission) {
  return req.user.role === "admin" || Boolean(req.user.permissions?.includes(permission));
}

// Which assigned_to user ids the requester may see: their own; plus their team
// (org hierarchy) with VIEW_/MANAGE_TEAM_WORK_TASKS; or null (no filter) with
// VIEW_ALL_WORK_TASKS / admin.
async function resolveVisibleUserIds(executor, req) {
  if (hasPerm(req, PERMISSIONS.VIEW_ALL_WORK_TASKS)) return null;
  const ids = new Set([Number(req.user.id)]);
  if (hasPerm(req, PERMISSIONS.VIEW_TEAM_WORK_TASKS) || hasPerm(req, PERMISSIONS.MANAGE_TEAM_WORK_TASKS)) {
    for (const id of await getTeamUserIds(executor, req.user.id)) ids.add(id);
  }
  return [...ids];
}

module.exports = { TASK_COLUMNS, TASK_COLUMNS_T, loadTask, logHistory, hasPerm, resolveVisibleUserIds };
