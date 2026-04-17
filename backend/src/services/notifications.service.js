const { v4: uuid } = require("uuid");
const { pool } = require("../../db");

function normalizeUserIds(userIds = []) {
  return Array.from(
    new Set(
      userIds
        .filter((id) => id !== null && id !== undefined && id !== "")
        .map((id) => String(id))
    )
  );
}

function parseTeamIds(team) {
  if (!team) return [];
  try {
    const parsed = typeof team === "string" ? JSON.parse(team) : team;
    return Array.isArray(parsed)
      ? parsed.map((id) => String(id)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function formatDateTimeLabel(value) {
  if (!value) return "the scheduled time";
  const normalized = String(value).replace("T", " ");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

async function insertNotifications(executor, userIds, payload) {
  const recipientIds = normalizeUserIds(userIds);
  if (recipientIds.length === 0) return 0;

  for (const userId of recipientIds) {
    await executor.query(
      `INSERT INTO notifications
       (id, user_id, type, title, message, entity_type, entity_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
      [
        uuid(),
        userId,
        payload.type,
        payload.title,
        payload.message,
        payload.entityType || null,
        payload.entityId || null,
      ]
    );
  }

  return recipientIds.length;
}

async function listNotificationsForUser(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 50);
  const unreadOnly = options.unreadOnly === true;
  const [rows] = await pool.query(
    `SELECT
       id,
       user_id,
       type,
       title,
       message,
       entity_type,
       entity_id,
       is_read,
       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
     FROM notifications
     WHERE user_id = ?
       ${unreadOnly ? "AND is_read = 0" : ""}
     ORDER BY created_at DESC
     LIMIT ?`,
    [String(userId), limit]
  );

  return rows.map((row) => ({
    ...row,
    is_read: Boolean(row.is_read),
  }));
}

async function getUnreadNotificationCount(userId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE user_id = ? AND is_read = 0`,
    [String(userId)]
  );
  return Number(row?.count || 0);
}

async function markNotificationRead(userId, notificationId) {
  const [result] = await pool.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE id = ? AND user_id = ?`,
    [notificationId, String(userId)]
  );
  return (result?.affectedRows || 0) > 0;
}

async function markAllNotificationsRead(userId) {
  const [result] = await pool.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE user_id = ? AND is_read = 0`,
    [String(userId)]
  );
  return result?.affectedRows || 0;
}

async function getAdminUserIds(executor) {
  const [rows] = await executor.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = 1`
  );
  return rows.map((row) => String(row.id));
}

async function getBranchAdminUserIds(executor, branchId) {
  if (!branchId) return [];
  const [rows] = await executor.query(
    `SELECT id
     FROM users
     WHERE role = 'branch_admin'
       AND is_active = 1
       AND branch_id = ?`,
    [branchId]
  );
  return rows.map((row) => String(row.id));
}

async function getClientUserIdsByContactId(executor, contactId) {
  if (!contactId) return [];
  const [rows] = await executor.query(
    `SELECT id
     FROM users
     WHERE contact_id = ?
       AND is_active = 1`,
    [contactId]
  );
  return rows.map((row) => String(row.id));
}

async function getSupervisorIdsForTechnician(executor, technicianId) {
  if (!technicianId) return [];
  const [rows] = await executor.query(
    `SELECT supervisor_id
     FROM supervisor_technicians
     WHERE technician_id = ?`,
    [technicianId]
  );
  return rows.map((row) => String(row.supervisor_id));
}

async function getJobVisitTechnicianIds(executor, jobId) {
  if (!jobId) return [];
  const [rows] = await executor.query(
    `SELECT DISTINCT vt.technician_id
     FROM job_visits v
     JOIN visit_technicians vt ON vt.visit_id = v.id
     WHERE v.job_id = ?`,
    [jobId]
  );
  return rows.map((row) => String(row.technician_id));
}

async function getJobContext(executor, jobId) {
  if (!jobId) return null;

  const [[job]] = await executor.query(
    `SELECT
       j.id,
       j.code,
       j.sub_service,
       j.branch_id,
       b.name AS branch_name,
       j.supervisor_id,
       j.team,
       j.requested_by_contact_id
     FROM jobs j
     LEFT JOIN branches b ON b.id = j.branch_id
     WHERE j.id = ?
     LIMIT 1`,
    [jobId]
  );

  if (!job) return null;

  return {
    ...job,
    team_ids: parseTeamIds(job.team),
  };
}

async function getVisitContext(executor, visitId) {
  if (!visitId) return null;

  const [[visit]] = await executor.query(
    `SELECT
       v.id,
       v.visit_number,
       DATE_FORMAT(v.scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
       v.job_id,
       j.code AS job_code,
       j.sub_service,
       j.branch_id,
       b.name AS branch_name,
       j.supervisor_id,
       j.requested_by_contact_id
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     LEFT JOIN branches b ON b.id = j.branch_id
     WHERE v.id = ?
     LIMIT 1`,
    [visitId]
  );

  if (!visit) return null;

  const [techRows] = await executor.query(
    `SELECT technician_id
     FROM visit_technicians
     WHERE visit_id = ?`,
    [visitId]
  );

  return {
    ...visit,
    technician_ids: techRows.map((row) => String(row.technician_id)),
  };
}

async function notifyJobCreated({ jobId, actorUserId = null }) {
  const job = await getJobContext(pool, jobId);
  if (!job) return 0;

  const [branchAdminIds, clientUserIds, visitTechnicianIds] = await Promise.all([
    getBranchAdminUserIds(pool, job.branch_id),
    getClientUserIdsByContactId(pool, job.requested_by_contact_id),
    getJobVisitTechnicianIds(pool, job.id),
  ]);

  return insertNotifications(
    pool,
    [
      actorUserId,
      job.supervisor_id,
      ...job.team_ids,
      ...visitTechnicianIds,
      ...branchAdminIds,
      ...clientUserIds,
    ],
    {
      actorUserId,
      type: "JOB_CREATED",
      title: `New job created: ${job.code || job.id}`,
      message: `${job.sub_service || "A job"} was created${job.branch_name ? ` for ${job.branch_name}` : ""}.`,
      entityType: "job",
      entityId: job.id,
    }
  );
}

async function notifyJobAssignmentChange({
  jobId,
  supervisorId = null,
  technicianIds = [],
  actorUserId = null,
  scope = "current",
  previousSupervisorId = null,
  previousTechnicianIds = [],
}) {
  const job = await getJobContext(pool, jobId);
  if (!job) return 0;

  const [branchAdminIds, clientUserIds] = await Promise.all([
    getBranchAdminUserIds(pool, job.branch_id),
    getClientUserIdsByContactId(pool, job.requested_by_contact_id),
  ]);

  const effectiveTechIds =
    Array.isArray(technicianIds) && technicianIds.length > 0
      ? technicianIds
      : job.team_ids;
  const scopeSuffix =
    scope && scope !== "current" ? ` (${String(scope).toLowerCase()})` : "";

  return insertNotifications(
    pool,
    [
      actorUserId,
      previousSupervisorId,
      ...(Array.isArray(previousTechnicianIds) ? previousTechnicianIds : []),
      supervisorId || job.supervisor_id,
      ...effectiveTechIds,
      ...branchAdminIds,
      ...clientUserIds,
    ],
    {
      actorUserId,
      type: "JOB_ASSIGNED",
      title: `Job assignment updated: ${job.code || job.id}`,
      message: `${job.sub_service || "Job"} assignment was updated${scopeSuffix}.`,
      entityType: "job",
      entityId: job.id,
    }
  );
}

async function notifyVisitCreated({ visitId, actorUserId = null }) {
  const visit = await getVisitContext(pool, visitId);
  if (!visit) return 0;

  const [branchAdminIds, clientUserIds] = await Promise.all([
    getBranchAdminUserIds(pool, visit.branch_id),
    getClientUserIdsByContactId(pool, visit.requested_by_contact_id),
  ]);

  return insertNotifications(
    pool,
    [actorUserId, visit.supervisor_id, ...visit.technician_ids, ...branchAdminIds, ...clientUserIds],
    {
      actorUserId,
      type: "VISIT_CREATED",
      title: `New visit scheduled: ${visit.job_code || visit.job_id}`,
      message: `Visit #${visit.visit_number} is scheduled for ${formatDateTimeLabel(visit.scheduled_date)}.`,
      entityType: "job",
      entityId: visit.job_id,
    }
  );
}

async function notifyVisitTechniciansUpdated({ visitId, actorUserId = null }) {
  const visit = await getVisitContext(pool, visitId);
  if (!visit) return 0;

  const [branchAdminIds, clientUserIds] = await Promise.all([
    getBranchAdminUserIds(pool, visit.branch_id),
    getClientUserIdsByContactId(pool, visit.requested_by_contact_id),
  ]);

  return insertNotifications(
    pool,
    [actorUserId, visit.supervisor_id, ...visit.technician_ids, ...branchAdminIds, ...clientUserIds],
    {
      actorUserId,
      type: "VISIT_TECHNICIANS_UPDATED",
      title: `Visit team updated: ${visit.job_code || visit.job_id}`,
      message: `Technician assignment changed for visit #${visit.visit_number}.`,
      entityType: "job",
      entityId: visit.job_id,
    }
  );
}

async function notifyVisitRescheduled({ visitId, actorUserId = null }) {
  const visit = await getVisitContext(pool, visitId);
  if (!visit) return 0;

  const [branchAdminIds, clientUserIds] = await Promise.all([
    getBranchAdminUserIds(pool, visit.branch_id),
    getClientUserIdsByContactId(pool, visit.requested_by_contact_id),
  ]);

  return insertNotifications(
    pool,
    [actorUserId, visit.supervisor_id, ...visit.technician_ids, ...branchAdminIds, ...clientUserIds],
    {
      actorUserId,
      type: "VISIT_RESCHEDULED",
      title: `Visit rescheduled: ${visit.job_code || visit.job_id}`,
      message: `Visit #${visit.visit_number} was moved to ${formatDateTimeLabel(visit.scheduled_date)}.`,
      entityType: "job",
      entityId: visit.job_id,
    }
  );
}

async function notifyUserBranchChanged({
  userId,
  branchId,
  actorUserId = null,
  previousBranchId = null,
}) {
  if (!userId || !branchId) return 0;

  const [[user]] = await pool.query(
    `SELECT id, name, role FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const [[branch]] = await pool.query(
    `SELECT id, name FROM branches WHERE id = ? LIMIT 1`,
    [branchId]
  );
  const [[previousBranch]] = previousBranchId
    ? await pool.query(
        `SELECT id, name FROM branches WHERE id = ? LIMIT 1`,
        [previousBranchId]
      )
    : [[null]];

  if (!user || !branch) return 0;

  const [branchAdminIds, oldBranchAdminIds, supervisorIds] = await Promise.all([
    getBranchAdminUserIds(pool, branchId),
    getBranchAdminUserIds(pool, previousBranchId),
    user.role === "technician"
      ? getSupervisorIdsForTechnician(pool, user.id)
      : [],
  ]);

  const branchMessage = previousBranch?.name
    ? `${user.name || "A user"} moved from ${previousBranch.name} to ${branch.name}.`
    : `${user.name || "A user"} is now assigned to ${branch.name}.`;

  return insertNotifications(
    pool,
    [
      actorUserId,
      user.id,
      ...supervisorIds,
      ...branchAdminIds,
      ...oldBranchAdminIds,
    ],
    {
    actorUserId,
    type: "BRANCH_CHANGED",
    title: "Branch assignment updated",
    message: branchMessage,
    entityType: "branch",
    entityId: branch.id,
    }
  );
}

async function notifyVisitSubmitted({ visitId, actorUserId = null }) {
  const visit = await getVisitContext(pool, visitId);
  if (!visit) return 0;

  const [branchAdminIds] = await Promise.all([
    getBranchAdminUserIds(pool, visit.branch_id),
  ]);

  return insertNotifications(
    pool,
    [
      ...branchAdminIds,
      visit.supervisor_id,   // supervisor of job
      ...visit.technician_ids, // optional (remove if not needed)
    ],
    {
      actorUserId,
      type: "VISIT_SUBMITTED",
      title: `Visit submitted: ${visit.job_code || visit.job_id}`,
      message: `Visit #${visit.visit_number} is awaiting approval.`,
      entityType: "job",
      entityId: visit.job_id,
    }
  );
}

async function notifyVisitMissed({ visitId, actorUserId = null }) {
  const visit = await getVisitContext(pool, visitId);
  if (!visit) return 0;

  const [branchAdminIds] = await Promise.all([
    getBranchAdminUserIds(pool, visit.branch_id),
  ]);
  console.log("MISS DEBUG:", {
  visitId,
  branchAdminIds,
  supervisor: visit.supervisor_id,
  technicians: visit.technician_ids
});

  return insertNotifications(
    pool,
    [
      ...branchAdminIds,
      visit.supervisor_id,
      ...visit.technician_ids,
    ],
    {
      actorUserId,
      type: "VISIT_MISSED",
      title: `Visit missed: ${visit.job_code || visit.job_id}`,
      message: `Visit #${visit.visit_number} was missed.`,
      entityType: "job",
      entityId: visit.job_id,
    }
  );
}

module.exports = {
  listNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  notifyJobCreated,
  notifyJobAssignmentChange,
  notifyVisitCreated,
  notifyVisitTechniciansUpdated,
  notifyVisitRescheduled,
  notifyUserBranchChanged,
  notifyVisitSubmitted,
  notifyVisitMissed,
};
