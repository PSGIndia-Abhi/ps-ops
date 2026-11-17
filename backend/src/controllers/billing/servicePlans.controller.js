// Service plans (set by the Service Coordinator) and the Service Tracker.
// Payloads: docs/Invoice Generation - API Payloads.docx §5, §6.

const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const T = require("../../services/billing/tracker.service");
const { notifyUsers } = require("../../services/notifications.service");
const { logAudit } = require("../../services/Audit.service");

const COPY_LABELS = ["Original for Recipient", "Duplicate for Transporter", "Triplicate for Supplier", "Extra copy"];

function planOut(plan, extra = {}) {
  const lines = (plan.lines || []).map((l) => ({
    id: l.id,
    site_id: l.site_id,
    site: l.site || null,
    service_type: l.service_type,
    sub_service: l.sub_service,
    visits_per_month: Number(l.visits_per_month),
  }));
  return {
    id: plan.id,
    company_id: plan.company_id,
    version: Number(plan.version),
    effective_from: C.ymd(plan.effective_from),
    status: plan.status,
    print_copies: Number(plan.print_copies),
    copy_labels: COPY_LABELS.slice(0, Number(plan.print_copies)),
    invoices_per_month: Number(plan.invoices_per_month),
    invoice_split: plan.invoice_split,
    shortfall_highlight_day: Number(plan.shortfall_highlight_day),
    lines,
    services_per_month: lines.reduce((t, l) => t + l.visits_per_month, 0),
    updated_at: plan.updated_at,
    ...extra,
  };
}

// GET /service-plans?q=&missing=false&page=1&page_size=50
const listPlans = C.handle("Failed to load service plans", async (req, res) => {
  const q = C.str(req.query.q, "q", { max: 100 });
  const { page, pageSize, offset } = C.paging(req.query);
  const today = C.todayIst();
  const monthStart = `${today.slice(0, 7)}-01`;
  // Every customer with an active contract or a plan.
  const [rows] = await pool.query(
    `SELECT c.id AS company_id, c.name AS customer,
            (SELECT COUNT(*) FROM sites s WHERE s.company_id = c.id) AS outlets,
            sp.id AS plan_id, sp.version, sp.effective_from, sp.print_copies, sp.invoices_per_month, sp.invoice_split,
            u.name AS updated_by,
            (SELECT SUM(l.visits_per_month) FROM billing_service_plan_lines l WHERE l.plan_id = sp.id) AS services_per_month,
            (SELECT GROUP_CONCAT(l.sub_service ORDER BY l.sort_order SEPARATOR ' · ')
               FROM billing_service_plan_lines l WHERE l.plan_id = sp.id) AS services_summary,
            (SELECT JSON_OBJECT('effective_from', DATE_FORMAT(x.effective_from, '%Y-%m-%d'),
                                'services_per_month', (SELECT SUM(xl.visits_per_month) FROM billing_service_plan_lines xl WHERE xl.plan_id = x.id))
               FROM billing_service_plans x WHERE x.company_id = c.id AND x.status = 'SCHEDULED'
              ORDER BY x.effective_from LIMIT 1) AS pending_change
       FROM companies c
       LEFT JOIN billing_service_plans sp
              ON sp.company_id = c.id
             AND sp.effective_from = (SELECT MAX(x.effective_from) FROM billing_service_plans x
                                       WHERE x.company_id = c.id AND x.effective_from <= ?)
       LEFT JOIN users u ON u.id = sp.updated_by
      WHERE (EXISTS (SELECT 1 FROM billing_contracts bc WHERE bc.company_id = c.id AND bc.status = 'ACTIVE')
             OR EXISTS (SELECT 1 FROM billing_service_plans y WHERE y.company_id = c.id))
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%'))
      ORDER BY (sp.id IS NULL) DESC, c.name`,
    [today, q, q]
  );
  let out = rows.map((r) => ({
    company_id: r.company_id,
    customer: r.customer,
    outlets: Number(r.outlets),
    plan_id: r.plan_id,
    version: C.n2(r.version),
    services_summary: r.services_summary,
    services_per_month: C.n2(r.services_per_month),
    print_copies: C.n2(r.print_copies),
    invoices_per_month: C.n2(r.invoices_per_month),
    invoice_split: r.invoice_split,
    effective_from: C.ymd(r.effective_from),
    updated_by: r.updated_by,
    pending_change: C.json(r.pending_change, null),
  }));
  if (req.query.missing !== undefined) {
    const missing = C.bool(req.query.missing);
    out = out.filter((r) => Boolean(r.plan_id) !== missing);
  }
  const [[summary]] = await pool.query(
    `SELECT (SELECT COUNT(DISTINCT company_id) FROM billing_service_plans WHERE status = 'ACTIVE') AS with_plan,
            (SELECT COUNT(DISTINCT bc.company_id) FROM billing_contracts bc
              WHERE bc.status = 'ACTIVE'
                AND NOT EXISTS (SELECT 1 FROM billing_service_plans sp WHERE sp.company_id = bc.company_id AND sp.effective_from <= ?)) AS without_plan,
            (SELECT COALESCE(SUM(l.visits_per_month), 0) FROM billing_service_plans sp JOIN billing_service_plan_lines l ON l.plan_id = sp.id
              WHERE sp.effective_from = (SELECT MAX(x.effective_from) FROM billing_service_plans x
                                          WHERE x.company_id = sp.company_id AND x.effective_from <= ?)) AS planned_this_month,
            (SELECT COUNT(*) FROM billing_service_plans WHERE status = 'SCHEDULED') AS pending_changes`,
    [today, monthStart]
  );
  res.json({
    rows: out.slice(offset, offset + pageSize),
    total: out.length,
    page,
    page_size: pageSize,
    summary: {
      with_plan: Number(summary.with_plan),
      without_plan: Number(summary.without_plan),
      planned_this_month: Number(summary.planned_this_month),
      pending_changes: Number(summary.pending_changes),
    },
  });
});

// GET /service-plans/:companyId  (the plan in force today, or the next scheduled one)
const getPlan = C.handle("Failed to load the service plan", async (req, res) => {
  const companyId = req.params.companyId;
  const [[company]] = await pool.query("SELECT name FROM companies WHERE id = ?", [companyId]);
  if (!company) throw C.notFound("Customer not found");
  let plan = await T.planFor(pool, companyId, C.todayIst());
  if (!plan) {
    const [[next]] = await pool.query("SELECT effective_from FROM billing_service_plans WHERE company_id = ? ORDER BY effective_from LIMIT 1", [companyId]);
    if (next) plan = await T.planFor(pool, companyId, C.ymd(next.effective_from));
  }
  if (!plan) throw C.notFound("No service plan for this customer");
  const [[user]] = await pool.query("SELECT name FROM users WHERE id = ?", [plan.updated_by || plan.created_by || 0]);
  res.json(planOut(plan, { customer: company.name, updated_by: user?.name || null }));
});

// PUT /service-plans/:companyId  -> a new version from effective_from (or replaces the version with that date)
const savePlan = C.handle("Failed to save the service plan", async (req, res) => {
  const companyId = req.params.companyId;
  const b = req.body || {};
  const today = C.todayIst();
  const monthStart = `${today.slice(0, 7)}-01`;
  const effectiveFrom = C.date(b.effective_from, "effective_from", { required: true });
  if (effectiveFrom.slice(8, 10) !== "01" || effectiveFrom < monthStart) {
    throw C.bad("effective_from must be the first day of a month and not in the past");
  }
  const printCopies = C.num(b.print_copies, "print_copies", { required: true, integer: true });
  if (printCopies < 1 || printCopies > 4) throw C.bad("print_copies must be between 1 and 4");
  const split = C.oneOf(b.invoice_split, "invoice_split", ["ALL_OUTLETS", "PER_OUTLET"], { fallback: "ALL_OUTLETS" });
  const highlightDay = C.num(b.shortfall_highlight_day, "shortfall_highlight_day", { min: 1, max: 31, integer: true }) ?? 25;
  if (!Array.isArray(b.lines) || !b.lines.length) throw C.bad("Add at least one service to the plan");
  if (b.lines.length > 200) throw C.bad("Too many services in one plan");

  const result = await C.inTransaction(pool, async (conn) => {
    const [[company]] = await conn.query("SELECT id, name FROM companies WHERE id = ?", [companyId]);
    if (!company) throw C.notFound("Customer not found");
    const [siteRows] = await conn.query("SELECT id, name FROM sites WHERE company_id = ?", [companyId]);
    const siteNames = new Map(siteRows.map((s) => [s.id, s.name]));
    const seen = new Set();
    const lines = b.lines.map((raw, i) => {
      const at = `Service ${i + 1}`;
      const siteId = C.str(raw?.site_id, `${at}: site_id`, { required: true, max: 20 });
      if (!siteNames.has(siteId)) throw C.bad(`${siteId} does not belong to this customer`);
      const line = {
        site_id: siteId,
        service_type: C.str(raw.service_type, `${at}: service_type`, { required: true, max: 50 }),
        sub_service: C.str(raw.sub_service, `${at}: sub_service`, { required: true, max: 100 }),
        visits_per_month: C.num(raw.visits_per_month, `${at}: visits_per_month`, { required: true, integer: true }),
      };
      if (line.visits_per_month < 1 || line.visits_per_month > 31) throw C.bad("visits_per_month must be a whole number from 1 to 31");
      const key = `${siteId}|${line.service_type.toLowerCase()}|${line.sub_service.toLowerCase()}`;
      if (seen.has(key)) throw C.conflict(`${line.sub_service} is listed twice for ${siteNames.get(siteId)}`);
      seen.add(key);
      return line;
    });
    const invoicesPerMonth = split === "PER_OUTLET" ? new Set(lines.map((l) => l.site_id)).size : 1;
    const status = effectiveFrom <= today ? "ACTIVE" : "SCHEDULED";

    await conn.query("SELECT id FROM companies WHERE id = ? FOR UPDATE", [companyId]); // one save per customer at a time
    const [[sameDate]] = await conn.query("SELECT id, version FROM billing_service_plans WHERE company_id = ? AND effective_from = ?", [companyId, effectiveFrom]);
    let planId;
    let version;
    if (sameDate) {
      // A version with this start date already exists: replace its contents.
      planId = sameDate.id;
      version = Number(sameDate.version);
      await conn.query(
        `UPDATE billing_service_plans SET status = ?, print_copies = ?, invoice_split = ?, invoices_per_month = ?,
                shortfall_highlight_day = ?, updated_by = ? WHERE id = ?`,
        [status, printCopies, split, invoicesPerMonth, highlightDay, req.user.id, planId]
      );
      await conn.query("DELETE FROM billing_service_plan_lines WHERE plan_id = ?", [planId]);
    } else {
      const [[v]] = await conn.query("SELECT COALESCE(MAX(version), 0) + 1 AS next FROM billing_service_plans WHERE company_id = ?", [companyId]);
      planId = uuid();
      version = Number(v.next);
      await conn.query(
        `INSERT INTO billing_service_plans
           (id, company_id, version, effective_from, status, print_copies, invoice_split, invoices_per_month,
            shortfall_highlight_day, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [planId, companyId, version, effectiveFrom, status, printCopies, split, invoicesPerMonth, highlightDay, req.user.id, req.user.id]
      );
    }
    for (const [i, l] of lines.entries()) {
      await conn.query(
        "INSERT INTO billing_service_plan_lines (id, plan_id, site_id, service_type, sub_service, visits_per_month, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [uuid(), planId, l.site_id, l.service_type, l.sub_service, l.visits_per_month, i]
      );
    }
    if (status === "ACTIVE") {
      await conn.query(
        "UPDATE billing_service_plans SET status = 'ENDED' WHERE company_id = ? AND status = 'ACTIVE' AND id <> ? AND effective_from < ?",
        [companyId, planId, effectiveFrom]
      );
    }
    const total = lines.reduce((t, l) => t + l.visits_per_month, 0);
    await logAudit(conn, req, {
      module: "BILLING",
      action: "SERVICE_PLAN_SAVED",
      entity_type: "BILLING_SERVICE_PLAN",
      entity_id: planId,
      entity_label: `${company.name} v${version}`,
      customer_id: companyId,
      summary: `Service plan v${version} for ${company.name} from ${C.dmy(effectiveFrom)}: ${total} services / month, ${printCopies} print copies`,
    });
    return { id: planId, version, effective_from: effectiveFrom, status, services_per_month: total };
  });
  res.json(result);
});

// GET /service-plans/:companyId/history
const planHistory = C.handle("Failed to load the plan history", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT sp.version, sp.effective_from, sp.status, sp.print_copies, sp.invoices_per_month, sp.updated_at,
            (SELECT SUM(l.visits_per_month) FROM billing_service_plan_lines l WHERE l.plan_id = sp.id) AS services_per_month,
            u.name AS updated_by
       FROM billing_service_plans sp LEFT JOIN users u ON u.id = COALESCE(sp.updated_by, sp.created_by)
      WHERE sp.company_id = ?
      ORDER BY sp.effective_from DESC`,
    [req.params.companyId]
  );
  res.json(
    rows.map((r) => ({
      version: Number(r.version),
      effective_from: C.ymd(r.effective_from),
      status: r.status,
      services_per_month: Number(r.services_per_month || 0),
      print_copies: Number(r.print_copies),
      invoices_per_month: Number(r.invoices_per_month),
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    }))
  );
});

// ---- Service Tracker ---------------------------------------------------------------------

// GET /service-tracker?month=2026-11&status=SHORT&q=&company_id=&page=1&page_size=50
const tracker = C.handle("Failed to load the service tracker", async (req, res) => {
  const month = C.month(req.query.month || C.todayIst().slice(0, 7));
  const status = C.oneOf(req.query.status, "status", ["SHORT", "SCHEDULED", "COMPLETED", "EXTRA"], { required: false });
  const q = (C.str(req.query.q, "q", { max: 100 }) || "").toLowerCase();
  const companyId = C.str(req.query.company_id, "company_id", { max: 20 });
  const { page, pageSize, offset } = C.paging(req.query);
  const data = await T.trackerForMonth(pool, month, { companyId });
  let rows = data.rows;
  if (status) rows = rows.filter((r) => r.status === status);
  if (q) rows = rows.filter((r) => `${r.customer} ${r.site || ""} ${r.sub_service}`.toLowerCase().includes(q));
  res.json({ month: data.month, as_of: data.as_of, summary: data.summary, rows: rows.slice(offset, offset + pageSize), total: rows.length, page, page_size: pageSize });
});

// GET /service-tracker/jobs?site_id=&service_type=&sub_service=&month=
const trackerJobs = C.handle("Failed to load the visits", async (req, res) => {
  const siteId = C.str(req.query.site_id, "site_id", { required: true, max: 20 });
  const subService = C.str(req.query.sub_service, "sub_service", { required: true, max: 100 });
  const serviceType = C.str(req.query.service_type, "service_type", { max: 50 });
  const range = C.monthRange(C.month(req.query.month || C.todayIst().slice(0, 7)));
  const [rows] = await pool.query(
    `SELECT j.id AS job_id, j.code AS job_code, v.visit_number,
            DATE_FORMAT(v.scheduled_date, '%Y-%m-%d') AS scheduled_date, v.status, v.completed_at
       FROM job_visits v JOIN jobs j ON j.id = v.job_id
      WHERE j.company_id = ? AND j.sub_service = ? AND (? IS NULL OR j.service_type = ?) AND j.is_archived = 0
        AND COALESCE(v.completed_at, v.scheduled_date) >= ? AND COALESCE(v.completed_at, v.scheduled_date) < ?
      ORDER BY COALESCE(v.completed_at, v.scheduled_date)`,
    [siteId, subService, serviceType, serviceType, range.start, range.next]
  );
  res.json(rows);
});

// POST /service-tracker/notify { month, rows: [{ company_id, site_id, sub_service }], message }
const notifyOperations = C.handle("Failed to notify Operations", async (req, res) => {
  const b = req.body || {};
  const month = C.month(b.month || C.todayIst().slice(0, 7));
  if (!Array.isArray(b.rows) || !b.rows.length) throw C.bad("Select at least one short service");
  const data = await T.trackerForMonth(pool, month);
  const wanted = b.rows.map((r) => `${r.company_id}|${r.site_id}|${String(r.sub_service || "").toLowerCase()}`);
  const picked = data.rows.filter((r) => wanted.includes(`${r.company_id}|${r.site_id}|${r.sub_service.toLowerCase()}`) && r.pending > 0);
  if (!picked.length) throw C.bad("Select at least one short service");
  const message = C.str(b.message, "message", { max: 1000 })
    || picked.map((r) => `${r.pending} ${r.sub_service} visit${r.pending > 1 ? "s" : ""} at ${r.customer} ${r.site || ""} still pending for ${C.monthName(`${month}-01`)}.`).join(" ");
  const [users] = await pool.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('Operations Manager', 'Service Coordinator') AND (u.is_active IS NULL OR u.is_active = 1)`
  );
  const count = await notifyUsers(users.map((u) => u.id), {
    type: "SERVICE_SHORTFALL",
    title: "Services pending this month",
    message,
    entityType: "billing_service_tracker",
    entityId: month,
  }, { exceptUserId: req.user.id });
  res.json({ notified_users: count, services: picked.length });
});

module.exports = { listPlans, getPlan, savePlan, planHistory, tracker, trackerJobs, notifyOperations };
