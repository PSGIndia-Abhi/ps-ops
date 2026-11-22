const crypto = require("crypto");
const { pool } = require("../../db");
const { HttpError, inTransaction, addHistory, optionalDate, callList, openCall } = require("./feedback.service");

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

// The rules from a request body: body.rules = [{ mode, every_days, month_days, first_services,
// then_every_days }] (several "when to call" options at once), sharing the body's dates, note and
// services. Older form: one rule in the body itself.
function cleanRules(body) {
  const raw = Array.isArray(body?.rules) && body.rules.length ? body.rules : [body];
  if (raw.length > MODES.length) throw new HttpError(400, "Pick each way of calling once");
  const rules = raw.map((r) => cleanRule({ ...body, ...r }));
  if (new Set(rules.map((r) => r.mode)).size !== rules.length) throw new HttpError(400, "Pick each way of calling once");
  return rules;
}

// One switched-on rule per way of calling (mode), per customer (all sites) and per site.
async function checkOneRule(conn, s, exceptId) {
  if (!s.is_active) return;
  const [[other]] = await conn.query(
    `SELECT id FROM feedback_schedules WHERE is_active = 1 AND company_id = ? AND ${s.site_id ? "site_id = ?" : "site_id IS NULL"} AND mode = ? ${exceptId ? "AND id <> ?" : ""} LIMIT 1`,
    [s.company_id, ...(s.site_id ? [s.site_id] : []), s.mode, ...(exceptId ? [exceptId] : [])]
  );
  if (!other) return;
  const [[n]] = await conn.query("SELECT co.name AS customer, s.name AS site FROM companies co LEFT JOIN sites s ON s.id = ? WHERE co.id = ?", [s.site_id, s.company_id]);
  const how = ruleText(s).toLowerCase();
  throw new HttpError(
    409,
    s.site_id
      ? `${n?.site || "This site"} (${n?.customer || "customer"}) already has a schedule of this kind (${how}) - edit that one`
      : `${n?.customer || "This customer"} already has a schedule of this kind (${how}) for all its sites - edit that one`
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
    const rules = cleanRules(body);
    const targets = [];
    const seen = new Set();
    for (const t of raw) {
      const target = await cleanTarget(conn, t);
      const key = `${target.company_id}|${target.site_id || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }
    // Each target gets one schedule per way of calling. A change (PUT) keeps its schedule for the
    // first rule; any other rules picked while editing are added as new schedules for the same target.
    for (const target of targets) for (const [n, rule] of rules.entries()) {
      const s = { ...target, ...rule };
      const keys = Object.keys(s);
      if (id && n === 0) {
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
// onAnchor: the first call is ON the anchor day itself (a schedule starting 7 Nov, every 15 days, calls
// 7 Nov, 22 Nov, 7 Dec...); that first call asks about the N days before it. Without it the first call
// is one period after the anchor (used after the first N services, whose own call is on the anchor day).
function everyDaysCall(anchor, days, until, covered, ruleStart, { onAnchor = false } = {}) {
  const passed = daysBetween(anchor, until);
  if (passed < 0) return null;
  const k = Math.floor(passed / days);
  if (k < 1 && !onAnchor) return null;
  const due = addDays(anchor, k * days);
  if (covered && due <= covered) return null;
  const start = onAnchor ? maxDate(covered, addDays(due, -days)) : maxDate(covered || addDays(due, -days), ruleStart);
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

  if (rule.mode === "EVERY_N_DAYS") return everyDaysCall(rule.start_date, rule.every_days, until, covered, rule.start_date, { onAnchor: true });
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

// Each site's rules: its own (one per way of calling), else its customer's.
// site id -> { rules, companyId, own }.
async function rulesBySite(rules) {
  const bySite = new Map();
  const customerRules = new Map();
  for (const r of rules.filter((x) => !x.site_id)) customerRules.set(r.company_id, [...(customerRules.get(r.company_id) || []), r]);
  if (customerRules.size) {
    const [sites] = await pool.query("SELECT id, company_id FROM sites WHERE company_id IN (?)", [[...customerRules.keys()]]);
    for (const s of sites) bySite.set(s.id, { rules: customerRules.get(s.company_id), companyId: s.company_id, own: false });
  }
  for (const r of rules.filter((x) => x.site_id)) {
    const cur = bySite.get(r.site_id);
    bySite.set(r.site_id, { rules: cur?.own ? [...cur.rules, r] : [r], companyId: r.company_id, own: true });
  }
  return bySite;
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
  const bySite = await rulesBySite(rules);

  let added = 0;
  for (const [siteId, { rules: siteRules, companyId }] of bySite) {
    // Several rules can be due: one call, for the latest due date (calls never pile up).
    let call = null;
    let rule = null;
    for (const r of siteRules) {
      const c = await dueCallFor(siteId, r, today);
      if (c && (!call || c.due > call.due)) [call, rule] = [c, r];
    }
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

/* ------------------------------------------------------------ upcoming calls (forecast) */

// The site's services (booked ones too) from `from` up to and including `until`, oldest first.
async function bookedServices(siteId, from, until, rule) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(${VISIT_DATE}, '%Y-%m-%d') AS d, ${SERVICE_NAME} AS service
     FROM job_visits v JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
       AND ${VISIT_DATE} >= ? AND ${VISIT_DATE} < ? + INTERVAL 1 DAY
     ORDER BY ${VISIT_DATE}, v.id`,
    [siteId, from, until]
  );
  const only = new Set(jsonList(rule.service_types).map((x) => x.toLowerCase()));
  return rows.filter((r) => !only.size || only.has(String(r.service || "").toLowerCase()));
}

// Whether the rule calls on `day`. For "after each service" this uses the services booked so far,
// so it can change if visits are booked or moved.
async function ruleCallsOn(siteId, rule, day) {
  if (day < rule.start_date || (rule.end_date && day > rule.end_date)) return false;
  if (rule.mode === "EVERY_N_DAYS") return daysBetween(rule.start_date, day) % rule.every_days === 0;
  if (rule.mode === "MONTH_DAYS") return onMonthDay(day, monthDaysOf(rule.month_days));

  const dayBefore = addDays(day, -1);
  const services = await bookedServices(siteId, rule.start_date, dayBefore, rule);
  const counted = rule.first_services ? services.slice(0, rule.first_services) : services;
  if (counted.some((v) => v.d === dayBefore)) return true;
  if (rule.first_services && rule.then_every_days && services.length >= rule.first_services) {
    const passed = daysBetween(addDays(services[rule.first_services - 1].d, 1), day);
    return passed > 0 && passed % rule.then_every_days === 0;
  }
  return false;
}

// Where the services the call asks about start, as the call made on `day` would have it
// (the same periods as dueCallFor). covered = where the site's last call stopped.
function forecastStart(rule, day, covered) {
  if (rule.mode === "EVERY_N_DAYS") return maxDate(covered, addDays(day, -rule.every_days));
  if (rule.mode === "MONTH_DAYS") {
    const previous = lastMonthDay(monthDaysOf(rule.month_days), addDays(day, -1), "2000-01-01") || addDays(day, -31);
    return covered && covered > previous ? covered : previous;
  }
  return maxDate(covered, rule.start_date);
}

function aheadDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new HttpError(400, "Pick 1 to 7 days ahead");
  return days;
}

// The calls the schedules will make on one day ahead (today + days) that are not made yet.
// Nothing is saved. A site whose last call is still open gets no new call until it is done (waiting).
// [{ siteId, companyId, rule, start, waiting }]; onlySite limits it to one site.
async function forecastCalls(day, onlySite = null) {
  const [rules] = await pool.query(
    `SELECT id, company_id, site_id, mode, every_days, first_services, then_every_days, month_days, service_types,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM feedback_schedules WHERE is_active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`,
    [day, day]
  );
  if (!rules.length) return [];

  const due = [];
  for (const [siteId, { rules: siteRules, companyId }] of await rulesBySite(rules)) {
    if (onlySite && siteId !== onlySite) continue;
    for (const r of siteRules) {
      if (await ruleCallsOn(siteId, r, day)) {
        due.push({ siteId, companyId, rule: r });
        break;
      }
    }
  }
  if (!due.length) return [];

  // Each site's latest call: none on that day yet (else it is a real call on the list), and
  // whether one is still open.
  const ids = due.map((d) => d.siteId);
  const [last] = await pool.query(
    `SELECT r.site_id, r.status, DATE_FORMAT(r.due_date, '%Y-%m-%d') AS due_date,
            DATE_FORMAT(IF(r.done_at IS NULL, r.period_end, LEAST(r.period_end, DATE(r.done_at) + INTERVAL 1 DAY)), '%Y-%m-%d') AS covered
     FROM feedback_requests r
     JOIN (SELECT site_id, MAX(due_date) AS d FROM feedback_requests WHERE site_id IN (?) GROUP BY site_id) m
       ON m.site_id = r.site_id AND m.d = r.due_date`,
    [ids]
  );
  const lastBySite = new Map(last.map((l) => [l.site_id, l]));
  return due
    .filter((d) => !(lastBySite.get(d.siteId)?.due_date >= day))
    .map((d) => {
      const l = lastBySite.get(d.siteId);
      return {
        ...d,
        start: forecastStart(d.rule, day, l?.status === "DONE" ? l.covered : null),
        waiting: l && l.status !== "DONE" ? { status: l.status, due_date: l.due_date } : null,
      };
    });
}

// GET /calls?ahead=1..7: the calls due on that day ahead - the ones taken early (real calls, as the
// call list has them) plus the ones the schedules will make (status TO_CALL, request_id null,
// forecast: true; "Take call" makes them now).
async function upcomingCallList(req) {
  const query = req.query || {};
  const days = aheadDays(query.ahead);
  const list = await callList(req);
  const mine = query.mine === "1" || query.mine === "true";
  const statuses = String(query.status || "").split(",").map((s) => s.trim()).filter(Boolean);
  const showToCall = !statuses.length || statuses.includes("TO_CALL") || statuses.includes("OPEN");
  if (mine) return list; // nobody has the upcoming ones yet

  const [[{ day }]] = await pool.query("SELECT DATE_FORMAT(CURDATE() + INTERVAL ? DAY, '%Y-%m-%d') AS day", [days]);
  let forecast = await forecastCalls(day);
  if (query.company_id) forecast = forecast.filter((f) => f.companyId === String(query.company_id));
  if (!forecast.length) return list;

  // Each site's names and its services in the period so far (up to today), else its last earlier one.
  const [sites] = await pool.query(
    `SELECT s.id, s.name, s.city, co.id AS company_id, co.name AS company_name
     FROM sites s JOIN companies co ON co.id = s.company_id WHERE s.id IN (?)`,
    [forecast.map((f) => f.siteId)]
  );
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
  forecast = forecast.filter((f) => {
    const s = siteById.get(f.siteId);
    return s && (!q || `${s.company_name} ${s.name}`.toLowerCase().includes(q));
  });

  const rows = [];
  for (const f of forecast) {
    const s = siteById.get(f.siteId);
    const [[v]] = await pool.query(
      `SELECT COUNT(DISTINCT v.id) AS n, DATE_FORMAT(MAX(${VISIT_DATE}), '%Y-%m-%d') AS last_date,
              GROUP_CONCAT(DISTINCT ${SERVICE_NAME} SEPARATOR ', ') AS services
       FROM job_visits v JOIN jobs j ON j.id = v.job_id
       WHERE j.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
         AND ${VISIT_DATE} >= ? AND ${VISIT_DATE} < LEAST(?, CURDATE() + INTERVAL 1 DAY)`,
      [f.siteId, f.start, day]
    );
    let earlier = null;
    if (!Number(v.n)) {
      [[earlier]] = await pool.query(
        `SELECT DATE_FORMAT(${VISIT_DATE}, '%Y-%m-%d') AS date, ${SERVICE_NAME} AS service
         FROM job_visits v JOIN jobs j ON j.id = v.job_id
         WHERE j.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED' AND ${VISIT_DATE} < ?
         ORDER BY ${VISIT_DATE} DESC, v.id DESC LIMIT 1`,
        [f.siteId, f.start]
      );
    }
    rows.push({
      forecast: true,
      ahead: days,
      month: day.slice(0, 7),
      request_id: null,
      due_date: day,
      period_start: f.start,
      period_end: addDays(day, -1),
      overdue: false,
      status: "TO_CALL",
      result: null,
      customer: { id: s.company_id, name: s.company_name },
      site: { id: s.id, name: s.name, city: s.city },
      visit_count: Number(v.n || 0),
      last_visit_date: v.last_date,
      services: v.services,
      earlier_visit: earlier ? { date: earlier.date, service: earlier.service } : null,
      collector: null,
      next_call_at: null,
      last_activity_at: null,
      schedule: ruleText(f.rule),
      waiting: f.waiting,
    });
  }
  rows.sort((a, b) => a.customer.name.localeCompare(b.customer.name) || a.site.name.localeCompare(b.site.name));

  // Counted under To call; listed after the real calls when To call is shown.
  const status_counts = { ...list.status_counts, TO_CALL: (list.status_counts.TO_CALL || 0) + rows.length };
  if (!showToCall) return { ...list, status_counts };
  return { ...list, status_counts, total: list.total + rows.length, sites: list.page > 1 ? list.sites : [...list.sites, ...rows] };
}

// POST /calls/upcoming/take { site_id, ahead }: makes an upcoming call now (due on its own day, with
// the period it would have) and gives it to this collector. On its day the schedule makes no second
// one (one call per site per due date). Returns the call id.
async function takeUpcomingCall(req, body) {
  const days = aheadDays(body?.ahead);
  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  if (!siteId) throw new HttpError(400, "Choose the call");
  const [[{ day }]] = await pool.query("SELECT DATE_FORMAT(CURDATE() + INTERVAL ? DAY, '%Y-%m-%d') AS day", [days]);

  const [[made]] = await pool.query("SELECT id FROM feedback_requests WHERE site_id = ? AND due_date = ?", [siteId, day]);
  let id = made?.id;
  if (!id) {
    const [f] = await forecastCalls(day, siteId);
    if (!f) throw new HttpError(404, "No call is scheduled for this site on that day any more - refresh the list");
    if (f.waiting) throw new HttpError(409, `This site's earlier call (due ${f.waiting.due_date}) is still open - finish it first`);
    id = crypto.randomUUID();
    const [result] = await pool.query(
      `INSERT IGNORE INTO feedback_requests (id, period_month, due_date, period_start, period_end, schedule_id, company_id, site_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TO_CALL')`,
      [id, `${day.slice(0, 7)}-01`, day, f.start, day, f.rule.id, f.companyId, siteId]
    );
    if (result.affectedRows) {
      await addHistory(pool, { requestId: id, event: "SCHEDULED", to: "TO_CALL", note: `Due ${day} - ${ruleText(f.rule)} (taken early)`, userId: req.user.id });
    } else {
      [[{ id }]] = await pool.query("SELECT id FROM feedback_requests WHERE site_id = ? AND due_date = ?", [siteId, day]);
    }
  }
  return inTransaction((conn) => openCall(conn, req, { request_id: id }));
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

module.exports = { listSchedules, scheduleOptions, saveSchedule, deleteSchedule, generateDueCalls, ensureDueCalls, upcomingCallList, takeUpcomingCall, ruleText, MODES };
