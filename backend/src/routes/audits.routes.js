const express = require("express");
const router = express.Router();
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const PERMISSIONS = require("../access/permissions");
const multer = require("multer");
const sharp = require("sharp");
const minioClient = require("../lib/minio");
const {
  isConfigured: isVoiceConfigured, transcribeWalkthrough, VoiceBusyError, VoiceNoSpeechError, VoiceQuotaError, VoiceConfigError,
} = require("../services/AuditVoice.service");
const { translateNow } = require("../jobs/auditQueue.cron");
const { queueReport, generateNow, renderPreview } = require("../services/AuditReport.service");
const {
  RISK_CATEGORIES, AUDIT_TYPES, TARGET_PESTS, LANGUAGES,
  HttpError, sendError, isUuid, isRealDate, text, hasPerm, canAccess, scopeCondition,
  loadAudit, assertEditable, logHistory, noteHandover, touchAudit, loadRiskLevels,
  nextAuditNumber, renumberFindings, recomputeOverallRisk, findingMissing, computeReadiness, isCombinedVoice,
} = require("../utils/audits");
const { shapeFinding, shapeArea, FINDING_SELECT, AREA_SELECT, loadAuditTree } = require("../utils/auditTree");
const { parseMarks, renderMarked, isMarked, markVersion, originalKey, marksKey } = require("../utils/photoMarks");

// ---------------------------------------------------------------------------
// Site Audit module: start, list, resume, save areas, sign-off, readiness,
// submit, history (Phase 1); photos, voice notes + translation (Phase 2).
// Reports come in Phase 3. Payload shapes: docs/Site Audit - API Payloads.docx
// ---------------------------------------------------------------------------

// Temporary-worker tokens have no user id; audits are for real users only.
function requireRealUser(req, res, next) {
  if (!req.user?.id || req.user.is_temporary_worker) {
    return res.status(403).json({ error: "Not available for this account", code: "FORBIDDEN" });
  }
  next();
}

const base = [auth, requireRealUser];
const can = (perm) => [...base, requirePermission(perm)];

// Runs fn inside a transaction on one connection.
async function inTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---- input checks ----------------------------------------------------------

// Free text the supervisor typed for "Other" (a pest or a risk category): letters, numbers, simple punctuation.
const CUSTOM_TEXT_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,'&()/-]{0,49}$/u;

// Known pests are stored as codes (RODENTS); an "Other" pest is stored as typed ("Lizards").
function parseTargetPests(value) {
  if (!Array.isArray(value) || !value.length) throw new HttpError(400, "VALIDATION", "Choose at least one target pest");
  const pests = [];
  for (const raw of value) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const code = text.toUpperCase();
    if (TARGET_PESTS.includes(code)) pests.push(code);
    else if (CUSTOM_TEXT_RE.test(text)) pests.push(text);
    else throw new HttpError(400, "VALIDATION", `Invalid target pest: ${text.slice(0, 50)}`);
  }
  const unique = [...new Set(pests)];
  if (!unique.length) throw new HttpError(400, "VALIDATION", "Choose at least one target pest");
  if (unique.length > 10) throw new HttpError(400, "VALIDATION", "Too many target pests (max 10)");
  return unique;
}

// One or more audit types (array, or one/comma-separated string). Stored comma-separated,
// e.g. "PRE_SALE,ROUTINE" (all codes plus one typed type fit the VARCHAR(50) column).
// Known types are stored as codes; an "Other" type is stored as the text typed for it
// (max 20 characters, no commas, so the whole list fits audits.audit_type VARCHAR(50)).
function parseAuditType(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const known = [];
  let custom = null;
  for (const raw of list) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    if (AUDIT_TYPES.includes(text.toUpperCase())) known.push(text.toUpperCase());
    else if (!custom && text.length <= 20 && CUSTOM_TEXT_RE.test(text) && !text.includes(",")) custom = text;
    else throw new HttpError(400, "VALIDATION", `Invalid audit type: ${text.slice(0, 50)}`);
  }
  const types = AUDIT_TYPES.filter((t) => known.includes(t));
  if (custom) types.push(custom);
  if (!types.length) throw new HttpError(400, "VALIDATION", "Choose at least one audit type");
  return types.join(",");
}

function parseReportOptions(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "VALIDATION", "reportOptions must be an object");
  const out = {};
  for (const k of ["riskChain", "riskByZone", "priority", "ipmCycle"]) {
    if (value[k] !== undefined) out[k] = !!value[k];
  }
  return out;
}

function parseAreaInput(a, label = "area") {
  if (!a || typeof a !== "object") throw new HttpError(400, "VALIDATION", `Invalid ${label}`);
  if (!isUuid(a.id)) throw new HttpError(400, "VALIDATION", `${label}.id must be a UUID made on the device`);
  let areaNumber = null;
  if (a.areaNumber !== undefined && a.areaNumber !== null) {
    areaNumber = Number(a.areaNumber);
    if (!Number.isInteger(areaNumber) || areaNumber < 1 || areaNumber > 999) {
      throw new HttpError(400, "VALIDATION", "areaNumber must be between 1 and 999");
    }
  }
  return {
    id: a.id,
    areaNumber,
    areaName: text(a.areaName, "area name", 200, true),
    zoneName: text(a.zoneName, "zone name", 150),
    notes: text(a.notes, "area notes", 5000),
  };
}

// ---- lookups ---------------------------------------------------------------

router.get("/lookups", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const levels = await loadRiskLevels(pool);
    res.json({
      riskLevels: levels.map((l) => ({
        code: l.code, label: l.label, severityRank: l.severity_rank, defaultDays: l.default_days,
        bucket: l.timeline_bucket, color: l.color_hex,
      })),
      riskCategories: RISK_CATEGORIES,
      auditTypes: AUDIT_TYPES,
      targetPests: TARGET_PESTS,
      languages: LANGUAGES,
    });
  } catch (err) {
    sendError(res, err, "Failed to load audit lookups");
  }
});

// Areas and zones from the most recent audit of this site, to pre-fill a new one.
router.get("/area-suggestions", ...can(PERMISSIONS.CREATE_AUDIT), async (req, res) => {
  try {
    const siteId = text(req.query.siteId, "site", 20, true);
    const scope = scopeCondition(req.user);
    const [[last]] = await pool.query(
      `SELECT a.id, a.audit_number FROM audits a
       WHERE a.site_id = ? AND a.status <> 'CANCELLED' AND ${scope.sql}
       ORDER BY a.audit_date DESC, a.created_at DESC LIMIT 1`,
      [siteId, ...scope.params],
    );
    if (!last) return res.json({ fromAuditNumber: null, zones: [], areas: [] });
    const [areas] = await pool.query(
      "SELECT area_name, zone_name FROM audit_areas WHERE audit_id = ? ORDER BY area_number",
      [last.id],
    );
    const zones = [...new Set(areas.map((a) => a.zone_name).filter(Boolean))];
    res.json({
      fromAuditNumber: last.audit_number,
      zones,
      areas: areas.map((a) => ({ areaName: a.area_name, zoneName: a.zone_name })),
    });
  } catch (err) {
    sendError(res, err, "Failed to load area suggestions");
  }
});

// Active customers + sites the user may audit, for the Start Audit picker.
// (The general /api/companies and /api/sites lists need VIEW_CONTACT, which supervisors lack.)
router.get("/site-options", ...can(PERMISSIONS.CREATE_AUDIT), async (req, res) => {
  try {
    const where = ["s.is_active = 1", "c.is_active = 1"];
    const params = [];
    const u = req.user;
    if (u.role !== "admin" && !(u.scopes || []).some((s) => s.scope_type === "global")) {
      const parts = [];
      for (const s of u.scopes || []) {
        if (s.scope_type === "branch") { parts.push("s.branch_id = ?"); params.push(s.scope_id); }
        if (s.scope_type === "company") { parts.push("s.company_id = ?"); params.push(s.scope_id); }
        if (s.scope_type === "site") { parts.push("s.id = ?"); params.push(s.scope_id); }
      }
      if (!parts.length) return res.json({ items: [] });
      where.push(`(${parts.join(" OR ")})`);
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) {
      where.push("(c.name LIKE ? OR c.display_name LIKE ? OR s.name LIKE ? OR s.address LIKE ? OR s.city LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT s.id AS site_id, s.name AS site_name, CONCAT_WS(', ', NULLIF(s.address,''), NULLIF(s.city,'')) AS site_address,
              c.id AS company_id, COALESCE(c.display_name, c.name) AS company_name
       FROM sites s JOIN companies c ON c.id = s.company_id
       WHERE ${where.join(" AND ")}
       ORDER BY company_name, s.name LIMIT 50`,
      params,
    );
    res.json({
      items: rows.map((r) => ({
        companyId: r.company_id, companyName: r.company_name,
        siteId: r.site_id, siteName: r.site_name, siteAddress: r.site_address,
      })),
    });
  } catch (err) {
    sendError(res, err, "Failed to load sites");
  }
});

// Auditors who have audits the user can see (for the "All Auditors" filter).
router.get("/auditors", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const scope = scopeCondition(req.user);
    const [rows] = await pool.query(
      `SELECT DISTINCT u.id, u.name FROM audits a JOIN users u ON u.id = a.auditor_user_id
       WHERE a.status <> 'CANCELLED' AND ${scope.sql} ORDER BY u.name`,
      scope.params,
    );
    res.json({ items: rows.map((r) => ({ id: Number(r.id), name: r.name })) });
  } catch (err) {
    sendError(res, err, "Failed to load auditors");
  }
});

// ---- list + summary --------------------------------------------------------

const URGENT_FINDING = "f.risk_level IN ('HIGH','CRITICAL') AND f.action_due_date IS NOT NULL AND f.action_due_date <= CURDATE() + INTERVAL 7 DAY";

router.get("/summary", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const scope = scopeCondition(req.user);
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(a.status IN ('IN_PROGRESS','AMENDING')) AS in_progress,
              SUM(a.status = 'SUBMITTED') AS submitted,
              SUM(EXISTS (SELECT 1 FROM audit_reports r WHERE r.id = a.current_report_id AND r.status = 'GENERATED')) AS reports_ready,
              SUM(a.status IN ('IN_PROGRESS','AMENDING') AND a.audit_date = CURDATE()) AS due_today,
              SUM(a.status = 'SUBMITTED' AND a.submitted_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS done_this_month,
              SUM(a.status IN ('IN_PROGRESS','AMENDING') AND a.audit_date > CURDATE()) AS scheduled,
              SUM(a.status IN ('IN_PROGRESS','AMENDING') AND a.audit_date <= CURDATE()) AS in_progress_now
       FROM audits a WHERE a.status <> 'CANCELLED' AND ${scope.sql}`,
      scope.params,
    );
    // High / Critical findings whose fix date is within the next 7 days (or already passed).
    const [[u]] = await pool.query(
      `SELECT COUNT(*) AS n FROM audit_findings f JOIN audits a ON a.id = f.audit_id
       WHERE ${URGENT_FINDING} AND a.status <> 'CANCELLED' AND ${scope.sql}`,
      scope.params,
    );
    const [[f]] = await pool.query(
      `SELECT SUM(f.risk_level IN ('HIGH','CRITICAL')) AS high_risk, SUM(f.status = 'OPEN') AS open_findings
       FROM audit_findings f JOIN audits a ON a.id = f.audit_id
       WHERE a.status <> 'CANCELLED' AND ${scope.sql}`,
      scope.params,
    );
    res.json({
      total: Number(row.total || 0),
      inProgress: Number(row.in_progress || 0),
      submitted: Number(row.submitted || 0),
      reportsReady: Number(row.reports_ready || 0),
      highRiskFindings: Number(f.high_risk || 0),
      openFindings: Number(f.open_findings || 0),
      dueToday: Number(row.due_today || 0),
      doneThisMonth: Number(row.done_this_month || 0),
      // Not submitted yet, split by audit date: later than today = scheduled, today or earlier = in progress.
      scheduled: Number(row.scheduled || 0),
      inProgressNow: Number(row.in_progress_now || 0),
      urgentFindings: Number(u.n || 0),
    });
  } catch (err) {
    sendError(res, err, "Failed to load audit summary");
  }
});

router.get("/", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const scope = scopeCondition(req.user);
    const where = ["a.status <> 'CANCELLED'", scope.sql];
    const params = [...scope.params];

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) {
      where.push("(a.audit_number LIKE ? OR c.name LIKE ? OR c.display_name LIKE ? OR s.name LIKE ? OR s.address LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (req.query.status) {
      const statuses = String(req.query.status).split(",").map((s) => s.trim().toUpperCase())
        .filter((s) => ["IN_PROGRESS", "SUBMITTED", "AMENDING"].includes(s));
      if (statuses.length) { where.push(`a.status IN (${statuses.map(() => "?").join(",")})`); params.push(...statuses); }
    }
    if (req.query.companyId) { where.push("a.company_id = ?"); params.push(String(req.query.companyId)); }
    if (req.query.siteId) { where.push("a.site_id = ?"); params.push(String(req.query.siteId)); }
    if (req.query.auditorId) { where.push("a.auditor_user_id = ?"); params.push(Number(req.query.auditorId) || 0); }
    if (isRealDate(req.query.from)) { where.push("a.audit_date >= ?"); params.push(req.query.from); }
    if (isRealDate(req.query.to)) { where.push("a.audit_date <= ?"); params.push(req.query.to); }
    if (req.query.mine === "1") { where.push("a.auditor_user_id = ?"); params.push(req.user.id); }
    // Audits with a High / Critical finding due within 7 days (the app's alert strip).
    if (req.query.urgent === "1") where.push(`EXISTS (SELECT 1 FROM audit_findings f WHERE f.audit_id = a.id AND ${URGENT_FINDING})`);

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
    const from = `FROM audits a
      JOIN companies c ON c.id = a.company_id
      JOIN sites s ON s.id = a.site_id
      LEFT JOIN users u ON u.id = a.auditor_user_id
      WHERE ${where.join(" AND ")}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
    const [rows] = await pool.query(
      `SELECT a.id, a.audit_number, COALESCE(c.display_name, c.name) AS company_name, s.name AS site_name,
              CONCAT_WS(', ', NULLIF(s.address,''), NULLIF(s.city,'')) AS site_address,
              DATE_FORMAT(a.audit_date, '%Y-%m-%d') AS audit_date, u.name AS auditor_name,
              a.status, COALESCE(a.overall_risk_override, a.overall_risk) AS overall_risk,
              (SELECT COUNT(*) FROM audit_areas ar WHERE ar.audit_id = a.id) AS areas_total,
              (SELECT COUNT(*) FROM audit_areas ar WHERE ar.audit_id = a.id AND ar.status = 'COMPLETED') AS areas_completed,
              (SELECT MIN(ar.area_number) FROM audit_areas ar WHERE ar.audit_id = a.id AND ar.status <> 'COMPLETED') AS next_area_number,
              (SELECT COUNT(*) FROM audit_findings f WHERE f.audit_id = a.id) AS findings,
              (SELECT DATE_FORMAT(MAX(ar.saved_at), '%Y-%m-%dT%H:%i:%s') FROM audit_areas ar WHERE ar.audit_id = a.id) AS last_saved_at,
              r.id AS report_id, r.version AS report_version, r.status AS report_status
       ${from.replace("WHERE", "LEFT JOIN audit_reports r ON r.id = a.current_report_id WHERE")}
       ORDER BY a.audit_date DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id, auditNumber: r.audit_number, companyName: r.company_name, siteName: r.site_name,
        siteAddress: r.site_address, auditDate: r.audit_date, auditorName: r.auditor_name,
        areasCompleted: Number(r.areas_completed), areasTotal: Number(r.areas_total), findings: Number(r.findings),
        nextAreaNumber: r.next_area_number == null ? null : Number(r.next_area_number),
        overallRisk: r.overall_risk, status: r.status, lastSavedAt: r.last_saved_at,
        latestReport: r.report_id ? { id: r.report_id, version: r.report_version, status: r.report_status } : null,
      })),
      page, pageSize, total: Number(total),
    });
  } catch (err) {
    sendError(res, err, "Failed to load audits");
  }
});

// ---- start audit -----------------------------------------------------------

router.post("/", ...can(PERMISSIONS.CREATE_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = text(b.companyId, "customer", 20, true);
    const siteId = text(b.siteId, "site", 20, true);
    if (!isRealDate(b.auditDate)) throw new HttpError(400, "VALIDATION", "Enter a valid audit date (YYYY-MM-DD)");
    const auditType = parseAuditType(b.auditType);
    // The mobile form no longer asks for target pests, so an audit can start without them.
    const targetPests = b.targetPests === undefined || (Array.isArray(b.targetPests) && !b.targetPests.length)
      ? []
      : parseTargetPests(b.targetPests);
    // Optional: the column does not allow "no value", so a blank escort is saved as empty text.
    const escortName = text(b.escortName, "escort person", 150) || "";
    const escortDesignation = text(b.escortDesignation, "escort designation", 100);
    const escortContact = text(b.escortContact, "contact number", 20);
    const customerActionLabel = text(b.customerActionLabel, "customer action label", 40) || "Customer action";
    const siteNotes = text(b.siteNotes, "site notes", 5000);
    const areas = Array.isArray(b.areas) ? b.areas.map((a, i) => parseAreaInput(a, `areas[${i}]`)) : [];
    if (areas.length > 200) throw new HttpError(400, "VALIDATION", "Too many areas (max 200)");

    const [[company]] = await pool.query("SELECT id, is_active FROM companies WHERE id = ?", [companyId]);
    const [[site]] = await pool.query("SELECT id, company_id, branch_id, is_active FROM sites WHERE id = ?", [siteId]);
    if (!company || !site) throw new HttpError(404, "NOT_FOUND", "Customer or site not found");
    if (site.company_id !== companyId) throw new HttpError(400, "VALIDATION", "This site does not belong to the selected customer");
    if (company.is_active === 0 || site.is_active === 0) {
      throw new HttpError(422, "SITE_INACTIVE", "This customer or site is inactive");
    }
    // Scope check against the site (the auditor is the creator, so canAccess alone would always pass).
    const probe = { branch_id: site.branch_id, company_id: companyId, site_id: siteId, auditor_user_id: null };
    if (!canAccess(req.user, probe)) throw new HttpError(403, "OUT_OF_SCOPE", "This site is not in your area");

    const id = uuid();
    const year = Number(b.auditDate.slice(0, 4));
    const created = await inTx(async (conn) => {
      const auditNumber = await nextAuditNumber(conn, year);
      await conn.query(
        `INSERT INTO audits (id, audit_number, company_id, site_id, branch_id, audit_date, audit_type, target_pests,
           auditor_user_id, escort_name, escort_designation, escort_contact, customer_action_label, site_notes,
           report_options, status, started_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', NOW(), ?, ?)`,
        [id, auditNumber, companyId, siteId, site.branch_id, b.auditDate, auditType, JSON.stringify(targetPests),
          req.user.id, escortName, escortDesignation, escortContact, customerActionLabel, siteNotes,
          JSON.stringify({ riskChain: true, riskByZone: true, priority: true, ipmCycle: true }),
          req.user.id, req.user.id],
      );
      let n = 0;
      for (const a of areas) {
        n = a.areaNumber || n + 1;
        await conn.query(
          `INSERT INTO audit_areas (id, audit_id, area_number, area_name, zone_name, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [a.id, id, n, a.areaName, a.zoneName, a.notes, req.user.id, req.user.id],
        );
      }
      await logHistory(conn, {
        auditId: id, userId: req.user.id, entityType: "AUDIT", entityId: id, action: "CREATED",
        message: `Audit ${auditNumber} started`,
      });
      const [[row]] = await conn.query(
        "SELECT audit_number, DATE_FORMAT(started_at, '%Y-%m-%dT%H:%i:%s') AS started_at, row_version FROM audits WHERE id = ?",
        [id],
      );
      return row;
    });

    const [[me]] = await pool.query("SELECT name FROM users WHERE id = ?", [req.user.id]);
    res.status(201).json({
      id,
      auditNumber: created.audit_number,
      status: "IN_PROGRESS",
      auditor: { id: Number(req.user.id), name: me?.name || null },
      startedAt: created.started_at,
      rowVersion: created.row_version,
    });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An area id or number is already used", code: "VALIDATION" });
    }
    sendError(res, err, "Failed to start audit");
  }
});

// ---- get one (resume) ------------------------------------------------------

router.get("/:id", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    res.json(await loadAuditTree(pool, audit));
  } catch (err) {
    sendError(res, err, "Failed to load audit");
  }
});

// ---- edit header -----------------------------------------------------------

router.patch("/:id", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    const result = await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      if (Number(b.rowVersion) !== audit.row_version) {
        throw new HttpError(409, "VERSION_CONFLICT", "Someone else changed this audit. Reload and try again.", {
          server: await loadAuditTree(conn, audit),
        });
      }

      const sets = [];
      const params = [];
      const changed = {};
      const put = (col, val, key) => { sets.push(`${col} = ?`); params.push(val); changed[key] = val; };

      if (b.auditDate !== undefined) {
        if (!isRealDate(b.auditDate)) throw new HttpError(400, "VALIDATION", "Enter a valid audit date (YYYY-MM-DD)");
        put("audit_date", b.auditDate, "auditDate");
      }
      if (b.auditType !== undefined) put("audit_type", parseAuditType(b.auditType), "auditType");
      if (b.targetPests !== undefined) put("target_pests", JSON.stringify(parseTargetPests(b.targetPests)), "targetPests");
      if (b.escortName !== undefined) put("escort_name", text(b.escortName, "escort person", 150) || "", "escortName");
      if (b.escortDesignation !== undefined) put("escort_designation", text(b.escortDesignation, "escort designation", 100), "escortDesignation");
      if (b.escortContact !== undefined) put("escort_contact", text(b.escortContact, "contact number", 20), "escortContact");
      if (b.customerActionLabel !== undefined) {
        put("customer_action_label", text(b.customerActionLabel, "customer action label", 40) || "Customer action", "customerActionLabel");
      }
      if (b.siteNotes !== undefined) put("site_notes", text(b.siteNotes, "site notes", 5000), "siteNotes");
      if (b.reportOptions !== undefined) put("report_options", JSON.stringify(parseReportOptions(b.reportOptions)), "reportOptions");

      if (b.overallRiskOverride !== undefined) {
        if (!hasPerm(req, PERMISSIONS.OVERRIDE_AUDIT_RISK)) {
          throw new HttpError(403, "FORBIDDEN", "You cannot override the overall risk");
        }
        if (b.overallRiskOverride === null) {
          put("overall_risk_override", null, "overallRiskOverride");
          put("override_reason", null, "overrideReason");
          put("override_by", null, "overrideBy");
        } else {
          const level = String(b.overallRiskOverride).toUpperCase();
          const levels = (await loadRiskLevels(conn)).map((l) => l.code);
          if (!levels.includes(level)) throw new HttpError(400, "VALIDATION", "Unknown risk level");
          put("overall_risk_override", level, "overallRiskOverride");
          put("override_reason", text(b.overrideReason, "override reason", 500, true), "overrideReason");
          put("override_by", req.user.id, "overrideBy");
        }
      }

      if (!sets.length) throw new HttpError(400, "VALIDATION", "Nothing to update");
      await noteHandover(conn, req, audit);
      await conn.query(`UPDATE audits SET ${sets.join(", ")} WHERE id = ?`, [...params, audit.id]);
      if (changed.auditDate) {
        await conn.query(
          `UPDATE audit_findings SET action_due_date = IF(action_within_days IS NULL, NULL, DATE_ADD(?, INTERVAL action_within_days DAY))
           WHERE audit_id = ?`,
          [changed.auditDate, audit.id],
        );
      }
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "AUDIT", entityId: audit.id, action: "UPDATED",
        message: "Audit details updated", newValue: changed,
      });
      const [[fresh]] = await conn.query("SELECT row_version FROM audits WHERE id = ?", [audit.id]);
      return fresh;
    });
    res.json({ id: req.params.id, rowVersion: result.row_version });
  } catch (err) {
    sendError(res, err, "Failed to update audit");
  }
});

// ---- areas -----------------------------------------------------------------

router.post("/:id/areas", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const list = Array.isArray(req.body?.areas) ? req.body.areas : [];
    if (!list.length) throw new HttpError(400, "VALIDATION", "Send at least one area");
    const areas = list.map((a, i) => parseAreaInput(a, `areas[${i}]`));

    const out = await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      await noteHandover(conn, req, audit);
      const [[{ maxNo }]] = await conn.query("SELECT COALESCE(MAX(area_number), 0) AS maxNo FROM audit_areas WHERE audit_id = ?", [audit.id]);
      let n = maxNo;
      const result = [];
      for (const a of areas) {
        const [[existing]] = await conn.query("SELECT id, audit_id, status, row_version FROM audit_areas WHERE id = ?", [a.id]);
        if (existing) {
          if (existing.audit_id !== audit.id) throw new HttpError(409, "VALIDATION", "This area id belongs to another audit");
          result.push({ id: existing.id, status: existing.status, rowVersion: existing.row_version });
          continue; // retry of an earlier add: same result, no duplicate
        }
        const areaNumber = a.areaNumber || ++n;
        if (a.areaNumber) n = Math.max(n, a.areaNumber);
        await conn.query(
          `INSERT INTO audit_areas (id, audit_id, area_number, area_name, zone_name, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [a.id, audit.id, areaNumber, a.areaName, a.zoneName, a.notes, req.user.id, req.user.id],
        );
        await logHistory(conn, {
          auditId: audit.id, userId: req.user.id, entityType: "AREA", entityId: a.id, action: "CREATED",
          message: `Area ${areaNumber} added: ${a.areaName}`,
        });
        result.push({ id: a.id, areaNumber, status: "NOT_STARTED", rowVersion: 1 });
      }
      await touchAudit(conn, audit.id, req.user.id);
      return result;
    });
    res.status(201).json({ areas: out });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That area number is already used in this audit", code: "VALIDATION" });
    }
    sendError(res, err, "Failed to add areas");
  }
});

// Saves one area and all its findings in one transaction (upsert by device ids).
router.put("/:id/areas/:areaId", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    if (!isUuid(req.params.areaId)) throw new HttpError(404, "NOT_FOUND", "Area not found");
    const area = parseAreaInput({ ...b, id: req.params.areaId });
    const findingsIn = Array.isArray(b.findings) ? b.findings : [];
    if (findingsIn.length > 50) throw new HttpError(400, "VALIDATION", "Too many findings in one area (max 50)");
    const removedIds = Array.isArray(b.removedFindingIds) ? b.removedFindingIds.filter(isUuid) : [];
    const markCompleted = b.markCompleted === true;

    const out = await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      const levels = await loadRiskLevels(conn);
      const levelMap = Object.fromEntries(levels.map((l) => [l.code, l]));
      const categories = RISK_CATEGORIES.map((c) => c.code);

      const [[existing]] = await conn.query(`${AREA_SELECT} WHERE id = ? FOR UPDATE`, [area.id]);
      if (existing && existing.audit_id !== audit.id) throw new HttpError(404, "NOT_FOUND", "Area not found");
      if (existing && Number(b.rowVersion) !== existing.row_version) {
        const [fs] = await conn.query(`${FINDING_SELECT} WHERE area_id = ? ORDER BY finding_number`, [area.id]);
        const [[by]] = await conn.query(
          "SELECT u.name FROM audit_history h JOIN users u ON u.id = h.created_by WHERE h.entity_id = ? ORDER BY h.created_at DESC LIMIT 1",
          [area.id],
        );
        throw new HttpError(409, "VERSION_CONFLICT", "This area was changed by someone else. Reload it and try again.", {
          server: shapeArea(existing, fs.map((f) => shapeFinding(f))),
          lastSavedBy: by?.name || null,
        });
      }

      await noteHandover(conn, req, audit);

      // Area row
      if (existing) {
        await conn.query(
          `UPDATE audit_areas SET area_number = COALESCE(?, area_number), area_name = ?, zone_name = ?, notes = ?,
             row_version = row_version + 1, updated_by = ? WHERE id = ?`,
          [area.areaNumber, area.areaName, area.zoneName, area.notes, req.user.id, area.id],
        );
      } else {
        const [[{ maxNo }]] = await conn.query("SELECT COALESCE(MAX(area_number), 0) AS maxNo FROM audit_areas WHERE audit_id = ?", [audit.id]);
        await conn.query(
          `INSERT INTO audit_areas (id, audit_id, area_number, area_name, zone_name, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [area.id, audit.id, area.areaNumber || maxNo + 1, area.areaName, area.zoneName, area.notes, req.user.id, req.user.id],
        );
      }

      // Removed findings: only when they hold no evidence (photos / voice are never deleted).
      for (const fid of removedIds) {
        const [[f]] = await conn.query("SELECT id, area_id, title FROM audit_findings WHERE id = ? FOR UPDATE", [fid]);
        if (!f || f.area_id !== area.id) continue;
        const [[ev]] = await conn.query(
          `SELECT (SELECT COUNT(*) FROM audit_finding_photos WHERE finding_id = ?) +
                  (SELECT COUNT(*) FROM audit_voice_notes WHERE finding_id = ?) AS n`,
          [fid, fid],
        );
        if (ev.n > 0) throw new HttpError(409, "VALIDATION", `Finding "${f.title}" has photos or voice notes and cannot be removed`);
        await conn.query("DELETE FROM audit_findings WHERE id = ?", [fid]);
        await logHistory(conn, {
          auditId: audit.id, userId: req.user.id, entityType: "FINDING", entityId: fid, action: "DELETED",
          message: `Finding removed: ${f.title}`,
        });
      }

      // Upsert findings
      const savedIds = [];
      for (let i = 0; i < findingsIn.length; i++) {
        const fIn = findingsIn[i] || {};
        const label = `findings[${i}]`;
        if (!isUuid(fIn.id)) throw new HttpError(400, "VALIDATION", `${label}.id must be a UUID made on the device`);
        const riskLevel = String(fIn.riskLevel || "").toUpperCase();
        if (!levelMap[riskLevel]) throw new HttpError(400, "VALIDATION", `${label}: choose a risk level`);
        // A known category is stored as its code; an "Other" category as the text typed for it.
        const rawCategory = String(fIn.riskCategory || "").trim();
        const riskCategory = categories.includes(rawCategory.toUpperCase()) ? rawCategory.toUpperCase() : rawCategory;
        if (!categories.includes(riskCategory) && !CUSTOM_TEXT_RE.test(riskCategory)) {
          throw new HttpError(400, "VALIDATION", `${label}: choose a risk category, or describe it under Other`);
        }
        let days = levelMap[riskLevel].default_days;
        if (fIn.actionWithinDays !== undefined && fIn.actionWithinDays !== null && fIn.actionWithinDays !== "") {
          days = Number(fIn.actionWithinDays);
          if (!Number.isInteger(days) || days < 0 || days > 365) throw new HttpError(400, "VALIDATION", `${label}: action days must be 0-365`);
        } else if (fIn.actionWithinDays === null) {
          days = null;
        }
        const values = {
          // Optional: when left blank, the risk category ("Burrows", or the typed one) is used as the title.
          title: text(fIn.title, "finding title", 250)
            || RISK_CATEGORIES.find((c) => c.code === riskCategory)?.label
            || riskCategory,
          risk_category: riskCategory,
          risk_type_text: text(fIn.riskTypeText, "risk type", 250),
          risk_level: riskLevel,
          action_within_days: days,
          observation_text: text(fIn.observationText, "observation", 10000),
          customer_action_text: text(fIn.customerActionText, "customer action", 10000),
          bestserve_action_text: text(fIn.bestserveActionText, "BestServe action", 10000),
          no_photo_reason: text(fIn.noPhotoReason, "no-photo reason", 500),
        };

        const [[old]] = await conn.query(`${FINDING_SELECT} WHERE id = ? FOR UPDATE`, [fIn.id]);
        if (old) {
          if (old.audit_id !== audit.id) throw new HttpError(409, "VALIDATION", `${label}.id belongs to another audit`);
          if (Number(fIn.rowVersion) !== old.row_version) {
            throw new HttpError(409, "VERSION_CONFLICT", `Finding "${old.title}" was changed by someone else. Reload and try again.`, {
              server: shapeFinding(old),
            });
          }
          await conn.query(
            `UPDATE audit_findings SET area_id = ?, title = ?, risk_category = ?, risk_type_text = ?, risk_level = ?,
               action_within_days = ?, action_due_date = IF(? IS NULL, NULL, DATE_ADD(?, INTERVAL ? DAY)),
               observation_text = ?, customer_action_text = ?, bestserve_action_text = ?, no_photo_reason = ?,
               row_version = row_version + 1, updated_by = ? WHERE id = ?`,
            [area.id, values.title, values.risk_category, values.risk_type_text, values.risk_level,
              days, days, audit.audit_date, days,
              values.observation_text, values.customer_action_text, values.bestserve_action_text, values.no_photo_reason,
              req.user.id, fIn.id],
          );
          const diff = {};
          const before = {};
          for (const [k, v] of Object.entries(values)) {
            if ((old[k] ?? null) !== (v ?? null)) { diff[k] = v; before[k] = old[k]; }
          }
          if (Object.keys(diff).length) {
            await logHistory(conn, {
              auditId: audit.id, userId: req.user.id, entityType: "FINDING", entityId: fIn.id, action: "UPDATED",
              message: `Finding updated: ${values.title}`, oldValue: before, newValue: diff,
            });
          }
        } else {
          // Temporary negative number; renumberFindings sets the real one below.
          await conn.query(
            `INSERT INTO audit_findings (id, audit_id, area_id, finding_number, title, risk_category, risk_type_text, risk_level,
               action_within_days, action_due_date, observation_text, customer_action_text, bestserve_action_text,
               no_photo_reason, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, DATE_ADD(?, INTERVAL ? DAY)), ?, ?, ?, ?, ?, ?)`,
            [fIn.id, audit.id, area.id, -100000 - i, values.title, values.risk_category, values.risk_type_text, values.risk_level,
              days, days, audit.audit_date, days,
              values.observation_text, values.customer_action_text, values.bestserve_action_text, values.no_photo_reason,
              req.user.id, req.user.id],
          );
          await logHistory(conn, {
            auditId: audit.id, userId: req.user.id, entityType: "FINDING", entityId: fIn.id, action: "CREATED",
            message: `Finding added: ${values.title} (${riskLevel})`,
          });
        }
        savedIds.push(fIn.id);
      }

      await renumberFindings(conn, audit.id);
      await recomputeOverallRisk(conn, audit.id);

      // Area status from what is now stored
      const [stored] = await conn.query(`${FINDING_SELECT} WHERE area_id = ? ORDER BY finding_number`, [area.id]);
      const [photoCounts] = await conn.query(
        "SELECT finding_id, COUNT(*) AS n FROM audit_finding_photos WHERE audit_id = ? AND is_deleted = 0 GROUP BY finding_id",
        [audit.id],
      );
      const photoBy = Object.fromEntries(photoCounts.map((r) => [r.finding_id, Number(r.n)]));
      const missing = [];
      if (!stored.length) missing.push("findings");
      stored.forEach((f) => {
        const idx = findingsIn.findIndex((x) => x.id === f.id);
        const prefix = idx >= 0 ? `findings[${idx}]` : `finding ${f.finding_number}`;
        findingMissing(f, photoBy[f.id] || 0).forEach((m) => missing.push(`${prefix}.${m}`));
      });
      const status = markCompleted && !missing.length ? "COMPLETED" : stored.length || markCompleted ? "IN_PROGRESS" : "NOT_STARTED";
      await conn.query("UPDATE audit_areas SET status = ?, saved_at = NOW() WHERE id = ?", [status, area.id]);
      // The area's target pests (picked on the phone) are added to the audit's list for the report cover.
      if (Array.isArray(b.targetPests) && b.targetPests.length) {
        const current = typeof audit.target_pests === "string" ? JSON.parse(audit.target_pests || "[]") : audit.target_pests || [];
        const merged = [...new Set([...current, ...parseTargetPests(b.targetPests)])].slice(0, 10);
        if (merged.length !== current.length) {
          await conn.query("UPDATE audits SET target_pests = ? WHERE id = ?", [JSON.stringify(merged), audit.id]);
        }
      }
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "AREA", entityId: area.id, action: existing ? "UPDATED" : "CREATED",
        message: `Area saved: ${area.areaName} (${status.toLowerCase().replace("_", " ")})`,
      });

      const [[savedArea]] = await conn.query(`${AREA_SELECT} WHERE id = ?`, [area.id]);
      return {
        area: { id: savedArea.id, areaNumber: savedArea.area_number, status: savedArea.status, rowVersion: savedArea.row_version, savedAt: savedArea.saved_at },
        findings: stored.map((f) => ({ id: f.id, findingNumber: f.finding_number, actionDueDate: f.action_due_date, rowVersion: f.row_version })),
        missing: markCompleted ? missing : [],
      };
    });
    res.json(out);
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That area number or id is already used in this audit", code: "VALIDATION" });
    }
    sendError(res, err, "Failed to save area");
  }
});

router.delete("/:id/areas/:areaId", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      const [[area]] = await conn.query("SELECT id, audit_id, area_name, status FROM audit_areas WHERE id = ? FOR UPDATE", [req.params.areaId]);
      if (!area || area.audit_id !== audit.id) throw new HttpError(404, "NOT_FOUND", "Area not found");
      const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM audit_findings WHERE area_id = ?", [area.id]);
      if (area.status !== "NOT_STARTED" || n > 0) {
        throw new HttpError(409, "VALIDATION", "Only an empty, not-started area can be removed");
      }
      await conn.query("DELETE FROM audit_areas WHERE id = ?", [area.id]);
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "AREA", entityId: area.id, action: "DELETED",
        message: `Area removed: ${area.area_name}`,
      });
    });
    res.status(204).end();
  } catch (err) {
    sendError(res, err, "Failed to remove area");
  }
});

// ---- sign-off --------------------------------------------------------------

router.put("/:id/signoff", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    const receivedByName = text(b.receivedByName, "received-by name", 150, true);
    const receivedByDesignation = text(b.receivedByDesignation, "designation", 100);
    const remarks = text(b.remarks, "remarks", 500);
    let receivedAt = null;
    if (b.receivedAt) {
      const d = new Date(b.receivedAt);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, "VALIDATION", "Invalid receivedAt");
      receivedAt = d;
    }
    if (b.nextAuditDate != null && b.nextAuditDate !== "" && !isRealDate(b.nextAuditDate)) {
      throw new HttpError(400, "VALIDATION", "Enter a valid next audit date (YYYY-MM-DD)");
    }
    const nextAuditDate = b.nextAuditDate || null;
    if (b.coverPhotoId != null && !isUuid(b.coverPhotoId)) throw new HttpError(400, "VALIDATION", "Invalid cover photo");
    const reportOptions = b.reportOptions !== undefined ? parseReportOptions(b.reportOptions) : undefined;

    await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      if (nextAuditDate && nextAuditDate < audit.audit_date) {
        const shown = new Date(`${String(audit.audit_date).slice(0, 10)}T00:00:00Z`)
          .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
        throw new HttpError(400, "VALIDATION", `Next audit date must be on or after this audit's date (${shown})`);
      }
      if (b.coverPhotoId) {
        const [[p]] = await conn.query("SELECT id FROM audit_finding_photos WHERE id = ? AND audit_id = ? AND is_deleted = 0", [b.coverPhotoId, audit.id]);
        if (!p) throw new HttpError(400, "VALIDATION", "Cover photo not found in this audit");
      }
      await noteHandover(conn, req, audit);
      await conn.query(
        `INSERT INTO audit_signoffs (audit_id, received_by_name, received_by_designation, received_at, next_audit_date, remarks, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE received_by_name = VALUES(received_by_name),
           received_by_designation = VALUES(received_by_designation), received_at = VALUES(received_at),
           next_audit_date = VALUES(next_audit_date), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by)`,
        [audit.id, receivedByName, receivedByDesignation, receivedAt, nextAuditDate, remarks, req.user.id],
      );
      if (b.coverPhotoId !== undefined) await conn.query("UPDATE audits SET cover_photo_id = ? WHERE id = ?", [b.coverPhotoId || null, audit.id]);
      if (reportOptions !== undefined) await conn.query("UPDATE audits SET report_options = ? WHERE id = ?", [JSON.stringify(reportOptions), audit.id]);
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "SIGNOFF", entityId: audit.id, action: "UPDATED",
        message: `Sign-off: received by ${receivedByName}`,
      });
    });
    const audit = await loadAudit(pool, req, req.params.id);
    const tree = await loadAuditTree(pool, audit);
    res.json({ signoff: tree.signoff, coverPhotoId: tree.coverPhotoId, reportOptions: tree.reportOptions, rowVersion: tree.rowVersion });
  } catch (err) {
    sendError(res, err, "Failed to save sign-off");
  }
});

// ---- readiness + submit ----------------------------------------------------

router.get("/:id/readiness", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    res.json(await computeReadiness(pool, audit, { excludeNotStartedAreas: req.query.excludeNotStartedAreas === "1" }));
  } catch (err) {
    sendError(res, err, "Failed to check readiness");
  }
});

/**
 * "Next audit date" at sign-off: on submit, a new audit for the same customer and site is made on that
 * date, so it shows under Scheduled. A re-submit (amend) finds the one made before and only moves its
 * date while nothing has been entered in it yet; it never makes a second one.
 */
async function scheduleNextAudit(conn, audit, userId) {
  const [[so]] = await conn.query(
    "SELECT DATE_FORMAT(next_audit_date, '%Y-%m-%d') AS d FROM audit_signoffs WHERE audit_id = ?",
    [audit.id],
  );
  const nextDate = so?.d;
  if (!nextDate) return;
  const marker = `Scheduled from audit ${audit.audit_number}`;
  const [[prev]] = await conn.query(
    `SELECT a.id, a.status, DATE_FORMAT(a.audit_date, '%Y-%m-%d') AS d,
            (SELECT COUNT(*) FROM audit_areas ar WHERE ar.audit_id = a.id) AS areas
       FROM audits a JOIN audit_history h ON h.audit_id = a.id AND h.action = 'CREATED' AND h.message = ?
      WHERE a.status <> 'CANCELLED' LIMIT 1`,
    [marker],
  );
  if (prev) {
    if (prev.status === "IN_PROGRESS" && Number(prev.areas) === 0 && prev.d !== nextDate) {
      await conn.query("UPDATE audits SET audit_date = ?, updated_by = ? WHERE id = ?", [nextDate, userId, prev.id]);
    }
    return;
  }
  const id = uuid();
  const auditNumber = await nextAuditNumber(conn, Number(nextDate.slice(0, 4)));
  await conn.query(
    `INSERT INTO audits (id, audit_number, company_id, site_id, branch_id, audit_date, audit_type, target_pests,
       auditor_user_id, escort_name, escort_designation, escort_contact, customer_action_label,
       report_options, status, started_at, created_by, updated_by)
     SELECT ?, ?, company_id, site_id, branch_id, ?, audit_type, target_pests,
       auditor_user_id, escort_name, escort_designation, escort_contact, customer_action_label,
       ?, 'IN_PROGRESS', NOW(), ?, ?
       FROM audits WHERE id = ?`,
    [id, auditNumber, nextDate, JSON.stringify({ riskChain: true, riskByZone: true, priority: true, ipmCycle: true }),
      userId, userId, audit.id],
  );
  await logHistory(conn, { auditId: id, userId, entityType: "AUDIT", entityId: id, action: "CREATED", message: marker });
}

router.post("/:id/submit", ...can(PERMISSIONS.SUBMIT_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    const out = await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      if (Number(b.rowVersion) !== audit.row_version) {
        throw new HttpError(409, "VERSION_CONFLICT", "This audit changed since you opened it. Reload and check before submitting.", {
          server: await loadAuditTree(conn, audit),
        });
      }
      const readiness = await computeReadiness(conn, audit, { excludeNotStartedAreas: b.excludeNotStartedAreas === true });
      if (!readiness.ready) {
        throw new HttpError(422, "NOT_READY", "This audit is not ready to submit", { blockers: readiness.blockers });
      }
      const wasAmending = audit.status === "AMENDING";
      await conn.query(
        "UPDATE audits SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = ? WHERE id = ?",
        [req.user.id, audit.id],
      );
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "AUDIT", entityId: audit.id, action: "SUBMITTED",
        message: wasAmending ? "Amended audit re-submitted" : `Audit ${audit.audit_number} submitted`,
      });
      await scheduleNextAudit(conn, audit, req.user.id);
      const [[row]] = await conn.query("SELECT DATE_FORMAT(submitted_at, '%Y-%m-%dT%H:%i:%s') AS submitted_at FROM audits WHERE id = ?", [audit.id]);
      const report = await queueReport(conn, audit.id, req.user.id, wasAmending ? "Amended audit re-submitted" : null);
      return { ...row, report };
    });
    // The PDF is drawn in the background (a few seconds); the app polls GET /:id/reports.
    generateNow(out.report.id);
    res.status(202).json({
      status: "SUBMITTED",
      submittedAt: out.submitted_at,
      report: { id: out.report.id, version: out.report.version, status: "QUEUED" },
    });
  } catch (err) {
    sendError(res, err, "Failed to submit audit");
  }
});

// ---- reports (Phase 3) ------------------------------------------------------

function shapeReport(auditId, r) {
  return {
    id: r.id, version: r.version, status: r.status, pageCount: r.page_count, sizeBytes: r.size_bytes,
    generatedAt: r.generated_at, reason: r.reason, error: r.status === "FAILED" ? r.error_message : null,
    fileUrl: r.status === "GENERATED" ? `/api/audits/${auditId}/reports/${r.id}/file` : null,
  };
}

router.get("/:id/reports", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    const [rows] = await pool.query(
      `SELECT id, version, status, page_count, size_bytes, reason, error_message,
              DATE_FORMAT(generated_at, '%Y-%m-%dT%H:%i:%s') AS generated_at
       FROM audit_reports WHERE audit_id = ? ORDER BY version DESC`,
      [audit.id],
    );
    res.json({ items: rows.map((r) => shapeReport(audit.id, r)) });
  } catch (err) {
    sendError(res, err, "Failed to load reports");
  }
});

// The PDF itself. ?download=1 makes the browser save it instead of showing it.
router.get("/:id/reports/:reportId/file", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    if (!isUuid(req.params.reportId)) throw new HttpError(404, "NOT_FOUND", "Report not found");
    const [[r]] = await pool.query(
      "SELECT id, version, status, object_key, size_bytes FROM audit_reports WHERE id = ? AND audit_id = ?",
      [req.params.reportId, audit.id],
    );
    if (!r) throw new HttpError(404, "NOT_FOUND", "Report not found");
    if (r.status !== "GENERATED" || !r.object_key) throw new HttpError(409, "REPORT_NOT_READY", "The report is still being made");
    const name = await reportFileName(audit, { version: r.version });
    res.setHeader("Content-Type", "application/pdf");
    if (r.size_bytes) res.setHeader("Content-Length", r.size_bytes);
    res.setHeader("Content-Disposition", pdfDisposition(req.query.download ? "attachment" : "inline", name));
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, r.object_key);
    stream.on("error", () => res.destroy());
    return stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to load the report");
  }
});

// PDF file name: "<Customer>-AuditReport-<year>.pdf" (+ "-v2" for later versions, "-draft" for previews).
async function reportFileName(audit, { version = 1, draft = false } = {}) {
  const [[c]] = await pool.query("SELECT name FROM companies WHERE id = ?", [audit.company_id]);
  const customer = String(c?.name || "Audit").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Audit";
  const year = String(audit.audit_date || "").slice(0, 4) || String(new Date().getFullYear());
  return `${customer}-AuditReport-${year}${version > 1 ? `-v${version}` : ""}${draft ? "-draft" : ""}.pdf`;
}

// Content-Disposition with a plain-ASCII fallback and the full (UTF-8) name.
function pdfDisposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Draft preview of the report from the audit as it is now (not stored). Works before submitting.
router.get("/:id/report-preview", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    const { buffer } = await renderPreview(audit.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", pdfDisposition("inline", await reportFileName(audit, { draft: true })));
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err) {
    sendError(res, err, "Failed to make the report preview");
  }
});

// Try a failed report again (same version).
router.post("/:id/reports/:reportId/retry", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    if (!isUuid(req.params.reportId)) throw new HttpError(404, "NOT_FOUND", "Report not found");
    const [upd] = await pool.query(
      "UPDATE audit_reports SET status = 'QUEUED', attempts = 0, error_message = NULL WHERE id = ? AND audit_id = ? AND status = 'FAILED'",
      [req.params.reportId, audit.id],
    );
    if (!upd.affectedRows) throw new HttpError(409, "NOT_FAILED", "Only a failed report can be retried");
    generateNow(req.params.reportId);
    res.status(202).json({ id: req.params.reportId, status: "QUEUED" });
  } catch (err) {
    sendError(res, err, "Failed to retry the report");
  }
});

// ---- photos + voice (Phase 2) ---------------------------------------------
// Files go phone -> backend (multer) -> MinIO, like work-task attachments. The
// device makes each file's id, so a retried upload returns the existing row.

const PHOTO_TYPES = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const AUDIO_TYPES = {
  "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mp4": "m4a", "audio/aac": "aac",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/ogg": "ogg", "audio/webm": "webm",
};
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const FIELD_COLUMN = {
  OBSERVATION: "observation_text",
  CUSTOMER_ACTION: "customer_action_text",
  BESTSERVE_ACTION: "bestserve_action_text",
};

const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });
function receiveFile(req, res, next) {
  fileUpload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "The file is too large", code: "FILE_TOO_LARGE" });
    return res.status(400).json({ error: "Could not read the uploaded file", code: "VALIDATION" });
  });
}

function shapePhoto(auditId, p) {
  return {
    id: p.id, kind: "PHOTO", findingId: p.finding_id, url: `/api/audits/${auditId}/files/${p.id}`,
    caption: p.caption, width: p.width, height: p.height, displayOrder: p.display_order,
    includeInReport: !!p.include_in_report, crop: p.crop || null,
    // Marked = drawn on by the supervisor; v changes with every save so the app reloads the picture.
    marked: isMarked(p.object_key), v: markVersion(p.object_key),
  };
}

function shapeVoice(auditId, v) {
  // "All in one" note: the draft holds the three parts; englishDraft stays the observation.
  const combined = isCombinedVoice(v.object_key);
  let parts = null;
  if (combined && v.english_draft) {
    try { parts = JSON.parse(v.english_draft); } catch { parts = null; }
  }
  return {
    id: v.id, kind: "VOICE", findingId: v.finding_id, fieldType: v.field_type, status: v.status,
    sourceLanguage: v.source_language, detectedLanguage: v.detected_language,
    combined, parts,
    transcript: v.transcript, englishDraft: parts ? parts.observation || "" : v.english_draft, acceptedText: v.accepted_text,
    durationSeconds: v.duration_seconds, attempts: v.attempts, error: v.error_message,
    isCurrent: !!v.is_current, audioUrl: `/api/audits/${auditId}/files/${v.id}`,
  };
}

router.post("/:id/files", ...can(PERMISSIONS.UPDATE_AUDIT), receiveFile, async (req, res) => {
  try {
    const b = req.body || {};
    const kind = String(b.kind || "").toUpperCase();
    if (!["PHOTO", "VOICE"].includes(kind)) throw new HttpError(400, "VALIDATION", "kind must be PHOTO or VOICE");
    if (!isUuid(b.fileId)) throw new HttpError(400, "VALIDATION", "fileId must be a UUID made on the device");
    if (!isUuid(b.findingId)) throw new HttpError(400, "VALIDATION", "findingId is required");
    if (!req.file?.buffer?.length) throw new HttpError(400, "VALIDATION", "No file was received");

    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const [[finding]] = await pool.query("SELECT id, audit_id, area_id, finding_number FROM audit_findings WHERE id = ?", [b.findingId]);
    if (!finding || finding.audit_id !== audit.id) {
      throw new HttpError(404, "NOT_FOUND", "Finding not found in this audit. Save the area first.");
    }

    // Retry of an upload that already succeeded: same answer, no duplicate.
    const table = kind === "PHOTO" ? "audit_finding_photos" : "audit_voice_notes";
    const [[existing]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [b.fileId]);
    if (existing) {
      if (existing.audit_id !== audit.id) throw new HttpError(409, "VALIDATION", "This file id belongs to another audit");
      return res.json(kind === "PHOTO" ? shapePhoto(audit.id, existing) : shapeVoice(audit.id, existing));
    }

    const mime = String(req.file.mimetype || "").toLowerCase();
    const base = `audits/${audit.id}/${finding.area_id}/${finding.id}`;

    if (kind === "PHOTO") {
      const ext = PHOTO_TYPES[mime];
      if (!ext) throw new HttpError(415, "FILE_TYPE", "Photos must be JPEG, PNG or WebP");
      if (req.file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "Photos can be up to 15 MB");
      let width = null;
      let height = null;
      try {
        const meta = await sharp(req.file.buffer).metadata();
        const turned = meta.orientation >= 5; // EXIF 5-8 = rotated 90 degrees
        width = (turned ? meta.height : meta.width) || null;
        height = (turned ? meta.width : meta.height) || null;
      } catch {
        throw new HttpError(415, "FILE_TYPE", "This image could not be read");
      }
      let capturedAt = null;
      if (b.capturedAt) {
        const d = new Date(b.capturedAt);
        if (!Number.isNaN(d.getTime())) capturedAt = d;
      }
      const lat = b.latitude !== undefined && b.latitude !== "" ? Number(b.latitude) : null;
      const lng = b.longitude !== undefined && b.longitude !== "" ? Number(b.longitude) : null;
      const okLat = lat !== null && Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null;
      const okLng = lng !== null && Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null;

      const objectKey = `${base}/photo/${b.fileId}.${ext}`;
      await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, { "Content-Type": mime });
      const [[{ nextOrder }]] = await pool.query(
        "SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM audit_finding_photos WHERE finding_id = ? AND is_deleted = 0",
        [finding.id],
      );
      try {
        await pool.query(
          `INSERT INTO audit_finding_photos (id, audit_id, finding_id, object_key, file_name, mime_type, size_bytes,
             width, height, caption, display_order, latitude, longitude, captured_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.fileId, audit.id, finding.id, objectKey, (req.file.originalname || "").slice(0, 255) || null, mime,
            req.file.size, width, height, text(b.caption, "caption", 500), nextOrder, okLat, okLng, capturedAt, req.user.id],
        );
      } catch (err) {
        if (err?.code !== "ER_DUP_ENTRY") throw err;
      }
      await touchAudit(pool, audit.id, req.user.id);
      await logHistory(pool, {
        auditId: audit.id, userId: req.user.id, entityType: "PHOTO", entityId: b.fileId, action: "CREATED",
        message: `Photo added to finding ${String(finding.finding_number).padStart(2, "0")}`,
      });
      const [[row]] = await pool.query("SELECT * FROM audit_finding_photos WHERE id = ?", [b.fileId]);
      return res.status(201).json(shapePhoto(audit.id, row));
    }

    // VOICE
    const ext = AUDIO_TYPES[mime];
    if (!ext) throw new HttpError(415, "FILE_TYPE", "Unsupported audio format");
    const fieldType = String(b.fieldType || "").toUpperCase();
    if (!FIELD_COLUMN[fieldType]) throw new HttpError(400, "VALIDATION", "fieldType must be OBSERVATION, CUSTOMER_ACTION or BESTSERVE_ACTION");
    const sourceLanguage = LANGUAGES.includes(String(b.sourceLanguage || "auto")) ? String(b.sourceLanguage || "auto") : "auto";
    const duration = Number.parseInt(b.durationSeconds, 10);

    // combined=1: one recording for observation + customer action + BestServe action (split by Gemini).
    const combined = fieldType === "OBSERVATION" && String(b.combined || "") === "1";
    const objectKey = `${base}/voice/${b.fileId}${combined ? ".all3" : ""}.${ext}`;
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, { "Content-Type": mime });
    const configured = isVoiceConfigured();
    await inTx(async (conn) => {
      // A new recording for the same field replaces the old one as "current"; the old audio is kept.
      await conn.query(
        "UPDATE audit_voice_notes SET is_current = 0 WHERE finding_id = ? AND field_type = ? AND is_current = 1",
        [finding.id, fieldType],
      );
      await conn.query(
        `INSERT INTO audit_voice_notes (id, audit_id, finding_id, field_type, object_key, file_name, mime_type, size_bytes,
           duration_seconds, source_language, status, error_message, recorded_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [b.fileId, audit.id, finding.id, fieldType, objectKey, (req.file.originalname || "").slice(0, 255) || null, mime,
          req.file.size, Number.isInteger(duration) && duration >= 0 ? duration : null, sourceLanguage,
          configured ? "QUEUED" : "FAILED",
          configured ? null : "Translation is not set up on the server yet. Type the English text instead.",
          req.user.id],
      );
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "VOICE", entityId: b.fileId, action: "CREATED",
        message: `Voice note recorded (${fieldType.toLowerCase().replace(/_/g, " ")}) for finding ${String(finding.finding_number).padStart(2, "0")}`,
      });
    });
    const [[row]] = await pool.query("SELECT * FROM audit_voice_notes WHERE id = ?", [b.fileId]);
    if (configured) translateNow(b.fileId); // start now; the cron is only the backup
    return res.status(201).json(shapeVoice(audit.id, row));
  } catch (err) {
    sendError(res, err, "Failed to upload file");
  }
});

// Site walkthrough: one recording for many areas -> the areas and findings it describes.
// Nothing is saved as areas here: the app shows them for review and saves them (with photos) itself.
// The audio is kept in storage as evidence. Waits for Gemini (up to about 2 minutes).
router.post("/:id/walkthrough", ...can(PERMISSIONS.UPDATE_AUDIT), receiveFile, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) throw new HttpError(400, "VALIDATION", "No recording was received");
    const mime = String(req.file.mimetype || "").toLowerCase();
    const ext = AUDIO_TYPES[mime];
    if (!ext) throw new HttpError(415, "FILE_TYPE", "Unsupported audio format");
    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const sourceLanguage = LANGUAGES.includes(String(req.body?.sourceLanguage || "auto")) ? String(req.body.sourceLanguage || "auto") : "auto";
    const objectKey = `audits/${audit.id}/walkthrough/${uuid()}.${ext}`;
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, req.file.buffer, req.file.size, { "Content-Type": mime });
    await logHistory(pool, {
      auditId: audit.id, userId: req.user.id, entityType: "VOICE", entityId: null, action: "CREATED",
      message: "Site walkthrough recorded",
    });
    let result;
    try {
      result = await transcribeWalkthrough({ objectKey, mimeType: mime, sourceLanguage });
    } catch (err) {
      if (err instanceof VoiceNoSpeechError) throw new HttpError(422, "NO_SPEECH", "No clear areas were heard in this recording. Record again, speaking area by area.");
      if (err instanceof VoiceQuotaError) throw new HttpError(429, "QUOTA", err.message);
      if (err instanceof VoiceBusyError || err instanceof VoiceConfigError) throw new HttpError(503, "BUSY", "Translation is busy or slow right now. Tap Try again.");
      throw new HttpError(502, "TRANSLATE_FAILED", err.message || "Could not read the recording");
    }
    res.json({ areas: result.areas, detectedLanguage: result.detectedLanguage, recordingKey: objectKey });
  } catch (err) {
    sendError(res, err, "Failed to process the walkthrough");
  }
});

// Streams a photo or recording after the permission + scope check (bucket stays private).
router.get("/:id/files/:fileId", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    if (!isUuid(req.params.fileId)) throw new HttpError(404, "NOT_FOUND", "File not found");
    let [[file]] = await pool.query(
      "SELECT id, object_key, mime_type, 'PHOTO' AS kind FROM audit_finding_photos WHERE id = ? AND audit_id = ?",
      [req.params.fileId, audit.id],
    );
    if (!file) {
      [[file]] = await pool.query(
        "SELECT id, object_key, mime_type, 'VOICE' AS kind FROM audit_voice_notes WHERE id = ? AND audit_id = ?",
        [req.params.fileId, audit.id],
      );
    }
    if (!file) throw new HttpError(404, "NOT_FOUND", "File not found");

    res.setHeader("Cache-Control", "private, max-age=3600");
    // ?original=1: the photo as taken, without the supervisor's marks (the marking screen draws on it).
    const marked = file.kind === "PHOTO" && isMarked(file.object_key);
    const key = file.kind === "PHOTO" && req.query.original === "1" ? originalKey(file.object_key) : file.object_key;
    const stream = await minioClient.getObject(process.env.MINIO_BUCKET, key);
    // thumb = grid tile; view = upright, screen-sized copy for the marking screen.
    const sized = { thumb: [480, 75], view: [1600, 82] }[req.query.size];
    if (file.kind === "PHOTO" && sized) {
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      const out = await sharp(Buffer.concat(chunks)).rotate().resize({ width: sized[0], height: sized[0], fit: "inside", withoutEnlargement: true }).jpeg({ quality: sized[1] }).toBuffer();
      res.setHeader("Content-Type", "image/jpeg");
      return res.end(out);
    }
    res.setHeader("Content-Type", marked && key === file.object_key ? "image/jpeg" : file.mime_type || "application/octet-stream");
    stream.on("error", () => res.destroy());
    return stream.pipe(res);
  } catch (err) {
    sendError(res, err, "Failed to load file");
  }
});

router.patch("/:id/photos/:photoId", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const b = req.body || {};
    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const [[photo]] = await pool.query(
      "SELECT * FROM audit_finding_photos WHERE id = ? AND audit_id = ? AND is_deleted = 0",
      [req.params.photoId, audit.id],
    );
    if (!photo) throw new HttpError(404, "NOT_FOUND", "Photo not found");
    const sets = [];
    const params = [];
    if (b.caption !== undefined) { sets.push("caption = ?"); params.push(text(b.caption, "caption", 500)); }
    if (b.includeInReport !== undefined) { sets.push("include_in_report = ?"); params.push(b.includeInReport ? 1 : 0); }
    if (b.displayOrder !== undefined) {
      const n = Number(b.displayOrder);
      if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(400, "VALIDATION", "displayOrder must be 1-999");
      sets.push("display_order = ?"); params.push(n);
    }
    if (b.crop !== undefined) {
      if (b.crop === null) { sets.push("crop = NULL"); }
      else {
        const c = b.crop;
        const ok = ["x", "y", "w", "h"].every((k) => typeof c[k] === "number" && c[k] >= 0 && c[k] <= 1) && c.w > 0 && c.h > 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001;
        if (!ok) throw new HttpError(400, "VALIDATION", "crop must be fractions x, y, w, h between 0 and 1");
        sets.push("crop = ?"); params.push(JSON.stringify({ x: c.x, y: c.y, w: c.w, h: c.h }));
      }
    }
    if (!sets.length) throw new HttpError(400, "VALIDATION", "Nothing to update");
    await pool.query(`UPDATE audit_finding_photos SET ${sets.join(", ")} WHERE id = ?`, [...params, photo.id]);
    await touchAudit(pool, audit.id, req.user.id);
    const [[row]] = await pool.query("SELECT * FROM audit_finding_photos WHERE id = ?", [photo.id]);
    res.json(shapePhoto(audit.id, row));
  } catch (err) {
    sendError(res, err, "Failed to update photo");
  }
});

// ---- photo marking (circles, arrows, pen, labels drawn on a photo) ------------------

async function readObject(key) {
  const stream = await minioClient.getObject(process.env.MINIO_BUCKET, key);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function loadPhoto(req, audit) {
  if (!isUuid(req.params.photoId)) throw new HttpError(404, "NOT_FOUND", "Photo not found");
  const [[photo]] = await pool.query(
    "SELECT * FROM audit_finding_photos WHERE id = ? AND audit_id = ? AND is_deleted = 0",
    [req.params.photoId, audit.id],
  );
  if (!photo) throw new HttpError(404, "NOT_FOUND", "Photo not found");
  return photo;
}

// The marks saved on a photo (empty when it has none), so the marking screen can edit them.
router.get("/:id/photos/:photoId/marks", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    const photo = await loadPhoto(req, audit);
    let marks = [];
    if (isMarked(photo.object_key)) {
      try {
        marks = JSON.parse((await readObject(marksKey(photo.object_key))).toString("utf8")).marks || [];
      } catch {
        marks = []; // marks file missing: start again from the original
      }
    }
    res.json({ marks });
  } catch (err) {
    sendError(res, err, "Failed to load the photo marks");
  }
});

// Saves the marks and makes the marked copy. An empty list goes back to the original photo.
router.put("/:id/photos/:photoId/marks", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const marks = parseMarks((req.body || {}).marks);
    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const photo = await loadPhoto(req, audit);
    const original = originalKey(photo.object_key);
    const bucket = process.env.MINIO_BUCKET;

    let newKey = original;
    if (marks.length) {
      const jpeg = await renderMarked(await readObject(original), marks);
      newKey = `${original}.marked-${Date.now()}.jpg`;
      await minioClient.putObject(bucket, newKey, jpeg, jpeg.length, { "Content-Type": "image/jpeg" });
    }
    const json = Buffer.from(JSON.stringify({ marks, savedAt: new Date().toISOString(), savedBy: req.user.id }));
    await minioClient.putObject(bucket, marksKey(original), json, json.length, { "Content-Type": "application/json" });
    await pool.query("UPDATE audit_finding_photos SET object_key = ? WHERE id = ?", [newKey, photo.id]);
    // The previous marked copy is only a drawing on the original: remove it (the original stays).
    if (isMarked(photo.object_key) && photo.object_key !== newKey) {
      minioClient.removeObject(bucket, photo.object_key).catch(() => undefined);
    }
    await touchAudit(pool, audit.id, req.user.id);
    await logHistory(pool, {
      auditId: audit.id, userId: req.user.id, entityType: "PHOTO", entityId: photo.id, action: "UPDATED",
      message: marks.length ? `Photo marked (${marks.length} mark${marks.length === 1 ? "" : "s"})` : "Photo marks removed",
    });
    const [[row]] = await pool.query("SELECT * FROM audit_finding_photos WHERE id = ?", [photo.id]);
    res.json(shapePhoto(audit.id, row));
  } catch (err) {
    sendError(res, err, "Failed to save the photo marks");
  }
});

// Soft delete only (evidence is never removed from storage), and only before submit.
router.delete("/:id/photos/:photoId", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const [r] = await pool.query(
      "UPDATE audit_finding_photos SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ? AND audit_id = ? AND is_deleted = 0",
      [req.user.id, req.params.photoId, audit.id],
    );
    if (!r.affectedRows) throw new HttpError(404, "NOT_FOUND", "Photo not found");
    await pool.query("UPDATE audits SET cover_photo_id = NULL WHERE id = ? AND cover_photo_id = ?", [audit.id, req.params.photoId]);
    await touchAudit(pool, audit.id, req.user.id);
    await logHistory(pool, {
      auditId: audit.id, userId: req.user.id, entityType: "PHOTO", entityId: req.params.photoId, action: "DELETED",
      message: "Photo removed from the report (kept as evidence)",
    });
    res.status(204).end();
  } catch (err) {
    sendError(res, err, "Failed to remove photo");
  }
});

async function loadVoice(req, auditId, voiceId) {
  if (!isUuid(voiceId)) throw new HttpError(404, "NOT_FOUND", "Voice note not found");
  const [[v]] = await pool.query("SELECT * FROM audit_voice_notes WHERE id = ? AND audit_id = ?", [voiceId, auditId]);
  if (!v) throw new HttpError(404, "NOT_FOUND", "Voice note not found");
  return v;
}

router.get("/:id/voice/:voiceId", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    res.json(shapeVoice(audit.id, await loadVoice(req, audit.id, req.params.voiceId)));
  } catch (err) {
    sendError(res, err, "Failed to load voice note");
  }
});

// Retry translation (optionally with a corrected language).
router.post("/:id/voice/:voiceId/process", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    assertEditable(audit);
    const v = await loadVoice(req, audit.id, req.params.voiceId);
    if (!v.is_current) throw new HttpError(409, "VALIDATION", "A newer recording replaced this one");
    if (!["FAILED", "REVIEW_REQUIRED"].includes(v.status)) {
      throw new HttpError(409, "VALIDATION", "This voice note is already being translated");
    }
    if (!isVoiceConfigured()) {
      throw new HttpError(502, "VOICE_FAILED", "Translation is not set up on the server yet. Type the English text instead.");
    }
    const lang = req.body?.sourceLanguage;
    const sourceLanguage = lang && LANGUAGES.includes(String(lang)) ? String(lang) : v.source_language;
    await pool.query(
      "UPDATE audit_voice_notes SET status = 'QUEUED', attempts = 0, error_message = NULL, source_language = ? WHERE id = ?",
      [sourceLanguage, v.id],
    );
    translateNow(v.id);
    res.status(202).json(shapeVoice(audit.id, await loadVoice(req, audit.id, v.id)));
  } catch (err) {
    sendError(res, err, "Failed to retry translation");
  }
});

// The supervisor's reviewed English goes into the finding; the audio stays as evidence.
router.post("/:id/voice/:voiceId/accept", ...can(PERMISSIONS.UPDATE_AUDIT), async (req, res) => {
  try {
    const acceptedText = text(req.body?.acceptedText, "English text", 10000, true);
    const manual = req.body?.manual === true;
    const out = await inTx(async (conn) => {
      const audit = await loadAudit(conn, req, req.params.id, { forUpdate: true });
      assertEditable(audit);
      const [[v]] = await conn.query("SELECT * FROM audit_voice_notes WHERE id = ? AND audit_id = ? FOR UPDATE", [req.params.voiceId, audit.id]);
      if (!v) throw new HttpError(404, "NOT_FOUND", "Voice note not found");
      if (!v.is_current) throw new HttpError(409, "VALIDATION", "A newer recording replaced this one");
      if (["QUEUED", "PROCESSING", "UPLOADED"].includes(v.status) && !manual) {
        throw new HttpError(409, "VALIDATION", "Translation is still running. Wait for it, or type the text yourself.");
      }
      const column = FIELD_COLUMN[v.field_type];
      const [[before]] = await conn.query(`SELECT ${column} AS value, title FROM audit_findings WHERE id = ?`, [v.finding_id]);
      await conn.query(
        `UPDATE audit_voice_notes SET status = ?, accepted_text = ?, accepted_by = ?, accepted_at = NOW() WHERE id = ?`,
        [manual && v.status !== "REVIEW_REQUIRED" && v.status !== "ACCEPTED" ? "MANUAL" : "ACCEPTED", acceptedText, req.user.id, v.id],
      );
      await conn.query(
        `UPDATE audit_findings SET ${column} = ?, row_version = row_version + 1, updated_by = ? WHERE id = ?`,
        [acceptedText, req.user.id, v.finding_id],
      );
      await touchAudit(conn, audit.id, req.user.id);
      await logHistory(conn, {
        auditId: audit.id, userId: req.user.id, entityType: "VOICE", entityId: v.id, action: "VOICE_ACCEPTED",
        message: `English text accepted for "${before?.title || "finding"}" (${v.field_type.toLowerCase().replace(/_/g, " ")})`,
        oldValue: { [column]: before?.value ?? null }, newValue: { [column]: acceptedText },
      });
      const [[f]] = await conn.query("SELECT row_version FROM audit_findings WHERE id = ?", [v.finding_id]);
      const [[fresh]] = await conn.query("SELECT * FROM audit_voice_notes WHERE id = ?", [v.id]);
      return { voice: shapeVoice(audit.id, fresh), finding: { id: v.finding_id, field: column, rowVersion: f.row_version } };
    });
    res.json(out);
  } catch (err) {
    sendError(res, err, "Failed to accept the text");
  }
});

// ---- history ---------------------------------------------------------------

router.get("/:id/history", ...can(PERMISSIONS.VIEW_AUDIT), async (req, res) => {
  try {
    const audit = await loadAudit(pool, req, req.params.id);
    const [rows] = await pool.query(
      `SELECT h.id, DATE_FORMAT(h.created_at, '%Y-%m-%dT%H:%i:%s') AS at, h.created_by, u.name AS by_name,
              h.action, h.entity_type, h.entity_id, h.message, h.old_value, h.new_value
       FROM audit_history h LEFT JOIN users u ON u.id = h.created_by
       WHERE h.audit_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 500`,
      [audit.id],
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id, at: r.at, by: r.created_by != null ? { id: Number(r.created_by), name: r.by_name } : null,
        action: r.action, entityType: r.entity_type, entityId: r.entity_id, message: r.message,
        old: r.old_value, new: r.new_value,
      })),
    });
  } catch (err) {
    sendError(res, err, "Failed to load audit history");
  }
});

module.exports = router;
