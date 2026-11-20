// Bill Run and draft invoices: which contracts are due, building the draft lines from the price
// list and the services done, saving edits, and the checks shown before an invoice is issued.

const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const C = require("./common");
const calc = require("./calc");
const P = require("./period");
const T = require("./tracker.service");
const S = require("./sos.service");

const BASES = ["FIXED", "PER_SERVICE", "PER_UNIT"];
const norm = (v) => String(v || "").trim().toLowerCase();

// ---- loading ---------------------------------------------------------------------------------

function contractRow(r) {
  if (!r) return null;
  return {
    ...r,
    start_date: C.ymd(r.start_date),
    end_date: C.ymd(r.end_date),
    next_period_start: C.ymd(r.next_period_start),
    frequency_months: r.frequency_months === null ? null : Number(r.frequency_months),
    cycle_start_day: Number(r.cycle_start_day),
    po_required: Boolean(r.po_required),
  };
}

async function loadContract(db, id, { lock = false } = {}) {
  const [[row]] = await db.query(`SELECT * FROM billing_contracts WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
  return contractRow(row);
}

/** Price lines of a contract in force on `onDate`. */
async function linesInForce(db, contractId, onDate) {
  const [rows] = await db.query(
    `SELECT l.*, s.name AS site
       FROM billing_contract_lines l
       LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.contract_id = ? AND l.effective_from <= ? AND (l.effective_to IS NULL OR l.effective_to >= ?)
      ORDER BY l.sort_order, l.created_at`,
    [contractId, onDate, onDate]
  );
  return rows;
}

/**
 * The customer, its billing profile and its category (COMMERCIAL / RESIDENTIAL / null).
 * A group based contract is billed to the group's Bill To (billing name, address, GSTIN, state,
 * payment terms); the main company still gives the category and the print copies.
 */
async function customerContext(db, companyId, contract = null) {
  const [[company]] = await db.query("SELECT id, name, type, gst_number, tds_applicable, tds_rate FROM companies WHERE id = ?", [companyId]);
  const [[profile]] = await db.query("SELECT * FROM billing_profiles WHERE company_id = ?", [companyId]);
  if (contract && contract.contract_kind === "GROUP" && contract.group_id) {
    const [[gp]] = await db.query("SELECT * FROM billing_group_profiles WHERE group_id = ? AND is_active = 1", [contract.group_id]);
    const billTo = gp
      ? {
        ...(profile || {}), billing_name: gp.billing_name, billing_address: gp.billing_address, state_code: gp.state_code, state_name: gp.state_name,
        payment_terms_days: gp.payment_terms_days, is_active: 1, print_copies: profile?.print_copies || 1,
      }
      : null;
    return { company: company ? { ...company, gst_number: gp ? gp.gst_number : company.gst_number } : null, profile: billTo, category: calc.categoryOf(company?.type) };
  }
  return { company: company || null, profile: profile && profile.is_active ? profile : null, category: calc.categoryOf(company?.type) };
}

/** Active POs of the customer usable for `period` (for this contract or not tied to one). */
async function validPos(db, contract, period) {
  const [rows] = await db.query(
    `SELECT * FROM customer_pos
      WHERE company_id = ? AND status = 'ACTIVE'
        AND (contract_id IS NULL OR contract_id = ?)
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (expiry_date IS NULL OR expiry_date >= ?)
      ORDER BY (contract_id IS NULL), po_date DESC`,
    [contract.company_id, contract.id, period.end, period.start]
  );
  return rows;
}

/** Description from the contract template: {month}, {period}, {from_month}, {to_month}. */
function describe(template, period) {
  return String(template || "")
    .replace(/\{month\}/g, C.monthName(period.start))
    .replace(/\{period\}/g, period.start === period.end ? C.dmy(period.start) : `${C.dmy(period.start)} to ${C.dmy(period.end)}`)
    .replace(/\{from_month\}/g, C.monthName(period.start))
    .replace(/\{to_month\}/g, C.monthName(period.end))
    .slice(0, 1000);
}

// ---- building lines ---------------------------------------------------------------------------

/** A counted service: billed per service, numbers from the Service Coordinator's monthly SOS. */
const isCounted = (cl) => (cl.item_kind || "SERVICE") === "SERVICE" && cl.pricing_basis === "PER_SERVICE";

/**
 * Draft lines for a contract and period, from the customer's billing profile and the submitted SOS
 * of the calendar months the period uses (a monthly period uses the month it starts in; a
 * quarterly one its three months).
 *   counted service (PER_SERVICE)  assigned = services per month agreed (as on the SOS),
 *                                  completed = the SOS number;
 *                                  quantity  = assigned on a Fixed amount contract,
 *                                              completed on a Service based contract
 *   extra services (SOS)           one line per outlet + service at the profile rate (no rate =
 *                                  0, entered by Accounts on the draft before issuing)
 *   FIXED                          the amount as it is
 *   PER_UNIT                       quantity = default quantity (chemicals, termite area), entered
 *                                  on the draft when there is none
 * Returns { lines, sosMissing: [months without a submitted SOS], counted: true when the contract
 * has counted services }.
 */
async function buildLines(db, contract, period, contractLines) {
  const months = T.monthsCount(period.start, period.end);
  const monthList = S.monthStarts(period.start, months);
  const counted = contractLines.some(isCounted);
  const sos = counted ? await S.submittedFor(db, contract.company_id, monthList) : new Map();
  const sosMissing = counted ? monthList.filter((m) => !sos.has(m)) : [];
  const sosLines = [...sos.values()].flat().filter((l) => l.kind !== "AREA");
  const fixed = contract.shortfall_billing === "FULL";

  // Termite: the treated area of this period comes from the SOS of the month that bills it.
  const hasArea = contractLines.some((cl) => S.isAreaLine(contract, cl));
  const areaMonth = hasArea ? `${S.billMonthOf(contract, period)}-01` : null;
  const areaSos = hasArea ? await S.submittedFor(db, contract.company_id, [areaMonth]) : new Map();
  if (hasArea && !areaSos.has(areaMonth) && !sosMissing.includes(areaMonth)) sosMissing.push(areaMonth);

  const lines = contractLines.map((cl, i) => {
    let quantity = cl.default_qty === null ? null : Number(cl.default_qty);
    let planned = null;
    let done = null;
    let needsInput = false;
    if (S.isAreaLine(contract, cl)) {
      // quantity = the area the Service Coordinator entered for this period; none yet: entered on the draft
      const row = (areaSos.get(areaMonth) || []).find((x) => x.kind === "AREA" && x.contract_line_id === cl.id && C.ymd(x.period_start) === period.start);
      quantity = row && row.area !== null ? Number(row.area) : 0;
      if (!row || row.area === null) needsInput = true;
    } else if (isCounted(cl)) {
      // Each month: the SOS line for this agreed service (assigned as agreed if it is missing).
      planned = 0;
      done = 0;
      for (const m of monthList) {
        const s = (sos.get(m) || []).find((x) => x.contract_line_id === cl.id);
        planned += s ? Number(s.assigned) : Number(cl.default_qty) || 0;
        done += s && s.completed !== null ? Number(s.completed) : 0;
      }
      quantity = fixed ? planned : done;
    } else if (cl.pricing_basis === "FIXED") {
      quantity = quantity || 1;
    } else if (quantity === null || quantity === 0) {
      quantity = 0;
      needsInput = true;
    }
    const line = {
      contract_line_id: cl.id,
      site_id: cl.site_id,
      site: cl.site || null,
      item_name: cl.item_name,
      invoice_group: cl.invoice_group || null,
      sac_code: cl.sac_code,
      unit: cl.unit,
      pricing_basis: cl.pricing_basis,
      rate: Number(cl.rate),
      quantity,
      adjustment_type: "NONE",
      services_planned: planned,
      services_done: done,
      missed_dates: null,
      job_ids: null,
      needs_input: needsInput,
      sort_order: i,
    };
    line.amount = calc.lineAmount(line);
    return line;
  });

  // Extra services from the SOS that this contract bills, one line per outlet + service + rate.
  const extras = new Map();
  for (const x of sosLines.filter((l) => Number(l.is_extra) === 1 && l.contract_id === contract.id)) {
    const rate = x.rate === null ? null : Number(x.rate);
    const key = `${x.site_id || ""}|${norm(x.service)}|${rate ?? "-"}`;
    const e = extras.get(key) || { site_id: x.site_id, service: x.service, rate, quantity: 0 };
    e.quantity += Number(x.completed) || 0;
    extras.set(key, e);
  }
  const [siteNames] = extras.size
    ? await db.query("SELECT id, name FROM sites WHERE id IN (?)", [[...new Set([...extras.values()].map((e) => e.site_id).filter(Boolean)), "-"]])
    : [[]];
  for (const e of extras.values()) {
    const line = {
      contract_line_id: null,
      site_id: e.site_id,
      site: siteNames.find((s) => s.id === e.site_id)?.name || null,
      item_name: `${e.service} (additional services)`,
      invoice_group: null,
      sac_code: "998531",
      unit: "Service",
      pricing_basis: "PER_SERVICE",
      rate: e.rate ?? 0,
      quantity: e.quantity,
      adjustment_type: "NONE",
      services_planned: null,
      services_done: null,
      missed_dates: null,
      job_ids: null,
      needs_input: e.rate === null,
      sort_order: lines.length,
    };
    line.amount = calc.lineAmount(line);
    lines.push(line);
  }
  return { lines, sosMissing, counted };
}

// ---- Bill Run: due list --------------------------------------------------------------------

/**
 * The periods of a contract to bill in the month ending `monthEnd`.
 *   monthly            its next period, when due (as always)
 *   weekly / daily     every period due by the month end that has no invoice yet (drafted or issued;
 *   (Termite)          a cancelled one is billed again) - one invoice each
 * Returns { periods: [...to draft], drafted: periods already drafted (not issued) }.
 */
async function periodsToBill(db, contract, monthEnd) {
  if (!P.isShortPeriod(contract)) {
    const period = P.nextPeriod(contract);
    return { periods: P.isDue(contract, period, monthEnd) ? [period] : [], drafted: [] };
  }
  const due = P.duePeriods(contract, monthEnd);
  if (!due.length) return { periods: [], drafted: [] };
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start, status FROM billing_invoices
      WHERE contract_id = ? AND status <> 'CANCELLED' AND period_start IN (?)`,
    [contract.id, due.map((p) => p.start)]
  );
  const taken = new Map(rows.map((r) => [r.period_start, r.status]));
  return {
    periods: due.filter((p) => !taken.has(p.start)),
    drafted: due.filter((p) => taken.get(p.start) === "DRAFT"),
  };
}

/** Contracts due in `month` with their period, services, estimate and warnings. */
async function dueList(db, month, { type = null, category = null, q = null } = {}) {
  const range = C.monthRange(month);
  const [contracts] = await db.query(
    `SELECT bc.*, c.name AS customer, IF(bc.contract_kind = 'GROUP', TRIM(g.name), NULL) AS billing_group
       FROM billing_contracts bc
       JOIN companies c ON c.id = bc.company_id
       LEFT JOIN group_name g ON g.id = bc.group_id
      WHERE bc.status = 'ACTIVE' AND bc.next_period_start <= ?
        AND (? IS NULL OR bc.billing_type = ?)
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR bc.contract_code LIKE CONCAT('%', ?, '%')
             OR (bc.contract_kind = 'GROUP' AND g.name LIKE CONCAT('%', ?, '%')))
      ORDER BY COALESCE(IF(bc.contract_kind = 'GROUP', g.name, NULL), c.name), bc.contract_code`,
    [range.end, type, type, q, q, q, q]
  );
  // Group based contracts: the ticked companies (shown under the group name, matched by the customer filter).
  const groupIds = contracts.filter((c) => c.contract_kind === "GROUP").map((c) => c.id);
  const groupCompanies = new Map();
  if (groupIds.length) {
    const [gc] = await db.query(
      `SELECT cc.contract_id, cc.company_id, TRIM(co.name) AS name FROM billing_contract_companies cc
         JOIN companies co ON co.id = cc.company_id WHERE cc.contract_id IN (?) ORDER BY co.name`,
      [groupIds]
    );
    for (const r of gc) {
      if (!groupCompanies.has(r.contract_id)) groupCompanies.set(r.contract_id, []);
      groupCompanies.get(r.contract_id).push({ company_id: r.company_id, name: r.name });
    }
  }

  const rows = [];
  for (const raw of contracts) {
    const contract = contractRow(raw);
    const short = P.isShortPeriod(contract);
    let period;
    let toBill = [];
    let existingDrafts = 0;
    if (short) {
      // weekly / daily Termite: one row for all its periods due this month (one invoice each)
      const { periods, drafted } = await periodsToBill(db, contract, range.end);
      if (!periods.length && !drafted.length) continue;
      const all = [...periods, ...drafted].sort((a, b) => (a.start < b.start ? -1 : 1));
      period = { start: all[0].start, end: all[all.length - 1].end };
      toBill = periods;
      existingDrafts = periods.length ? 0 : drafted.length;
    } else {
      period = P.nextPeriod(contract);
      if (!P.isDue(contract, period, range.end)) continue;
    }
    const ctx = await customerContext(db, contract.company_id, contract);
    if (category && ctx.category !== category) continue;

    if (!short) {
      const [[existing]] = await db.query(
        "SELECT COUNT(*) AS drafts FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'DRAFT'",
        [contract.id, period.start]
      );
      existingDrafts = Number(existing.drafts);
    }
    const cl = await linesInForce(db, contract.id, period.start);
    const taxMode = calc.taxModeFor(ctx.category, ctx.profile?.state_code, contract.gst_applicable !== 0);
    let lines;
    let sosMissing;
    let totals;
    if (short && toBill.length > 1) {
      // the estimate is every period's invoice added up
      lines = [];
      sosMissing = [];
      totals = { total: 0 };
      for (const p of toBill) {
        const built = await buildLines(db, contract, p, await linesInForce(db, contract.id, p.start));
        lines.push(...built.lines);
        sosMissing.push(...built.sosMissing.filter((m) => !sosMissing.includes(m)));
        totals.total = calc.round2(totals.total + calc.totalsFor(built.lines, taxMode, contract.gst_rate).total);
      }
    } else {
      ({ lines, sosMissing } = await buildLines(db, contract, toBill[0] || period, cl));
      totals = calc.totalsFor(lines, taxMode, contract.gst_rate);
    }
    const linked = lines.filter((l) => l.services_planned !== null);
    const planned = linked.reduce((t, l) => t + l.services_planned, 0);
    const done = linked.reduce((t, l) => t + Math.min(l.services_done || 0, l.services_planned), 0);

    const warnings = [];
    const warn = (code, message, blocking = false) => warnings.push({ code, message, blocking });
    if (!ctx.category) warn("CUSTOMER_TYPE_MISSING", "Customer type not set", true);
    if (!ctx.profile) warn("PROFILE_MISSING", "Billing profile missing", true);
    if (!cl.length) warn("NO_PRICE_LINES", "No price lines in force", true);
    // Counted services are billed from the Service Coordinator's submitted SOS: wait for it.
    if (sosMissing.length) warn("SOS_PENDING", `Waiting for SOS: ${sosMissing.map((m) => C.monthName(m)).join(", ")}`, true);
    const extraLines = lines.filter((l) => !l.contract_line_id);
    if (extraLines.length) warn("EXTRA_SERVICES", `${extraLines.reduce((t, l) => t + l.quantity, 0)} extra service(s) on the SOS`);
    if (extraLines.some((l) => l.needs_input)) warn("EXTRA_NO_RATE", "Extra service without a rate in the profile: enter it on the draft");
    if (contract.po_required) {
      const pos = await validPos(db, contract, period);
      if (!pos.length) {
        const [[expired]] = await db.query(
          "SELECT MAX(expiry_date) AS last FROM customer_pos WHERE company_id = ? AND expiry_date < ?",
          [contract.company_id, period.start]
        );
        if (expired?.last) warn("PO_EXPIRED", `PO expired on ${C.dmy(C.ymd(expired.last))}`, true);
        else warn("PO_MISSING", "No valid PO", true);
      }
    }
    if (taxMode !== "NONE" && !ctx.company?.gst_number) warn("GSTIN_MISSING", "GSTIN missing");
    if (planned > done) warn("SERVICE_SHORTFALL", `${planned - done} service${planned - done > 1 ? "s" : ""} not done`);
    if (contract.end_date && contract.end_date <= period.end) warn("CONTRACT_ENDING", "Contract ends in this period");

    rows.push({
      contract_id: contract.id,
      contract_code: contract.contract_code,
      company_id: contract.company_id,
      customer: raw.customer,
      // group based contract: billed in the group's name, its companies are the invoice lines
      billing_group: raw.billing_group ? { group: raw.billing_group, companies: groupCompanies.get(contract.id) || [] } : null,
      category: ctx.category,
      billing_type: contract.billing_type,
      frequency_months: contract.frequency_months,
      frequency_unit: P.unitOf(contract),
      period_start: period.start,
      period_end: period.end,
      // weekly / daily Termite: how many invoices (one per week / day) this row drafts
      periods: short ? toBill.length : 1,
      services: linked.length ? { planned, done, short: Math.max(planned - done, 0) } : null,
      // Termite: priced per sq. ft / sq. m of treated area (PER_SQFT / PER_SQM)
      structure: contract.billing_type === "TERMITE" ? (/ft/i.test(cl.find((x) => S.isAreaLine(contract, x))?.unit || "") ? "PER_SQFT" : "PER_SQM") : contract.shortfall_billing === "FULL" ? "FIXED" : "SERVICE_BASED",
      sos: sosMissing.length ? "PENDING" : cl.some(isCounted) ? "SUBMITTED" : null,
      estimated_total: sosMissing.length || lines.some((l) => l.needs_input) ? null : totals.total,
      needs_input: lines.some((l) => l.needs_input),
      already_drafted: existingDrafts > 0,
      warnings,
      blocking: warnings.some((w) => w.blocking),
    });
  }

  const summary = {
    due: rows.length,
    ready: rows.filter((r) => !r.warnings.length && !r.already_drafted).length,
    with_warnings: rows.filter((r) => r.warnings.length).length,
    already_drafted: rows.filter((r) => r.already_drafted).length,
    estimated_total: calc.round2(rows.reduce((t, r) => t + (r.estimated_total || 0), 0)),
  };
  return { month, summary, rows };
}

// ---- Bill Run: generating drafts ----------------------------------------------------------

const lineColumns = `id, invoice_id, contract_line_id, site_id, item_name, invoice_group, sac_code, unit, pricing_basis, rate, quantity,
  adjustment_type, services_planned, services_done, missed_dates, days_worked, days_in_period, percent, manual_amount,
  adjustment_reason, amount, job_ids, sort_order`;

async function insertLines(conn, invoiceId, lines) {
  for (const [i, l] of lines.entries()) {
    await conn.query(
      `INSERT INTO billing_invoice_lines (${lineColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(), invoiceId, l.contract_line_id || null, l.site_id || null, l.item_name, l.invoice_group || null, l.sac_code || null, l.unit || "nos",
        l.pricing_basis, l.rate, l.quantity, l.adjustment_type || "NONE",
        l.services_planned ?? null, l.services_done ?? null, l.missed_dates ? JSON.stringify(l.missed_dates) : null,
        l.days_worked ?? null, l.days_in_period ?? null, l.percent ?? null, l.manual_amount ?? null,
        l.adjustment_reason || null, l.amount, l.job_ids ? JSON.stringify(l.job_ids) : null, i,
      ]
    );
  }
}

/**
 * Generates the drafts of one contract for the month: its next period (one draft per outlet when
 * the invoice is split), or - weekly / daily Termite - every period due in the month that has no
 * invoice yet, one draft each.
 */
async function draftContract(conn, contractId, month, runId, userId) {
  const contract = await loadContract(conn, contractId, { lock: true });
  if (!contract) throw C.bad("Contract not found");
  if (contract.status !== "ACTIVE") throw C.bad(`Contract is ${contract.status.toLowerCase()}`);
  const { periods } = await periodsToBill(conn, contract, C.monthRange(month).end);
  if (!periods.length) {
    throw P.isShortPeriod(contract) ? C.conflict(`Every ${P.unitOf(contract) === "WEEK" ? "week" : "day"} due this month is already drafted for ${contract.contract_code}`) : C.bad("Nothing is due on this contract for the month");
  }

  const ctx = await customerContext(conn, contract.company_id, contract);
  if (!ctx.company) throw C.bad("Customer not found");
  if (!ctx.category) throw C.bad("Customer type is not set");
  if (!ctx.profile) throw C.bad(contract.contract_kind === "GROUP" ? "The group's billing details (Bill To) are missing" : "Billing profile is missing");

  const drafts = [];
  for (const period of periods) drafts.push(...(await draftPeriod(conn, contract, ctx, period, runId, userId)));
  return drafts;
}

/** The drafts of one period of a contract (one per outlet when the invoice is split). */
async function draftPeriod(conn, contract, ctx, period, runId, userId) {
  const [[existing]] = await conn.query(
    "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status <> 'CANCELLED'",
    [contract.id, period.start]
  );
  if (Number(existing.n)) throw C.conflict(`${P.isShortPeriod(contract) ? C.dmy(period.start) : C.monthName(period.start)} is already drafted for ${contract.contract_code}`);

  const cl = await linesInForce(conn, contract.id, period.start);
  if (!cl.length) throw C.bad("The contract has no price lines in force for this period");
  const { lines, sosMissing } = await buildLines(conn, contract, period, cl);
  if (sosMissing.length) throw C.bad(`Waiting for the Service Coordinator's SOS for ${sosMissing.map((m) => C.monthName(m)).join(", ")}`);

  const split = contract.invoice_grouping === "PER_SITE";
  // Print copies from the customer's billing profile: the outlet's own setting for an invoice made
  // per outlet, else the profile's.
  const [outletCopies] = await conn.query("SELECT site_id, print_copies FROM billing_outlet_settings WHERE company_id = ?", [contract.company_id]);
  const copiesFor = (siteId) => Number(outletCopies.find((o) => o.site_id === siteId)?.print_copies || ctx.profile.print_copies || 1);
  // Separate bills: the service lines and the chemical lines go on two invoices, each with its own
  // description. A line's kind comes from its contract line; SOS extra services are services.
  const byKind = Boolean(contract.separate_bills);
  const kindOf = new Map(cl.map((c) => [c.id, c.item_kind || "SERVICE"]));
  const lineKind = (l) => (l.contract_line_id && kindOf.get(l.contract_line_id)) || "SERVICE";
  const groups = new Map();
  for (const l of lines) {
    const key = `${split ? l.site_id || "" : ""}|${byKind ? lineKind(l) : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  // The invoice is dated the day it is made (it can be changed on the draft). Dating it back to the
  // period end could put it in a GST month whose return is already filed; the description and the
  // period on the invoice still say which months it bills.
  const invoiceDate = C.todayIst();
  const dueDate = C.addDays(invoiceDate, Number(ctx.profile.payment_terms_days) || 0);
  const taxMode = calc.taxModeFor(ctx.category, ctx.profile.state_code, contract.gst_applicable !== 0);
  const pos = contract.po_required ? await validPos(conn, contract, period) : [];
  const poIds = contract.billing_type === "CHEMICAL" ? pos.map((p) => p.id) : pos.slice(0, 1).map((p) => p.id);

  const drafts = [];
  for (const [groupKey, groupLines] of groups) {
    const [siteKey, lineKindKey] = groupKey.split("|");
    const siteId = split && siteKey ? siteKey : contract.invoice_grouping === "PER_SITE" ? contract.site_id : null;
    const template = lineKindKey === "CHEMICAL" && contract.chemical_description_template ? contract.chemical_description_template : contract.description_template;
    // The contract's GST rate is copied onto the draft: changing the contract later leaves it alone.
    const gstRate = calc.gstRateOf(contract.gst_rate);
    const totals = calc.totalsFor(groupLines, taxMode, gstRate);
    const id = uuid();
    await conn.query(
      `INSERT INTO billing_invoices
         (id, contract_id, company_id, site_id, bill_run_id, billing_type, customer_category, tax_mode, gst_rate, place_of_supply,
          ship_to_site_id, period_start, period_end, invoice_date, due_date, subtotal, cgst, sgst, igst, round_off, total,
          print_copies, description, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      [
        id, contract.id, contract.company_id, siteId, runId, contract.billing_type, ctx.category, taxMode, gstRate,
        `${ctx.profile.state_code}-${ctx.profile.state_name}`, siteId || contract.site_id || groupLines.find((l) => l.site_id)?.site_id || null,
        period.start, period.end, invoiceDate, dueDate, totals.subtotal, totals.cgst, totals.sgst, totals.igst, totals.round_off, totals.total,
        copiesFor(siteId), describe(template, period), userId, userId,
      ]
    );
    await insertLines(conn, id, groupLines);
    for (const poId of poIds) await conn.query("INSERT INTO billing_invoice_pos (invoice_id, po_id) VALUES (?, ?)", [id, poId]);
    const short = groupLines.reduce((t, l) => t + (l.services_planned ? Math.max(l.services_planned - (l.services_done || 0), 0) : 0), 0);
    drafts.push({
      id,
      contract_id: contract.id,
      contract_code: contract.contract_code,
      customer: ctx.company.name,
      period_start: period.start,
      period_end: period.end,
      total: groupLines.some((l) => l.needs_input) ? null : totals.total,
      needs_input: groupLines.some((l) => l.needs_input),
      service_shortfall: short,
    });
  }
  return drafts;
}

/** POST /runs: drafts for each selected contract; one failing contract does not stop the others. */
async function generateDrafts(pool, month, contractIds, userId) {
  const runId = uuid();
  await pool.query("INSERT INTO billing_runs (id, period_month, contracts_selected, run_by) VALUES (?, ?, ?, ?)", [runId, month, contractIds.length, userId]);
  const drafts = [];
  const skipped = [];
  for (const contractId of contractIds) {
    try {
      drafts.push(...(await C.inTransaction(pool, (conn) => draftContract(conn, contractId, month, runId, userId))));
    } catch (err) {
      if (!(err instanceof C.HttpError) && err?.code !== "ER_DUP_ENTRY") throw err;
      const [[c]] = await pool.query(
        "SELECT bc.contract_code, c.name AS customer FROM billing_contracts bc JOIN companies c ON c.id = bc.company_id WHERE bc.id = ?",
        [contractId]
      );
      skipped.push({ contract_id: contractId, contract_code: c?.contract_code || null, customer: c?.customer || null, reason: err.code === "ER_DUP_ENTRY" ? "Already drafted for this period" : err.message });
    }
  }
  await pool.query("UPDATE billing_runs SET drafts_created = ?, skipped = ? WHERE id = ?", [drafts.length, JSON.stringify(skipped), runId]);
  return { run_id: runId, drafts, skipped };
}

// ---- one invoice ---------------------------------------------------------------------------

const lineOut = (l) => ({
  id: l.id,
  contract_line_id: l.contract_line_id,
  site_id: l.site_id,
  site: l.site || null,
  item_name: l.item_name,
  invoice_group: l.invoice_group || null,
  sac_code: l.sac_code,
  unit: l.unit,
  pricing_basis: l.pricing_basis,
  rate: Number(l.rate),
  quantity: Number(l.quantity),
  adjustment_type: l.adjustment_type,
  services_planned: C.n2(l.services_planned),
  services_done: C.n2(l.services_done),
  missed_dates: C.json(l.missed_dates, null),
  days_worked: C.n2(l.days_worked),
  days_in_period: C.n2(l.days_in_period),
  percent: C.n2(l.percent),
  manual_amount: C.n2(l.manual_amount),
  adjustment_reason: l.adjustment_reason,
  amount: Number(l.amount),
  job_ids: C.json(l.job_ids, null),
});

/** Full invoice: header, customer, lines, POs (and the customer's other usable POs), advance. */
async function loadInvoice(db, id, { lock = false } = {}) {
  // Lock only the invoice row (not the customer, contract, ... it joins).
  if (lock) await db.query("SELECT id FROM billing_invoices WHERE id = ? FOR UPDATE", [id]);
  const [[inv]] = await db.query(
    `SELECT bi.*, DATE_FORMAT(bi.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_key,
            bc.contract_code, bc.frequency_months, bc.frequency_unit, bc.po_required, bc.bill_timing, bc.shortfall_billing,
            c.name AS customer_name, IF(gp.group_id IS NULL, c.gst_number, gp.gst_number) AS gst_number, c.type AS customer_type,
            COALESCE(gp.billing_name, bp.billing_name) AS billing_name, COALESCE(gp.billing_address, bp.billing_address) AS billing_address,
            COALESCE(gp.state_code, bp.state_code) AS state_code, COALESCE(gp.state_name, bp.state_name) AS state_name,
            bc.contract_kind, bc.group_id AS contract_group_id,
            ss.name AS ship_to_site, ss.address AS ship_to_address, ss.city AS ship_to_city,
            iu.name AS issued_by_name,
            IF(bi.status = 'ISSUED', (CASE WHEN bi.advance_adjusted + (SELECT COALESCE(SUM(bp.amount + bp.tds_amount), 0) FROM billing_invoice_payments bp
                                                                        WHERE bp.billing_invoice_id = bi.id AND bp.deleted_at IS NULL) >= bi.total - 0.005 THEN 'PAID'
                                          WHEN bi.advance_adjusted + (SELECT COALESCE(SUM(bp.amount + bp.tds_amount), 0) FROM billing_invoice_payments bp
                                                                        WHERE bp.billing_invoice_id = bi.id AND bp.deleted_at IS NULL) > 0.005 THEN 'PARTIAL'
                                          ELSE 'PENDING' END), NULL) AS receivable_status
       FROM billing_invoices bi
       JOIN billing_contracts bc ON bc.id = bi.contract_id
       JOIN companies c ON c.id = bi.company_id
       LEFT JOIN billing_profiles bp ON bp.company_id = bi.company_id
       -- a group based contract is billed to the group's Bill To
       LEFT JOIN billing_group_profiles gp ON gp.group_id = bc.group_id AND bc.contract_kind = 'GROUP'
       LEFT JOIN sites ss ON ss.id = bi.ship_to_site_id
       LEFT JOIN users iu ON iu.id = bi.issued_by
      WHERE bi.id = ?`,
    [id]
  );
  if (!inv) throw C.notFound("Invoice not found");
  const [lines] = await db.query(
    `SELECT l.*, s.name AS site FROM billing_invoice_lines l LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.invoice_id = ? ORDER BY l.sort_order`,
    [id]
  );
  const [pos] = await db.query(
    `SELECT po.id, po.po_number, po.po_date, po.expiry_date, po.po_amount, po.po_kind, po.status
       FROM billing_invoice_pos bp JOIN customer_pos po ON po.id = bp.po_id
      WHERE bp.invoice_id = ? ORDER BY po.po_date`,
    [id]
  );
  const period = { start: C.ymd(inv.period_start), end: C.ymd(inv.period_end) };
  const contractish = { id: inv.contract_id, company_id: inv.company_id };
  const available = inv.status === "DRAFT" ? await validPos(db, contractish, period) : [];
  // Print copies as set in the customer's billing profile (the outlet's own, else the profile's).
  const [[copies]] = await db.query(
    `SELECT COALESCE((SELECT os.print_copies FROM billing_outlet_settings os WHERE os.company_id = ? AND os.site_id = ?),
                     (SELECT bp.print_copies FROM billing_profiles bp WHERE bp.company_id = ?)) AS n`,
    [inv.company_id, inv.site_id || "-", inv.company_id]
  );
  const linked = lines.filter((l) => l.services_planned !== null);

  const poOut = (p) => ({
    id: p.id,
    po_number: p.po_number,
    po_date: C.ymd(p.po_date),
    expiry_date: C.ymd(p.expiry_date),
    is_open_po: p.expiry_date === null,
    po_amount: C.n2(p.po_amount),
    kind: p.po_kind,
    status: p.status,
  });

  return {
    id: inv.id,
    status: inv.status,
    invoice_number: inv.invoice_number,
    updated_at: inv.updated_at_key,
    // Changes on every save (line ids are new each time): send it back on PUT to detect edits made meanwhile.
    version: crypto.createHash("sha1").update(`${inv.updated_at_key}|${inv.status}|${lines.map((l) => l.id).join(",")}`).digest("hex").slice(0, 16),
    contract: {
      id: inv.contract_id, contract_code: inv.contract_code, billing_type: inv.billing_type, frequency_months: C.n2(inv.frequency_months),
      frequency_unit: P.unitOf({ billing_type: inv.billing_type, frequency_unit: inv.frequency_unit }), po_required: Boolean(inv.po_required),
      shortfall_billing: inv.shortfall_billing, contract_kind: inv.contract_kind || "SERVICE", group_id: inv.contract_group_id || null,
    },
    customer: { company_id: inv.company_id, name: inv.customer_name, category: inv.customer_category, gst_number: inv.gst_number, state_code: inv.state_code, state_name: inv.state_name },
    bill_to: { name: inv.billing_name || inv.customer_name, address: inv.billing_address || "", gst_number: inv.gst_number, state: inv.state_code ? `${inv.state_code}-${inv.state_name}` : null },
    site_id: inv.site_id,
    ship_to_site_id: inv.ship_to_site_id,
    ship_to: inv.ship_to_site_id ? { name: inv.ship_to_site, address: [inv.ship_to_address, inv.ship_to_city].filter(Boolean).join(", ") } : null,
    period_start: period.start,
    period_end: period.end,
    invoice_date: C.ymd(inv.invoice_date),
    due_date: C.ymd(inv.due_date),
    description: inv.description,
    place_of_supply: inv.place_of_supply,
    service_plan: { print_copies: copies?.n ? Number(copies.n) : Number(inv.print_copies) },
    services: linked.length
      ? { planned: linked.reduce((t, l) => t + Number(l.services_planned), 0), done: linked.reduce((t, l) => t + Math.min(Number(l.services_done || 0), Number(l.services_planned)), 0) }
      : null,
    print_copies: Number(inv.print_copies),
    po_ids: pos.map((p) => p.id),
    pos: pos.map(poOut),
    available_pos: available.map(poOut),
    lines: lines.map(lineOut),
    tax_mode: inv.tax_mode,
    gst_rate: calc.gstRateOf(inv.gst_rate),
    subtotal: Number(inv.subtotal),
    cgst: Number(inv.cgst),
    sgst: Number(inv.sgst),
    igst: Number(inv.igst),
    round_off: Number(inv.round_off),
    total: Number(inv.total),
    amount_in_words: calc.amountInWords(Number(inv.total)),
    advance_adjusted: Number(inv.advance_adjusted),
    receivable_invoice_id: inv.receivable_invoice_id,
    receivable_status: inv.receivable_status || null,
    issued_by: inv.issued_by_name || null,
    issued_at: inv.issued_at,
    cancelled_at: inv.cancelled_at,
    cancel_reason: inv.cancel_reason,
    content: C.json(inv.content, null),
  };
}

// ---- saving a draft --------------------------------------------------------------------------

/** One line from the request, validated. `server` holds the planned/done counts worked out here. */
function readLine(raw, i, server) {
  const at = `Line ${i + 1}`;
  if (!raw || typeof raw !== "object") throw C.bad(`${at} is not valid`);
  const line = {
    contract_line_id: C.str(raw.contract_line_id, `${at}: contract_line_id`, { max: 36 }),
    site_id: C.str(raw.site_id, `${at}: site_id`, { max: 20 }),
    item_name: C.str(raw.item_name, `${at}: item name`, { required: true }),
    invoice_group: C.str(raw.invoice_group, `${at}: invoice line summary`, { max: 255 }),
    sac_code: C.str(raw.sac_code, `${at}: SAC code`, { max: 10 }),
    unit: C.str(raw.unit, `${at}: unit`, { max: 20 }) || "nos",
    pricing_basis: C.oneOf(raw.pricing_basis, `${at}: pricing_basis`, BASES, { fallback: "FIXED" }),
    rate: C.num(raw.rate, `${at}: rate`, { required: true, min: 0, max: 99999999 }),
    quantity: C.num(raw.quantity, `${at}: quantity`, { min: 0, max: 9999999 }) ?? 1,
    adjustment_type: C.oneOf(raw.adjustment_type, `${at}: adjustment_type`, calc.ADJUSTMENTS, { fallback: "NONE" }),
    services_planned: null,
    services_done: null,
    missed_dates: null,
    job_ids: null,
    days_worked: null,
    days_in_period: null,
    percent: null,
    manual_amount: null,
    adjustment_reason: C.str(raw.adjustment_reason ?? raw.bill_full_reason ?? raw.reason, `${at}: reason`),
  };
  const s = line.contract_line_id ? server.get(line.contract_line_id) : null;
  if (s) {
    line.services_planned = s.services_planned;
    line.services_done = s.services_done;
    line.missed_dates = s.missed_dates;
    line.job_ids = s.job_ids;
  }
  switch (line.adjustment_type) {
    case "SERVICES":
      if (!s || !s.services_planned) {
        line.services_planned = C.num(raw.services_planned, `${at}: services_planned`, { required: true, min: 1, max: 999, integer: true });
        line.services_done = C.num(raw.services_done, `${at}: services_done`, { required: true, min: 0, max: 999, integer: true });
      }
      break;
    case "FULL_DESPITE_SHORTFALL":
      if (!line.adjustment_reason) throw C.bad(`${at}: give a reason for billing the full amount`);
      break;
    case "DAYS":
      line.days_in_period = C.num(raw.days_in_period, `${at}: days_in_period`, { required: true, min: 1, max: 366 });
      line.days_worked = C.num(raw.days_worked, `${at}: days_worked`, { required: true, min: 0, max: line.days_in_period });
      break;
    case "PERCENT":
      line.percent = C.num(raw.percent, `${at}: percent`, { required: true, min: 0, max: 100 });
      break;
    case "MANUAL":
      line.manual_amount = C.num(raw.manual_amount, `${at}: manual_amount`, { required: true, min: 0, max: 999999999 });
      if (!line.adjustment_reason) throw C.bad(`${at}: give a reason for the manual amount`);
      break;
    default:
      break;
  }
  line.amount = calc.lineAmount(line);
  return line;
}

/** PUT /invoices/:id: saves a draft and recalculates it. */
async function saveDraft(pool, id, body, userId) {
  await C.inTransaction(pool, async (conn) => {
    const inv = await loadInvoice(conn, id, { lock: true });
    if (inv.status !== "DRAFT") throw C.bad("Only drafts can be changed");
    // `version` (preferred) or `updated_at` is sent back exactly as GET /invoices/:id returned it.
    // updated_at has whole-second precision; version changes on every save.
    if ((body.version && String(body.version) !== inv.version) || (!body.version && body.updated_at && String(body.updated_at) !== inv.updated_at)) {
      throw C.conflict("This draft was changed by someone else. Reload and try again.");
    }
    if (!Array.isArray(body.lines) || !body.lines.length) throw C.bad("Add at least one line");
    if (body.lines.length > 300) throw C.bad("Too many lines for one invoice");

    // Planned / done counts come from the tracker, never from the browser.
    const contract = await loadContract(conn, inv.contract.id);
    const period = { start: inv.period_start, end: inv.period_end };
    const cl = await linesInForce(conn, contract.id, period.start);
    const built = await buildLines(conn, contract, period, cl);
    const server = new Map(built.lines.map((l) => [l.contract_line_id, l]));
    const lines = body.lines.map((raw, i) => readLine(raw, i, server));

    const [contractLineIds] = await conn.query("SELECT id FROM billing_contract_lines WHERE contract_id = ?", [contract.id]);
    const known = new Set(contractLineIds.map((r) => r.id));
    const [siteRows] = await conn.query(
      "SELECT id FROM sites WHERE company_id = ? OR company_id IN (SELECT company_id FROM billing_contract_companies WHERE contract_id = ?)",
      [inv.customer.company_id, inv.contract.id]
    );
    const sites = new Set(siteRows.map((r) => r.id));
    lines.forEach((l, i) => {
      if (l.contract_line_id && !known.has(l.contract_line_id)) throw C.bad(`Line ${i + 1}: the price line is not on this contract`);
      if (l.site_id && !sites.has(l.site_id)) throw C.bad(`Line ${i + 1}: the outlet does not belong to this customer`);
    });

    const invoiceDate = C.date(body.invoice_date, "invoice_date") || inv.invoice_date;
    const shipTo = body.ship_to_site_id === undefined ? inv.ship_to_site_id : C.str(body.ship_to_site_id, "ship_to_site_id", { max: 20 });
    if (shipTo && !sites.has(shipTo)) throw C.bad("Ship To must be an outlet of this customer");
    const description = body.description === undefined ? inv.description : C.str(body.description, "description", { required: true, max: 1000 });
    const [[profile]] = await conn.query(
      `SELECT COALESCE(gp.payment_terms_days, bp.payment_terms_days) AS payment_terms_days
       FROM billing_contracts bc
       LEFT JOIN billing_group_profiles gp ON gp.group_id = bc.group_id AND bc.contract_kind = 'GROUP'
       LEFT JOIN billing_profiles bp ON bp.company_id = ?
      WHERE bc.id = ?`,
      [inv.customer.company_id, inv.contract.id]
    );
    const dueDate = C.addDays(invoiceDate, Number(profile?.payment_terms_days) || 0);

    let poIds = inv.po_ids;
    if (body.po_ids !== undefined) {
      if (!Array.isArray(body.po_ids)) throw C.bad("po_ids must be a list");
      poIds = [...new Set(body.po_ids.map(String))];
      if (poIds.length) {
        const [found] = await conn.query("SELECT id FROM customer_pos WHERE id IN (?) AND company_id = ?", [poIds, inv.customer.company_id]);
        if (found.length !== poIds.length) throw C.bad("Some POs do not belong to this customer");
      }
    }

    const totals = calc.totalsFor(lines, inv.tax_mode, inv.gst_rate);
    await conn.query(
      `UPDATE billing_invoices
          SET invoice_date = ?, due_date = ?, ship_to_site_id = ?, description = ?,
              subtotal = ?, cgst = ?, sgst = ?, igst = ?, round_off = ?, total = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND status = 'DRAFT'`,
      [invoiceDate, dueDate, shipTo, description, totals.subtotal, totals.cgst, totals.sgst, totals.igst, totals.round_off, totals.total, userId, id]
    );
    await conn.query("DELETE FROM billing_invoice_lines WHERE invoice_id = ?", [id]);
    await insertLines(conn, id, lines);
    await conn.query("DELETE FROM billing_invoice_pos WHERE invoice_id = ?", [id]);
    for (const poId of poIds) await conn.query("INSERT INTO billing_invoice_pos (invoice_id, po_id) VALUES (?, ?)", [id, poId]);
  });
  return loadInvoice(pool, id);
}

// ---- checks before issue ---------------------------------------------------------------------

/** Advance (Termite) POs on the invoice: received, adjusted and remaining across their payments. */
async function advanceFor(db, poIds, { lock = false } = {}) {
  if (!poIds.length) return null;
  const [rows] = await db.query(
    `SELECT a.po_id, p.id AS payment_id, p.payment_number, p.payment_date, p.received_amount,
            p.received_amount - COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id), 0) AS remaining
       FROM customer_po_advances a
       JOIN customer_pos po ON po.id = a.po_id AND po.po_kind = 'ADVANCE'
       JOIN payments p ON p.id = a.payment_id AND p.status = 'POSTED'
      WHERE a.po_id IN (?)
      ORDER BY p.payment_date, p.created_at${lock ? " FOR UPDATE" : ""}`,
    [poIds]
  );
  const [[kinds]] = await db.query("SELECT COUNT(*) AS n FROM customer_pos WHERE id IN (?) AND po_kind = 'ADVANCE'", [poIds]);
  if (!Number(kinds.n)) return null;
  const payments = rows.map((r) => ({ ...r, received_amount: Number(r.received_amount), remaining: Math.max(calc.round2(r.remaining), 0) }));
  return {
    payments,
    received: calc.round2(payments.reduce((t, p) => t + p.received_amount, 0)),
    remaining: calc.round2(payments.reduce((t, p) => t + p.remaining, 0)),
  };
}

/** Errors (block issuing) and warnings (need confirming) for a draft. */
async function checkInvoice(db, id) {
  const inv = await loadInvoice(db, id);
  const errors = [];
  const warnings = [];
  const checks = [];
  const check = (code, ok, message, level = "ERROR") => {
    checks.push({ code, ok, level: ok ? null : level, message });
    if (!ok) (level === "ERROR" ? errors : warnings).push(message);
  };
  const today = C.todayIst();

  if (inv.status !== "DRAFT") errors.push(`This invoice is ${inv.status.toLowerCase()}, only drafts can be issued`);
  const [[profile]] = await db.query(
    `SELECT COALESCE(gp.billing_address, bp.billing_address) AS billing_address,
            IF(gp.group_id IS NULL, bp.is_active, gp.is_active) AS is_active, gp.group_id AS group_bill_to
       FROM billing_contracts bc
       LEFT JOIN billing_group_profiles gp ON gp.group_id = bc.group_id AND bc.contract_kind = 'GROUP'
       LEFT JOIN billing_profiles bp ON bp.company_id = ?
      WHERE bc.id = ?`,
    [inv.customer.company_id, inv.contract.id]
  );
  check(
    "PROFILE",
    Boolean(profile?.is_active && profile.billing_address),
    profile?.billing_address
      ? profile.group_bill_to ? "Group Bill To complete" : "Billing profile complete"
      : inv.contract.contract_kind === "GROUP" ? "The group's billing details (Bill To) are missing" : `Billing profile is missing for ${inv.customer.name}`
  );
  if (inv.customer.category === "COMMERCIAL" && inv.tax_mode !== "NONE") {
    check("GSTIN", Boolean(inv.customer.gst_number), inv.customer.gst_number ? `GSTIN ${inv.customer.gst_number} present` : `GSTIN is missing for ${inv.customer.name}`, "WARNING");
  }
  const [[dup]] = await db.query(
    "SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND period_start = ? AND status = 'ISSUED' AND IFNULL(site_id, '-') = IFNULL(?, '-')",
    [inv.contract.id, inv.period_start, inv.site_id]
  );
  check("PERIOD", !Number(dup.n), Number(dup.n) ? "This period is already invoiced" : "Period not billed before");
  check("LINES", inv.lines.length > 0, inv.lines.length ? "Invoice has lines" : "Add at least one line");
  for (const l of inv.lines) {
    const counted = l.services_planned !== null && l.services_planned !== undefined; // from the SOS: 0 completed bills 0
    if (!counted && l.pricing_basis !== "FIXED" && Number(l.quantity) === 0 && l.adjustment_type !== "MANUAL") errors.push(`Enter the quantity for ${l.item_name}`);
    if (!l.contract_line_id && l.pricing_basis === "PER_SERVICE" && Number(l.rate) === 0) errors.push(`Enter the rate for ${l.item_name} (not priced in the customer's profile)`);
  }
  if (inv.total <= 0) errors.push("The invoice total must be more than zero");
  // Counted services come from the Service Coordinator's SOS: every month of the period must be
  // submitted (a reopened SOS removes its drafts, so a draft always matches the submitted numbers).
  if (inv.lines.some((l) => l.services_planned !== null && l.services_planned !== undefined)) {
    const monthList = S.monthStarts(inv.period_start, T.monthsCount(inv.period_start, inv.period_end));
    const sos = await S.submittedFor(db, inv.customer.company_id, monthList);
    const missing = monthList.filter((m) => !sos.has(m));
    check(
      "SOS",
      !missing.length,
      missing.length ? `SOS not submitted for ${missing.map((m) => C.monthName(m)).join(", ")}. The Service Coordinator submits it in Monthly SOS.` : "SOS submitted for the period"
    );
  }
  check("FY", inv.invoice_date <= today, inv.invoice_date <= today ? `Invoice date ${C.dmy(inv.invoice_date)}` : "The invoice date cannot be in the future");
  if (inv.invoice_date < today) {
    warnings.push(
      `The invoice is dated ${C.dmy(inv.invoice_date)}, before today. Change the date to today on the draft unless it must be back-dated - ` +
        `the GST return for ${C.monthName(inv.invoice_date)} may already be filed.`
    );
  }

  if (inv.services && inv.services.done < inv.services.planned) {
    const shortLines = inv.lines.filter((l) => l.services_planned && l.services_done < l.services_planned);
    // Fixed amount contracts bill the agreed services anyway; Service based bill the completed ones.
    const billedFull = inv.contract.shortfall_billing === "FULL" || shortLines.every((l) => l.adjustment_type === "FULL_DESPITE_SHORTFALL");
    check(
      "SERVICES",
      false,
      `Service shortfall: ${inv.services.done} of ${inv.services.planned} planned services done in ${C.monthName(inv.period_start)}. ${billedFull ? "Billed in full." : "Billed for services done."}`,
      "WARNING"
    );
  }

  if (inv.contract.po_required) check("PO", inv.pos.length > 0, inv.pos.length ? `PO ${inv.pos.map((p) => p.po_number).join(", ")}` : "This customer needs a PO on the invoice. Add a valid PO before issuing.");
  for (const po of inv.pos) {
    if (po.status !== "ACTIVE") errors.push(`PO ${po.po_number} is closed`);
    else if (po.expiry_date && po.expiry_date < inv.period_start) errors.push(`PO ${po.po_number} expired on ${C.dmy(po.expiry_date)}. Add a valid PO before issuing.`);
    if (po.kind === "STANDARD" && po.po_amount !== null) {
      const [[used]] = await db.query(
        `SELECT COALESCE(SUM(bi.total), 0) AS invoiced FROM billing_invoice_pos bp
           JOIN billing_invoices bi ON bi.id = bp.invoice_id AND bi.status = 'ISSUED'
          WHERE bp.po_id = ?`,
        [po.id]
      );
      const after = calc.round2(Number(used.invoiced) + inv.total);
      if (after > po.po_amount) {
        warnings.push(`Invoices on PO ${po.po_number} would come to ₹${after.toFixed(2)} incl. GST - ₹${calc.round2(after - po.po_amount).toFixed(2)} more than the PO amount.`);
      }
    }
  }

  const adv = await advanceFor(db, inv.po_ids);
  let advance = null;
  if (adv) {
    advance = { received: adv.received, remaining: adv.remaining, will_adjust: Math.min(adv.remaining, inv.total) };
    if (adv.remaining < inv.total) {
      warnings.push(`The advance has ₹${adv.remaining.toFixed(2)} left; ₹${calc.round2(inv.total - adv.remaining).toFixed(2)} of this invoice will stay pending.`);
    }
  }

  return {
    can_issue: errors.length === 0,
    errors,
    warnings,
    checks,
    totals: { subtotal: inv.subtotal, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, round_off: inv.round_off, total: inv.total },
    advance,
    invoice: inv,
  };
}

module.exports = {
  contractRow,
  loadContract,
  linesInForce,
  customerContext,
  validPos,
  describe,
  buildLines,
  dueList,
  generateDrafts,
  loadInvoice,
  saveDraft,
  checkInvoice,
  advanceFor,
};
