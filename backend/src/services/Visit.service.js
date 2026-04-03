const { pool } = require("../../db");
const { v4: uuidv4 } = require("uuid");

async function createVisit(jobId, scheduledDate, technicianIds = [], createdBy) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(visit_number),0) + 1 AS nextVisit
       FROM job_visits
       WHERE job_id = ?`,
      [jobId]
    );
    

    const visitNumber = rows[0].nextVisit;
    const visitId = uuidv4();

    // create visit
    await conn.query(
      `INSERT INTO job_visits
       (id, job_id, visit_number, scheduled_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [visitId, jobId, visitNumber, scheduledDate, createdBy]
    );

    // attach technicians
    for (const techId of technicianIds) {
      await conn.query(
        `INSERT INTO visit_technicians
         (id, visit_id, technician_id)
         VALUES (?, ?, ?)`,
        [uuidv4(), visitId, techId]
      );
    }

    await conn.commit();

    return visitId;

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createVisit };