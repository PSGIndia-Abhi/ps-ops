const crypto = require("crypto");
const { pool } = require("../../db");
const { HttpError, inTransaction, addHistory, optionalDate } = require("./feedback.service");

// ---------------------------------------------------------------------------
// Customer Feedback - call schedules (Feedback Desk > Masters > Call schedule).
//
// A site gets feedback calls only when a schedule covers it: its own rule, else its customer's
// rule (all the customer's sites). Sites without one get no calls.
//   EVERY_N_DAYS        a call every N days from the start date (with or without a service since
//                       the last call; the call page then shows the last earlier service).
//   AFTER_EACH_SERVICE  a call the day after each service; first_services = only the customer's /
//                       site's first N services from the start date (e.g. a new customer's first 3),
//                       then a call every then_every_days days (or none when it is empty).
// service_types limits the services that count (empty = all).
//
// Calls are made by generateDueCalls (the feedback cron, saving a schedule, opening the call
// list): on its due date a call is added as TO_CALL. A site with a call not done yet gets no new
// one (they don't pile up); a call not done on its day stays on the list as overdue.
// Each call asks about the services from period_start (where the last call stopped) to its due date.
// ---------------------------------------------------------------------------

//   MONTH_DAYS          a call on given days of every month (month_days: [1] = the 1st, [1, 15]...; a
//                       day past the month's end = its last day) - with or without a service since
//                       the last call.
const MODES = ["EVERY_N_DAYS", "MONTH_DAYS", "AFTER_EACH_SERVICE"];
const DAY = 86400000;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const maxDate = (...dates) => dates.filter(Boolean).sort().at(-1);

const VISIT_DATE = "COALESCE(v.completed_at, v.scheduled_date)";
const SERVICE_NAME = "COALESCE(NULLIF(j.sub_service, ''), j.service_type)";

function jsonList(value) {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

// The days of the month of a MONTH_DAYS rule, as numbers.
const monthDaysOf = (value) => [...new Set(jsonList(value).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31))].sort((a, b) => a - b);
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] || "");

/** "Every 7 days", "On the 1st and 15th of every month", "After each service (first 3), then every 15 days" ... */
function ruleText(r) {
  const services = jsonList(r.service_types);
  const only = services.length ? ` · only ${services.join(", ")}` : "";
  if (r.mode === "EVERY_N_DAYS") return `Every ${r.every_days} day${r.every_days === 1 ? "" : "s"}${only}`;
  if (r.mode === "MONTH_DAYS") return `On the ${listText(monthDaysOf(r.month_days).map(ordinal))} of every month${only}`;
  const first = r.first_services ? ` (first ${r.first_services})` : "";
  const then = r.first_services ? (r.then_every_days ? `, then every ${r.then_every_days} days` : ", then no more calls") : "";
  return `After each service${first}${then}${only}`;
}

function scheduleRow(r) {
  return {
    id: r.id,
    customer: { id: r.company_id, name: r.company_name },
    site: r.site_id ? { id: r.site_id, name: r.site_name, city: r.site_city } : null,
    mode: r.mode,
    every_days: r.every_days,
    first_services: r.first_services,
    then_every_days: r.then_every_days,
    month_days: monthDaysOf(r.month_days),
    service_types: jsonList(r.service_types),
    start_date: r.start_date,
    end_date: r.end_date,
    note: r.note,
    is_active: Boolean(r.is_active),
    // Its end date has passed while it is still on: someone should schedule it again or close it.
    ended: Boolean(r.is_active) && Boolean(r.end_date) && Boolean(r.ended),
    text: ruleText(r),
    calls_made: Number(r.calls_made || 0),
    last_due_date: r.last_due_date,
    updated_at: r.updated_at,
    updated_by: r.updated_by_name || null,
  };
}

// GET /schedules - every schedule, customer rules first, then their sites' own rules.
async function listSchedules() {
  const [rows] = await pool.query(
    `SELECT fs.*, DATE_FORMAT(fs.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(fs.end_date, '%Y-%m-%d') AS end_date,
            co.name AS company_name, s.name AS site_name, s.city AS site_city, u.name AS updated_by_name,
            (fs.end_date IS NOT NULL AND fs.end_date < CURDATE()) AS ended,
            (SELECT COUNT(*) FROM feedback_requests r WHERE r.schedule_id = fs.id) AS calls_made,
            (SELECT DATE_FORMAT(MAX(r.due_date), '%Y-%m-%d') FROM feedback_requests r WHERE r.schedule_id = fs.id) AS last_due_date
     FROM feedback_schedules fs
     JOIN companies co ON co.id = fs.company_id
     LEFT JOIN sites s ON s.id = fs.site_id
     LEFT JOIN users u ON u.id = COALESCE(fs.updated_by, fs.created_by)
     ORDER BY fs.is_active DESC, co.name, fs.site_id IS NOT NULL, s.name`
  );
  return rows.map(scheduleRow);
}

// GET /schedules/options - customers with their sites, and the service names, for the form.
async function scheduleOptions() {
  const [rows] = await pool.query(
    `SELECT co.id AS company_id, co.name AS company_name, s.id AS site_id, s.name AS site_name, s.city AS site_city
     FROM companies co JOIN sites s ON s.company_id = co.id
     ORDER BY co.name, s.name`
  );
  const customers = new Map();
  for (const r of rows) {
    if (!customers.has(r.company_id)) customers.set(r.company_id, { id: r.company_id, name: r.company_name, sites: [] });
    customers.get(r.company_id).sites.push({ id: r.site_id, name: r.site_name, city: r.site_city });
  }
  const [services] = await pool.query(
    `SELECT DISTINCT ${SERVICE_NAME} AS name FROM jobs j WHERE ${SERVICE_NAME} IS NOT NULL AND ${SERVICE_NAME} <> '' ORDER BY name`
  );
  return { customers: [...customers.values()], services: services.map((s) => s.name) };
}

function wholeNumber(value, label, { min = 1, max = 365, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `Enter ${label}`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label[0].toUpperCase()}${label.slice(1)} must be a whole number from ${min} to ${max}`);
  return n;
}

// Who a schedule is for: a customer (all its sites, site_id null) or one of its sites.
async function cleanTarget(conn, t) {
  const companyId = typeof t?.company_id === "string" ? t.company_id.trim() : "";
  if (!companyId) throw new HttpError(400, "Choose the customer");
  const [[company]] = await conn.query("SELECT id, name FROM companies WHERE id = ?", [companyId]);
  if (!company) throw new HttpError(400, "Customer not found");
  const siteId = typeof t?.site_id === "string" && t.site_id.trim() ? t.site_id.trim() : null;
  if (siteId) {
    const [[site]] = await conn.query("SELECT id FROM sites WHERE id = ? AND company_id = ?", [siteId, companyId]);
    if (!site) throw new HttpError(400, `That site is not one of ${company.name}'s sites`);
  }
  return { company_id: companyId, site_id: siteId };
}

// The rule fields from a request body, checked.
function cleanRule(body) {
  const mode = String(body?.mode || "").toUpperCase();
  if (!MODES.includes(mode)) throw new HttpError(400, "Choose when to call: every few days, on dates of the month, or after each service");
  const everyDays = mode === "EVERY_N_DAYS" ? wholeNumber(body.every_days, "the number of days", { required: true }) : null;
  let monthDays = null;
  if (mode === "MONTH_DAYS") {
    const raw = Array.isArray(body?.month_days) ? body.month_days : [];
    if (raw.some((n) => !Number.isInteger(Number(n)) || Number(n) < 1 || Number(n) > 31)) throw new HttpError(400, "A day of the month must be from 1 to 31");
    const days = monthDaysOf(raw);
    if (!days.length) throw new HttpError(400, "Pick at least one date of the month");
    monthDays = JSON.stringify(days);
  }
  const firstServices = mode === "AFTER_EACH_SERVICE" ? wholeNumber(body.first_services, "the number of services", { max: 100 }) : null;
  const thenEvery = mode === "AFTER_EACH_SERVICE" && firstServices ? wholeNumber(body.then_every_days, "the number of days after that") : null;
  const services = Array.isArray(body?.service_types) ? [...new Set(body.service_types.map((x) => String(x || "").trim()).filter(Boolean))] : [];
  if (services.length > 50) throw new HttpError(400, "Pick at most 50 services");
  if (services.some((x) => x.length > 150)) throw new HttpError(400, "A service name is too long");
  const startDate = optionalDate(body?.start_date, "Start date");
  if (!startDate) throw new HttpError(400, "Choose the start date");
  const endDate = optionalDate(body?.end_date, "End date");
  if (endDate && endDate < startDate) throw new HttpError(400, "The end date must be on or after the start date");
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  const isActive = body?.is_active === undefined ? true : Boolean(body.is_active);
  return {
    mode, every_days: everyDays, first_services: firstServices, then_every_days: thenEvery, month_days: monthDays,
    service_types: services.length ? JSON.stringify(services) : null, start_date: startDate, end_date: endDate, note, is_active: isActive ? 1 : 0,
  };
}

// One switched-on rule per customer (all sites) and per site.
async function checkOneRule(conn, s, exceptId) {
  if (!s.is_active) return;
  const [[other]] = await conn.query(
    `SELECT id FROM feedback_schedules WHERE is_active = 1 AND company_id = ? AND ${s.site_id ? "site_id = ?" : "site_id IS NULL"} ${exceptId ? "AND id <> ?" : ""} LIMIT 1`,
    [s.company_id, ...(s.site_id ? [s.site_id] : []), ...(exceptId ? [exceptId] : [])]
  );
  if (!other) return;
  const [[n]] = await conn.query("SELECT co.name AS customer, s.name AS site FROM companies co LEFT JOIN sites s ON s.id = ? WHERE co.id = ?", [s.site_id, s.company_id]);
  throw new HttpError(
    409,
    s.site_id
      ? `${n?.site || "This site"} (${n?.customer || "customer"}) already has a schedule - edit that one`
      : `${n?.customer || "This customer"} already has a schedule for all its sites - edit that one`
  );
}

// POST /schedules (new) and PUT /schedules/:id (change). Then the calls due today are added.
// The rule goes to each of body.targets: [{ company_id, site_id? }] - one schedule each (customers
// with all their sites, and single sites, picked together). Older form: body.company_id / site_id.
// A change (PUT) has one target.
async function saveSchedule(req, id, body) {
  const raw = Array.isArray(body?.targets) && body.targets.length ? body.targets : [{ company_id: body?.company_id, site_id: body?.site_id }];
  if (raw.length > 200) throw new HttpError(400, "Pick at most 200 customers and sites at once");
  if (id && raw.length > 1) throw new HttpError(400, "A schedule is for one customer or one site - add the others as new schedules");
  await inTransaction(async (conn) => {
    const rule = cleanRule(body);
    const targets = [];
    const seen = new Set();
    for (const t of raw) {
      const target = await cleanTarget(conn, t);
      const key = `${target.company_id}|${target.site_id || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }
    for (const target of targets) {
      const s = { ...target, ...rule };
      const keys = Object.keys(s);
      if (id) {
        const [[found]] = await conn.query("SELECT id FROM feedback_schedules WHERE id = ? FOR UPDATE", [id]);
        if (!found) throw new HttpError(404, "Schedule not found");
        await checkOneRule(conn, s, Number(id));
        await conn.query(`UPDATE feedback_schedules SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_by = ? WHERE id = ?`, [...keys.map((k) => s[k]), req.user.id, id]);
      } else {
        await checkOneRule(conn, s, null);
        await conn.query(
          `INSERT INTO feedback_schedules (${keys.join(", ")}, created_by, updated_by) VALUES (${keys.map(() => "?").join(", ")}, ?, ?)`,
          [...keys.map((k) => s[k]), req.user.id, req.user.id]
        );
      }
    }
  });
  await generateDueCalls();
}

// DELETE /schedules/:id - the calls it made stay.
async function deleteSchedule(id) {
  const [result] = await pool.query("DELETE FROM feedback_schedules WHERE id = ?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Schedule not found");
}

/* ------------------------------------------------------------ making the calls */

// The site's services from `from` up to today, oldest first (the rule's services only).
async function siteServices(siteId, from, rule) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(${VISIT_DATE}, '%Y-%m-%d') AS d, ${SERVICE_NAME} AS service
     FROM job_visits v JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
       AND ${VISIT_DATE} >= ? AND ${VISIT_DATE} < CURDATE() + INTERVAL 1 DAY
     ORDER BY ${VISIT_DATE}, v.id`,
    [siteId, from]
  );
  const only = new Set(jsonList(rule.service_types).map((x) => x.toLowerCase()));
  return rows.filter((r) => !only.size || only.has(String(r.service || "").toLowerCase()));
}

// Every N days from `anchor`: the latest due date up to `until` (a call is made whether or not the
// site had a service; the call page shows the last earlier service when there was none).
// covered = where the last call's period stopped.
function everyDaysCall(anchor, days, until, covered, ruleStart) {
  const k = Math.floor(daysBetween(anchor, until) / days);
  if (k < 1) return null;
  const due = addDays(anchor, k * days);
  if (covered && due <= covered) return null;
  const start = maxDate(covered || addDays(due, -days), ruleStart);
  return { due, start };
}

// Whether a date is one of the days of the month (a day past the month's end = its last day).
function onMonthDay(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return days.some((n) => Math.min(n, last) === d);
}

// The latest matching day on or before `from`, not before `notBefore` (looks back ~2 months).
function lastMonthDay(days, from, notBefore) {
  for (let d = from, i = 0; i < 62 && d >= notBefore; d = addDays(d, -1), i += 1) {
    if (onMonthDay(d, days)) return d;
  }
  return null;
}

// On days of the month: the latest such day up to `until` (with or without a service since the
// last call). Its period: since the last call, or for the first call since the matching day before it.
function monthDaysCall(days, until, covered, ruleStart) {
  if (!days.length) return null;
  const due = lastMonthDay(days, until, ruleStart);
  if (!due || (covered && due <= covered)) return null;
  // The services since the last call - or, for the first one, since the matching day before it
  // (the 5th asks about 5th - 4th), even when that is before the start date: the start date is when
  // the calls begin, so a schedule starting on the 5th still calls on the 5th.
  const previous = lastMonthDay(days, addDays(due, -1), "2000-01-01") || addDays(due, -31);
  const start = covered && covered > previous ? covered : previous;
  return { due, start };
}

// The call a site should have now under its rule, or null.
async function dueCallFor(siteId, rule, today) {
  const [[last]] = await pool.query(
    // covered: where the last call's services stop - its period, but no later than the day it was
    // done (services after that weren't asked about; e.g. an old monthly call done on the 3rd).
    `SELECT status,
            DATE_FORMAT(IF(done_at IS NULL, period_end, LEAST(period_end, DATE(done_at) + INTERVAL 1 DAY)), '%Y-%m-%d') AS covered
     FROM feedback_requests WHERE site_id = ? ORDER BY due_date DESC LIMIT 1`,
    [siteId]
  );
  if (last && last.status !== "DONE") return null; // the last call isn't done yet
  const until = rule.end_date && rule.end_date < today ? rule.end_date : today;
  const covered = last?.covered || null;

  if (rule.mode === "EVERY_N_DAYS") return everyDaysCall(rule.start_date, rule.every_days, until, covered, rule.start_date);
  if (rule.mode === "MONTH_DAYS") return monthDaysCall(monthDaysOf(rule.month_days), until, covered, rule.start_date);

  // After each service: the site's services since the start date.
  const services = await siteServices(siteId, rule.start_date, rule);

  // After each service: a call the day after it (one call covers the services since the last call).
  const counted = rule.first_services ? services.slice(0, rule.first_services) : services;
  const waiting = counted.filter((v) => (!covered || v.d >= covered) && addDays(v.d, 1) <= until);
  if (waiting.length) {
    const due = addDays(waiting.at(-1).d, 1);
    return { due, start: maxDate(covered, rule.start_date) };
  }
  // After the first N services: every N days from the day after the Nth service.
  if (rule.first_services && rule.then_every_days && services.length >= rule.first_services) {
    const anchor = addDays(services[rule.first_services - 1].d, 1);
    return everyDaysCall(anchor, rule.then_every_days, until, covered, anchor);
  }
  return null;
}

// Adds the calls that are due today (or were due and not made yet). Returns how many it added.
async function generateDueCalls() {
  const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  const [rules] = await pool.query(
    `SELECT id, company_id, site_id, mode, every_days, first_services, then_every_days, month_days, service_types,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM feedback_schedules WHERE is_active = 1 AND start_date <= ?`,
    [today]
  );
  if (!rules.length) return 0;
  // Each site's rule: its own, else its customer's.
  const bySite = new Map();
  const customerRules = new Map(rules.filter((r) => !r.site_id).map((r) => [r.company_id, r]));
  if (customerRules.size) {
    const [sites] = await pool.query("SELECT id, company_id FROM sites WHERE company_id IN (?)", [[...customerRules.keys()]]);
    for (const s of sites) bySite.set(s.id, { rule: customerRules.get(s.company_id), companyId: s.company_id });
  }
  for (const r of rules.filter((x) => x.site_id)) bySite.set(r.site_id, { rule: r, companyId: r.company_id });

  let added = 0;
  for (const [siteId, { rule, companyId }] of bySite) {
    const call = await dueCallFor(siteId, rule, today);
    if (!call) continue;
    const id = crypto.randomUUID();
    const [result] = await pool.query(
      `INSERT IGNORE INTO feedback_requests (id, period_month, due_date, period_start, period_end, schedule_id, company_id, site_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TO_CALL')`,
      [id, `${call.due.slice(0, 7)}-01`, call.due, call.start, call.due, rule.id, companyId, siteId]
    );
    if (!result.affectedRows) continue;
    added += 1;
    await addHistory(pool, { requestId: id, event: "SCHEDULED", to: "TO_CALL", note: `Due ${call.due} - ${ruleText(rule)}` });
  }
  return added;
}

// The same, at most every few minutes (the call list asks each time it opens).
let lastRun = 0;
let running = null;
async function ensureDueCalls(maxAgeMs = 5 * 60000) {
  if (Date.now() - lastRun < maxAgeMs) return 0;
  if (running) return running;
  running = generateDueCalls()
    .then((n) => {
      lastRun = Date.now();
      return n;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

module.exports = { listSchedules, scheduleOptions, saveSchedule, deleteSchedule, generateDueCalls, ensureDueCalls, ruleText, MODES };
