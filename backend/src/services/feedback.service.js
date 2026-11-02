const crypto = require("crypto");
const { pool } = require("../../db");

// ---------------------------------------------------------------------------
// Customer Feedback Tickets (feedback_* tables, migrations 20261030_feedback_01..14).
//
// Shared by the staff routes (src/routes/feedback.routes.js) and, later, the public
// customer-form routes, the visit-completion hook and the daily job.
//
// Permissions:
//   FEEDBACK_COLLECT  Android app: own call list, calls, answers, WhatsApp, form links
//   FEEDBACK_VIEW     Feedback Desk and customer report: every ticket
//   FEEDBACK_MANAGE   priority, owner, action; close and reopen
//   FEEDBACK_ADMIN    Masters: questions, WhatsApp templates, settings
// Admin passes every check.
//
// Flow: the collector picks a month; the call list shows every customer site that had a
// completed visit in it (one call per site per month, feedback_requests). The collector calls,
// records the feedback (good or not) and raises a ticket (feedback_tickets) only when there
// is an issue. Visits never create tickets.
//
// Note on the existing tables: contacts.company_id and jobs.company_id hold a SITE id
// (their foreign keys point at sites). The customer is sites.company_id -> companies.
// ---------------------------------------------------------------------------

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
// A monthly call (feedback_requests) and a ticket (feedback_tickets) have separate statuses.
const REQUEST_STATUSES = ["TO_CALL", "NOT_ANSWERED", "FORM_SENT", "FORM_RECEIVED", "DONE"];
const TICKET_STATUSES = ["ACTION_PENDING", "CLOSED"];
// OTHER = something else, described in action_note (required for it).
const ACTIONS = ["RESOLVED_ON_CALL", "SCHEDULE_REVISIT", "ESCALATE_OPERATIONS", "OTHER"];
const DESK_PERMISSIONS = ["FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

async function inTransaction(fn) {
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

function hasPerm(req, permission) {
  return req.user?.role === "admin" || Boolean(req.user?.permissions?.includes(permission));
}

function hasAnyPerm(req, permissions) {
  return permissions.some((p) => hasPerm(req, p));
}

/* ------------------------------------------------------------ questions master */

// The questions with their answers, in order. Without includeInactive: only active
// questions and active answers - what the app and the customer form ask.
async function listQuestions(executor = pool, { includeInactive = false } = {}) {
  const activeOnly = includeInactive ? "" : "WHERE is_active = 1";
  const [questions] = await executor.query(
    `SELECT id, question_text, sort_order, is_required, show_on_form, is_active
     FROM feedback_questions ${activeOnly}
     ORDER BY is_active DESC, sort_order, id`
  );
  const [options] = await executor.query(
    `SELECT id, question_id, label, sort_order, is_bad, suggested_priority, is_active
     FROM feedback_question_options ${activeOnly}
     ORDER BY sort_order, id`
  );

  const byQuestion = new Map(questions.map((q) => [q.id, []]));
  for (const o of options) {
    byQuestion.get(o.question_id)?.push({
      id: o.id,
      label: o.label,
      sort_order: o.sort_order,
      is_bad: Boolean(o.is_bad),
      suggested_priority: o.suggested_priority,
      is_active: Boolean(o.is_active),
    });
  }
  return questions.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    sort_order: q.sort_order,
    is_required: Boolean(q.is_required),
    show_on_form: Boolean(q.show_on_form),
    is_active: Boolean(q.is_active),
    options: byQuestion.get(q.id),
  }));
}

function flag(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  throw new HttpError(400, "Switches must be true or false");
}

function idOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id in the list");
  return id;
}

// Checks the whole list sent by Masters -> Feedback questions and returns it cleaned.
// The order of the array is the order shown (sort_order is taken from it).
function cleanQuestionList(body) {
  const list = body?.questions;
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "Send the list of questions");
  if (list.length > 50) throw new HttpError(400, "Too many questions (max 50)");

  const seenQuestionIds = new Set();
  const seenOptionIds = new Set();
  const activeTexts = new Set();

  const questions = list.map((q, qi) => {
    const no = qi + 1;
    const id = idOrNull(q?.id);
    if (id !== null) {
      if (seenQuestionIds.has(id)) throw new HttpError(400, `Question ${no} is in the list twice`);
      seenQuestionIds.add(id);
    }

    const text = typeof q?.question_text === "string" ? q.question_text.trim() : "";
    if (text.length < 3) throw new HttpError(400, `Enter the text of question ${no}`);
    if (text.length > 255) throw new HttpError(400, `Question ${no} is too long (max 255 characters)`);

    const isActive = flag(q.is_active, true);
    if (isActive) {
      const key = text.toLowerCase();
      if (activeTexts.has(key)) throw new HttpError(400, `"${text}" is in the list twice`);
      activeTexts.add(key);
    }

    if (!Array.isArray(q.options)) throw new HttpError(400, `Add the answers of question ${no}`);
    if (q.options.length > 10) throw new HttpError(400, `Question ${no} has too many answers (max 10)`);

    const activeLabels = new Set();
    const options = q.options.map((o, oi) => {
      const optionId = idOrNull(o?.id);
      if (optionId !== null) {
        if (seenOptionIds.has(optionId)) throw new HttpError(400, `An answer of question ${no} is in the list twice`);
        seenOptionIds.add(optionId);
      }

      const label = typeof o?.label === "string" ? o.label.trim() : "";
      if (label.length < 1) throw new HttpError(400, `Enter answer ${oi + 1} of question ${no}`);
      if (label.length > 60) throw new HttpError(400, `Answer "${label.slice(0, 20)}..." is too long (max 60 characters)`);

      const optionActive = flag(o.is_active, true);
      const isBad = flag(o.is_bad, false);
      let priority = null;
      if (isBad) {
        priority = typeof o.suggested_priority === "string" ? o.suggested_priority.toUpperCase() : null;
        if (!PRIORITIES.includes(priority)) {
          throw new HttpError(400, `Choose the priority of the bad answer "${label}" (question ${no})`);
        }
      }
      if (optionActive) {
        const key = label.toLowerCase();
        if (activeLabels.has(key)) throw new HttpError(400, `Question ${no} has the answer "${label}" twice`);
        activeLabels.add(key);
      }

      return { id: optionId, label, sort_order: oi + 1, is_bad: isBad, suggested_priority: priority, is_active: optionActive };
    });

    if (isActive && options.filter((o) => o.is_active).length < 2) {
      throw new HttpError(400, `Question ${no} needs at least 2 answers that are switched on`);
    }

    return {
      id,
      question_text: text,
      sort_order: no,
      is_required: flag(q.is_required, true),
      show_on_form: flag(q.show_on_form, true),
      is_active: isActive,
      options,
    };
  });

  if (!questions.some((q) => q.is_active)) throw new HttpError(400, "At least one question must stay switched on");
  return questions;
}

// Saves the whole list in one transaction. New rows (id null) are added; existing ones are
// updated. Nothing is deleted: a question missing from the list, or an answer missing from
// its question, is switched off - feedback already given keeps its own copy of the wording.
async function saveQuestions(body, userId) {
  const questions = cleanQuestionList(body);

  return inTransaction(async (conn) => {
    const [existingQuestions] = await conn.query("SELECT id FROM feedback_questions FOR UPDATE");
    const [existingOptions] = await conn.query("SELECT id, question_id FROM feedback_question_options FOR UPDATE");
    const questionIds = new Set(existingQuestions.map((q) => q.id));
    const optionOwner = new Map(existingOptions.map((o) => [o.id, o.question_id]));

    const keptQuestionIds = [];
    for (const q of questions) {
      if (q.id !== null && !questionIds.has(q.id)) throw new HttpError(400, `Question "${q.question_text}" was not found`);

      let questionId = q.id;
      if (questionId === null) {
        const [result] = await conn.query(
          `INSERT INTO feedback_questions
             (question_text, sort_order, is_required, show_on_form, is_active, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [q.question_text, q.sort_order, q.is_required, q.show_on_form, q.is_active, userId, userId]
        );
        questionId = result.insertId;
      } else {
        await conn.query(
          `UPDATE feedback_questions
           SET question_text = ?, sort_order = ?, is_required = ?, show_on_form = ?, is_active = ?, updated_by = ?
           WHERE id = ?`,
          [q.question_text, q.sort_order, q.is_required, q.show_on_form, q.is_active, userId, questionId]
        );
      }
      keptQuestionIds.push(questionId);

      const keptOptionIds = [];
      for (const o of q.options) {
        if (o.id !== null && optionOwner.get(o.id) !== questionId) {
          throw new HttpError(400, `Answer "${o.label}" does not belong to question "${q.question_text}"`);
        }
        if (o.id === null) {
          const [result] = await conn.query(
            `INSERT INTO feedback_question_options
               (question_id, label, sort_order, is_bad, suggested_priority, is_active)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [questionId, o.label, o.sort_order, o.is_bad, o.suggested_priority, o.is_active]
          );
          keptOptionIds.push(result.insertId);
        } else {
          await conn.query(
            `UPDATE feedback_question_options
             SET label = ?, sort_order = ?, is_bad = ?, suggested_priority = ?, is_active = ?
             WHERE id = ?`,
            [o.label, o.sort_order, o.is_bad, o.suggested_priority, o.is_active, o.id]
          );
          keptOptionIds.push(o.id);
        }
      }

      // Answers of this question that were left out of the list.
      await conn.query(
        `UPDATE feedback_question_options SET is_active = 0
         WHERE question_id = ? AND is_active = 1 ${keptOptionIds.length ? "AND id NOT IN (?)" : ""}`,
        keptOptionIds.length ? [questionId, keptOptionIds] : [questionId]
      );
    }

    // Questions that were left out of the list (keptQuestionIds is never empty here).
    await conn.query(
      "UPDATE feedback_questions SET is_active = 0, updated_by = ? WHERE is_active = 1 AND id NOT IN (?)",
      [userId, keptQuestionIds]
    );

    return listQuestions(conn, { includeInactive: true });
  });
}

/* ------------------------------------------------------------ WhatsApp templates */

// The codes the code looks templates up by. Admins edit their text; they can't add or
// remove codes.
const TEMPLATE_PLACEHOLDERS = ["ticket", "priority", "customer", "site", "date", "feedback", "action", "technician", "link", "collector"];
const TEMPLATE_AUDIENCES = ["CUSTOMER", "OPERATIONS", "TECHNICIAN"];
const TEMPLATE_REQUIRED_PLACEHOLDER = { FORM_LINK: "link" };

function templateRow(t) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    body: t.body,
    audiences: t.audiences ? t.audiences.split(",") : [],
    is_active: Boolean(t.is_active),
    updated_by: t.updated_by,
    updated_at: t.updated_at,
  };
}

async function listTemplates(executor = pool) {
  const [rows] = await executor.query(
    "SELECT id, code, name, body, audiences, is_active, updated_by, updated_at FROM feedback_whatsapp_templates ORDER BY id"
  );
  return rows.map(templateRow);
}

// Body: { templates: [ { code, name?, body?, audiences?, is_active? } ] } - only the
// templates sent are changed, only the fields sent are changed.
async function saveTemplates(body, userId) {
  const list = body?.templates;
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "Send the templates to save");

  return inTransaction(async (conn) => {
    const [existing] = await conn.query("SELECT code, name, body, audiences, is_active FROM feedback_whatsapp_templates FOR UPDATE");
    const byCode = new Map(existing.map((t) => [t.code, t]));
    const seen = new Set();

    for (const t of list) {
      const code = typeof t?.code === "string" ? t.code.trim().toUpperCase() : "";
      const current = byCode.get(code);
      if (!current) throw new HttpError(400, `Unknown template "${t?.code ?? ""}"`);
      if (seen.has(code)) throw new HttpError(400, `Template ${code} is in the list twice`);
      seen.add(code);

      let name = current.name;
      if (t.name !== undefined) {
        name = typeof t.name === "string" ? t.name.trim() : "";
        if (name.length < 2 || name.length > 100) throw new HttpError(400, `Enter a name for ${code} (2 to 100 characters)`);
      }

      let text = current.body;
      if (t.body !== undefined) {
        text = typeof t.body === "string" ? t.body.trim() : "";
        if (text.length < 5) throw new HttpError(400, `Enter the message text of ${code}`);
        if (text.length > 1000) throw new HttpError(400, `The message of ${code} is too long (max 1000 characters)`);
        const unknown = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((p) => !TEMPLATE_PLACEHOLDERS.includes(p));
        if (unknown.length) {
          throw new HttpError(400, `${code} uses {${unknown[0]}}, which is not a placeholder. Use: ${TEMPLATE_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}`);
        }
        const required = TEMPLATE_REQUIRED_PLACEHOLDER[code];
        if (required && !text.includes(`{${required}}`)) throw new HttpError(400, `The message of ${code} must contain {${required}}`);
      }

      let audiences = current.audiences;
      if (t.audiences !== undefined) {
        if (!Array.isArray(t.audiences) || t.audiences.length === 0) throw new HttpError(400, `Choose who ${code} goes to`);
        const clean = [...new Set(t.audiences.map((a) => String(a).toUpperCase()))];
        const bad = clean.find((a) => !TEMPLATE_AUDIENCES.includes(a));
        if (bad) throw new HttpError(400, `"${bad}" is not one of ${TEMPLATE_AUDIENCES.join(", ")}`);
        audiences = clean.join(",");
      }

      const isActive = flag(t.is_active, Boolean(current.is_active));
      await conn.query(
        "UPDATE feedback_whatsapp_templates SET name = ?, body = ?, audiences = ?, is_active = ?, updated_by = ? WHERE code = ?",
        [name, text, audiences, isActive, userId, code]
      );
    }
    return listTemplates(conn);
  });
}

/* ------------------------------------------------------------ email templates */

// The optional customer emails the collector opens in Gmail (Masters > Email templates). Codes are
// fixed (THANK_YOU, ISSUE_RECEIVED, ISSUE_RESOLVED); the website fills the placeholders.
const EMAIL_PLACEHOLDERS = ["contact", "customer", "site", "month", "ticket", "issue", "revisit_note", "action_taken", "sender"];

function emailTemplateRow(t) {
  return { id: t.id, code: t.code, name: t.name, subject: t.subject, body: t.body, is_active: Boolean(t.is_active), updated_by: t.updated_by, updated_at: t.updated_at };
}

async function listEmailTemplates(executor = pool) {
  const [rows] = await executor.query("SELECT id, code, name, subject, body, is_active, updated_by, updated_at FROM feedback_email_templates ORDER BY id");
  return rows.map(emailTemplateRow);
}

function checkEmailPlaceholders(text, code, what) {
  const unknown = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((p) => !EMAIL_PLACEHOLDERS.includes(p));
  if (unknown.length) {
    throw new HttpError(400, `The ${what} of ${code} uses {${unknown[0]}}, which is not a placeholder. Use: ${EMAIL_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}`);
  }
}

// Body: { templates: [ { code, subject?, body?, is_active? } ] } - only the templates and fields sent change.
async function saveEmailTemplates(body, userId) {
  const list = body?.templates;
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "Send the email templates to save");
  return inTransaction(async (conn) => {
    const [existing] = await conn.query("SELECT code, subject, body, is_active FROM feedback_email_templates FOR UPDATE");
    const byCode = new Map(existing.map((t) => [t.code, t]));
    const seen = new Set();
    for (const t of list) {
      const code = typeof t?.code === "string" ? t.code.trim().toUpperCase() : "";
      const current = byCode.get(code);
      if (!current) throw new HttpError(400, `Unknown email template "${t?.code ?? ""}"`);
      if (seen.has(code)) throw new HttpError(400, `Email template ${code} is in the list twice`);
      seen.add(code);
      let subject = current.subject;
      if (t.subject !== undefined) {
        subject = typeof t.subject === "string" ? t.subject.trim() : "";
        if (subject.length < 3 || subject.length > 200) throw new HttpError(400, `Enter the subject of ${code} (3 to 200 characters)`);
        checkEmailPlaceholders(subject, code, "subject");
      }
      let text = current.body;
      if (t.body !== undefined) {
        text = typeof t.body === "string" ? t.body.trim() : "";
        if (text.length < 10) throw new HttpError(400, `Enter the message of ${code}`);
        if (text.length > 4000) throw new HttpError(400, `The message of ${code} is too long (max 4000 characters)`);
        checkEmailPlaceholders(text, code, "message");
      }
      const isActive = flag(t.is_active, Boolean(current.is_active));
      await conn.query("UPDATE feedback_email_templates SET subject = ?, body = ?, is_active = ?, updated_by = ? WHERE code = ?", [subject, text, isActive, userId, code]);
    }
    return listEmailTemplates(conn);
  });
}

/* ------------------------------------------------------------ settings */

// Every setting the module reads, with its rule. Values are stored as text.
const SETTINGS = {
  other_text_enabled: { type: "flag", default: true },
  link_expiry_days: { type: "int", min: 1, max: 30, default: 3 },
  offer_link_after_missed_calls: { type: "int", min: 1, max: 10, default: 1 },
  notify_collector_on_form: { type: "flag", default: true },
};

function parseSetting(key, raw) {
  const rule = SETTINGS[key];
  if (rule.type === "flag") return raw === "1" || raw === 1 || raw === true || raw === "true";
  const n = Number(raw);
  return Number.isInteger(n) ? n : rule.default;
}

// All settings as typed values; a key missing from the table falls back to its default.
async function getSettings(executor = pool) {
  const [rows] = await executor.query("SELECT setting_key, setting_value FROM feedback_settings");
  const stored = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  const result = {};
  for (const key of Object.keys(SETTINGS)) {
    result[key] = stored.has(key) ? parseSetting(key, stored.get(key)) : SETTINGS[key].default;
  }
  return result;
}

// Body: { settings: { link_expiry_days: 5, ... } } - only the keys sent are changed.
async function saveSettings(body, userId) {
  const changes = body?.settings;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new HttpError(400, "Send the settings to save");
  }
  const rows = Object.entries(changes).map(([key, value]) => {
    const rule = SETTINGS[key];
    if (!rule) throw new HttpError(400, `Unknown setting "${key}"`);
    if (rule.type === "flag") {
      try {
        return [key, flag(value, null) ? "1" : "0"];
      } catch {
        throw new HttpError(400, `${key} must be true or false`);
      }
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < rule.min || n > rule.max) throw new HttpError(400, `${key} must be a whole number from ${rule.min} to ${rule.max}`);
    return [key, String(n)];
  });

  await inTransaction(async (conn) => {
    for (const [key, value] of rows) {
      await conn.query(
        `INSERT INTO feedback_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, value, userId]
      );
    }
  });
  return getSettings();
}

/* ------------------------------------------------------------ shared helpers */

function ticketNumber(seq) {
  return `FB-${String(seq).padStart(4, "0")}`;
}

// One History line, on a monthly call (requestId) and, for ticket events, its ticket.
async function addHistory(executor, { requestId, ticketId = null, event, from = null, to = null, note = null, userId = null }) {
  await executor.query(
    `INSERT INTO feedback_history (request_id, ticket_id, event, from_status, to_status, note, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [requestId, ticketId, event, from, to, note ? String(note).slice(0, 500) : null, userId]
  );
}

function optionalUserId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${label}`);
  return id;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${label} must be a date like 2026-10-29`);
  }
  return value;
}

// "2026-10" -> { month: "2026-10", start: "2026-10-01", next: "2026-11-01" }. No value = this month.
function monthRange(value) {
  let month = typeof value === "string" ? value.trim() : "";
  if (!month) {
    const now = new Date();
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new HttpError(400, "Month must look like 2026-10");
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  return { month, start: `${month}-01`, next };
}

function csvOf(value, allowed, label) {
  if (value === undefined || value === null || value === "") return [];
  const items = [...new Set(String(value).split(",").map((v) => v.trim().toUpperCase()).filter(Boolean))];
  const bad = items.find((v) => !allowed.includes(v));
  if (bad) throw new HttpError(400, `"${bad}" is not a valid ${label}`);
  return items;
}

function likeOf(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function pageOf(query, fallbackSize, maxSize) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.page_size, 10) || fallbackSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const person = (id, name) => (id ? { id: Number(id), name: name || null } : null);

// Desk users (VIEW / MANAGE / ADMIN) see every call and ticket; a collector only their own.
function isDesk(req) {
  return hasAnyPerm(req, DESK_PERMISSIONS);
}

/* ------------------------------------------------------------ monthly calls */

// The services the feedback is about: every visit assigned to the customer (any status except
// cancelled) dated from the period start, before the period end and up to today - future
// bookings don't count yet. A visit's date is its completion time, else its scheduled date.
// jobs.company_id is the site; the customer is sites.company_id.
const SERVICE_VISIT = `COALESCE(v.status, '') <> 'CANCELED'
    AND COALESCE(v.completed_at, v.scheduled_date) < CURDATE() + INTERVAL 1 DAY`;
const SERVICE_VISITS_IN_PERIOD = `
  FROM job_visits v
  JOIN jobs j ON j.id = v.job_id
  JOIN sites s ON s.id = j.company_id
  JOIN companies co ON co.id = s.company_id
  WHERE ${SERVICE_VISIT}
    AND COALESCE(v.completed_at, v.scheduled_date) >= ?
    AND COALESCE(v.completed_at, v.scheduled_date) < ?`;

// Call-list order: forms sent back, call-backs that are due, not answered, to call,
// waiting for the form, done.
const CALL_ORDER = `CASE
    WHEN x.status = 'FORM_RECEIVED' THEN 0
    WHEN x.status <> 'DONE' AND x.next_call_at IS NOT NULL AND x.next_call_at <= NOW() THEN 1
    WHEN x.status = 'NOT_ANSWERED' THEN 2
    WHEN x.status = 'TO_CALL' THEN 3
    WHEN x.status = 'FORM_SENT' THEN 4
    ELSE 5
  END`;

// The period the call list covers: a date range (from / to), every month, or one month.
function callListPeriod(query) {
  const from = optionalDate(query.from, "From date");
  const to = optionalDate(query.to, "To date");
  if (from || to) {
    if (from && to && from > to) throw new HttpError(400, "The From date must be on or before the To date");
    let next = "2100-01-01";
    if (to) {
      const d = new Date(`${to}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      next = d.toISOString().slice(0, 10);
    }
    return { month: "range", start: from || "2000-01-01", next };
  }
  if (query.month === "all") return { month: "all", start: "2000-01-01", next: "2100-01-01" };
  return monthRange(query.month);
}

// GET /calls: every site that had a completed visit in the month, one row per site and month,
// with its call status (TO_CALL until someone works on it). A collector without a desk
// permission sees sites nobody has taken yet plus their own.
// Query: month (2026-10; "all" = every month, newest first; none = this month), or from / to
//        (2026-09-01 .. 2026-09-15: services completed between those dates, rows still per month),
//        status (comma list, OPEN = not DONE), q (customer / site), company_id, mine=1, page, page_size.
async function callList(req) {
  const query = req.query || {};
  const { month, start, next } = callListPeriod(query);

  const outer = [];
  const outerParams = [];
  if (!isDesk(req)) {
    outer.push("(x.collector_user_id IS NULL OR x.collector_user_id = ?)");
    outerParams.push(req.user.id);
  }
  if (query.mine === "1" || query.mine === "true") {
    outer.push("x.collector_user_id = ?");
    outerParams.push(req.user.id);
  }
  if (query.company_id) { outer.push("x.company_id = ?"); outerParams.push(String(query.company_id)); }
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) { outer.push("(x.company_name LIKE ? OR x.site_name LIKE ?)"); outerParams.push(likeOf(q), likeOf(q)); }

  const inner = `
    SELECT DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m') AS call_month,
           s.id AS site_id, s.name AS site_name, s.city AS site_city,
           co.id AS company_id, co.name AS company_name,
           COUNT(DISTINCT v.id) AS visit_count,
           DATE_FORMAT(MAX(COALESCE(v.completed_at, v.scheduled_date)), '%Y-%m-%d') AS last_visit_date,
           GROUP_CONCAT(DISTINCT COALESCE(NULLIF(j.sub_service, ''), j.service_type) SEPARATOR ', ') AS services,
           r.id AS request_id, COALESCE(r.status, 'TO_CALL') AS status, r.result,
           r.collector_user_id, cu.name AS collector_name, r.next_call_at, r.updated_at AS last_activity_at
    ${SERVICE_VISITS_IN_PERIOD.replace(
      "WHERE COALESCE(v.status",
      `LEFT JOIN feedback_requests r ON r.site_id = s.id
             AND r.period_month = DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-01')
       LEFT JOIN users cu ON cu.id = r.collector_user_id
       WHERE COALESCE(v.status`
    )}
    GROUP BY call_month, s.id, co.id, r.id, cu.id`;
  const innerParams = [start, next];
  const baseWhere = outer.length ? `WHERE ${outer.join(" AND ")}` : "";

  const [countRows] = await pool.query(
    `SELECT x.status, COUNT(*) AS n FROM (${inner}) x ${baseWhere} GROUP BY x.status`,
    [...innerParams, ...outerParams]
  );
  const statusCounts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0]));
  for (const r of countRows) statusCounts[r.status] = Number(r.n);

  const statuses = csvOf(query.status, [...REQUEST_STATUSES, "OPEN"], "status");
  const wanted = [...new Set(statuses.flatMap((s) => (s === "OPEN" ? REQUEST_STATUSES.filter((x) => x !== "DONE") : [s])))];
  const listWhere = [...outer];
  const listParams = [...outerParams];
  if (wanted.length) { listWhere.push("x.status IN (?)"); listParams.push(wanted); }
  const whereSql = listWhere.length ? `WHERE ${listWhere.join(" AND ")}` : "";

  const { page, pageSize, offset } = pageOf(query, 50, 200);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${inner}) x ${whereSql}`, [...innerParams, ...listParams]);
  const [rows] = await pool.query(
    `SELECT x.* FROM (${inner}) x ${whereSql}
     ORDER BY x.call_month DESC, ${CALL_ORDER}, x.company_name, x.site_name
     LIMIT ? OFFSET ?`,
    [...innerParams, ...listParams, pageSize, offset]
  );

  return {
    month,
    total: Number(total),
    page,
    page_size: pageSize,
    status_counts: statusCounts,
    sites: rows.map((r) => ({
      month: r.call_month,
      request_id: r.request_id,
      status: r.status,
      result: r.result,
      customer: { id: r.company_id, name: r.company_name },
      site: { id: r.site_id, name: r.site_name, city: r.site_city },
      visit_count: Number(r.visit_count),
      last_visit_date: r.last_visit_date,
      services: r.services,
      collector: person(r.collector_user_id, r.collector_name),
      next_call_at: r.next_call_at,
      last_activity_at: r.last_activity_at,
    })),
  };
}

// POST /calls { site_id, month }: the collector starts working on a site for a month.
// Creates the monthly call if it doesn't exist and gives it to this collector if nobody has
// it. Someone else's call can only be taken over by a desk manager (FEEDBACK_MANAGE).
// Returns the request id.
async function openCall(conn, req, body) {
  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  if (!siteId) throw new HttpError(400, "Choose the site");
  const { start, next } = monthRange(body?.month);

  const [[site]] = await conn.query("SELECT id, company_id FROM sites WHERE id = ?", [siteId]);
  if (!site) throw new HttpError(400, "Site not found");
  const [[{ visits }]] = await conn.query(
    `SELECT COUNT(*) AS visits ${SERVICE_VISITS_IN_PERIOD} AND s.id = ?`,
    [start, next, siteId]
  );
  if (!Number(visits)) throw new HttpError(400, "This site had no service in that month");

  const userId = req.user.id;
  let [[request]] = await conn.query(
    `SELECT r.id, r.collector_user_id, u.name AS collector_name
     FROM feedback_requests r LEFT JOIN users u ON u.id = r.collector_user_id
     WHERE r.site_id = ? AND r.period_month = ? FOR UPDATE`,
    [siteId, start]
  );

  if (!request) {
    const id = crypto.randomUUID();
    try {
      await conn.query(
        `INSERT INTO feedback_requests (id, period_month, company_id, site_id, collector_user_id, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'TO_CALL', ?)`,
        [id, start, site.company_id, siteId, userId, userId]
      );
    } catch (err) {
      if (err?.code !== "ER_DUP_ENTRY") throw err;
      throw new HttpError(409, "Someone else has just started this call - refresh the list");
    }
    await addHistory(conn, { requestId: id, event: "OPENED", to: "TO_CALL", note: "Call taken by the collector", userId });
    return id;
  }

  if (!request.collector_user_id) {
    await conn.query("UPDATE feedback_requests SET collector_user_id = ?, row_version = row_version + 1 WHERE id = ?", [userId, request.id]);
    await addHistory(conn, { requestId: request.id, event: "ASSIGNED", note: "Call taken by the collector", userId });
  } else if (Number(request.collector_user_id) !== Number(userId) && !hasPerm(req, "FEEDBACK_MANAGE")) {
    throw new HttpError(409, `${request.collector_name || "Another collector"} is already calling this site`);
  }
  return request.id;
}

async function questionsAnswers(submissionIds) {
  if (!submissionIds.length) return [];
  const [rows] = await pool.query(
    `SELECT submission_id, question_id, option_id, question_text, option_label, is_bad, suggested_priority
     FROM feedback_responses WHERE submission_id IN (?) ORDER BY id`,
    [submissionIds]
  );
  return rows;
}

function submissionRow(s, responses, latestId) {
  return {
    id: s.id,
    source: s.source,
    form_link_id: s.form_link_id,
    contact_id: s.contact_id,
    spoke_with_name: s.spoke_with_name,
    other_feedback: s.other_feedback,
    has_issue: Boolean(s.has_issue),
    started_at: s.started_at,
    submitted_at: s.submitted_at,
    collected_by: person(s.collected_by_user_id, s.collected_by_name),
    is_latest: s.id === latestId,
    responses: responses.filter((r) => r.submission_id === s.id).map((r) => ({
      question_id: r.question_id, question: r.question_text, option_id: r.option_id,
      answer: r.option_label, is_bad: Boolean(r.is_bad), suggested_priority: r.suggested_priority,
    })),
  };
}

function historyRow(h) {
  return {
    id: h.id, ticket_id: h.ticket_id, event: h.event, from_status: h.from_status, to_status: h.to_status,
    note: h.note, created_at: h.created_at, changed_by: person(h.changed_by, h.changed_by_name),
  };
}

// GET /calls/:id - the monthly call and everything on it: the site's contacts, the month's
// visits, calls made, answers, form links, WhatsApp messages, tickets raised and history.
async function getCall(req, id) {
  const [[r]] = await pool.query(
    `SELECT r.*, DATE_FORMAT(r.period_month, '%Y-%m') AS month,
            co.name AS company_name, s.name AS site_name, s.city AS site_city, s.address AS site_address,
            cu.name AS collector_name, db.name AS done_by_name
     FROM feedback_requests r
     JOIN companies co ON co.id = r.company_id
     JOIN sites s ON s.id = r.site_id
     LEFT JOIN users cu ON cu.id = r.collector_user_id
     LEFT JOIN users db ON db.id = r.done_by
     WHERE r.id = ?`,
    [id]
  );
  if (!r) throw new HttpError(404, "Feedback call not found");
  if (!isDesk(req) && Number(r.collector_user_id) !== Number(req.user.id)) throw new HttpError(404, "Feedback call not found");

  const { start, next } = monthRange(r.month);
  const [contacts] = await pool.query(
    `SELECT id, name, phone, email, role, is_primary FROM contacts
     WHERE company_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY is_primary DESC, name`,
    [r.site_id]
  );
  const [visits] = await pool.query(
    `SELECT v.id, v.job_id, j.code AS job_code, v.status,
            DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-%d') AS visit_date,
            COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
            (SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ')
             FROM visit_technicians vt JOIN users u ON u.id = vt.technician_id WHERE vt.visit_id = v.id) AS technicians
     ${SERVICE_VISITS_IN_PERIOD} AND s.id = ?
     ORDER BY COALESCE(v.completed_at, v.scheduled_date)`,
    [start, next, r.site_id]
  );
  const [calls] = await pool.query(
    `SELECT a.id, a.contact_id, a.contact_name, a.phone, a.outcome, a.called_at, a.called_by_user_id, u.name AS called_by_name
     FROM feedback_call_attempts a LEFT JOIN users u ON u.id = a.called_by_user_id
     WHERE a.request_id = ? ORDER BY a.called_at DESC, a.id DESC`,
    [id]
  );
  const [submissions] = await pool.query(
    `SELECT sb.*, u.name AS collected_by_name
     FROM feedback_submissions sb LEFT JOIN users u ON u.id = sb.collected_by_user_id
     WHERE sb.request_id = ? ORDER BY sb.submitted_at DESC`,
    [id]
  );
  const responses = await questionsAnswers(submissions.map((s) => s.id));
  const [formLinks] = await pool.query(
    `SELECT id, contact_id, phone, expires_at, opened_at, submitted_at, revoked_at, created_at
     FROM feedback_form_links WHERE request_id = ? ORDER BY created_at DESC`,
    [id]
  );
  const [messages] = await pool.query(
    `SELECT m.id, m.ticket_id, m.recipient_type, m.recipient_user_id, m.recipient_contact_id, m.phone, m.body,
            m.status, m.opened_at, m.opened_by, u.name AS opened_by_name, wt.code AS template_code
     FROM feedback_whatsapp_messages m
     LEFT JOIN users u ON u.id = m.opened_by
     LEFT JOIN feedback_whatsapp_templates wt ON wt.id = m.template_id
     WHERE m.request_id = ? ORDER BY m.opened_at DESC`,
    [id]
  );
  const [tickets] = await pool.query(
    `SELECT id, ticket_number, status, priority, action, issue_summary, created_at
     FROM feedback_tickets WHERE request_id = ? ORDER BY seq`,
    [id]
  );
  const [history] = await pool.query(
    `SELECT h.*, u.name AS changed_by_name
     FROM feedback_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.request_id = ? ORDER BY h.created_at DESC, h.id DESC`,
    [id]
  );

  const now = Date.now();
  return {
    id: r.id,
    month: r.month,
    status: r.status,
    result: r.result,
    customer: { id: r.company_id, name: r.company_name },
    site: { id: r.site_id, name: r.site_name, city: r.site_city, address: r.site_address },
    collector: person(r.collector_user_id, r.collector_name),
    next_call_at: r.next_call_at,
    done_by: person(r.done_by, r.done_by_name),
    done_at: r.done_at,
    row_version: r.row_version,
    created_at: r.created_at,
    updated_at: r.updated_at,
    calls_summary: { total: calls.length, missed: calls.filter((c) => c.outcome !== "ANSWERED").length },
    contacts: contacts.map((c) => ({ ...c, is_primary: Boolean(c.is_primary) })),
    visits: visits.map((v) => ({
      id: v.id, job_id: v.job_id, job_code: v.job_code, status: v.status, date: v.visit_date, service: v.service, technicians: v.technicians,
    })),
    call_attempts: calls.map((c) => ({
      id: c.id, contact_id: c.contact_id, contact_name: c.contact_name, phone: c.phone,
      outcome: c.outcome, called_at: c.called_at, called_by: person(c.called_by_user_id, c.called_by_name),
    })),
    submissions: submissions.map((s) => submissionRow(s, responses, r.latest_submission_id)),
    form_links: formLinks.map((l) => ({
      ...l,
      state: l.submitted_at ? "SUBMITTED" : l.revoked_at ? "REVOKED" : new Date(l.expires_at).getTime() < now ? "EXPIRED" : l.opened_at ? "OPENED" : "SENT",
    })),
    whatsapp_messages: messages.map((m) => ({
      id: m.id, ticket_id: m.ticket_id, template: m.template_code, recipient_type: m.recipient_type,
      recipient_user_id: m.recipient_user_id, recipient_contact_id: m.recipient_contact_id, phone: m.phone,
      body: m.body, status: m.status, opened_at: m.opened_at, opened_by: person(m.opened_by, m.opened_by_name),
    })),
    tickets,
    history: history.map(historyRow),
  };
}

/* ------------------------------------------------------------ calls and feedback */

const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "BUSY", "WRONG_NUMBER"];
const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

// "2026-10-30 15:30" or "2026-10-30T15:30[:00]" -> "2026-10-30 15:30:00" (IST wall-clock, as stored).
function optionalDateTime(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const m = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m || Number.isNaN(Date.parse(`${m[1]}T${m[2]}:${m[3]}:00`))) throw new HttpError(400, `${label} must look like 2026-10-30 15:30`);
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] || "00"}`;
}

function optionalText(value, label, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${label}`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `The ${label} is too long (max ${max} characters)`);
  return text || null;
}

// Locks the monthly call for an update and checks the user may work on it: its collector, or
// a desk manager (FEEDBACK_MANAGE). openDone = also allowed when the call is DONE.
async function lockCallForWork(conn, req, requestId, { openDone = false } = {}) {
  const [[r]] = await conn.query(
    `SELECT r.*, DATE_FORMAT(r.period_month, '%Y-%m') AS month FROM feedback_requests r WHERE r.id = ? FOR UPDATE`,
    [requestId]
  );
  if (!r) throw new HttpError(404, "Feedback call not found");
  const own = Number(r.collector_user_id) === Number(req.user.id);
  if (!own && !hasPerm(req, "FEEDBACK_MANAGE")) {
    if (!isDesk(req)) throw new HttpError(404, "Feedback call not found");
    throw new HttpError(403, "Only the collector of this call can work on it");
  }
  if (r.status === "DONE" && !openDone) throw new HttpError(409, "This call is already done");
  return r;
}

// A site contact of the call's site (contacts.company_id holds the site id).
async function siteContact(conn, siteId, contactId) {
  if (contactId === undefined || contactId === null || contactId === "") return null;
  const [[c]] = await conn.query("SELECT id, name, phone FROM contacts WHERE id = ? AND company_id = ?", [String(contactId), siteId]);
  if (!c) throw new HttpError(400, "That contact does not belong to this site");
  return c;
}

async function bumpCall(conn, requestId, fields) {
  const keys = Object.keys(fields);
  await conn.query(
    `UPDATE feedback_requests SET ${keys.map((k) => `${k} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ?`,
    [...keys.map((k) => fields[k]), requestId]
  );
}

// POST /calls/:id/attempts - B4. Body: { contact_id? | phone + contact_name?, outcome, call_back_at? }
// A missed call (anything but ANSWERED) moves TO_CALL / NOT_ANSWERED to NOT_ANSWERED.
// call_back_at = the customer asked to be called at that time. Returns what the app needs next.
async function recordCallAttempt(req, requestId, body) {
  const outcome = typeof body?.outcome === "string" ? body.outcome.trim().toUpperCase() : "";
  if (!CALL_OUTCOMES.includes(outcome)) throw new HttpError(400, `Choose the call result: ${CALL_OUTCOMES.join(", ")}`);
  const callBackAt = optionalDateTime(body?.call_back_at, "Call back time");

  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId);
    const contact = await siteContact(conn, r.site_id, body?.contact_id);
    const phone = contact ? contact.phone : optionalText(body?.phone, "phone number", 20);
    if (!phone) throw new HttpError(400, "Choose the contact you called, or enter the phone number");
    const contactName = contact ? contact.name : optionalText(body?.contact_name, "contact name", 150);

    await conn.query(
      `INSERT INTO feedback_call_attempts (request_id, contact_id, contact_name, phone, outcome, called_by_user_id, called_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [requestId, contact?.id ?? null, contactName, phone, outcome, req.user.id]
    );

    const missed = outcome !== "ANSWERED";
    const newStatus = missed && ["TO_CALL", "NOT_ANSWERED"].includes(r.status) ? "NOT_ANSWERED" : r.status;
    const fields = { status: newStatus };
    if (callBackAt) fields.next_call_at = callBackAt;
    else if (outcome === "ANSWERED") fields.next_call_at = null;
    await bumpCall(conn, requestId, fields);

    const label = { ANSWERED: "Answered", NO_ANSWER: "No answer", BUSY: "Busy", WRONG_NUMBER: "Wrong number" }[outcome];
    await addHistory(conn, {
      requestId, event: "CALL_ATTEMPT", from: r.status, to: newStatus,
      note: `${label} - ${contactName ? `${contactName}, ` : ""}${phone}${callBackAt ? ` - call back ${callBackAt.slice(0, 16)}` : ""}`,
      userId: req.user.id,
    });

    const [[{ missedCalls }]] = await conn.query(
      "SELECT COUNT(*) AS missedCalls FROM feedback_call_attempts WHERE request_id = ? AND outcome <> 'ANSWERED'",
      [requestId]
    );
    const settings = await getSettings(conn);
    return {
      status: newStatus,
      missed_calls: Number(missedCalls),
      next_call_at: fields.next_call_at === undefined ? r.next_call_at : fields.next_call_at,
      offer_form_link: missed && Number(missedCalls) >= settings.offer_link_after_missed_calls && newStatus === "NOT_ANSWERED",
    };
  });
}

// Checks the answers against the active questions of the master and returns rows to store,
// with the answer text copied. Every active required question must be answered once.
async function cleanResponses(conn, responses, { forForm = false } = {}) {
  if (!Array.isArray(responses) || responses.length === 0) throw new HttpError(400, "Send the answers");
  const questions = (await listQuestions(conn)).filter((q) => !forForm || q.show_on_form);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set();
  const rows = responses.map((a) => {
    const q = byId.get(Number(a?.question_id));
    if (!q) throw new HttpError(400, "An answer is for a question that is not asked any more - reload the questions");
    if (seen.has(q.id)) throw new HttpError(400, `"${q.question_text}" is answered twice`);
    seen.add(q.id);
    const o = q.options.find((opt) => opt.id === Number(a?.option_id));
    if (!o) throw new HttpError(400, `Choose one of the answers of "${q.question_text}"`);
    return {
      question_id: q.id, option_id: o.id, question_text: q.question_text, option_label: o.label,
      is_bad: o.is_bad, suggested_priority: o.is_bad ? o.suggested_priority : null,
    };
  });
  const missing = questions.find((q) => q.is_required && !seen.has(q.id));
  if (missing) throw new HttpError(400, `Answer "${missing.question_text}"`);
  return rows;
}

function highestPriority(rows) {
  return rows.reduce((best, r) => (r.suggested_priority && (!best || PRIORITY_RANK[r.suggested_priority] > PRIORITY_RANK[best]) ? r.suggested_priority : best), null);
}

async function saveSubmission(conn, { requestId, source, formLinkId = null, contactId = null, spokeWith = null, collectedBy = null, otherFeedback = null, startedAt = null, rows }) {
  const id = crypto.randomUUID();
  const hasIssue = rows.some((r) => r.is_bad);
  await conn.query(
    `INSERT INTO feedback_submissions
       (id, request_id, source, form_link_id, contact_id, spoke_with_name, collected_by_user_id, other_feedback, has_issue, started_at, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, requestId, source, formLinkId, contactId, spokeWith, collectedBy, otherFeedback, hasIssue, startedAt]
  );
  for (const r of rows) {
    await conn.query(
      `INSERT INTO feedback_responses (submission_id, question_id, option_id, question_text, option_label, is_bad, suggested_priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, r.question_id, r.option_id, r.question_text, r.option_label, r.is_bad, r.suggested_priority]
    );
  }
  return { id, hasIssue };
}

// Raises one ticket from a monthly call. input: { priority?, action, issue_summary?, visit_id?,
// action_owner_user_id?, action_due_at?, action_note? }. suggested = priority suggested by the
// answers (used when priority is left out). RESOLVED_ON_CALL closes the ticket at once.
async function raiseTicket(conn, req, r, submissionId, suggested, input) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Send the ticket details");
  const action = typeof input.action === "string" ? input.action.trim().toUpperCase() : "";
  if (!ACTIONS.includes(action)) throw new HttpError(400, `Choose the action: ${ACTIONS.join(", ")}`);
  const priority = typeof input.priority === "string" && input.priority ? input.priority.trim().toUpperCase() : suggested;
  if (!PRIORITIES.includes(priority)) throw new HttpError(400, "Choose the priority: LOW, MEDIUM or HIGH");
  const issueSummary = optionalText(input.issue_summary, "issue summary", 500);
  const actionNote = optionalText(input.action_note, "note", 2000);
  if (action === "OTHER" && !actionNote) throw new HttpError(400, "Describe what will be done for Other");
  const dueAt = optionalDateTime(input.action_due_at, "Resolve-by time");
  const ownerId = optionalUserId(input.action_owner_user_id, "action owner");
  if (ownerId) {
    const [[owner]] = await conn.query("SELECT id, is_active FROM users WHERE id = ?", [ownerId]);
    if (!owner) throw new HttpError(400, "Action owner not found");
    if (!owner.is_active) throw new HttpError(400, "The action owner's account is not active");
  }

  // The visit the issue is about must be one of that site's completed visits in that month.
  let visit = null;
  if (input.visit_id) {
    const { start, next } = monthRange(r.month);
    [[visit]] = await conn.query(
      `SELECT v.id, v.job_id, COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
              (SELECT vt.technician_id FROM visit_technicians vt WHERE vt.visit_id = v.id ORDER BY vt.created_at, vt.id LIMIT 1) AS technician_id
       ${SERVICE_VISITS_IN_PERIOD} AND s.id = ? AND v.id = ?`,
      [start, next, r.site_id, String(input.visit_id)]
    );
    if (!visit) throw new HttpError(400, "That visit is not one of this site's services in that month");
  }

  const closedNow = action === "RESOLVED_ON_CALL";
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO feedback_tickets
       (id, request_id, submission_id, period_month, company_id, site_id, visit_id, job_id, service_label, technician_user_id,
        issue_summary, status, suggested_priority, priority, action, action_owner_user_id, action_due_at, action_note,
        raised_by, closed_by, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${closedNow ? "NOW()" : "NULL"})`,
    [
      id, r.id, submissionId, `${r.month}-01`, r.company_id, r.site_id, visit?.id ?? null, visit?.job_id ?? null,
      visit?.service ? String(visit.service).slice(0, 150) : null, visit?.technician_id ?? null,
      issueSummary, closedNow ? "CLOSED" : "ACTION_PENDING", suggested, priority, action, ownerId, dueAt, actionNote,
      req.user.id, closedNow ? req.user.id : null,
    ]
  );
  const [[{ seq }]] = await conn.query("SELECT seq FROM feedback_tickets WHERE id = ?", [id]);
  const number = ticketNumber(seq);
  await conn.query("UPDATE feedback_tickets SET ticket_number = ? WHERE id = ?", [number, id]);

  const actionLabel = action === "OTHER" ? `Other: ${actionNote}` : ACTION_LABELS[action];
  await addHistory(conn, {
    requestId: r.id, ticketId: id, event: "TICKET_RAISED", to: closedNow ? "CLOSED" : "ACTION_PENDING",
    note: `${number} · ${priority} · ${actionLabel}${issueSummary ? ` - ${issueSummary}` : ""}`, userId: req.user.id,
  });
  return { id, ticket_number: number, status: closedNow ? "CLOSED" : "ACTION_PENDING", priority, action, action_owner_user_id: ownerId };
}

async function markCallDone(conn, req, r, result, note) {
  await conn.query(
    `UPDATE feedback_requests
     SET status = 'DONE', result = ?, done_by = ?, done_at = NOW(), next_call_at = NULL, row_version = row_version + 1
     WHERE id = ?`,
    [result, req.user.id, r.id]
  );
  await addHistory(conn, { requestId: r.id, event: "DONE", from: r.status, to: "DONE", note: note || (result === "ISSUE" ? "Done - ticket raised" : "Done - no issue"), userId: req.user.id });
}

// POST /calls/:id/feedback - B5: the answers from a call, plus the ticket when there is an issue.
// Body: { contact_id? | spoke_with_name, responses: [{ question_id, option_id }], other_feedback?,
//         started_at?, ticket?: { ...raiseTicket input }, no_ticket?: true }
// The feedback is always saved. With a bad answer the collector must either send `ticket` or
// confirm `no_ticket: true`. The call is then DONE: result ISSUE if a ticket was raised, else GOOD.
async function saveCallFeedback(req, requestId, body) {
  const out = await inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId);
    const contact = await siteContact(conn, r.site_id, body?.contact_id);
    const spokeWith = optionalText(body?.spoke_with_name, "name", 150) || contact?.name || null;
    if (!spokeWith) throw new HttpError(400, "Choose who gave the feedback");
    const settings = await getSettings(conn);
    const otherFeedback = settings.other_text_enabled ? optionalText(body?.other_feedback, "other feedback", 2000) : null;
    const startedAt = optionalDateTime(body?.started_at, "Start time");
    const rows = await cleanResponses(conn, body?.responses);
    const suggested = highestPriority(rows);
    const hasBad = rows.some((x) => x.is_bad);

    const wantsTicket = body?.ticket !== undefined && body?.ticket !== null;
    if (hasBad && !wantsTicket && body?.no_ticket !== true) {
      throw new HttpError(400, "Some answers show an issue - raise a ticket, or confirm that no ticket is needed");
    }

    const submission = await saveSubmission(conn, {
      requestId, source: "CALL", contactId: contact?.id ?? null, spokeWith, collectedBy: req.user.id,
      otherFeedback, startedAt, rows,
    });
    await bumpCall(conn, requestId, { latest_submission_id: submission.id });
    await addHistory(conn, {
      requestId, event: "FEEDBACK_SAVED",
      note: `On call with ${spokeWith} - ${hasBad ? `${rows.filter((x) => x.is_bad).length} answer(s) show an issue` : "all answers good"}`,
      userId: req.user.id,
    });

    const ticket = wantsTicket ? await raiseTicket(conn, req, r, submission.id, suggested, body.ticket) : null;
    await markCallDone(conn, req, r, ticket ? "ISSUE" : "GOOD", hasBad && !ticket ? "Done - issue noted, no ticket needed" : null);
    return { submission_id: submission.id, has_issue: hasBad, suggested_priority: suggested, ticket, status: "DONE", result: ticket ? "ISSUE" : "GOOD", siteId: r.site_id };
  });
  delete out.siteId;
  return out;
}

// POST /calls/:id/tickets - raise a ticket later: after checking a form the customer sent back,
// or a second issue on a call already done. Body: { submission_id?, ...raiseTicket input }.
// submission_id defaults to the call's latest feedback. The call becomes DONE / ISSUE.
async function raiseTicketFromCall(req, requestId, body) {
  const out = await inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId, { openDone: true });
    const submissionId = body?.submission_id ? String(body.submission_id) : r.latest_submission_id;
    if (!submissionId) throw new HttpError(400, "Save the customer's feedback before raising a ticket");
    const [[s]] = await conn.query("SELECT id FROM feedback_submissions WHERE id = ? AND request_id = ?", [submissionId, requestId]);
    if (!s) throw new HttpError(400, "That feedback does not belong to this call");
    const [answers] = await conn.query("SELECT suggested_priority FROM feedback_responses WHERE submission_id = ?", [submissionId]);
    const ticket = await raiseTicket(conn, req, r, submissionId, highestPriority(answers), body);
    if (r.status !== "DONE") await markCallDone(conn, req, r, "ISSUE");
    else if (r.result !== "ISSUE") await bumpCall(conn, requestId, { result: "ISSUE" });
    return { ticket, status: "DONE", result: "ISSUE", siteId: r.site_id };
  });
  delete out.siteId;
  return out;
}

// POST /calls/:id/done - finish a call without a ticket: a form reviewed with no issue to
// raise, or a customer who could not be reached. Body: { note? } - a note is required when
// no feedback was received.
async function finishCall(req, requestId, body) {
  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId);
    const note = optionalText(body?.note, "note", 500);
    if (!r.latest_submission_id && !note) throw new HttpError(400, "No feedback was received - add a note saying why the call is finished");
    let result = null;
    if (r.latest_submission_id) {
      const [[{ tickets }]] = await conn.query("SELECT COUNT(*) AS tickets FROM feedback_tickets WHERE request_id = ?", [requestId]);
      result = Number(tickets) ? "ISSUE" : "GOOD";
    }
    await markCallDone(conn, req, r, result, note);
    return { status: "DONE", result };
  });
}

/* ------------------------------------------------------------ tickets (issues only) */

// The re-visit booked in Jobs for a ticket: its job, date, status and technicians (the ticket's
// "technician" and "work done" stages).
const REVISIT_FIELDS = `rj.code AS revisit_job_code, rv.status AS revisit_status,
         DATE_FORMAT(COALESCE(rv.completed_at, rv.scheduled_date), '%Y-%m-%d') AS revisit_date, rv.completed_at AS revisit_completed_at,
         (SELECT GROUP_CONCAT(ru.name ORDER BY ru.name SEPARATOR ', ')
          FROM visit_technicians rvt JOIN users ru ON ru.id = rvt.technician_id WHERE rvt.visit_id = rv.id) AS revisit_technicians`;
const REVISIT_JOINS = `LEFT JOIN job_visits rv ON rv.id = t.revisit_visit_id
  LEFT JOIN jobs rj ON rj.id = rv.job_id`;

function revisitOf(t) {
  if (!t.revisit_visit_id) return null;
  return {
    id: t.revisit_visit_id, job_code: t.revisit_job_code, status: t.revisit_status, date: t.revisit_date,
    completed_at: t.revisit_completed_at, technicians: t.revisit_technicians,
  };
}

const TICKET_SELECT = `
  SELECT t.id, t.ticket_number, t.request_id, t.submission_id, DATE_FORMAT(t.period_month, '%Y-%m') AS month,
         t.status, t.suggested_priority, t.priority, t.action, t.issue_summary,
         t.action_due_at, t.action_note, t.close_note, t.closed_at, t.row_version, t.created_at, t.updated_at,
         t.visit_id, t.job_id, t.service_label, t.revisit_visit_id,
         t.company_id, co.name AS company_name,
         t.site_id, s.name AS site_name, s.city AS site_city,
         t.technician_user_id, tu.name AS technician_name,
         t.action_owner_user_id, ou.name AS action_owner_name,
         t.raised_by, rb.name AS raised_by_name, t.closed_by, xb.name AS closed_by_name,
         ${REVISIT_FIELDS}
  FROM feedback_tickets t
  JOIN companies co ON co.id = t.company_id
  JOIN sites s ON s.id = t.site_id
  LEFT JOIN users tu ON tu.id = t.technician_user_id
  LEFT JOIN users ou ON ou.id = t.action_owner_user_id
  LEFT JOIN users rb ON rb.id = t.raised_by
  LEFT JOIN users xb ON xb.id = t.closed_by
  ${REVISIT_JOINS}`;

function ticketRow(t) {
  return {
    id: t.id,
    ticket_number: t.ticket_number,
    request_id: t.request_id,
    month: t.month,
    status: t.status,
    suggested_priority: t.suggested_priority,
    priority: t.priority,
    action: t.action,
    issue_summary: t.issue_summary,
    action_owner: person(t.action_owner_user_id, t.action_owner_name),
    action_due_at: t.action_due_at,
    action_note: t.action_note,
    customer: { id: t.company_id, name: t.company_name },
    site: { id: t.site_id, name: t.site_name, city: t.site_city },
    visit_id: t.visit_id,
    job_id: t.job_id,
    service_label: t.service_label,
    technician: person(t.technician_user_id, t.technician_name),
    revisit_visit_id: t.revisit_visit_id,
    revisit: revisitOf(t),
    raised_by: person(t.raised_by, t.raised_by_name),
    closed_by: person(t.closed_by, t.closed_by_name),
    closed_at: t.closed_at,
    close_note: t.close_note,
    row_version: t.row_version,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

// GET /tickets: the Feedback Desk list (a collector without a desk permission sees the
// tickets they raised). Filters: status (ACTION_PENDING, CLOSED; OPEN = ACTION_PENDING),
// priority, owner_user_id, raised_by, company_id, site_id, month, from / to (raised date),
// q (ticket number, customer or site), page, page_size. Highest priority first, newest first.
async function listTickets(req) {
  const query = req.query || {};
  const where = [];
  const params = [];

  if (!isDesk(req)) { where.push("t.raised_by = ?"); params.push(req.user.id); }
  const priorities = csvOf(query.priority, PRIORITIES, "priority");
  if (priorities.length) { where.push("t.priority IN (?)"); params.push(priorities); }
  for (const [key, column, label] of [["owner_user_id", "t.action_owner_user_id", "action owner"], ["raised_by", "t.raised_by", "user"]]) {
    const id = optionalUserId(query[key], label);
    if (id) { where.push(`${column} = ?`); params.push(id); }
  }
  if (query.company_id) { where.push("t.company_id = ?"); params.push(String(query.company_id)); }
  if (query.site_id) { where.push("t.site_id = ?"); params.push(String(query.site_id)); }
  if (query.month) { where.push("t.period_month = ?"); params.push(monthRange(query.month).start); }
  const from = optionalDate(query.from, "From");
  const to = optionalDate(query.to, "To");
  if (from) { where.push("t.created_at >= ?"); params.push(`${from} 00:00:00`); }
  if (to) { where.push("t.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(to); }
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) { where.push("(t.ticket_number LIKE ? OR co.name LIKE ? OR s.name LIKE ?)"); params.push(likeOf(q), likeOf(q), likeOf(q)); }

  const fromJoins = "FROM feedback_tickets t JOIN companies co ON co.id = t.company_id JOIN sites s ON s.id = t.site_id";
  const baseWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [countRows] = await pool.query(`SELECT t.status, COUNT(*) AS n ${fromJoins} ${baseWhere} GROUP BY t.status`, params);
  const statusCounts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const r of countRows) statusCounts[r.status] = Number(r.n);

  const statuses = csvOf(query.status, [...TICKET_STATUSES, "OPEN"], "status").map((s) => (s === "OPEN" ? "ACTION_PENDING" : s));
  const listWhere = [...where];
  const listParams = [...params];
  if (statuses.length) { listWhere.push("t.status IN (?)"); listParams.push([...new Set(statuses)]); }
  const whereSql = listWhere.length ? `WHERE ${listWhere.join(" AND ")}` : "";

  const { page, pageSize, offset } = pageOf(query, 25, 100);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${fromJoins} ${whereSql}`, listParams);
  const [rows] = await pool.query(
    `${TICKET_SELECT} ${whereSql}
     ORDER BY FIELD(t.priority, 'HIGH', 'MEDIUM', 'LOW'), t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...listParams, pageSize, offset]
  );
  return { tickets: rows.map(ticketRow), total: Number(total), page, page_size: pageSize, status_counts: statusCounts };
}

// GET /tickets/:id (id or FB-0142) - the ticket, the feedback that raised it, its WhatsApp
// messages and its history.
async function getTicket(req, id) {
  const [[row]] = await pool.query(`${TICKET_SELECT} WHERE t.id = ? OR t.ticket_number = ?`, [id, id]);
  if (!row) throw new HttpError(404, "Feedback ticket not found");
  if (!isDesk(req) && Number(row.raised_by) !== Number(req.user.id)) throw new HttpError(404, "Feedback ticket not found");

  let submission = null;
  if (row.submission_id) {
    const [[s]] = await pool.query(
      `SELECT sb.*, u.name AS collected_by_name FROM feedback_submissions sb
       LEFT JOIN users u ON u.id = sb.collected_by_user_id WHERE sb.id = ?`,
      [row.submission_id]
    );
    if (s) submission = submissionRow(s, await questionsAnswers([s.id]), null);
  }
  const [contacts] = await pool.query(
    `SELECT id, name, phone, email, role, is_primary FROM contacts
     WHERE company_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY is_primary DESC, name`,
    [row.site_id]
  );
  const [messages] = await pool.query(
    `SELECT m.id, m.recipient_type, m.phone, m.body, m.status, m.opened_at, m.opened_by, u.name AS opened_by_name, wt.code AS template_code
     FROM feedback_whatsapp_messages m
     LEFT JOIN users u ON u.id = m.opened_by
     LEFT JOIN feedback_whatsapp_templates wt ON wt.id = m.template_id
     WHERE m.ticket_id = ? ORDER BY m.opened_at DESC`,
    [row.id]
  );
  const [history] = await pool.query(
    `SELECT h.*, u.name AS changed_by_name
     FROM feedback_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.ticket_id = ? ORDER BY h.created_at DESC, h.id DESC`,
    [row.id]
  );
  return {
    ...ticketRow(row),
    feedback: submission,
    contacts: contacts.map((c) => ({ ...c, is_primary: Boolean(c.is_primary) })),
    whatsapp_messages: messages.map((m) => ({
      id: m.id, template: m.template_code, recipient_type: m.recipient_type, phone: m.phone, body: m.body,
      status: m.status, opened_at: m.opened_at, opened_by: person(m.opened_by, m.opened_by_name),
    })),
    history: history.map(historyRow),
  };
}

/* ------------------------------------------------------------ labels */

// No bell / phone notifications: the Feedback Desk sidebar shows counts instead (GET /badges).
const ACTION_LABELS = { RESOLVED_ON_CALL: "Resolved on call", SCHEDULE_REVISIT: "Schedule re-visit", ESCALATE_OPERATIONS: "Escalate to Operations", OTHER: "Other" };
const PRIORITY_LABELS = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

/* ------------------------------------------------------------ WhatsApp click-to-send (B6) */

// A number WhatsApp accepts in a wa.me link: country code + number, digits only. A 10-digit
// Indian mobile gets 91 in front; a leading 0 is dropped.
function whatsappNumber(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) throw new HttpError(400, `"${phone}" is not a phone number WhatsApp can use`);
  return digits;
}

function monthLabel(month) {
  const d = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function dayLabel(value) {
  if (!value) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  const d = new Date(`${text.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? text.slice(0, 10) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Replaces {placeholder}s; an unknown or empty one becomes "".
function fillTemplate(body, values) {
  return String(body).replace(/\{([a-z]+)\}/g, (_, key) => (values[key] === undefined || values[key] === null ? "" : String(values[key])));
}

async function activeTemplate(conn, code) {
  const [[t]] = await conn.query("SELECT id, code, body, audiences, is_active FROM feedback_whatsapp_templates WHERE code = ?", [code]);
  if (!t) throw new HttpError(400, `Unknown template "${code}"`);
  if (!t.is_active) throw new HttpError(400, `The ${code} message is switched off in Masters -> WhatsApp templates`);
  return { ...t, audiences: t.audiences ? t.audiences.split(",") : [] };
}

// The values a template can use, for a call and (optionally) one of its tickets.
async function templateValues(conn, r, ticketId, userId) {
  const [[names]] = await conn.query(
    `SELECT co.name AS customer, s.name AS site, (SELECT name FROM users WHERE id = ?) AS collector
     FROM companies co JOIN sites s ON s.id = ? WHERE co.id = ?`,
    [userId, r.site_id, r.company_id]
  );
  const values = { customer: names?.customer, site: names?.site, collector: names?.collector, date: monthLabel(r.month), link: "" };
  if (!ticketId) return { values, ticket: null };

  const [[t]] = await conn.query(
    `SELECT t.*, tu.name AS technician_name, ou.name AS owner_name,
            DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-%d') AS visit_date,
            DATE_FORMAT(rv.scheduled_date, '%Y-%m-%d %H:%i') AS revisit_date
     FROM feedback_tickets t
     LEFT JOIN users tu ON tu.id = t.technician_user_id
     LEFT JOIN users ou ON ou.id = t.action_owner_user_id
     LEFT JOIN job_visits v ON v.id = t.visit_id
     LEFT JOIN job_visits rv ON rv.id = t.revisit_visit_id
     WHERE t.id = ? AND t.request_id = ?`,
    [ticketId, r.id]
  );
  if (!t) throw new HttpError(400, "That ticket does not belong to this call");

  let feedback = t.issue_summary || "";
  if (t.submission_id) {
    const [bad] = await conn.query(
      "SELECT question_text, option_label FROM feedback_responses WHERE submission_id = ? AND is_bad = 1 ORDER BY id",
      [t.submission_id]
    );
    const [[s]] = await conn.query("SELECT other_feedback FROM feedback_submissions WHERE id = ?", [t.submission_id]);
    const parts = bad.map((b) => `${b.question_text} ${b.option_label}`);
    if (s?.other_feedback) parts.push(`"${s.other_feedback}"`);
    if (parts.length) feedback = [t.issue_summary, ...parts].filter(Boolean).join("; ");
  }
  const actionText = t.action === "OTHER" && t.action_note ? `Other - ${t.action_note}` : ACTION_LABELS[t.action];
  const action = [actionText, t.owner_name, t.action_due_at ? `by ${dayLabel(t.action_due_at)}` : null].filter(Boolean).join(" · ");
  Object.assign(values, {
    ticket: t.ticket_number,
    priority: PRIORITY_LABELS[t.priority],
    feedback,
    action,
    technician: t.technician_name || "",
    date: t.revisit_date ? dayLabel(t.revisit_date) : t.visit_date ? dayLabel(t.visit_date) : values.date,
  });
  return { values, ticket: t };
}

async function saveWhatsappMessage(conn, { r, ticketId, templateId, recipientType, recipientUserId, recipientContactId, phone, body, userId }) {
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO feedback_whatsapp_messages
       (id, request_id, ticket_id, template_id, recipient_type, recipient_user_id, recipient_contact_id, phone, body, status, opened_by, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPENED', ?, NOW())`,
    [id, r.id, ticketId, templateId, recipientType, recipientUserId, recipientContactId, phone, body, userId]
  );
  return { message_id: id, phone, body, wa_me_url: `https://wa.me/${phone}?text=${encodeURIComponent(body)}` };
}

const RECIPIENT_TYPES = ["CUSTOMER", "OPERATIONS", "TECHNICIAN", "OTHER"];
// Messages about the call as a whole (no ticket): the thank-you to a customer with no issue.
const NO_TICKET_TEMPLATES = ["THANK_YOU"];

// POST /calls/:id/whatsapp - fills a template and returns the wa.me link the app opens.
// Body: { template_code: FEEDBACK_SUMMARY | REVISIT_BOOKED, recipient_type, ticket_id,
//         contact_id? (customer) | user_id? (staff) | phone? }
// The technician defaults to the ticket's technician. Recorded as OPENED: whether Send was tapped
// in WhatsApp is not known. The form link has its own endpoint (it needs a new link).
async function sendWhatsapp(req, requestId, body) {
  const code = typeof body?.template_code === "string" ? body.template_code.trim().toUpperCase() : "";
  if (code === "FORM_LINK") throw new HttpError(400, "Send the form link with the form link button");
  const recipientType = typeof body?.recipient_type === "string" ? body.recipient_type.trim().toUpperCase() : "";
  if (!RECIPIENT_TYPES.includes(recipientType)) throw new HttpError(400, `Choose who the message goes to: ${RECIPIENT_TYPES.join(", ")}`);

  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId, { openDone: true });
    const template = await activeTemplate(conn, code);
    if (recipientType !== "OTHER" && !template.audiences.includes(recipientType)) {
      throw new HttpError(400, `The ${code} message is not meant for ${recipientType.toLowerCase()}`);
    }
    const needsTicket = !NO_TICKET_TEMPLATES.includes(code);
    if (needsTicket && !body?.ticket_id) throw new HttpError(400, "Choose the ticket the message is about");
    const { values, ticket } = await templateValues(conn, r, needsTicket ? String(body.ticket_id) : null, req.user.id);

    let phone = null;
    let recipientUserId = null;
    let recipientContactId = null;
    if (recipientType === "CUSTOMER" && body?.contact_id) {
      const c = await siteContact(conn, r.site_id, body.contact_id);
      phone = c.phone;
      recipientContactId = c.id;
    } else if (recipientType !== "CUSTOMER" && recipientType !== "OTHER" && (body?.user_id || (recipientType === "TECHNICIAN" && !body?.phone))) {
      recipientUserId = optionalUserId(body.user_id, "user") || ticket?.technician_user_id;
      if (!recipientUserId) throw new HttpError(400, "The ticket has no technician - choose who to send it to");
      const [[u]] = await conn.query("SELECT id, phone, is_active FROM users WHERE id = ?", [recipientUserId]);
      if (!u) throw new HttpError(400, "User not found");
      if (!u.phone) throw new HttpError(400, "That user has no phone number");
      phone = u.phone;
    }
    if (!phone) phone = optionalText(body?.phone, "phone number", 20);
    if (!phone) throw new HttpError(400, "Choose the contact or enter the phone number");

    const message = await saveWhatsappMessage(conn, {
      r, ticketId: ticket?.id ?? null, templateId: template.id, recipientType, recipientUserId, recipientContactId,
      phone: whatsappNumber(phone), body: fillTemplate(template.body, values), userId: req.user.id,
    });
    await addHistory(conn, {
      requestId: r.id, ticketId: ticket?.id ?? null, event: "WHATSAPP_SENT",
      note: `${code} to ${recipientType.toLowerCase()} (${message.phone})`, userId: req.user.id,
    });
    return message;
  });
}

/* ------------------------------------------------------------ customer form link (B7) */

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function formUrl(token) {
  const base = String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("FRONTEND_URL is not set - the feedback form link can't be made");
  return `${base}/feedback/${token}`;
}

// POST /calls/:id/form-link - when the call isn't answered. Body: { contact_id? | phone, send_whatsapp? (default true) }
// Makes a new link (earlier unused links stop working), valid for link_expiry_days, and moves the
// call to FORM_SENT. With send_whatsapp it also fills FORM_LINK and returns the wa.me link.
// The token is only in this response and the message; the database keeps its SHA-256.
async function sendFormLink(req, requestId, body) {
  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId);
    if (r.status === "FORM_RECEIVED") throw new HttpError(409, "The customer has already sent the form - check their answers");
    const contact = await siteContact(conn, r.site_id, body?.contact_id);
    const phone = contact ? contact.phone : optionalText(body?.phone, "phone number", 20);
    if (!phone) throw new HttpError(400, "Choose the contact or enter the phone number");
    const waPhone = whatsappNumber(phone);
    const settings = await getSettings(conn);

    await conn.query(
      "UPDATE feedback_form_links SET revoked_at = NOW() WHERE request_id = ? AND submitted_at IS NULL AND revoked_at IS NULL",
      [requestId]
    );
    const token = crypto.randomBytes(24).toString("base64url");
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO feedback_form_links (id, request_id, token_hash, contact_id, phone, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ? DAY, ?)`,
      [id, requestId, hashToken(token), contact?.id ?? null, waPhone, settings.link_expiry_days, req.user.id]
    );
    const [[link]] = await conn.query("SELECT expires_at FROM feedback_form_links WHERE id = ?", [id]);
    await bumpCall(conn, requestId, { status: "FORM_SENT" });
    await addHistory(conn, {
      requestId, event: "FORM_LINK_SENT", from: r.status, to: "FORM_SENT",
      note: `Form link for ${contact?.name ? `${contact.name}, ` : ""}${waPhone} - valid ${settings.link_expiry_days} day(s)`, userId: req.user.id,
    });

    const url = formUrl(token);
    let whatsapp = null;
    if (body?.send_whatsapp !== false) {
      const template = await activeTemplate(conn, "FORM_LINK");
      const { values } = await templateValues(conn, r, null, req.user.id);
      whatsapp = await saveWhatsappMessage(conn, {
        r, ticketId: null, templateId: template.id, recipientType: "CUSTOMER", recipientUserId: null,
        recipientContactId: contact?.id ?? null, phone: waPhone, body: fillTemplate(template.body, { ...values, link: url }), userId: req.user.id,
      });
    }
    return { form_link_id: id, url, expires_at: link.expires_at, status: "FORM_SENT", whatsapp };
  });
}

// The link behind a token, and why it can't be used (if it can't).
async function formLinkByToken(executor, token, { lock = false } = {}) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new HttpError(404, "This feedback link is not valid");
  const [[link]] = await executor.query(
    `SELECT l.*, (l.expires_at < NOW()) AS expired, r.status AS call_status, r.site_id, r.company_id,
            DATE_FORMAT(r.period_month, '%Y-%m') AS month
     FROM feedback_form_links l JOIN feedback_requests r ON r.id = l.request_id
     WHERE l.token_hash = ? ${lock ? "FOR UPDATE" : ""}`,
    [hashToken(token)]
  );
  if (!link) throw new HttpError(404, "This feedback link is not valid");
  if (link.submitted_at) throw new HttpError(410, "Thank you - your feedback for this service has already been received");
  if (link.revoked_at) throw new HttpError(410, "This link has been replaced by a newer one - please use the latest link we sent");
  if (Number(link.expired)) throw new HttpError(410, "This feedback link has expired");
  if (link.call_status === "DONE") throw new HttpError(410, "Feedback for this service is already closed - thank you");
  return link;
}

// GET /api/public/feedback/:token - what the customer's form shows. No login: the token is the key.
// Answers carry no good / bad flag - that's for staff only.
async function getPublicForm(token) {
  const link = await formLinkByToken(pool, token);
  if (!link.opened_at) await pool.query("UPDATE feedback_form_links SET opened_at = NOW() WHERE id = ? AND opened_at IS NULL", [link.id]);
  const [[names]] = await pool.query(
    "SELECT co.name AS customer, s.name AS site FROM companies co JOIN sites s ON s.id = ? WHERE co.id = ?",
    [link.site_id, link.company_id]
  );
  const questions = (await listQuestions()).filter((q) => q.show_on_form);
  const settings = await getSettings();
  return {
    customer: names?.customer || null,
    site: names?.site || null,
    month: link.month,
    month_label: monthLabel(link.month),
    other_text_enabled: settings.other_text_enabled,
    questions: questions.map((q) => ({
      id: q.id, question_text: q.question_text, is_required: q.is_required,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
  };
}

// POST /api/public/feedback/:token - the customer sends the form. Body: { responses, other_feedback?, name? }
// One submission per link. The call moves to FORM_RECEIVED for the collector to check (they raise a
// ticket if needed), and the collector is notified (setting notify_collector_on_form).
async function submitPublicForm(token, body) {
  const out = await inTransaction(async (conn) => {
    const link = await formLinkByToken(conn, token, { lock: true });
    const [[r]] = await conn.query("SELECT id, status, collector_user_id FROM feedback_requests WHERE id = ? FOR UPDATE", [link.request_id]);
    const settings = await getSettings(conn);
    const rows = await cleanResponses(conn, body?.responses, { forForm: true });
    let name = optionalText(body?.name, "name", 150);
    if (!name && link.contact_id) {
      const [[c]] = await conn.query("SELECT name FROM contacts WHERE id = ?", [link.contact_id]);
      name = c?.name || null;
    }
    const submission = await saveSubmission(conn, {
      requestId: r.id, source: "FORM", formLinkId: link.id, contactId: link.contact_id, spokeWith: name,
      otherFeedback: settings.other_text_enabled ? optionalText(body?.other_feedback, "other feedback", 2000) : null, rows,
    });
    await conn.query("UPDATE feedback_form_links SET submitted_at = NOW(), opened_at = COALESCE(opened_at, NOW()) WHERE id = ?", [link.id]);
    await bumpCall(conn, r.id, { status: "FORM_RECEIVED", latest_submission_id: submission.id });
    await addHistory(conn, {
      requestId: r.id, event: "FORM_SUBMITTED", from: r.status, to: "FORM_RECEIVED",
      note: `Form sent by ${name || "the customer"} - ${submission.hasIssue ? "shows an issue" : "all answers good"}`,
    });
  });
  return { ok: true, message: "Thank you for your feedback" };
}

/* ------------------------------------------------------------ Feedback Desk actions (B8) */

async function userWithPermission(conn, userId, permission) {
  const [[row]] = await conn.query(
    `SELECT u.id, u.name, u.is_active, r.name AS role_name,
            EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                    WHERE rp.role_id = u.role_id AND p.name = ?) AS has_permission
     FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [permission, userId]
  );
  if (!row) return null;
  return { ...row, allowed: row.role_name === "admin" || Boolean(row.has_permission) };
}

// Locks a ticket for a desk change and checks the row_version the screen was showing.
async function lockTicket(conn, id, rowVersion) {
  const [[t]] = await conn.query(
    `SELECT t.*, s.name AS site_name FROM feedback_tickets t JOIN sites s ON s.id = t.site_id
     WHERE t.id = ? OR t.ticket_number = ? FOR UPDATE`,
    [id, id]
  );
  if (!t) throw new HttpError(404, "Feedback ticket not found");
  if (rowVersion === undefined || rowVersion === null || Number(rowVersion) !== Number(t.row_version)) {
    throw new HttpError(409, "This ticket was changed by someone else - reload it and try again");
  }
  return t;
}

// PATCH /tickets/:id - Body: { row_version, priority?, action? (SCHEDULE_REVISIT | ESCALATE_OPERATIONS | OTHER),
// action_owner_user_id? (null clears), action_due_at? (null clears), action_note?, issue_summary?,
// revisit_visit_id? (a visit of this site, e.g. the re-visit booked in Jobs; null clears) }
// Only an open ticket can be changed (reopen a closed one first). Each change goes to History.
async function updateTicket(req, id, body) {
  const out = await inTransaction(async (conn) => {
    const t = await lockTicket(conn, id, body?.row_version);
    if (t.status === "CLOSED") throw new HttpError(409, "The ticket is closed - reopen it to change it");
    const set = {};
    const events = [];
    const has = (k) => Object.prototype.hasOwnProperty.call(body || {}, k);

    if (has("priority")) {
      const p = String(body.priority || "").toUpperCase();
      if (!PRIORITIES.includes(p)) throw new HttpError(400, "Choose the priority: LOW, MEDIUM or HIGH");
      if (p !== t.priority) { set.priority = p; events.push(["PRIORITY_SET", `Priority ${PRIORITY_LABELS[t.priority]} -> ${PRIORITY_LABELS[p]}`]); }
    }
    if (has("action")) {
      const a = String(body.action || "").toUpperCase();
      if (!["SCHEDULE_REVISIT", "ESCALATE_OPERATIONS", "OTHER"].includes(a)) throw new HttpError(400, "Choose the action: SCHEDULE_REVISIT, ESCALATE_OPERATIONS or OTHER (close the ticket when it is resolved)");
      if (a !== t.action) { set.action = a; events.push(["ACTION_SET", `Action ${ACTION_LABELS[t.action]} -> ${ACTION_LABELS[a]}`]); }
    }
    let newOwner = null;
    if (has("action_owner_user_id")) {
      const ownerId = optionalUserId(body.action_owner_user_id, "action owner");
      if (ownerId) {
        const [[u]] = await conn.query("SELECT id, name, is_active FROM users WHERE id = ?", [ownerId]);
        if (!u) throw new HttpError(400, "Action owner not found");
        if (!u.is_active) throw new HttpError(400, "The action owner's account is not active");
        if (Number(ownerId) !== Number(t.action_owner_user_id)) { set.action_owner_user_id = ownerId; newOwner = ownerId; events.push(["OWNER_CHANGED", `Owner: ${u.name}`]); }
      } else if (t.action_owner_user_id) {
        set.action_owner_user_id = null;
        events.push(["OWNER_CHANGED", "Owner removed"]);
      }
    }
    if (has("action_due_at")) {
      const due = optionalDateTime(body.action_due_at, "Resolve-by time");
      set.action_due_at = due;
      events.push(["UPDATED", due ? `Resolve by ${due.slice(0, 16)}` : "Resolve-by time removed"]);
    }
    if (has("action_note")) { set.action_note = optionalText(body.action_note, "note", 2000); events.push(["UPDATED", "Note for the team updated"]); }
    if (has("issue_summary")) { set.issue_summary = optionalText(body.issue_summary, "issue summary", 500); events.push(["UPDATED", "Issue summary updated"]); }
    if (has("revisit_visit_id")) {
      const visitId = body.revisit_visit_id ? String(body.revisit_visit_id) : null;
      if (visitId) {
        const [[v]] = await conn.query(
          `SELECT v.id, DATE_FORMAT(v.scheduled_date, '%Y-%m-%d') AS d FROM job_visits v JOIN jobs j ON j.id = v.job_id
           WHERE v.id = ? AND j.company_id = ?`,
          [visitId, t.site_id]
        );
        if (!v) throw new HttpError(400, "That visit is not at this ticket's site");
        events.push(["UPDATED", `Re-visit linked${v.d ? ` (${v.d})` : ""}`]);
      } else {
        events.push(["UPDATED", "Re-visit link removed"]);
      }
      set.revisit_visit_id = visitId;
    }
    if (!Object.keys(set).length) throw new HttpError(400, "Nothing to change");
    const finalAction = set.action ?? t.action;
    const finalNote = has("action_note") ? set.action_note : t.action_note;
    if (finalAction === "OTHER" && !finalNote) throw new HttpError(400, "Describe what will be done for Other (in the note)");

    const keys = Object.keys(set);
    await conn.query(
      `UPDATE feedback_tickets SET ${keys.map((k) => `${k} = ?`).join(", ")}, row_version = row_version + 1 WHERE id = ?`,
      [...keys.map((k) => set[k]), t.id]
    );
    for (const [event, note] of events) await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event, note, userId: req.user.id });
    return { t: { ...t, ...set }, newOwner };
  });
  return out.t.id;
}

// POST /tickets/:id/close - Body: { row_version, close_note? }
async function closeTicket(req, id, body) {
  return inTransaction(async (conn) => {
    const t = await lockTicket(conn, id, body?.row_version);
    if (t.status === "CLOSED") throw new HttpError(409, "The ticket is already closed");
    const note = optionalText(body?.close_note, "closing note", 500);
    await conn.query(
      `UPDATE feedback_tickets SET status = 'CLOSED', closed_by = ?, closed_at = NOW(), close_note = ?, row_version = row_version + 1 WHERE id = ?`,
      [req.user.id, note, t.id]
    );
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "CLOSED", from: "ACTION_PENDING", to: "CLOSED", note: note || "Closed", userId: req.user.id });
    return t.id;
  });
}

// POST /tickets/:id/reopen - Body: { row_version, note } (why it is reopened).
async function reopenTicket(req, id, body) {
  return inTransaction(async (conn) => {
    const t = await lockTicket(conn, id, body?.row_version);
    if (t.status !== "CLOSED") throw new HttpError(409, "The ticket is not closed");
    const note = optionalText(body?.note, "note", 500);
    if (!note) throw new HttpError(400, "Say why the ticket is reopened");
    // Reopened as a follow-up: "resolved on call" no longer fits, so it goes to Operations.
    const action = t.action === "RESOLVED_ON_CALL" ? "ESCALATE_OPERATIONS" : t.action;
    await conn.query(
      `UPDATE feedback_tickets SET status = 'ACTION_PENDING', action = ?, closed_by = NULL, closed_at = NULL, close_note = NULL,
              row_version = row_version + 1 WHERE id = ?`,
      [action, t.id]
    );
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "REOPENED", from: "CLOSED", to: "ACTION_PENDING", note, userId: req.user.id });
    return t.id;
  });
}

// PATCH /calls/:id/collector - Body: { collector_user_id } - the desk gives a monthly call to another
// collector (who must have FEEDBACK_COLLECT). Works on any call that isn't DONE.
async function reassignCall(req, requestId, body) {
  const collectorId = optionalUserId(body?.collector_user_id, "collector");
  if (!collectorId) throw new HttpError(400, "Choose the collector");
  const out = await inTransaction(async (conn) => {
    const [[r]] = await conn.query(
      `SELECT r.*, DATE_FORMAT(r.period_month, '%Y-%m') AS month, s.name AS site_name
       FROM feedback_requests r JOIN sites s ON s.id = r.site_id WHERE r.id = ? FOR UPDATE`,
      [requestId]
    );
    if (!r) throw new HttpError(404, "Feedback call not found");
    if (r.status === "DONE") throw new HttpError(409, "This call is already done");
    const u = await userWithPermission(conn, collectorId, "FEEDBACK_COLLECT");
    if (!u) throw new HttpError(400, "Collector not found");
    if (!u.is_active) throw new HttpError(400, "The collector's account is not active");
    if (!u.allowed) throw new HttpError(400, "That user is not a feedback collector (needs FEEDBACK_COLLECT)");
    if (Number(r.collector_user_id) === collectorId) return { r, changed: false };
    await bumpCall(conn, r.id, { collector_user_id: collectorId });
    await addHistory(conn, { requestId: r.id, event: "ASSIGNED", note: `Given to ${u.name}`, userId: req.user.id });
    return { r, changed: true };
  });
  return requestId;
}

/* ------------------------------------------------------------ sidebar counts */

// GET /badges - the numbers on the Feedback Desk sidebar (instead of notifications): open tickets,
// forms customers sent back, and call-backs that are due. Desk users count everything; a collector
// counts their own calls and the tickets they raised.
async function feedbackBadges(req) {
  const desk = isDesk(req);
  const [[calls]] = await pool.query(
    `SELECT COALESCE(SUM(status = 'FORM_RECEIVED'), 0) AS forms,
            COALESCE(SUM(status <> 'DONE' AND next_call_at IS NOT NULL AND next_call_at <= NOW()), 0) AS callbacks
     FROM feedback_requests ${desk ? "" : "WHERE collector_user_id = ?"}`,
    desk ? [] : [req.user.id]
  );
  const [[tickets]] = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_tickets WHERE status = 'ACTION_PENDING' ${desk ? "" : "AND raised_by = ?"}`,
    desk ? [] : [req.user.id]
  );
  return { forms_received: Number(calls.forms), callbacks_due: Number(calls.callbacks), open_tickets: Number(tickets.n) };
}

/* ------------------------------------------------------------ lookups for the website */

// GET /me - the signed-in user's feedback permissions (admin holds all of them), so the screens
// know what to show. The routes still check every action.
const FEEDBACK_PERMISSIONS = ["FEEDBACK_COLLECT", "FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];
function myFeedbackAccess(req) {
  return { user_id: Number(req.user.id), role: req.user.role, permissions: FEEDBACK_PERMISSIONS.filter((p) => hasPerm(req, p)) };
}

// Active users whose role holds one of the permissions (admin counts as holding all).
async function usersWithAnyPermission(permissions) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.phone, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1
       AND (r.name = 'admin' OR EXISTS (
             SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = u.role_id AND p.name IN (?)))
     ORDER BY u.name`,
    [permissions]
  );
  return rows.map((u) => ({ id: Number(u.id), name: u.name, role: u.role, phone: u.phone }));
}

// GET /people - ticket owners (desk users) and collectors (FEEDBACK_COLLECT) for the dropdowns.
async function feedbackPeople() {
  const [owners, collectors] = await Promise.all([
    usersWithAnyPermission(DESK_PERMISSIONS),
    usersWithAnyPermission(["FEEDBACK_COLLECT"]),
  ]);
  return { owners, collectors: collectors.filter((u) => u.role !== "admin") };
}

// GET /customers - customers with at least one service (see SERVICE_VISIT), with those sites, for the
// customer report.
async function feedbackCustomers() {
  const [rows] = await pool.query(
    `SELECT co.id AS company_id, co.name AS company_name, s.id AS site_id, s.name AS site_name, s.city AS site_city
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     JOIN sites s ON s.id = j.company_id
     JOIN companies co ON co.id = s.company_id
     WHERE ${SERVICE_VISIT}
     GROUP BY co.id, s.id
     ORDER BY co.name, s.name`
  );
  const customers = new Map();
  for (const r of rows) {
    if (!customers.has(r.company_id)) customers.set(r.company_id, { id: r.company_id, name: r.company_name, sites: [] });
    customers.get(r.company_id).sites.push({ id: r.site_id, name: r.site_name, city: r.site_city });
  }
  return [...customers.values()];
}

// GET /sites/:siteId/details?month=2026-09 - what the call list's details panel shows for one site:
// the customer, the site with its contacts, the site's completed visits in the month, this month's
// call (if someone has taken it) and the customer's other sites served that month.
async function siteDetails(siteId, monthValue) {
  const { month, start, next } = monthRange(monthValue);
  const [[site]] = await pool.query(
    `SELECT s.id, s.name, s.city, s.address, co.id AS company_id, co.name AS company_name
     FROM sites s JOIN companies co ON co.id = s.company_id WHERE s.id = ?`,
    [String(siteId)]
  );
  if (!site) throw new HttpError(404, "Site not found");

  const [contacts] = await pool.query(
    `SELECT id, name, phone, email, role, is_primary FROM contacts
     WHERE company_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY is_primary DESC, name`,
    [site.id]
  );
  const [visits] = await pool.query(
    `SELECT v.id, v.job_id, j.code AS job_code, v.status,
            DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-%d') AS visit_date,
            DATE_FORMAT(v.completed_at, '%Y-%m-%d %H:%i') AS completed_at,
            COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
            (SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ')
             FROM visit_technicians vt JOIN users u ON u.id = vt.technician_id WHERE vt.visit_id = v.id) AS technicians
     ${SERVICE_VISITS_IN_PERIOD} AND s.id = ?
     ORDER BY COALESCE(v.completed_at, v.scheduled_date)`,
    [start, next, site.id]
  );
  // This month's call with the time it reached each stage (for the progress bar).
  const [[call]] = await pool.query(
    `SELECT r.id, r.status, r.result, r.collector_user_id, u.name AS collector_name, r.created_at, r.done_at,
            (SELECT MIN(a.called_at) FROM feedback_call_attempts a WHERE a.request_id = r.id AND a.outcome = 'ANSWERED') AS answered_at,
            (SELECT MIN(l.created_at) FROM feedback_form_links l WHERE l.request_id = r.id) AS form_sent_at,
            (SELECT MIN(sb.submitted_at) FROM feedback_submissions sb WHERE sb.request_id = r.id) AS feedback_at
     FROM feedback_requests r LEFT JOIN users u ON u.id = r.collector_user_id
     WHERE r.site_id = ? AND r.period_month = ?`,
    [site.id, start]
  );
  const [tickets] = call
    ? await pool.query(
        `SELECT t.id, t.ticket_number, t.status, t.priority, t.action, t.issue_summary, t.revisit_visit_id,
                t.action_owner_user_id, ou.name AS owner_name, t.action_due_at, t.created_at, t.closed_at,
                ${REVISIT_FIELDS}
         FROM feedback_tickets t LEFT JOIN users ou ON ou.id = t.action_owner_user_id
         ${REVISIT_JOINS}
         WHERE t.request_id = ? ORDER BY t.seq`,
        [call.id]
      )
    : [[]];
  const [otherSites] = await pool.query(
    `SELECT s.id, s.name, s.city, COUNT(DISTINCT v.id) AS visit_count,
            DATE_FORMAT(MAX(COALESCE(v.completed_at, v.scheduled_date)), '%Y-%m-%d') AS last_visit_date,
            GROUP_CONCAT(DISTINCT COALESCE(NULLIF(j.sub_service, ''), j.service_type) SEPARATOR ', ') AS services
     ${SERVICE_VISITS_IN_PERIOD} AND co.id = ? AND s.id <> ?
     GROUP BY s.id
     ORDER BY s.name`,
    [start, next, site.company_id, site.id]
  );

  return {
    month,
    customer: { id: site.company_id, name: site.company_name },
    site: { id: site.id, name: site.name, city: site.city, address: site.address },
    contacts: contacts.map((c) => ({ ...c, is_primary: Boolean(c.is_primary) })),
    visits: visits.map((v) => ({
      id: v.id, job_id: v.job_id, job_code: v.job_code, status: v.status, date: v.visit_date, completed_at: v.completed_at,
      service: v.service, technicians: v.technicians,
    })),
    call: call
      ? {
          id: call.id, status: call.status, result: call.result, collector: person(call.collector_user_id, call.collector_name),
          taken_at: call.created_at, answered_at: call.answered_at, form_sent_at: call.form_sent_at,
          feedback_at: call.feedback_at, done_at: call.done_at,
        }
      : null,
    tickets: tickets.map((t) => ({
      id: t.id, ticket_number: t.ticket_number, status: t.status, priority: t.priority, action: t.action,
      issue_summary: t.issue_summary, revisit_visit_id: t.revisit_visit_id, revisit: revisitOf(t),
      action_owner: person(t.action_owner_user_id, t.owner_name), action_due_at: t.action_due_at,
      created_at: t.created_at, closed_at: t.closed_at,
    })),
    other_sites: otherSites.map((s) => ({
      id: s.id, name: s.name, city: s.city, visit_count: Number(s.visit_count), last_visit_date: s.last_visit_date, services: s.services,
    })),
  };
}

// GET /tickets/:id/revisit-options - the ticket site's visits from the day the ticket was raised,
// to link the re-visit booked in Jobs.
async function revisitOptions(req, id) {
  const [[t]] = await pool.query(
    "SELECT id, site_id, raised_by, revisit_visit_id, DATE(created_at) AS raised_on FROM feedback_tickets WHERE id = ? OR ticket_number = ?",
    [id, id]
  );
  if (!t || (!isDesk(req) && Number(t.raised_by) !== Number(req.user.id))) throw new HttpError(404, "Feedback ticket not found");
  const [visits] = await pool.query(
    `SELECT v.id, v.job_id, j.code AS job_code, v.status,
            DATE_FORMAT(COALESCE(v.completed_at, v.scheduled_date), '%Y-%m-%d') AS visit_date,
            COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
            (SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ')
             FROM visit_technicians vt JOIN users u ON u.id = vt.technician_id WHERE vt.visit_id = v.id) AS technicians
     FROM job_visits v JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id = ? AND (v.id = ? OR COALESCE(v.completed_at, v.scheduled_date) >= ?)
     ORDER BY COALESCE(v.completed_at, v.scheduled_date)
     LIMIT 50`,
    [t.site_id, t.revisit_visit_id, t.raised_on]
  );
  return visits.map((v) => ({
    id: v.id, job_id: v.job_id, job_code: v.job_code, status: v.status, date: v.visit_date, service: v.service, technicians: v.technicians,
  }));
}

module.exports = {
  PRIORITIES,
  REQUEST_STATUSES,
  TICKET_STATUSES,
  ACTIONS,
  HttpError,
  sendError,
  inTransaction,
  hasPerm,
  hasAnyPerm,
  ticketNumber,
  addHistory,
  monthRange,
  listQuestions,
  saveQuestions,
  listTemplates,
  saveTemplates,
  getSettings,
  saveSettings,
  callList,
  openCall,
  getCall,
  recordCallAttempt,
  saveCallFeedback,
  raiseTicketFromCall,
  finishCall,
  listTickets,
  getTicket,
  sendWhatsapp,
  sendFormLink,
  getPublicForm,
  submitPublicForm,
  updateTicket,
  closeTicket,
  reopenTicket,
  reassignCall,
  myFeedbackAccess,
  feedbackPeople,
  feedbackCustomers,
  siteDetails,
  revisitOptions,
  listEmailTemplates,
  saveEmailTemplates,
  feedbackBadges,
  monthLabel,
  dayLabel,
  csvOf,
  optionalDate,
  likeOf,
  isDesk,
  ACTION_LABELS,
  PRIORITY_LABELS,
};
