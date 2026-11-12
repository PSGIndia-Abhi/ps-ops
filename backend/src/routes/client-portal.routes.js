// Client Portal API (/api/client-portal). Every route here is limited to the signed-in
// client's company and outlets via requireClientAccess (see services/clientPortal.service.js).

const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const minioClient = require("../lib/minio");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const { sendTicketCreatedEmail } = require("../utils/mailer");
const { requireClientAccess } = require("../services/clientPortal.service");

router.use(auth, requireClientAccess);

// GET /api/client-portal/me -> the user, their company(ies) and the outlets they can see
router.get("/me", async (req, res) => {
  try {
    const { companyIds, sites, isCompanyAdmin } = req.clientAccess;
    const [[user]] = await pool.query(
      "SELECT id, name, email, phone FROM users WHERE id = ?",
      [req.user.id]
    );
    const [companies] = await pool.query(
      `SELECT id, name, display_name, code, type, logo_object_key IS NOT NULL AS has_logo
       FROM companies WHERE id IN (${companyIds.map(() => "?").join(",")})`,
      companyIds
    );
    res.json({
      user,
      access: isCompanyAdmin ? "company" : "sites",
      companies: companies.map((c) => ({ ...c, has_logo: !!c.has_logo })),
      outlets: sites.map(({ branch_id, ...s }) => s),
    });
  } catch (err) {
    console.error("client-portal /me failed:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ---------- shared filter helpers ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// Outlet filter: ?site_id= must be one of the client's outlets; empty = all their outlets.
function resolveSites(req) {
  const { siteIds } = req.clientAccess;
  const requested = typeof req.query.site_id === "string" ? req.query.site_id.trim() : "";
  if (!requested) return { siteIds, singleSite: null };
  if (!siteIds.includes(requested)) {
    const err = new Error("Outlet not found");
    err.status = 404;
    throw err;
  }
  return { siteIds: [requested], singleSite: requested };
}

// Date filter: ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive). Default: last 30 days.
function resolveRange(req) {
  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 29);
  let from = DATE_RE.test(req.query.from || "") ? req.query.from : ymd(defFrom);
  let to = DATE_RE.test(req.query.to || "") ? req.query.to : ymd(today);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

const placeholders = (list) => list.map(() => "?").join(",");

// Invoice scope: a chosen outlet -> that outlet's invoices; company admin -> all company invoices
// (including ones without a site); outlet user -> only their outlets' invoices.
function invoiceScope(req, siteFilter) {
  const { companyIds, isCompanyAdmin, siteIds } = req.clientAccess;
  if (siteFilter.singleSite) return { sql: "i.site_id = ?", params: [siteFilter.singleSite] };
  if (isCompanyAdmin) return { sql: `i.customer_id IN (${placeholders(companyIds)})`, params: [...companyIds] };
  return { sql: `i.site_id IN (${placeholders(siteIds)})`, params: [...siteIds] };
}

const inRangeSql = (col) => `${col} >= ? AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`;

function isHighRisk(risk) {
  return ["HIGH", "CRITICAL"].includes(String(risk || "").toUpperCase());
}

function sendError(res, err, label) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`client-portal ${label} failed:`, err);
  return res.status(500).json({ error: `Failed to load ${label}` });
}

// Latest submitted audit per outlet. Clients never see audits that are still in progress.
async function latestAudits(siteIds) {
  if (!siteIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT a.site_id, a.audit_date, COALESCE(a.overall_risk_override, a.overall_risk) AS risk
     FROM audits a
     WHERE a.site_id IN (${placeholders(siteIds)}) AND a.status = 'SUBMITTED'
       AND a.audit_date = (SELECT MAX(a2.audit_date) FROM audits a2 WHERE a2.site_id = a.site_id AND a2.status = 'SUBMITTED')`,
    siteIds
  );
  return new Map(rows.map((r) => [r.site_id, r]));
}

// One summary row per outlet: jobs, visits, complaints, services and latest audit.
// `completed_jobs` counts jobs completed between from and to.
async function buildOutletSummaries(sites, siteIds, from, to) {
  if (!siteIds.length) return [];
  const sp = placeholders(siteIds);

  const [jobs] = await pool.query(
    `SELECT j.company_id AS site_id,
            COUNT(*) AS total_jobs,
            SUM(j.status IN ('NOT_STARTED','IN_PROGRESS')) AS active_jobs,
            SUM(j.status = 'COMPLETED' AND ${inRangeSql("j.completed_at")}) AS completed_jobs,
            GROUP_CONCAT(DISTINCT j.service_type ORDER BY j.service_type) AS services
     FROM jobs j
     WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
     GROUP BY j.company_id`,
    [from, to, ...siteIds]
  );
  const [visits] = await pool.query(
    `SELECT j.company_id AS site_id,
            MAX(CASE WHEN v.status = 'COMPLETED' THEN v.completed_at END) AS last_visit,
            MIN(CASE WHEN v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE() THEN v.scheduled_date END) AS next_visit
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
     GROUP BY j.company_id`,
    siteIds
  );
  const [complaints] = await pool.query(
    `SELECT COALESCE(t.site_id, j.company_id) AS site_id, COUNT(DISTINCT t.id) AS open_complaints
     FROM job_tickets t
     LEFT JOIN job_ticket_links l ON l.ticket_id = t.id
     LEFT JOIN jobs j ON j.id = l.job_id
     WHERE t.status IN ('OPEN','IN_PROGRESS') AND (t.site_id IN (${sp}) OR j.company_id IN (${sp}))
     GROUP BY COALESCE(t.site_id, j.company_id)`,
    [...siteIds, ...siteIds]
  );
  const audits = await latestAudits(siteIds);

  const byId = (rows) => new Map(rows.map((r) => [r.site_id, r]));
  const jobsMap = byId(jobs);
  const visitsMap = byId(visits);
  const complaintsMap = byId(complaints);

  return sites
    .filter((s) => siteIds.includes(s.id))
    .map((s) => {
      const j = jobsMap.get(s.id);
      return {
        id: s.id,
        name: s.name,
        city: s.city,
        address: s.address,
        total_jobs: Number(j?.total_jobs || 0),
        active_jobs: Number(j?.active_jobs || 0),
        completed_jobs: Number(j?.completed_jobs || 0),
        services: j?.services ? String(j.services).split(",").filter(Boolean) : [],
        last_visit: visitsMap.get(s.id)?.last_visit || null,
        next_visit: visitsMap.get(s.id)?.next_visit || null,
        open_complaints: Number(complaintsMap.get(s.id)?.open_complaints || 0),
        audit_risk: audits.get(s.id)?.risk || null,
        audit_date: audits.get(s.id)?.audit_date || null,
      };
    });
}

// GET /api/client-portal/dashboard?site_id=&from=&to=
router.get("/dashboard", async (req, res) => {
  try {
    const siteFilter = resolveSites(req);
    const { siteIds } = siteFilter;
    const { from, to } = resolveRange(req);
    const sp = placeholders(siteIds);
    const inRange = (col) => `${col} >= ? AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`;

    // Everything below follows the selected period (and outlet), except the
    // "Upcoming visits" list, which always shows what is next.

    // Jobs whose job date (start date, else created date) falls in the period.
    const [[jobCounts]] = await pool.query(
      `SELECT
         COUNT(*) AS jobs_in_period,
         SUM(j.status IN ('NOT_STARTED','IN_PROGRESS')) AS active_jobs,
         SUM(j.status = 'IN_PROGRESS') AS in_progress_jobs,
         SUM(j.status = 'COMPLETED') AS completed_jobs
       FROM jobs j
       WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
         AND ${inRange("COALESCE(j.start_date, j.created_at)")}`,
      [...siteIds, from, to]
    );

    // Visits scheduled in the period, by status.
    const [[visitCounts]] = await pool.query(
      `SELECT
         COUNT(*) AS visits_total,
         SUM(v.status = 'SCHEDULED') AS upcoming_visits,
         SUM(v.status = 'COMPLETED') AS visits_done,
         SUM(v.status = 'MISSED') AS visits_missed,
         SUM(v.status IN ('IN_PROGRESS','AWAITING_APPROVAL')) AS visits_in_progress
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
         AND v.status <> 'CANCELED' AND ${inRange("v.scheduled_date")}`,
      [...siteIds, from, to]
    );

    const [upcoming] = await pool.query(
      `SELECT v.id, v.job_id, v.scheduled_date, v.visit_number, j.code AS job_code, j.service_type,
              s.id AS site_id, s.name AS site_name
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN sites s ON s.id = j.company_id
       WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
         AND v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE()
       ORDER BY v.scheduled_date ASC
       LIMIT 6`,
      siteIds
    );

    // Complaints raised in the period; how many of those are still open.
    const cScope = complaintScope(req, siteFilter);
    const [[complaints]] = await pool.query(
      `SELECT COUNT(*) AS raised, SUM(t.status IN ('OPEN','IN_PROGRESS')) AS open_complaints
       FROM job_tickets t
       WHERE ${cScope.sql} AND ${inRange("t.created_at")}`,
      [...cScope.params, from, to]
    );

    const inv = invoiceScope(req, siteFilter);
    const [[invoices]] = await pool.query(
      `SELECT
         SUM(i.status IN ('PENDING','OVERDUE')) AS pending_invoices,
         SUM(i.status = 'OVERDUE') AS overdue_invoices,
         COALESCE(SUM(CASE WHEN i.status IN ('PENDING','OVERDUE') THEN i.pending_amount END), 0) AS pending_amount
       FROM invoices i
       WHERE ${inv.sql}`,
      inv.params
    );


    const [activity] = await pool.query(
      `SELECT h.id, h.job_id, h.message, h.created_at, j.code AS job_code, j.service_type, s.name AS site_name
       FROM job_history h
       JOIN jobs j ON j.id = h.job_id
       LEFT JOIN sites s ON s.id = j.company_id
       WHERE ${CLIENT_HISTORY_FILTER} AND j.company_id IN (${sp}) AND ${inRange("h.created_at")}
       ORDER BY h.created_at DESC
       LIMIT 12`,
      [...CLIENT_SAFE_ACTIONS, ...siteIds, from, to]
    );

    // Visits over the period: completed vs missed per bucket.
    // Bucket size follows the period length: day (<= 31 days), week (<= 120 days), month.
    const days = Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
    const granularity = days <= 31 ? "day" : days <= 120 ? "week" : "month";
    const bucketSql = {
      day: "DATE_FORMAT(v.scheduled_date, '%Y-%m-%d')",
      week: "DATE_FORMAT(DATE_SUB(DATE(v.scheduled_date), INTERVAL WEEKDAY(v.scheduled_date) DAY), '%Y-%m-%d')",
      month: "DATE_FORMAT(v.scheduled_date, '%Y-%m-01')",
    }[granularity];
    const [trendRows] = await pool.query(
      `SELECT ${bucketSql} AS bucket,
              SUM(v.status = 'COMPLETED') AS completed,
              SUM(v.status = 'MISSED') AS missed
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id IN (${sp}) AND COALESCE(j.is_archived, 0) = 0
         AND v.status <> 'CANCELED' AND ${inRange("v.scheduled_date")}
       GROUP BY bucket`,
      [...siteIds, from, to]
    );
    const trendMap = new Map(trendRows.map((r) => [r.bucket, r]));
    const trend = [];
    const pad = (x) => String(x).padStart(2, "0");
    const key = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    if (granularity === "month") cursor.setUTCDate(1);
    while (cursor <= end && trend.length < 400) {
      const k = key(cursor);
      const row = trendMap.get(k);
      trend.push({ bucket: k, completed: Number(row?.completed || 0), missed: Number(row?.missed || 0) });
      if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
      else if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const outlets = await buildOutletSummaries(req.clientAccess.sites, siteIds, from, to);
    const highRiskOutlets = outlets.filter((o) => isHighRisk(o.audit_risk)).length;

    // Service requests sent in the period; how many still wait to be scheduled.
    const [[requests]] = await pool.query(
      `SELECT COUNT(*) AS sent, SUM(status = 'NEW') AS pending, MAX(created_at) AS latest
       FROM client_service_requests r
       WHERE site_id IN (${sp}) AND ${inRange("r.created_at")}`,
      [...siteIds, from, to]
    );

    const n = (v) => Number(v || 0);
    res.json({
      range: { from, to },
      site_id: siteFilter.singleSite,
      granularity,
      kpis: {
        jobs_in_period: n(jobCounts.jobs_in_period),
        active_jobs: n(jobCounts.active_jobs),
        in_progress_jobs: n(jobCounts.in_progress_jobs),
        completed_jobs: n(jobCounts.completed_jobs),
        visits_total: n(visitCounts.visits_total),
        upcoming_visits: n(visitCounts.upcoming_visits),
        visits_done: n(visitCounts.visits_done),
        visits_missed: n(visitCounts.visits_missed),
        visits_in_progress: n(visitCounts.visits_in_progress),
        complaints_raised: n(complaints.raised),
        open_complaints: n(complaints.open_complaints),
        requests_sent: n(requests.sent),
        pending_invoices: n(invoices.pending_invoices),
        overdue_invoices: n(invoices.overdue_invoices),
        pending_amount: Number(invoices.pending_amount || 0),
        high_risk_outlets: highRiskOutlets,
        pending_requests: n(requests.pending),
        latest_request_at: requests.latest || null,
      },
      upcoming_visits: upcoming,
      activity,
      trend,
      outlets,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("client-portal /dashboard failed:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ---------- Jobs & visits ----------

// Job updates a client may see: anything staff marked visible, plus these system events.
// Staff comments stay hidden unless marked visible (Whitelist client comment).
const CLIENT_SAFE_ACTIONS = ["CREATED", "STATUS_CHANGED", "BEFORE_PHOTOS", "AFTER_PHOTOS"];
const CLIENT_HISTORY_FILTER = `(h.visible_to_client = 1 OR h.action IN (${CLIENT_SAFE_ACTIONS.map(() => "?").join(",")}))`;

const JOB_STATUS_GROUPS = {
  active: ["NOT_STARTED", "IN_PROGRESS"],
  scheduled: ["NOT_STARTED"],
  in_progress: ["IN_PROGRESS"],
  completed: ["COMPLETED"],
};

function parsePaging(req, defSize = 20) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(req.query.page_size, 10) || defSize));
  return { page, size, offset: (page - 1) * size };
}

// Optional date filter (no default): ?from=&to=
function optionalRange(req) {
  const from = DATE_RE.test(req.query.from || "") ? req.query.from : null;
  const to = DATE_RE.test(req.query.to || "") ? req.query.to : null;
  return { from, to };
}

// GET /api/client-portal/jobs?site_id=&status=active|scheduled|in_progress|completed&service=&from=&to=&search=&page=
router.get("/jobs", async (req, res) => {
  try {
    const { siteIds } = resolveSites(req);
    const { page, size, offset } = parsePaging(req);
    const { from, to } = optionalRange(req);

    const base = [`j.company_id IN (${placeholders(siteIds)})`, "COALESCE(j.is_archived, 0) = 0"];
    const params = [...siteIds];

    const service = typeof req.query.service === "string" ? req.query.service.trim() : "";
    if (service) {
      base.push("j.service_type = ?");
      params.push(service);
    }
    if (from) {
      base.push("COALESCE(j.start_date, j.created_at) >= ?");
      params.push(from);
    }
    if (to) {
      base.push("COALESCE(j.start_date, j.created_at) < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(to);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      base.push("(j.code LIKE ? OR j.sub_service LIKE ? OR s.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Counts per status chip use every filter except status.
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS all_jobs,
              SUM(j.status IN ('NOT_STARTED','IN_PROGRESS')) AS active,
              SUM(j.status = 'NOT_STARTED') AS scheduled,
              SUM(j.status = 'IN_PROGRESS') AS in_progress,
              SUM(j.status = 'COMPLETED') AS completed
       FROM jobs j LEFT JOIN sites s ON s.id = j.company_id
       WHERE ${base.join(" AND ")}`,
      params
    );

    const where = [...base];
    const listParams = [...params];
    const group = JOB_STATUS_GROUPS[req.query.status];
    if (group) {
      where.push(`j.status IN (${placeholders(group)})`);
      listParams.push(...group);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM jobs j LEFT JOIN sites s ON s.id = j.company_id WHERE ${where.join(" AND ")}`,
      listParams
    );

    const [rows] = await pool.query(
      `SELECT j.id, j.code, j.service_type, j.sub_service, j.status, j.start_date, j.due_date,
              j.created_at, j.completed_at, s.id AS site_id, s.name AS site_name,
              (SELECT COUNT(*) FROM job_visits v WHERE v.job_id = j.id AND v.status <> 'CANCELED') AS visits_total,
              (SELECT COUNT(*) FROM job_visits v WHERE v.job_id = j.id AND v.status = 'COMPLETED') AS visits_done,
              (SELECT MIN(v.scheduled_date) FROM job_visits v WHERE v.job_id = j.id AND v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE()) AS next_visit,
              (SELECT MAX(v.completed_at) FROM job_visits v WHERE v.job_id = j.id AND v.status = 'COMPLETED') AS last_visit
       FROM jobs j
       LEFT JOIN sites s ON s.id = j.company_id
       WHERE ${where.join(" AND ")}
       ORDER BY (j.status = 'COMPLETED'), COALESCE(j.start_date, j.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...listParams, size, offset]
    );

    const [services] = await pool.query(
      `SELECT DISTINCT j.service_type FROM jobs j
       WHERE j.company_id IN (${placeholders(siteIds)}) AND COALESCE(j.is_archived, 0) = 0 AND j.service_type IS NOT NULL
       ORDER BY j.service_type`,
      siteIds
    );

    const n = (v) => Number(v || 0);
    res.json({
      page,
      page_size: size,
      total: n(total),
      counts: {
        all: n(counts.all_jobs),
        active: n(counts.active),
        scheduled: n(counts.scheduled),
        in_progress: n(counts.in_progress),
        completed: n(counts.completed),
      },
      services: services.map((s) => s.service_type),
      jobs: rows.map((r) => ({ ...r, visits_total: n(r.visits_total), visits_done: n(r.visits_done) })),
    });
  } catch (err) {
    sendError(res, err, "jobs");
  }
});

// Technician first names per visit (clients see who is coming, not full staff details).
async function visitTechnicians(visitIds) {
  if (!visitIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT vt.visit_id, u.name
     FROM visit_technicians vt JOIN users u ON u.id = vt.technician_id
     WHERE vt.visit_id IN (${placeholders(visitIds)})`,
    visitIds
  );
  const map = new Map();
  for (const r of rows) {
    const first = String(r.name || "").trim().split(/\s+/)[0];
    if (!first) continue;
    if (!map.has(r.visit_id)) map.set(r.visit_id, []);
    map.get(r.visit_id).push(first);
  }
  return map;
}

const VISIT_STATUS_FILTERS = {
  upcoming: { sql: "v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE()", order: "v.scheduled_date ASC" },
  completed: { sql: "v.status = 'COMPLETED'", order: "COALESCE(v.completed_at, v.scheduled_date) DESC" },
  missed: { sql: "v.status = 'MISSED'", order: "v.scheduled_date DESC" },
  in_progress: { sql: "v.status IN ('IN_PROGRESS','AWAITING_APPROVAL')", order: "v.scheduled_date DESC" },
  all: { sql: "1 = 1", order: "v.scheduled_date DESC" },
};

// GET /api/client-portal/visits?site_id=&status=upcoming|completed|missed|in_progress|all&from=&to=&page=
router.get("/visits", async (req, res) => {
  try {
    const { siteIds } = resolveSites(req);
    const { page, size, offset } = parsePaging(req);
    const { from, to } = optionalRange(req);

    const base = [`j.company_id IN (${placeholders(siteIds)})`, "COALESCE(j.is_archived, 0) = 0", "v.status <> 'CANCELED'"];
    const params = [...siteIds];
    if (from) {
      base.push("v.scheduled_date >= ?");
      params.push(from);
    }
    if (to) {
      base.push("v.scheduled_date < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(to);
    }

    const [[counts]] = await pool.query(
      `SELECT SUM(v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE()) AS upcoming,
              SUM(v.status IN ('IN_PROGRESS','AWAITING_APPROVAL')) AS in_progress,
              SUM(v.status = 'COMPLETED') AS completed,
              SUM(v.status = 'MISSED') AS missed,
              COUNT(*) AS all_visits
       FROM job_visits v JOIN jobs j ON j.id = v.job_id
       WHERE ${base.join(" AND ")}`,
      params
    );

    const filter = VISIT_STATUS_FILTERS[req.query.status] || VISIT_STATUS_FILTERS.upcoming;
    const where = `${base.join(" AND ")} AND ${filter.sql}`;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM job_visits v JOIN jobs j ON j.id = v.job_id WHERE ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT v.id, v.job_id, v.visit_number, v.scheduled_date, v.status, v.started_at, v.completed_at,
              j.code AS job_code, j.service_type, j.sub_service, s.id AS site_id, s.name AS site_name
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN sites s ON s.id = j.company_id
       WHERE ${where}
       ORDER BY ${filter.order}
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    const techs = await visitTechnicians(rows.map((r) => r.id));

    const n = (v) => Number(v || 0);
    res.json({
      page,
      page_size: size,
      total: n(total),
      counts: {
        upcoming: n(counts.upcoming),
        in_progress: n(counts.in_progress),
        completed: n(counts.completed),
        missed: n(counts.missed),
        all: n(counts.all_visits),
      },
      visits: rows.map((r) => ({ ...r, technicians: techs.get(r.id) || [] })),
    });
  } catch (err) {
    sendError(res, err, "visits");
  }
});

// Loads a job only if it belongs to one of the client's outlets.
async function loadScopedJob(req, jobId) {
  const { siteIds } = req.clientAccess;
  const [[job]] = await pool.query(
    `SELECT j.id, j.code, j.service_type, j.sub_service, j.status, j.priority, j.start_date, j.due_date,
            j.created_at, j.completed_at, j.address, s.id AS site_id, s.name AS site_name, s.address AS site_address
     FROM jobs j
     LEFT JOIN sites s ON s.id = j.company_id
     WHERE j.id = ? AND j.company_id IN (${placeholders(siteIds)}) AND COALESCE(j.is_archived, 0) = 0`,
    [jobId, ...siteIds]
  );
  return job || null;
}

// GET /api/client-portal/jobs/:jobId -> job, visits, client-visible timeline with photos
router.get("/jobs/:jobId", async (req, res) => {
  try {
    const job = await loadScopedJob(req, req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const [visits] = await pool.query(
      `SELECT v.id, v.visit_number, v.scheduled_date, v.status, v.started_at, v.completed_at
       FROM job_visits v
       WHERE v.job_id = ? AND v.status <> 'CANCELED'
       ORDER BY v.scheduled_date ASC, v.visit_number ASC`,
      [job.id]
    );
    const techs = await visitTechnicians(visits.map((v) => v.id));

    const [historyRows] = await pool.query(
      `SELECT h.id, h.action, h.message, h.created_at, h.metadata,
              a.id AS attachment_id, a.type AS attachment_type, a.file_name, a.file_type
       FROM job_history h
       LEFT JOIN job_attachments a ON a.history_id = h.id
       WHERE h.job_id = ? AND ${CLIENT_HISTORY_FILTER}
       ORDER BY h.created_at DESC`,
      [job.id, ...CLIENT_SAFE_ACTIONS]
    );
    const timelineMap = new Map();
    for (const row of historyRows) {
      if (!timelineMap.has(row.id)) {
        let visitId = null;
        try {
          const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
          visitId = meta?.visit_id || null;
        } catch {
          visitId = null;
        }
        timelineMap.set(row.id, {
          id: row.id,
          action: row.action,
          message: row.message,
          created_at: row.created_at,
          visit_id: visitId,
          attachments: [],
        });
      }
      if (row.attachment_id) {
        timelineMap.get(row.id).attachments.push({
          id: row.attachment_id,
          type: row.attachment_type,
          file_name: row.file_name,
          file_type: row.file_type,
        });
      }
    }

    res.json({
      job,
      visits: visits.map((v) => ({ ...v, technicians: techs.get(v.id) || [] })),
      timeline: Array.from(timelineMap.values()),
    });
  } catch (err) {
    sendError(res, err, "job");
  }
});

// GET /api/client-portal/attachments/:id -> streams a photo/file, only if it hangs off a
// client-visible update of a job at one of the client's outlets.
router.get("/attachments/:id", async (req, res) => {
  try {
    const { siteIds } = req.clientAccess;
    const [[att]] = await pool.query(
      `SELECT a.object_key, a.file_type, a.file_name
       FROM job_attachments a
       JOIN job_history h ON h.id = a.history_id
       JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? AND j.company_id IN (${placeholders(siteIds)}) AND COALESCE(j.is_archived, 0) = 0
         AND ${CLIENT_HISTORY_FILTER}`,
      [req.params.id, ...siteIds, ...CLIENT_SAFE_ACTIONS]
    );
    if (!att || !att.object_key) return res.status(404).json({ error: "File not found" });

    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, att.object_key);
    res.setHeader("Content-Type", att.file_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${String(att.file_name || "file").replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.on("error", (err) => {
      console.error("client-portal attachment stream failed:", err);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    sendError(res, err, "file");
  }
});

// ---------- Complaints (job_tickets) ----------
//
// A complaint is a job_tickets row with site_id = the outlet, optionally linked to one job.
// Staff answer it from Admin > Tickets. A client sees a complaint when its outlet or linked job
// is one of their outlets, or when they raised it.

const complaintUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === "application/pdf";
    cb(ok ? null : Object.assign(new Error("Only photos and PDF files can be attached"), { status: 400 }), ok);
  },
});

// Runs multer and turns its errors into 400 responses.
function acceptFiles(req, res, next) {
  complaintUpload.array("files", 5)(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Each file must be 10 MB or smaller"
      : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? "You can attach up to 5 files"
      : err.message || "Upload failed";
    res.status(400).json({ error: message });
  });
}

// SQL condition: complaint t is visible to this client (optionally only for one outlet).
function complaintScope(req, siteFilter) {
  const sites = siteFilter.siteIds;
  const sp = placeholders(sites);
  const linked = `EXISTS (SELECT 1 FROM job_ticket_links cl JOIN jobs cj ON cj.id = cl.job_id
                          WHERE cl.ticket_id = t.id AND cj.company_id IN (${sp}))`;
  if (siteFilter.singleSite) {
    return { sql: `(t.site_id IN (${sp}) OR ${linked})`, params: [...sites, ...sites] };
  }
  return { sql: `(t.site_id IN (${sp}) OR ${linked} OR t.created_by_user_id = ?)`, params: [...sites, ...sites, req.user.id] };
}

async function loadScopedComplaint(req, ticketId) {
  const scope = complaintScope(req, { siteIds: req.clientAccess.siteIds, singleSite: null });
  const [[ticket]] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority, t.site_id, t.created_at, t.updated_at, t.created_by_user_id,
            u.name AS raised_by_name, s.name AS site_name
     FROM job_tickets t
     JOIN users u ON u.id = t.created_by_user_id
     LEFT JOIN sites s ON s.id = t.site_id
     WHERE t.id = ? AND ${scope.sql}`,
    [ticketId, ...scope.params]
  );
  return ticket || null;
}

async function storeComplaintFiles(files, ticketId, messageId) {
  for (const file of files || []) {
    const safeName = String(file.originalname || "file").replace(/[^\w.-]+/g, "_").slice(-80);
    const objectKey = `tickets/${Date.now()}_${uuid().slice(0, 8)}_${safeName}`;
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, file.buffer, file.size, {
      "Content-Type": file.mimetype,
    });
    await pool.query(
      "INSERT INTO ticket_attachments (id, ticket_id, message_id, object_key) VALUES (?, ?, ?, ?)",
      [uuid(), ticketId, messageId, objectKey]
    );
  }
}

// Email admins, the linked job's supervisor and the outlet branch's branch admins. Never throws.
async function notifyComplaint({ ticketId, subject, message, priority, siteId, job }) {
  try {
    const recipients = new Set();
    const [admins] = await pool.query(
      "SELECT email FROM users WHERE role = 'admin' AND is_active = 1 AND email IS NOT NULL"
    );
    admins.forEach((a) => recipients.add(a.email));
    if (job?.supervisor_id) {
      const [[sup]] = await pool.query("SELECT email FROM users WHERE id = ? AND is_active = 1", [job.supervisor_id]);
      if (sup?.email) recipients.add(sup.email);
    }
    const [[site]] = await pool.query(
      `SELECT s.name, s.branch_id, COALESCE(c.display_name, c.name) AS company_name
       FROM sites s LEFT JOIN companies c ON c.id = s.company_id WHERE s.id = ?`,
      [siteId]
    );
    if (site?.branch_id) {
      const [branchAdmins] = await pool.query(
        `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'branch_admin' AND u.branch_id = ? AND u.is_active = 1 AND u.email IS NOT NULL`,
        [site.branch_id]
      );
      branchAdmins.forEach((b) => recipients.add(b.email));
    }
    await sendTicketCreatedEmail({
      toEmails: Array.from(recipients).filter(Boolean),
      ticket: {
        id: ticketId,
        subject: `[Client complaint] ${site?.company_name || ""} - ${site?.name || ""}: ${subject}`,
        message,
        priority,
      },
      job: job ? { id: job.id, code: job.code } : { id: null, code: `(none) · Outlet ${site?.name || siteId}` },
    });
  } catch (err) {
    console.error("Complaint notification failed:", err);
  }
}

// GET /api/client-portal/complaints?site_id=&status=open|resolved|all&search=&page=
router.get("/complaints", async (req, res) => {
  try {
    const siteFilter = resolveSites(req);
    const { page, size, offset } = parsePaging(req);
    const scope = complaintScope(req, siteFilter);
    const base = [scope.sql];
    const params = [...scope.params];

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      base.push("t.subject LIKE ?");
      params.push(`%${search}%`);
    }

    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS all_count,
              SUM(t.status IN ('OPEN','IN_PROGRESS')) AS open_count,
              SUM(t.status IN ('RESOLVED','CLOSED')) AS resolved_count
       FROM job_tickets t WHERE ${base.join(" AND ")}`,
      params
    );

    const where = [...base];
    if (req.query.status === "open") where.push("t.status IN ('OPEN','IN_PROGRESS')");
    else if (req.query.status === "resolved") where.push("t.status IN ('RESOLVED','CLOSED')");

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM job_tickets t WHERE ${where.join(" AND ")}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at,
              u.name AS raised_by_name,
              COALESCE(s.id, js.id) AS site_id, COALESCE(s.name, js.name) AS site_name,
              (SELECT COUNT(*) FROM job_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT r.name FROM job_ticket_messages m JOIN users mu ON mu.id = m.created_by_user_id
                 LEFT JOIN roles r ON r.id = mu.role_id
                WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_author_role,
              (SELECT MAX(m.created_at) FROM job_ticket_messages m WHERE m.ticket_id = t.id) AS last_message_at,
              (SELECT cj.code FROM job_ticket_links cl JOIN jobs cj ON cj.id = cl.job_id WHERE cl.ticket_id = t.id LIMIT 1) AS job_code
       FROM job_tickets t
       JOIN users u ON u.id = t.created_by_user_id
       LEFT JOIN sites s ON s.id = t.site_id
       LEFT JOIN sites js ON js.id = (SELECT cj.company_id FROM job_ticket_links cl JOIN jobs cj ON cj.id = cl.job_id WHERE cl.ticket_id = t.id LIMIT 1)
       WHERE ${where.join(" AND ")}
       ORDER BY (t.status IN ('OPEN','IN_PROGRESS')) DESC, COALESCE(t.updated_at, t.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );

    const n = (v) => Number(v || 0);
    res.json({
      page,
      page_size: size,
      total: n(total),
      counts: { all: n(counts.all_count), open: n(counts.open_count), resolved: n(counts.resolved_count) },
      complaints: rows.map(({ last_author_role, ...r }) => ({
        ...r,
        message_count: n(r.message_count),
        // true when our team wrote the last message (the client may want to read/answer it)
        awaiting_you: !!last_author_role && last_author_role !== "client",
      })),
    });
  } catch (err) {
    sendError(res, err, "complaints");
  }
});

// POST /api/client-portal/complaints  (multipart: subject, message, priority, site_id, job_id?, files[])
router.post("/complaints", acceptFiles, async (req, res) => {
  const subject = String(req.body?.subject || "").trim().slice(0, 200);
  // Details are optional; without them the subject becomes the first message of the thread.
  const message = String(req.body?.message || "").trim() || subject;
  const siteId = String(req.body?.site_id || "").trim();
  const jobId = String(req.body?.job_id || "").trim();
  const priorityRaw = String(req.body?.priority || "MEDIUM").toUpperCase();
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priorityRaw) ? priorityRaw : "MEDIUM";

  if (!subject) return res.status(400).json({ error: "Please add a short subject" });
  if (!siteId || !req.clientAccess.siteIds.includes(siteId)) {
    return res.status(400).json({ error: "Please choose the outlet" });
  }

  try {
    let job = null;
    if (jobId) {
      const [[row]] = await pool.query(
        "SELECT id, code, supervisor_id FROM jobs WHERE id = ? AND company_id = ? AND COALESCE(is_archived, 0) = 0",
        [jobId, siteId]
      );
      if (!row) return res.status(400).json({ error: "That job does not belong to the chosen outlet" });
      job = row;
    }

    const ticketId = uuid();
    const messageId = uuid();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO job_tickets (id, subject, status, priority, site_id, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, 'OPEN', ?, ?, ?, NOW(), NOW())`,
        [ticketId, subject, priority, siteId, req.user.id]
      );
      if (job) {
        await connection.query(
          "INSERT INTO job_ticket_links (id, ticket_id, job_id) VALUES (?, ?, ?)",
          [uuid(), ticketId, job.id]
        );
        await connection.query(
          `INSERT INTO job_history (id, job_id, action, message, visible_to_client, created_by_user_id, created_at)
           VALUES (?, ?, 'COMMENT', ?, 1, ?, NOW())`,
          [uuid(), job.id, `Complaint raised: ${subject}`, req.user.id]
        );
      }
      await connection.query(
        `INSERT INTO job_ticket_messages (id, ticket_id, message, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [messageId, ticketId, message, req.user.id]
      );
      await connection.commit();
    } catch (err) {
      await connection.rollback().catch(() => {});
      throw err;
    } finally {
      connection.release();
    }

    // Files after the rows exist; a failed upload must not lose the complaint itself.
    let fileError = null;
    try {
      await storeComplaintFiles(req.files, ticketId, messageId);
    } catch (err) {
      console.error("Complaint file upload failed:", err);
      fileError = "Your complaint was saved, but the attachments could not be uploaded. Please add them as a reply.";
    }

    res.status(201).json({ id: ticketId, warning: fileError });
    notifyComplaint({ ticketId, subject, message, priority, siteId, job });
  } catch (err) {
    sendError(res, err, "complaint");
  }
});

// GET /api/client-portal/complaints/:id
router.get("/complaints/:id", async (req, res) => {
  try {
    const ticket = await loadScopedComplaint(req, req.params.id);
    if (!ticket) return res.status(404).json({ error: "Complaint not found" });

    const [jobs] = await pool.query(
      `SELECT j.id, j.code, j.service_type, j.sub_service, s.id AS site_id, s.name AS site_name
       FROM job_ticket_links l JOIN jobs j ON j.id = l.job_id LEFT JOIN sites s ON s.id = j.company_id
       WHERE l.ticket_id = ?`,
      [ticket.id]
    );
    const [messages] = await pool.query(
      `SELECT m.id, m.message, m.created_at, m.created_by_user_id, u.name AS author_name, r.name AS author_role
       FROM job_ticket_messages m
       JOIN users u ON u.id = m.created_by_user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE m.ticket_id = ?
       ORDER BY m.created_at ASC`,
      [ticket.id]
    );
    const [files] = await pool.query(
      "SELECT id, message_id, object_key FROM ticket_attachments WHERE ticket_id = ?",
      [ticket.id]
    );
    const filesByMessage = new Map();
    for (const f of files) {
      const name = String(f.object_key || "").split("/").pop().replace(/^\d+_(?:[0-9a-f]{8}_)?/, "");
      if (!filesByMessage.has(f.message_id)) filesByMessage.set(f.message_id, []);
      filesByMessage.get(f.message_id).push({
        id: f.id,
        file_name: name,
        file_type: /\.pdf$/i.test(name) ? "application/pdf" : "image/*",
      });
    }

    const { created_by_user_id: raisedBy, ...rest } = ticket;
    res.json({
      complaint: {
        ...rest,
        site_id: ticket.site_id || jobs[0]?.site_id || null,
        site_name: ticket.site_name || jobs[0]?.site_name || null,
        raised_by_me: String(raisedBy) === String(req.user.id),
      },
      jobs,
      messages: messages.map((m) => {
        const fromTeam = m.author_role !== "client";
        return {
          id: m.id,
          message: m.message,
          created_at: m.created_at,
          mine: String(m.created_by_user_id) === String(req.user.id),
          from_team: fromTeam,
          // Our staff appear by first name only.
          author: fromTeam ? String(m.author_name || "Support").trim().split(/\s+/)[0] : m.author_name,
          attachments: filesByMessage.get(m.id) || [],
        };
      }),
    });
  } catch (err) {
    sendError(res, err, "complaint");
  }
});

// POST /api/client-portal/complaints/:id/messages  (multipart: message, files[])
// Replying to a resolved/closed complaint reopens it.
router.post("/complaints/:id/messages", acceptFiles, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message && !(req.files || []).length) return res.status(400).json({ error: "Write a message or attach a file" });
    const ticket = await loadScopedComplaint(req, req.params.id);
    if (!ticket) return res.status(404).json({ error: "Complaint not found" });

    const messageId = uuid();
    await pool.query(
      `INSERT INTO job_ticket_messages (id, ticket_id, message, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [messageId, ticket.id, message || "(attachment)", req.user.id]
    );
    const reopen = ["RESOLVED", "CLOSED"].includes(ticket.status);
    await pool.query(
      `UPDATE job_tickets SET ${reopen ? "status = 'OPEN', " : ""}updated_at = NOW() WHERE id = ?`,
      [ticket.id]
    );

    let warning = null;
    try {
      await storeComplaintFiles(req.files, ticket.id, messageId);
    } catch (err) {
      console.error("Complaint reply upload failed:", err);
      warning = "Your message was sent, but the attachments could not be uploaded.";
    }
    res.status(201).json({ id: messageId, reopened: reopen, warning });
  } catch (err) {
    sendError(res, err, "reply");
  }
});

// PATCH /api/client-portal/complaints/:id/status  body: { status: 'CLOSED' | 'OPEN' }
// Clients can close a complaint they are happy with, or reopen one.
router.patch("/complaints/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "").toUpperCase();
    if (!["CLOSED", "OPEN"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    const ticket = await loadScopedComplaint(req, req.params.id);
    if (!ticket) return res.status(404).json({ error: "Complaint not found" });
    await pool.query("UPDATE job_tickets SET status = ?, updated_at = NOW() WHERE id = ?", [status, ticket.id]);
    res.json({ success: true, status });
  } catch (err) {
    sendError(res, err, "complaint");
  }
});

// GET /api/client-portal/complaint-files/:id -> streams a complaint attachment the client can see
router.get("/complaint-files/:id", async (req, res) => {
  try {
    const [[file]] = await pool.query(
      "SELECT ticket_id, object_key FROM ticket_attachments WHERE id = ?",
      [req.params.id]
    );
    if (!file || !(await loadScopedComplaint(req, file.ticket_id))) {
      return res.status(404).json({ error: "File not found" });
    }
    const stat = await minioClient.statObject(process.env.MINIO_BUCKET, file.object_key);
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, file.object_key);
    res.setHeader("Content-Type", stat?.metaData?.["content-type"] || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.on("error", () => (res.headersSent ? res.destroy() : res.status(500).end()));
    stream.pipe(res);
  } catch (err) {
    if (err?.code === "NoSuchKey" || err?.code === "NotFound") return res.status(404).json({ error: "File not found" });
    sendError(res, err, "file");
  }
});

// ---------- Documents ----------
//
// One list built from four places (read-only except client_documents, which staff upload):
//   shared   client_documents      (site_id NULL = whole company, every login sees it)
//   invoice  invoices              (details; a file only if one was attached)
//   audit    audits + audit_reports (current generated report of a submitted audit)
//   photos   job_attachments       (client-visible service photos, one entry per job)

const DOC_KINDS = ["shared", "invoice", "audit", "photos"];
const DOC_SOURCE_LIMIT = 500;

async function sharedDocuments(req, siteFilter) {
  const { companyIds } = req.clientAccess;
  const sites = siteFilter.siteIds;
  const [rows] = await pool.query(
    `SELECT d.id, d.title, d.doc_type, d.file_name, d.file_type, d.size_bytes, d.valid_until, d.notes, d.created_at,
            d.site_id, s.name AS site_name
     FROM client_documents d
     LEFT JOIN sites s ON s.id = d.site_id
     WHERE d.is_active = 1 AND d.company_id IN (${placeholders(companyIds)})
       AND (d.site_id IS NULL OR d.site_id IN (${placeholders(sites)}))
     ORDER BY d.created_at DESC
     LIMIT ${DOC_SOURCE_LIMIT}`,
    [...companyIds, ...sites]
  );
  return rows.map((d) => ({
    key: `shared:${d.id}`,
    kind: "shared",
    id: d.id,
    title: d.title,
    doc_type: d.doc_type,
    date: d.created_at,
    site_name: d.site_id ? d.site_name : null,
    file_name: d.file_name,
    file_type: d.file_type,
    size_bytes: d.size_bytes,
    valid_until: d.valid_until,
    notes: d.notes,
    download: `/api/client-portal/documents/shared/${d.id}/file`,
  }));
}

async function invoiceDocuments(req, siteFilter) {
  const inv = invoiceScope(req, siteFilter);
  const [rows] = await pool.query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.invoice_amount, i.paid_amount, i.pending_amount,
            i.status, i.invoice_file_path IS NOT NULL AND i.invoice_file_path <> '' AS has_file, s.name AS site_name
     FROM invoices i
     LEFT JOIN sites s ON s.id = i.site_id
     WHERE ${inv.sql}
     ORDER BY i.invoice_date DESC
     LIMIT ${DOC_SOURCE_LIMIT}`,
    inv.params
  );
  return rows.map((i) => ({
    key: `invoice:${i.id}`,
    kind: "invoice",
    id: i.id,
    title: `Invoice ${i.invoice_number || ""}`.trim(),
    date: i.invoice_date,
    site_name: i.site_name || null,
    status: i.status,
    amount: Number(i.invoice_amount || 0),
    paid: Number(i.paid_amount || 0),
    pending: Number(i.pending_amount || 0),
    due_date: i.due_date,
    // Invoice files are not stored in the system yet; nothing to download.
    download: null,
    has_file: !!i.has_file,
  }));
}

async function auditDocuments(req, siteFilter) {
  const sites = siteFilter.siteIds;
  const [rows] = await pool.query(
    `SELECT a.id, a.audit_number, a.audit_date, a.audit_type, COALESCE(a.overall_risk_override, a.overall_risk) AS risk,
            s.name AS site_name, r.page_count, r.size_bytes, r.generated_at, au.name AS auditor_name
     FROM audits a
     JOIN audit_reports r ON r.id = a.current_report_id AND r.status = 'GENERATED' AND r.object_key IS NOT NULL
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN users au ON au.id = a.auditor_user_id
     WHERE a.status = 'SUBMITTED' AND a.site_id IN (${placeholders(sites)})
     ORDER BY a.audit_date DESC
     LIMIT ${DOC_SOURCE_LIMIT}`,
    sites
  );
  return rows.map((a) => ({
    key: `audit:${a.id}`,
    kind: "audit",
    id: a.id,
    title: `Audit report${a.audit_number ? ` ${a.audit_number}` : ""}`,
    date: a.audit_date,
    site_name: a.site_name,
    risk: a.risk,
    audit_type: a.audit_type,
    audit_number: a.audit_number,
    // Supervisors appear by first name only, like technicians.
    auditor: a.auditor_name ? String(a.auditor_name).trim().split(/\s+/)[0] : null,
    page_count: a.page_count,
    size_bytes: a.size_bytes,
    file_type: "application/pdf",
    download: `/api/client-portal/documents/audit/${a.id}/file`,
  }));
}

async function photoDocuments(req, siteFilter) {
  const sites = siteFilter.siteIds;
  const [rows] = await pool.query(
    `SELECT j.id AS job_id, j.code, j.service_type, j.sub_service, s.name AS site_name,
            COUNT(DISTINCT a.id) AS photos, MAX(h.created_at) AS last_at
     FROM job_attachments a
     JOIN job_history h ON h.id = a.history_id
     JOIN jobs j ON j.id = a.job_id
     LEFT JOIN sites s ON s.id = j.company_id
     WHERE j.company_id IN (${placeholders(sites)}) AND COALESCE(j.is_archived, 0) = 0 AND ${CLIENT_HISTORY_FILTER}
     GROUP BY j.id, j.code, j.service_type, j.sub_service, s.name
     ORDER BY last_at DESC
     LIMIT ${DOC_SOURCE_LIMIT}`,
    [...sites, ...CLIENT_SAFE_ACTIONS]
  );
  return rows.map((p) => ({
    key: `photos:${p.job_id}`,
    kind: "photos",
    id: p.job_id,
    title: `Service photos · Job #${p.code || ""}`.trim(),
    date: p.last_at,
    site_name: p.site_name,
    service_type: p.service_type,
    sub_service: p.sub_service,
    photos: Number(p.photos || 0),
    download: null,
    link: `/client/jobs/${p.job_id}`,
  }));
}

// GET /api/client-portal/documents?site_id=&kind=shared|invoice|audit|photos&search=&from=&to=&page=
router.get("/documents", async (req, res) => {
  try {
    const siteFilter = resolveSites(req);
    const { page, size, offset } = parsePaging(req, 30);
    const { from, to } = optionalRange(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";

    const [shared, invoices, audits, photos] = await Promise.all([
      sharedDocuments(req, siteFilter),
      invoiceDocuments(req, siteFilter),
      auditDocuments(req, siteFilter),
      photoDocuments(req, siteFilter),
    ]);

    // Calendar day in server time (the same way the DB driver built the Date), not UTC.
    const localDay = (v) => {
      const x = new Date(v);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    };
    const inFilters = (d) => {
      const day = d.date ? localDay(d.date) : null;
      if (from && (!day || day < from)) return false;
      if (to && (!day || day > to)) return false;
      if (!search) return true;
      return [d.title, d.site_name, d.file_name, d.doc_type, d.notes, d.sub_service]
        .some((v) => v && String(v).toLowerCase().includes(search));
    };

    const byKind = {
      shared: shared.filter(inFilters),
      invoice: invoices.filter(inFilters),
      audit: audits.filter(inFilters),
      photos: photos.filter(inFilters),
    };
    const kind = DOC_KINDS.includes(req.query.kind) ? req.query.kind : null;
    const list = (kind ? byKind[kind] : [].concat(...Object.values(byKind)))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const expiring = shared.filter((d) => d.valid_until && new Date(d.valid_until) <= soon).length;

    res.json({
      page,
      page_size: size,
      total: list.length,
      counts: {
        all: Object.values(byKind).reduce((n, l) => n + l.length, 0),
        shared: byKind.shared.length,
        invoice: byKind.invoice.length,
        audit: byKind.audit.length,
        photos: byKind.photos.length,
      },
      expiring_soon: expiring,
      documents: list.slice(offset, offset + size),
    });
  } catch (err) {
    sendError(res, err, "documents");
  }
});

function streamFile(res, objectKey, { type, name, download }) {
  return minioClient.getObject(process.env.MINIO_BUCKET, objectKey).then((stream) => {
    res.setHeader("Content-Type", type || "application/octet-stream");
    const safe = String(name || "document").replace(/["\r\n]/g, "");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safe}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.on("error", () => (res.headersSent ? res.destroy() : res.status(500).end()));
    stream.pipe(res);
  });
}

// GET /api/client-portal/documents/shared/:id/file?download=1
router.get("/documents/shared/:id/file", async (req, res) => {
  try {
    const { companyIds, siteIds } = req.clientAccess;
    const [[doc]] = await pool.query(
      `SELECT object_key, file_name, file_type FROM client_documents
       WHERE id = ? AND is_active = 1 AND company_id IN (${placeholders(companyIds)})
         AND (site_id IS NULL OR site_id IN (${placeholders(siteIds)}))`,
      [req.params.id, ...companyIds, ...siteIds]
    );
    if (!doc) return res.status(404).json({ error: "Document not found" });
    await streamFile(res, doc.object_key, { type: doc.file_type, name: doc.file_name, download: !!req.query.download });
  } catch (err) {
    sendError(res, err, "document");
  }
});

// GET /api/client-portal/documents/audit/:auditId/file?download=1 -> current generated report
router.get("/documents/audit/:auditId/file", async (req, res) => {
  try {
    const { siteIds } = req.clientAccess;
    const [[row]] = await pool.query(
      `SELECT r.object_key, a.audit_number, a.audit_date, s.name AS site_name
       FROM audits a
       JOIN audit_reports r ON r.id = a.current_report_id AND r.status = 'GENERATED' AND r.object_key IS NOT NULL
       LEFT JOIN sites s ON s.id = a.site_id
       WHERE a.id = ? AND a.status = 'SUBMITTED' AND a.site_id IN (${placeholders(siteIds)})`,
      [req.params.auditId, ...siteIds]
    );
    if (!row) return res.status(404).json({ error: "Report not found" });
    const name = `AuditReport-${row.site_name || "outlet"}-${row.audit_number || ymd(new Date(row.audit_date))}.pdf`.replace(/[^\w.-]+/g, "_");
    await streamFile(res, row.object_key, { type: "application/pdf", name, download: !!req.query.download });
  } catch (err) {
    sendError(res, err, "report");
  }
});

// ---------- Service requests (client_service_requests) ----------
// Requests wait as NEW until staff assign them from Admin > Service Requests.

const REQUEST_TYPES = ["PEST", "DEEP", "BOTH"];
const REQUEST_SLOTS = ["ANY", "MORNING", "AFTERNOON", "EVENING"];

function parseSubServices(value) {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [list];
    }
  }
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((s) => String(s || "").trim().slice(0, 150)).filter(Boolean))).slice(0, 15);
}

// GET /api/client-portal/service-requests?site_id=&status=open|done|all
router.get("/service-requests", async (req, res) => {
  try {
    const { siteIds } = resolveSites(req);
    const where = [`r.site_id IN (${placeholders(siteIds)})`];
    if (req.query.status === "open") where.push("r.status = 'NEW'");
    else if (req.query.status === "done") where.push("r.status IN ('ASSIGNED','REJECTED','CANCELLED')");

    const [rows] = await pool.query(
      `SELECT r.id, r.site_id, s.name AS site_name, r.service_type, r.sub_services, r.preferred_date, r.preferred_slot,
              r.notes, r.status, r.staff_note, r.booking_id, r.created_at, r.handled_at, u.name AS requested_by_name
       FROM client_service_requests r
       LEFT JOIN sites s ON s.id = r.site_id
       LEFT JOIN users u ON u.id = r.requested_by
       WHERE ${where.join(" AND ")}
       ORDER BY (r.status = 'NEW') DESC, r.created_at DESC
       LIMIT 200`,
      siteIds
    );

    // Jobs created from assigned requests, so the client can open them.
    const bookingIds = rows.map((r) => r.booking_id).filter(Boolean);
    const jobsByBooking = new Map();
    if (bookingIds.length) {
      const [jobs] = await pool.query(
        `SELECT id, code, booking_id, sub_service, status FROM jobs WHERE booking_id IN (${placeholders(bookingIds)})`,
        bookingIds
      );
      for (const j of jobs) {
        if (!jobsByBooking.has(j.booking_id)) jobsByBooking.set(j.booking_id, []);
        jobsByBooking.get(j.booking_id).push({ id: j.id, code: j.code, sub_service: j.sub_service, status: j.status });
      }
    }

    const [[counts]] = await pool.query(
      `SELECT SUM(r.status = 'NEW') AS open_count, SUM(r.status <> 'NEW') AS done_count, COUNT(*) AS all_count
       FROM client_service_requests r WHERE r.site_id IN (${placeholders(siteIds)})`,
      siteIds
    );

    res.json({
      counts: { open: Number(counts.open_count || 0), done: Number(counts.done_count || 0), all: Number(counts.all_count || 0) },
      requests: rows.map(({ booking_id: bookingId, ...r }) => ({
        ...r,
        sub_services: parseSubServices(r.sub_services),
        jobs: bookingId ? jobsByBooking.get(bookingId) || [] : [],
      })),
    });
  } catch (err) {
    sendError(res, err, "service requests");
  }
});

// POST /api/client-portal/service-requests
// body: { site_id, service_type: PEST|DEEP|BOTH, sub_services: [], preferred_date?, preferred_slot?, notes? }
router.post("/service-requests", async (req, res) => {
  try {
    const siteId = String(req.body?.site_id || "").trim();
    if (!siteId || !req.clientAccess.siteIds.includes(siteId)) {
      return res.status(400).json({ error: "Please choose the outlet" });
    }
    const serviceType = String(req.body?.service_type || "").toUpperCase();
    if (!REQUEST_TYPES.includes(serviceType)) return res.status(400).json({ error: "Please choose the type of service" });
    const subServices = parseSubServices(req.body?.sub_services);
    if (!subServices.length) return res.status(400).json({ error: "Please choose at least one service" });

    const preferredDate = String(req.body?.preferred_date || "").trim();
    if (preferredDate) {
      if (!DATE_RE.test(preferredDate)) return res.status(400).json({ error: "Invalid preferred date" });
      if (preferredDate < ymd(new Date(Date.now() - 86400000))) return res.status(400).json({ error: "The preferred date cannot be in the past" });
    }
    const slotRaw = String(req.body?.preferred_slot || "ANY").toUpperCase();
    const slot = REQUEST_SLOTS.includes(slotRaw) ? slotRaw : "ANY";
    const notes = String(req.body?.notes || "").trim().slice(0, 1000) || null;
    const site = req.clientAccess.sites.find((s) => s.id === siteId);

    const id = uuid();
    await pool.query(
      `INSERT INTO client_service_requests
         (id, company_id, site_id, requested_by, service_type, sub_services, preferred_date, preferred_slot, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`,
      [id, site.company_id, siteId, req.user.id, serviceType, JSON.stringify(subServices), preferredDate || null, slot, notes]
    );
    res.status(201).json({ id });
  } catch (err) {
    sendError(res, err, "service request");
  }
});

// PATCH /api/client-portal/service-requests/:id/cancel -> only while still NEW
router.patch("/service-requests/:id/cancel", async (req, res) => {
  try {
    const { siteIds } = req.clientAccess;
    const [result] = await pool.query(
      `UPDATE client_service_requests SET status = 'CANCELLED', handled_at = NOW()
       WHERE id = ? AND status = 'NEW' AND site_id IN (${placeholders(siteIds)})`,
      [req.params.id, ...siteIds]
    );
    if (!result.affectedRows) return res.status(409).json({ error: "This request can no longer be cancelled" });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "service request");
  }
});

// GET /api/client-portal/outlets?from=&to= -> every outlet this login can see, with a summary
router.get("/outlets", async (req, res) => {
  try {
    const { from, to } = resolveRange(req);
    const outlets = await buildOutletSummaries(req.clientAccess.sites, req.clientAccess.siteIds, from, to);
    res.json({ range: { from, to }, outlets });
  } catch (err) {
    sendError(res, err, "outlets");
  }
});

// GET /api/client-portal/outlets/:siteId -> one outlet in detail
router.get("/outlets/:siteId", async (req, res) => {
  try {
    const siteId = String(req.params.siteId);
    if (!req.clientAccess.siteIds.includes(siteId)) {
      return res.status(404).json({ error: "Outlet not found" });
    }

    const [[outlet]] = await pool.query(
      `SELECT s.id, s.name, s.address, s.city, s.state, s.company_id,
              l.postal_code, l.latitude, l.longitude, l.formatted_address,
              b.name AS branch_name
       FROM sites s
       LEFT JOIN locations l ON l.id = s.location_id
       LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.id = ?`,
      [siteId]
    );

    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total_jobs,
              SUM(j.status IN ('NOT_STARTED','IN_PROGRESS')) AS active_jobs,
              SUM(j.status = 'COMPLETED') AS completed_jobs
       FROM jobs j
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0`,
      [siteId]
    );
    const [[visitStats]] = await pool.query(
      `SELECT SUM(v.status = 'COMPLETED') AS visits_done,
              MAX(CASE WHEN v.status = 'COMPLETED' THEN v.completed_at END) AS last_visit,
              MIN(CASE WHEN v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE() THEN v.scheduled_date END) AS next_visit
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0`,
      [siteId]
    );

    // Services at this outlet: one row per service type.
    const [services] = await pool.query(
      `SELECT j.service_type,
              COUNT(DISTINCT j.id) AS jobs,
              COUNT(DISTINCT CASE WHEN j.status IN ('NOT_STARTED','IN_PROGRESS') THEN j.id END) AS active_jobs,
              MAX(CASE WHEN v.status = 'COMPLETED' THEN v.completed_at END) AS last_done,
              MIN(CASE WHEN v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE() THEN v.scheduled_date END) AS next_due
       FROM jobs j
       LEFT JOIN job_visits v ON v.job_id = j.id
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0
       GROUP BY j.service_type
       ORDER BY jobs DESC`,
      [siteId]
    );

    const [upcomingVisits] = await pool.query(
      `SELECT v.id, v.job_id, v.visit_number, v.scheduled_date, v.status, j.code AS job_code, j.service_type
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0
         AND v.status = 'SCHEDULED' AND v.scheduled_date >= CURDATE()
       ORDER BY v.scheduled_date ASC
       LIMIT 5`,
      [siteId]
    );
    const [recentVisits] = await pool.query(
      `SELECT v.id, v.job_id, v.visit_number, v.scheduled_date, v.completed_at, v.status, j.code AS job_code, j.service_type
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0
         AND v.status IN ('COMPLETED','MISSED','CANCELED')
       ORDER BY COALESCE(v.completed_at, v.scheduled_date) DESC
       LIMIT 8`,
      [siteId]
    );

    const [recentJobs] = await pool.query(
      `SELECT j.id, j.code, j.service_type, j.sub_service, j.status, j.created_at, j.completed_at, j.due_date
       FROM jobs j
       WHERE j.company_id = ? AND COALESCE(j.is_archived, 0) = 0
       ORDER BY j.created_at DESC
       LIMIT 10`,
      [siteId]
    );

    const outletComplaintScope = complaintScope(req, { siteIds: [siteId], singleSite: siteId });
    const [complaints] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at
       FROM job_tickets t
       WHERE ${outletComplaintScope.sql}
       ORDER BY t.created_at DESC
       LIMIT 5`,
      outletComplaintScope.params
    );

    const [audits] = await pool.query(
      `SELECT a.id, a.audit_number, a.audit_date, a.audit_type,
              COALESCE(a.overall_risk_override, a.overall_risk) AS risk
       FROM audits a
       WHERE a.site_id = ? AND a.status = 'SUBMITTED'
       ORDER BY a.audit_date DESC
       LIMIT 5`,
      [siteId]
    );

    // The client's own people registered at this outlet.
    const [contacts] = await pool.query(
      `SELECT c.id, c.name, c.role, c.phone, c.email, c.is_primary
       FROM contacts c
       WHERE c.company_id = ? AND COALESCE(c.is_active, 1) = 1
       ORDER BY c.is_primary DESC, c.name
       LIMIT 10`,
      [siteId]
    );

    const [[openComplaints]] = await pool.query(
      `SELECT COUNT(*) AS n
       FROM job_tickets t
       WHERE ${outletComplaintScope.sql} AND t.status IN ('OPEN','IN_PROGRESS')`,
      outletComplaintScope.params
    );

    const n = (v) => Number(v || 0);
    res.json({
      outlet: {
        ...outlet,
        latitude: outlet.latitude != null ? Number(outlet.latitude) : null,
        longitude: outlet.longitude != null ? Number(outlet.longitude) : null,
      },
      stats: {
        total_jobs: n(stats.total_jobs),
        active_jobs: n(stats.active_jobs),
        completed_jobs: n(stats.completed_jobs),
        visits_done: n(visitStats.visits_done),
        last_visit: visitStats.last_visit || null,
        next_visit: visitStats.next_visit || null,
        open_complaints: n(openComplaints.n),
        audit_risk: audits[0]?.risk || null,
        audit_date: audits[0]?.audit_date || null,
      },
      services: services.map((s) => ({ ...s, jobs: n(s.jobs), active_jobs: n(s.active_jobs) })),
      upcoming_visits: upcomingVisits,
      recent_visits: recentVisits,
      recent_jobs: recentJobs,
      complaints,
      audits,
      contacts: contacts.map((c) => ({ ...c, is_primary: !!c.is_primary })),
    });
  } catch (err) {
    sendError(res, err, "outlet");
  }
});

module.exports = router;
