// Shared helpers for the Invoice Generation (Billing) module: errors, dates, input readers.
// Tables: data/migrations/20261116_billing_module.sql. API: docs/Invoice Generation - API Payloads.docx.

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const bad = (message, extra) => new HttpError(400, message, extra);
const notFound = (message) => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

/** Sends `err` as { error } with its status; unknown errors are logged and sent as 500 `fallback`. */
function sendError(res, err, fallback) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.errors) body.errors = err.errors;
    return res.status(err.status).json(body);
  }
  if (err?.code === "ER_NO_SUCH_TABLE" || err?.code === "ER_BAD_FIELD_ERROR") {
    console.error(fallback, err.message);
    return res.status(503).json({ error: "Invoice generation is not set up yet - run the billing migration (20261116_billing_module.sql)" });
  }
  if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This record already exists" });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

/** Wraps an async handler so every error goes through sendError. */
const handle = (fallback, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    sendError(res, err, fallback);
  }
};

/** Runs fn(conn) in a transaction on its own connection. */
async function inTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// ---- dates (all "YYYY-MM-DD" strings, India time) -----------------------------------

/** Today in India as "YYYY-MM-DD" (the server may run in UTC). */
function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const pad = (n) => String(n).padStart(2, "0");

/** A DATE column (Date object or string) -> "YYYY-MM-DD"; null stays null. */
function ymd(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // mysql2 builds DATE values at local midnight: read them back in local time.
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const parts = (date) => date.split("-").map(Number);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function fromUtc(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(date, n) {
  const [y, m, d] = parts(date);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Adds months keeping the day where possible: 2026-01-31 + 1 month -> 2026-02-28. */
function addMonths(date, n) {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** "2026-11" -> { start: "2026-11-01", end: "2026-11-30", next: "2026-12-01" } */
function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  return { start, end: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`, next: addMonths(start, 1) };
}

function toUtc(date) {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from a to b ("2026-11-01", "2026-11-30" -> 29). */
const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);

/** "2026-11-30" -> "30-11-2026" (the printed invoice's style). */
function dmy(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** "2026-11-05" -> "November 2026". */
function monthName(date) {
  const [y, m] = parts(date);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
}

// ---- input readers (throw a readable 400) ------------------------------------------------

function str(value, field, { required = false, max = 255 } = {}) {
  const v = value === null || value === undefined ? "" : String(value).trim();
  if (!v) {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  if (v.length > max) throw bad(`${field} is too long (max ${max} characters)`);
  return v;
}

function date(value, field, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  const v = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > daysInMonth(Number(m[1]), Number(m[2]))) {
    throw bad(`${field} must be a date like 2026-11-30`);
  }
  return v;
}

function month(value, field = "month", { required = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw bad(`${field} is required (YYYY-MM)`);
    return null;
  }
  const v = String(value).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw bad(`${field} must be a month like 2026-11`);
  return v;
}

function num(value, field, { required = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad(`${field} must be a number`);
  if (integer && !Number.isInteger(n)) throw bad(`${field} must be a whole number`);
  if (n < min || n > max) {
    throw bad(Number.isFinite(max) ? `${field} must be between ${min} and ${max}` : `${field} must be at least ${min}`);
  }
  return n;
}

function oneOf(value, field, allowed, { required = true, fallback = null } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required && fallback === null) throw bad(`${field} is required`);
    return fallback;
  }
  const v = String(value).trim().toUpperCase();
  if (!allowed.includes(v)) throw bad(`${field} must be one of ${allowed.join(", ")}`);
  return v;
}

const bool = (value) => value === true || value === 1 || value === "1" || value === "true";

/** Paging from ?page&page_size (defaults 1 / 50, max 200). */
function paging(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.page_size, 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** JSON column -> value (mysql2 returns parsed JSON, older servers a string). */
function json(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const n2 = (v) => (v === null || v === undefined ? null : Number(v));

module.exports = {
  HttpError,
  bad,
  notFound,
  conflict,
  sendError,
  handle,
  inTransaction,
  todayIst,
  ymd,
  addDays,
  addMonths,
  monthRange,
  daysBetween,
  dmy,
  monthName,
  str,
  date,
  month,
  num,
  oneOf,
  bool,
  paging,
  json,
  n2,
};
