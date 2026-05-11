const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");

const getTeamScope = (user, alias = "u.branch_id") => {
  const scopes = Array.isArray(user?.scopes) ? user.scopes : [];

  if (!scopes.length) {
    return { forbidden: true };
  }

  const hasGlobal = scopes.some((scope) => scope.scope_type === "global");
  if (hasGlobal) {
    return { condition: null, params: [] };
  }

  const branchScopes = scopes
    .filter((scope) => scope.scope_type === "branch" && scope.scope_id)
    .map((scope) => scope.scope_id);

  if (!branchScopes.length) {
    return { forbidden: true };
  }

  const placeholders = branchScopes.map(() => "?").join(",");
  return {
    condition: `${alias} IN (${placeholders})`,
    params: branchScopes,
  };
};

const ensureUsersWithinScope = async (executor, userIds, scope) => {
  const ids = Array.from(
    new Set((userIds || []).map((id) => Number(id)).filter(Boolean))
  );

  if (!ids.length) {
    return true;
  }

  const placeholders = ids.map(() => "?").join(",");
  let sql = `
    SELECT u.id
    FROM users u
    WHERE u.id IN (${placeholders})
  `;
  const params = [...ids];

  if (scope.condition) {
    sql += ` AND ${scope.condition}`;
    params.push(...scope.params);
  }

  const [rows] = await executor.query(sql, params);
  return rows.length === ids.length;
};

const getSupervisorTeamRows = async (executor, supervisorId, scope) => {
  let sql = `
    SELECT
      u.id,
      u.name,
      r.name AS role
    FROM supervisor_technicians st
    JOIN users u
      ON u.id = st.technician_id
    JOIN roles r
      ON r.id = u.role_id
    WHERE st.supervisor_id = ?
  `;
  const params = [supervisorId];

  if (scope.condition) {
    sql += ` AND ${scope.condition}`;
    params.push(...scope.params);
  }

  sql += " ORDER BY u.name ASC";

  const [rows] = await executor.query(sql, params);
  return rows;
};

/*
POST /api/teams
Admin assigns technicians to a supervisor
body:
{
  supervisorId: 102,
  technicianIds: [105,106,107]
}
*/
router.post("/", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {

  const { supervisorId, technicianIds } = req.body;

  if (!supervisorId)
    return res.status(400).json({ error: "Supervisor required" });

  const connection = await pool.getConnection();

  try {
    const scope = getTeamScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    await connection.beginTransaction();

    const [[supervisor]] = await connection.query(
      `
      SELECT u.id, u.branch_id, r.name AS role
      FROM users u
      JOIN roles r
        ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
      `,
      [supervisorId]
    );

    if (!supervisor || supervisor.role !== "supervisor") {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid supervisor" });
    }

    const normalizedTechIds = Array.isArray(technicianIds)
      ? technicianIds.map((id) => Number(id)).filter(Boolean)
      : [];

    if (!(await ensureUsersWithinScope(connection, [supervisorId], getTeamScope(req.user, "u.branch_id")))) {
      await connection.rollback();
      return res.status(403).json({ error: "Supervisor is outside your scope" });
    }

    if (normalizedTechIds.length > 0) {
      const placeholders = normalizedTechIds.map(() => "?").join(",");
      const [technicians] = await connection.query(
        `
        SELECT u.id, u.branch_id, r.name AS role
        FROM users u
        JOIN roles r
          ON r.id = u.role_id
        WHERE u.id IN (${placeholders})
        `,
        normalizedTechIds
      );

      if (technicians.length !== normalizedTechIds.length || technicians.some((user) => user.role !== "technician")) {
        await connection.rollback();
        return res.status(400).json({ error: "Invalid technician selection" });
      }

      if (technicians.some((user) => user.branch_id !== supervisor.branch_id)) {
        await connection.rollback();
        return res.status(400).json({ error: "Supervisor and technicians must belong to the same branch" });
      }

      if (!(await ensureUsersWithinScope(connection, normalizedTechIds, scope))) {
        await connection.rollback();
        return res.status(403).json({ error: "One or more technicians are outside your scope" });
      }
    }

    // 1) remove existing team
    await connection.query(
      "DELETE FROM supervisor_technicians WHERE supervisor_id = ?",
      [supervisorId]
    );

    // 2) remove these technicians from any other supervisor
    if (normalizedTechIds.length > 0) {
      const placeholders = normalizedTechIds.map(() => "?").join(",");
      await connection.query(
        `DELETE FROM supervisor_technicians
         WHERE technician_id IN (${placeholders})
           AND supervisor_id <> ?`,
        [...normalizedTechIds, supervisorId]
      );
    }

    // 3) insert new members
    if (normalizedTechIds.length > 0) {
      for (const techId of normalizedTechIds) {
        await connection.query(
          `INSERT INTO supervisor_technicians (id, supervisor_id, technician_id)
           VALUES (UUID(), ?, ?)`,
          [supervisorId, techId]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      supervisorId,
      technicianCount: normalizedTechIds.length
    });

  } catch (err) {
    await connection.rollback();
    console.error("Team assignment failed:", err);
    res.status(500).json({ error: "Failed to assign team" });
  } finally {
    connection.release();
  }
});

/*
POST /api/teams/assign
Admin reassigns a single technician to a supervisor
body:
{
  supervisorId: 102,
  technicianId: 105
}
*/
router.post("/assign", auth, requirePermission(PERMISSIONS.UPDATE_USER), async (req, res) => {
  const { supervisorId, technicianId } = req.body;

  if (!supervisorId || !technicianId) {
    return res.status(400).json({ error: "Supervisor and technician are required" });
  }

  const connection = await pool.getConnection();

  try {
    const scope = getTeamScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    await connection.beginTransaction();

    if (!(await ensureUsersWithinScope(connection, [supervisorId, technicianId], scope))) {
      await connection.rollback();
      return res.status(403).json({ error: "Selected users are outside your scope" });
    }

    const [users] = await connection.query(
      `
      SELECT u.id, u.branch_id, r.name AS role
      FROM users u
      JOIN roles r
        ON r.id = u.role_id
      WHERE u.id IN (?, ?)
      `,
      [supervisorId, technicianId]
    );

    const supervisor = users.find((user) => Number(user.id) === Number(supervisorId));
    const technician = users.find((user) => Number(user.id) === Number(technicianId));

    if (!supervisor || supervisor.role !== "supervisor") {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid supervisor" });
    }

    if (!technician || technician.role !== "technician") {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid technician" });
    }

    if (supervisor.branch_id !== technician.branch_id) {
      await connection.rollback();
      return res.status(400).json({ error: "Supervisor and technician must belong to the same branch" });
    }

    await connection.query(
      "DELETE FROM supervisor_technicians WHERE technician_id = ?",
      [technicianId]
    );

    await connection.query(
      `INSERT INTO supervisor_technicians (id, supervisor_id, technician_id)
       VALUES (UUID(), ?, ?)`,
      [supervisorId, technicianId]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error("Technician reassignment failed:", err);
    res.status(500).json({ error: "Failed to reassign technician" });
  } finally {
    connection.release();
  }
});

/*
GET /api/teams/overview
Admin overview: supervisors with technicians + unassigned technicians
*/
router.get("/overview", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  try {
    const scope = getTeamScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    let branchFilter = "";
    let params = [];

    if (scope.condition) {
      branchFilter = `AND ${scope.condition}`;
      params = [...scope.params];
    }

    // ✅ supervisors (filtered)
    const [supervisors] = await pool.query(
      `SELECT
  u.id,
  u.name,
  u.email,
  u.branch_id,
  r.name AS role,
  b.name AS branch_name
FROM users u
JOIN roles r
  ON r.id = u.role_id
LEFT JOIN branches b
  ON b.id = u.branch_id
WHERE r.name = 'supervisor'
AND u.is_active = 1
${branchFilter}
ORDER BY u.name ASC`,
      params
    );

    // ✅ technicians (filtered)
    const [technicians] = await pool.query(
      `SELECT
  u.id,
  u.name,
  u.email,
  u.branch_id,
  r.name AS role,
  b.name AS branch_name
FROM users u
JOIN roles r
  ON r.id = u.role_id
LEFT JOIN branches b
  ON b.id = u.branch_id
WHERE r.name = 'technician'
AND u.is_active = 1
${branchFilter}
ORDER BY u.name ASC`,
      params
    );

    const [links] = await pool.query(
      `SELECT supervisor_id, technician_id FROM supervisor_technicians`
    );

    const technicianMap = new Map(technicians.map(t => [Number(t.id), t]));
    const supervisorMap = new Map(
      supervisors.map(s => [Number(s.id), { ...s, technicians: [] }])
    );
    const assignedTechs = new Set();

    for (const link of links) {
      const tech = technicianMap.get(Number(link.technician_id));
      const supervisor = supervisorMap.get(Number(link.supervisor_id));
      if (!tech || !supervisor) continue;

      supervisor.technicians.push(tech);
      assignedTechs.add(Number(link.technician_id));
    }

    const unassignedTechnicians = technicians.filter(
      t => !assignedTechs.has(Number(t.id))
    );

    res.json({
      supervisors: Array.from(supervisorMap.values()),
      unassignedTechnicians
    });

  } catch (err) {
    console.error("Team overview failed:", err);
    res.status(500).json({ error: "Failed to load team overview" });
  }
});

/*
GET /api/teams/monitor
Supervisor monitoring dashboard data
*/
router.get("/monitor", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {
  const supervisorId = req.user.id;

  try {
    const scope = getTeamScope(req.user, "t.branch_id");
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    const whereConditions = ["st.supervisor_id = ?"];
    const params = [supervisorId];

    if (scope.condition) {
      whereConditions.push(scope.condition);
      params.push(...scope.params);
    }

    const [rows] = await pool.query(
      `
      SELECT
        t.id AS technician_id,
      t.name AS technician_name,
      t.email AS technician_email,
      j.id AS job_id,
      j.code AS job_code,
      j.sub_service,
      CASE
          WHEN j.approval_status = 'PENDING'
            AND j.status IN('IN_PROGRESS', 'PAUSED')
            THEN 'AWAITING_APPROVAL'
          ELSE j.status
        END AS status,
      j.start_date,
      j.updated_at,
      h.last_activity
      FROM supervisor_technicians st
      JOIN users t ON t.id = st.technician_id
      LEFT JOIN jobs j
        ON(
        JSON_CONTAINS(IFNULL(j.team, JSON_ARRAY()), CAST(t.id AS JSON))
          OR JSON_CONTAINS(IFNULL(j.team, JSON_ARRAY()), JSON_QUOTE(CAST(t.id AS CHAR)))
      )
        AND j.status NOT IN('COMPLETED', 'CANCELED')
      LEFT JOIN(
        SELECT job_id, MAX(created_at) AS last_activity
        FROM job_history
        GROUP BY job_id
      ) h ON h.job_id = j.id
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY t.name ASC, j.updated_at DESC
      `,
      params
    );

    const technicianMap = new Map();
    for (const row of rows) {
      if (!technicianMap.has(row.technician_id)) {
        technicianMap.set(row.technician_id, {
          id: row.technician_id,
          name: row.technician_name,
          email: row.technician_email,
          jobs: []
        });
      }

      if (row.job_id) {
        const lastActivity = row.last_activity || row.updated_at || null;
        technicianMap.get(row.technician_id).jobs.push({
          id: row.job_id,
          code: row.job_code,
          task_name: row.sub_service,
          status: row.status,
          start_time: row.start_date,
          last_activity: lastActivity
        });
      }
    }

    res.json({
      supervisor_id: supervisorId,
      technicians: Array.from(technicianMap.values())
    });
  } catch (err) {
    console.error("Supervisor monitor failed:", err);
    res.status(500).json({ error: "Failed to load supervisor monitor" });
  }
});
/*
GET /api/teams/:supervisorId
Return technicians under a supervisor
*/
/*
GET /api/teams/my/team
Supervisor gets only THEIR technicians
*/
router.get("/my/team", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {

  const supervisorId = req.user.id;

  try {
    const scope = getTeamScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    const rows = await getSupervisorTeamRows(pool, supervisorId, scope);

    res.json(rows);

  } catch (err) {
    console.error("Fetch my team failed:", err);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});


/*
GET /api/teams/:supervisorId
Return technicians under a supervisor (Admin use)
*/
router.get("/:supervisorId", auth, requirePermission(PERMISSIONS.VIEW_USER), async (req, res) => {

  const { supervisorId } = req.params;

  try {
    const scope = getTeamScope(req.user);
    if (scope.forbidden) {
      return res.status(403).json({ error: "No scope assigned" });
    }

    if (!(await ensureUsersWithinScope(pool, [supervisorId], scope))) {
      return res.status(404).json({ error: "Supervisor not found" });
    }

    const rows = await getSupervisorTeamRows(pool, supervisorId, scope);

    res.json(rows);

  } catch (err) {
    console.error("Fetch team failed:", err);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});



module.exports = router;
