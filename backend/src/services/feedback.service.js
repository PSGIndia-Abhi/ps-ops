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

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
// A monthly call (feedback_requests) and a ticket (feedback_tickets) have separate statuses.
// WRONG_NUMBER = the last try reached a wrong number. A DONE call's result: GOOD, ISSUE or
// NO_RESPONSE (closed by itself: calls missed and the form link expired unused).
const REQUEST_STATUSES = ["TO_CALL", "NOT_ANSWERED", "WRONG_NUMBER", "FORM_SENT", "FORM_RECEIVED", "DONE"];
const TICKET_STATUSES = ["ACTION_PENDING", "CLOSED"];
// The call list also shows TICKET_OPEN: a done call whose ticket is not closed yet.
const LIST_STATUSES = [...REQUEST_STATUSES, "TICKET_OPEN"];
// OTHER = something else, described in action_note (required for it).
// SITE_AUDIT / SUPERVISOR_VISIT / SALES: done by one assigned person (see ASSIGNED_ACTIONS).
const ACTIONS = ["RESOLVED_ON_CALL", "SCHEDULE_REVISIT", "SITE_AUDIT", "SUPERVISOR_VISIT", "SALES", "ESCALATE_OPERATIONS", "OTHER"];
// Next steps done by one person, stored in action_owner_user_id: who can be assigned (by role name,
// so a new supervisor or salesperson shows up by itself). They see the ticket and mark the step done.
const ASSIGNEE_GROUPS = {
  SUPERVISOR: { label: "supervisor", roleSql: "LOWER(r.name) LIKE '%supervisor%'" },
  SALES: { label: "salesperson", roleSql: "LOWER(r.name) LIKE '%sales%'" },
};
const ASSIGNED_ACTIONS = { SITE_AUDIT: "SUPERVISOR", SUPERVISOR_VISIT: "SUPERVISOR", SALES: "SALES" };
const isAssignedAction = (a) => Object.prototype.hasOwnProperty.call(ASSIGNED_ACTIONS, a);
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
// A JSON column read back as a list of strings (mysql2 may give it parsed or as text).
function jsonList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const v = JSON.parse(value);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const QUESTION_TYPES = ["GENERAL", "SERVICE", "DEPARTMENT"];
// How a feedback asks its questions: the general ones, the ones for the site's services, both, or
// the questions of one department (DEPARTMENT + which one).
const QUESTION_MODES = ["GENERAL", "SERVICE", "BOTH", "DEPARTMENT"];
// Departments (feedback_departments): any department of the user hierarchy the admin adds, by a key.
// OPERATIONS keeps the service flow (the visit, a re-visit in Jobs); every other department gets an
// issue + priority (+ the customer's invoices when with_invoices) and marks its part done.
const OPERATIONS = "OPERATIONS";

/**
 * The questions a feedback asks: GENERAL questions (mode GENERAL / BOTH) and SERVICE questions for a
 * service the site had in the month (mode SERVICE / BOTH). services = the month's service names.
 */
function questionsFor(questions, mode, services, department = null) {
  const had = new Set((services || []).map((x) => String(x).trim().toLowerCase()));
  return questions.filter((q) => {
    // DEPARTMENT questions are asked only when that department's questions are chosen.
    if (q.question_type === "DEPARTMENT") return mode === "DEPARTMENT" && (q.departments || []).includes(department);
    if (mode === "DEPARTMENT") return false;
    return q.question_type === "SERVICE"
      ? mode !== "GENERAL" && q.services.some((x) => had.has(x.trim().toLowerCase()))
      : mode !== "SERVICE";
  });
}

// The services a site had in a call's period (each once) - what its SERVICE questions are about.
// start / next: the call's window_start / window_end (CALL_WINDOW).
async function servicesOfCall(conn, siteId, start, next) {
  const [rows] = await conn.query(
    `SELECT DISTINCT COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service
     FROM job_visits v JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id = ? AND COALESCE(v.status, '') <> 'CANCELED'
       AND COALESCE(v.completed_at, v.scheduled_date) >= ? AND COALESCE(v.completed_at, v.scheduled_date) < ?`,
    [siteId, start, next]
  );
  return rows.map((r) => r.service).filter(Boolean);
}

async function listQuestions(executor = pool, { includeInactive = false } = {}) {
  const activeOnly = includeInactive ? "" : "WHERE is_active = 1";
  const [questions] = await executor.query(
    `SELECT id, question_text, question_type, services, departments, sort_order, is_required, show_on_form, is_active
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
    question_type: q.question_type || "GENERAL",
    services: q.question_type === "SERVICE" ? jsonList(q.services) : [],
    departments: q.question_type === "DEPARTMENT" ? jsonList(q.departments) : [],
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
function cleanQuestionList(body, knownDepts = new Set()) {
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

    const type = typeof q.question_type === "string" ? q.question_type.toUpperCase() : "GENERAL";
    if (!QUESTION_TYPES.includes(type)) throw new HttpError(400, `Question ${no}: choose General, Service or Department`);
    let departments = null;
    if (type === "DEPARTMENT") {
      const list = Array.isArray(q.departments) ? [...new Set(q.departments.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean))] : [];
      if (!list.length) throw new HttpError(400, `Question ${no} is for departments: pick the departments it is asked for`);
      if (list.some((x) => !knownDepts.has(x))) throw new HttpError(400, `Question ${no}: unknown department`);
      departments = list;
    }
    let services = null;
    if (type === "SERVICE") {
      const list = Array.isArray(q.services) ? [...new Set(q.services.map((x) => String(x || "").trim()).filter(Boolean))] : [];
      if (!list.length) throw new HttpError(400, `Question ${no} is service-based: pick the services it is asked for`);
      if (list.length > 60 || list.some((x) => x.length > 100)) throw new HttpError(400, `Question ${no}: too many or too long service names`);
      services = list;
    }

    return {
      id,
      question_text: text,
      question_type: type,
      services,
      departments,
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
  const questions = cleanQuestionList(body, new Set((await listDepartments(pool, { all: true })).map((d) => d.kind)));

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
             (question_text, question_type, services, departments, sort_order, is_required, show_on_form, is_active, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [q.question_text, q.question_type, q.services ? JSON.stringify(q.services) : null, q.departments ? JSON.stringify(q.departments) : null, q.sort_order, q.is_required, q.show_on_form, q.is_active, userId, userId]
        );
        questionId = result.insertId;
      } else {
        await conn.query(
          `UPDATE feedback_questions
           SET question_text = ?, question_type = ?, services = ?, departments = ?, sort_order = ?, is_required = ?, show_on_form = ?, is_active = ?, updated_by = ?
           WHERE id = ?`,
          [q.question_text, q.question_type, q.services ? JSON.stringify(q.services) : null, q.departments ? JSON.stringify(q.departments) : null, q.sort_order, q.is_required, q.show_on_form, q.is_active, userId, questionId]
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

/* ------------------------------------------------------------ departments */

// The departments tickets go to (Masters > Questions > Department). all = also the removed ones.
async function listDepartments(executor = pool, { all = false } = {}) {
  const [rows] = await executor.query(
    `SELECT d.kind, d.org_unit_id, u.name, d.is_active, d.with_invoices
     FROM feedback_departments d JOIN org_units u ON u.id = d.org_unit_id
     ${all ? "" : "WHERE d.is_active = 1 AND u.is_active = 1"}
     ORDER BY d.sort_order, u.name`
  );
  return rows.map((d) => ({
    kind: d.kind, label: d.name, name: d.name, org_unit_id: d.org_unit_id,
    is_active: Boolean(d.is_active), with_invoices: Boolean(d.with_invoices), is_operations: d.kind === OPERATIONS,
  }));
}

// For the admin: the departments and the departments of the user hierarchy that can be added.
async function departmentSetup() {
  const [units] = await pool.query(
    `SELECT id, name FROM org_units WHERE is_active = 1 AND (unit_type IS NULL OR unit_type <> 'Organization') ORDER BY sort_order, name`
  );
  return { departments: await listDepartments(pool, { all: true }), org_units: units };
}

// A key for a new department, from its name ("Quality Team" -> QUALITY_TEAM), unique.
async function newDepartmentKey(conn, name) {
  const base = String(name || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "DEPT";
  const [rows] = await conn.query("SELECT kind FROM feedback_departments");
  const used = new Set(rows.map((r) => r.kind));
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

// PUT /departments - Body: { departments: [{ kind?, org_unit_id, is_active, with_invoices? }] }.
// A row without kind adds that department (or brings back one removed before). is_active false =
// removed: it gets no new tickets and its people lose the Feedback app; its old tickets stay.
async function saveDepartments(body, userId) {
  const list = body?.departments;
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "Send the departments");
  const seenUnits = new Set();
  const clean = list.map((d) => {
    const kind = d?.kind ? String(d.kind).trim().toUpperCase() : null;
    const unit = String(d?.org_unit_id || "").trim();
    if (!unit) throw new HttpError(400, "Choose the department");
    if (seenUnits.has(unit)) throw new HttpError(400, "That department is already in the list");
    seenUnits.add(unit);
    return { kind, unit, active: flag(d.is_active, true), invoices: d.with_invoices === undefined ? null : flag(d.with_invoices, false) };
  });
  await inTransaction(async (conn) => {
    const [existing] = await conn.query("SELECT kind, org_unit_id FROM feedback_departments FOR UPDATE");
    const byKind = new Map(existing.map((e) => [e.kind, e]));
    const byUnit = new Map(existing.map((e) => [e.org_unit_id, e]));
    const [[{ maxSort }]] = await conn.query("SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM feedback_departments");
    let sort = Number(maxSort);
    for (const d of clean) {
      const [[u]] = await conn.query("SELECT id, name FROM org_units WHERE id = ? AND is_active = 1", [d.unit]);
      if (!u) throw new HttpError(400, "That department was not found in the user hierarchy");
      let kind = d.kind;
      if (kind && !byKind.has(kind)) throw new HttpError(400, "Unknown department");
      if (!kind) kind = byUnit.get(d.unit)?.kind || null; // added again: the same key as before
      if (kind) {
        const holder = byUnit.get(d.unit);
        if (holder && holder.kind !== kind) throw new HttpError(400, `${u.name} is already in the list`);
        await conn.query(
          `UPDATE feedback_departments SET org_unit_id = ?, is_active = ?, with_invoices = COALESCE(?, with_invoices), updated_by = ? WHERE kind = ?`,
          [d.unit, d.active, d.invoices, userId, kind]
        );
      } else {
        kind = await newDepartmentKey(conn, u.name);
        sort += 1;
        await conn.query(
          "INSERT INTO feedback_departments (kind, org_unit_id, is_active, with_invoices, sort_order, updated_by) VALUES (?, ?, ?, ?, ?, ?)",
          [kind, d.unit, d.active, d.invoices ?? 0, sort, userId]
        );
        byKind.set(kind, { kind, org_unit_id: d.unit });
        byUnit.set(d.unit, { kind, org_unit_id: d.unit });
      }
    }
  });
  return departmentSetup();
}

/* ------------------------------------------------------------ issue types */

// Each department's issue types (Feedback Desk > Issues). all = also the switched-off ones.
async function listIssueTypes(executor = pool, { all = false } = {}) {
  const [rows] = await executor.query(
    `SELECT id, department_kind, name, is_service, is_active, sort_order FROM feedback_issue_types
     ${all ? "" : "WHERE is_active = 1"} ORDER BY department_kind, sort_order, id`
  );
  return rows.map((t) => ({
    id: t.id, department: t.department_kind, name: t.name, is_service: Boolean(t.is_service), is_active: Boolean(t.is_active),
  }));
}

// PUT /issue-types - Body: { department, types: [{ id?, name, is_active }] } - one department's issues,
// in display order. A row without id is new. Nothing is deleted: an issue is switched off instead.
async function saveIssueTypes(body, userId) {
  const kind = String(body?.department || "").trim().toUpperCase();
  const list = body?.types;
  if (!Array.isArray(list)) throw new HttpError(400, "Send the issues");
  if (list.length > 50) throw new HttpError(400, "At most 50 issues per department");
  const seen = new Set();
  const clean = list.map((t, i) => {
    const name = typeof t?.name === "string" ? t.name.trim() : "";
    if (!name) throw new HttpError(400, `Issue ${i + 1}: type its name`);
    if (name.length > 100) throw new HttpError(400, `Issue ${i + 1}: the name is too long (max 100 characters)`);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new HttpError(400, `"${name}" is in the list twice`);
    seen.add(key);
    const id = t?.id === undefined || t?.id === null || t?.id === "" ? null : Number(t.id);
    if (id !== null && !Number.isInteger(id)) throw new HttpError(400, `Issue ${i + 1}: invalid id`);
    return { id, name, active: flag(t.is_active, true), sort: i + 1 };
  });
  await inTransaction(async (conn) => {
    const [[d]] = await conn.query("SELECT kind FROM feedback_departments WHERE kind = ?", [kind]);
    if (!d) throw new HttpError(400, "Unknown department");
    const [existing] = await conn.query("SELECT id FROM feedback_issue_types WHERE department_kind = ? FOR UPDATE", [kind]);
    const mine = new Set(existing.map((e) => e.id));
    // Names move between rows freely: park the names first so the unique key doesn't refuse a swap.
    await conn.query("UPDATE feedback_issue_types SET name = CONCAT('~', id) WHERE department_kind = ?", [kind]);
    for (const t of clean) {
      if (t.id !== null) {
        if (!mine.has(t.id)) throw new HttpError(400, "An issue does not belong to this department");
        await conn.query("UPDATE feedback_issue_types SET name = ?, is_active = ?, sort_order = ?, updated_by = ? WHERE id = ?", [t.name, t.active, t.sort, userId, t.id]);
        mine.delete(t.id);
      } else {
        await conn.query(
          "INSERT INTO feedback_issue_types (department_kind, name, is_active, sort_order, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)",
          [kind, t.name, t.active, t.sort, userId, userId]
        );
      }
    }
    if (mine.size) throw new HttpError(400, "Send every issue of the department (switch one off instead of leaving it out)");
  });
  return { issue_types: await listIssueTypes(pool, { all: true }) };
}

// The issues ticked for one department's part: input [{ id, text }] -> [{ id, name, text, is_service }].
// When the department has issues, at least one must be ticked.
async function pickedIssues(conn, dept, input) {
  const [types] = await conn.query("SELECT id, name, is_service FROM feedback_issue_types WHERE department_kind = ? AND is_active = 1", [dept.kind]);
  const byId = new Map(types.map((t) => [t.id, t]));
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const picked = [];
  for (const x of list) {
    const t = byId.get(Number(x?.id));
    if (!t) throw new HttpError(400, `${dept.name}: that issue is not in its list`);
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const text = optionalText(x?.text, `${t.name} details`, 500);
    picked.push({ id: t.id, name: t.name, text: t.is_service ? null : text, is_service: Boolean(t.is_service) });
  }
  if (types.length && !picked.length) throw new HttpError(400, `Tick at least one issue for ${dept.name}`);
  return picked;
}

// Issues as lines: "Grooming: came without uniform". The Services issue is described by the services.
function issueLines(issues) {
  return issues.filter((i) => !i.is_service || i.text).map((i) => (i.text ? `${i.name}: ${i.text}` : i.name));
}

// The name of a department (for messages), by key.
async function departmentName(executor, kind) {
  const [[d]] = await executor.query(
    "SELECT u.name FROM feedback_departments d JOIN org_units u ON u.id = d.org_unit_id WHERE d.kind = ?", [kind]
  );
  return d?.name || kind;
}

// The department kinds a user works in (active feedback departments they belong to).
async function myDepartmentKinds(userId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT d.kind FROM feedback_departments d
     JOIN org_units u ON u.id = d.org_unit_id AND u.is_active = 1
     JOIN user_org_units x ON x.org_unit_id = d.org_unit_id AND x.user_id = ?
       AND x.effective_from <= CURDATE() AND (x.effective_to IS NULL OR x.effective_to >= CURDATE())
     WHERE d.is_active = 1`,
    [userId]
  );
  return rows.map((r) => r.kind);
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

// SQL: the user in `column` is a desk user (admin, manager, service coordinator...). A collector
// also sees the calls those users took (to read them; working on them stays with that user).
const deskUserSql = (column) => `EXISTS (
    SELECT 1 FROM users du JOIN roles dr ON dr.id = du.role_id
    WHERE du.id = ${column}
      AND (dr.name = 'admin' OR EXISTS (
            SELECT 1 FROM role_permissions drp JOIN permissions dp ON dp.id = drp.permission_id
            WHERE drp.role_id = du.role_id AND dp.name IN (${DESK_PERMISSIONS.map((p) => `'${p}'`).join(", ")}))))`;

/* ------------------------------------------------------------ calls */

// A call's own dates (feedback_requests): due_date = the day it is to be made (by its schedule);
// it asks about the services from period_start, before period_end. period_month = due_date's month.
const CALL_WINDOW = `DATE_FORMAT(r.due_date, '%Y-%m-%d') AS due_on,
         DATE_FORMAT(r.period_start, '%Y-%m-%d') AS window_start, DATE_FORMAT(r.period_end, '%Y-%m-%d') AS window_end`;
const lastDayOf = (windowEnd) => new Date(Date.parse(`${windowEnd}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

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
    WHEN x.status IN ('NOT_ANSWERED', 'WRONG_NUMBER') THEN 2
    WHEN x.status = 'TO_CALL' THEN 3
    WHEN x.status = 'FORM_SENT' THEN 4
    ELSE 5
  END`;

// The calls the list shows, by due date: due=today (the default: due today, and earlier ones not
// done yet - overdue), a date range (from / to), a month, or all.
function callListPeriod(query) {
  const from = optionalDate(query.from, "From date");
  const to = optionalDate(query.to, "To date");
  if (from || to) {
    if (from && to && from > to) throw new HttpError(400, "The From date must be on or before the To date");
    return { month: "range", sql: "r.due_date >= ? AND r.due_date <= ?", params: [from || "2000-01-01", to || "2100-01-01"] };
  }
  if (query.month === "all" || query.due === "all") return { month: "all", sql: "1 = 1", params: [] };
  if (query.month) {
    const { month, start } = monthRange(query.month);
    return { month, sql: "r.period_month = ?", params: [start] };
  }
  return { month: "today", sql: "(r.due_date = CURDATE() OR (r.due_date < CURDATE() AND r.status <> 'DONE'))", params: [] };
}

// The services of a call's period, for its row: count, last date and names.
const CALL_VISITS = (what) => `(SELECT ${what}
     FROM job_visits v JOIN jobs j ON j.id = v.job_id
     WHERE j.company_id = r.site_id AND ${SERVICE_VISIT}
       AND COALESCE(v.completed_at, v.scheduled_date) >= r.period_start AND COALESCE(v.completed_at, v.scheduled_date) < r.period_end)`;

// GET /calls: the feedback calls (made by the call schedules), one row per call, with its status.
// A collector without a desk permission sees calls nobody has taken yet, their own, and calls taken
// by desk users.
// Query: due=today (default: due today + overdue) | all, or month (2026-10), or from / to (due dates),
//        status (comma list, OPEN = not DONE), q (customer / site), company_id, mine=1, page, page_size.
async function callList(req) {
  const query = req.query || {};
  const period = callListPeriod(query);

  const outer = [];
  const outerParams = [];
  if (!isDesk(req)) {
    outer.push(`(x.collector_user_id IS NULL OR x.collector_user_id = ? OR ${deskUserSql("x.collector_user_id")})`);
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
    SELECT r.id AS request_id, DATE_FORMAT(r.period_month, '%Y-%m') AS call_month, ${CALL_WINDOW},
           r.due_date, (r.due_date < CURDATE() AND r.status <> 'DONE') AS overdue,
           s.id AS site_id, s.name AS site_name, s.city AS site_city,
           co.id AS company_id, co.name AS company_name,
           ${CALL_VISITS("COUNT(DISTINCT v.id)")} AS visit_count,
           ${CALL_VISITS("DATE_FORMAT(MAX(COALESCE(v.completed_at, v.scheduled_date)), '%Y-%m-%d')")} AS last_visit_date,
           ${CALL_VISITS("GROUP_CONCAT(DISTINCT COALESCE(NULLIF(j.sub_service, ''), j.service_type) SEPARATOR ', ')")} AS services,
           -- A done call whose ticket is still open shows as TICKET_OPEN until the ticket is closed.
           CASE WHEN r.status = 'DONE' AND EXISTS (SELECT 1 FROM feedback_tickets ot WHERE ot.request_id = r.id AND ot.status = 'ACTION_PENDING')
                THEN 'TICKET_OPEN' ELSE r.status END AS status, r.result,
           r.collector_user_id, cu.name AS collector_name, r.next_call_at, r.updated_at AS last_activity_at
    FROM feedback_requests r
    JOIN sites s ON s.id = r.site_id
    JOIN companies co ON co.id = r.company_id
    LEFT JOIN users cu ON cu.id = r.collector_user_id
    WHERE ${period.sql}`;
  const innerParams = period.params;
  const baseWhere = outer.length ? `WHERE ${outer.join(" AND ")}` : "";

  const [countRows] = await pool.query(
    `SELECT x.status, COUNT(*) AS n FROM (${inner}) x ${baseWhere} GROUP BY x.status`,
    [...innerParams, ...outerParams]
  );
  const statusCounts = Object.fromEntries(LIST_STATUSES.map((st) => [st, 0]));
  for (const r of countRows) statusCounts[r.status] = Number(r.n);

  const statuses = csvOf(query.status, [...LIST_STATUSES, "OPEN"], "status");
  const wanted = [...new Set(statuses.flatMap((st) => (st === "OPEN" ? LIST_STATUSES.filter((x) => x !== "DONE") : [st])))];
  const listWhere = [...outer];
  const listParams = [...outerParams];
  if (wanted.length) { listWhere.push("x.status IN (?)"); listParams.push(wanted); }
  const whereSql = listWhere.length ? `WHERE ${listWhere.join(" AND ")}` : "";

  const { page, pageSize, offset } = pageOf(query, 50, 200);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${inner}) x ${whereSql}`, [...innerParams, ...listParams]);
  // Today: what to do first (forms back, call-backs due...), oldest due first. Otherwise newest first.
  const order = period.month === "today" ? `${CALL_ORDER}, x.due_date, x.company_name, x.site_name` : `x.due_date DESC, ${CALL_ORDER}, x.company_name, x.site_name`;
  const [rows] = await pool.query(
    `SELECT x.* FROM (${inner}) x ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...innerParams, ...listParams, pageSize, offset]
  );

  return {
    month: period.month,
    total: Number(total),
    page,
    page_size: pageSize,
    status_counts: statusCounts,
    sites: rows.map((r) => ({
      month: r.call_month,
      request_id: r.request_id,
      due_date: r.due_on,
      period_start: r.window_start,
      period_end: lastDayOf(r.window_end),
      overdue: Boolean(Number(r.overdue)),
      status: r.status,
      result: r.result,
      customer: { id: r.company_id, name: r.company_name },
      site: { id: r.site_id, name: r.site_name, city: r.site_city },
      visit_count: Number(r.visit_count || 0),
      last_visit_date: r.last_visit_date,
      services: r.services,
      collector: person(r.collector_user_id, r.collector_name),
      next_call_at: r.next_call_at,
      last_activity_at: r.last_activity_at,
    })),
  };
}

// POST /calls { request_id } - the collector takes a call the schedules made (older apps send
// { site_id, month }: that site's latest call in the month). It is given to this collector if
// nobody has it; someone else's call can only be taken over by a desk manager (FEEDBACK_MANAGE).
// Returns the request id.
async function openCall(conn, req, body) {
  let request;
  if (body?.request_id) {
    [[request]] = await conn.query(
      `SELECT r.id, r.collector_user_id, u.name AS collector_name
       FROM feedback_requests r LEFT JOIN users u ON u.id = r.collector_user_id WHERE r.id = ? FOR UPDATE`,
      [String(body.request_id)]
    );
  } else {
    const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
    if (!siteId) throw new HttpError(400, "Choose the call");
    const { start } = monthRange(body?.month);
    [[request]] = await conn.query(
      `SELECT r.id, r.collector_user_id, u.name AS collector_name
       FROM feedback_requests r LEFT JOIN users u ON u.id = r.collector_user_id
       WHERE r.site_id = ? AND r.period_month = ? ORDER BY r.due_date DESC LIMIT 1 FOR UPDATE`,
      [siteId, start]
    );
  }
  if (!request) throw new HttpError(404, "This call is not on the list - its schedule hasn't made it");

  const userId = req.user.id;
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
    `SELECT r.*, DATE_FORMAT(r.period_month, '%Y-%m') AS month, ${CALL_WINDOW},
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
  if (!isDesk(req) && Number(r.collector_user_id) !== Number(req.user.id)) {
    const [[taken]] = await pool.query(`SELECT ${deskUserSql("?")} AS by_desk`, [r.collector_user_id]);
    if (!r.collector_user_id || !Number(taken.by_desk)) throw new HttpError(404, "Feedback call not found");
  }

  const [start, next] = [r.window_start, r.window_end];
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
  const [ticketRows] = await pool.query(
    `SELECT t.id, t.ticket_number, t.status, t.priority, t.action, t.issue_summary, t.created_at, t.revisit_visit_id, t.action_done_at, rv.status AS revisit_status
     FROM feedback_tickets t LEFT JOIN job_visits rv ON rv.id = t.revisit_visit_id WHERE t.request_id = ? ORDER BY t.seq`,
    [id]
  );
  // follow_up_due: the work is done, call the customer back (recordFollowUp) on this page.
  // has_revisit: a re-visit is linked (the "re-visit booked" WhatsApp can be sent).
  const callParts = await loadParts(pool, ticketRows.map((t) => t.id));
  const tickets = ticketRows.map(({ revisit_visit_id: visitId, revisit_status: status, ...t }) => ({
    ...t, has_revisit: Boolean(visitId), parts: callParts.get(t.id) || [],
    follow_up_due: followUpDue({ ...t, revisit_visit_id: visitId }, status, callParts.get(t.id)),
  }));
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
    // The call's due date and the services it asks about (period_start .. period_end, both days in).
    due_date: r.due_on,
    period_start: r.window_start,
    period_end: lastDayOf(r.window_end),
    status: r.status,
    // DONE with a ticket still open shows as TICKET_OPEN until the ticket is closed.
    display_status: r.status === "DONE" && tickets.some((t) => t.status === "ACTION_PENDING") ? "TICKET_OPEN" : r.status,
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
    // Requests for the right number (Feedback Desk > Requests), newest first.
    number_requests: await require("./feedbackNumberRequest.service").callNumberRequests(r.id),
  };
}

/* ------------------------------------------------------------ calls and feedback */

const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "BUSY", "WRONG_NUMBER"];
const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, VERY_HIGH: 4 };

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
    `SELECT r.*, DATE_FORMAT(r.period_month, '%Y-%m') AS month, ${CALL_WINDOW} FROM feedback_requests r WHERE r.id = ? FOR UPDATE`,
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
// A number typed on a call, kept as a contact of that site (contacts.company_id = the site, the
// site's branch; role = position). A site contact with the same number (digits compared) is reused.
// A 10-digit mobile number ("+91 98450 12345" and "919845012345" give "9845012345").
function tenDigitPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^\d{10}$/.test(digits)) throw new HttpError(400, "Enter a 10-digit phone number");
  return digits;
}

function checkedEmail(email) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address");
  return email;
}

async function saveSiteContact(conn, siteId, name, phone, { role = null, email = null } = {}) {
  const digits = tenDigitPhone(phone);
  checkedEmail(email);
  const [rows] = await conn.query("SELECT id, name, phone FROM contacts WHERE company_id = ? AND COALESCE(is_active, 1) = 1", [siteId]);
  const same = rows.find((c) => String(c.phone).replace(/\D/g, "").slice(-10) === digits);
  if (same) return { ...same, created: false };
  const [[site]] = await conn.query("SELECT branch_id FROM sites WHERE id = ?", [siteId]);
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO contacts (id, company_id, name, phone, email, role, is_primary, is_verified, branch_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 1)`,
    [id, siteId, name, digits, email, role, site?.branch_id ?? null]
  );
  return { id, name, phone: digits, created: true };
}

// PATCH /calls/:id/contacts/:contactId - Body: { name, phone, role?, email? }. Corrects a contact of
// the call's site (a wrong number or name). Whoever works the call, or a desk manager.
async function updateCallContact(req, requestId, contactId, body) {
  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId, { openDone: true });
    const [[c]] = await conn.query("SELECT id, name, phone FROM contacts WHERE id = ? AND company_id = ?", [String(contactId), r.site_id]);
    if (!c) throw new HttpError(404, "That contact does not belong to this site");
    const name = optionalText(body?.name, "contact name", 150);
    if (!name) throw new HttpError(400, "Enter the contact's name");
    const phone = tenDigitPhone(body?.phone);
    const role = optionalText(body?.role, "position", 100);
    const email = checkedEmail(optionalText(body?.email, "email", 150));
    const [rows] = await conn.query("SELECT id, name, phone FROM contacts WHERE company_id = ? AND id <> ? AND COALESCE(is_active, 1) = 1", [r.site_id, c.id]);
    const dup = rows.find((x) => String(x.phone).replace(/\D/g, "").slice(-10) === phone);
    if (dup) throw new HttpError(409, `${dup.name} at this site already has that number`);
    await conn.query("UPDATE contacts SET name = ?, phone = ?, role = ?, email = ? WHERE id = ?", [name, phone, role, email, c.id]);
    await addHistory(conn, { requestId: r.id, event: "CONTACT_UPDATED", note: `${c.name} updated - ${name}, ${phone}`, userId: req.user.id });
    return { id: c.id, name, phone, role, email };
  });
}

// POST /calls/:id/contacts - Body: { name, phone, role?, email? }. Saves a new number to the call's site contacts
// (or finds the site's contact that has it). Whoever works the call, or a desk manager.
async function addCallContact(req, requestId, body) {
  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId, { openDone: true });
    const name = optionalText(body?.name, "contact name", 150);
    if (!name) throw new HttpError(400, "Enter the name of the person at this number");
    const phone = optionalText(body?.phone, "phone number", 20);
    if (!phone) throw new HttpError(400, "Enter the phone number");
    const c = await saveSiteContact(conn, r.site_id, name, phone, {
      role: optionalText(body?.role, "position", 100),
      email: optionalText(body?.email, "email", 150),
    });
    if (c.created) await addHistory(conn, { requestId: r.id, event: "CONTACT_ADDED", note: `${c.name}, ${c.phone} saved to the site's contacts`, userId: req.user.id });
    return { id: c.id, name: c.name, phone: c.phone, created: c.created };
  });
}

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
// A missed call (anything but ANSWERED) moves TO_CALL / NOT_ANSWERED / WRONG_NUMBER to NOT_ANSWERED,
// or to WRONG_NUMBER when the number was wrong.
// call_back_at = the customer asked to be called at that time. Returns what the app needs next.
async function recordCallAttempt(req, requestId, body) {
  const outcome = typeof body?.outcome === "string" ? body.outcome.trim().toUpperCase() : "";
  if (!CALL_OUTCOMES.includes(outcome)) throw new HttpError(400, `Choose the call result: ${CALL_OUTCOMES.join(", ")}`);
  const callBackAt = optionalDateTime(body?.call_back_at, "Call back time");

  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, requestId);
    let contact = await siteContact(conn, r.site_id, body?.contact_id);
    let savedContact = false;
    if (!contact) {
      // Another number: it is kept as a contact of this site (each site has its own numbers), or
      // matched to the site's contact that already has it.
      const typed = optionalText(body?.phone, "phone number", 20);
      if (!typed) throw new HttpError(400, "Choose the contact you called, or enter the phone number");
      const name = optionalText(body?.contact_name, "contact name", 150);
      if (!name) throw new HttpError(400, "Enter the name of the person at this number");
      contact = await saveSiteContact(conn, r.site_id, name, typed);
      savedContact = contact.created;
    }
    const phone = contact.phone;
    const contactName = contact.name;

    await conn.query(
      `INSERT INTO feedback_call_attempts (request_id, contact_id, contact_name, phone, outcome, called_by_user_id, called_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [requestId, contact?.id ?? null, contactName, phone, outcome, req.user.id]
    );

    const missed = outcome !== "ANSWERED";
    const newStatus = missed && ["TO_CALL", "NOT_ANSWERED", "WRONG_NUMBER"].includes(r.status)
      ? (outcome === "WRONG_NUMBER" ? "WRONG_NUMBER" : "NOT_ANSWERED")
      : r.status;
    const fields = { status: newStatus };
    if (callBackAt) fields.next_call_at = callBackAt;
    else if (outcome === "ANSWERED") fields.next_call_at = null;
    await bumpCall(conn, requestId, fields);

    const label = { ANSWERED: "Answered", NO_ANSWER: "No answer", BUSY: "Busy", WRONG_NUMBER: "Wrong number" }[outcome];
    await addHistory(conn, {
      requestId, event: "CALL_ATTEMPT", from: r.status, to: newStatus,
      note: `${label} - ${contactName ? `${contactName}, ` : ""}${phone}${callBackAt ? ` - call back ${callBackAt.slice(0, 16)}` : ""}${savedContact ? " - saved to the site's contacts" : ""}`,
      userId: req.user.id,
    });

    // Answered: the number works, so a request for the right number is no longer needed.
    if (outcome === "ANSWERED") {
      const [cancelled] = await conn.query(
        "UPDATE feedback_number_requests SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW(), resolve_note = 'The customer answered' WHERE request_id = ? AND status = 'OPEN'",
        [req.user.id, requestId]
      );
      if (cancelled.affectedRows) {
        await addHistory(conn, { requestId, event: "NUMBER_REQUEST_CANCELLED", note: "Request for the right number cancelled - the customer answered", userId: req.user.id });
      }
    }

    const [[{ missedCalls }]] = await conn.query(
      "SELECT COUNT(*) AS missedCalls FROM feedback_call_attempts WHERE request_id = ? AND outcome <> 'ANSWERED'",
      [requestId]
    );
    const settings = await getSettings(conn);
    return {
      status: newStatus,
      contact_id: contact.id,
      contact_saved: savedContact,
      missed_calls: Number(missedCalls),
      next_call_at: fields.next_call_at === undefined ? r.next_call_at : fields.next_call_at,
      offer_form_link: missed && Number(missedCalls) >= settings.offer_link_after_missed_calls && ["NOT_ANSWERED", "WRONG_NUMBER"].includes(newStatus),
    };
  });
}

// Checks the answers against the active questions of the master and returns rows to store,
// with the answer text copied. Every active required question must be answered once.
// scope = { mode: GENERAL | SERVICE | BOTH, services: the month's services }: the questions asked.
// A required question must be answered only when it is asked; any other one can be skipped.
/** The question mode a feedback was taken with (BOTH when not sent). */
function questionMode(value) {
  const m = typeof value === "string" ? value.trim().toUpperCase() : "BOTH";
  if (!QUESTION_MODES.includes(m)) throw new HttpError(400, "Choose General, Service-based, Both or Department questions");
  return m;
}

// Which questions a call asked: body.question_mode (+ body.question_department for DEPARTMENT).
async function questionScope(conn, r, body) {
  const mode = questionMode(body?.question_mode);
  let department = null;
  if (mode === "DEPARTMENT") {
    department = typeof body?.question_department === "string" ? body.question_department.trim().toUpperCase() : "";
    const known = (await listDepartments(conn, { all: true })).map((d) => d.kind);
    if (!known.includes(department)) throw new HttpError(400, "Choose the department whose questions were asked");
  }
  return { mode, department, services: await servicesOfCall(conn, r.site_id, r.window_start, r.window_end) };
}

async function cleanResponses(conn, responses, { forForm = false, scope = null } = {}) {
  if (!Array.isArray(responses) || responses.length === 0) throw new HttpError(400, "Answer at least one question");
  const questions = (await listQuestions(conn)).filter((q) => !forForm || q.show_on_form);
  const asked = scope ? questionsFor(questions, scope.mode, scope.services, scope.department) : questions;
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
  const missing = asked.find((q) => q.is_required && !seen.has(q.id));
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
// One ticket per call: a new problem later goes on the same ticket (reopened when closed).
async function raiseTicket(conn, req, r, submissionId, suggested, input) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Send the ticket details");
  const [[existing]] = await conn.query("SELECT ticket_number, status FROM feedback_tickets WHERE request_id = ? ORDER BY seq LIMIT 1", [r.id]);
  if (existing) {
    throw new HttpError(409, `This call already has ticket ${existing.ticket_number} - ${existing.status === "CLOSED" ? "reopen it" : "work on it"} instead of raising another`);
  }
  // departments: which teams get the ticket (one or more); left out = Operations, as before.
  const kinds = Array.isArray(input.departments) && input.departments.length
    ? [...new Set(input.departments.map((x) => String(x || "").trim().toUpperCase()))]
    : [OPERATIONS];
  const active = new Map((await listDepartments(conn)).map((d) => [d.kind, d]));
  for (const k of kinds) {
    if (active.has(k) || (k === OPERATIONS && !active.size)) continue;
    throw new HttpError(400, `${await departmentName(conn, k)} doesn't take feedback tickets now - pick another department`);
  }
  const forOps = kinds.includes(OPERATIONS);
  // Older apps sent the Accounts part as input.accounts.
  const partInput = { ...(input.accounts ? { ACCOUNTS: input.accounts } : {}), ...(input.parts && typeof input.parts === "object" ? input.parts : {}) };

  // Each other department's part: the issue for that team, its priority and (when the department
  // works with invoices) the customer's invoice(s).
  const others = [];
  for (const kind of kinds.filter((k) => k !== OPERATIONS)) {
    const dept = active.get(kind);
    const a = partInput[kind] && typeof partInput[kind] === "object" ? partInput[kind] : {};
    const issues = await pickedIssues(conn, dept, a.issues);
    const details = optionalText(a.issue_summary, `${dept.name} details`, 500);
    const summary = [...issueLines(issues), details].filter(Boolean).join("\n").slice(0, 500);
    if (!summary) throw new HttpError(400, `Tick an issue or describe it for ${dept.name}`);
    const p = typeof a.priority === "string" && a.priority ? a.priority.trim().toUpperCase() : suggested || "MEDIUM";
    if (!PRIORITIES.includes(p)) throw new HttpError(400, `Choose the ${dept.name} priority: Very high, High, Medium or Low`);
    const ids = dept.with_invoices && Array.isArray(a.invoice_ids) ? [...new Set(a.invoice_ids.map(String).filter(Boolean))] : [];
    if (ids.length > 20) throw new HttpError(400, "Pick at most 20 invoices");
    if (ids.length) {
      const [found] = await conn.query("SELECT id FROM invoices WHERE id IN (?) AND customer_id = ?", [ids, r.company_id]);
      if (found.length !== ids.length) throw new HttpError(400, "An invoice is not one of this customer's invoices");
    }
    others.push({ kind, name: dept.name, summary, details, issues, priority: p, invoiceIds: ids });
  }

  // Operations keeps the existing fields. A ticket without Operations stores action OTHER (no visit).
  const action = forOps ? (typeof input.action === "string" ? input.action.trim().toUpperCase() : "") : "OTHER";
  if (!ACTIONS.includes(action)) throw new HttpError(400, `Choose the action: ${ACTIONS.join(", ")}`);
  const opsPriority = forOps ? (typeof input.priority === "string" && input.priority ? input.priority.trim().toUpperCase() : suggested) : null;
  if (forOps && !PRIORITIES.includes(opsPriority)) throw new HttpError(400, "Choose the priority: Very high, High, Medium or Low");
  // The ticket's priority is the highest of its parts.
  const priority = [opsPriority, ...others.map((o) => o.priority)].filter(Boolean).reduce((a, b) => (PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a));
  // Operations' issues (Services, Technicians, Grooming...): ticked on its part; the typed ones are
  // added to the ticket's problem text.
  const opsIssues = forOps && active.get(OPERATIONS) ? await pickedIssues(conn, active.get(OPERATIONS), partInput[OPERATIONS]?.issues) : [];
  const issueSummary = forOps
    ? [optionalText(input.issue_summary, "issue summary", 2000), ...issueLines(opsIssues)].filter(Boolean).join("\n").slice(0, 500) || null
    : others.map((o) => o.summary).join(" · ").slice(0, 500);
  const actionNote = forOps ? optionalText(input.action_note, "note", 2000) : null;
  if (forOps && action === "OTHER" && !actionNote) throw new HttpError(400, "Describe what will be done for Other");
  const dueAt = forOps ? optionalDateTime(input.action_due_at, "Resolve-by time") : null;
  const ownerId = forOps ? optionalUserId(input.action_owner_user_id, "action owner") : null;
  if (isAssignedAction(action)) {
    await checkAssignee(conn, action, ownerId);
  } else if (ownerId) {
    const [[owner]] = await conn.query("SELECT id, is_active FROM users WHERE id = ?", [ownerId]);
    if (!owner) throw new HttpError(400, "Action owner not found");
    if (!owner.is_active) throw new HttpError(400, "The action owner's account is not active");
  }

  // The visit the issue is about must be one of that site's completed visits in that month.
  let visit = null;
  if (forOps && input.visit_id) {
    const [start, next] = [r.window_start, r.window_end];
    [[visit]] = await conn.query(
      `SELECT v.id, v.job_id, COALESCE(NULLIF(j.sub_service, ''), j.service_type) AS service,
              (SELECT vt.technician_id FROM visit_technicians vt WHERE vt.visit_id = v.id ORDER BY vt.created_at, vt.id LIMIT 1) AS technician_id
       ${SERVICE_VISITS_IN_PERIOD} AND s.id = ? AND v.id = ?`,
      [start, next, r.site_id, String(input.visit_id)]
    );
    if (!visit) throw new HttpError(400, "That visit is not one of the services this call is about");
  }

  // "Resolved on call" closes at once - unless another department still has work on it.
  const closedNow = action === "RESOLVED_ON_CALL" && !others.length;
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
  if (forOps) {
    await conn.query(
      "INSERT INTO feedback_ticket_parts (id, ticket_id, kind, issue_summary, issues, priority) VALUES (?, ?, 'OPERATIONS', ?, ?, ?)",
      [crypto.randomUUID(), id, issueSummary, opsIssues.length ? JSON.stringify(opsIssues) : null, opsPriority]
    );
  }
  for (const o of others) {
    await conn.query(
      "INSERT INTO feedback_ticket_parts (id, ticket_id, kind, issue_summary, issues, priority, invoice_ids) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), id, o.kind, o.issues.length ? o.details : o.summary, o.issues.length ? JSON.stringify(o.issues) : null, o.priority, o.invoiceIds.length ? JSON.stringify(o.invoiceIds) : null]
    );
  }

  const parts = [];
  if (forOps) parts.push(`Operations: ${action === "OTHER" ? `Other: ${actionNote}` : ACTION_LABELS[action]}${isAssignedAction(action) ? ` (${await userName(conn, ownerId)})` : ""}`);
  for (const o of others) parts.push(`${o.name}: ${o.summary}`);
  await addHistory(conn, {
    requestId: r.id, ticketId: id, event: "TICKET_RAISED", to: closedNow ? "CLOSED" : "ACTION_PENDING",
    note: `${number} · ${priority} · ${parts.join(" · ")}${forOps && issueSummary ? ` - ${issueSummary}` : ""}`.slice(0, 1000), userId: req.user.id,
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
    const rows = await cleanResponses(conn, body?.responses, { scope: await questionScope(conn, r, body) });
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
// "technician" and "work done" stages), and the services of its booking (one job per service).
const REVISIT_FIELDS = `rj.code AS revisit_job_code, rv.status AS revisit_status,
         (SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(bj.sub_service, ''), bj.service_type) SEPARATOR ', ')
          FROM jobs bj WHERE bj.booking_id = rj.booking_id) AS revisit_services,
         DATE_FORMAT(COALESCE(rv.completed_at, rv.scheduled_date), '%Y-%m-%d') AS revisit_date, rv.completed_at AS revisit_completed_at,
         (SELECT GROUP_CONCAT(ru.name ORDER BY ru.name SEPARATOR ', ')
          FROM visit_technicians rvt JOIN users ru ON ru.id = rvt.technician_id WHERE rvt.visit_id = rv.id) AS revisit_technicians`;
const REVISIT_JOINS = `LEFT JOIN job_visits rv ON rv.id = t.revisit_visit_id
  LEFT JOIN jobs rj ON rj.id = rv.job_id`;

function revisitOf(t) {
  if (!t.revisit_visit_id) return null;
  return {
    id: t.revisit_visit_id, job_code: t.revisit_job_code, status: t.revisit_status, date: t.revisit_date,
    completed_at: t.revisit_completed_at, technicians: t.revisit_technicians, services: t.revisit_services,
  };
}

const TICKET_SELECT = `
  SELECT t.id, t.ticket_number, t.request_id, t.submission_id, DATE_FORMAT(t.period_month, '%Y-%m') AS month,
         t.status, t.suggested_priority, t.priority, t.action, t.issue_summary,
         t.action_due_at, t.action_note, t.close_note, t.closed_at, t.row_version, t.created_at, t.updated_at,
         t.action_done_by, db.name AS action_done_by_name, t.action_done_at, t.action_done_note,
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
  LEFT JOIN users db ON db.id = t.action_done_by
  LEFT JOIN users rb ON rb.id = t.raised_by
  LEFT JOIN users xb ON xb.id = t.closed_by
  ${REVISIT_JOINS}`;

// A part's ticked issues (JSON column; mysql2 gives an array or a string).
function partIssues(value) {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  return Array.isArray(v) ? v.map((i) => ({ id: i.id, name: String(i.name || ""), text: i.text || null, is_service: Boolean(i.is_service) })) : [];
}

// The parts of the tickets (by ticket id), with the invoices a part lists.
async function loadParts(executor, ticketIds) {
  const byTicket = new Map(ticketIds.map((id) => [id, []]));
  if (!ticketIds.length) return byTicket;
  const [rows] = await executor.query(
    `SELECT p.*, u.name AS done_by_name, ou.name AS dept_name, d.with_invoices
     FROM feedback_ticket_parts p
     LEFT JOIN users u ON u.id = p.done_by
     LEFT JOIN feedback_departments d ON d.kind = p.kind
     LEFT JOIN org_units ou ON ou.id = d.org_unit_id
     WHERE p.ticket_id IN (?) ORDER BY p.kind <> 'OPERATIONS', d.sort_order, p.kind`,
    [ticketIds]
  );
  const invoiceIds = [...new Set(rows.flatMap((p) => jsonList(p.invoice_ids)))];
  const invoices = new Map();
  if (invoiceIds.length) {
    const [inv] = await executor.query(
      `SELECT id, invoice_number, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, invoice_amount, pending_amount, status
       FROM invoices WHERE id IN (?)`,
      [invoiceIds]
    );
    for (const i of inv) {
      invoices.set(i.id, { id: i.id, number: i.invoice_number, date: i.invoice_date, amount: Number(i.invoice_amount), pending: Number(i.pending_amount), status: i.status });
    }
  }
  for (const p of rows) {
    byTicket.get(p.ticket_id)?.push({
      id: p.id,
      kind: p.kind,
      label: p.dept_name || p.kind,
      is_operations: p.kind === OPERATIONS,
      with_invoices: Boolean(p.with_invoices),
      issues: partIssues(p.issues),
      issue_summary: p.issue_summary,
      priority: p.priority,
      invoices: jsonList(p.invoice_ids).map((i) => invoices.get(i)).filter(Boolean),
      status: p.status,
      done_by: person(p.done_by, p.done_by_name),
      done_at: p.done_at,
      done_note: p.done_note,
    });
  }
  return byTicket;
}

// The parts a user sees: a desk user and the collector see every part; a department member only
// their own department's.
function visibleParts(req, t, parts) {
  if (isDesk(req) || Number(t.raised_by) === Number(req.user.id) || hasPerm(req, "FEEDBACK_COLLECT")) return parts;
  const mine = new Set(req.feedbackDepts || []);
  if (isAssigneeOf(req, t)) mine.add(OPERATIONS);
  return parts.filter((p) => mine.has(p.kind));
}

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
    // SITE_AUDIT / SUPERVISOR_VISIT / SALES: the assigned person (action_owner) marked it done.
    action_done: t.action_done_at ? { by: person(t.action_done_by, t.action_done_by_name), at: t.action_done_at, note: t.action_done_note } : null,
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

  if (!isDesk(req)) {
    // A collector: the tickets they raised. A department member: tickets with a part for their department.
    const scope = [];
    if (hasPerm(req, "FEEDBACK_COLLECT") || !(req.feedbackDepts || []).length) { scope.push("t.raised_by = ?"); params.push(req.user.id); }
    // A supervisor / salesperson: the tickets whose next step is assigned to them.
    if (req.feedbackAssigned) { scope.push("(t.action_owner_user_id = ? AND t.action IN (?))"); params.push(req.user.id, Object.keys(ASSIGNED_ACTIONS)); }
    if ((req.feedbackDepts || []).length) {
      scope.push("EXISTS (SELECT 1 FROM feedback_ticket_parts vp WHERE vp.ticket_id = t.id AND vp.kind IN (?))");
      params.push(req.feedbackDepts);
    }
    where.push(`(${scope.join(" OR ")})`);
  }
  // department: tickets that went to that department (its key, e.g. OPERATIONS).
  if (query.department) {
    const kind = String(query.department).trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,40}$/.test(kind)) throw new HttpError(400, "Unknown department");
    where.push("EXISTS (SELECT 1 FROM feedback_ticket_parts dp WHERE dp.ticket_id = t.id AND dp.kind = ?)");
    params.push(kind);
  }
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
     ORDER BY FIELD(t.priority, 'VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'), t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...listParams, pageSize, offset]
  );
  const parts = await loadParts(pool, rows.map((t) => t.id));
  const tickets = rows.map((t) => {
    const all = parts.get(t.id) || [];
    return { ...ticketRow(t), parts: visibleParts(req, t, all), follow_up_due: followUpDue(t, t.revisit_status, all) };
  });
  return { tickets, total: Number(total), page, page_size: pageSize, status_counts: statusCounts };
}

// GET /tickets/:id (id or FB-0142) - the ticket, the feedback that raised it, its WhatsApp
// messages and its history.
async function getTicket(req, id) {
  const [[row]] = await pool.query(`${TICKET_SELECT} WHERE t.id = ? OR t.ticket_number = ?`, [id, id]);
  if (!row) throw new HttpError(404, "Feedback ticket not found");
  const allParts = (await loadParts(pool, [row.id])).get(row.id) || [];
  const mineKinds = new Set(req.feedbackDepts || []);
  const canSee = isDesk(req) || Number(row.raised_by) === Number(req.user.id) || allParts.some((p) => mineKinds.has(p.kind)) || isAssigneeOf(req, row);
  if (!canSee) throw new HttpError(404, "Feedback ticket not found");

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
    parts: visibleParts(req, row, allParts),
    follow_up_due: followUpDue(row, row.revisit_status, allParts),
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
const ACTION_LABELS = {
  RESOLVED_ON_CALL: "Resolved on call", SCHEDULE_REVISIT: "Book a re-visit", SITE_AUDIT: "Site audit", SUPERVISOR_VISIT: "Supervisor visit",
  SALES: "Sales", ESCALATE_OPERATIONS: "Escalate to Operations", OTHER: "Other",
};
const PRIORITY_LABELS = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", VERY_HIGH: "Very high" };

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
// Body: { template_code: FEEDBACK_SUMMARY | REVISIT_BOOKED | ISSUE_RESOLVED | THANK_YOU, recipient_type, ticket_id,
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
    // Only true messages: "re-visit booked" once a visit is linked, "issue resolved" once closed.
    if (code === "REVISIT_BOOKED" && !ticket.revisit_visit_id) throw new HttpError(400, `Book the re-visit on ${ticket.ticket_number} first`);
    if (code === "ISSUE_RESOLVED" && ticket.status !== "CLOSED") throw new HttpError(400, `${ticket.ticket_number} isn't closed yet`);
    if (code === "TICKET_RAISED" && ticket.status === "CLOSED") throw new HttpError(400, `${ticket.ticket_number} is already closed`);

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
  let base = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("FRONTEND_URL is not set - the feedback form link can't be made");
  // A full https:// address, so WhatsApp shows the link as one the customer can tap.
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
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
            DATE_FORMAT(r.period_month, '%Y-%m') AS month, ${CALL_WINDOW}
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
  const questions = questionsFor((await listQuestions()).filter((q) => q.show_on_form), "BOTH", await servicesOfCall(pool, link.site_id, link.window_start, link.window_end));
  const settings = await getSettings();
  // The contact the link was sent to: the form starts with their name (they can change it).
  const [[contact]] = link.contact_id ? await pool.query("SELECT name FROM contacts WHERE id = ?", [link.contact_id]) : [[null]];
  return {
    customer: names?.customer || null,
    site: names?.site || null,
    contact_name: contact?.name || null,
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
    const rows = await cleanResponses(conn, body?.responses, {
      forForm: true,
      scope: { mode: "BOTH", services: await servicesOfCall(conn, link.site_id, link.window_start, link.window_end) },
    });
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

// PATCH /tickets/:id - Body: { row_version, priority?, action? (SCHEDULE_REVISIT | SITE_AUDIT |
// SUPERVISOR_VISIT | SALES | ESCALATE_OPERATIONS | OTHER), action_owner_user_id? (null clears; the
// supervisor / salesperson for SITE_AUDIT, SUPERVISOR_VISIT and SALES), action_due_at? (null clears), action_note?, issue_summary?,
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
      if (!PRIORITIES.includes(p)) throw new HttpError(400, "Choose the priority: Very high, High, Medium or Low");
      if (p !== t.priority) { set.priority = p; events.push(["PRIORITY_SET", `Priority ${PRIORITY_LABELS[t.priority]} -> ${PRIORITY_LABELS[p]}`]); }
    }
    if (has("action")) {
      const a = String(body.action || "").toUpperCase();
      if (!ACTIONS.includes(a) || a === "RESOLVED_ON_CALL") throw new HttpError(400, "Choose the next step: Book a re-visit, Site audit, Supervisor visit, Sales or Other");
      if (a !== t.action) { set.action = a; events.push(["ACTION_SET", `Action ${ACTION_LABELS[t.action]} -> ${ACTION_LABELS[a]}`]); }
    }
    let newOwner = null;
    if (has("action_owner_user_id")) {
      const ownerId = optionalUserId(body.action_owner_user_id, "action owner");
      if (ownerId) {
        const [[u]] = await conn.query("SELECT id, name, is_active FROM users WHERE id = ?", [ownerId]);
        if (!u) throw new HttpError(400, "Action owner not found");
        if (!u.is_active) throw new HttpError(400, "The action owner's account is not active");
        if (Number(ownerId) !== Number(t.action_owner_user_id)) { set.action_owner_user_id = ownerId; newOwner = ownerId; events.push(["OWNER_CHANGED", `Assigned to ${u.name}`]); }
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
    // Leaving an assigned step (Site audit, Supervisor visit, Sales) takes the person off it.
    const nextAction = set.action ?? t.action;
    if (set.action && isAssignedAction(t.action) && !isAssignedAction(nextAction) && !has("action_owner_user_id") && t.action_owner_user_id) {
      set.action_owner_user_id = null;
    }
    if (!Object.keys(set).length) throw new HttpError(400, "Nothing to change");
    const finalAction = set.action ?? t.action;
    if (isAssignedAction(finalAction)) {
      const finalOwner = "action_owner_user_id" in set ? set.action_owner_user_id : t.action_owner_user_id;
      await checkAssignee(conn, finalAction, finalOwner);
    }
    // A new step or a new person: the step is to be done again.
    if ((set.action || "action_owner_user_id" in set) && t.action_done_at) {
      set.action_done_by = null;
      set.action_done_at = null;
      set.action_done_note = null;
    }
    const finalNote = has("action_note") ? set.action_note : t.action_note;
    if (finalAction === "OTHER" && !finalNote) throw new HttpError(400, "Describe what will be done for Other (in the note)");
    // Choosing "Book a re-visit" (or removing its visit) needs the re-visit visit linked.
    const finalRevisit = has("revisit_visit_id") ? set.revisit_visit_id : t.revisit_visit_id;
    if (finalAction === "SCHEDULE_REVISIT" && !finalRevisit && (set.action || has("revisit_visit_id"))) {
      throw new HttpError(400, "Book the re-visit first - \"Book a re-visit\" needs the visit booked");
    }
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

// The follow-up call is due: the ticket is open and the technician completed its re-visit. Only
// "Other" (no technician visit) can be followed up at any time. revisitStatus = the re-visit's status.
function followUpDue(t, revisitStatus, parts = null) {
  if (t.status !== "ACTION_PENDING") return false;
  // Every part must be done: Operations when its re-visit is completed (or no visit is needed),
  // any other department when its team marked it done. No parts loaded = an Operations ticket.
  const list = parts || [];
  const hasOps = !list.length || list.some((p) => p.kind === OPERATIONS);
  const opsDone = !hasOps || t.action === "OTHER" || (isAssignedAction(t.action) ? Boolean(t.action_done_at) : Boolean(t.revisit_visit_id) && revisitStatus === "COMPLETED");
  const othersDone = list.filter((p) => p.kind !== OPERATIONS).every((p) => p.status === "DONE");
  return opsDone && othersDone;
}

// POST /tickets/:id/follow-up - the call back to the customer after the work, on the ticket's call
// page with the same questions. Body as saving call feedback: { contact_id?, spoke_with_name,
// responses: [{ question_id, option_id }], other_feedback?, started_at?, close_anyway? }.
// All answers good = the customer is satisfied: the ticket closes (only this closes a ticket).
// A bad answer = the same ticket stays open with these answers as its problem, and the re-visit is
// unlinked so another one is booked on it - unless close_anyway, which closes it all the same.
// Whoever works the call, or a desk manager.
async function recordFollowUp(req, id, body) {
  const [[found]] = await pool.query("SELECT request_id FROM feedback_tickets WHERE id = ? OR ticket_number = ?", [id, id]);
  if (!found) throw new HttpError(404, "Feedback ticket not found");
  return inTransaction(async (conn) => {
    const r = await lockCallForWork(conn, req, found.request_id, { openDone: true });
    const [[t]] = await conn.query(
      `SELECT t.*, rv.status AS revisit_status, rj.code AS revisit_job_code
       FROM feedback_tickets t LEFT JOIN job_visits rv ON rv.id = t.revisit_visit_id LEFT JOIN jobs rj ON rj.id = rv.job_id
       WHERE t.id = ? OR t.ticket_number = ? FOR UPDATE`,
      [id, id]
    );
    if (t.status === "CLOSED") throw new HttpError(409, `${t.ticket_number} is already closed`);
    const ticketParts = (await loadParts(conn, [t.id])).get(t.id) || [];
    if (!followUpDue(t, t.revisit_status, ticketParts)) {
      throw new HttpError(400, "Call the customer back once every department has finished its work (re-visit completed or the assigned step marked done, other departments marked done)");
    }
    const hasOpsPart = !ticketParts.length || ticketParts.some((p) => p.kind === OPERATIONS);

    const contact = await siteContact(conn, r.site_id, body?.contact_id);
    const spokeWith = optionalText(body?.spoke_with_name, "name", 150) || contact?.name || null;
    if (!spokeWith) throw new HttpError(400, "Choose who gave the feedback");
    const settings = await getSettings(conn);
    const otherFeedback = settings.other_text_enabled ? optionalText(body?.other_feedback, "other feedback", 2000) : null;
    const startedAt = optionalDateTime(body?.started_at, "Start time");
    const rows = await cleanResponses(conn, body?.responses, { scope: await questionScope(conn, r, body) });
    const bad = rows.filter((x) => x.is_bad);

    const submission = await saveSubmission(conn, {
      requestId: r.id, source: "CALL", contactId: contact?.id ?? null, spokeWith, collectedBy: req.user.id, otherFeedback, startedAt, rows,
    });
    await bumpCall(conn, r.id, { latest_submission_id: submission.id });

    const resolved = bad.length === 0;
    // close_anyway: the answers still show an issue but the ticket is closed (e.g. after several re-visits).
    const closeAnyway = !resolved && body?.close_anyway === true;
    if (resolved || closeAnyway) {
      const closeNote = resolved
        ? `Customer confirmed it is resolved on the follow-up call with ${spokeWith}`
        : `Closed on the follow-up call with ${spokeWith}, although ${bad.length} answer(s) still show an issue`;
      await conn.query(
        `UPDATE feedback_tickets SET status = 'CLOSED', closed_by = ?, closed_at = NOW(), close_note = ?, submission_id = ?, row_version = row_version + 1 WHERE id = ?`,
        [req.user.id, closeNote.slice(0, 500), resolved ? t.submission_id : submission.id, t.id]
      );
    } else {
      await conn.query(
        "UPDATE feedback_tickets SET submission_id = ?, revisit_visit_id = NULL, action_done_by = NULL, action_done_at = NULL, action_done_note = NULL, row_version = row_version + 1 WHERE id = ?",
        [submission.id, t.id]
      );
      // A ticket without Operations goes back to its departments.
      if (!hasOpsPart) {
        await conn.query("UPDATE feedback_ticket_parts SET status = 'PENDING', done_by = NULL, done_at = NULL, done_note = NULL WHERE ticket_id = ? AND kind <> 'OPERATIONS'", [t.id]);
      }
    }
    const unlinked = !resolved && !closeAnyway && t.revisit_job_code ? ` · re-visit Job ${t.revisit_job_code} didn't fix it` : "";
    await addHistory(conn, {
      requestId: r.id, ticketId: t.id, event: "FOLLOWUP_CALL", from: "ACTION_PENDING", to: resolved || closeAnyway ? "CLOSED" : "ACTION_PENDING",
      note: `${resolved ? "Resolved" : closeAnyway ? "Closed with issues" : "Not resolved"} · ${spokeWith}${resolved ? " - all answers good" : ` - ${bad.length} answer(s) show an issue`}${unlinked}`,
      userId: req.user.id,
    });
    return { ticket_id: t.id, ticket_number: t.ticket_number, resolved, closed: resolved || closeAnyway };
  });
}

// POST /tickets/:id/close - Body: { row_version, close_note? }. Closes the ticket without the
// follow-up call, once the action is taken: every team has finished its work (re-visit completed or
// the assigned step marked done, other departments marked done - as followUpDue). Whoever works the
// call, whoever raised the ticket, or a desk manager.
async function closeTicket(req, id, body) {
  return inTransaction(async (conn) => {
    const t = await lockTicket(conn, id, body?.row_version);
    if (t.status === "CLOSED") throw new HttpError(409, "The ticket is already closed");
    const [[r]] = await conn.query("SELECT collector_user_id FROM feedback_requests WHERE id = ?", [t.request_id]);
    const me = Number(req.user.id);
    if (!hasPerm(req, "FEEDBACK_MANAGE") && Number(r?.collector_user_id) !== me && Number(t.raised_by) !== me) {
      throw new HttpError(403, "Only the collector of this call or a desk manager can close the ticket");
    }
    const [[rv]] = t.revisit_visit_id ? await conn.query("SELECT status FROM job_visits WHERE id = ?", [t.revisit_visit_id]) : [[null]];
    const parts = (await loadParts(conn, [t.id])).get(t.id) || [];
    if (!followUpDue(t, rv?.status || null, parts)) {
      throw new HttpError(400, "Close it once the action is taken - every team must finish its work first");
    }
    const note = optionalText(body?.close_note, "note", 400);
    const closeNote = `Closed after the action was taken, without a follow-up call${note ? ` - ${note}` : ""}`.slice(0, 500);
    await conn.query(
      "UPDATE feedback_tickets SET status = 'CLOSED', closed_by = ?, closed_at = NOW(), close_note = ?, row_version = row_version + 1 WHERE id = ?",
      [req.user.id, closeNote, t.id]
    );
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "CLOSED", from: "ACTION_PENDING", to: "CLOSED", note: closeNote, userId: req.user.id });
    return t.id;
  });
}

// POST /tickets/:id/reopen - Body: { row_version, note } (why it is reopened).
// DELETE /tickets/:id - Body: { note? } (why). For a ticket raised by mistake: desk managers and
// whoever raised it. The ticket's own history goes with it; the call's history keeps a line saying
// it was deleted, and WhatsApp messages sent for it stay on the call.
async function deleteTicket(req, id, body) {
  return inTransaction(async (conn) => {
    const [[t]] = await conn.query("SELECT id, request_id, ticket_number, raised_by FROM feedback_tickets WHERE id = ? OR ticket_number = ? FOR UPDATE", [id, id]);
    if (!t || (!hasPerm(req, "FEEDBACK_MANAGE") && Number(t.raised_by) !== Number(req.user.id))) throw new HttpError(404, "Feedback ticket not found");
    const note = optionalText(body?.note, "note", 400);
    await conn.query("DELETE FROM feedback_tickets WHERE id = ?", [t.id]);
    await addHistory(conn, { requestId: t.request_id, event: "TICKET_DELETED", note: `${t.ticket_number} deleted${note ? ` - ${note}` : ""}`, userId: req.user.id });
    return { request_id: t.request_id, ticket_number: t.ticket_number };
  });
}

async function reopenTicket(req, id, body) {
  return inTransaction(async (conn) => {
    const t = await lockTicket(conn, id, body?.row_version);
    // Desk managers, and whoever raised it (the customer has the problem again on their call).
    if (!hasPerm(req, "FEEDBACK_MANAGE") && Number(t.raised_by) !== Number(req.user.id)) throw new HttpError(404, "Feedback ticket not found");
    if (t.status !== "CLOSED") throw new HttpError(409, "The ticket is not closed");
    const note = optionalText(body?.note, "note", 500);
    if (!note) throw new HttpError(400, "Say why the ticket is reopened");
    // The problem is back, so the earlier re-visit no longer counts: it is unlinked and a new one is
    // booked on the same ticket. "Resolved on call" no longer fits, so it becomes "Book a re-visit".
    const action = t.action === "RESOLVED_ON_CALL" ? "SCHEDULE_REVISIT" : t.action;
    await conn.query(
      `UPDATE feedback_tickets SET status = 'ACTION_PENDING', action = ?, revisit_visit_id = NULL, closed_by = NULL, closed_at = NULL, close_note = NULL,
              action_done_by = NULL, action_done_at = NULL, action_done_note = NULL,
              row_version = row_version + 1 WHERE id = ?`,
      [action, t.id]
    );
    // The other departments have their work to do again too.
    await conn.query("UPDATE feedback_ticket_parts SET status = 'PENDING', done_by = NULL, done_at = NULL, done_note = NULL WHERE ticket_id = ? AND kind <> 'OPERATIONS'", [t.id]);
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "REOPENED", from: "CLOSED", to: "ACTION_PENDING", note, userId: req.user.id });
    return t.id;
  });
}

// POST /tickets/:id/parts/:kind/done - Body: { note } (what was done, e.g. "Invoice sent").
// A department's team (or a desk manager) finishes its part of an open ticket. Operations' part is
// done by its re-visit, so every department but Operations is marked here.
async function markPartDone(req, id, kindValue, body) {
  const kind = String(kindValue || "").trim().toUpperCase();
  if (kind === OPERATIONS) throw new HttpError(400, "The Operations part is done when its re-visit is completed");
  const name = await departmentName(pool, kind);
  if (!hasPerm(req, "FEEDBACK_MANAGE") && !(req.feedbackDepts || []).includes(kind)) throw new HttpError(403, `Only ${name} can finish this part`);
  const note = optionalText(body?.note, "note", 500);
  if (!note) throw new HttpError(400, "Say what was done (e.g. invoice sent)");
  return inTransaction(async (conn) => {
    const [[t]] = await conn.query("SELECT id, request_id, ticket_number, status FROM feedback_tickets WHERE id = ? OR ticket_number = ? FOR UPDATE", [id, id]);
    if (!t) throw new HttpError(404, "Feedback ticket not found");
    if (t.status === "CLOSED") throw new HttpError(409, `${t.ticket_number} is closed`);
    const [[p]] = await conn.query("SELECT id, status FROM feedback_ticket_parts WHERE ticket_id = ? AND kind = ? FOR UPDATE", [t.id, kind]);
    if (!p) throw new HttpError(404, `${t.ticket_number} has no ${name} part`);
    if (p.status === "DONE") throw new HttpError(409, `The ${name} part is already done`);
    await conn.query("UPDATE feedback_ticket_parts SET status = 'DONE', done_by = ?, done_at = NOW(), done_note = ? WHERE id = ?", [req.user.id, note, p.id]);
    await conn.query("UPDATE feedback_tickets SET row_version = row_version + 1 WHERE id = ?", [t.id]);
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "PART_DONE", note: `${name} done - ${note}`, userId: req.user.id });
    return { ticket_id: t.id, ticket_number: t.ticket_number };
  });
}

// POST /tickets/:id/action-done - Body: { note } (what was done). The supervisor / salesperson a
// Site audit, Supervisor visit or Sales step is assigned to (or a desk manager) finishes it; then the
// customer is called back.
async function markActionDone(req, id, body) {
  const note = optionalText(body?.note, "note", 500);
  if (!note) throw new HttpError(400, "Say what was done");
  return inTransaction(async (conn) => {
    const [[t]] = await conn.query(
      "SELECT id, request_id, ticket_number, status, action, action_owner_user_id, action_done_at FROM feedback_tickets WHERE id = ? OR ticket_number = ? FOR UPDATE",
      [id, id]
    );
    if (!t) throw new HttpError(404, "Feedback ticket not found");
    if (!isAssignedAction(t.action)) throw new HttpError(400, "This ticket's next step is not assigned to a person");
    if (!hasPerm(req, "FEEDBACK_MANAGE") && Number(t.action_owner_user_id) !== Number(req.user.id)) {
      throw new HttpError(403, `Only the person the ${ACTION_LABELS[t.action].toLowerCase()} is assigned to can mark it done`);
    }
    if (t.status === "CLOSED") throw new HttpError(409, `${t.ticket_number} is closed`);
    if (t.action_done_at) throw new HttpError(409, `The ${ACTION_LABELS[t.action].toLowerCase()} is already done`);
    await conn.query(
      "UPDATE feedback_tickets SET action_done_by = ?, action_done_at = NOW(), action_done_note = ?, row_version = row_version + 1 WHERE id = ?",
      [req.user.id, note, t.id]
    );
    await addHistory(conn, { requestId: t.request_id, ticketId: t.id, event: "ACTION_DONE", note: `${ACTION_LABELS[t.action]} done - ${note}`, userId: req.user.id });
    return { ticket_id: t.id, ticket_number: t.ticket_number };
  });
}

// The assigned person must be an active user of the right group (supervisor / salesperson).
async function checkAssignee(executor, action, userId) {
  const group = ASSIGNEE_GROUPS[ASSIGNED_ACTIONS[action]];
  if (!userId) throw new HttpError(400, `Choose the ${group.label} for the ${ACTION_LABELS[action].toLowerCase()}`);
  const [[u]] = await executor.query(
    `SELECT u.id, u.name, u.is_active, ${group.roleSql} AS fits FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [userId]
  );
  if (!u) throw new HttpError(400, `That ${group.label} was not found`);
  if (!u.is_active) throw new HttpError(400, `${u.name}'s account is not active`);
  if (!Number(u.fits)) throw new HttpError(400, `${u.name} is not a ${group.label}`);
  return u;
}

async function userName(executor, userId) {
  const [[u]] = await executor.query("SELECT name FROM users WHERE id = ?", [userId]);
  return u?.name || "—";
}

// The ticket's next step is assigned to this user (Site audit, Supervisor visit, Sales).
function isAssigneeOf(req, t) {
  return isAssignedAction(t.action) && Number(t.action_owner_user_id) === Number(req.user.id);
}

// Whether the user can have (or had) a next step assigned to them: gives them their tickets on the
// Feedback Desk and in the app (FEEDBACK_ASSIGNED, worked out per request like FEEDBACK_DEPT).
// Supervisors and salespeople (by role, as for the "assign to" lists) always have it, so their
// Tickets tab is there before the first ticket comes.
async function hasAssignedTickets(userId) {
  const roleFits = Object.values(ASSIGNEE_GROUPS).map((g) => g.roleSql).join(" OR ");
  const [[row]] = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM feedback_tickets WHERE action_owner_user_id = ? AND action IN (?))
            OR EXISTS (SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_active = 1 AND (${roleFits})) AS yes`,
    [userId, Object.keys(ASSIGNED_ACTIONS), userId]
  );
  return Boolean(Number(row.yes));
}

// Active users of a group (supervisors / salespeople), for the "assign to" dropdown.
async function assignablePeople(group) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.phone, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1 AND ${ASSIGNEE_GROUPS[group].roleSql} ORDER BY u.name`
  );
  return rows.map((u) => ({ id: Number(u.id), name: u.name, role: u.role, phone: u.phone }));
}

// GET /calls/:id/invoices - the customer's invoices, newest first, for an Accounts issue.
async function callInvoices(req, requestId) {
  const [[r]] = await pool.query("SELECT id, company_id FROM feedback_requests WHERE id = ?", [requestId]);
  if (!r) throw new HttpError(404, "Feedback call not found");
  const [rows] = await pool.query(
    `SELECT id, invoice_number, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, invoice_amount, pending_amount, status
     FROM invoices WHERE customer_id = ? AND status <> 'CANCELLED' ORDER BY invoice_date DESC, created_at DESC LIMIT 100`,
    [r.company_id]
  );
  return rows.map((i) => ({ id: i.id, number: i.invoice_number, date: i.invoice_date, amount: Number(i.invoice_amount), pending: Number(i.pending_amount), status: i.status }));
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
  // A department member counts the open tickets of their department.
  // A supervisor / salesperson counts the open tickets whose step is assigned to them and not done yet.
  const team = !desk && !hasPerm(req, "FEEDBACK_COLLECT");
  const depts = team ? req.feedbackDepts || [] : [];
  const assigned = team && req.feedbackAssigned;
  let tickets;
  if (depts.length || assigned) {
    const mine = [];
    const params = [];
    if (depts.length) { mine.push("EXISTS (SELECT 1 FROM feedback_ticket_parts p WHERE p.ticket_id = t.id AND p.kind IN (?) AND p.status <> 'DONE')"); params.push(depts); }
    if (assigned) { mine.push("(t.action_owner_user_id = ? AND t.action IN (?) AND t.action_done_at IS NULL)"); params.push(req.user.id, Object.keys(ASSIGNED_ACTIONS)); }
    [[tickets]] = await pool.query(`SELECT COUNT(*) AS n FROM feedback_tickets t WHERE t.status = 'ACTION_PENDING' AND (${mine.join(" OR ")})`, params);
  } else {
    [[tickets]] = await pool.query(
      `SELECT COUNT(*) AS n FROM feedback_tickets WHERE status = 'ACTION_PENDING' ${desk ? "" : "AND raised_by = ?"}`,
      desk ? [] : [req.user.id]
    );
  }
  return { forms_received: Number(calls.forms), callbacks_due: Number(calls.callbacks), open_tickets: Number(tickets.n) };
}

/* ------------------------------------------------------------ lookups for the website */

// GET /me - the signed-in user's feedback permissions (admin holds all of them), so the screens
// know what to show. The routes still check every action.
// FEEDBACK_DEPT: a member of a feedback department (not a role permission - worked out per request
// from the departments). Such a user sees only their department's tickets.
const FEEDBACK_PERMISSIONS = ["FEEDBACK_COLLECT", "FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN", "FEEDBACK_ISSUES", "FEEDBACK_SCHEDULE"];
function myFeedbackAccess(req) {
  const permissions = FEEDBACK_PERMISSIONS.filter((p) => hasPerm(req, p));
  if ((req.feedbackDepts || []).length) permissions.push("FEEDBACK_DEPT");
  if (req.feedbackAssigned) permissions.push("FEEDBACK_ASSIGNED");
  return { user_id: Number(req.user.id), role: req.user.role, permissions, departments: req.feedbackDepts || [] };
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
  const [owners, collectors, supervisors, sales] = await Promise.all([
    usersWithAnyPermission(DESK_PERMISSIONS),
    usersWithAnyPermission(["FEEDBACK_COLLECT"]),
    assignablePeople("SUPERVISOR"),
    assignablePeople("SALES"),
  ]);
  // supervisors / sales: who a Site audit, Supervisor visit or Sales step can be assigned to.
  return { owners, collectors: collectors.filter((u) => u.role !== "admin"), supervisors, sales };
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
async function siteDetails(siteId, monthValue, requestId = null) {
  let { month, start, next } = monthRange(monthValue);
  // A call from the list: its own period instead of the month.
  let callId = null;
  if (requestId) {
    const [[r]] = await pool.query(`SELECT r.id, DATE_FORMAT(r.period_month, '%Y-%m') AS month, ${CALL_WINDOW} FROM feedback_requests r WHERE r.id = ? AND r.site_id = ?`, [String(requestId), String(siteId)]);
    if (r) ({ month, window_start: start, window_end: next, id: callId } = r);
  }
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
     WHERE ${callId ? "r.id = ?" : "r.site_id = ? AND r.period_month = ? ORDER BY r.due_date DESC LIMIT 1"}`,
    callId ? [callId] : [site.id, start]
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
    // A call from the list: the services it asks about (both days in).
    period: callId ? { start, end: lastDayOf(next) } : null,
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
  listIssueTypes,
  saveIssueTypes,
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
  recordFollowUp,
  deleteTicket,
  addCallContact,
  updateCallContact,
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
  listDepartments,
  departmentSetup,
  saveDepartments,
  myDepartmentKinds,
  markPartDone,
  markActionDone,
  hasAssignedTickets,
  saveSiteContact,
  tenDigitPhone,
  ASSIGNED_ACTIONS,
  callInvoices,
  monthLabel,
  dayLabel,
  csvOf,
  optionalDate,
  likeOf,
  isDesk,
  ACTION_LABELS,
  PRIORITY_LABELS,
};
