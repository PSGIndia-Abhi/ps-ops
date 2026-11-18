// Service plans and the planned-vs-done tracker.
//
// A service plan (billing_service_plans + _lines, set by the Service Coordinator) fixes how many
// visits each outlet gets per month for each service. "Done" is counted from the jobs module:
// job_visits.status = 'COMPLETED' with completed_at in the period, on jobs whose outlet
// (jobs.company_id holds a site id), service_type and sub_service match the plan line.
// A line with no outlet (site_id NULL) covers the whole customer: jobs at ANY of its outlets
// count, matched on sub_service alone (service_type NULL = any job type).
// The same counts feed the Service Tracker screen, the Bill Run and the draft invoice lines.

const { todayIst, monthRange, addMonths } = require("./common");

const norm = (v) => String(v || "").trim().toLowerCase();
const fullKey = (site, type, sub) => `${site}|${norm(type)}|${norm(sub)}`;
const subKey = (site, sub) => `${site}|${norm(sub)}`;
const customerKey = (companyId, sub) => `${companyId}|${norm(sub)}`;

/** The plan version in force on `onDate` for a customer (with its lines), or null. */
async function planFor(db, companyId, onDate) {
  const [[plan]] = await db.query(
    `SELECT * FROM billing_service_plans
      WHERE company_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1`,
    [companyId, onDate]
  );
  if (!plan) return null;
  const [lines] = await db.query(
    `SELECT l.*, s.name AS site
       FROM billing_service_plan_lines l
       LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.plan_id = ?
      ORDER BY l.sort_order, s.name`,
    [plan.id]
  );
  return { ...plan, lines };
}

/**
 * Visit statistics between `from` (inclusive) and `to` (exclusive) for the outlets in `siteIds`
 * and for every outlet of the customers in `companyIds` (whole-customer plan lines).
 * Returns { byFull, bySub, byCustomer }: Maps keyed by site|service_type|sub_service,
 * site|sub_service and customer|sub_service, each
 * { done, job_ids, visit_ids, last_visit, missed_dates, scheduled_after_today, next_visit }.
 */
async function visitStats(db, siteIds, from, to, companyIds = []) {
  const byFull = new Map();
  const bySub = new Map();
  const byCustomer = new Map();
  const ids = [...new Set(siteIds.filter(Boolean))];
  const customers = [...new Set(companyIds.filter(Boolean))];
  if (!ids.length && !customers.length) return { byFull, bySub, byCustomer };

  // [null] keeps "IN (?)" valid when one of the two lists is empty (nothing matches NULL).
  const [rows] = await db.query(
    `SELECT j.company_id AS site_id, s.company_id AS customer_id, j.service_type, j.sub_service,
            j.id AS job_id, v.id AS visit_id, v.status,
            DATE_FORMAT(v.completed_at, '%Y-%m-%d') AS completed_on,
            DATE_FORMAT(v.scheduled_date, '%Y-%m-%d') AS scheduled_on
       FROM job_visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN sites s ON s.id = j.company_id
      WHERE j.is_archived = 0
        AND (j.company_id IN (?) OR s.company_id IN (?))
        AND ((v.status = 'COMPLETED' AND v.completed_at >= ? AND v.completed_at < ?)
          OR (v.status <> 'COMPLETED' AND v.scheduled_date >= ? AND v.scheduled_date < ?))`,
    [ids.length ? ids : [null], customers.length ? customers : [null], from, to, from, to]
  );

  const today = todayIst();
  const empty = () => ({ done: 0, job_ids: [], visit_ids: [], last_visit: null, missed_dates: [], scheduled_after_today: 0, next_visit: null });
  const add = (map, key, r) => {
    if (!map.has(key)) map.set(key, empty());
    const s = map.get(key);
    if (r.status === "COMPLETED") {
      s.done += 1;
      if (!s.job_ids.includes(r.job_id)) s.job_ids.push(r.job_id);
      s.visit_ids.push(r.visit_id);
      if (!s.last_visit || r.completed_on > s.last_visit) s.last_visit = r.completed_on;
    } else if (r.status === "CANCELED") {
      // a cancelled visit is neither done nor missed
    } else if (r.status === "MISSED" || (r.scheduled_on && r.scheduled_on < today)) {
      if (r.scheduled_on && !s.missed_dates.includes(r.scheduled_on)) s.missed_dates.push(r.scheduled_on);
    } else {
      s.scheduled_after_today += 1;
      if (!s.next_visit || r.scheduled_on < s.next_visit) s.next_visit = r.scheduled_on;
    }
  };
  for (const r of rows) {
    add(byFull, fullKey(r.site_id, r.service_type, r.sub_service), r);
    add(bySub, subKey(r.site_id, r.sub_service), r);
    if (r.customer_id) add(byCustomer, customerKey(r.customer_id, r.sub_service), r);
  }
  for (const map of [byFull, bySub, byCustomer]) for (const s of map.values()) s.missed_dates.sort();
  return { byFull, bySub, byCustomer };
}

/**
 * The stats for one outlet + service (service_type optional) from visitStats(). With no outlet
 * (a whole-customer line) it is every outlet of `companyId` for that service name.
 */
function statsFor(stats, siteId, serviceType, subService, companyId = null) {
  const s = !siteId
    ? stats.byCustomer?.get(customerKey(companyId, subService))
    : serviceType
      ? stats.byFull.get(fullKey(siteId, serviceType, subService))
      : stats.bySub.get(subKey(siteId, subService));
  return s || { done: 0, job_ids: [], visit_ids: [], last_visit: null, missed_dates: [], scheduled_after_today: 0, next_visit: null };
}

/** The site ids and (for whole-customer lines) customer ids that visitStats() needs for these plan lines. */
function statsScope(planLines, companyIdOf) {
  return {
    siteIds: planLines.filter((l) => l.site_id).map((l) => l.site_id),
    companyIds: planLines.filter((l) => !l.site_id).map(companyIdOf),
  };
}

/** SHORT | SCHEDULED | COMPLETED | EXTRA for a tracker row. */
function rowStatus(planned, done, scheduledAfterToday, periodOver) {
  if (done > planned) return "EXTRA";
  if (done === planned) return "COMPLETED";
  if (!periodOver && done + scheduledAfterToday >= planned) return "SCHEDULED";
  return "SHORT";
}

const STATUS_ORDER = { SHORT: 0, SCHEDULED: 1, EXTRA: 2, COMPLETED: 3 };

/**
 * The Service Tracker for a month: one row per plan line (customer, outlet, service) with
 * planned, done, pending, status and whether it is highlighted, plus the summary cards.
 */
async function trackerForMonth(db, month, { companyId = null } = {}) {
  const range = monthRange(month);
  const [planRows] = await db.query(
    `SELECT sp.id AS plan_id, sp.company_id, c.name AS customer, sp.shortfall_highlight_day,
            l.site_id, s.name AS site, l.service_type, l.sub_service, l.visits_per_month AS planned
       FROM billing_service_plans sp
       JOIN billing_service_plan_lines l ON l.plan_id = sp.id
       JOIN companies c ON c.id = sp.company_id
       LEFT JOIN sites s ON s.id = l.site_id
      WHERE sp.effective_from = (SELECT MAX(x.effective_from) FROM billing_service_plans x
                                  WHERE x.company_id = sp.company_id AND x.effective_from <= ?)
        AND (? IS NULL OR sp.company_id = ?)`,
    [range.start, companyId, companyId]
  );
  const scope = statsScope(planRows, (r) => r.company_id);
  const stats = await visitStats(db, scope.siteIds, range.start, range.next, scope.companyIds);

  const today = todayIst();
  const periodOver = range.end < today;
  const isCurrent = range.start <= today && today <= range.end;
  const dayOfMonth = Number(today.slice(8, 10));

  const rows = planRows.map((p) => {
    const s = statsFor(stats, p.site_id, p.service_type, p.sub_service, p.company_id);
    const planned = Number(p.planned);
    const status = rowStatus(planned, s.done, s.scheduled_after_today, periodOver);
    const highlight = s.done < planned && (periodOver || (isCurrent && dayOfMonth >= Number(p.shortfall_highlight_day)));
    return {
      company_id: p.company_id,
      customer: p.customer,
      site_id: p.site_id,
      site: p.site,
      service_type: p.service_type,
      sub_service: p.sub_service,
      planned,
      done: s.done,
      pending: Math.max(planned - s.done, 0),
      scheduled_after_today: s.scheduled_after_today,
      last_visit: s.last_visit,
      next_visit: s.next_visit,
      missed_dates: s.missed_dates,
      status,
      highlight,
    };
  });
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.customer.localeCompare(b.customer) || String(a.site || "").localeCompare(String(b.site || "")));

  const shortRows = rows.filter((r) => r.status === "SHORT");
  const planned = rows.reduce((t, r) => t + r.planned, 0);
  const done = rows.reduce((t, r) => t + Math.min(r.done, r.planned), 0);
  const summary = {
    planned,
    done,
    done_percent: planned ? Math.round((done * 100) / planned) : 0,
    short_customers: new Set(shortRows.map((r) => r.company_id)).size,
    short_services: shortRows.reduce((t, r) => t + r.pending, 0),
    scheduled_not_due: rows.reduce((t, r) => t + (r.status === "SCHEDULED" ? r.scheduled_after_today : 0), 0),
    extra: rows.reduce((t, r) => t + Math.max(r.done - r.planned, 0), 0),
  };
  return { month, as_of: today, summary, rows };
}

/**
 * Planned and done services of a customer for a billing period: the plan in force at the
 * period start, times the number of months in the period (a quarterly AMC plans 3 months).
 */
async function servicesForPeriod(db, companyId, periodStart, periodEnd, months = 1) {
  const plan = await planFor(db, companyId, periodStart);
  const lines = plan ? plan.lines : [];
  const scope = statsScope(lines, () => companyId);
  const stats = await visitStats(db, scope.siteIds, periodStart, addDayExclusive(periodEnd), scope.companyIds);
  const rows = lines.map((l) => {
    const s = statsFor(stats, l.site_id, l.service_type, l.sub_service, companyId);
    return { site_id: l.site_id, service_type: l.service_type, sub_service: l.sub_service, planned: Number(l.visits_per_month) * months, ...s };
  });
  return {
    plan,
    rows,
    stats,
    planned: rows.reduce((t, r) => t + r.planned, 0),
    done: rows.reduce((t, r) => t + Math.min(r.done, r.planned), 0),
  };
}

const addDayExclusive = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
};

/** Whole months covered by a period (at least 1): 2026-10-01..2026-12-31 -> 3. */
function monthsCount(start, end) {
  let n = 0;
  let cursor = start;
  while (cursor <= end && n < 24) {
    n += 1;
    cursor = addMonths(start, n);
  }
  return Math.max(n, 1);
}

module.exports = { planFor, visitStats, statsFor, statsScope, trackerForMonth, servicesForPeriod, rowStatus, addDayExclusive, monthsCount };
