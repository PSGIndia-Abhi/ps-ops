// ---------------------------------------------------------------------------
// Loads one audit with its areas, findings, photos, voice notes, sign-off and
// report versions, in the shape the app and web use. Shared by the audit routes
// and the report generator.
// ---------------------------------------------------------------------------
const { isMarked, markVersion } = require("./photoMarks");

function shapeFinding(f, photos = [], voice = []) {
  return {
    id: f.id,
    areaId: f.area_id,
    findingNumber: f.finding_number,
    title: f.title,
    riskCategory: f.risk_category,
    riskTypeText: f.risk_type_text,
    riskLevel: f.risk_level,
    actionWithinDays: f.action_within_days,
    actionDueDate: f.action_due_date,
    observationText: f.observation_text,
    customerActionText: f.customer_action_text,
    bestserveActionText: f.bestserve_action_text,
    noPhotoReason: f.no_photo_reason,
    status: f.status,
    followUpTaskId: f.follow_up_task_id,
    photos,
    voice,
    rowVersion: f.row_version,
  };
}

function shapeArea(a, findings = []) {
  return {
    id: a.id,
    areaNumber: a.area_number,
    areaName: a.area_name,
    zoneName: a.zone_name,
    notes: a.notes,
    status: a.status,
    savedAt: a.saved_at,
    rowVersion: a.row_version,
    findings,
  };
}

const FINDING_SELECT = `
  SELECT id, audit_id, area_id, finding_number, title, risk_category, risk_type_text, risk_level,
         action_within_days, DATE_FORMAT(action_due_date, '%Y-%m-%d') AS action_due_date,
         observation_text, customer_action_text, bestserve_action_text, no_photo_reason,
         status, follow_up_task_id, row_version
  FROM audit_findings`;

const AREA_SELECT = `
  SELECT id, audit_id, area_number, area_name, zone_name, notes, status,
         DATE_FORMAT(saved_at, '%Y-%m-%dT%H:%i:%s') AS saved_at, row_version
  FROM audit_areas`;

// Full audit tree used by GET /:id (resume) and after writes.
async function loadAuditTree(db, audit) {
  const [[company]] = await db.query("SELECT id, COALESCE(display_name, name) AS name FROM companies WHERE id = ?", [audit.company_id]);
  const [[site]] = await db.query(
    "SELECT id, name, CONCAT_WS(', ', NULLIF(address,''), NULLIF(city,'')) AS address FROM sites WHERE id = ?",
    [audit.site_id],
  );
  const [[auditor]] = await db.query("SELECT id, name FROM users WHERE id = ?", [audit.auditor_user_id]);
  const [areas] = await db.query(`${AREA_SELECT} WHERE audit_id = ? ORDER BY area_number`, [audit.id]);
  const [findings] = await db.query(`${FINDING_SELECT} WHERE audit_id = ? ORDER BY finding_number`, [audit.id]);
  const [photos] = await db.query(
    `SELECT id, finding_id, caption, display_order, include_in_report, width, height, object_key
     FROM audit_finding_photos WHERE audit_id = ? AND is_deleted = 0 ORDER BY display_order`,
    [audit.id],
  );
  const [voice] = await db.query(
    `SELECT id, finding_id, field_type, status, duration_seconds FROM audit_voice_notes
     WHERE audit_id = ? AND is_current = 1`,
    [audit.id],
  );
  const [recs] = await db.query(
    `SELECT id, bucket, owner, text, finding_ids, source, display_order FROM audit_recommendations
     WHERE audit_id = ? ORDER BY bucket, display_order`,
    [audit.id],
  );
  const [[signoff]] = await db.query(
    `SELECT received_by_name, received_by_designation,
            DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s') AS received_at,
            DATE_FORMAT(next_audit_date, '%Y-%m-%d') AS next_audit_date, remarks
     FROM audit_signoffs WHERE audit_id = ?`,
    [audit.id],
  );
  const [reports] = await db.query(
    `SELECT id, version, status, template_version, page_count, size_bytes,
            DATE_FORMAT(generated_at, '%Y-%m-%dT%H:%i:%s') AS generated_at, reason
     FROM audit_reports WHERE audit_id = ? ORDER BY version DESC`,
    [audit.id],
  );

  const photosBy = {};
  for (const p of photos) {
    (photosBy[p.finding_id] ||= []).push({
      id: p.id, url: `/api/audits/${audit.id}/files/${p.id}`, caption: p.caption,
      displayOrder: p.display_order, includeInReport: !!p.include_in_report, width: p.width, height: p.height,
      // Drawn on by the supervisor; v changes with every save so pictures reload.
      marked: isMarked(p.object_key), v: markVersion(p.object_key),
    });
  }
  const voiceBy = {};
  for (const v of voice) {
    (voiceBy[v.finding_id] ||= []).push({ id: v.id, fieldType: v.field_type, status: v.status, durationSeconds: v.duration_seconds });
  }
  const findingsBy = {};
  const counts = { areas: areas.length, areasCompleted: 0, findings: findings.length, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, voicePending: 0, photosMissing: 0 };
  for (const f of findings) {
    (findingsBy[f.area_id] ||= []).push(shapeFinding(f, photosBy[f.id] || [], voiceBy[f.id] || []));
    if (counts[f.risk_level] !== undefined) counts[f.risk_level] += 1;
    if (!(photosBy[f.id] || []).length && !f.no_photo_reason) counts.photosMissing += 1;
  }
  counts.areasCompleted = areas.filter((a) => a.status === "COMPLETED").length;
  counts.voicePending = voice.filter((v) => !["ACCEPTED", "MANUAL"].includes(v.status)).length;
  const lastSavedAt = areas.reduce((m, a) => (a.saved_at && (!m || a.saved_at > m) ? a.saved_at : m), null);

  return {
    id: audit.id,
    auditNumber: audit.audit_number,
    status: audit.status,
    rowVersion: audit.row_version,
    company: company || { id: audit.company_id, name: null },
    site: site || { id: audit.site_id, name: null, address: null },
    auditDate: audit.audit_date,
    auditType: audit.audit_type,
    auditTypes: String(audit.audit_type || "").split(",").filter(Boolean),
    targetPests: audit.target_pests || [],
    auditor: auditor ? { id: Number(auditor.id), name: auditor.name } : null,
    escort: { name: audit.escort_name, designation: audit.escort_designation, contact: audit.escort_contact },
    customerActionLabel: audit.customer_action_label,
    siteNotes: audit.site_notes,
    coverPhotoId: audit.cover_photo_id,
    reportOptions: audit.report_options,
    overallRisk: audit.overall_risk_override || audit.overall_risk,
    computedRisk: audit.overall_risk,
    riskOverride: audit.overall_risk_override ? { level: audit.overall_risk_override, reason: audit.override_reason } : null,
    startedAt: audit.started_at,
    submittedAt: audit.submitted_at,
    counts,
    areas: areas.map((a) => shapeArea(a, findingsBy[a.id] || [])),
    recommendations: recs.map((r) => ({
      id: r.id, bucket: r.bucket, owner: r.owner, text: r.text, findingIds: r.finding_ids || [],
      source: r.source, displayOrder: r.display_order,
    })),
    signoff: signoff ? {
      receivedByName: signoff.received_by_name, receivedByDesignation: signoff.received_by_designation,
      receivedAt: signoff.received_at, nextAuditDate: signoff.next_audit_date, remarks: signoff.remarks,
    } : null,
    reports: reports.map((r) => ({
      id: r.id, version: r.version, status: r.status, templateVersion: r.template_version,
      pageCount: r.page_count, sizeBytes: r.size_bytes, generatedAt: r.generated_at, reason: r.reason,
    })),
    lastSavedAt: lastSavedAt || audit.updated_at,
  };
}

module.exports = { shapeFinding, shapeArea, FINDING_SELECT, AREA_SELECT, loadAuditTree };
