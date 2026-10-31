const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const sharp = require("sharp");
const { pool } = require("../../db");
const minioClient = require("../lib/minio");
const { AUDIT_SELECT, RISK_CATEGORIES, loadRiskLevels } = require("../utils/audits");
const { loadAuditTree } = require("../utils/auditTree");
const { renderAuditReportPdf } = require("../utils/auditReportPdf");

// ---------------------------------------------------------------------------
// Site Audit PDF reports. Submitting an audit queues report version 1; the
// queue worker (jobs/auditQueue.cron.js) calls generate(), which freezes the
// audit into a JSON snapshot, draws the Option B PDF and stores it in MinIO at
// audits/{auditId}/reports/v{n}.pdf. A failed report never touches the audit;
// it is retried up to MAX_ATTEMPTS times.
// ---------------------------------------------------------------------------

const TEMPLATE_VERSION = "B1";
const MAX_ATTEMPTS = 3;
const PHOTOS_PER_FINDING = 8;

const AUDIT_TYPE_LABEL = {
  PRE_SALE: "Pre-sale audit", COMPLAINT: "Complaint audit", ROUTINE: "Routine audit", OTHER: "Other",
  // Older audits.
  GENERAL_PEST: "General Pest Control", RODENT: "Rodent", TERMITE: "Termite",
};
const titleCase = (s) => String(s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Adds the next report version for an audit, status QUEUED. Use inside the submit transaction. */
async function queueReport(db, auditId, userId, reason = null) {
  const [[row]] = await db.query("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM audit_reports WHERE audit_id = ?", [auditId]);
  const id = uuid();
  await db.query(
    `INSERT INTO audit_reports (id, audit_id, version, status, template_version, reason, requested_by)
     VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)`,
    [id, auditId, row.v, TEMPLATE_VERSION, reason, userId],
  );
  return { id, version: row.v };
}

/** Everything the PDF shows, frozen at generation time (stored in audit_reports.snapshot). */
async function buildSnapshot(audit, version) {
  const tree = await loadAuditTree(pool, audit);
  const levels = (await loadRiskLevels(pool)).map((l) => ({
    code: l.code, label: l.label, color: l.color_hex, bucket: l.timeline_bucket, defaultDays: l.default_days,
  }));
  const categoryLabel = (code) => RISK_CATEGORIES.find((c) => c.code === code)?.label || code;

  const findings = [];
  for (const area of tree.areas) {
    for (const f of area.findings) {
      findings.push({
        id: f.id,
        number: f.findingNumber,
        areaNumber: area.areaNumber,
        areaName: area.areaName,
        zone: area.zoneName,
        where: area.zoneName ? `${area.areaName} — ${area.zoneName}` : area.areaName,
        title: f.title,
        categoryCode: f.riskCategory,
        category: categoryLabel(f.riskCategory),
        riskType: f.riskTypeText,
        riskLevel: f.riskLevel,
        days: f.actionWithinDays,
        dueDate: f.actionDueDate,
        observation: f.observationText,
        customerAction: f.customerActionText,
        bestserveAction: f.bestserveActionText,
        noPhotoReason: f.noPhotoReason,
        photoIds: f.photos.filter((p) => p.includeInReport !== false).slice(0, PHOTOS_PER_FINDING).map((p) => p.id),
      });
    }
  }
  findings.sort((a, b) => a.number - b.number);

  const options = { riskChain: true, riskByZone: true, priority: true, ipmCycle: true, ...(tree.reportOptions || {}) };
  return {
    template: TEMPLATE_VERSION,
    version,
    generatedAt: new Date().toISOString(),
    audit: {
      id: tree.id,
      number: tree.auditNumber,
      date: tree.auditDate,
      types: tree.auditTypes.map((t) => AUDIT_TYPE_LABEL[t] || (/^[A-Z_]+$/.test(t) ? titleCase(t) : t)),
      pests: (tree.targetPests || []).map((p) => (/^[A-Z_]+$/.test(p) ? titleCase(p) : p)),
      overallRisk: tree.overallRisk,
      customerActionLabel: tree.customerActionLabel,
    },
    company: { name: tree.company.name },
    site: { name: tree.site.name, address: tree.site.address },
    auditor: tree.auditor?.name || null,
    escort: tree.escort,
    signoff: tree.signoff,
    options,
    levels,
    counts: tree.counts,
    findings,
    recommendations: tree.recommendations,
    // Chosen cover photo, else the first photo of the audit.
    coverPhotoId: tree.coverPhotoId || findings.find((f) => f.photoIds.length)?.photoIds[0] || null,
  };
}

/** Photo bytes for the PDF, shrunk to JPEG so a 30-finding report stays small. Missing photos are skipped. */
async function loadImages(auditId, ids) {
  if (!ids.length) return {};
  const [rows] = await pool.query(
    "SELECT id, object_key FROM audit_finding_photos WHERE audit_id = ? AND id IN (?)",
    [auditId, ids],
  );
  const out = {};
  for (const r of rows) {
    try {
      const stream = await minioClient.getObject(process.env.MINIO_BUCKET, r.object_key);
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      const raw = Buffer.concat(chunks);
      out[r.id] = await sharp(raw).rotate().resize({ width: 1400, height: 1400, fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
      // Soft blurred copy: fills the frame behind portrait / odd-shaped photos instead of a hard crop.
      out[`${r.id}#blur`] = await sharp(raw).rotate().resize({ width: 480, height: 480, fit: "inside" })
        .blur(14).modulate({ brightness: 0.8 }).jpeg({ quality: 60 }).toBuffer();
    } catch (err) {
      console.error("Audit report photo skipped", r.id, err.message);
    }
  }
  return out;
}

// Bestserve cover picture (technician in protective suit), the same on every report.
const BRAND_COVER = path.join(__dirname, "../../assets/report-cover.jpg");

/**
 * Cover background: the Bestserve cover picture. Only if that file is missing, the audit's cover
 * photo, landscape-cropped and softly blurred. The PDF tints it dark green behind the title.
 */
async function addCoverBackdrop(snap, images) {
  try {
    images["#cover"] = await fs.promises.readFile(BRAND_COVER);
    images["#brandCover"] = true;
    return;
  } catch (err) {
    console.error("Audit report brand cover missing, using a site photo", err.message);
  }
  if (snap.coverPhotoId && !images[snap.coverPhotoId]) snap.coverPhotoId = null;
  if (!snap.coverPhotoId) return;
  try {
    images["#cover"] = await sharp(images[snap.coverPhotoId])
      .resize({ width: 1600, height: 900, fit: "cover" }).blur(2.5).jpeg({ quality: 72 }).toBuffer();
  } catch (err) {
    console.error("Audit report cover skipped", err.message);
  }
}

/** Draws one queued report. Never throws: failures are written to the report row. */
async function generate(reportId) {
  const [claim] = await pool.query(
    "UPDATE audit_reports SET status = 'GENERATING', attempts = attempts + 1 WHERE id = ? AND status = 'QUEUED'",
    [reportId],
  );
  if (!claim.affectedRows) return;
  const [[report]] = await pool.query("SELECT id, audit_id, version, attempts FROM audit_reports WHERE id = ?", [reportId]);
  try {
    const [[audit]] = await pool.query(`${AUDIT_SELECT} WHERE a.id = ?`, [report.audit_id]);
    if (!audit) throw new Error("Audit not found");
    const snap = await buildSnapshot(audit, report.version);
    const ids = [...new Set([snap.coverPhotoId, ...snap.findings.flatMap((f) => f.photoIds)].filter(Boolean))];
    const images = await loadImages(audit.id, ids);
    await addCoverBackdrop(snap, images);

    const { buffer, pageCount } = await renderAuditReportPdf(snap, images);
    const objectKey = `audits/${audit.id}/reports/v${report.version}.pdf`;
    await minioClient.putObject(process.env.MINIO_BUCKET, objectKey, buffer, buffer.length, { "Content-Type": "application/pdf" });
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    await pool.query(
      `UPDATE audit_reports SET status = 'GENERATED', snapshot = ?, object_key = ?, size_bytes = ?, checksum_sha256 = ?,
         page_count = ?, error_message = NULL, generated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(snap), objectKey, buffer.length, checksum, pageCount, report.id],
    );
    await pool.query("UPDATE audits SET current_report_id = ? WHERE id = ?", [report.id, audit.id]);
  } catch (err) {
    const giveUp = report.attempts >= MAX_ATTEMPTS;
    await pool.query(
      "UPDATE audit_reports SET status = ?, error_message = ? WHERE id = ?",
      [giveUp ? "FAILED" : "QUEUED", String(err.message || err).slice(0, 1000), report.id],
    );
    console.error("Audit report failed", report.id, err.message);
  }
}

/**
 * A draft preview of the report from the audit as it is now (any status). Not stored,
 * no version; every page is marked DRAFT. Used by "View report" before submitting.
 */
async function renderPreview(auditId) {
  const [[audit]] = await pool.query(`${AUDIT_SELECT} WHERE a.id = ?`, [auditId]);
  if (!audit) throw new Error("Audit not found");
  const snap = await buildSnapshot(audit, 0);
  snap.draft = true;
  const ids = [...new Set([snap.coverPhotoId, ...snap.findings.flatMap((f) => f.photoIds)].filter(Boolean))];
  const images = await loadImages(audit.id, ids);
  await addCoverBackdrop(snap, images);
  const { buffer } = await renderAuditReportPdf(snap, images);
  return { buffer, auditNumber: audit.audit_number };
}

/** Start drawing a report now, without waiting for the cron. Never throws. */
function generateNow(reportId) {
  setImmediate(() => {
    generate(reportId).catch((err) => console.error("Audit report error", reportId, err));
  });
}

/** Queue worker step: submitted audits without a report get one; queued reports are drawn one at a time. */
async function processReports() {
  const [missing] = await pool.query(
    `SELECT a.id, COALESCE(a.submitted_by, a.auditor_user_id) AS by_user FROM audits a
     WHERE a.status = 'SUBMITTED' AND NOT EXISTS (SELECT 1 FROM audit_reports r WHERE r.audit_id = a.id)
     LIMIT 5`,
  );
  for (const a of missing) await queueReport(pool, a.id, a.by_user, "Submitted before reports were available");
  // A report stuck in GENERATING (server restarted mid-draw) goes back to the queue.
  await pool.query(
    `UPDATE audit_reports SET status = 'QUEUED'
     WHERE status = 'GENERATING' AND requested_at < NOW() - INTERVAL 10 MINUTE AND attempts < ?`,
    [MAX_ATTEMPTS],
  );
  const [rows] = await pool.query("SELECT id FROM audit_reports WHERE status = 'QUEUED' ORDER BY requested_at LIMIT 2");
  for (const r of rows) await generate(r.id);
}

module.exports = { queueReport, generate, generateNow, processReports, renderPreview, TEMPLATE_VERSION };
