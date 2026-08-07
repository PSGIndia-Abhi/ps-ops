const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { redis } = require("../utils/redis");
const { createVisit } = require("../services/Visit.service");
const {
  notifyVisitCreated,
  notifyVisitTechniciansUpdated,
  notifyVisitRescheduled,
  notifyVisitSubmitted,
} = require("../services/notifications.service");

function isMissingTableError(err, tableName) {
  if (!err) return false;
  const raw = `${err.code || ""} ${err.sqlMessage || err.message || ""}`;
  return raw.includes("ER_NO_SUCH_TABLE") && raw.includes(tableName);
}

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

const VISIT_GEOFENCE_RADIUS_METERS = 100;

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return R * c;
}

async function checkVisitGeofence(
  visitId,
  technicianId,
  currentLocation = null,
  conn = pool
) {
  // Get visit + job site location
const [[visit]] = await conn.query(
  `
  SELECT
    jv.id AS visit_id,
    jv.job_id,
    s.id AS site_id,
    s.location_id,
    l.latitude,
    l.longitude

  FROM job_visits jv

  JOIN jobs j
    ON j.id = jv.job_id

  LEFT JOIN sites s
    ON s.id = j.company_id

  LEFT JOIN locations l
    ON l.id = s.location_id

  WHERE jv.id = ?
  LIMIT 1
  `,
  [visitId]
);

  // Actual visit does not exist
  if (!visit) {
    return {
      allowed: false,
      status: 404,
      error: "Visit not found",
    };
  }

  // Visit exists but location isn't configured
 if (
  visit.latitude == null ||
  visit.longitude == null
) {
  console.log("Missing job location:", {
    visitId,
    jobId: visit.job_id,
    siteId: visit.site_id,
    locationId: visit.location_id,
  });

  return {
    allowed: false,
    status: 400,
    error: "Job location is not configured",
  };
}

  let technicianLocation = currentLocation;

  if (
    !technicianLocation ||
    technicianLocation.latitude == null ||
    technicianLocation.longitude == null
  ) {
    const key = `technician:location:${technicianId}`;
    const rawLocation = await redis.get(key);

    if (!rawLocation) {
      return {
        allowed: false,
        status: 400,
        error: "Current technician location is unavailable",
      };
    }

    technicianLocation = JSON.parse(rawLocation);
  }

  const distanceMeters = calculateDistanceMeters(
    Number(technicianLocation.latitude),
    Number(technicianLocation.longitude),
    Number(visit.latitude),
    Number(visit.longitude)
  );

  console.log("GEOFENCE CHECK:", {
    technicianId,
    visitId,
    technician: {
      latitude: technicianLocation.latitude,
      longitude: technicianLocation.longitude,
    },
    job: {
      latitude: visit.latitude,
      longitude: visit.longitude,
    },
    distanceMeters: Math.round(distanceMeters),
  });

  return {
    allowed:
      distanceMeters <= VISIT_GEOFENCE_RADIUS_METERS,

    distanceMeters: Math.round(distanceMeters),

    radiusMeters: VISIT_GEOFENCE_RADIUS_METERS,
  };
}

async function createVisitController(req, res) {
  try {
    const { jobId } = req.params;
    const { scheduled_date, scheduled_time, technician_ids, temporary_access_ids = [] } = req.body;
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

    const normalizedTempIds = Array.from(
      new Set((temporary_access_ids || []).map((id) => String(id).trim()).filter(Boolean))
    );
    if (normalizedTempIds.length) {
      const placeholders = normalizedTempIds.map(() => "?").join(",");
      const [tempRows] = await pool.query(
        `SELECT id
         FROM temporary_access
         WHERE id IN (${placeholders})
           AND job_id = ?
           AND revoked_at IS NULL`,
        [...normalizedTempIds, jobId]
      );
      if (tempRows.length !== normalizedTempIds.length) {
        return res.status(400).json({ error: "Some temporary workers are invalid for this job or revoked" });
      }

      for (const tempAccessId of normalizedTempIds) {
        await pool.query(
          `INSERT INTO visit_temporary_access (id, visit_id, temp_access_id)
           VALUES (?, ?, ?)`,
          [uuid(), visitId, tempAccessId]
        );
      }
    }


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
    let rows;
    try {
      [rows] = await pool.query(`
        SELECT
          v.id,
          v.visit_number,
          DATE_FORMAT(v.scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
          v.status,
          DATE_FORMAT(v.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
          DATE_FORMAT(v.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
          v.notes,
          u.id AS technician_id,
          u.name AS technician_name,
          ta.id AS temp_access_id,
          ta.worker_name AS temp_worker_name
        FROM job_visits v
        LEFT JOIN visit_technicians vt ON vt.visit_id = v.id
        LEFT JOIN users u ON u.id = vt.technician_id
        LEFT JOIN visit_temporary_access vta ON vta.visit_id = v.id
        LEFT JOIN temporary_access ta ON ta.id = vta.temp_access_id
        WHERE v.job_id = ?
        ORDER BY v.scheduled_date IS NULL ASC, v.scheduled_date ASC, v.visit_number ASC
      `, [jobId]);
    } catch (err) {
      if (
        isMissingTableError(err, "visit_temporary_access") ||
        isMissingTableError(err, "temporary_access")
      ) {
        [rows] = await pool.query(`
          SELECT
            v.id,
            v.visit_number,
            DATE_FORMAT(v.scheduled_date, '%Y-%m-%d %H:%i:%s') AS scheduled_date,
            v.status,
            DATE_FORMAT(v.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
            DATE_FORMAT(v.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
            v.notes,
            u.id AS technician_id,
            u.name AS technician_name,
            NULL AS temp_access_id,
            NULL AS temp_worker_name
          FROM job_visits v
          LEFT JOIN visit_technicians vt ON vt.visit_id = v.id
          LEFT JOIN users u ON u.id = vt.technician_id
          WHERE v.job_id = ?
          ORDER BY v.scheduled_date IS NULL ASC, v.scheduled_date ASC, v.visit_number ASC
        `, [jobId]);
      } else {
        throw err;
      }
    }

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
          technicians: [],
          temporary_workers: []
        });
      }

      if (r.technician_id) {
        const existingTechs = visitMap.get(r.id).technicians;
        if (!existingTechs.some((t) => String(t.id) === String(r.technician_id))) {
          existingTechs.push({
            id: r.technician_id,
            name: r.technician_name
          });
        }
      }

      if (r.temp_access_id) {
        const existing = visitMap.get(r.id).temporary_workers;
        if (!existing.some((w) => String(w.id) === String(r.temp_access_id))) {
          existing.push({
            id: r.temp_access_id,
            name: r.temp_worker_name || "Temporary Worker",
          });
        }
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
  const { technician_ids, temporary_access_ids = [] } = req.body;
  const actorUserId = req.user?.id;

  const conn = await pool.getConnection();

  try {

    await conn.beginTransaction();

    const [[visit]] = await conn.query(
      `SELECT id, job_id FROM job_visits WHERE id = ? LIMIT 1`,
      [visitId]
    );
    if (!visit) {
      await conn.rollback();
      return res.status(404).json({ error: "Visit not found" });
    }

    const normalizedTempIds = Array.from(
      new Set((temporary_access_ids || []).map((id) => String(id).trim()).filter(Boolean))
    );

    if (normalizedTempIds.length) {
      const placeholders = normalizedTempIds.map(() => "?").join(",");
      const [tempRows] = await conn.query(
        `SELECT id
         FROM temporary_access
         WHERE id IN (${placeholders})
           AND job_id = ?
           AND revoked_at IS NULL`,
        [...normalizedTempIds, visit.job_id]
      );
      if (tempRows.length !== normalizedTempIds.length) {
        await conn.rollback();
        return res.status(400).json({ error: "Some temporary workers are invalid for this job or revoked" });
      }
    }

    await conn.query(
      `DELETE FROM visit_technicians WHERE visit_id = ?`,
      [visitId]
    );

    await conn.query(
      `DELETE FROM visit_temporary_access WHERE visit_id = ?`,
      [visitId]
    );

    for (const techId of technician_ids || []) {
      await conn.query(
        `INSERT INTO visit_technicians (id, visit_id, technician_id)
         VALUES (UUID(), ?, ?)`,
        [visitId, techId]
      );
    }

    for (const tempAccessId of normalizedTempIds) {
      await conn.query(
        `INSERT INTO visit_temporary_access (id, visit_id, temp_access_id)
         VALUES (?, ?, ?)`,
        [uuid(), visitId, tempAccessId]
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
  const technicianId = req.user?.id;
  const {
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
  } = req.body || {};

  try {
    const currentLocation =
      latitude != null && longitude != null
        ? {
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy:
              accuracy != null ? Number(accuracy) : null,
            speed: speed != null ? Number(speed) : null,
            heading:
              heading != null ? Number(heading) : null,
            updatedAt: new Date().toISOString(),
          }
        : null;

    const geofence = await checkVisitGeofence(
      visitId,
      technicianId,
      currentLocation
    );

    if (geofence.error) {
      return res
        .status(geofence.status)
        .json(geofence);
    }

    if (!geofence.allowed) {
      return res.status(403).json({
        error: "You are outside the job location",
        code: "OUTSIDE_GEOFENCE",
        distanceMeters: geofence.distanceMeters,
        radiusMeters: geofence.radiusMeters,
      });
    }

    await pool.query(
      `
      UPDATE job_visits
      SET
        status = 'IN_PROGRESS',
        started_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
      `,
      [visitId]
    );

    await pool.query(
      `
      UPDATE jobs
      SET
        status = 'IN_PROGRESS',
        updated_at = NOW()
      WHERE id = (
        SELECT job_id
        FROM job_visits
        WHERE id = ?
      )
      AND status = 'NOT_STARTED'
      `,
      [visitId]
    );

    if (currentLocation) {
      await redis.set(
        `technician:location:${technicianId}`,
        JSON.stringify({
          technicianId,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          speed: currentLocation.speed,
          heading: currentLocation.heading,
          updatedAt: currentLocation.updatedAt,
        }),
        { EX: 3600 }
      );
    }

    return res.json({
      success: true,
      distanceMeters: geofence.distanceMeters,
    });

  } catch (err) {
    console.error("Start visit failed:", err);

    return res.status(500).json({
      error: "Failed to start visit",
    });
  }
}

async function startVisitAnyway(req, res) {
  const { visitId } = req.params;
  const userId = req.user?.id;
  const {
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
  } = req.body || {};

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Get original missed visit
    const [[visit]] = await conn.query(
      `SELECT * FROM job_visits WHERE id = ?`,
      [visitId]
    );

    if (!visit) {
      await conn.rollback();
      return res.status(404).json({
        error: "Visit not found",
      });
    }

    const currentLocation =
      latitude != null && longitude != null
        ? {
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy:
              accuracy != null ? Number(accuracy) : null,
            speed: speed != null ? Number(speed) : null,
            heading:
              heading != null ? Number(heading) : null,
            updatedAt: new Date().toISOString(),
          }
        : null;

    // 2. GEOFENCE CHECK
    const geofence = await checkVisitGeofence(
      visitId,
      userId,
      currentLocation,
      conn
    );

    if (geofence.error) {
      await conn.rollback();

      return res
        .status(geofence.status)
        .json(geofence);
    }

    if (!geofence.allowed) {
      await conn.rollback();

      return res.status(403).json({
        error: "You are outside the job location",
        code: "OUTSIDE_GEOFENCE",
        distanceMeters: geofence.distanceMeters,
        radiusMeters: geofence.radiusMeters,
      });
    }

    const now = new Date();

    // 3. Block if active visit exists
    const [[active]] = await conn.query(
      `SELECT id
       FROM job_visits
       WHERE job_id = ?
       AND status = 'IN_PROGRESS'`,
      [visit.job_id]
    );

    if (active) {
      await conn.rollback();

      return res.status(400).json({
        error: "Another visit already in progress",
      });
    }

    // 4. Get next visit number
    const [[row]] = await conn.query(
      `SELECT COALESCE(MAX(visit_number), 0) + 1 AS nextVisit
       FROM job_visits
       WHERE job_id = ?`,
      [visit.job_id]
    );

    // 5. Update job
    await conn.query(
      `UPDATE jobs
       SET status = 'IN_PROGRESS',
           updated_at = NOW()
       WHERE id = ?
       AND status = 'NOT_STARTED'`,
      [visit.job_id]
    );

    const newVisitId = uuid();

    // 6. Cancel old missed visit
    await conn.query(
      `UPDATE job_visits
       SET status = 'CANCELED',
           updated_at = NOW()
       WHERE id = ?`,
      [visitId]
    );

    // 7. Create new visit
    await conn.query(
      `INSERT INTO job_visits
       (
         id,
         job_id,
         visit_number,
         scheduled_date,
         status,
         started_at,
         created_by_user_id
       )
       VALUES (?, ?, ?, ?, 'IN_PROGRESS', NOW(), ?)`,
      [
        newVisitId,
        visit.job_id,
        row.nextVisit,
        now,
        userId,
      ]
    );

    // 8. Copy technicians
    const [techs] = await conn.query(
      `SELECT technician_id
       FROM visit_technicians
       WHERE visit_id = ?`,
      [visitId]
    );

    for (const tech of techs) {
      await conn.query(
        `INSERT INTO visit_technicians
         (id, visit_id, technician_id)
         VALUES (?, ?, ?)`,
        [uuid(), newVisitId, tech.technician_id]
      );
    }

    // 9. Add system comment
    await conn.query(
      `INSERT INTO job_comments
       (id, job_id, comment, type)
       VALUES (?, ?, ?, 'SYSTEM')`,
      [
        uuid(),
        visit.job_id,
        `Visit scheduled for ${visit.scheduled_date} was missed. Started on ${now}.`,
      ]
    );

    await conn.commit();

    if (currentLocation) {
      await redis.set(
        `technician:location:${userId}`,
        JSON.stringify({
          technicianId: userId,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          speed: currentLocation.speed,
          heading: currentLocation.heading,
          updatedAt: currentLocation.updatedAt,
        }),
        { EX: 3600 }
      );
    }

    return res.json({
      success: true,
      visit_id: newVisitId,
      distanceMeters: geofence.distanceMeters,
    });

  } catch (err) {
    await conn.rollback();

    console.error("Start anyway failed:", err);

    return res.status(500).json({
      error: "Failed to start visit anyway",
    });

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
AND v.status NOT IN ('COMPLETED', 'CANCELED')
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
