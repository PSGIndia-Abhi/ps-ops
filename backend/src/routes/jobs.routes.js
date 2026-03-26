
const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const multer = require("multer");
const minioClient = require("../lib/minio");
const { v4: uuid } = require("uuid");
const upload = multer({
  storage: multer.memoryStorage(),
});
const auth = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { createBooking } = require("../controllers/bookings.controller");

const isValidJobId = (jobId) => {
  if (!jobId) return false;
  const isNumeric = /^\d+$/.test(jobId);
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
  return isNumeric || isUUID;
};

const canAccessJob = async (executor, user, jobId) => {
  if (user.role === "admin") {
    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? LIMIT 1`,
      [jobId]
    );
    return !!job;
  }

  if (user.role === "supervisor") {
    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? AND supervisor_id = ? LIMIT 1`,
      [jobId, user.id]
    );
    return !!job;
  }

  if (user.role === "technician") {
    const [[job]] = await executor.query(
      `
      SELECT id
      FROM jobs
      WHERE id = ?
        AND (
          JSON_CONTAINS(team, CAST(? AS JSON))
          OR JSON_CONTAINS(team, JSON_QUOTE(?))
        )
      LIMIT 1
      `,
      [jobId, String(user.id), String(user.id)]
    );
    return !!job;
  }

  if (user.role === "client") {
    const [[userRow]] = await executor.query(
      `SELECT contact_id FROM users WHERE id = ?`,
      [user.id]
    );

    if (!userRow?.contact_id) return false;

    const [[job]] = await executor.query(
      `SELECT id FROM jobs WHERE id = ? AND requested_by_contact_id = ? LIMIT 1`,
      [jobId, userRow.contact_id]
    );

    return !!job;
  }

  return false;
};

const ensureJobAccess = async (req, res, executor, jobId) => {
  if (!isValidJobId(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return false;
  }

  const allowed = await canAccessJob(executor, req.user, jobId);
  if (!allowed) {
    res.status(404).json({ error: "Job not found" });
    return false;
  }

  return true;
};

const updateFutureRecurringJobs = async (
  executor,
  bookingId,
  startDate,
  supervisorId,
  teamJson
) => {
  if (!bookingId || !startDate) return 0;

  const [result] = await executor.query(
    `
    UPDATE jobs
    SET supervisor_id = ?, team = ?, updated_at = NOW()
    WHERE booking_id = ?
      AND start_date IS NOT NULL
      AND DATE(start_date) > DATE(?)
    `,
    [supervisorId, teamJson, bookingId, startDate]
  );

  return result?.affectedRows || 0;
};

const updateRangeRecurringJobs = async (
  executor,
  bookingId,
  rangeStart,
  rangeEnd,
  supervisorId,
  teamJson
) => {
  if (!bookingId || !rangeStart || !rangeEnd) return 0;

  const [result] = await executor.query(
    `
    UPDATE jobs
    SET supervisor_id = ?, team = ?, updated_at = NOW()
    WHERE booking_id = ?
      AND start_date IS NOT NULL
      AND DATE(start_date) BETWEEN DATE(?) AND DATE(?)
    `,
    [supervisorId, teamJson, bookingId, rangeStart, rangeEnd]
  );

  return result?.affectedRows || 0;
};
// GET /api/jobs → from MySQL
router.get(
  "/",
  auth,
  allowRoles("admin", "supervisor", "technician", "client"),
  async (req, res) => {
    try {

      const conditions = [];
      const params = [];

      // supervisor → only their jobs
      if (req.user.role === "supervisor") {
        conditions.push("j.supervisor_id = ?");
        params.push(req.user.id);
      }

      if (req.user.role === "client") {

        const [[user]] = await pool.query(
          `SELECT contact_id FROM users WHERE id = ?`,
          [req.user.id]
        );

        if (!user || !user.contact_id) {
          return res.status(400).json({
            error: "Client contact mapping not found"
          });
        }

        conditions.push("j.requested_by_contact_id = ?");
        params.push(user.contact_id);
      }

      // technician → jobs where they are in team JSON
      // technician → jobs where technician has a relevant visit
      if (req.user.role === "technician") {
        conditions.push(`
    EXISTS (
      SELECT 1
      FROM job_visits v
      JOIN visit_technicians vt ON vt.visit_id = v.id
      WHERE v.job_id = j.id
      AND vt.technician_id = ?
      AND (
            (DATE(v.scheduled_date) = CURDATE() AND v.status = 'SCHEDULED')
         OR v.status = 'IN_PROGRESS'
         OR v.status = 'AWAITING_APPROVAL'
      )
    )
  `);

        params.push(req.user.id);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await pool.query(
        `
        SELECT
          j.id,
          j.code,
          j.booking_id,
          j.service_type,
          j.sub_service,
          j.status,
          j.approval_status,
          j.start_date,
          j.due_date,
          j.notes,
          j.address,
          j.created_at,
          j.supervisor_id,
          j.team,

          -- Supervisor
          u.name AS supervisor_name,
          u.phone AS supervisor_phone,

          -- Contact
          c.id   AS contact_id,
          c.name AS contact_name,
          c.phone AS contact_phone,
          c.email AS contact_email,

          -- Company
          co.id   AS company_id,
          co.code AS company_code,
          co.name AS company_name,
          co.type AS company_type,
          co.site AS company_site

        FROM jobs j

        LEFT JOIN users u
          ON j.supervisor_id = u.id

        LEFT JOIN contacts c
          ON j.requested_by_contact_id = c.id

        LEFT JOIN companies co
          ON j.company_id = co.id

        ${where}

        ORDER BY j.created_at DESC
        `,
        params
      );

      const jobs = rows.map((row) => {
        let teamIds = [];

        if (row.team) {
          try {
            teamIds = Array.isArray(row.team)
              ? row.team
              : JSON.parse(row.team);
          } catch {
            teamIds = [];
          }
        }

        return {
          id: row.id,
          code: row.code,
          booking_id: row.booking_id,

          service_type: row.service_type,
          title: row.sub_service,

          status: row.status,
          approval_status: row.approval_status,

          start_date: row.start_date,
          dueDate: row.due_date,
          notes: row.notes,
          address: row.address,

          company_id: row.company_id,
          companyname: row.company_name,
          site: row.company_site,

          supervisor: row.supervisor_id
            ? {
              id: row.supervisor_id,
              name: row.supervisor_name,
              phone: row.supervisor_phone,
            }
            : null,

          requestedBy: row.contact_id
            ? {
              id: row.contact_id,
              name: row.contact_name,
              phone: row.contact_phone,
              email: row.contact_email,
              company: row.company_name,
            }
            : null,

          teamIds,
          team: [],
          history: [],
          attachments: [],
        };
      });

      // resolve team users
      const allTeamIds = Array.from(
        new Set(jobs.flatMap((j) => j.teamIds))
      );

      let teamUserMap = new Map();

      if (allTeamIds.length) {
        const placeholders = allTeamIds.map(() => "?").join(",");

        const [users] = await pool.query(
          `SELECT id, name FROM users WHERE id IN (${placeholders})`,
          allTeamIds
        );

        teamUserMap = new Map(users.map((u) => [Number(u.id), u]));
      }

      let finalJobs = jobs.map((job) => {
        const team = job.teamIds.map((id) => {
          const user = teamUserMap.get(Number(id));
          return user ? { id: user.id, name: user.name } : { id };
        });

        const { teamIds, ...rest } = job;

        return {
          ...rest,
          team,
        };
      });

      if (req.user.role === "client" && finalJobs.length) {
        const jobIds = finalJobs.map((job) => job.id);
        const placeholders = jobIds.map(() => "?").join(",");

        const [historyRows] = await pool.query(
          `
          SELECT job_id, message, created_at, id
          FROM job_history
          WHERE (
              visible_to_client = 1
              OR visible_to_client = TRUE
              OR visible_to_client = '1'
              OR visible_to_client = 'true'
            )
            AND job_id IN (${placeholders})
          ORDER BY created_at DESC, id DESC
          `,
          jobIds
        );

        const latestMap = new Map();
        for (const row of historyRows) {
          const key = String(row.job_id);
          if (!latestMap.has(key)) {
            latestMap.set(key, row);
          }
        }

        finalJobs = finalJobs.map((job) => {
          const latest = latestMap.get(String(job.id));
          return {
            ...job,
            latest_comment: latest?.message || null,
            latest_comment_at: latest?.created_at || null,
          };
        });
      }

      res.json(finalJobs);
    } catch (err) {
      console.error("Error fetching jobs:", err);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  }
);
// GET single job by ID
router.get("/:jobId", auth, allowRoles("admin", "supervisor", "technician", "client"), async (req, res) => {
  const { jobId } = req.params;

  try {
    if (!(await ensureJobAccess(req, res, pool, jobId))) return;

    const [rows] = await pool.query(
      `
      SELECT
        j.*,
        CASE
          WHEN j.approval_status = 'PENDING'
            AND j.status IN ('IN_PROGRESS', 'PAUSED')
            THEN 'AWAITING_APPROVAL'
          WHEN j.status = 'NOT_STARTED'
            AND j.start_date IS NOT NULL
            AND j.start_date < NOW()
            AND (
              YEAR(j.start_date) < YEAR(NOW())
              OR (YEAR(j.start_date) = YEAR(NOW()) AND MONTH(j.start_date) < MONTH(NOW()))
            )
            THEN 'LOST'
          WHEN j.status = 'NOT_STARTED'
            AND j.start_date IS NOT NULL
            AND j.start_date < NOW()
            THEN 'PENDING'
          ELSE j.status
        END AS display_status,
        u.name AS supervisor_name,
        c.id   AS contact_id,
        c.name AS contact_name,
        c.phone AS contact_phone,
        c.email AS contact_email,
        co.id   AS company_id,
        co.code AS company_code,
        co.type AS company_type
      FROM jobs j
      LEFT JOIN users u ON j.supervisor_id = u.id
      LEFT JOIN contacts c ON j.requested_by_contact_id = c.id
      LEFT JOIN companies co ON c.company_id = co.id
      WHERE j.id = ?
      LIMIT 1
      `,
      [jobId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = rows[0];
    let teamMembers = [];
    let _team = [];

    // 1️⃣ Copy DB value
    if (job.team) {

      // mysql JSON column already returns array → [106]
      if (Array.isArray(job.team)) {
        _team = job.team;
      }

      // sometimes mysql sends string "[106]"
      else if (typeof job.team === "string") {
        try {
          _team = JSON.parse(job.team);
        } catch {
          _team = [];
        }
      }
    }

    // 2️⃣ normalize to numbers
    _team = _team.map(id => Number(id)).filter(Boolean);

    // 3️⃣ lookup users
    if (_team.length > 0) {
      const placeholders = _team.map(() => "?").join(",");
      const [users] = await pool.query(
        `SELECT id, name FROM users WHERE id IN (${placeholders})`,
        _team
      );

      teamMembers = users;
    }




    res.json({
      id: job.id,
      code: job.code,
      booking_id: job.booking_id,
      title: job.sub_service,
      service_type: job.service_type,
      status: job.status,
      display_status: job.display_status,
      approval_status: job.approval_status,
      approved_at: job.approved_at,
      notes: job.notes,
      start_date: job.start_date,
      dueDate: job.due_date,
      address: job.address,

      supervisor: job.supervisor_id
        ? { id: job.supervisor_id, name: job.supervisor_name }
        : null,

      requestedBy: job.contact_id
        ? {
          id: job.contact_id,
          name: job.contact_name,
          phone: job.contact_phone,
          email: job.contact_email,
          company: job.company_id
            ? {
              id: job.company_id,
              code: job.company_code,
              type: job.company_type,
            }
            : null,
        }
        : null,

      team: teamMembers,

    });

  } catch (err) {
    console.error("Failed to fetch job:", err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});
// GET job history (timeline)
router.get("/:jobId/history", auth, allowRoles("admin", "supervisor", "technician", "client"), async (req, res) => {
  const { jobId } = req.params;

  try {
    if (!(await ensureJobAccess(req, res, pool, jobId))) return;

    const visibilityClause = req.user.role === "client"
      ? `AND (
          h.visible_to_client = 1
          OR h.visible_to_client = TRUE
          OR h.visible_to_client = '1'
          OR h.visible_to_client = 'true'
        )`
      : "";

    const [rows] = await pool.query(
      ` SELECT
        h.id                AS history_id,
        h.action,
        h.message,
        h.metadata,
        h.created_at,
        h.visible_to_client,
        u.name              AS created_by,

        a.id                AS attachment_id,
        a.type              AS attachment_type,
        a.file_name,
        a.file_type
      FROM job_history h
      LEFT JOIN users u
        ON h.created_by_user_id = u.id
      LEFT JOIN job_attachments a
        ON a.history_id = h.id
      WHERE h.job_id = ?
      ${visibilityClause}
      ORDER BY h.created_at DESC, h.id DESC`,
      [jobId]
    );

    const timelineMap = {};

    for (const row of rows) {
      // If we haven’t seen this history item before, create it
      if (!timelineMap[row.history_id]) {
        timelineMap[row.history_id] = {
          id: row.history_id,
          action: row.action,
          message: row.message,
          metadata: row.metadata,
          created_at: row.created_at,
          created_by: row.created_by,
          visible_to_client: !!row.visible_to_client, //client things :)
          attachments: [],
        };
      }

      // If this row has an attachment, add it
      if (row.attachment_id) {
        timelineMap[row.history_id].attachments.push({
          id: row.attachment_id,
          type: row.attachment_type,
          file_name: row.file_name,
          file_type: row.file_type,
        });
      }
    }

    res.json(Object.values(timelineMap));
  } catch (err) {
    console.error("Failed to fetch job history:", err);
    res.status(500).json({ error: "Failed to fetch job history" });
  }
});

// POST job comment (timeline update)
router.post("/:jobId/comments", auth, allowRoles("admin", "supervisor", "technician"), async (req, res) => {
  const { jobId } = req.params;
  const { message, visible_to_client } = req.body;
  const created_by_user_id = req.user.id;

  if (!message?.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!created_by_user_id) {
    return res.status(400).json({ error: "created_by_user_id is required" });
  }

  try {
    if (!(await ensureJobAccess(req, res, pool, jobId))) return;

    // ensure job exists
    const [[job]] = await pool.query(
      `SELECT id FROM jobs WHERE id = ?`,
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const id = uuid();

    await pool.query(
      `
      INSERT INTO job_history (
        id,
        job_id,
        action,
        message,
        visible_to_client,
        created_by_user_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        id,
        jobId,
        "COMMENT",
        message,
        visible_to_client ? 1 : 0,
        created_by_user_id
      ]
    );

    res.json({
      success: true,
      history_id: id,
      action: "COMMENT",
      message
    });

  } catch (err) {
    console.error("Failed to create job comment:", err);
    res.status(500).json({ error: "Failed to create comment" });
  }
});


//client vis toggle
router.patch(
  "/history/:historyId/visibility",
  auth,
  allowRoles("admin", "supervisor"),
  async (req, res) => {

    const { historyId } = req.params;
    const { visible_to_client } = req.body;

    if (visible_to_client === undefined) {
      return res.status(400).json({
        error: "visible_to_client required"
      });
    }

    try {

      const [result] = await pool.query(
        `
        UPDATE job_history
        SET visible_to_client = ?
        WHERE id = ?
        `,
        [visible_to_client ? 1 : 0, historyId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          error: "History entry not found"
        });
      }

      res.json({ success: true });

    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to update visibility"
      });
    }
  }
);

// JOB STATUS UPDATE (single source of truth)
router.patch("/:id/status", auth, async (req, res) => {
  const jobId = req.params.id;
  const newStatus = req.body?.status;
  const userId = req.user.id;
  const userRole = req.user.role;

  // basic validation
  if (!newStatus) {
    return res.status(400).json({ error: "Status is required" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ read current status (lock row)
    const [[job]] = await connection.query(
      "SELECT status, approval_status, start_date FROM jobs WHERE id = ? FOR UPDATE",
      [jobId]
    );

    if (!job) {
      await connection.rollback();
      return res.status(404).json({ error: "Job not found" });
    }

    const currentStatus = job.status;
    const currentApproval = job.approval_status;

    console.log("STATUS TRANSITION:", currentStatus, "→", newStatus, "by", userRole);

    const isLost =
      currentStatus === "NOT_STARTED"
      && job.start_date
      && new Date(job.start_date) < new Date()
      && (
        new Date(job.start_date).getFullYear() < new Date().getFullYear()
        || (
          new Date(job.start_date).getFullYear() === new Date().getFullYear()
          && new Date(job.start_date).getMonth() < new Date().getMonth()
        )
      );

    if (newStatus === "IN_PROGRESS" && (currentStatus === "CANCELED" || isLost)) {
      await connection.rollback();
      return res.status(400).json({
        error: "Cannot start a canceled or lost job"
      });
    }

    // 2️⃣ allowed transitions (global rules)
    const allowedTransitions = {
      CREATED: [],
      NOT_STARTED: ["IN_PROGRESS", "CANCELED"],
      IN_PROGRESS: ["PAUSED", "COMPLETED", "CANCELED"],
      PAUSED: ["IN_PROGRESS", "COMPLETED", "CANCELED"],
      COMPLETED: [],
      CANCELED: []
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      await connection.rollback();
      return res.status(400).json({
        error: `Invalid transition ${currentStatus} → ${newStatus}`
      });
    }

    // 3️⃣ technician restrictions
    if (userRole === "technician") {
      const technicianAllowed = {
        NOT_STARTED: ["IN_PROGRESS"],
      };

      if (!technicianAllowed[currentStatus]?.includes(newStatus)) {
        await connection.rollback();
        return res.status(403).json({
          error: "Technician not allowed to perform this action"
        });
      }
    }

    if (userRole === "technician" && currentApproval === "PENDING") {
      await connection.rollback();
      return res.status(400).json({
        error: "Job is awaiting supervisor approval"
      });
    }

    // 4️⃣ update job status
    if (newStatus === "COMPLETED") {
      if (userRole === "technician") {
        await connection.rollback();
        return res.status(403).json({
          error: "Technician not allowed to complete jobs"
        });
      }

      await connection.query(
        "UPDATE jobs SET status = ?, approval_status = 'APPROVED', approved_at = NOW(), updated_at = NOW() WHERE id = ?",
        [newStatus, jobId]
      );
    } else {
      await connection.query(
        "UPDATE jobs SET status = ?, updated_at = NOW() WHERE id = ?",
        [newStatus, jobId]
      );
    }

    // 5️⃣ history entry
    await connection.query(
      `INSERT INTO job_history
      (id, job_id, action, message, created_by_user_id, created_at)
      VALUES (UUID(), ?, 'STATUS_CHANGED', ?, ?, NOW())`,
      [
        jobId,
        `Status changed from ${currentStatus} to ${newStatus}`,
        userId
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      previous: currentStatus,
      current: newStatus
    });

  } catch (err) {
    await connection.rollback();
    console.error("Status update failed:", err);
    res.status(500).json({ error: "Failed to update status" });
  } finally {
    connection.release();
  }
});

// Submit job for approval (technician only)
router.post("/:id/submit-approval", auth, allowRoles("technician"), async (req, res) => {
  const jobId = req.params.id;
  const userId = req.user.id;
  const connection = await pool.getConnection();

  try {
    if (!(await ensureJobAccess(req, res, connection, jobId))) return;

    await connection.beginTransaction();

    const [[job]] = await connection.query(
      "SELECT status, approval_status FROM jobs WHERE id = ? FOR UPDATE",
      [jobId]
    );

    if (!job) {
      await connection.rollback();
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.approval_status === "PENDING") {
      await connection.rollback();
      return res.status(400).json({ error: "Job is already submitted for approval" });
    }

    if (!["IN_PROGRESS", "PAUSED"].includes(job.status)) {
      await connection.rollback();
      return res.status(400).json({
        error: "Only in-progress or paused jobs can be submitted for approval"
      });
    }

    await connection.query(
      "UPDATE jobs SET approval_status = 'PENDING', updated_at = NOW() WHERE id = ?",
      [jobId]
    );

    await connection.query(
      `INSERT INTO job_history
      (id, job_id, action, message, created_by_user_id, created_at)
      VALUES (UUID(), ?, 'SUBMITTED_FOR_APPROVAL', ?, ?, NOW())`,
      [
        jobId,
        "Submitted for supervisor approval",
        userId
      ]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error("Submit for approval failed:", err);
    res.status(500).json({ error: "Failed to submit for approval" });
  } finally {
    connection.release();
  }
});


// Update job schedule (start/end date)
router.patch(
  "/:jobId/dates",
  auth,
  allowRoles("admin", "supervisor"),
  async (req, res) => {
    const { jobId } = req.params;
    const { start_date, end_date } = req.body;

    try {
      if (!(await ensureJobAccess(req, res, pool, jobId))) return;
      if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        if (end < start) {
          return res.status(400).json({ error: "End date cannot be before start date" });
        }
      }

      await pool.query(
        `
        UPDATE jobs
        SET start_date = ?, due_date = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [start_date || null, end_date || null, jobId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to update job dates:", err);
      res.status(500).json({ error: "Failed to update job dates" });
    }
  }
);



// create jobs from the booking form
router.post("/", auth, allowRoles("admin", "supervisor"), createBooking);

// Reassign a recurring job and propagate to future occurrences
router.post(
  "/:jobId/assign-recurring",
  auth,
  allowRoles("admin", "supervisor"),
  async (req, res) => {
    const { jobId } = req.params;
    const { supervisorId, technicianIds } = req.body;
    const created_by_user_id = req.user?.id;

    if (!isValidJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    if (!supervisorId) {
      return res.status(400).json({ error: "Supervisor is required" });
    }

    const normalizedTechIds = Array.isArray(technicianIds)
      ? technicianIds.map(id => Number(id)).filter(Boolean)
      : [];
    const teamJson = JSON.stringify(normalizedTechIds);

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[job]] = await connection.query(
        "SELECT id, booking_id, start_date, status, supervisor_id FROM jobs WHERE id = ? FOR UPDATE",
        [jobId]
      );

      if (!job) {
        await connection.rollback();
        return res.status(404).json({ error: "Job not found" });
      }

      if (req.user.role === "supervisor") {
        const currentSupervisorId = job.supervisor_id ? Number(job.supervisor_id) : null;
        if (currentSupervisorId && currentSupervisorId !== Number(req.user.id)) {
          await connection.rollback();
          return res.status(403).json({ error: "Not allowed to reassign this job" });
        }
      }

      if (job.status === "CREATED") {
        await connection.query(
          `UPDATE jobs
           SET status = 'NOT_STARTED',
               supervisor_id = ?,
               team = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [supervisorId, teamJson, jobId]
        );
      } else {
        await connection.query(
          `UPDATE jobs
           SET supervisor_id = ?,
               team = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [supervisorId, teamJson, jobId]
        );
      }

      // Update recurring rule defaults for future occurrences
      if (job.booking_id) {
        await connection.query(
          `UPDATE recurring_rules
           SET supervisor_id = ?, team = ?
           WHERE booking_id = ?`,
          [supervisorId, teamJson, job.booking_id]
        );
      }

      // Propagate to future jobs only
      const updatedFuture = await updateFutureRecurringJobs(
        connection,
        job.booking_id,
        job.start_date,
        supervisorId,
        teamJson
      );

      await connection.query(
        `INSERT INTO job_history
         (id, job_id, action, message, metadata, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuid(),
          jobId,
          "ASSIGNED",
          "Recurring assignment updated",
          JSON.stringify({
            supervisorId,
            technicianIds: normalizedTechIds,
            propagatedToFuture: updatedFuture
          }),
          created_by_user_id,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        updated_future_jobs: updatedFuture,
      });
    } catch (err) {
      await connection.rollback();
      console.error("Recurring assignment failed:", err);
      res.status(500).json({ error: "Failed to update recurring assignment" });
    } finally {
      connection.release();
    }
  }
);

// Reassign a job with scope (current, range, future)
router.post(
  "/:jobId/reassign",
  auth,
  allowRoles("admin", "supervisor"),
  async (req, res) => {
    const { jobId } = req.params;
    const { supervisorId, technicianIds, scope, rangeStart, rangeEnd } = req.body;
    const created_by_user_id = req.user?.id;

    if (!isValidJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    if (!supervisorId) {
      return res.status(400).json({ error: "Supervisor is required" });
    }

    const normalizedTechIds = Array.isArray(technicianIds)
      ? technicianIds.map(id => Number(id)).filter(Boolean)
      : [];
    const teamJson = JSON.stringify(normalizedTechIds);

    const selectedScope = scope || "current";
    const allowedScopes = new Set(["current", "range", "future"]);
    if (!allowedScopes.has(selectedScope)) {
      return res.status(400).json({ error: "Invalid scope" });
    }

    if (selectedScope === "range") {
      if (!rangeStart || !rangeEnd) {
        return res.status(400).json({ error: "rangeStart and rangeEnd are required" });
      }
      if (new Date(rangeEnd) < new Date(rangeStart)) {
        return res.status(400).json({ error: "rangeEnd cannot be before rangeStart" });
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[job]] = await connection.query(
        "SELECT id, booking_id, start_date, status, supervisor_id FROM jobs WHERE id = ? FOR UPDATE",
        [jobId]
      );

      if (!job) {
        await connection.rollback();
        return res.status(404).json({ error: "Job not found" });
      }

      if (req.user.role === "supervisor") {
        const currentSupervisorId = job.supervisor_id ? Number(job.supervisor_id) : null;
        if (currentSupervisorId && currentSupervisorId !== Number(req.user.id)) {
          await connection.rollback();
          return res.status(403).json({ error: "Not allowed to reassign this job" });
        }
      }

      if ((selectedScope === "range" || selectedScope === "future") && !job.booking_id) {
        await connection.rollback();
        return res.status(400).json({ error: "Job is not part of a recurring series" });
      }

      if ((selectedScope === "range" || selectedScope === "future") && !job.start_date) {
        await connection.rollback();
        return res.status(400).json({ error: "Job start_date is required for range/future scope" });
      }

      let updatedCount = 0;

      if (selectedScope === "current") {
        await connection.query(
          `UPDATE jobs
           SET status = IF(status = 'CREATED', 'NOT_STARTED', status),
               supervisor_id = ?,
               team = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [supervisorId, teamJson, jobId]
        );
        updatedCount = 1;
      } else if (selectedScope === "range") {
        const effectiveStart = new Date(rangeStart) < new Date(job.start_date)
          ? job.start_date
          : rangeStart;
        updatedCount = await updateRangeRecurringJobs(
          connection,
          job.booking_id,
          effectiveStart,
          rangeEnd,
          supervisorId,
          teamJson
        );
      } else if (selectedScope === "future") {
        updatedCount = await updateFutureRecurringJobs(
          connection,
          job.booking_id,
          job.start_date,
          supervisorId,
          teamJson
        );
      }

      if (job.booking_id) {
        await connection.query(
          `UPDATE recurring_rules
           SET supervisor_id = ?, team = ?
           WHERE booking_id = ?`,
          [supervisorId, teamJson, job.booking_id]
        );
      }

      await connection.query(
        `INSERT INTO job_history
         (id, job_id, action, message, metadata, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuid(),
          jobId,
          "ASSIGNED",
          "Assignment updated via scope",
          JSON.stringify({
            scope: selectedScope,
            supervisorId,
            technicianIds: normalizedTechIds,
            updatedCount
          }),
          created_by_user_id,
        ]
      );

      await connection.commit();
      res.json({ success: true, updatedCount });
    } catch (err) {
      await connection.rollback();
      console.error("Scoped reassignment failed:", err);
      res.status(500).json({ error: "Failed to update assignment" });
    } finally {
      connection.release();
    }
  }
);


// POST /api/jobs/assign
router.post("/assign", auth, allowRoles("admin", "supervisor"), async (req, res) => {
  const { jobIds, supervisorId, technicianIds, scope, rangeStart, rangeEnd } = req.body;
  const created_by_user_id = req.user?.id;

  if (!jobIds?.length) {
    return res.status(400).json({ error: "No jobs selected" });
  }

  if (!supervisorId) {
    return res.status(400).json({ error: "Supervisor is required" });
  }

  const connection = await pool.getConnection();

  if (scope) {
    const selectedScope = scope;
    const allowedScopes = new Set(["current", "range", "future"]);
    if (!allowedScopes.has(selectedScope)) {
      return res.status(400).json({ error: "Invalid scope" });
    }

    if (jobIds?.length !== 1) {
      return res.status(400).json({ error: "Scoped reassignment requires a single jobId" });
    }

    if (selectedScope === "range") {
      if (!rangeStart || !rangeEnd) {
        return res.status(400).json({ error: "rangeStart and rangeEnd are required" });
      }
      if (new Date(rangeEnd) < new Date(rangeStart)) {
        return res.status(400).json({ error: "rangeEnd cannot be before rangeStart" });
      }
    }

    const normalizedTechIds = Array.isArray(technicianIds)
      ? technicianIds.map(id => Number(id)).filter(Boolean)
      : [];
    const teamJson = JSON.stringify(normalizedTechIds);

    try {
      await connection.beginTransaction();

      const [[job]] = await connection.query(
        "SELECT id, booking_id, start_date, status, supervisor_id FROM jobs WHERE id = ? FOR UPDATE",
        [jobIds[0]]
      );

      if (!job) {
        await connection.rollback();
        return res.status(404).json({ error: "Job not found" });
      }

      if (req.user.role === "supervisor") {
        const currentSupervisorId = job.supervisor_id ? Number(job.supervisor_id) : null;
        if (currentSupervisorId && currentSupervisorId !== Number(req.user.id)) {
          await connection.rollback();
          return res.status(403).json({ error: "Not allowed to reassign this job" });
        }
      }

      if ((selectedScope === "range" || selectedScope === "future") && !job.booking_id) {
        await connection.rollback();
        return res.status(400).json({ error: "Job is not part of a recurring series" });
      }

      if ((selectedScope === "range" || selectedScope === "future") && !job.start_date) {
        await connection.rollback();
        return res.status(400).json({ error: "Job start_date is required for range/future scope" });
      }

      if (selectedScope === "range" && new Date(rangeEnd) < new Date(job.start_date)) {
        await connection.rollback();
        return res.status(400).json({ error: "rangeEnd cannot be before current job date" });
      }

      let updatedCount = 0;

      if (selectedScope === "current") {
        await connection.query(
          `UPDATE jobs
           SET status = IF(status = 'CREATED', 'NOT_STARTED', status),
               supervisor_id = ?,
               team = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [supervisorId, teamJson, job.id]
        );
        updatedCount = 1;
      } else if (selectedScope === "range") {
        const effectiveStart = new Date(rangeStart) < new Date(job.start_date)
          ? job.start_date
          : rangeStart;
        updatedCount = await updateRangeRecurringJobs(
          connection,
          job.booking_id,
          effectiveStart,
          rangeEnd,
          supervisorId,
          teamJson
        );
      } else if (selectedScope === "future") {
        updatedCount = await updateFutureRecurringJobs(
          connection,
          job.booking_id,
          job.start_date,
          supervisorId,
          teamJson
        );
      }

      if (job.booking_id) {
        await connection.query(
          `UPDATE recurring_rules
           SET supervisor_id = ?, team = ?
           WHERE booking_id = ?`,
          [supervisorId, teamJson, job.booking_id]
        );
      }

      await connection.query(
        `INSERT INTO job_history
         (id, job_id, action, message, metadata, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuid(),
          job.id,
          "ASSIGNED",
          "Assignment updated via scope",
          JSON.stringify({
            scope: selectedScope,
            supervisorId,
            technicianIds: normalizedTechIds,
            updatedCount
          }),
          created_by_user_id,
        ]
      );

      await connection.commit();
      return res.json({ success: true, updatedCount });
    } catch (err) {
      await connection.rollback();
      console.error("Scoped assignment failed:", err);
      return res.status(500).json({ error: "Failed to assign jobs" });
    } finally {
      connection.release();
    }
  }

  try {
    await connection.beginTransaction();

    // 1️⃣ New supervisor name
    const [[newSup]] = await connection.query(
      "SELECT name FROM users WHERE id = ?",
      [supervisorId]
    );
    const newSupervisorName = newSup?.name || "Unknown";


    // 2️⃣ Technician name lookup (NEW)
    let technicianNames = [];
    let normalizedTechIds = [];

    if (technicianIds?.length) {
      normalizedTechIds = technicianIds.map(id => Number(id)).filter(Boolean);

      const placeholders = normalizedTechIds.map(() => "?").join(",");
      const [techRows] = await connection.query(
        `SELECT id, name FROM users WHERE id IN (${placeholders})`,
        normalizedTechIds
      );

      technicianNames = techRows.map(t => t.name);
    }

    for (const jobId of jobIds) {

      // current job
      const [[job]] = await connection.query(
        "SELECT supervisor_id, status, booking_id FROM jobs WHERE id = ?",
        [jobId]
      );

      if (!job) continue;

      const oldSupervisorId = job.supervisor_id;

      // old supervisor name
      let oldSupervisorName = "Unassigned";
      if (oldSupervisorId) {
        const [[oldSup]] = await connection.query(
          "SELECT name FROM users WHERE id = ?",
          [oldSupervisorId]
        );
        oldSupervisorName = oldSup?.name || "Unassigned";
      }


      // 3️⃣ Update job
      if (job.status === "CREATED") {
        // promote job to operational
        await connection.query(
          `UPDATE jobs
     SET status = 'NOT_STARTED',
         supervisor_id = ?,
         team = ?,
         updated_at = NOW()
     WHERE id = ?`,
          [supervisorId, JSON.stringify(normalizedTechIds), jobId]
        );
      } else {
        // reassignment should not reset progress
        await connection.query(
          `UPDATE jobs
     SET supervisor_id = ?,
         team = ?,
         updated_at = NOW()
     WHERE id = ?`,
          [supervisorId, JSON.stringify(normalizedTechIds), jobId]
        );
      }

      if (job.booking_id) {
        await connection.query(
          `UPDATE recurring_rules
           SET supervisor_id = ?, team = ?
           WHERE booking_id = ?`,
          [supervisorId, JSON.stringify(normalizedTechIds), job.booking_id]
        );
      }



      // 4️⃣ Build readable message (NEW)
      let message = `Supervisor changed from ${oldSupervisorName} to ${newSupervisorName}`;

      if (technicianNames.length > 0) {
        message += ` | Team: ${technicianNames.join(", ")}`;
      } else {
        message += ` | Team cleared`;
      }


      // 5️⃣ History entry
      await connection.query(
        `INSERT INTO job_history
        (id, job_id, action, message, metadata, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          uuid(),
          jobId,
          "ASSIGNED",
          message,
          JSON.stringify({
            oldSupervisorId,
            newSupervisorId: supervisorId,
            technicianIds: normalizedTechIds,
            technicianNames: technicianNames
          }),
          created_by_user_id,
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      updatedJobIds: jobIds,
    });

  } catch (err) {
    await connection.rollback();
    console.error("Assign failed:", err);
    res.status(500).json({ error: "Failed to assign jobs" });
  } finally {
    connection.release();
  }
});



// ADD attachments Meta Data
router.post("/:jobId/attachments", auth, async (req, res) => {

  const { jobId } = req.params;
  const {
    history_id,
    type,
    file_name,
    file_type,
    file_url,
    object_key,
  } = req.body;

  if (!history_id || !type) {
    return res.status(400).json({
      error: "history_id and type are required",
    });
  }

  const connection = await pool.getConnection();

  try {
    if (!(await ensureJobAccess(req, res, connection, jobId))) return;

    // 1️⃣ Validate history + job relationship in ONE query
    const [[history]] = await connection.query(
      `
      SELECT id, job_id
      FROM job_history
      WHERE id = ? AND job_id = ?
      `,
      [history_id, jobId]
    );

    if (!history) {
      return res.status(404).json({
        error: "History not found for this job",
      });
    }

    const attachmentId = uuid();

    // 2️⃣ Insert attachment
    await connection.query(
      `
      INSERT INTO job_attachments (
        id,
        job_id,
        history_id,
        type,
        object_key,
        file_name,
        file_type,
        file_url,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        attachmentId,
        jobId,
        history_id,
        type,
        object_key || null,
        file_name || null,
        file_type || null,
        file_url || null,
      ]
    );

    res.json({
      success: true,
      attachment: {
        id: attachmentId,
        job_id: jobId,
        history_id,
        type,
        object_key: object_key || null,
        file_name: file_name || null,
        file_type: file_type || null,
        file_url: file_url || null,
      },
    });
  } catch (err) {
    console.error("Failed to add attachment:", err);
    res.status(500).json({
      error: "Failed to add attachment",
      details: err.message,
      code: err.code
    });
  } finally {
    connection.release();
  }
});

// GET attachments for a job
router.get("/:jobId/attachments", auth, async (req, res) => {
  const { jobId } = req.params;

  try {
    if (!(await ensureJobAccess(req, res, pool, jobId))) return;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        job_id,
        history_id,
        type,
        object_key,
        file_name,
        file_type,
        file_url,
        created_at
      FROM job_attachments
      WHERE job_id = ?
      ORDER BY created_at ASC
      `,
      [jobId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch attachments:", err);
    res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

//upload attachments to Minio directly from backend
router.post("/:jobId/attachments/upload",
  auth,
  upload.single("file"),
  async (req, res) => {
    const { jobId } = req.params;
    const { history_id, type } = req.body;
    const file = req.file;

    if (!file || !history_id || !type) {
      return res.status(400).json({
        error: "file, history_id and type are required",
      });
    }

    const connection = await pool.getConnection();

    try {
      if (!(await ensureJobAccess(req, res, connection, jobId))) return;

      // 1️⃣ Validate history belongs to job
      const [[history]] = await connection.query(
        `
        SELECT id FROM job_history
        WHERE id = ? AND job_id = ?
        `,
        [history_id, jobId]
      );

      if (!history) {
        return res.status(404).json({
          error: "History not found for this job",
        });
      }

      // 2️⃣ Generate object key
      const ext = file.originalname.split(".").pop();
      const objectKey = `jobs/${jobId}/${history_id}/${uuid()}.${ext}`;

      // 3️⃣ Upload to MinIO
      await minioClient.putObject(
        process.env.MINIO_BUCKET,
        objectKey,
        file.buffer,
        file.size,
        {
          "Content-Type": file.mimetype,
        }
      );

      // 4️⃣ Insert DB row ONLY after upload
      const attachmentId = uuid();

      await connection.query(
        `
        INSERT INTO job_attachments (
          id,
          job_id,
          history_id,
          type,
          object_key,
          file_name,
          file_type,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          attachmentId,
          jobId,
          history_id,
          type,
          objectKey,
          file.originalname,
          file.mimetype,
        ]
      );

      res.json({
        success: true,
        attachment: {
          id: attachmentId,
          job_id: jobId,
          history_id,
          type,
          object_key: objectKey,
          file_name: file.originalname,
          file_type: file.mimetype,
        },
      });
    } catch (err) {
      console.error("Upload failed:", err);
      res.status(500).json({
        error: "Upload failed",
      });
    } finally {
      connection.release();
    }
  }
);

// --------------------------------------------------
// CLIENT → My Jobs
// --------------------------------------------------
router.get(
  "/client/my-jobs",
  auth,
  allowRoles("client"),
  async (req, res) => {
    try {

      console.log("JWT USER →", req.user);

      const userId = req.user.id;

      // get contact_id from users table
      const [[user]] = await pool.query(
        `SELECT contact_id FROM users WHERE id = ?`,
        [userId]
      );

      if (!user || !user.contact_id) {
        return res.status(400).json({
          error: "Client contact mapping not found"
        });
      }

      const contactId = user.contact_id;

      const [rows] = await pool.query(
        `
        SELECT
          j.id,
          j.code,
          j.service_type,
          j.sub_service,
          j.status,
          j.approval_status,
          j.start_date,
          j.created_at,
          j.address,

          u.name AS supervisor_name

        FROM jobs j
        LEFT JOIN users u
          ON j.supervisor_id = u.id

        WHERE j.requested_by_contact_id = ?
        ORDER BY j.created_at DESC
        `,
        [contactId]
      );

      res.json(rows);

    } catch (err) {
      console.error("Client jobs error:", err);
      res.status(500).json({ error: "Failed to fetch client jobs" });
    }
  }
);



module.exports = router;


