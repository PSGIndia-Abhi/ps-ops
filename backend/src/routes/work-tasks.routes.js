const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const PERMISSIONS = require("../access/permissions");
const { v4: uuid } = require("uuid");
const multer = require("multer");
const minioClient = require("../lib/minio");
const { getTeamUserIds, today: dbToday } = require("../utils/hierarchy");
const {
  TASK_COLUMNS, TASK_COLUMNS_T, isRealDate, loadTask, logHistory, hasPerm, resolveVisibleUserIds,
} = require("../utils/workTasks");
const { validateRecurrence, generateDueOccurrences, nextOccurrenceDate } = require("../utils/workTaskRecurrence");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const isValidDate = isRealDate;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"];

// Temporary-worker tokens have no user id; this module is for real users only.
function requireRealUser(req, res, next) {
  if (!req.user?.id) return res.status(403).json({ error: "Not available for this account" });
  next();
}

function optionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Always allowed for yourself; for anyone else needs MANAGE_TEAM_WORK_TASKS and
// the target must be in your team (org hierarchy). Admin can assign to anyone.
async function canAssignTo(req, assignedTo) {
  if (req.user.role === "admin" || assignedTo === Number(req.user.id)) return true;
  if (!hasPerm(req, PERMISSIONS.MANAGE_TEAM_WORK_TASKS)) return false;
  return (await getTeamUserIds(pool, req.user.id)).includes(assignedTo);
}

// Loads a task and checks the requester may see it. Throws 404 (never 403) so
// visibility never leaks whether a task exists.
async function loadVisibleTask(req, taskId) {
  const task = await loadTask(pool, taskId);
  if (!task) throw new HttpError(404, "Task not found");
  const visibleIds = await resolveVisibleUserIds(pool, req);
  const isMine = Number(task.created_by) === Number(req.user.id);
  if (visibleIds !== null && !isMine && !visibleIds.includes(Number(task.assigned_to))) {
    throw new HttpError(404, "Task not found");
  }
  return task;
}

function canManageTask(req, task) {
  return (
    req.user.role === "admin" ||
    Number(task.assigned_to) === Number(req.user.id) ||
    Number(task.created_by) === Number(req.user.id) ||
    hasPerm(req, PERMISSIONS.MANAGE_TEAM_WORK_TASKS)
  );
}

async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// Only the assignee works a task (start / progress / complete); admin may too.
function requireAssignee(req, task, action) {
  if (req.user.role !== "admin" && Number(task.assigned_to) !== Number(req.user.id)) {
    throw new HttpError(403, `Only the assignee can ${action} this task`);
  }
}

function assertNotFinished(task, action) {
  if (["COMPLETED", "CANCELLED"].includes(task.status)) {
    throw new HttpError(400, `Cannot ${action} a ${task.status.toLowerCase()} task`);
  }
}

// GET /api/work-tasks/types -- distinct task_type values already used, for a
// type-ahead dropdown. Must stay above "/:id".
router.get("/types", auth, requireRealUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT task_type FROM work_tasks WHERE task_type IS NOT NULL ORDER BY task_type ASC"
    );
    res.json(rows.map((r) => r.task_type));
  } catch (err) {
    sendError(res, err, "Failed to load task types");
  }
});

// GET /api/work-tasks -- list, scoped to what the requester may see.
// Filters: status, priority, task_type, source_module, source_id,
// assigned_to (must be within the visible set), from_date, to_date.
router.get("/", auth, requireRealUser, async (req, res) => {
  try {
    const visibleIds = await resolveVisibleUserIds(pool, req);
    const where = [];
    const params = [];

    if (req.query.assigned_to) {
      const assignedTo = parseId(req.query.assigned_to);
      if (!assignedTo) throw new HttpError(400, "Invalid assigned_to");
      if (visibleIds !== null && !visibleIds.includes(assignedTo)) {
        throw new HttpError(403, "You cannot view this person's tasks");
      }
      where.push("t.assigned_to = ?");
      params.push(assignedTo);
    } else if (visibleIds !== null) {
      where.push(`(t.assigned_to IN (?) OR t.created_by = ?)`);
      params.push(visibleIds, Number(req.user.id));
    }

    if (req.query.status) { where.push("t.status = ?"); params.push(String(req.query.status)); }
    if (req.query.priority) { where.push("t.priority = ?"); params.push(String(req.query.priority)); }
    if (req.query.task_type) { where.push("t.task_type = ?"); params.push(String(req.query.task_type)); }
    if (req.query.source_module) { where.push("t.source_module = ?"); params.push(String(req.query.source_module)); }
    if (req.query.source_id) { where.push("t.source_id = ?"); params.push(String(req.query.source_id)); }
    if (req.query.from_date) {
      if (!isValidDate(req.query.from_date)) throw new HttpError(400, "from_date must be YYYY-MM-DD");
      where.push("t.due_date >= ?"); params.push(req.query.from_date);
    }
    if (req.query.to_date) {
      if (!isValidDate(req.query.to_date)) throw new HttpError(400, "to_date must be YYYY-MM-DD");
      where.push("t.due_date <= ?"); params.push(req.query.to_date);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT ${TASK_COLUMNS_T}, ua.name AS assigned_to_name, uc.name AS created_by_name,
              (t.status IN ('OPEN','IN_PROGRESS') AND t.due_date < CURDATE()) AS is_overdue
         FROM work_tasks t
         LEFT JOIN users ua ON ua.id = t.assigned_to
         LEFT JOIN users uc ON uc.id = t.created_by
         ${whereSql}
        ORDER BY t.due_date ASC, t.due_time ASC, t.created_at DESC`,
      params
    );
    res.json(rows.map((r) => ({ ...r, is_overdue: Boolean(r.is_overdue) })));
  } catch (err) {
    sendError(res, err, "Failed to load tasks");
  }
});

// POST /api/work-tasks -- create a one-time task (due_date), or a recurring
// series (a `recurrence` object instead of due_date). A series creates the
// occurrences already due (start_date up to today) right away.
router.post("/", auth, requireRealUser, async (req, res) => {
  const body = req.body || {};
  try {
    const isRecurring = body.recurrence !== undefined && body.recurrence !== null;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) throw new HttpError(400, "Title is required");
    if (title.length > 200) throw new HttpError(400, "Title is too long (max 200 characters)");

    const assignedTo = parseId(body.assigned_to);
    if (!assignedTo) throw new HttpError(400, "assigned_to is required");

    if (!isRecurring) {
      if (!isValidDate(body.due_date)) throw new HttpError(400, "due_date is required (YYYY-MM-DD), or send a recurrence");
      if (body.due_time && !TIME_RE.test(String(body.due_time))) throw new HttpError(400, "due_time must be HH:MM or HH:MM:SS");
      if (body.next_action_date && !isValidDate(body.next_action_date)) throw new HttpError(400, "next_action_date must be YYYY-MM-DD");
    }

    if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
      throw new HttpError(400, "priority must be LOW, NORMAL or HIGH");
    }
    const taskType = optionalText(body.task_type);
    if (taskType && taskType.length > 100) throw new HttpError(400, "task_type is too long (max 100 characters)");

    const [[assignee]] = await pool.query("SELECT id FROM users WHERE id = ? AND is_active = 1", [assignedTo]);
    if (!assignee) throw new HttpError(400, "Invalid assigned_to");
    if (!(await canAssignTo(req, assignedTo))) throw new HttpError(403, "You cannot assign tasks to this person");

    if (isRecurring) {
      const todayStr = await dbToday(pool);
      const checked = validateRecurrence(body.recurrence, todayStr);
      if (checked.error) throw new HttpError(400, checked.error);
      const rec = checked.value;
      const seriesId = uuid();

      const created = await inTransaction(async (conn) => {
        await conn.query(
          `INSERT INTO work_task_series
             (id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [seriesId, title, optionalText(body.description), taskType, body.priority || "NORMAL",
           optionalText(body.source_module), optionalText(body.source_id), assignedTo, req.user.id]
        );
        await conn.query(
          `INSERT INTO work_task_recurrence
             (id, series_id, frequency, interval_value, days_of_week, day_of_month, use_last_day_of_month,
              month_of_year, time_of_day, start_date, end_type, end_date, end_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), seriesId, rec.frequency, rec.interval_value, rec.days_of_week ? JSON.stringify(rec.days_of_week) : null,
           rec.day_of_month, rec.use_last_day_of_month, rec.month_of_year, rec.time_of_day, rec.start_date,
           rec.end_type, rec.end_date, rec.end_count]
        );
        return generateDueOccurrences(conn, seriesId, todayStr);
      });

      const [tasks] = await pool.query(`SELECT ${TASK_COLUMNS} FROM work_tasks WHERE series_id = ? ORDER BY due_date ASC`, [seriesId]);
      const nextDate = nextOccurrenceDate(
        { status: "ACTIVE" },
        { ...rec, occurrences_created: created, last_generated_until: tasks.length ? tasks[tasks.length - 1].due_date : null },
        todayStr
      );
      return res.status(201).json({ success: true, series_id: seriesId, occurrences_created: created, next_occurrence_date: nextDate, tasks });
    }

    const taskId = uuid();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO work_tasks
           (id, title, description, task_type, priority, source_module, source_id,
            assigned_to, created_by, due_date, due_time, next_action, next_action_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId, title, optionalText(body.description), taskType, body.priority || "NORMAL",
          optionalText(body.source_module), optionalText(body.source_id),
          assignedTo, req.user.id, body.due_date, body.due_time || null,
          optionalText(body.next_action), body.next_action_date || null,
        ]
      );
      await logHistory(conn, taskId, "CREATE", { toStatus: "OPEN", changedBy: req.user.id });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    res.status(201).json(await loadTask(pool, taskId));
  } catch (err) {
    sendError(res, err, "Failed to create task");
  }
});

// GET /api/work-tasks/:id
router.get("/:id", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const [[counts]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM work_task_comments WHERE task_id = ?) AS comment_count,
              (SELECT COUNT(*) FROM work_task_attachments WHERE task_id = ?) AS attachment_count`,
      [task.id, task.id]
    );
    res.json({
      ...task,
      comment_count: Number(counts.comment_count),
      attachment_count: Number(counts.attachment_count),
    });
  } catch (err) {
    sendError(res, err, "Failed to load task");
  }
});

// PUT /api/work-tasks/:id -- edit title / description / task_type / priority.
// Blocked once completed or cancelled. Reassign and reschedule are separate actions.
router.put("/:id", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    if (!canManageTask(req, task)) throw new HttpError(403, "You cannot edit this task");
    if (["COMPLETED", "CANCELLED"].includes(task.status)) {
      throw new HttpError(400, `Cannot edit a ${task.status.toLowerCase()} task`);
    }
    const body = req.body || {};

    const next = {
      title: task.title,
      description: task.description,
      task_type: task.task_type,
      priority: task.priority,
    };
    if (body.title !== undefined) {
      next.title = typeof body.title === "string" ? body.title.trim() : "";
      if (!next.title) throw new HttpError(400, "Title is required");
      if (next.title.length > 200) throw new HttpError(400, "Title is too long (max 200 characters)");
    }
    if (body.description !== undefined) next.description = optionalText(body.description);
    if (body.task_type !== undefined) {
      next.task_type = optionalText(body.task_type);
      if (next.task_type && next.task_type.length > 100) throw new HttpError(400, "task_type is too long (max 100 characters)");
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, "priority must be LOW, NORMAL or HIGH");
      next.priority = body.priority;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE work_tasks SET title = ?, description = ?, task_type = ?, priority = ? WHERE id = ?",
        [next.title, next.description, next.task_type, next.priority, task.id]
      );
      await logHistory(conn, task.id, "UPDATE", { changedBy: req.user.id });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to update task");
  }
});

// ---------------------------------------------------------------------------
// Lifecycle actions. Each status change is a guarded UPDATE (WHERE status = the
// status we validated) so two simultaneous requests can't both succeed, and is
// written to work_task_history in the same transaction.
// ---------------------------------------------------------------------------

// POST /api/work-tasks/:id/start -- OPEN -> IN_PROGRESS
router.post("/:id/start", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    requireAssignee(req, task, "start");
    if (task.status !== "OPEN") throw new HttpError(400, `Cannot start a task that is ${task.status}`);

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_tasks SET status = 'IN_PROGRESS', started_at = NOW(), started_by = ? WHERE id = ? AND status = 'OPEN'",
        [req.user.id, task.id]
      );
      if (!result.affectedRows) throw new HttpError(409, "This task was just changed by someone else. Reload and try again.");
      await logHistory(conn, task.id, "START", { fromStatus: "OPEN", toStatus: "IN_PROGRESS", changedBy: req.user.id });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to start task");
  }
});

// POST /api/work-tasks/:id/progress -- add a progress note (kept as a comment)
// and optionally set the next action. The task must be in progress.
router.post("/:id/progress", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    requireAssignee(req, task, "update");
    if (task.status !== "IN_PROGRESS") throw new HttpError(400, "Start the task before adding an update");

    const body = req.body || {};
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) throw new HttpError(400, "note is required");
    const setNextAction = body.next_action !== undefined || body.next_action_date !== undefined;
    const nextAction = optionalText(body.next_action);
    if (nextAction && nextAction.length > 255) throw new HttpError(400, "next_action is too long (max 255 characters)");
    if (body.next_action_date && !isValidDate(body.next_action_date)) throw new HttpError(400, "next_action_date must be YYYY-MM-DD");

    await inTransaction(async (conn) => {
      await conn.query(
        "INSERT INTO work_task_comments (id, task_id, user_id, comment) VALUES (?, ?, ?, ?)",
        [uuid(), task.id, req.user.id, note]
      );
      if (setNextAction) {
        await conn.query("UPDATE work_tasks SET next_action = ?, next_action_date = ? WHERE id = ?", [
          nextAction, body.next_action_date || null, task.id,
        ]);
      }
      await logHistory(conn, task.id, "UPDATE", { note, changedBy: req.user.id });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to add update");
  }
});

// POST /api/work-tasks/:id/complete -- OPEN or IN_PROGRESS -> COMPLETED
router.post("/:id/complete", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    requireAssignee(req, task, "complete");
    if (!["OPEN", "IN_PROGRESS"].includes(task.status)) throw new HttpError(400, `Cannot complete a task that is ${task.status}`);
    const note = optionalText(req.body?.completion_note);

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_tasks SET status = 'COMPLETED', completed_at = NOW(), completed_by = ?, completion_note = ? WHERE id = ? AND status = ?",
        [req.user.id, note, task.id, task.status]
      );
      if (!result.affectedRows) throw new HttpError(409, "This task was just changed by someone else. Reload and try again.");
      await logHistory(conn, task.id, "COMPLETE", { fromStatus: task.status, toStatus: "COMPLETED", note, changedBy: req.user.id });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to complete task");
  }
});

// POST /api/work-tasks/:id/reassign -- change the assignee.
router.post("/:id/reassign", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    if (!canManageTask(req, task)) throw new HttpError(403, "You cannot reassign this task");
    assertNotFinished(task, "reassign");

    const newAssignee = parseId(req.body?.assigned_to);
    if (!newAssignee) throw new HttpError(400, "assigned_to is required");
    if (newAssignee === Number(task.assigned_to)) throw new HttpError(400, "The task is already assigned to this person");
    const [[user]] = await pool.query("SELECT id, name FROM users WHERE id = ? AND is_active = 1", [newAssignee]);
    if (!user) throw new HttpError(400, "Invalid assigned_to");
    if (!(await canAssignTo(req, newAssignee))) throw new HttpError(403, "You cannot assign tasks to this person");

    const [[previous]] = await pool.query("SELECT name FROM users WHERE id = ?", [task.assigned_to]);
    const reason = optionalText(req.body?.note);
    const historyNote = `Reassigned from ${previous?.name || `user #${task.assigned_to}`} to ${user.name}${reason ? `: ${reason}` : ""}`;

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_tasks SET assigned_to = ? WHERE id = ? AND assigned_to = ? AND status IN ('OPEN','IN_PROGRESS')",
        [newAssignee, task.id, task.assigned_to]
      );
      if (!result.affectedRows) throw new HttpError(409, "This task was just changed by someone else. Reload and try again.");
      await logHistory(conn, task.id, "REASSIGN", { note: historyNote.slice(0, 500), changedBy: req.user.id });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to reassign task");
  }
});

// POST /api/work-tasks/:id/reschedule -- change due date / time. If due_time is
// left out the existing time is kept; send null to clear it.
router.post("/:id/reschedule", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    if (!canManageTask(req, task)) throw new HttpError(403, "You cannot reschedule this task");
    assertNotFinished(task, "reschedule");

    const body = req.body || {};
    if (!isValidDate(body.due_date)) throw new HttpError(400, "due_date is required (YYYY-MM-DD)");
    if (body.due_time && !TIME_RE.test(String(body.due_time))) throw new HttpError(400, "due_time must be HH:MM or HH:MM:SS");
    const dueTime = body.due_time !== undefined ? body.due_time || null : task.due_time;
    const reason = optionalText(body.reason);
    const historyNote = `Due ${task.due_date}${task.due_time ? ` ${task.due_time}` : ""} moved to ${body.due_date}${dueTime ? ` ${dueTime}` : ""}${reason ? `: ${reason}` : ""}`;

    await inTransaction(async (conn) => {
      await conn.query("UPDATE work_tasks SET due_date = ?, due_time = ? WHERE id = ?", [body.due_date, dueTime, task.id]);
      await logHistory(conn, task.id, "RESCHEDULE", { note: historyNote.slice(0, 500), changedBy: req.user.id });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to reschedule task");
  }
});

// POST /api/work-tasks/:id/skip -- cancel ONE occurrence of a recurring task
// (e.g. a holiday). The schedule and every other occurrence are untouched.
router.post("/:id/skip", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    if (!task.series_id) throw new HttpError(400, "Only an occurrence of a recurring task can be skipped");
    if (!canManageTask(req, task)) throw new HttpError(403, "You cannot skip this task");
    assertNotFinished(task, "skip");
    const reason = optionalText(req.body?.reason);

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_tasks SET status = 'CANCELLED' WHERE id = ? AND status = ?",
        [task.id, task.status]
      );
      if (!result.affectedRows) throw new HttpError(409, "This task was just changed by someone else. Reload and try again.");
      await logHistory(conn, task.id, "SKIP", {
        fromStatus: task.status, toStatus: "CANCELLED", note: reason ? reason.slice(0, 500) : null, changedBy: req.user.id,
      });
    });
    res.json(await loadTask(pool, task.id));
  } catch (err) {
    sendError(res, err, "Failed to skip occurrence");
  }
});

// DELETE /api/work-tasks/:id -- soft delete (status CANCELLED).
//   Allowed: the assignee, the creator, DELETE_WORK_TASK holders, admin.
//   A completed task can only be cancelled by admin.
// DELETE /api/work-tasks/:id?permanent=true -- hard delete, admin only, and only
//   for a task that is already CANCELLED. Removes its comments, attachments
//   (rows and files) and history too.
router.delete("/:id", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const isAdmin = req.user.role === "admin";

    if (req.query.permanent === "true") {
      if (!isAdmin) throw new HttpError(403, "Only an admin can permanently delete a task");
      if (task.status !== "CANCELLED") throw new HttpError(400, "Only a cancelled task can be permanently deleted. Delete it first.");

      const [attachments] = await pool.query("SELECT object_key FROM work_task_attachments WHERE task_id = ?", [task.id]);
      await inTransaction(async (conn) => {
        await conn.query("DELETE FROM work_task_comments WHERE task_id = ?", [task.id]);
        await conn.query("DELETE FROM work_task_attachments WHERE task_id = ?", [task.id]);
        await conn.query("DELETE FROM work_task_history WHERE task_id = ?", [task.id]);
        await conn.query("DELETE FROM work_tasks WHERE id = ?", [task.id]);
      });
      // Files go after the DB commit; a failed removal leaves an unreferenced file, never a broken task.
      for (const { object_key } of attachments) {
        try {
          await minioClient.removeObject(process.env.MINIO_BUCKET, object_key);
        } catch (err) {
          console.error(`Failed to remove attachment file ${object_key}:`, err.message);
        }
      }
      return res.json({ success: true, permanent: true });
    }

    const canDelete =
      isAdmin ||
      Number(task.assigned_to) === Number(req.user.id) ||
      Number(task.created_by) === Number(req.user.id) ||
      hasPerm(req, PERMISSIONS.DELETE_WORK_TASK);
    if (!canDelete) throw new HttpError(403, "You cannot delete this task");
    if (task.status === "CANCELLED") return res.json({ success: true, already_cancelled: true });
    if (task.status === "COMPLETED" && !isAdmin) throw new HttpError(400, "A completed task can only be deleted by an admin");

    await inTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE work_tasks SET status = 'CANCELLED' WHERE id = ? AND status = ?",
        [task.id, task.status]
      );
      if (!result.affectedRows) throw new HttpError(409, "This task was just changed by someone else. Reload and try again.");
      await logHistory(conn, task.id, "CANCEL", { fromStatus: task.status, toStatus: "CANCELLED", changedBy: req.user.id });
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to delete task");
  }
});

// ---------------------------------------------------------------------------
// Comments -- anyone who can see the task can read and post.
// ---------------------------------------------------------------------------
const COMMENT_SQL = `SELECT c.id, c.comment, c.created_at, c.user_id, u.name AS user_name
                       FROM work_task_comments c JOIN users u ON u.id = c.user_id`;

// GET /api/work-tasks/:id/comments -- oldest first
router.get("/:id/comments", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const [rows] = await pool.query(`${COMMENT_SQL} WHERE c.task_id = ? ORDER BY c.created_at ASC`, [task.id]);
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load comments");
  }
});

// POST /api/work-tasks/:id/comments
router.post("/:id/comments", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (!comment) throw new HttpError(400, "comment is required");
    if (comment.length > 5000) throw new HttpError(400, "comment is too long (max 5000 characters)");

    const id = uuid();
    await pool.query("INSERT INTO work_task_comments (id, task_id, user_id, comment) VALUES (?, ?, ?, ?)", [id, task.id, req.user.id, comment]);
    const [[row]] = await pool.query(`${COMMENT_SQL} WHERE c.id = ?`, [id]);
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, "Failed to add comment");
  }
});

// ---------------------------------------------------------------------------
// Attachments -- files live in MinIO (same bucket/pattern as job attachments);
// the DB row is metadata only. Anyone who can see the task can list and open
// files; uploading or removing needs the same rights as editing the task.
// ---------------------------------------------------------------------------
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
// Only these are shown in the browser; anything else (html, svg, ...) is always
// downloaded, so an uploaded file can never run as a page on our origin.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

const ATTACHMENT_SQL = `SELECT a.id, a.file_name, a.file_type, a.file_size, a.created_at, a.uploaded_by, u.name AS uploaded_by_name
                          FROM work_task_attachments a LEFT JOIN users u ON u.id = a.uploaded_by`;

// Checks the task and the caller's rights BEFORE the upload body is read.
async function precheckAttachmentWrite(req, res, next) {
  try {
    req.task = await loadVisibleTask(req, req.params.id);
    if (!canManageTask(req, req.task)) throw new HttpError(403, "You cannot change attachments on this task");
    next();
  } catch (err) {
    sendError(res, err, "Failed to check task");
  }
}

function acceptFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (max 10 MB)" });
    return res.status(400).json({ error: "Invalid upload. Send one file in the 'file' field." });
  });
}

// GET /api/work-tasks/:id/attachments
router.get("/:id/attachments", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const [rows] = await pool.query(`${ATTACHMENT_SQL} WHERE a.task_id = ? ORDER BY a.created_at ASC`, [task.id]);
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load attachments");
  }
});

// POST /api/work-tasks/:id/attachments -- multipart/form-data, one file in the "file" field
router.post("/:id/attachments", auth, requireRealUser, precheckAttachmentWrite, acceptFile, async (req, res) => {
  const task = req.task;
  let objectKey = null;
  try {
    if (!req.file) throw new HttpError(400, "file is required");
    // multer decodes filenames as latin1; restore the real UTF-8 name.
    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8").slice(0, 255);
    const rawExt = (fileName.split(".").pop() || "").toLowerCase();
    const ext = /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : "bin";
    const fileType = (req.file.mimetype || "application/octet-stream").slice(0, 100);
    const id = uuid();
    objectKey = `work-tasks/${task.id}/${uuid()}.${ext}`;

    // Same lazy bucket creation the company-logo upload already does.
    if (!(await minioClient.bucketExists(process.env.MINIO_BUCKET))) {
      await minioClient.makeBucket(process.env.MINIO_BUCKET, process.env.MINIO_REGION || "us-east-1");
    }
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.buffer.length, { "Content-Type": fileType });
    await inTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO work_task_attachments (id, task_id, object_key, file_name, file_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, task.id, objectKey, fileName, fileType, req.file.buffer.length, req.user.id]
      );
      await logHistory(conn, task.id, "ATTACH", { note: fileName.slice(0, 500), changedBy: req.user.id });
    });
    const [[row]] = await pool.query(`${ATTACHMENT_SQL} WHERE a.id = ?`, [id]);
    res.status(201).json(row);
  } catch (err) {
    // DB failed after the file was stored: don't leave an orphan file behind.
    if (objectKey) minioClient.removeObject(process.env.MINIO_BUCKET, objectKey).catch(() => {});
    sendError(res, err, "Failed to upload attachment");
  }
});

// GET /api/work-tasks/:id/attachments/:attachmentId/view -- streams the file
router.get("/:id/attachments/:attachmentId/view", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const [[att]] = await pool.query(
      "SELECT object_key, file_type, file_name FROM work_task_attachments WHERE id = ? AND task_id = ?",
      [req.params.attachmentId, task.id]
    );
    if (!att) throw new HttpError(404, "Attachment not found");

    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, att.object_key);
    const inline = INLINE_TYPES.has(att.file_type);
    res.setHeader("Content-Type", inline ? att.file_type : "application/octet-stream");
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.file_name)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    stream.on("error", (err) => {
      console.error("Attachment stream failed:", err.message);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to load attachment");
  }
});

// DELETE /api/work-tasks/:id/attachments/:attachmentId
router.delete("/:id/attachments/:attachmentId", auth, requireRealUser, precheckAttachmentWrite, async (req, res) => {
  try {
    const task = req.task;
    const [[att]] = await pool.query(
      "SELECT object_key, file_name FROM work_task_attachments WHERE id = ? AND task_id = ?",
      [req.params.attachmentId, task.id]
    );
    if (!att) throw new HttpError(404, "Attachment not found");

    await inTransaction(async (conn) => {
      await conn.query("DELETE FROM work_task_attachments WHERE id = ? AND task_id = ?", [req.params.attachmentId, task.id]);
      await logHistory(conn, task.id, "DETACH", { note: att.file_name.slice(0, 500), changedBy: req.user.id });
    });
    try {
      await minioClient.removeObject(process.env.MINIO_BUCKET, att.object_key);
    } catch (err) {
      console.error(`Failed to remove attachment file ${att.object_key}:`, err.message);
    }
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "Failed to delete attachment");
  }
});

// ---------------------------------------------------------------------------
// History -- the task's full audit trail, oldest first.
// ---------------------------------------------------------------------------
router.get("/:id/history", auth, requireRealUser, async (req, res) => {
  try {
    const task = await loadVisibleTask(req, req.params.id);
    const [rows] = await pool.query(
      `SELECT h.id, h.action, h.from_status, h.to_status, h.note, h.changed_at, h.changed_by, u.name AS changed_by_name
         FROM work_task_history h LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.task_id = ? ORDER BY h.id ASC`,
      [task.id]
    );
    res.json(rows);
  } catch (err) {
    sendError(res, err, "Failed to load history");
  }
});

module.exports = router;
