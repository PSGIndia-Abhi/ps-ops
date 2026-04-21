const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { createVisit } = require("../services/Visit.service");
const {
  notifyVisitCreated,
  notifyVisitTechniciansUpdated,
  notifyVisitRescheduled,
  notifyVisitSubmitted,
} = require("../services/notifications.service");

function normalizeScheduledDateTime(scheduledDate, scheduledTime) {
  const rawDate = typeof scheduledDate === "string"
    ? scheduledDate.trim()
    : scheduledDate;
  const rawTime = typeof scheduledTime === "string"
    ? scheduledTime.trim()
    : scheduledTime;

  if (!rawDate) return null;

  if (
    rawTime &&
    /^\d{2}:\d{2}$/.test(rawTime) &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  ) {
    return `${rawDate} ${rawTime}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return `${rawDate} 00:00:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(rawDate)) {
    return rawDate.replace("T", " ") + ":00";
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(rawDate)) {
    return rawDate.replace("T", " ");
  }

  return null;
}

async function createVisitController(req, res) {
  try {
    const { jobId } = req.params;
    const { scheduled_date, scheduled_time, technician_ids } = req.body;
    const created_by_user_id = req.user?.id;
    const scheduledDateTime = normalizeScheduledDateTime(
      scheduled_date,
      scheduled_time
    );

    if (!scheduledDateTime) {
      return res.status(400).json({ error: "Valid scheduled date and time are required" });
    }

    const visitId = await createVisit(
      jobId,
      scheduledDateTime,
      technician_ids || [],
      created_by_user_id
    );


    res.json({
      success: true,
      visit_id: visitId
    });

    notifyVisitCreated({
      visitId,
      actorUserId: created_by_user_id,
    }).catch((err) => {
      console.error("Visit creation notification failed:", err);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create visit" });
  }
}

async function getJobVisits(req, res) {
  const { jobId } = req.params;

  try {

    const [rows] = await pool.query(`
      SELECT
        v.id,
        v.visit_number,
        DATE_FORMAT(v.scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
        v.status,
        DATE_FORMAT(v.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
        DATE_FORMAT(v.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
        v.notes,
        u.id AS technician_id,
        u.name AS technician_name
      FROM job_visits v
      LEFT JOIN visit_technicians vt ON vt.visit_id = v.id
      LEFT JOIN users u ON u.id = vt.technician_id
      WHERE v.job_id = ?
      ORDER BY v.scheduled_date IS NULL ASC, v.scheduled_date ASC, v.visit_number ASC
    `, [jobId]);

    const visitMap = new Map();

    rows.forEach(r => {

      if (!visitMap.has(r.id)) {
        visitMap.set(r.id, {
          id: r.id,
          visit_number: r.visit_number,
          scheduled_date: r.scheduled_date,
          status: r.status,
          started_at: r.started_at,
          completed_at: r.completed_at,
          notes: r.notes,
          technicians: []
        });
      }

      if (r.technician_id) {
        visitMap.get(r.id).technicians.push({
          id: r.technician_id,
          name: r.technician_name
        });
      }

    });

    res.json(Array.from(visitMap.values()));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch visits" });
  }
}

async function updateVisitTechnicians(req, res) {
  const { visitId } = req.params;
  const { technician_ids } = req.body;
  const actorUserId = req.user?.id;

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM visit_technicians WHERE visit_id = ?`,
      [visitId]
    );

    for (const techId of technician_ids || []) {
      await conn.query(
        `INSERT INTO visit_technicians (id, visit_id, technician_id)
         VALUES (UUID(), ?, ?)`,
        [visitId, techId]
      );
    }

    await conn.commit();

    res.json({ success: true });

    notifyVisitTechniciansUpdated({
      visitId,
      actorUserId,
    }).catch((err) => {
      console.error("Visit technician notification failed:", err);
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to update technicians" });
  } finally {
    conn.release();
  }
}

async function rescheduleVisit(req, res) {
  const { visitId } = req.params;
  const { scheduled_date, scheduled_time } = req.body;
  const actorUserId = req.user?.id;
  const scheduledDateTime = normalizeScheduledDateTime(
    scheduled_date,
    scheduled_time
  );

  if (!scheduledDateTime) {
    return res.status(400).json({ error: "Valid scheduled date and time are required" });
  }

  try {

    await pool.query(
      `UPDATE job_visits
       SET scheduled_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [scheduledDateTime, visitId]
    );

    res.json({ success: true });

    notifyVisitRescheduled({
      visitId,
      actorUserId,
    }).catch((err) => {
      console.error("Visit reschedule notification failed:", err);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reschedule visit" });
  }
}

async function cancelVisit(req, res) {
  const { visitId } = req.params;

  try {

    await pool.query(
      `UPDATE job_visits
       SET status = 'CANCELED', updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to cancel visit" });
  }
}



//status flow: SCHEDULED -> IN_PROGRESS -> AWAITING_APPROVAL -> COMPLETED

async function startVisit(req, res) {
  const { visitId } = req.params;

  try {

    await pool.query(
      `UPDATE job_visits
       SET status = 'IN_PROGRESS',
           started_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    await pool.query(
      `UPDATE jobs
   SET status = 'IN_PROGRESS',
       updated_at = NOW()
   WHERE id = (
     SELECT job_id FROM job_visits WHERE id = ?
   )
   AND status = 'NOT_STARTED'`,
      [visitId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Start visit failed:", err);
    res.status(500).json({ error: "Failed to start visit" });
  }
}

async function startVisitAnyway(req, res) {
  const { visitId } = req.params;
  const userId = req.user?.id;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. get original visit
    const [[visit]] = await conn.query(
      `SELECT * FROM job_visits WHERE id = ?`,
      [visitId]
    );

    if (!visit) {
      return res.status(404).json({ error: "Visit not found" });
    }

    const now = new Date();

    // 2. block if active visit exists
    const [[active]] = await conn.query(
      `SELECT id FROM job_visits
       WHERE job_id = ?
       AND status = 'IN_PROGRESS'`,
      [visit.job_id]
    );

    if (active) {
      return res.status(400).json({
        error: "Another visit already in progress",
      });
    }

    // 3. get next visit number
    const [[row]] = await conn.query(
      `SELECT COALESCE(MAX(visit_number),0) + 1 AS nextVisit
       FROM job_visits
       WHERE job_id = ?`,
      [visit.job_id]
    );

    await pool.query(
      `UPDATE jobs
   SET status = 'IN_PROGRESS',
       updated_at = NOW()
   WHERE id = (
     SELECT job_id FROM job_visits WHERE id = ?
   )
   AND status = 'NOT_STARTED'`,
      [visitId]
    );

    const newVisitId = uuid();

    // 3.5 Mark old visit as Canceled (could also do "MISSED" but that would require more frontend changes)
    await conn.query(
      `UPDATE job_visits
   SET status = 'CANCELED', updated_at = NOW()
   WHERE id = ?`,
      [visitId]
    );

    // 4. create new visit
    await conn.query(
      `INSERT INTO job_visits
       (id, job_id, visit_number, scheduled_date, status, started_at, created_by_user_id)
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', NOW(), ?)`,
      [
        newVisitId,
        visit.job_id,
        row.nextVisit,
        now,
        userId,
      ]
    );

    // 5. copy technicians
    const [techs] = await conn.query(
      `SELECT technician_id FROM visit_technicians WHERE visit_id = ?`,
      [visitId]
    );

    for (const t of techs) {
      await conn.query(
        `INSERT INTO visit_technicians (id, visit_id, technician_id)
         VALUES (?, ?, ?)`,
        [uuid(), newVisitId, t.technician_id]
      );
    }

    // 6. add system comment
    await conn.query(
      `INSERT INTO job_comments (id, job_id, comment, type)
       VALUES (?, ?, ?, 'SYSTEM')`,
      [
        uuid(),
        visit.job_id,
        `Visit scheduled for ${visit.scheduled_date} was missed. Started on ${now}.`,
      ]
    );

    await conn.commit();

    res.json({
      success: true,
      visit_id: newVisitId,
    });

  } catch (err) {
    await conn.rollback();
    console.error("Start anyway failed:", err);
    res.status(500).json({ error: "Failed to start visit anyway" });
  } finally {
    conn.release();
  }
}

async function submitVisit(req, res) {
  const { visitId } = req.params;
  const actorUserId = req.user?.id;

  try {

    await pool.query(
      `UPDATE job_visits
       SET status = 'AWAITING_APPROVAL',
           updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    res.json({ success: true });

    // 👇 ADD THIS
    notifyVisitSubmitted({
      visitId,
      actorUserId,
    }).catch((err) => {
      console.error("Visit submit notification failed:", err);
    });

  } catch (err) {
    console.error("Submit visit failed:", err);
    res.status(500).json({ error: "Failed to submit visit" });
  }
}

//approve notifications and send notifications
async function approveVisit(req, res) {
  const { visitId } = req.params;

  try {

    // 1️⃣ Get visit + technicians
    const [rows] = await pool.query(
      `SELECT 
          v.visit_number,
          v.job_id,
          vt.technician_id
       FROM job_visits v
       LEFT JOIN visit_technicians vt ON vt.visit_id = v.id
       WHERE TRIM(v.id) = ?`,
      [visitId.trim()]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Visit not found" });
    }

    const { visit_number, job_id } = rows[0];

    // get all unique technicians
    const technicianIds = [
      ...new Set(rows.map(r => r.technician_id).filter(Boolean))
    ];

    // 2️⃣ Update visit
    await pool.query(
      `UPDATE job_visits
       SET status = 'COMPLETED',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE TRIM(id) = ?`,
      [visitId.trim()]
    );

    // 3️⃣ Notify ALL technicians
    if (technicianIds.length > 0) {
      const { notifyVisitApproved } = require("../services/notifications.service");

      await notifyVisitApproved({
        visitId,
        actorUserId: req.user.id
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Approve visit failed:", err);
    res.status(500).json({ error: err.message });
  }
}

async function getMyVisits(req, res) {
  const technicianId = req.user.id;

  try {

    const [rows] = await pool.query(`
SELECT
  v.id,
  v.visit_number,
  v.scheduled_date, 
  v.status,
  v.job_id,

  j.code AS job_code,
  j.sub_service,
  j.status AS job_status,
  j.address,

  j.company_id,              -- actually site_id

  s.name AS sitename,
  c.id AS company_id_real,
  c.name AS companyname

FROM job_visits v

JOIN visit_technicians vt
  ON vt.visit_id = v.id

JOIN jobs j
  ON j.id = v.job_id

-- ✅ FIX STARTS HERE
LEFT JOIN sites s
  ON j.company_id = s.id

LEFT JOIN companies c
  ON s.company_id = c.id
-- ✅ FIX ENDS HERE

WHERE vt.technician_id = ?
AND v.status IN ('SCHEDULED', 'IN_PROGRESS', 'AWAITING_APPROVAL')

ORDER BY v.scheduled_date ASC;
    `, [technicianId]);

    res.json(rows);

  } catch (err) {
    console.error("Failed to fetch technician visits:", err);
    res.status(500).json({ error: "Failed to fetch visits" });
  }
}

async function getClientUpcomingVisit(req, res) {

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized - user missing" });
  }


  try {

    const [users] = await pool.query(
      `SELECT contact_id FROM users WHERE id = ?`,
      [userId]
    );

    if (!users.length || !users[0].contact_id) {
      return res.status(400).json({
        error: "Client contact mapping not found"
      });
    }

    const contactId = users[0].contact_id;

    const [rows] = await pool.query(`
      SELECT 
  DATE_FORMAT(v.scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
  j.sub_service AS title
FROM job_visits v
JOIN jobs j ON j.id = v.job_id
WHERE j.requested_by_contact_id = ?
  AND v.status = 'SCHEDULED'
  AND v.scheduled_date >= NOW()
ORDER BY v.scheduled_date ASC
LIMIT 1;
    `, [contactId]);

    res.json(rows.length ? rows[0] : null);

  } catch (err) {
    console.error("❌ Upcoming visit error:", err);
    res.status(500).json({ error: "Failed to fetch upcoming visit" });
  }
}


module.exports = { startVisit, startVisitAnyway, submitVisit, approveVisit, createVisitController, getMyVisits, getJobVisits, updateVisitTechnicians, rescheduleVisit, cancelVisit, getClientUpcomingVisit };
