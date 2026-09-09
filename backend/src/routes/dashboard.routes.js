const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");

// Parses "YYYY-MM-DD" into a local Date (NOT via `new Date(str)`, which
// treats a date-only string as UTC midnight and can roll the calendar date
// back a day once converted to local time in a negative-offset timezone).
function parseYMD(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Reads ?from=&to= off the Analysis tab's date filter, defaulting both to
// today (so the page's default view matches the original "today" framing
// before this filter existed) and guarding against an inverted range.
function parseDateRange(req) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const isValidDate = (v) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseYMD(v).getTime());

  const fromDate = isValidDate(req.query.from) ? req.query.from : todayStr;
  let toDate = isValidDate(req.query.to) ? req.query.to : todayStr;
  if (toDate < fromDate) toDate = fromDate;

  return { fromDate, toDate };
}

// Generates one bucket per calendar month between fromDate and toDate
// (inclusive), capped at `maxBuckets` (keeping the months closest to
// toDate if the range is wider than that).
function buildMonthBuckets(fromDate, toDate, maxBuckets = 12) {
  const start = parseYMD(fromDate);
  const end = parseYMD(toDate);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  const buckets = [];
  while (cursor <= endMonth && buckets.length <= maxBuckets) {
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      // MM/YYYY — matches the DD/MM/YYYY format used for every other date
      // on the Analysis dashboard (there's no day component at month
      // granularity). Only Monthly Service Summary displays this label;
      // the On-Time Completion Trend chart derives its own month labels
      // client-side from `key` instead.
      label: `${String(cursor.getMonth() + 1).padStart(2, "0")}/${cursor.getFullYear()}`,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return buckets.length > maxBuckets ? buckets.slice(-maxBuckets) : buckets;
}

// Generates one bucket per calendar day between fromDate and toDate
// (inclusive), capped at `maxBuckets` days from the start of the range.
function buildDayBuckets(fromDate, toDate, maxBuckets = 10) {
  const start = parseYMD(fromDate);
  const end = parseYMD(toDate);
  const buckets = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (cursor <= end && buckets.length < maxBuckets) {
    buckets.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      label: cursor.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return buckets;
}

// Shared role/branch/status/customer scope filter for the jobs-based
// analytics endpoints below. Deliberately does NOT include the date-range
// filter (from/to) — every endpoint applies that differently (a flat
// BETWEEN for the single-snapshot widgets, month/day bucket generation for
// the trend-style widgets), so it's built explicitly in each route instead
// of being baked in here.
async function buildJobScope(req) {
  // `extra` is just the AND-fragments (no leading WHERE), so it can be
  // embedded in a plain WHERE clause, a subquery, or a JOIN...ON clause
  // alike. `where` is the ready-to-use "WHERE 1=1 AND ... {extra}" form
  // used by the simpler single-table queries.
  let extra = "";
  const params = [];

  if (req.user.role === "supervisor") {
    extra += " AND j.supervisor_id = ?";
    params.push(req.user.id);
  }

  if (req.user.role === "technician") {
    extra += " AND JSON_CONTAINS(j.team, JSON_QUOTE(?))";
    params.push(String(req.user.id));
  }

  let branchId = null;
  if (req.user.role !== "admin") {
    const [[me]] = await pool.query(
      "SELECT branch_id FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!me?.branch_id) {
      return { forbidden: true };
    }
    branchId = me.branch_id;
    extra += " AND j.branch_id = ?";
    params.push(branchId);
  }

  // ---- Explicit filters from the Analysis tab's filter panel ----

  // Branch filter is admin-only — every other role is already locked to
  // their own branch above, so a branch filter from them would be
  // redundant (or, worse, a way to see another branch's data).
  if (req.user.role === "admin" && req.query.branchId) {
    extra += " AND j.branch_id = ?";
    params.push(req.query.branchId);
    branchId = req.query.branchId;
  }

  if (req.query.status) {
    extra += " AND j.status = ?";
    params.push(req.query.status);
  }

  // Customer filter: jobs.company_id actually points at sites.id, not
  // companies.id directly (see docs/Summary.md) — resolve through sites.
  if (req.query.companyId) {
    extra += " AND j.company_id IN (SELECT id FROM sites WHERE company_id = ?)";
    params.push(req.query.companyId);
  }

  const where = `WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0${extra}`;
  return { where, extra, params, branchId };
}

// Resolves the technician/supervisor ids on a batch of job rows (job.team
// is a JSON array of technician ids, not a normalized join table) into an
// "Employee" display string per row — shared by the Overdue Services
// preview (overdue-overview) and its full-list page (overdue-services).
async function resolveJobTeamNames(rows) {
  const teamIds = new Set();
  const supervisorIds = new Set();
  for (const row of rows) {
    let ids = [];
    if (Array.isArray(row.team)) ids = row.team;
    else if (typeof row.team === "string") {
      try { ids = JSON.parse(row.team); } catch { ids = []; }
    }
    ids.map(Number).filter(Boolean).forEach((id) => teamIds.add(id));
    if (row.supervisor_id) supervisorIds.add(Number(row.supervisor_id));
  }

  const allUserIds = Array.from(new Set([...teamIds, ...supervisorIds]));
  let userNameMap = new Map();
  if (allUserIds.length) {
    const [userRows] = await pool.query(
      `SELECT id, name FROM users WHERE id IN (${allUserIds.map(() => "?").join(",")})`,
      allUserIds
    );
    userNameMap = new Map(userRows.map((u) => [Number(u.id), u.name]));
  }

  return rows.map((row) => {
    let ids = [];
    if (Array.isArray(row.team)) ids = row.team;
    else if (typeof row.team === "string") {
      try { ids = JSON.parse(row.team); } catch { ids = []; }
    }
    const techNames = ids.map(Number).filter(Boolean)
      .map((id) => userNameMap.get(id))
      .filter(Boolean);

    const employee = techNames.length
      ? techNames.join(", ")
      : (row.supervisor_id ? userNameMap.get(Number(row.supervisor_id)) : null) || "Unassigned";

    return {
      jobId: row.job_id,
      companyName: row.company_name,
      siteName: row.site_name,
      service: row.sub_service,
      dueDate: row.due_date,
      employee,
      daysLate: Number(row.days_late) || 0,
    };
  });
}

// Maps a set of month buckets onto a monthly_rows query's results (keyed by
// "YYYY-MM"), filling in zeros for any month with no matching jobs — shared
// by the Monthly Service Summary preview (overdue-overview) and its full
// page (monthly-summary).
function buildMonthlySummaryRows(monthlyRows, monthBuckets) {
  const monthlyMap = new Map(monthlyRows.map((row) => [row.month_key, row]));
  return monthBuckets.map((bucket) => {
    const row = monthlyMap.get(bucket.key);
    const scheduled = row ? Number(row.scheduled) || 0 : 0;
    const completed = row ? Number(row.completed) || 0 : 0;
    const pending = row ? Number(row.pending) || 0 : 0;
    const overdue = row ? Number(row.overdue) || 0 : 0;
    const onTime = row ? Number(row.on_time) || 0 : 0;

    const completionPct = scheduled > 0
      ? Number(((completed / scheduled) * 100).toFixed(1))
      : 0;
    const onTimePct = completed > 0
      ? Number(((onTime / completed) * 100).toFixed(1))
      : 0;

    return {
      month: bucket.key,
      label: bucket.label,
      scheduled,
      completed,
      pending,
      overdue,
      completionPct,
      onTimePct,
    };
  });
}

// Hard cap applied to every "full list" endpoint below (the ones behind a
// dashboard card's "View All" link). This is an internal ops dashboard, not
// a bulk-export API — the destination pages fetch once and do their own
// sorting/searching/pagination over whatever comes back, the same
// fetch-once-then-filter-client-side pattern AdminCompanies/BookingsPage
// already use elsewhere in this app, rather than SQL-level pagination.
const FULL_LIST_CAP = 500;

router.get("/summary", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    let where = "WHERE 1=1 AND COALESCE(j.is_archived, 0) = 0";
    let params = [];



    if (req.user.role === "supervisor") {
      where += " AND j.supervisor_id = ?";
      params.push(req.user.id);
    }

    if (req.user.role === "technician") {
      where += " AND JSON_CONTAINS(j.team, JSON_QUOTE(?))";
      params.push(String(req.user.id));
    }

    let branchId = null;
    if (req.user.role !== "admin") {
      const [[me]] = await pool.query(
        "SELECT branch_id FROM users WHERE id = ?",
        [req.user.id]
      );
      if (!me?.branch_id) {
        return res.status(403).json({ error: "Branch not assigned" });
      }
      branchId = me.branch_id;
      where += " AND j.branch_id = ?";
      params.push(branchId);
    }

    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS total,

        SUM(j.status = 'CREATED')      AS created,
        SUM(j.status = 'ASSIGNED')     AS assigned,
        SUM(j.status = 'IN_PROGRESS')  AS in_progress,
        SUM(j.status = 'PAUSED')       AS paused,
        SUM(j.status = 'COMPLETED')    AS completed,
        SUM(j.status = 'CANCELLED')    AS cancelled,

        SUM(DATE(j.due_date) = CURDATE()) AS due_today,

        SUM(
          DATE(j.due_date) < CURDATE()
          AND j.status NOT IN ('COMPLETED','CANCELLED')
        ) AS overdue,

        SUM(DATE(j.due_date) > CURDATE()) AS upcoming,

        SUM(j.company_id IS NULL)     AS residential,
        SUM(j.company_id IS NOT NULL) AS corporate

      FROM jobs j
      ${where}
    `, params);

    const s = rows[0];

    let bookingCountQuery = `SELECT COUNT(*) AS total_bookings FROM bookings`;
    const bookingParams = [];
    if (branchId) {
      bookingCountQuery = `
        SELECT COUNT(DISTINCT b.id) AS total_bookings
        FROM bookings b
        JOIN jobs j ON j.booking_id = b.id
        WHERE j.branch_id = ?
      `;
      bookingParams.push(branchId);
    }

    const [[bookingCount]] = await pool.query(
      bookingCountQuery,
      bookingParams
    );

    res.json({
      total: s.total,

      status: {
        created: s.created,
        assigned: s.assigned,
        inProgress: s.in_progress,
        paused: s.paused,
        completed: s.completed,
        cancelled: s.cancelled
      },

      calendar: {
        today: s.due_today,
        overdue: s.overdue,
        upcoming: s.upcoming
      },

      customerType: {
        residential: s.residential,
        corporate: s.corporate
      },

      totalBookings: bookingCount.total_bookings
    });

  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

// =====================================================
// ANALYSIS TAB — TOP KPI TILES
// GET /api/dashboard/top-tiles?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=&status=&companyId=
//
// Scheduled | Completed | Pending | Overdue | Completion % | On-time %
//
// All six numbers are now scoped to the selected [from, to] date range
// (defaulting to "today" when neither is supplied, matching the original
// behavior). "Overdue" is evaluated against the real current moment
// (start_date < NOW()) rather than the review window, so it always means
// "of the jobs in this period, how many are overdue right now" — for the
// default today-only range that naturally reduces to "today's jobs whose
// time has already passed", the same definition the status donut already
// used. See docs/SQL.md for the pre-filter version of this endpoint.
// =====================================================
router.get("/top-tiles", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { where, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const [rows] = await pool.query(
      `
      SELECT
        COUNT(*) AS scheduled,

        SUM(j.status IN ('CREATED','NOT_STARTED')) AS pending,

        SUM(j.status = 'COMPLETED') AS completed,

        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED')) AS overdue,

        SUM(j.status = 'COMPLETED'
            AND j.completed_at IS NOT NULL
            AND DATE(j.completed_at) <= DATE(j.start_date)) AS on_time

      FROM jobs j
      ${where}
        AND DATE(j.start_date) BETWEEN ? AND ?
      `,
      [...params, fromDate, toDate]
    );

    const r = rows[0];
    const scheduled = Number(r.scheduled) || 0;
    const completed = Number(r.completed) || 0;
    const onTime = Number(r.on_time) || 0;

    const completionPct = scheduled > 0
      ? Number(((completed / scheduled) * 100).toFixed(1))
      : 0;

    const onTimePct = completed > 0
      ? Number(((onTime / completed) * 100).toFixed(1))
      : 0;

    res.json({
      scheduled,
      completed,
      pending: Number(r.pending) || 0,
      overdue: Number(r.overdue) || 0,
      completionPct,
      onTimePct,
      range: { from: fromDate, to: toDate },
    });

  } catch (err) {
    console.error("Dashboard top-tiles error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard top tiles" });
  }
});

// =====================================================
// ANALYSIS TAB — SERVICE PIPELINE / STATUS / CUSTOMER WIDGETS
// GET /api/dashboard/service-overview?from=&to=&branchId=&status=&companyId=
//
// Feeds four widgets below the top tiles:
//   Today's Service Pipeline, Today's Service Status (donut),
//   Customer Pending Services, Customers At Risk
//
// All scoped to the selected date range the same way as top-tiles above.
// Full query breakdown + definitions (pre-filter version): docs/SQL2.md
// =====================================================
router.get("/service-overview", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { where, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);
    const dateParams = [fromDate, toDate];

    // ---- 1. Pipeline stages + status breakdown (one pass) ----
    const [[p]] = await pool.query(
      `
      SELECT
        COUNT(*) AS scheduled,

        SUM(j.supervisor_id IS NOT NULL) AS assigned,

        SUM(j.status IN ('IN_PROGRESS','PAUSED','COMPLETED')) AS in_progress_or_beyond,

        SUM(j.status = 'COMPLETED') AS completed,

        SUM(j.status IN ('CREATED','NOT_STARTED')) AS pending,

        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED')) AS overdue,

        -- status donut: mutually exclusive buckets, always sum to 'scheduled'.
        -- "Overdue" here is defined identically to the pipeline's overdue
        -- above (any unfinished job whose start_date has passed) rather
        -- than the narrower "not-started-and-late" it used before — so a
        -- job that's IN_PROGRESS/PAUSED and running late is now counted as
        -- Overdue here too, not silently left under "In Progress". In
        -- Progress/Pending are narrowed to "...and NOT already overdue" so
        -- every job still lands in exactly one bucket.
        SUM(j.status NOT IN ('COMPLETED','CANCELED')
            AND j.start_date < NOW()) AS status_overdue,

        SUM(j.status IN ('IN_PROGRESS','PAUSED')
            AND j.start_date >= NOW()) AS status_in_progress,

        SUM(j.status IN ('CREATED','NOT_STARTED')
            AND j.start_date >= NOW()) AS status_pending,

        SUM(j.status = 'CANCELED') AS status_cancelled

      FROM jobs j
      ${where}
        AND DATE(j.start_date) BETWEEN ? AND ?
      `,
      [...params, ...dateParams]
    );

    const pipeline = {
      scheduled: Number(p.scheduled) || 0,
      assigned: Number(p.assigned) || 0,
      inProgress: Number(p.in_progress_or_beyond) || 0,
      completed: Number(p.completed) || 0,
      pending: Number(p.pending) || 0,
      overdue: Number(p.overdue) || 0,
    };

    const statusBreakdown = {
      completed: Number(p.completed) || 0,
      inProgress: Number(p.status_in_progress) || 0,
      pending: Number(p.status_pending) || 0,
      overdue: Number(p.status_overdue) || 0,
      cancelled: Number(p.status_cancelled) || 0,
      total: Number(p.scheduled) || 0,
    };

    // ---- 2. Customer Pending Services (top 5, soonest/most-overdue first) ----
    const [pendingRows] = await pool.query(
      `
      SELECT
        co.id   AS company_id,
        co.name AS company_name,
        COUNT(*) AS pending_count,
        MIN(j.start_date) AS oldest_due
      FROM jobs j
      JOIN sites s     ON j.company_id = s.id
      JOIN companies co ON s.company_id = co.id
      ${where}
        AND DATE(j.start_date) BETWEEN ? AND ?
        AND j.status NOT IN ('COMPLETED','CANCELED')
      GROUP BY co.id, co.name
      ORDER BY oldest_due ASC
      LIMIT 5
      `,
      [...params, ...dateParams]
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const customerPendingServices = pendingRows.map((row) => {
      const dueDateStr = row.oldest_due
        ? new Date(row.oldest_due).toISOString().slice(0, 10)
        : null;

      let status = "Upcoming";
      if (dueDateStr && dueDateStr < todayStr) status = "Overdue";
      else if (dueDateStr === todayStr) status = "Pending";

      return {
        companyId: row.company_id,
        companyName: row.company_name,
        pending: Number(row.pending_count) || 0,
        oldestDue: row.oldest_due,
        status,
      };
    });

    // ---- 3. Customers At Risk ----
    const [[risk]] = await pool.query(
      `
      SELECT COUNT(*) AS at_risk_count
      FROM (
        SELECT
          co.id,
          SUM(j.status NOT IN ('COMPLETED','CANCELED')
              AND j.start_date < NOW())                     AS overdue_count,
          SUM(j.status NOT IN ('COMPLETED','CANCELED'))      AS pending_count,
          SUM(j.status = 'COMPLETED'
              AND j.completed_at IS NOT NULL
              AND DATE(j.completed_at) > DATE(j.start_date)) AS late_completed_count
        FROM jobs j
        JOIN sites s     ON j.company_id = s.id
        JOIN companies co ON s.company_id = co.id
        ${where}
          AND DATE(j.start_date) BETWEEN ? AND ?
        GROUP BY co.id
      ) x
      WHERE x.overdue_count >= 1
         OR x.pending_count >= 2
         OR x.late_completed_count >= 2
      `,
      [...params, ...dateParams]
    );

    res.json({
      pipeline,
      statusBreakdown,
      customerPendingServices,
      customersAtRisk: {
        count: Number(risk?.at_risk_count) || 0,
      },
      range: { from: fromDate, to: toDate },
    });

  } catch (err) {
    console.error("Dashboard service-overview error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard service overview" });
  }
});

// =====================================================
// ANALYSIS TAB — TEAM / TREND / UPCOMING WIDGETS
// GET /api/dashboard/team-overview?from=&to=&branchId=&status=&companyId=
//
// Feeds four widgets below the service-overview row:
//   Employee Performance, On-Time Completion Trend,
//   Employee Workload, Upcoming Services
//
// Employee Performance/Workload are scoped to the selected date range.
// On-Time Completion Trend re-buckets by month across the selected range
// (capped at 12 months) instead of a fixed trailing 6. Upcoming Services
// re-buckets by day across the selected range (capped at 10 days) instead
// of a fixed "next 5 days from today".
// Full query breakdown + definitions (pre-filter version): docs/SQL3.md
// =====================================================
router.get("/team-overview", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params, branchId } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    // ---- 1. Employee Performance + Employee Workload (within range) ----
    const technicianBranchFilter = branchId ? " AND u.branch_id = ?" : "";
    const employeeParams = [
      ...params,
      fromDate, toDate,
      ...(branchId ? [branchId] : []),
    ];

    const [employeeRows] = await pool.query(
      `
      SELECT
        u.id   AS technician_id,
        u.name AS technician_name,

        SUM(j.id IS NOT NULL)                                             AS assigned,
        SUM(j.status = 'COMPLETED')                                       AS completed,
        SUM(j.status IN ('CREATED','NOT_STARTED'))                        AS pending,
        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED'))                 AS overdue,
        SUM(j.status = 'COMPLETED'
            AND j.completed_at IS NOT NULL
            AND DATE(j.completed_at) <= DATE(j.start_date))                AS on_time

      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN jobs j
        ON (
             JSON_CONTAINS(j.team, CAST(u.id AS JSON))
          OR JSON_CONTAINS(j.team, JSON_QUOTE(CAST(u.id AS CHAR)))
        )
        AND 1=1 AND COALESCE(j.is_archived, 0) = 0${extra}
        AND DATE(j.start_date) BETWEEN ? AND ?

      WHERE u.is_active = 1
        AND (LOWER(r.name) = 'technician' OR LOWER(u.role) = 'technician')
        ${technicianBranchFilter}

      GROUP BY u.id, u.name
      ORDER BY assigned DESC, u.name ASC
      LIMIT 5
      `,
      employeeParams
    );

    const employeePerformance = employeeRows.map((row) => {
      const completed = Number(row.completed) || 0;
      const onTime = Number(row.on_time) || 0;
      const onTimePct = completed > 0
        ? Number(((onTime / completed) * 100).toFixed(1))
        : 0;

      return {
        technicianId: row.technician_id,
        technicianName: row.technician_name,
        assigned: Number(row.assigned) || 0,
        completed,
        pending: Number(row.pending) || 0,
        overdue: Number(row.overdue) || 0,
        onTimePct,
      };
    });

    // ---- 2. On-Time Completion Trend (trailing 12 months ending at toDate) ----
    // Deliberately NOT bucketed from fromDate..toDate like the other
    // widgets — the Analysis tab's fromDate can be as narrow as "1st of
    // this month", which would leave this "trend" with a single month
    // bucket (no line to draw, just one dot). Anchored at a fixed trailing
    // window ending at toDate instead, independent of fromDate, the same
    // way Upcoming Services is anchored at "today" regardless of fromDate.
    const trendMonthsBack = 12;
    const toDateForTrend = parseYMD(toDate);
    const trendWindowStartDate = new Date(
      toDateForTrend.getFullYear(),
      toDateForTrend.getMonth() - (trendMonthsBack - 1),
      1
    );
    const trendWindowStart = `${trendWindowStartDate.getFullYear()}-${String(trendWindowStartDate.getMonth() + 1).padStart(2, "0")}-01`;

    const monthBuckets = buildMonthBuckets(trendWindowStart, toDate, 60);
    const trendStart = `${monthBuckets[0].key}-01`;

    // Uses approved_at, not completed_at — the job-completion write path
    // (jobs.routes.js) sets approval_status/approved_at when a job is
    // marked COMPLETED but never sets completed_at, so completed_at is
    // NULL on every job in this database and on_time_count would always
    // be 0 if this used that column. approved_at is set in that same
    // UPDATE, so it's a reliable stand-in for "when this job was actually
    // completed" until that write path sets completed_at itself.
    const [trendRows] = await pool.query(
      `
      SELECT
        DATE_FORMAT(j.start_date, '%Y-%m') AS month_key,
        COUNT(*) AS completed_count,
        SUM(j.approved_at IS NOT NULL
            AND DATE(j.approved_at) <= DATE(j.start_date)) AS on_time_count
      FROM jobs j
      WHERE j.status = 'COMPLETED'
        AND COALESCE(j.is_archived, 0) = 0
        AND j.start_date >= ?
        AND DATE(j.start_date) <= ?${extra}
      GROUP BY month_key
      `,
      [trendStart, toDate, ...params]
    );

    const trendMap = new Map(trendRows.map((row) => [row.month_key, row]));
    const onTimeTrend = monthBuckets.map((bucket) => {
      const row = trendMap.get(bucket.key);
      const completedCount = row ? Number(row.completed_count) || 0 : 0;
      const onTimeCount = row ? Number(row.on_time_count) || 0 : 0;
      const onTimePct = completedCount > 0
        ? Number(((onTimeCount / completedCount) * 100).toFixed(1))
        : 0;

      return { month: bucket.key, label: bucket.label, onTimePct };
    });

    // ---- 3. Upcoming Services -> daily breakdown, today forward ----
    // Anchored at max(today, fromDate) rather than fromDate itself — the
    // Analysis tab's date filter can point entirely at the past (e.g. "this
    // month to date"), but "upcoming" always means today forward regardless
    // of that filter. Widened to a 30-day window (well past the ~5 the
    // dashboard card actually shows) so there's enough runway to find real
    // upcoming dates even when the near term is sparse; the card itself
    // filters out zero-count days and caps the count client-side.
    const todayForUpcoming = new Date().toISOString().slice(0, 10);
    const upcomingWindowStart = fromDate > todayForUpcoming ? fromDate : todayForUpcoming;
    const upcomingWindowEndDate = parseYMD(upcomingWindowStart);
    upcomingWindowEndDate.setDate(upcomingWindowEndDate.getDate() + 30);
    const upcomingWindowEnd = `${upcomingWindowEndDate.getFullYear()}-${String(upcomingWindowEndDate.getMonth() + 1).padStart(2, "0")}-${String(upcomingWindowEndDate.getDate()).padStart(2, "0")}`;

    const dayBuckets = buildDayBuckets(upcomingWindowStart, upcomingWindowEnd, 30);
    const dayRangeStart = dayBuckets[0]?.key || fromDate;
    const lastBucket = parseYMD(dayBuckets[dayBuckets.length - 1]?.key || toDate);
    const dayRangeEndExclusive = new Date(lastBucket.getFullYear(), lastBucket.getMonth(), lastBucket.getDate() + 1);
    const dayRangeEnd = `${dayRangeEndExclusive.getFullYear()}-${String(dayRangeEndExclusive.getMonth() + 1).padStart(2, "0")}-${String(dayRangeEndExclusive.getDate()).padStart(2, "0")}`;

    const [upcomingRows] = await pool.query(
      `
      SELECT DATE(j.start_date) AS service_date, COUNT(*) AS cnt
      FROM jobs j
      WHERE j.start_date >= ?
        AND j.start_date < ?
        AND COALESCE(j.is_archived, 0) = 0
        AND j.status <> 'CANCELED'${extra}
      GROUP BY service_date
      `,
      [dayRangeStart, dayRangeEnd, ...params]
    );

    const upcomingMap = new Map(
      upcomingRows.map((row) => [
        new Date(row.service_date).toISOString().slice(0, 10),
        Number(row.cnt) || 0,
      ])
    );
    const upcomingServices = dayBuckets.map((bucket) => ({
      date: bucket.key,
      label: bucket.label,
      count: upcomingMap.get(bucket.key) || 0,
    }));

    res.json({
      employeePerformance,
      onTimeTrend,
      upcomingServices,
      range: { from: fromDate, to: toDate },
    });

  } catch (err) {
    console.error("Dashboard team-overview error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard team overview" });
  }
});

// =====================================================
// ANALYSIS TAB — OVERDUE ACTION LIST / MONTHLY SUMMARY
// GET /api/dashboard/overdue-overview?from=&to=&branchId=&status=&companyId=
//
// Feeds two widgets below the team-overview row:
//   Overdue Services - Action Required, Monthly Service Summary
//
// The overdue list is now scoped to jobs whose start_date falls in the
// selected range (still requires start_date < NOW() to count as overdue).
// Monthly Service Summary re-buckets by month across the selected range
// (capped at 12 months) instead of a fixed trailing 6.
// Full query breakdown + definitions (pre-filter version): docs/SQL4.md
// =====================================================
router.get("/overdue-overview", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    // ---- 1. Overdue Services - Action Required (top 5, most overdue first) ----
    const [overdueRows] = await pool.query(
      `
      SELECT
        j.id AS job_id,
        co.name AS company_name,
        s.name  AS site_name,
        j.sub_service,
        j.supervisor_id,
        j.team,
        j.start_date AS due_date,
        DATEDIFF(CURDATE(), j.start_date) AS days_late
      FROM jobs j
      JOIN sites s      ON j.company_id = s.id
      JOIN companies co ON s.company_id = co.id
      WHERE COALESCE(j.is_archived, 0) = 0
        AND j.status NOT IN ('COMPLETED','CANCELED')
        AND j.start_date < NOW()
        AND DATE(j.start_date) BETWEEN ? AND ?${extra}
      ORDER BY j.start_date ASC
      LIMIT 5
      `,
      [fromDate, toDate, ...params]
    );

    const overdueServices = await resolveJobTeamNames(overdueRows);

    // ---- 2. Monthly Service Summary (months spanning the selected range) ----
    const monthBuckets = buildMonthBuckets(fromDate, toDate);
    const monthlyStart = `${monthBuckets[0].key}-01`;

    const [monthlyRows] = await pool.query(
      `
      SELECT
        DATE_FORMAT(j.start_date, '%Y-%m') AS month_key,
        COUNT(*) AS scheduled,
        SUM(j.status = 'COMPLETED')                                    AS completed,
        SUM(j.status IN ('CREATED','NOT_STARTED'))                      AS pending,
        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED'))               AS overdue,
        SUM(j.status = 'COMPLETED'
            AND j.completed_at IS NOT NULL
            AND DATE(j.completed_at) <= DATE(j.start_date))              AS on_time
      FROM jobs j
      WHERE COALESCE(j.is_archived, 0) = 0
        AND j.start_date >= ?
        AND DATE(j.start_date) <= ?${extra}
      GROUP BY month_key
      `,
      [monthlyStart, toDate, ...params]
    );

    const monthlySummary = buildMonthlySummaryRows(monthlyRows, monthBuckets);

    res.json({
      overdueServices,
      monthlySummary,
      range: { from: fromDate, to: toDate },
    });

  } catch (err) {
    console.error("Dashboard overdue-overview error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard overdue overview" });
  }
});

// =====================================================
// ANALYSIS TAB — "VIEW ALL" FULL-LIST PAGES
//
// Each dashboard card above only shows a short preview (top 5, or a
// 12-month window). These sibling endpoints back the destination page
// behind that card's "View All" / "View Full Report" / "View Calendar"
// link — same scope filters (role/branch/status/customer) and the same
// [from, to] date range, just without the preview's row cap. See
// FULL_LIST_CAP above for why that's a generous cap rather than true
// pagination.
// =====================================================

// GET /api/dashboard/pending-customers?from=&to=&branchId=&status=&companyId=
// Full list behind Customer Pending Services' "View All".
router.get("/pending-customers", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { where, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const [rows] = await pool.query(
      `
      SELECT
        co.id   AS company_id,
        co.name AS company_name,
        COUNT(*) AS pending_count,
        MIN(j.start_date) AS oldest_due
      FROM jobs j
      JOIN sites s     ON j.company_id = s.id
      JOIN companies co ON s.company_id = co.id
      ${where}
        AND DATE(j.start_date) BETWEEN ? AND ?
        AND j.status NOT IN ('COMPLETED','CANCELED')
      GROUP BY co.id, co.name
      ORDER BY oldest_due ASC
      LIMIT ${FULL_LIST_CAP}
      `,
      [...params, fromDate, toDate]
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const customerPendingServices = rows.map((row) => {
      const dueDateStr = row.oldest_due
        ? new Date(row.oldest_due).toISOString().slice(0, 10)
        : null;

      let status = "Upcoming";
      if (dueDateStr && dueDateStr < todayStr) status = "Overdue";
      else if (dueDateStr === todayStr) status = "Pending";

      return {
        companyId: row.company_id,
        companyName: row.company_name,
        pending: Number(row.pending_count) || 0,
        oldestDue: row.oldest_due,
        status,
      };
    });

    res.json({ rows: customerPendingServices, range: { from: fromDate, to: toDate } });
  } catch (err) {
    console.error("Dashboard pending-customers error:", err);
    res.status(500).json({ error: "Failed to fetch pending customers" });
  }
});

// GET /api/dashboard/at-risk-customers?from=&to=&branchId=&status=&companyId=
// Full list behind Customers At Risk's "View All" — the dashboard card only
// ever showed a count, so this is the first place the underlying companies
// are actually listed out.
router.get("/at-risk-customers", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { where, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const [rows] = await pool.query(
      `
      SELECT * FROM (
        SELECT
          co.id   AS company_id,
          co.name AS company_name,
          SUM(j.status NOT IN ('COMPLETED','CANCELED')
              AND j.start_date < NOW())                     AS overdue_count,
          SUM(j.status NOT IN ('COMPLETED','CANCELED'))      AS pending_count,
          SUM(j.status = 'COMPLETED'
              AND j.completed_at IS NOT NULL
              AND DATE(j.completed_at) > DATE(j.start_date)) AS late_completed_count
        FROM jobs j
        JOIN sites s     ON j.company_id = s.id
        JOIN companies co ON s.company_id = co.id
        ${where}
          AND DATE(j.start_date) BETWEEN ? AND ?
        GROUP BY co.id, co.name
      ) x
      WHERE x.overdue_count >= 1
         OR x.pending_count >= 2
         OR x.late_completed_count >= 2
      ORDER BY x.overdue_count DESC, x.pending_count DESC
      LIMIT ${FULL_LIST_CAP}
      `,
      [...params, fromDate, toDate]
    );

    const atRiskCustomers = rows.map((row) => {
      const overdueCount = Number(row.overdue_count) || 0;
      const pendingCount = Number(row.pending_count) || 0;
      const lateCompletedCount = Number(row.late_completed_count) || 0;
      const reasons = [];
      if (overdueCount >= 1) reasons.push("Overdue services exist");
      if (pendingCount >= 2) reasons.push("Multiple pending services");
      if (lateCompletedCount >= 2) reasons.push("Repeated late services");

      return {
        companyId: row.company_id,
        companyName: row.company_name,
        overdueCount,
        pendingCount,
        lateCompletedCount,
        reasons,
      };
    });

    res.json({ rows: atRiskCustomers, range: { from: fromDate, to: toDate } });
  } catch (err) {
    console.error("Dashboard at-risk-customers error:", err);
    res.status(500).json({ error: "Failed to fetch at-risk customers" });
  }
});

// GET /api/dashboard/employee-performance?from=&to=&branchId=&status=&companyId=
// Full list behind both Employee Performance's and Employee Workload's
// "View All" — same underlying rows, the two dashboard cards just sort
// them differently (worst on-time % first vs. highest workload first),
// which the destination page's own sortable columns cover either way.
router.get("/employee-performance", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params, branchId } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const technicianBranchFilter = branchId ? " AND u.branch_id = ?" : "";
    const employeeParams = [
      ...params,
      fromDate, toDate,
      ...(branchId ? [branchId] : []),
    ];

    const [employeeRows] = await pool.query(
      `
      SELECT
        u.id   AS technician_id,
        u.name AS technician_name,

        SUM(j.id IS NOT NULL)                                             AS assigned,
        SUM(j.status = 'COMPLETED')                                       AS completed,
        SUM(j.status IN ('CREATED','NOT_STARTED'))                        AS pending,
        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED'))                 AS overdue,
        SUM(j.status = 'COMPLETED'
            AND j.completed_at IS NOT NULL
            AND DATE(j.completed_at) <= DATE(j.start_date))                AS on_time

      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN jobs j
        ON (
             JSON_CONTAINS(j.team, CAST(u.id AS JSON))
          OR JSON_CONTAINS(j.team, JSON_QUOTE(CAST(u.id AS CHAR)))
        )
        AND 1=1 AND COALESCE(j.is_archived, 0) = 0${extra}
        AND DATE(j.start_date) BETWEEN ? AND ?

      WHERE u.is_active = 1
        AND (LOWER(r.name) = 'technician' OR LOWER(u.role) = 'technician')
        ${technicianBranchFilter}

      GROUP BY u.id, u.name
      ORDER BY assigned DESC, u.name ASC
      LIMIT ${FULL_LIST_CAP}
      `,
      employeeParams
    );

    const employeePerformance = employeeRows.map((row) => {
      const completed = Number(row.completed) || 0;
      const onTime = Number(row.on_time) || 0;
      const onTimePct = completed > 0
        ? Number(((onTime / completed) * 100).toFixed(1))
        : 0;

      return {
        technicianId: row.technician_id,
        technicianName: row.technician_name,
        assigned: Number(row.assigned) || 0,
        completed,
        pending: Number(row.pending) || 0,
        overdue: Number(row.overdue) || 0,
        onTimePct,
      };
    });

    res.json({ rows: employeePerformance, range: { from: fromDate, to: toDate } });
  } catch (err) {
    console.error("Dashboard employee-performance error:", err);
    res.status(500).json({ error: "Failed to fetch employee performance" });
  }
});

// GET /api/dashboard/overdue-services?from=&to=&branchId=&status=&companyId=
// Full list behind Overdue Services - Action Required's "View All".
router.get("/overdue-services", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const [overdueRows] = await pool.query(
      `
      SELECT
        j.id AS job_id,
        co.name AS company_name,
        s.name  AS site_name,
        j.sub_service,
        j.supervisor_id,
        j.team,
        j.start_date AS due_date,
        DATEDIFF(CURDATE(), j.start_date) AS days_late
      FROM jobs j
      JOIN sites s      ON j.company_id = s.id
      JOIN companies co ON s.company_id = co.id
      WHERE COALESCE(j.is_archived, 0) = 0
        AND j.status NOT IN ('COMPLETED','CANCELED')
        AND j.start_date < NOW()
        AND DATE(j.start_date) BETWEEN ? AND ?${extra}
      ORDER BY j.start_date ASC
      LIMIT ${FULL_LIST_CAP}
      `,
      [fromDate, toDate, ...params]
    );

    const overdueServices = await resolveJobTeamNames(overdueRows);

    res.json({ rows: overdueServices, range: { from: fromDate, to: toDate } });
  } catch (err) {
    console.error("Dashboard overdue-services error:", err);
    res.status(500).json({ error: "Failed to fetch overdue services" });
  }
});

// GET /api/dashboard/monthly-summary?from=&to=&branchId=&status=&companyId=
// Full list behind Monthly Service Summary's "View Full Report" — same
// bucketing as the preview, just a much wider cap (5 years vs. 12 months).
router.get("/monthly-summary", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params } = scope;
    const { fromDate, toDate } = parseDateRange(req);

    const monthBuckets = buildMonthBuckets(fromDate, toDate, 60);
    const monthlyStart = `${monthBuckets[0].key}-01`;

    const [monthlyRows] = await pool.query(
      `
      SELECT
        DATE_FORMAT(j.start_date, '%Y-%m') AS month_key,
        COUNT(*) AS scheduled,
        SUM(j.status = 'COMPLETED')                                    AS completed,
        SUM(j.status IN ('CREATED','NOT_STARTED'))                      AS pending,
        SUM(j.start_date < NOW()
            AND j.status NOT IN ('COMPLETED','CANCELED'))               AS overdue,
        SUM(j.status = 'COMPLETED'
            AND j.completed_at IS NOT NULL
            AND DATE(j.completed_at) <= DATE(j.start_date))              AS on_time
      FROM jobs j
      WHERE COALESCE(j.is_archived, 0) = 0
        AND j.start_date >= ?
        AND DATE(j.start_date) <= ?${extra}
      GROUP BY month_key
      `,
      [monthlyStart, toDate, ...params]
    );

    const monthlySummary = buildMonthlySummaryRows(monthlyRows, monthBuckets);

    res.json({ rows: monthlySummary, range: { from: fromDate, to: toDate } });
  } catch (err) {
    console.error("Dashboard monthly-summary error:", err);
    res.status(500).json({ error: "Failed to fetch monthly summary" });
  }
});

// GET /api/dashboard/upcoming-calendar?month=YYYY-MM&branchId=&status=&companyId=
// Backs Upcoming Services' "View Calendar" — a month grid, not a table, so
// this is keyed off its own `month` param (defaulting to the current
// month) rather than the Analysis tab's [from, to] range, which a calendar
// page browses past/away from on its own axis.
router.get("/upcoming-calendar", auth, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  try {
    const scope = await buildJobScope(req);
    if (scope.forbidden) {
      return res.status(403).json({ error: "Branch not assigned" });
    }
    const { extra, params } = scope;

    const monthParam = /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : new Date().toISOString().slice(0, 7);
    const [y, m] = monthParam.split("-").map(Number);
    const monthStart = `${monthParam}-01`;
    // m is 1-based (from the "YYYY-MM" string), so new Date(y, m, 1) is
    // already the first day of the *next* month — exactly the exclusive
    // upper bound this query needs.
    const nextMonth = new Date(y, m, 1);
    const monthEndExclusive = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const [rows] = await pool.query(
      `
      SELECT DATE(j.start_date) AS service_date, COUNT(*) AS cnt
      FROM jobs j
      WHERE j.start_date >= ?
        AND j.start_date < ?
        AND COALESCE(j.is_archived, 0) = 0
        AND j.status <> 'CANCELED'${extra}
      GROUP BY service_date
      `,
      [monthStart, monthEndExclusive, ...params]
    );

    const days = rows.map((row) => ({
      date: new Date(row.service_date).toISOString().slice(0, 10),
      count: Number(row.cnt) || 0,
    }));

    res.json({ month: monthParam, days });
  } catch (err) {
    console.error("Dashboard upcoming-calendar error:", err);
    res.status(500).json({ error: "Failed to fetch upcoming calendar" });
  }
});

module.exports = router;
