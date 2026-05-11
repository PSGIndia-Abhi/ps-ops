const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const {pool} = require("../../db");
const { createBooking } = require("../controllers/bookings.controller");
const { generateRecurringJobsForBooking } = require("../services/recurring.service");


/*
Admin → all bookings
Supervisor → only bookings created by them
*/

router.get("/", auth, requirePermission(PERMISSIONS.VIEW_BOOKING), async (req,res)=>{
  const userId = req.user.id;
  const role = req.user.role;
  const includeUnbooked = req.query.include_unbooked === "1";

  const connection = await pool.getConnection();

  try {
    let branchId = null;
    if (role !== "admin") {
      const [[me]] = await connection.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [userId]
      );
      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }
      branchId = me.branch_id;
    }

    // 1️⃣ get bookings
let bookingsQuery = `
 SELECT 
 b.id,
 b.code,
 b.contact_id,
 b.created_at,
 b.service_type,
  c.name as contact_name,
  c.phone as contact_phone,
  c.email as contact_email,
  s.id as company_id,
  co.name as company_name,
  co.code as company_code,
  co.type as company_type,
  s.name as company_site
FROM bookings b
LEFT JOIN contacts c ON c.id = b.contact_id
LEFT JOIN sites s ON s.id = b.company_id
LEFT JOIN companies co ON co.id = s.company_id
`;

if (role === "supervisor") {
  bookingsQuery += `
  WHERE EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.booking_id = b.id
    AND j.supervisor_id = ?
    AND j.branch_id = ?
  )`;
} else if (role === "branch_admin") {
  bookingsQuery += `
  WHERE EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.booking_id = b.id
    AND j.branch_id = ?
  )`;
}

bookingsQuery += ` ORDER BY b.created_at DESC`;

const [bookings] = await connection.query(
  bookingsQuery,
  role === "supervisor"
    ? [userId, branchId]
    : role === "branch_admin"
      ? [branchId]
      : []
);


    // 2️⃣ attach jobs to each booking
    for (let booking of bookings) {
      const [jobs] = await connection.query(
        `
        SELECT
          j.id,
          j.code,
          j.sub_service,
          j.status,
          j.start_date,
          j.company_id AS job_company_id,
          c.id AS job_contact_id,
          c.name AS job_contact_name,
          c.phone AS job_contact_phone,
          c.email AS job_contact_email,
          co.name AS job_company_name,
          co.code AS job_company_code,
          co.type AS job_company_type,
          s.name AS job_company_site
        FROM jobs j
        LEFT JOIN contacts c ON c.id = j.requested_by_contact_id
        LEFT JOIN sites s ON s.id = j.company_id
        LEFT JOIN companies co ON co.id = s.company_id
        WHERE j.booking_id = ?
        ${role === "admin" ? "" : "AND j.branch_id = ?"}
        ORDER BY j.created_at DESC`,
        role === "admin" ? [booking.id] : [booking.id, branchId]
      );

      booking.jobs = jobs.map(job => ({
        id: job.id,
        code: job.code,
        sub_service: job.sub_service,
        status: job.status,
        start_date: job.start_date,
        contact_id: job.job_contact_id || null,
        contact_name: job.job_contact_name || null,
        contact_phone: job.job_contact_phone || null,
        contact_email: job.job_contact_email || null,
        company_id: job.job_company_id || null,
        company_name: job.job_company_name || null,
        company_code: job.job_company_code || null,
        company_type: job.job_company_type || null,
        company_site: job.job_company_site || null,
      }));

      const fallbackJob = jobs.find(job => job.job_contact_id || job.job_company_code || job.job_company_name);
      if (fallbackJob) {
        booking.contact_name = booking.contact_name || fallbackJob.job_contact_name || null;
        booking.contact_phone = booking.contact_phone || fallbackJob.job_contact_phone || null;
        booking.contact_email = booking.contact_email || fallbackJob.job_contact_email || null;
        booking.company_name = booking.company_name || fallbackJob.job_company_name || null;
        booking.company_code = booking.company_code || fallbackJob.job_company_code || null;
        booking.company_type = booking.company_type || fallbackJob.job_company_type || null;
        booking.company_site = booking.company_site || fallbackJob.job_company_site || null;
      }
    }

    if (includeUnbooked) {
      let unbookedWhere = "WHERE j.booking_id IS NULL";
      let unbookedParams = [];

      if (role === "supervisor") {
        unbookedWhere += " AND j.supervisor_id = ?";
        unbookedParams.push(userId);
        unbookedWhere += " AND j.branch_id = ?";
        unbookedParams.push(branchId);
      } else if (role === "branch_admin") {
        unbookedWhere += " AND j.branch_id = ?";
        unbookedParams.push(branchId);
      }

      const [unbookedJobs] = await connection.query(
        `
        SELECT
          j.id,
          j.code,
          j.sub_service,
          j.status,
          j.start_date,
          j.created_at,
          j.requested_by_contact_id,
          c.name AS contact_name,
          c.phone AS contact_phone,
          c.email AS contact_email,
          co.name AS company_name,
          co.code AS company_code,
          co.type AS company_type,
          s.name AS company_site
        FROM jobs j
        LEFT JOIN contacts c ON c.id = j.requested_by_contact_id
        LEFT JOIN sites s ON s.id = j.company_id
        LEFT JOIN companies co ON co.id = s.company_id
        ${unbookedWhere}
        ORDER BY j.created_at DESC
        `,
        unbookedParams
      );

      const grouped = new Map();
      for (const job of unbookedJobs) {
        const contactKey = job.requested_by_contact_id || `unknown-${job.company_code || "residential"}`;
        if (!grouped.has(contactKey)) {
          grouped.set(contactKey, {
            id: `UNBOOKED-${contactKey}`,
            code: "UNBOOKED",
            created_at: job.created_at,
            service_type: null,
            contact_id: job.requested_by_contact_id || null,
            contact_name: job.contact_name || null,
            contact_phone: job.contact_phone || null,
            contact_email: job.contact_email || null,
            company_name: job.company_name || null,
            company_code: job.company_code || null,
            company_type: job.company_type || null,
            company_site: job.company_site || null,
            is_unbooked: true,
            jobs: [],
          });
        }

        const bucket = grouped.get(contactKey);
        bucket.jobs.push({
          id: job.id,
          code: job.code,
          sub_service: job.sub_service,
          status: job.status,
          start_date: job.start_date,
          contact_id: job.requested_by_contact_id || null,
          contact_name: job.contact_name || null,
          contact_phone: job.contact_phone || null,
          contact_email: job.contact_email || null,
          company_id: job.company_id || null,
          company_name: job.company_name || null,
          company_code: job.company_code || null,
          company_type: job.company_type || null,
          company_site: job.company_site || null,
        });
      }

      if (grouped.size > 0) {
        bookings.push(...Array.from(grouped.values()));
      }
    }

    res.json(bookings);

  } catch(err){
    console.error(err);
    res.status(500).json({error:"Failed to load bookings"});
  } finally {
    connection.release();
  }
});

// Create booking (optionally with recurrence)
router.post("/", auth, requirePermission(PERMISSIONS.CREATE_BOOKING), createBooking);

// Generate next 30 days of recurring jobs for a booking
router.post("/:bookingId/generate-jobs", auth, requirePermission(PERMISSIONS.CREATE_JOB), async (req, res) => {
  const { bookingId } = req.params;
  const lookaheadDays = Math.max(1, Number(req.body?.days || 30));

  const connection = await pool.getConnection();
  try {
    const role = req.user.role;
    let branchId = null;

    if (role !== "admin") {
      const [[me]] = await connection.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );
      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }
      branchId = me.branch_id;
    }

    if (role === "supervisor") {
      const [[row]] = await connection.query(
        `SELECT id FROM jobs WHERE booking_id = ? AND supervisor_id = ? AND branch_id = ? LIMIT 1`,
        [bookingId, req.user.id, branchId]
      );
      if (!row) {
        return res.status(403).json({ error: "Not authorized for this booking" });
      }
    } else if (role === "branch_admin") {
      const [[row]] = await connection.query(
        `SELECT id FROM jobs WHERE booking_id = ? AND branch_id = ? LIMIT 1`,
        [bookingId, branchId]
      );
      if (!row) {
        return res.status(403).json({ error: "Not authorized for this booking" });
      }
    }

    const [[ruleRow]] = await connection.query(
      `SELECT id FROM recurring_rules WHERE booking_id = ? LIMIT 1`,
      [bookingId]
    );
    if (!ruleRow) {
      return res.status(400).json({ error: "No recurring rule found for this booking" });
    }

    const result = await generateRecurringJobsForBooking(pool, bookingId, { lookaheadDays });
    res.json({
      success: true,
      created: result.created || 0,
      window_start: result.windowStart,
      window_end: result.windowEnd,
    });
  } catch (err) {
    console.error("Failed to generate recurring jobs:", err);
    res.status(500).json({ error: "Failed to generate recurring jobs" });
  } finally {
    connection.release();
  }
});

module.exports = router;
