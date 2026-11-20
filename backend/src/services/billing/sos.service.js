// SOS - the monthly Statement of Service the Service Coordinator sends to Accounts.
//
// For a customer and calendar month, the services agreed in the customer's billing profile
// (contract lines that are services billed per service) come up per outlet with "assigned" = the
// services per month agreed. The coordinator enters "completed", adds any extra services, and
// submits. Submitted = locked; reopening removes the drafts made from it (so an invoice always uses
// the latest numbers) and is refused once the month is invoiced.
// Tables: billing_sos, billing_sos_lines (20261122_billing_sos.sql).

const { v4: uuid } = require("uuid");
const C = require("./common");
const { logAudit } = require("../Audit.service");
const { notifyUsers } = require("../notifications.service");

const ACCOUNTS_ROLES = ["Accounts Head", "Accounts Executive"];
const norm = (v) => String(v || "").trim().toLowerCase();

/** "2026-11" or "2026-11-19" -> "2026-11-01". */
const monthStart = (m) => `${String(m).slice(0, 7)}-01`;

/** First days of `count` calendar months from the month of `date`. */
function monthStarts(date, count = 1) {
  const first = monthStart(date);
  return Array.from({ length: Math.max(1, count) }, (_, i) => C.addMonths(first, i));
}

/**
 * The services agreed for a customer in a month: contract lines that are services billed per
 * service, on active contracts running that month, with the price line in force in the month.
 */
async function agreedLines(db, companyId, month) {
  const start = monthStart(month);
  const end = C.monthRange(start.slice(0, 7)).end;
  const [rows] = await db.query(
    `SELECT l.id AS contract_line_id, l.contract_id, bc.contract_code, bc.shortfall_billing, l.site_id, s.name AS site,
            l.item_name AS service, l.default_qty, l.rate, l.sort_order
       FROM billing_contract_lines l
       JOIN billing_contracts bc ON bc.id = l.contract_id
       LEFT JOIN sites s ON s.id = l.site_id
      WHERE bc.company_id = ? AND bc.status = 'ACTIVE'
        AND bc.start_date <= ? AND (bc.end_date IS NULL OR bc.end_date >= ?)
        AND l.is_active = 1 AND l.item_kind = 'SERVICE' AND l.pricing_basis = 'PER_SERVICE'
        AND l.effective_from <= ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
      ORDER BY s.name, l.sort_order, l.item_name`,
    [companyId, end, start, end, start]
  );
  return rows.map((r) => ({
    contract_line_id: r.contract_line_id,
    contract_id: r.contract_id,
    contract_code: r.contract_code,
    structure: r.shortfall_billing === "FULL" ? "FIXED" : "SERVICE_BASED",
    site_id: r.site_id,
    site: r.site || null,
    service: r.service,
    per_month: Number(r.default_qty) || 0,
    rate: Number(r.rate),
  }));
}

async function sosRow(db, companyId, month, { lock = false } = {}) {
  const [[row]] = await db.query(
    `SELECT so.*, su.name AS submitted_by_name, ru.name AS reopened_by_name
       FROM billing_sos so
       LEFT JOIN users su ON su.id = so.submitted_by
       LEFT JOIN users ru ON ru.id = so.reopened_by
      WHERE so.company_id = ? AND so.month = ?${lock ? " FOR UPDATE" : ""}`,
    [companyId, monthStart(month)]
  );
  return row || null;
}

async function savedLines(db, sosId) {
  if (!sosId) return [];
  const [rows] = await db.query(
    `SELECT l.*, s.name AS site FROM billing_sos_lines l LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.sos_id = ? ORDER BY l.is_extra, s.name, l.sort_order`,
    [sosId]
  );
  return rows;
}

/** Issued invoices of the customer whose period uses this month (then the SOS cannot change). */
async function invoicedFor(db, companyId, month) {
  const [rows] = await db.query(
    `SELECT bi.invoice_number, DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start, DATE_FORMAT(bi.period_end, '%Y-%m-%d') AS period_end, bc.frequency_months
       FROM billing_invoices bi JOIN billing_contracts bc ON bc.id = bi.contract_id
      WHERE bi.company_id = ? AND bi.status = 'ISSUED' AND bi.period_start IS NOT NULL
        AND bi.period_start <= ? AND bi.period_end >= ?`,
    [companyId, C.monthRange(monthStart(month).slice(0, 7)).end, C.addMonths(monthStart(month), -12)]
  );
  const m = monthStart(month);
  return rows.filter((r) => monthStarts(r.period_start, monthsIn(r.period_start, r.period_end)).includes(m)).map((r) => r.invoice_number);
}

/** Calendar months a billing period uses (from its start month), at least 1. */
function monthsIn(start, end) {
  let n = 0;
  let cursor = start;
  while (cursor <= end && n < 24) {
    n += 1;
    cursor = C.addMonths(start, n);
  }
  return Math.max(n, 1);
}

/** The SOS screen for a customer and month: agreed services per outlet with what was entered. */
/**
 * Group based contracts billed under these companies (the contract's main company holds the SOS of
 * all its ticked companies): company_id -> { group, companies: [names] }.
 */
async function groupBillingFor(db, companyIds) {
  const out = new Map();
  if (!companyIds.length) return out;
  const [rows] = await db.query(
    `SELECT bc.company_id, TRIM(g.name) AS group_name, TRIM(co.name) AS company
       FROM billing_contracts bc
       JOIN group_name g ON g.id = bc.group_id
       JOIN billing_contract_companies cc ON cc.contract_id = bc.id
       JOIN companies co ON co.id = cc.company_id
      WHERE bc.contract_kind = 'GROUP' AND bc.status = 'ACTIVE' AND bc.company_id IN (?)
      ORDER BY co.name`,
    [companyIds]
  );
  for (const r of rows) {
    const e = out.get(r.company_id) || { group: r.group_name, companies: [] };
    if (!e.companies.includes(r.company)) e.companies.push(r.company);
    out.set(r.company_id, e);
  }
  return out;
}

async function sosView(db, companyId, month) {
  const m = monthStart(month);
  const [[company]] = await db.query(
    `SELECT c.id, c.name, g.name AS group_name, bp.bill_by_day FROM companies c
       LEFT JOIN group_name g ON g.id = c.group_id LEFT JOIN billing_profiles bp ON bp.company_id = c.id WHERE c.id = ?`,
    [companyId]
  );
  if (!company) throw C.notFound("Customer not found");
  const so = await sosRow(db, companyId, m);
  const saved = await savedLines(db, so?.id);
  const agreed = await agreedLines(db, companyId, m);
  const submitted = so?.status === "SUBMITTED";

  // Submitted: exactly what was sent. Otherwise: the agreement with anything typed so far.
  let lines;
  if (submitted) {
    lines = saved.map((l) => {
      // agreed lines keep no rate on the SOS: the price and billing type come from the agreement
      const a = l.is_extra ? null : agreed.find((x) => x.contract_line_id === l.contract_line_id);
      return {
        contract_line_id: l.contract_line_id, contract_id: l.contract_id, site_id: l.site_id, site: l.site || null, service: l.service,
        assigned: Number(l.assigned), completed: l.completed === null ? null : Number(l.completed), is_extra: Boolean(l.is_extra),
        rate: l.rate !== null ? Number(l.rate) : a ? a.rate : null, remarks: l.remarks || "", structure: a ? a.structure : null,
      };
    });
    // Lines added to the agreement after the SOS was submitted: shown as not entered (the Bill Run
    // takes them as assigned, nothing completed) until the SOS is reopened and they are filled in.
    for (const a of agreed.filter((x) => !saved.some((s) => s.contract_line_id === x.contract_line_id))) {
      lines.push({
        contract_line_id: a.contract_line_id, contract_id: a.contract_id, site_id: a.site_id, site: a.site, service: a.service,
        assigned: a.per_month, completed: null, is_extra: false, rate: a.rate, remarks: "", structure: a.structure, added_later: true,
      });
    }
  } else {
    lines = agreed.map((a) => {
      const s = saved.find((x) => x.contract_line_id === a.contract_line_id);
      return {
        contract_line_id: a.contract_line_id, contract_id: a.contract_id, site_id: a.site_id, site: a.site, service: a.service,
        assigned: a.per_month, completed: s && s.completed !== null ? Number(s.completed) : null, is_extra: false,
        rate: a.rate, remarks: s?.remarks || "", structure: a.structure,
      };
    });
    for (const s of saved.filter((x) => x.is_extra)) {
      lines.push({
        contract_line_id: null, contract_id: s.contract_id, site_id: s.site_id, site: s.site || null, service: s.service,
        assigned: 0, completed: s.completed === null ? null : Number(s.completed), is_extra: true,
        rate: s.rate === null ? null : Number(s.rate), remarks: s.remarks || "",
      });
    }
  }

  const [sites] = await db.query(`SELECT id, name FROM sites
      WHERE company_id = ?
         OR company_id IN (SELECT cc.company_id FROM billing_contract_companies cc JOIN billing_contracts bc ON bc.id = cc.contract_id
                            WHERE bc.company_id = ? AND bc.status = 'ACTIVE') ORDER BY name`, [companyId, companyId]);
  const invoiced = so ? await invoicedFor(db, companyId, m) : [];
  const billingGroup = (await groupBillingFor(db, [companyId])).get(companyId) || null;
  const agreedLinesCount = lines.filter((l) => !l.is_extra).length;
  return {
    company_id: company.id,
    customer: company.name,
    group: company.group_name || null,
    // group based contract: shown as the group, its companies are the lines
    billing_group: billingGroup,
    bill_by_day: company.bill_by_day === null ? null : Number(company.bill_by_day),
    month: m,
    status: so ? so.status : "NOT_STARTED",
    notes: so?.notes || "",
    submitted_at: so?.submitted_at || null,
    submitted_by: so?.submitted_by_name || null,
    reopened_at: so?.reopened_at || null,
    reopened_by: so?.reopened_by_name || null,
    reopen_reason: so?.reopen_reason || null,
    invoiced,
    has_agreement: agreed.length > 0 || submitted,
    structures: [...new Set(agreed.map((a) => a.structure))],
    outlets: sites.map((s) => ({ site_id: s.id, name: s.name })),
    lines,
    totals: {
      assigned: lines.filter((l) => !l.is_extra).reduce((t, l) => t + l.assigned, 0),
      completed: lines.filter((l) => !l.is_extra).reduce((t, l) => t + (l.completed || 0), 0),
      extra: lines.filter((l) => l.is_extra).reduce((t, l) => t + (l.completed || 0), 0),
      not_entered: lines.filter((l) => !l.is_extra && l.completed === null).length,
      lines: agreedLinesCount,
    },
  };
}

/** The profile rate for an extra service: same outlet and service, else the same service anywhere. */
function rateFor(agreed, siteId, service) {
  const same = agreed.filter((a) => norm(a.service) === norm(service));
  const hit = same.find((a) => (a.site_id || null) === (siteId || null)) || same.find((a) => !a.site_id) || same[0];
  if (hit) return { rate: hit.rate, contract_id: hit.contract_id };
  // Not priced: billed on the contract that has services at that outlet (else the first), rate by Accounts.
  const home = agreed.find((a) => (a.site_id || null) === (siteId || null)) || agreed[0];
  return { rate: null, contract_id: home ? home.contract_id : null };
}

/**
 * Saves the SOS (and submits it when `submit`). body: { notes, lines: [{ contract_line_id, completed, remarks }],
 * extras: [{ site_id, service, completed, remarks }] }.
 */
async function saveSos(conn, req, companyId, month, body, { submit = false } = {}) {
  const m = monthStart(month);
  if (m > monthStart(C.todayIst())) throw C.bad("An SOS can be made up to the current month");
  const [[company]] = await conn.query("SELECT id, name FROM companies WHERE id = ?", [companyId]);
  if (!company) throw C.notFound("Customer not found");
  let so = await sosRow(conn, companyId, m, { lock: true });
  if (so?.status === "SUBMITTED") throw C.bad("This SOS is submitted. Reopen it to change it.");

  const agreed = await agreedLines(conn, companyId, m);
  if (!agreed.length) throw C.bad(`${company.name} has no services billed per service for ${C.monthName(m)} in its billing profile`);
  const [siteRows] = await conn.query(`SELECT id, name FROM sites
      WHERE company_id = ?
         OR company_id IN (SELECT cc.company_id FROM billing_contract_companies cc JOIN billing_contracts bc ON bc.id = cc.contract_id
                            WHERE bc.company_id = ? AND bc.status = 'ACTIVE')`, [companyId, companyId]);
  const sites = new Set(siteRows.map((s) => s.id));

  const given = new Map((Array.isArray(body.lines) ? body.lines : []).map((l) => [String(l?.contract_line_id || ""), l]));
  const rows = agreed.map((a, i) => {
    const g = given.get(a.contract_line_id) || {};
    const completed = C.num(g.completed, `${a.service}${a.site ? ` (${a.site})` : ""}: completed`, { integer: true, min: 0, max: 999 });
    if (submit && completed === null) throw C.bad(`Enter completed for ${a.service}${a.site ? ` at ${a.site}` : ""}`);
    return {
      contract_line_id: a.contract_line_id, contract_id: a.contract_id, site_id: a.site_id, service: a.service,
      assigned: a.per_month, completed, is_extra: 0, rate: null, remarks: C.str(g.remarks, "remarks", { max: 255 }), sort_order: i,
    };
  });
  const extras = (Array.isArray(body.extras) ? body.extras : []).map((x, i) => {
    const service = C.str(x?.service, `Extra service ${i + 1}`, { required: true, max: 255 });
    const siteId = C.str(x?.site_id, `Extra service ${i + 1}: outlet`, { max: 20 });
    if (siteId && !sites.has(siteId)) throw C.bad("An extra service is for an outlet of another customer");
    const completed = C.num(x?.completed, `Extra ${service}: how many`, { required: true, integer: true, min: 1, max: 999 });
    const priced = rateFor(agreed, siteId, service);
    return {
      contract_line_id: null, contract_id: priced.contract_id, site_id: siteId, service, assigned: 0, completed,
      is_extra: 1, rate: priced.rate, remarks: C.str(x?.remarks, "remarks", { max: 255 }), sort_order: 1000 + i,
    };
  });
  const notes = C.str(body.notes, "notes", { max: 1000 });

  if (!so) {
    const id = uuid();
    await conn.query("INSERT INTO billing_sos (id, company_id, month, status, notes, created_by, updated_by) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)", [id, companyId, m, notes, req.user.id, req.user.id]);
    so = { id };
  } else {
    await conn.query("UPDATE billing_sos SET notes = ?, updated_by = ? WHERE id = ?", [notes, req.user.id, so.id]);
  }
  await conn.query("DELETE FROM billing_sos_lines WHERE sos_id = ?", [so.id]);
  for (const r of [...rows, ...extras]) {
    await conn.query(
      `INSERT INTO billing_sos_lines (id, sos_id, contract_line_id, contract_id, site_id, service, assigned, completed, is_extra, rate, remarks, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), so.id, r.contract_line_id, r.contract_id, r.site_id, r.service, r.assigned, r.completed, r.is_extra, r.rate, r.remarks, r.sort_order]
    );
  }
  if (submit) {
    await conn.query("UPDATE billing_sos SET status = 'SUBMITTED', submitted_by = ?, submitted_at = NOW() WHERE id = ?", [req.user.id, so.id]);
    const done = rows.reduce((t, r) => t + r.completed, 0);
    const assigned = rows.reduce((t, r) => t + r.assigned, 0);
    const extra = extras.reduce((t, r) => t + r.completed, 0);
    await logAudit(conn, req, {
      module: "BILLING", action: "SOS_SUBMITTED", entity_type: "BILLING_SOS", entity_id: so.id,
      entity_label: `${company.name} ${C.monthName(m)}`, customer_id: companyId,
      summary: `SOS ${C.monthName(m)} submitted: ${done} of ${assigned} completed${extra ? `, ${extra} extra` : ""}`,
    });
    return { id: so.id, submitted: true, summary: { assigned, completed: done, extra }, customer: company.name, company_id: company.id, month: m };
  }
  return { id: so.id, submitted: false };
}

/** Tells Accounts that an SOS arrived (after the transaction). */
async function notifyAccounts(db, result) {
  try {
    const [users] = await db.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (?) AND (u.is_active IS NULL OR u.is_active = 1)",
      [ACCOUNTS_ROLES]
    );
    if (!users.length) return;
    const s = result.summary;
    await notifyUsers(users.map((u) => u.id), {
      type: "SOS_SUBMITTED",
      title: `SOS received: ${result.customer}`,
      message: `${C.monthName(result.month)}: ${s.completed} of ${s.assigned} services completed${s.extra ? `, ${s.extra} extra` : ""}. Ready for the Bill Run.`,
      entityType: "billing_sos",
      entityId: result.company_id ? `${result.company_id}:${String(result.month).slice(0, 7)}` : result.id,
    });
  } catch (err) {
    console.error("SOS notification failed:", err.message);
  }
}

/**
 * Reopens a submitted SOS (Service Coordinator to correct it, or Accounts sending it back).
 * Removes the drafts made from it; refused once the month is invoiced.
 */
async function reopenSos(conn, req, companyId, month, reason) {
  const m = monthStart(month);
  const so = await sosRow(conn, companyId, m, { lock: true });
  if (!so) throw C.notFound("No SOS for this month");
  if (so.status !== "SUBMITTED") throw C.bad("This SOS is not submitted");
  const invoiced = await invoicedFor(conn, companyId, m);
  if (invoiced.length) throw C.bad(`${C.monthName(m)} is already invoiced (${invoiced.join(", ")}). Cancel the invoice first to change the SOS.`);

  // Drafts that used this month are removed: the Bill Run makes them again from the corrected SOS.
  const [drafts] = await conn.query(
    `SELECT id, DATE_FORMAT(period_start, '%Y-%m-%d') AS ps, DATE_FORMAT(period_end, '%Y-%m-%d') AS pe
       FROM billing_invoices WHERE company_id = ? AND status = 'DRAFT' AND period_start IS NOT NULL FOR UPDATE`,
    [companyId]
  );
  const stale = drafts.filter((d) => monthStarts(d.ps, monthsIn(d.ps, d.pe)).includes(m)).map((d) => d.id);
  if (stale.length) await conn.query("DELETE FROM billing_invoices WHERE id IN (?) AND status = 'DRAFT'", [stale]);

  await conn.query(
    "UPDATE billing_sos SET status = 'DRAFT', reopened_by = ?, reopened_at = NOW(), reopen_reason = ?, updated_by = ? WHERE id = ?",
    [req.user.id, reason, req.user.id, so.id]
  );
  await logAudit(conn, req, {
    module: "BILLING", action: "SOS_REOPENED", entity_type: "BILLING_SOS", entity_id: so.id,
    entity_label: `${companyId} ${C.monthName(m)}`, customer_id: companyId,
    summary: `SOS ${C.monthName(m)} reopened${stale.length ? `, ${stale.length} draft invoice(s) removed` : ""}`, reason,
  });
  return { id: so.id, drafts_removed: stale.length, submitted_by: so.submitted_by };
}

/**
 * Tells Accounts that the Service Coordinator reopened a submitted SOS to correct it (after the
 * transaction), with the reason and how many draft invoices were removed. Not sent when Accounts
 * themselves sent it back. entity_id "<companyId>:<YYYY-MM>" opens that SOS from the notification.
 */
async function notifyReopened(db, { companyId, companyName, month, byUserId, byName, reason, draftsRemoved }) {
  try {
    const [users] = await db.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN (?) AND (u.is_active IS NULL OR u.is_active = 1) AND u.id <> ?",
      [ACCOUNTS_ROLES, byUserId]
    );
    if (!users.length) return;
    await notifyUsers(users.map((u) => u.id), {
      type: "SOS_REOPENED",
      title: `SOS reopened: ${companyName}`,
      message: `${C.monthName(month)} reopened by ${byName || "the Service Coordinator"} to correct${reason ? `: ${reason}` : ""}.` +
        (draftsRemoved ? ` ${draftsRemoved} draft invoice${draftsRemoved === 1 ? " was" : "s were"} removed - it comes back in the Bill Run once the SOS is submitted again.` : " Wait for it to be submitted again before billing."),
      entityType: "billing_sos",
      entityId: `${companyId}:${String(month).slice(0, 7)}`,
    });
  } catch (err) {
    console.error("SOS notification failed:", err.message);
  }
}

/** Tells the coordinator who submitted it that Accounts sent the SOS back (after the transaction). */
async function notifySentBack(companyName, month, submittedBy, byUserId, reason, companyId = null) {
  if (!submittedBy || Number(submittedBy) === Number(byUserId)) return;
  try {
    await notifyUsers([submittedBy], {
      type: "SOS_SENT_BACK",
      title: `SOS sent back: ${companyName}`,
      message: `${C.monthName(month)} needs a correction${reason ? `: ${reason}` : ""}. Open it in Monthly SOS, correct and submit again.`,
      entityType: "billing_sos",
      entityId: companyId ? `${companyId}:${String(month).slice(0, 7)}` : null,
    });
  } catch (err) {
    console.error("SOS notification failed:", err.message);
  }
}

/** Submitted SOS lines of a customer for these months (for billing): Map month -> lines. */
async function submittedFor(db, companyId, months) {
  const out = new Map();
  if (!months.length) return out;
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(so.month, '%Y-%m-%d') AS month, so.submitted_at, l.*
       FROM billing_sos so JOIN billing_sos_lines l ON l.sos_id = so.id
      WHERE so.company_id = ? AND so.status = 'SUBMITTED' AND so.month IN (?)`,
    [companyId, months]
  );
  const [subs] = await db.query("SELECT DATE_FORMAT(month, '%Y-%m-%d') AS month FROM billing_sos WHERE company_id = ? AND status = 'SUBMITTED' AND month IN (?)", [companyId, months]);
  for (const s of subs) out.set(s.month, []);
  for (const r of rows) out.get(r.month)?.push(r);
  return out;
}

/** Month overview: every customer with services to report, and where its SOS stands. */
async function monthOverview(db, month, { q = null, groupId = null, companyIds = [] } = {}) {
  const m = monthStart(month);
  const end = C.monthRange(m.slice(0, 7)).end;
  const [rows] = await db.query(
    `SELECT c.id AS company_id, c.name, g.name AS group_name, bp.bill_by_day,
            COUNT(DISTINCT l.id) AS services, COUNT(DISTINCT l.site_id) AS outlets, COALESCE(SUM(l.default_qty), 0) AS assigned,
            so.id AS sos_id, so.status, so.submitted_at, su.name AS submitted_by,
            (SELECT GROUP_CONCAT(s2.name ORDER BY s2.name SEPARATOR ', ') FROM sites s2 WHERE s2.company_id = c.id) AS outlet_names,
            (SELECT COALESCE(SUM(sl.completed), 0) FROM billing_sos_lines sl WHERE sl.sos_id = so.id AND sl.is_extra = 0) AS completed,
            (SELECT COALESCE(SUM(sl.completed), 0) FROM billing_sos_lines sl WHERE sl.sos_id = so.id AND sl.is_extra = 1) AS extra
       FROM billing_contract_lines l
       JOIN billing_contracts bc ON bc.id = l.contract_id
       JOIN companies c ON c.id = bc.company_id
       LEFT JOIN group_name g ON g.id = c.group_id
       LEFT JOIN billing_profiles bp ON bp.company_id = c.id
       LEFT JOIN billing_sos so ON so.company_id = c.id AND so.month = ?
       LEFT JOIN users su ON su.id = so.submitted_by
      WHERE bc.status = 'ACTIVE' AND bc.start_date <= ? AND (bc.end_date IS NULL OR bc.end_date >= ?)
        AND l.is_active = 1 AND l.item_kind = 'SERVICE' AND l.pricing_basis = 'PER_SERVICE'
        AND l.effective_from <= ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
        AND (? IS NULL OR c.group_id = ?)
        ${companyIds.length ? "AND c.id IN (?)" : ""}
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR g.name LIKE CONCAT('%', ?, '%'))
      GROUP BY c.id, c.name, g.name, bp.bill_by_day, so.id, so.status, so.submitted_at, su.name
      ORDER BY c.name`,
    [m, end, m, end, m, groupId, groupId, ...(companyIds.length ? [companyIds] : []), q, q, q]
  );
  const groups = await groupBillingFor(db, rows.map((r) => r.company_id));
  const list = rows.map((r) => ({
    company_id: r.company_id,
    customer: r.name,
    group: r.group_name || null,
    billing_group: groups.get(r.company_id) || null,
    bill_by_day: r.bill_by_day === null ? null : Number(r.bill_by_day),
    services: Number(r.services),
    outlets: Number(r.outlets),
    outlet_names: r.outlet_names || "",
    assigned: Number(r.assigned),
    completed: r.sos_id ? Number(r.completed) : null,
    extra: r.sos_id ? Number(r.extra) : 0,
    status: r.sos_id ? r.status : "NOT_STARTED",
    submitted_at: r.submitted_at || null,
    submitted_by: r.submitted_by || null,
  }));
  const submitted = list.filter((r) => r.status === "SUBMITTED");
  return {
    month: m,
    rows: list,
    summary: {
      customers: list.length,
      submitted: submitted.length,
      draft: list.filter((r) => r.status === "DRAFT").length,
      not_started: list.filter((r) => r.status === "NOT_STARTED").length,
      assigned: submitted.reduce((t, r) => t + r.assigned, 0),
      completed: submitted.reduce((t, r) => t + (r.completed || 0), 0),
      extra: submitted.reduce((t, r) => t + r.extra, 0),
    },
  };
}

module.exports = {
  monthStart, monthStarts, monthsIn, agreedLines, sosView, saveSos, notifyAccounts, reopenSos, notifySentBack, notifyReopened,
  submittedFor, monthOverview, invoicedFor,
};
