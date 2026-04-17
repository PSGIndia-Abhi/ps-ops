const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { normalizeRecurrenceInput, generateRecurringJobsForBooking } = require("../services/recurring.service");
const { notifyJobCreated } = require("../services/notifications.service");

async function getUserBranchId(connection, userId) {
  if (!userId) return null;
  const [[row]] = await connection.query(
    "SELECT branch_id FROM users WHERE id = ?",
    [userId]
  );
  return row?.branch_id || null;
}

async function ensureBranchExists(connection, branchId) {
  if (!branchId) return false;
  const [[row]] = await connection.query(
    "SELECT id FROM branches WHERE id = ?",
    [branchId]
  );
  return !!row;
}

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function createBooking(req, res) {
  const {
    subServices,
    client,
    start_date: requestStart,
    end_date: requestEnd,
    recurrence,
    address,
    location,
    serviceSchedules,
    service_schedules,
  } = req.body;

  const scheduleMap = serviceSchedules || service_schedules || null;
  let start_date = requestStart || null;
  let end_date = requestEnd || null;

  const created_by_user_id = req.user?.id;

  let supervisorId = null;
  let technicianId = null;

  // role handling
  if (req.user.role === "supervisor") {
    supervisorId = req.user.id;
  } else if (req.user.role === "client") {
    supervisorId = null;
    technicianId = null;
  } else {
    // admin flow
    supervisorId = req.body.supervisor_id || null;
    technicianId = req.body.technician_id || null;
  }

  // validation
  if (!subServices?.length) {
    return res.status(400).json({ error: "No services selected" });
  }

  if (scheduleMap) {
    let earliest = null;
    let latest = null;

    for (const service of subServices) {
      const schedule = scheduleMap[service] || {};
      const scheduleType =
        schedule.scheduleType || schedule.schedule_type || (schedule.end_date ? "range" : "single");
      const serviceStart = schedule.start_date || null;
      const serviceEnd = scheduleType === "range" ? schedule.end_date || null : null;

      if (!serviceStart) {
        return res
          .status(400)
          .json({ error: `Start date is required for ${service}` });
      }

      if (scheduleType === "range") {
        if (!serviceEnd) {
          return res
            .status(400)
            .json({ error: `End date is required for ${service}` });
        }
        const start = new Date(`${serviceStart}T00:00:00`);
        const end = new Date(`${serviceEnd}T00:00:00`);
        if (end < start) {
          return res.status(400).json({
            error: `End date cannot be before start date for ${service}`,
          });
        }
      }

      const startObj = new Date(`${serviceStart}T00:00:00`);
      const endValue = serviceEnd || serviceStart;
      const endObj = new Date(`${endValue}T00:00:00`);

      if (!earliest || startObj < earliest.date) {
        earliest = { date: startObj, value: serviceStart };
      }
      if (!latest || endObj > latest.date) {
        latest = { date: endObj, value: endValue };
      }
    }

    if (!start_date && earliest) start_date = earliest.value;
    if (!end_date && latest) end_date = latest.value;
  }

  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (end < start) {
      return res
        .status(400)
        .json({ error: "End date cannot be before start date" });
    }
  }

  if (!created_by_user_id) {
    return res.status(401).json({ error: "Unauthorized user" });
  }

  let recurrenceRule = null;

  const jobAddress =
    typeof address === "string" && address.trim()
      ? address.trim()
      : typeof location === "string" && location.trim()
        ? location.trim()
        : null;

  // recurrence normalize
  if (recurrence) {
    const recurrenceEnd =
      recurrence.end_date || recurrence.endDate || req.body?.recurrence_end_date || null;
    if (!recurrenceEnd) {
      return res.status(400).json({
        error: "Recurring bookings require an end date",
      });
    }
    recurrence.end_date = recurrenceEnd;
    try {
      recurrenceRule = normalizeRecurrenceInput(recurrence, start_date);
    } catch (err) {
      return res.status(400).json({
        error: err.message || "Invalid recurrence",
      });
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let { contact_id } = client || {};
    const requestedBranchId = req.body?.branch_id || req.body?.branchId || null;
    const creatorBranchId = await getUserBranchId(connection, created_by_user_id);
    let jobBranchId = null;

    if (req.user.role === "client") {
      const [[userRow]] = await connection.query(
        `SELECT contact_id FROM users WHERE id = ?`,
        [req.user.id]
      );
      if (!userRow?.contact_id) {
        throw new Error("Client contact mapping not found");
      }
      contact_id = userRow.contact_id;
    }

    if (!contact_id) {
      throw new Error("requested_by_contact_id is required");
    }

    if (req.user.role !== "admin" && requestedBranchId && requestedBranchId !== creatorBranchId) {
      throw withStatus("Branch mismatch: cannot create jobs for another branch");
    }

    if (supervisorId) {
      jobBranchId = await getUserBranchId(connection, supervisorId);
      if (!jobBranchId) {
        throw withStatus("Assigned supervisor must belong to a branch");
      }
    }

    if (requestedBranchId && jobBranchId && requestedBranchId !== jobBranchId) {
      throw withStatus("Branch mismatch: supervisor and branch_id differ");
    }

    if (!jobBranchId) {
      jobBranchId = requestedBranchId || creatorBranchId;
    }

    if (!jobBranchId) {
      throw withStatus("Branch is required. Assign a supervisor or provide branch_id.");
    }

    const branchExists = await ensureBranchExists(connection, jobBranchId);
    if (!branchExists) {
      throw withStatus("Invalid branch");
    }

    if (technicianId) {
      const technicianBranchId = await getUserBranchId(connection, technicianId);
      if (!technicianBranchId || technicianBranchId !== jobBranchId) {
        throw withStatus("Technician must belong to the same branch");
      }
    }

    // 1) Fetch contact
    const [[contact]] = await connection.query(
      `SELECT id, company_id
       FROM contacts
       WHERE id = ?`,
      [contact_id]
    );

    if (!contact) {
      throw new Error("Invalid contact");
    }

    const jobCompanyId = contact.company_id || null;
    const serviceType = client?.serviceType || "BOTH";

    // 2) Resolve company code
    let companyCode = null;
    if (jobCompanyId) {
      const [[company]] = await connection.query(
        `
        SELECT co.code
        FROM sites s
        JOIN companies co ON co.id = s.company_id
        WHERE s.id = ?
        `,
        [jobCompanyId]
      );

      if (!company) {
        throw new Error("Invalid company");
      }

      companyCode = company.code;
    }

    // 3) Create booking
    const bookingId = uuid();
    const bookingCode = `B-${Date.now()}`;

    await connection.query(
      `INSERT INTO bookings
      (id, code, contact_id, company_id, service_type, sub_services, notes, created_by_user_id, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ACTIVE')`,
      [
        bookingId,
        bookingCode,
        contact.id,
        jobCompanyId,
        serviceType,
        JSON.stringify(subServices),
        client?.notes || null,
        created_by_user_id,
      ]
    );

    // recurrence rule
    if (recurrenceRule) {
      const rules = Array.isArray(recurrenceRule) ? recurrenceRule : [recurrenceRule];
      const teamJson = JSON.stringify(
        technicianId ? [Number(technicianId)].filter(Boolean) : []
      );
      for (const rule of rules) {
        await connection.query(
          `INSERT INTO recurring_rules
          (id, booking_id, supervisor_id, team, frequency, interval_value, scheduled_time,day_of_week, days_of_week, day_of_month, week_of_month, start_date, end_date, last_generated_until)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            uuid(),
            bookingId,
            supervisorId,
            teamJson,
            rule.frequency,
            rule.interval_value,
            rule.scheduled_time,
            rule.day_of_week,
            rule.days_of_week
              ? JSON.stringify(rule.days_of_week)
              : null,
            rule.day_of_month,
            rule.week_of_month || null,
            rule.start_date,
            rule.end_date,
          ]
        );
      }
    }

    // 4) Create jobs
    const createdJobs = [];

    for (const service of subServices) {
      const jobId = uuid();
      const schedule = scheduleMap ? scheduleMap[service] : null;
      const scheduleType = schedule
        ? schedule.scheduleType || schedule.schedule_type || (schedule.end_date ? "range" : "single")
        : null;
      const serviceStartDate = schedule?.start_date || start_date || null;
      const serviceEndDate =
        scheduleType === "range" ? schedule?.end_date || null : null;
      const initialStatus = supervisorId ? "NOT_STARTED" : "CREATED";

      // sequence lock
      const [[row]] = await connection.query(
        `SELECT value
         FROM sequences
         WHERE name = 'job_code'
         FOR UPDATE`
      );

      const nextValue = row.value + 1;

      await connection.query(
        `UPDATE sequences
         SET value = ?
         WHERE name = 'job_code'`,
        [nextValue]
      );

      // Job code logic
      const jobCode = companyCode
        ? `${companyCode} ${nextValue}`
        : `${new Date().getFullYear()}-${nextValue}`;

      await connection.query(
        `INSERT INTO jobs
        (id, code, booking_id, service_type, sub_service, status, supervisor_id, team, company_id, requested_by_contact_id, address, created_by_user_id, branch_id, approval_status, approved_at, start_date, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          jobId,
          jobCode,
          bookingId,
          serviceType,
          service,
          initialStatus,
          supervisorId,
          JSON.stringify([]),
          jobCompanyId,
          contact.id,
          jobAddress,
          created_by_user_id,
          jobBranchId,
          null,
          null,
          serviceStartDate,
          serviceEndDate,
        ]
      );

      // Create Visit #1 for this job
      const visitId = uuid();
      const serviceTime = schedule?.time || "00:00";
      const scheduledDateTime = `${serviceStartDate} ${serviceTime}:00`;
      await connection.query(
        `INSERT INTO job_visits
  (id, job_id, visit_number, scheduled_date, status, created_by_user_id, created_at, updated_at)
  VALUES (?, ?, 1, ?, 'SCHEDULED', ?, NOW(), NOW())`,
        [
          visitId,
          jobId,
          scheduledDateTime,
          created_by_user_id,
        ]
      );

      // attach technician if provided
      if (technicianId) {
        await connection.query(
          `INSERT INTO visit_technicians
    (id, visit_id, technician_id, created_at)
    VALUES (?, ?, ?, NOW())`,
          [
            uuid(),
            visitId,
            technicianId
          ]
        );
      }

      // history
      await connection.query(
        `INSERT INTO job_history
        (id, job_id, action, message, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())`,
        [uuid(), jobId, "CREATED", "Job created", created_by_user_id]
      );

      createdJobs.push({
        id: jobId,
        code: jobCode,
        booking_id: bookingId,
        service_type: serviceType,
        sub_service: service,
        status: "CREATED",
        supervisor_id: supervisorId,
        team: [],
        branch_id: jobBranchId,
        start_date: serviceStartDate,
        dueDate: serviceEndDate,
        address: jobAddress,
      });
    }

    await connection.commit();

    if (recurrenceRule) {
      try {
        await generateRecurringJobsForBooking(pool, bookingId, { lookaheadDays: 30 });
      } catch (err) {
        console.error("Failed to pre-generate recurring jobs:", err);
      }
    }

    res.json({
      success: true,
      jobs: createdJobs,
    });

    Promise.allSettled(
      createdJobs.map((job) =>
        notifyJobCreated({
          jobId: job.id,
          actorUserId: created_by_user_id,
        })
      )
    ).catch((notifyErr) => {
      console.error("Job creation notification failed:", notifyErr);
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error creating jobs:", err);
    res.status(err.status || 500).json({
      error: err.message || "Failed to create jobs",
    });
  } finally {
    connection.release();
  }
}

module.exports = { createBooking };
