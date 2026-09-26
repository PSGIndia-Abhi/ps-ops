// Recurring tasks: validation, date math and occurrence generation.
//
// A recurring task is a series (work_task_series: the template + its status) with
// one rule (work_task_recurrence). Each due date becomes an ordinary work_tasks
// row. Occurrences are created on the day they fall due (not ahead of time).
//
// All dates here are 'YYYY-MM-DD' strings, never Date objects from the driver,
// because mysql2 shifts DATE columns by the server timezone (see hierarchy.js).

const { v4: uuid } = require("uuid");
const { today: dbToday } = require("./hierarchy");
const { logHistory, isRealDate: isValidDate } = require("./workTasks");

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const END_TYPES = ["NEVER", "ON_DATE", "AFTER_COUNT"];
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const MAX_BACKDATE_DAYS = 366; // a new series may start at most this far in the past
const MAX_PER_RUN = 100; // occurrences created per series per run; the rest catch up next run
const SCAN_DAYS = 4 * 366;

const DATE_FMT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

// ---------------------------------------------------------------- date math

const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * 86400000));
const daysInMonth = (year, month1) => new Date(Date.UTC(year, month1, 0)).getUTCDate();
const maxStr = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

function parseDaysOfWeek(value) {
  const arr = Array.isArray(value) ? value : typeof value === "string" ? safeJson(value) : [];
  return arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}
function safeJson(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Does this date satisfy the rule? (start/end bounds are checked by the caller.)
function matchesRecurrence(dateStr, rec) {
  const d = toDate(dateStr);
  const start = toDate(rec.start_date);
  const interval = Math.max(1, Number(rec.interval_value) || 1);

  if (rec.frequency === "DAILY") {
    const diff = Math.round((d - start) / 86400000);
    return diff >= 0 && diff % interval === 0;
  }
  if (rec.frequency === "WEEKLY") {
    if (!parseDaysOfWeek(rec.days_of_week).includes(d.getUTCDay())) return false;
    const weekOf = (x) => x.getTime() - x.getUTCDay() * 86400000;
    const weeks = Math.round((weekOf(d) - weekOf(start)) / (7 * 86400000));
    return weeks >= 0 && weeks % interval === 0;
  }
  if (rec.frequency === "MONTHLY") {
    const months = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + (d.getUTCMonth() - start.getUTCMonth());
    if (months < 0 || months % interval !== 0) return false;
    const last = daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (rec.use_last_day_of_month) return d.getUTCDate() === last;
    return d.getUTCDate() === Math.min(Number(rec.day_of_month) || start.getUTCDate(), last);
  }
  if (rec.frequency === "YEARLY") {
    const years = d.getUTCFullYear() - start.getUTCFullYear();
    if (years < 0 || years % interval !== 0) return false;
    const month1 = Number(rec.month_of_year) || start.getUTCMonth() + 1;
    if (d.getUTCMonth() + 1 !== month1) return false;
    return d.getUTCDate() === Math.min(Number(rec.day_of_month) || start.getUTCDate(), daysInMonth(d.getUTCFullYear(), month1));
  }
  return false;
}

// First date after `afterStr` (or on start_date when there is no bookmark yet)
// that matches the rule and is inside the end bound; null if the schedule is over.
function findNextOccurrenceDate(rec, afterStr) {
  let cursor = afterStr && afterStr >= rec.start_date ? addDays(afterStr, 1) : rec.start_date;
  const cap = addDays(cursor, SCAN_DAYS);
  while (cursor <= cap) {
    if (rec.end_type === "ON_DATE" && rec.end_date && cursor > rec.end_date) return null;
    if (matchesRecurrence(cursor, rec)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

// A paused series skips (never back-fills) every date inside its pause window.
function inPauseWindow(series, dateStr) {
  return (
    series.status === "PAUSED" && Boolean(series.pause_from) && dateStr >= series.pause_from &&
    (!series.pause_until || dateStr <= series.pause_until)
  );
}

// The next date an occurrence will be created for, or null if none is coming.
function nextOccurrenceDate(series, rec, todayStr) {
  if (series.status === "CANCELLED") return null;
  if (rec.end_type === "AFTER_COUNT" && rec.end_count && rec.occurrences_created >= rec.end_count) return null;
  let after = maxStr(rec.last_generated_until, addDays(todayStr, -1));
  for (let i = 0; i < 500; i++) {
    const next = findNextOccurrenceDate(rec, after);
    if (!next) return null;
    if (!inPauseWindow(series, next)) return next;
    if (!series.pause_until) return null; // paused with no end date
    after = next;
  }
  return null;
}

// ------------------------------------------------------------ validation

// Returns { value } (normalised, ready to insert) or { error }.
function validateRecurrence(r, todayStr) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return { error: "recurrence must be an object" };
  if (!FREQUENCIES.includes(r.frequency)) return { error: "recurrence.frequency must be DAILY, WEEKLY, MONTHLY or YEARLY" };
  if (!isValidDate(r.start_date)) return { error: "recurrence.start_date is required (YYYY-MM-DD)" };
  if (r.start_date < addDays(todayStr, -MAX_BACKDATE_DAYS)) {
    return { error: `recurrence.start_date cannot be more than ${MAX_BACKDATE_DAYS} days in the past` };
  }

  const interval = r.interval_value === undefined ? 1 : Number(r.interval_value);
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) return { error: "recurrence.interval_value must be a whole number from 1 to 999" };

  let timeOfDay = "09:00:00";
  if (r.time_of_day !== undefined && r.time_of_day !== null) {
    if (!TIME_RE.test(String(r.time_of_day))) return { error: "recurrence.time_of_day must be HH:MM or HH:MM:SS" };
    timeOfDay = String(r.time_of_day).length === 5 ? `${r.time_of_day}:00` : String(r.time_of_day);
  }

  const start = toDate(r.start_date);
  const out = {
    frequency: r.frequency, interval_value: interval, time_of_day: timeOfDay, start_date: r.start_date,
    days_of_week: null, day_of_month: null, use_last_day_of_month: 0, month_of_year: null,
    end_type: "NEVER", end_date: null, end_count: null,
  };

  if (r.frequency === "WEEKLY") {
    const days = Array.isArray(r.days_of_week) ? [...new Set(r.days_of_week.map(Number))] : [];
    if (days.length === 0 || days.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
      return { error: "recurrence.days_of_week must list weekdays 0 (Sunday) to 6 (Saturday)" };
    }
    out.days_of_week = days.sort((a, b) => a - b);
  }
  if (r.frequency === "MONTHLY") {
    if (r.use_last_day_of_month) out.use_last_day_of_month = 1;
    else {
      const dom = r.day_of_month === undefined ? start.getUTCDate() : Number(r.day_of_month);
      if (!Number.isInteger(dom) || dom < 1 || dom > 31) return { error: "recurrence.day_of_month must be 1 to 31" };
      out.day_of_month = dom;
    }
  }
  if (r.frequency === "YEARLY") {
    const month = r.month_of_year === undefined ? start.getUTCMonth() + 1 : Number(r.month_of_year);
    const dom = r.day_of_month === undefined ? start.getUTCDate() : Number(r.day_of_month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "recurrence.month_of_year must be 1 to 12" };
    if (!Number.isInteger(dom) || dom < 1 || dom > daysInMonth(2024, month)) return { error: "recurrence.day_of_month is not valid for that month" };
    out.month_of_year = month;
    out.day_of_month = dom;
  }

  if (r.end_type !== undefined) {
    if (!END_TYPES.includes(r.end_type)) return { error: "recurrence.end_type must be NEVER, ON_DATE or AFTER_COUNT" };
    out.end_type = r.end_type;
  }
  if (out.end_type === "ON_DATE") {
    if (!isValidDate(r.end_date)) return { error: "recurrence.end_date is required for ON_DATE (YYYY-MM-DD)" };
    if (r.end_date < r.start_date) return { error: "recurrence.end_date cannot be before start_date" };
    out.end_date = r.end_date;
  }
  if (out.end_type === "AFTER_COUNT") {
    const count = Number(r.end_count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) return { error: "recurrence.end_count must be a whole number from 1 to 1000" };
    out.end_count = count;
  }
  return { value: out };
}

// ------------------------------------------------------------ generation

const REC_COLUMNS = `frequency, interval_value, days_of_week, day_of_month, use_last_day_of_month, month_of_year,
  time_of_day, ${DATE_FMT("start_date")} AS start_date, end_type, ${DATE_FMT("end_date")} AS end_date, end_count,
  occurrences_created, ${DATE_FMT("last_generated_until")} AS last_generated_until`;

// Creates every occurrence due on or before `todayStr` that doesn't exist yet.
// `conn` must be inside a transaction: the series row is locked so two runs
// (scheduler + a resume, say) can never create the same occurrence twice.
// Returns the number created.
async function generateDueOccurrences(conn, seriesId, todayStr) {
  const [[series]] = await conn.query(
    `SELECT s.status, s.title, s.description, s.task_type, s.priority, s.source_module, s.source_id,
            s.assigned_to, s.created_by, ${DATE_FMT("s.pause_from")} AS pause_from, ${DATE_FMT("s.pause_until")} AS pause_until,
            (SELECT is_active FROM users WHERE id = s.assigned_to) AS assignee_active
       FROM work_task_series s WHERE s.id = ? FOR UPDATE`,
    [seriesId]
  );
  if (!series || series.status === "CANCELLED" || !series.assignee_active) return 0;
  const [[rec]] = await conn.query(`SELECT ${REC_COLUMNS} FROM work_task_recurrence WHERE series_id = ? FOR UPDATE`, [seriesId]);
  if (!rec) return 0;

  let cursor = rec.last_generated_until;
  let total = rec.occurrences_created;
  let created = 0;
  let moved = false;

  while (created < MAX_PER_RUN) {
    if (rec.end_type === "AFTER_COUNT" && total >= rec.end_count) break;
    const next = findNextOccurrenceDate(rec, cursor);
    if (!next || next > todayStr) break;
    cursor = next;
    moved = true;
    if (inPauseWindow(series, next)) continue; // paused day: skipped for good

    const taskId = uuid();
    await conn.query(
      `INSERT INTO work_tasks
         (id, series_id, title, description, task_type, priority, source_module, source_id, assigned_to, created_by, due_date, due_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, seriesId, series.title, series.description, series.task_type, series.priority,
       series.source_module, series.source_id, series.assigned_to, series.created_by, next, rec.time_of_day]
    );
    await logHistory(conn, taskId, "CREATE", { toStatus: "OPEN", changedBy: series.created_by, note: "Created from recurring schedule" });
    total += 1;
    created += 1;
  }

  if (moved) {
    await conn.query("UPDATE work_task_recurrence SET last_generated_until = ?, occurrences_created = ? WHERE series_id = ?", [cursor, total, seriesId]);
  }
  // A pause with an end date lifts itself once that date has passed.
  if (series.status === "PAUSED" && series.pause_until && series.pause_until < todayStr) {
    await conn.query("UPDATE work_task_series SET status = 'ACTIVE', pause_from = NULL, pause_until = NULL WHERE id = ?", [seriesId]);
  }
  return created;
}

// Runs shortly after boot, then hourly. Cheap (one query + only series with
// something due) and safe to repeat; hourly so a task is never more than an hour
// late whatever timezone the server date rolls over in.
function startWorkTaskScheduler(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const todayStr = await dbToday(pool);
      const [rows] = await pool.query("SELECT id FROM work_task_series WHERE status IN ('ACTIVE','PAUSED')");
      for (const { id } of rows) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await generateDueOccurrences(conn, id, todayStr);
          await conn.commit();
        } catch (err) {
          await conn.rollback().catch(() => {});
          console.error(`Work task generation failed for series ${id}:`, err);
        } finally {
          conn.release();
        }
      }
    } catch (err) {
      console.error("Work task scheduler failed:", err);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 8000);
  setInterval(run, 60 * 60 * 1000);
}

module.exports = {
  DATE_FMT, REC_COLUMNS, addDays, maxStr, matchesRecurrence, findNextOccurrenceDate, inPauseWindow,
  nextOccurrenceDate, validateRecurrence, generateDueOccurrences, startWorkTaskScheduler,
};
