// Shared helpers for the generic Task Management module (work_tasks and its
// work_task_* tables). Separate from the Accountant module's `tasks` table.

const { REMINDER_ID_SQL, REMINDER_AT_SQL } = require("./taskReminders");
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
  started_at, started_by, paused_at, paused_seconds, completed_at, completed_by, completion_note,
  created_at, updated_at
`;

// Same columns, prefixed for queries that alias work_tasks as `t`.
const TASK_COLUMNS_T = `
  t.id, t.series_id, t.title, t.description, t.task_type, t.priority, t.status,
  t.source_module, t.source_id, t.assigned_to, t.created_by,
  DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, t.due_time,
  t.next_action, DATE_FORMAT(t.next_action_date, '%Y-%m-%d') AS next_action_date,
  t.started_at, t.started_by, t.paused_at, t.paused_seconds, t.completed_at, t.completed_by, t.completion_note,
  t.created_at, t.updated_at
`;

// 'YYYY-MM-DD' that is a real calendar date. Date.parse alone accepts things
// like 2026-02-31, which MySQL then rejects with a 500.
function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Checks the shape AND the actual ranges -- "99:99" matches /^\d{2}:\d{2}$/
// but isn't a real time, and MySQL rejects it with an unhandled 500 instead
// of a clean validation error.
function isValidTime(value) {
  const m = typeof value === "string" && value.match(/^(\d{2}):(\d{2})(:(\d{2}))?$/);
  if (!m) return false;
  const [, h, mi, , s] = m;
  return Number(h) <= 23 && Number(mi) <= 59 && (s === undefined || Number(s) <= 59);
}

// Same shape everywhere a single task is returned (GET one, create, start,
// progress, complete, reassign, reschedule, skip) — including the assignee's
// and creator's names, exactly like the list endpoint already does, so the
// UI never has to guess who "assigned_to: 209" is.
// A repeating task is one task that moves on; a date that passed without it being done is written
// into its history as "Missed YYYY-MM-DD - ...", and marking it done afterwards as "Done late for
// YYYY-MM-DD". This lists the missed dates of the last 7 days not yet done late (t = the task's
// alias), comma separated - the task shows a "Missed" flag for them. Older ones stay in its history.
const MISSED_DATES_SQL = `(SELECT GROUP_CONCAT(SUBSTRING(h.note, 8, 10) ORDER BY h.id)
   FROM work_task_history h
  WHERE h.task_id = t.id AND h.note LIKE 'Missed %'
    AND SUBSTRING(h.note, 8, 10) >= DATE_FORMAT(CURDATE() - INTERVAL 7 DAY, '%Y-%m-%d')
    AND NOT EXISTS (SELECT 1 FROM work_task_history d
                     WHERE d.task_id = t.id AND d.note LIKE CONCAT('Done late for ', SUBSTRING(h.note, 8, 10), '%')))`;

// Overdue: past its date, or a repeating task with a missed day that is still on today's date
// (once today's is done it moves on, and only the Missed flag remains).
const IS_OVERDUE_SQL = `(t.status IN ('OPEN','IN_PROGRESS','PAUSED')
   AND (t.due_date < CURDATE() OR (t.due_date <= CURDATE() AND ${MISSED_DATES_SQL} IS NOT NULL)))`;

/** A task row as the API sends it: the missed dates as a list, overdue as a boolean. */
function shapeTask(row) {
  if (!row) return row;
  const shaped = { ...row, missed_dates: row.missed_dates ? String(row.missed_dates).split(",") : [] };
  if (row.is_overdue !== undefined) shaped.is_overdue = Boolean(row.is_overdue);
  return shaped;
}

async function loadTask(executor, id) {
  // TASK_COLUMNS_T (t.-prefixed), not TASK_COLUMNS: the join brings in two
  // more tables that also have an `id` column, so the bare names in
  // TASK_COLUMNS would be ambiguous the moment they're joined in.
  const [[row]] = await executor.query(
    `SELECT ${TASK_COLUMNS_T}, ua.name AS assigned_to_name, uc.name AS created_by_name,
            ${REMINDER_ID_SQL} AS reminder_id, ${REMINDER_AT_SQL} AS reminder_at,
            ${MISSED_DATES_SQL} AS missed_dates, ${IS_OVERDUE_SQL} AS is_overdue
       FROM work_tasks t
       LEFT JOIN users ua ON ua.id = t.assigned_to
       LEFT JOIN users uc ON uc.id = t.created_by
      WHERE t.id = ?`,
    [id]
  );
  return row ? shapeTask(row) : null;
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

module.exports = {
  TASK_COLUMNS, TASK_COLUMNS_T, MISSED_DATES_SQL, IS_OVERDUE_SQL, shapeTask, isRealDate, isValidTime, loadTask, logHistory, hasPerm,
  resolveVisibleUserIds,
};
