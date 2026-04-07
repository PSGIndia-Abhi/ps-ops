const express = require("express");
const router = express.Router();
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/*
POST /api/teams
Admin assigns technicians to a supervisor
body:
{
  supervisorId: 102,
  technicianIds: [105,106,107]
}
*/
router.post("/", auth, allowRoles("admin", "branch_admin"), async (req, res) => {

  const { supervisorId, technicianIds } = req.body;

  if (!supervisorId)
    return res.status(400).json({ error: "Supervisor required" });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1) remove existing team
    await connection.query(
      "DELETE FROM supervisor_technicians WHERE supervisor_id = ?",
      [supervisorId]
    );

    // 2) remove these technicians from any other supervisor
    if (technicianIds && technicianIds.length > 0) {
      const placeholders = technicianIds.map(() => "?").join(",");
      await connection.query(
        `DELETE FROM supervisor_technicians
         WHERE technician_id IN (${placeholders})
           AND supervisor_id <> ?`,
        [...technicianIds, supervisorId]
      );
    }

    // 3) insert new members
    if (technicianIds && technicianIds.length > 0) {
      for (const techId of technicianIds) {
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
      technicianCount: technicianIds?.length || 0
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
router.post("/assign", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  const { supervisorId, technicianId } = req.body;

  if (!supervisorId || !technicianId) {
    return res.status(400).json({ error: "Supervisor and technician are required" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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
router.get("/overview", auth, allowRoles("admin", "branch_admin"), async (req, res) => {
  try {
    let branchFilter = "";
    let params = [];

    // 🔥 get branch_id for branch_admin
    if (req.user.role === "branch_admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );

      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }

      branchFilter = "AND branch_id = ?";
      params.push(me.branch_id);
    }

    // ✅ supervisors (filtered)
    const [supervisors] = await pool.query(
      `SELECT id, name, email 
       FROM users 
       WHERE role = 'supervisor' 
       AND is_active = 1 
       ${branchFilter}
       ORDER BY name ASC`,
      params
    );

    // ✅ technicians (filtered)
    const [technicians] = await pool.query(
      `SELECT id, name, email 
       FROM users 
       WHERE role = 'technician' 
       AND is_active = 1 
       ${branchFilter}
       ORDER BY name ASC`,
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
router.get("/monitor", auth, allowRoles("supervisor", "branch_admin"), async (req, res) => {
  const supervisorId = req.user.id;

  try {
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
            AND j.status IN ('IN_PROGRESS', 'PAUSED')
            THEN 'AWAITING_APPROVAL'
          ELSE j.status
        END AS status,
        j.start_date,
        j.updated_at,
        h.last_activity
      FROM supervisor_technicians st
      JOIN users t ON t.id = st.technician_id
      LEFT JOIN jobs j
        ON (
          JSON_CONTAINS(IFNULL(j.team, JSON_ARRAY()), CAST(t.id AS JSON))
          OR JSON_CONTAINS(IFNULL(j.team, JSON_ARRAY()), JSON_QUOTE(CAST(t.id AS CHAR)))
        )
        AND j.status NOT IN ('COMPLETED', 'CANCELED')
      LEFT JOIN (
        SELECT job_id, MAX(created_at) AS last_activity
        FROM job_history
        GROUP BY job_id
      ) h ON h.job_id = j.id
      WHERE st.supervisor_id = ?
      ORDER BY t.name ASC, j.updated_at DESC
      `,
      [supervisorId]
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
router.get("/my/team", auth, allowRoles("supervisor", "branch_admin"), async (req, res) => {

  const supervisorId = req.user.id;

  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name
      FROM supervisor_technicians st
      JOIN users u ON u.id = st.technician_id
      WHERE st.supervisor_id = ?
      ORDER BY u.name
    `, [supervisorId]);

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
router.get("/:supervisorId", auth, allowRoles("admin","supervisor"), async (req, res) => {

  const { supervisorId } = req.params;

  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name
      FROM supervisor_technicians st
      JOIN users u ON u.id = st.technician_id
      WHERE st.supervisor_id = ?
      ORDER BY u.name ASC
    `, [supervisorId]);

    res.json(rows);

  } catch (err) {
    console.error("Fetch team failed:", err);
    res.status(500).json({ error: "Failed to fetch team" });
  }
});



module.exports = router;
