const { v4: uuid } = require("uuid");

// ---------------------------------------------------------------------------
// Site Audit module: shared helpers for audits.routes.js.
// Design: docs/Site Audit - Architecture.docx, API Payloads.docx, Table Design.docx
// ---------------------------------------------------------------------------

const RISK_CATEGORIES = [
  { code: "HARBOURAGE", label: "Rodent harbourage", chainStep: "SHELTER" },
  { code: "BURROWS", label: "Burrows", chainStep: "BURROWS" },
  { code: "ENTRY_POINT", label: "Entry point", chainStep: "ENTRY" },
  { code: "FOOD_SOURCE", label: "Food source", chainStep: null },
  { code: "WATER", label: "Water stagnation", chainStep: null },
  { code: "OTHER", label: "Other", chainStep: null },
];
// Offered when starting an audit (older audits may still carry GENERAL_PEST, RODENT or TERMITE).
const AUDIT_TYPES = ["PRE_SALE", "COMPLAINT", "ROUTINE", "OTHER"];
// Shown in this order; "＋ Other" (typed) comes after them.
const TARGET_PESTS = ["COCKROACHES", "RODENTS", "MOSQUITOES", "FLIES", "TERMITES"];
const LANGUAGES = ["auto", "kn", "hi", "ta", "te", "en"];

// Photos arrive in Phase 2. Until then a finding is complete without one.
const REQUIRE_PHOTO = process.env.AUDIT_REQUIRE_PHOTO === "true";

const EDITABLE_STATUSES = ["IN_PROGRESS", "AMENDING"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback, code: "SERVER_ERROR" });
}

const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const isRealDate = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// Trimmed string or null; throws VALIDATION when too long or required and empty.
function text(value, label, max, required = false) {
  const s = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!s) {
    if (required) throw new HttpError(400, "VALIDATION", `Enter the ${label}`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, "VALIDATION", `The ${label} is too long (max ${max} characters)`);
  return s;
}

function hasPerm(req, name) {
  return req.user?.role === "admin" || (req.user?.permissions || []).includes(name);
}

// Same rules as buildScopeFilter: admin and global see everything, otherwise the
// user's branch / company / site scopes. The auditor always sees their own audit.
function canAccess(user, audit) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (audit.auditor_user_id != null && String(audit.auditor_user_id) === String(user.id)) return true;
  return (user.scopes || []).some((s) =>
    s.scope_type === "global" ||
    (s.scope_type === "branch" && s.scope_id === audit.branch_id) ||
    (s.scope_type === "company" && s.scope_id === audit.company_id) ||
    (s.scope_type === "site" && s.scope_id === audit.site_id));
}

// SQL condition for list queries (alias `a` = audits).
function scopeCondition(user) {
  if (user.role === "admin" || (user.scopes || []).some((s) => s.scope_type === "global")) {
    return { sql: "1=1", params: [] };
  }
  const parts = ["a.auditor_user_id = ?"];
  const params = [user.id];
  for (const s of user.scopes || []) {
    if (s.scope_type === "branch") { parts.push("a.branch_id = ?"); params.push(s.scope_id); }
    if (s.scope_type === "company") { parts.push("a.company_id = ?"); params.push(s.scope_id); }
    if (s.scope_type === "site") { parts.push("a.site_id = ?"); params.push(s.scope_id); }
  }
  return { sql: `(${parts.join(" OR ")})`, params };
}

const AUDIT_SELECT = `
  SELECT a.id, a.audit_number, a.company_id, a.site_id, a.branch_id,
         DATE_FORMAT(a.audit_date, '%Y-%m-%d') AS audit_date, a.audit_type, a.target_pests,
         a.auditor_user_id, a.escort_name, a.escort_designation, a.escort_contact,
         a.customer_action_label, a.site_notes, a.cover_photo_id, a.report_options,
         a.overall_risk, a.overall_risk_override, a.override_reason, a.status,
         DATE_FORMAT(a.started_at, '%Y-%m-%dT%H:%i:%s') AS started_at,
         DATE_FORMAT(a.submitted_at, '%Y-%m-%dT%H:%i:%s') AS submitted_at,
         a.current_report_id, a.row_version, a.created_by, a.updated_by,
         DATE_FORMAT(a.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
  FROM audits a`;

// Loads an audit the user may see. 404 (never 403) so access never leaks existence.
async function loadAudit(db, req, auditId, { forUpdate = false } = {}) {
  if (!isUuid(auditId)) throw new HttpError(404, "NOT_FOUND", "Audit not found");
  const [[audit]] = await db.query(`${AUDIT_SELECT} WHERE a.id = ?${forUpdate ? " FOR UPDATE" : ""}`, [auditId]);
  if (!audit || !canAccess(req.user, audit)) throw new HttpError(404, "NOT_FOUND", "Audit not found");
  return audit;
}

function assertEditable(audit) {
  if (!EDITABLE_STATUSES.includes(audit.status)) {
    throw new HttpError(409, "AUDIT_LOCKED", "This audit is submitted. Amend it before making changes.");
  }
}

async function logHistory(db, { auditId, userId, entityType, entityId = null, action, message = null, oldValue = null, newValue = null }) {
  await db.query(
    `INSERT INTO audit_history (id, audit_id, entity_type, entity_id, action, message, old_value, new_value, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), auditId, entityType, entityId, action, message,
      oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, userId],
  );
}

// First write by a different user than the last editor = a handover.
async function noteHandover(db, req, audit) {
  const lastEditor = audit.updated_by ?? audit.created_by;
  if (lastEditor != null && String(lastEditor) !== String(req.user.id)) {
    const [[prev]] = await db.query("SELECT name FROM users WHERE id = ?", [lastEditor]);
    const [[me]] = await db.query("SELECT name FROM users WHERE id = ?", [req.user.id]);
    await logHistory(db, {
      auditId: audit.id, userId: req.user.id, entityType: "AUDIT", entityId: audit.id, action: "HANDOVER",
      message: `Continued by ${me?.name || "user " + req.user.id} (was ${prev?.name || "user " + lastEditor})`,
    });
  }
}

// Bumps the audit's version and last editor after any change to it or its children.
async function touchAudit(db, auditId, userId) {
  await db.query("UPDATE audits SET row_version = row_version + 1, updated_by = ? WHERE id = ?", [userId, auditId]);
}

async function loadRiskLevels(db) {
  const [rows] = await db.query(
    `SELECT code, label, severity_rank, default_days, timeline_bucket, color_hex
     FROM audit_risk_levels WHERE is_active = 1 ORDER BY severity_rank DESC`,
  );
  return rows;
}

// Next BSP-AUD-YYYY-NNNN, using the existing `sequences` table (row per year).
async function nextAuditNumber(conn, year) {
  const name = `audit_number_${year}`;
  await conn.query(
    "INSERT INTO sequences (name, value) SELECT ?, 0 WHERE NOT EXISTS (SELECT 1 FROM sequences WHERE name = ?)",
    [name, name],
  );
  const [[row]] = await conn.query("SELECT value FROM sequences WHERE name = ? FOR UPDATE", [name]);
  const next = row.value + 1;
  await conn.query("UPDATE sequences SET value = ? WHERE name = ?", [next, name]);
  return `BSP-AUD-${year}-${String(next).padStart(4, "0")}`;
}

// Findings are numbered 01..n across the audit: area order, then creation order.
// Two passes (negative first) so the unique (audit_id, finding_number) key never clashes.
async function renumberFindings(conn, auditId) {
  const [rows] = await conn.query(
    `SELECT f.id FROM audit_findings f JOIN audit_areas ar ON ar.id = f.area_id
     WHERE f.audit_id = ? ORDER BY ar.area_number, f.created_at, f.id`,
    [auditId],
  );
  for (let i = 0; i < rows.length; i++) {
    await conn.query("UPDATE audit_findings SET finding_number = ? WHERE id = ?", [-(i + 1), rows[i].id]);
  }
  await conn.query("UPDATE audit_findings SET finding_number = -finding_number WHERE audit_id = ? AND finding_number < 0", [auditId]);
}

// Overall risk = worst finding level (unless overridden, which is kept separately).
async function recomputeOverallRisk(conn, auditId) {
  const [[worst]] = await conn.query(
    `SELECT f.risk_level FROM audit_findings f JOIN audit_risk_levels r ON r.code = f.risk_level
     WHERE f.audit_id = ? ORDER BY r.severity_rank DESC LIMIT 1`,
    [auditId],
  );
  await conn.query("UPDATE audits SET overall_risk = ? WHERE id = ?", [worst?.risk_level || null, auditId]);
}

// Which required fields a finding is missing (empty list = complete).
// Customer and BestServe actions are optional (only the observation is required).
function findingMissing(f, photoCount) {
  const missing = [];
  if (!f.title) missing.push("title");
  if (!f.risk_category) missing.push("riskCategory");
  if (!f.risk_level) missing.push("riskLevel");
  if (!f.observation_text) missing.push("observationText");
  if (REQUIRE_PHOTO && photoCount === 0 && !f.no_photo_reason) missing.push("photos");
  return missing;
}

// Everything that blocks submit, plus warnings.
async function computeReadiness(db, audit, { excludeNotStartedAreas = false } = {}) {
  const blockers = [];
  const warnings = [];
  const [areas] = await db.query(
    "SELECT id, area_number, area_name, status FROM audit_areas WHERE audit_id = ? ORDER BY area_number",
    [audit.id],
  );
  const [findingCount] = await db.query("SELECT area_id, COUNT(*) AS n FROM audit_findings WHERE audit_id = ? GROUP BY area_id", [audit.id]);
  const countByArea = Object.fromEntries(findingCount.map((r) => [r.area_id, r.n]));

  if (!areas.length) blockers.push({ code: "NO_AREAS", message: "Add at least one area" });
  for (const a of areas) {
    if (a.status === "COMPLETED") continue;
    if (a.status === "NOT_STARTED" && !countByArea[a.id] && excludeNotStartedAreas) continue;
    blockers.push({ code: "AREA_NOT_COMPLETED", areaId: a.id, message: `${a.area_name} is not completed` });
  }
  if (areas.length && !areas.some((a) => a.status === "COMPLETED")) {
    blockers.push({ code: "NO_COMPLETED_AREAS", message: "Complete at least one area" });
  }

  const [voice] = await db.query(
    `SELECT v.finding_id, v.field_type, f.finding_number FROM audit_voice_notes v
     JOIN audit_findings f ON f.id = v.finding_id
     WHERE v.audit_id = ? AND v.is_current = 1 AND v.status NOT IN ('ACCEPTED','MANUAL')`,
    [audit.id],
  );
  for (const v of voice) {
    blockers.push({
      code: "VOICE_NOT_ACCEPTED", findingId: v.finding_id, field: v.field_type,
      message: `Accept or type the ${v.field_type.toLowerCase().replace(/_/g, " ")} for finding ${String(v.finding_number).padStart(2, "0")}`,
    });
  }

  const [[signoff]] = await db.query("SELECT audit_id FROM audit_signoffs WHERE audit_id = ?", [audit.id]);
  if (!signoff) blockers.push({ code: "SIGNOFF_MISSING", message: "Add who received the report" });

  const [[recs]] = await db.query("SELECT COUNT(*) AS n FROM audit_recommendations WHERE audit_id = ?", [audit.id]);
  if (!recs.n) warnings.push({ code: "NO_RECOMMENDATIONS", message: "Action timeline will be built from findings only" });

  return { ready: blockers.length === 0, blockers, warnings };
}

// "All in one" voice note (observation + customer action + BestServe action in one recording):
// stored as an OBSERVATION note whose file name carries ".all3." (no database change needed).
const isCombinedVoice = (objectKey) => /\.all3\.[a-z0-9]+$/i.test(objectKey || "");

module.exports = {
  isCombinedVoice,
  RISK_CATEGORIES, AUDIT_TYPES, TARGET_PESTS, LANGUAGES, REQUIRE_PHOTO, EDITABLE_STATUSES, AUDIT_SELECT,
  HttpError, sendError, isUuid, isRealDate, text, hasPerm, canAccess, scopeCondition,
  loadAudit, assertEditable, logHistory, noteHandover, touchAudit, loadRiskLevels,
  nextAuditNumber, renumberFindings, recomputeOverallRisk, findingMissing, computeReadiness,
};
