const { pool } = require("../../db");
const { v4: uuid } = require("uuid");



const { createVisit } = require("../services/Visit.service");

async function createVisitController(req, res) {
  try {
    const { jobId } = req.params;
    const { scheduled_date, technician_ids } = req.body;
    const created_by_user_id = req.user?.id;

    const visitId = await createVisit(
      jobId,
      scheduled_date,
      technician_ids || [],
      created_by_user_id
    );


    res.json({
      success: true,
      visit_id: visitId
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
        v.scheduled_date,
        v.status,
        v.started_at,
        v.completed_at,
        v.notes,
        u.id AS technician_id,
        u.name AS technician_name
      FROM job_visits v
      LEFT JOIN visit_technicians vt ON vt.visit_id = v.id
      LEFT JOIN users u ON u.id = vt.technician_id
      WHERE v.job_id = ?
      ORDER BY v.visit_number
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
  const { scheduled_date } = req.body;

  try {

    await pool.query(
      `UPDATE job_visits
       SET scheduled_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [scheduled_date, visitId]
    );

    res.json({ success: true });

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

    res.json({ success: true });

  } catch (err) {
    console.error("Start visit failed:", err);
    res.status(500).json({ error: "Failed to start visit" });
  }
}

async function submitVisit(req, res) {
  const { visitId } = req.params;

  try {

    await pool.query(
      `UPDATE job_visits
       SET status = 'AWAITING_APPROVAL',
           updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Submit visit failed:", err);
    res.status(500).json({ error: "Failed to submit visit" });
  }
}

async function approveVisit(req, res) {
  const { visitId } = req.params;

  try {

    await pool.query(
      `UPDATE job_visits
       SET status = 'COMPLETED',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Approve visit failed:", err);
    res.status(500).json({ error: "Failed to approve visit" });
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
        j.service_type,
        j.address
      FROM job_visits v
      JOIN visit_technicians vt ON vt.visit_id = v.id
      JOIN jobs j ON j.id = v.job_id
      WHERE vt.technician_id = ?
      AND (
            (DATE(v.scheduled_date) = CURDATE() AND v.status = 'SCHEDULED')
         OR v.status = 'IN_PROGRESS'
         OR v.status = 'AWAITING_APPROVAL'
      )
      ORDER BY v.scheduled_date ASC
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
  v.scheduled_date,
  j.sub_service
FROM job_visits v
JOIN jobs j ON j.id = v.job_id
WHERE j.requested_by_contact_id = '9d63d58f-aa54-4af1-b1fe-3f933e580f5f'
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


module.exports = { startVisit, submitVisit, approveVisit, createVisitController, getMyVisits, getJobVisits, updateVisitTechnicians, rescheduleVisit, cancelVisit, getClientUpcomingVisit };