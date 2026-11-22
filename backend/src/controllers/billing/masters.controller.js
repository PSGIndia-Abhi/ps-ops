// Billing masters: billing customers and profiles, service options, contracts and price lists.
// Routes: routes/billing.routes.js (/api/billing). Payloads: docs/Invoice Generation - API Payloads.docx §4, §7.

const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const calc = require("../../services/billing/calc");
const { logAudit } = require("../../services/Audit.service");
const { assertDescription } = require("./descriptions.controller");
const { assertFrequency } = require("./frequencies.controller");

// GST state codes (for the place of supply and IGST outside Karnataka).
const GST_STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

const TYPES = ["AMC", "ONE_TIME", "TERMITE", "CHEMICAL"];
const CODE_PREFIX = { AMC: "AMC", ONE_TIME: "ONE", TERMITE: "TRM", CHEMICAL: "CHM" };
const BASES = ["FIXED", "PER_SERVICE", "PER_UNIT"];
/** The invoice description used when the contract does not give one. */
function defaultDescription(billingType, frequency) {
  if (billingType === "ONE_TIME") return "Pest control service carried out on {period}";
  if (frequency && frequency > 1) return "Pest control services for {from_month} to {to_month}";
  return "Pest control services for the month of {month}";
}

async function companyOrThrow(db, companyId) {
  const [[company]] = await db.query("SELECT id, name, type, gst_number FROM companies WHERE id = ?", [companyId]);
  if (!company) throw C.notFound("Customer not found");
  return company;
}

async function siteIdsOf(db, companyId) {
  const [rows] = await db.query("SELECT id FROM sites WHERE company_id = ?", [companyId]);
  return new Set(rows.map((r) => r.id));
}

/** The outlets a contract's lines may use: its company's, plus (group based) the ticked companies'. */
async function contractSiteIdsOf(db, contractId, companyId) {
  const [rows] = await db.query(
    `SELECT id FROM sites WHERE company_id = ?
        OR company_id IN (SELECT company_id FROM billing_contract_companies WHERE contract_id = ?)`,
    [companyId, contractId]
  );
  return new Set(rows.map((r) => r.id));
}

/** A line's company (group based contracts: the line is for one ticked company) must be on the contract. */
async function assertLineCompany(db, contractId, line) {
  if (!line.company_id) return;
  const [[hit]] = await db.query("SELECT 1 AS ok FROM billing_contract_companies WHERE contract_id = ? AND company_id = ?", [contractId, line.company_id]);
  if (!hit) throw C.bad("The line's company is not on this contract");
}

// ---- customers and profiles ----------------------------------------------------------------

// GET /customers?category=COMMERCIAL&missing_profile=true&q=
const listCustomers = C.handle("Failed to load billing customers", async (req, res) => {
  const q = C.str(req.query.q, "q", { max: 100 });
  const category = C.oneOf(req.query.category, "category", ["COMMERCIAL", "RESIDENTIAL"], { required: false });
  const [rows] = await pool.query(
    `SELECT c.id AS company_id, c.name, c.display_name, c.type AS customer_type, c.gst_number,
            (bp.company_id IS NOT NULL AND bp.is_active = 1) AS profile_complete,
            EXISTS (SELECT 1 FROM billing_service_plans sp WHERE sp.company_id = c.id AND sp.status = 'ACTIVE') AS has_service_plan,
            (SELECT COUNT(*) FROM billing_contracts bc WHERE bc.company_id = c.id AND bc.status = 'ACTIVE') AS active_contracts,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ') FROM sites s WHERE s.company_id = c.id) AS site_names
       FROM companies c
       LEFT JOIN billing_profiles bp ON bp.company_id = c.id
      WHERE (c.is_active IS NULL OR c.is_active = 1)
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR c.display_name LIKE CONCAT('%', ?, '%') OR c.code LIKE CONCAT('%', ?, '%'))
      ORDER BY c.name`,
    [q, q, q, q]
  );
  let out = rows.map((r) => ({
    company_id: r.company_id,
    name: r.name,
    display_name: (r.display_name || "").trim(),
    customer_type: r.customer_type,
    category: calc.categoryOf(r.customer_type),
    gst_number: r.gst_number,
    profile_complete: Boolean(r.profile_complete),
    has_service_plan: Boolean(r.has_service_plan),
    active_contracts: Number(r.active_contracts),
    sites: r.site_names || "",
  }));
  if (category) out = out.filter((r) => r.category === category);
  if (C.bool(req.query.missing_profile)) out = out.filter((r) => !r.profile_complete);
  res.json(out);
});

function profileOut(p) {
  return {
    company_id: p.company_id,
    billing_name: p.billing_name,
    billing_address: p.billing_address,
    state_code: p.state_code,
    state_name: p.state_name,
    payment_terms_days: Number(p.payment_terms_days),
    is_active: Boolean(p.is_active),
    gst_number: p.gst_number || "",
    updated_at: p.updated_at,
  };
}

// The profile with the customer's GSTIN (kept on companies.gst_number, shared with the Companies screen).
const PROFILE_SQL = `SELECT bp.*, c.gst_number FROM billing_profiles bp JOIN companies c ON c.id = bp.company_id WHERE bp.company_id = ?`;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// GET /profiles/:companyId
const getProfile = C.handle("Failed to load the billing profile", async (req, res) => {
  const [[p]] = await pool.query(PROFILE_SQL, [req.params.companyId]);
  if (!p) throw C.notFound("No billing profile for this customer");
  res.json(profileOut(p));
});

// PUT /profiles/:companyId
const saveProfile = C.handle("Failed to save the billing profile", async (req, res) => {
  const companyId = req.params.companyId;
  await companyOrThrow(pool, companyId);
  const b = req.body || {};
  const stateCode = C.str(b.state_code, "state_code", { required: true, max: 2 }).padStart(2, "0");
  if (!GST_STATES[stateCode]) throw C.bad("state_code must be a valid GST state code");
  // GSTIN is optional; sent as "" it is cleared. Saved on the customer (companies.gst_number).
  let gstin;
  if (b.gst_number !== undefined && b.gst_number !== null) {
    gstin = String(b.gst_number).replace(/\s+/g, "").toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) throw C.bad("GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5");
    if (gstin && gstin.slice(0, 2) !== stateCode) throw C.bad(`GSTIN starts with ${gstin.slice(0, 2)} but the state is ${stateCode}; they must match`);
  }
  const values = [
    C.str(b.billing_name, "billing_name", { required: true }),
    C.str(b.billing_address, "billing_address", { required: true, max: 1000 }),
    stateCode,
    C.str(b.state_name, "state_name", { max: 50 }) || GST_STATES[stateCode],
    C.num(b.payment_terms_days, "payment_terms_days", { min: 0, max: 365, integer: true }) ?? 0,
    b.is_active === undefined ? 1 : C.bool(b.is_active) ? 1 : 0,
  ];
  await pool.query(
    `INSERT INTO billing_profiles (company_id, billing_name, billing_address, state_code, state_name, payment_terms_days, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE billing_name = VALUES(billing_name), billing_address = VALUES(billing_address),
       state_code = VALUES(state_code), state_name = VALUES(state_name), payment_terms_days = VALUES(payment_terms_days),
       is_active = VALUES(is_active), updated_by = VALUES(updated_by)`,
    [companyId, ...values, req.user.id, req.user.id]
  );
  if (gstin !== undefined) await pool.query("UPDATE companies SET gst_number = ? WHERE id = ?", [gstin || null, companyId]);
  const [[p]] = await pool.query(PROFILE_SQL, [companyId]);
  res.json(profileOut(p));
});

// GET /service-options?company_id= : the customer's outlets, the services used on its jobs,
// and every service name used on any job (all_services)
const serviceOptions = C.handle("Failed to load the service options", async (req, res) => {
  const companyId = C.str(req.query.company_id, "company_id", { required: true, max: 20 });
  await companyOrThrow(pool, companyId);
  const [sites] = await pool.query("SELECT id AS site_id, name FROM sites WHERE company_id = ? ORDER BY name", [companyId]);
  const [services] = await pool.query(
    `SELECT DISTINCT j.service_type, j.sub_service
       FROM jobs j JOIN sites s ON s.id = j.company_id
      WHERE s.company_id = ? AND j.is_archived = 0 AND j.sub_service IS NOT NULL AND j.sub_service <> ''
      ORDER BY j.service_type, j.sub_service`,
    [companyId]
  );
  // Every service name used on any job (most used first): a new customer has no jobs yet, but its
  // service plan must still name the service its jobs will carry, which is what the tracker matches.
  const [allServices] = await pool.query(
    `SELECT j.sub_service FROM jobs j
      WHERE j.is_archived = 0 AND j.sub_service IS NOT NULL AND j.sub_service <> ''
      GROUP BY j.sub_service ORDER BY COUNT(*) DESC, j.sub_service`
  );
  // The service catalogue (the same list the Leads quotations use): picked as the price line's item.
  const [catalog] = await pool.query("SELECT id, name FROM crm_quote_services WHERE is_active = 1 ORDER BY sort_order, name");
  res.json({ sites, services, all_services: allServices.map((r) => r.sub_service), catalog });
});

// ---- contracts --------------------------------------------------------------------------------

/** SELECT column: a Termite contract's area unit (sq.ft / sq.m), from its area price line. */
const AREA_UNIT_SQL = `(SELECT l.unit FROM billing_contract_lines l WHERE l.contract_id = bc.id AND l.pricing_basis = 'PER_UNIT' AND l.unit LIKE 'sq%'
    ORDER BY l.is_active DESC, l.sort_order LIMIT 1) AS area_unit`;

function contractOut(c) {
  return {
    id: c.id,
    contract_code: c.contract_code,
    // SERVICE (one customer) or GROUP (several companies of a group, one Bill To, one invoice)
    contract_kind: c.contract_kind || "SERVICE",
    group_id: c.group_id || null,
    company_id: c.company_id,
    customer: c.customer || undefined,
    // group based: the group's name and whether its Bill To (the group's billing details) is complete
    group_name: c.group_name || null,
    group_bill_to_complete: c.contract_kind === "GROUP" ? Number(c.group_bill_to_ok) > 0 : null,
    billing_type: c.billing_type,
    frequency_months: C.n2(c.frequency_months),
    // MONTH, or (Termite only) WEEK / DAY: one invoice per week / day
    frequency_unit: c.billing_type === "TERMITE" && (c.frequency_unit === "WEEK" || c.frequency_unit === "DAY") ? c.frequency_unit : "MONTH",
    cycle_start_day: Number(c.cycle_start_day),
    bill_timing: c.bill_timing,
    start_date: C.ymd(c.start_date),
    end_date: C.ymd(c.end_date),
    next_period_start: C.ymd(c.next_period_start),
    invoice_grouping: c.invoice_grouping,
    site_id: c.site_id,
    po_required: Boolean(c.po_required),
    gst_applicable: c.gst_applicable === undefined ? true : Boolean(c.gst_applicable),
    gst_rate: c.gst_rate === undefined || c.gst_rate === null ? 18 : Number(c.gst_rate),
    shortfall_billing: c.shortfall_billing,
    // Termite: the unit its area is priced in (sq.ft / sq.m), from its price line
    area_unit: c.billing_type === "TERMITE" ? (/ft/i.test(c.area_unit || "") ? "sq.ft" : "sq.m") : null,
    description_template: c.description_template,
    // services and chemicals on two invoices each period (chemical invoice: its own description)
    separate_bills: Boolean(c.separate_bills),
    chemical_description_template: c.chemical_description_template || null,
    status: c.status,
    status_reason: c.status_reason,
    notes: c.notes,
    last_invoice_number: c.last_invoice_number ?? undefined,
    updated_at: c.updated_at_key ?? undefined,
  };
}

function lineOut(l) {
  return {
    id: l.id,
    // group based contracts: the ticked company the line is for (one invoice line per company)
    company_id: l.company_id || null,
    site_id: l.site_id,
    site: l.site || null,
    item_name: l.item_name,
    item_kind: l.item_kind || "SERVICE",
    invoice_group: l.invoice_group || null,
    sac_code: l.sac_code,
    service_id: l.service_id,
    plan_service_type: l.plan_service_type,
    plan_sub_service: l.plan_sub_service,
    pricing_basis: l.pricing_basis,
    unit: l.unit,
    rate: Number(l.rate),
    default_qty: C.n2(l.default_qty),
    effective_from: C.ymd(l.effective_from),
    effective_to: C.ymd(l.effective_to),
    sort_order: Number(l.sort_order),
  };
}

/** A price line from the request, validated against the customer's outlets. */
function readContractLine(raw, i, sites, fallbackFrom) {
  const at = `Line ${i + 1}`;
  if (!raw || typeof raw !== "object") throw C.bad(`${at} is not valid`);
  const siteId = C.str(raw.site_id, `${at}: site_id`, { max: 20 });
  if (siteId && !sites.has(siteId)) throw C.bad(`${at}: the outlet does not belong to this customer`);
  const line = {
    company_id: C.str(raw.company_id, `${at}: company_id`, { max: 20 }),
    site_id: siteId,
    item_name: C.str(raw.item_name, `${at}: item name`, { required: true }),
    // SERVICE (from the service list) or CHEMICAL (typed; kept in billing_chemicals for other customers)
    item_kind: C.oneOf(raw.item_kind, `${at}: item_kind`, ["SERVICE", "CHEMICAL"], { fallback: "SERVICE" }),
    // Optional summary: lines with the same text print as ONE invoice line (this text, their total).
    invoice_group: C.str(raw.invoice_group, `${at}: invoice line summary`, { max: 255 }),
    sac_code: C.str(raw.sac_code, `${at}: sac_code`, { max: 10 }),
    service_id: C.str(raw.service_id, `${at}: service_id`, { max: 36 }),
    plan_service_type: C.str(raw.plan_service_type, `${at}: plan_service_type`, { max: 50 }),
    plan_sub_service: C.str(raw.plan_sub_service, `${at}: plan_sub_service`, { max: 100 }),
    pricing_basis: C.oneOf(raw.pricing_basis, `${at}: pricing_basis`, BASES),
    unit: C.str(raw.unit, `${at}: unit`, { max: 20 }) || "nos",
    rate: C.num(raw.rate, `${at}: rate`, { required: true, min: 0, max: 99999999 }),
    default_qty: C.num(raw.default_qty, `${at}: default_qty`, { min: 0, max: 9999999 }),
    effective_from: C.date(raw.effective_from, `${at}: effective_from`) || fallbackFrom,
  };
  // A line without an outlet may still name its planned service: it then follows the customer's
  // whole-customer service plan (jobs at any outlet count). A chemical is not a planned service.
  if (line.item_kind === "CHEMICAL") {
    line.plan_service_type = null;
    line.plan_sub_service = null;
  }
  return line;
}

/** A chemical typed on a contract goes into billing_chemicals, so other customers can pick it. */
async function rememberChemical(conn, line, userId) {
  if (line.item_kind !== "CHEMICAL") return;
  await conn.query("INSERT IGNORE INTO billing_chemicals (id, name, created_by) VALUES (?, ?, ?)", [uuid(), line.item_name, userId]);
}

async function insertContractLine(conn, contractId, line, sortOrder, userId) {
  const id = uuid();
  await conn.query(
    `INSERT INTO billing_contract_lines
       (id, contract_id, company_id, site_id, item_name, item_kind, invoice_group, sac_code, service_id, plan_service_type, plan_sub_service, pricing_basis,
        unit, rate, default_qty, effective_from, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, contractId, line.company_id || null, line.site_id, line.item_name, line.item_kind, line.invoice_group, line.sac_code, line.service_id, line.plan_service_type, line.plan_sub_service,
      line.pricing_basis, line.unit, line.rate, line.default_qty, line.effective_from, sortOrder, userId, userId,
    ]
  );
  await rememberChemical(conn, line, userId);
  return id;
}

/** Contract header fields from the request (shared by create and update). */
function readContractHeader(b, sites, billingType, startDate) {
  let frequency = null;
  if (billingType === "AMC") {
    // 1 to 12 months; it must also be in Masters > Billing Frequencies (checked on save).
    frequency = C.num(b.frequency_months, "Billing frequency", { required: true, integer: true, min: 1, max: 12 });
  } else if (billingType !== "ONE_TIME") {
    frequency = C.num(b.frequency_months, "Billing frequency", { integer: true, min: 1, max: 12 }) ?? 1;
  }
  // Termite only: billed every day (DAY), every week (WEEK) or every month (MONTH). A day / week is
  // one period, so frequency_months is 1. Every other type is MONTH.
  const unit = billingType === "TERMITE" ? C.oneOf(b.frequency_unit, "Billing frequency", ["MONTH", "WEEK", "DAY"], { fallback: "MONTH" }) : "MONTH";
  if (unit !== "MONTH") frequency = 1;
  const siteId = C.str(b.site_id, "site_id", { max: 20 });
  if (siteId && !sites.has(siteId)) throw C.bad("site_id must be an outlet of this customer");
  const grouping = C.oneOf(b.invoice_grouping, "invoice_grouping", ["PER_CUSTOMER", "PER_SITE"], { fallback: "PER_CUSTOMER" });
  const endDate = C.date(b.end_date, "end_date");
  if (endDate && startDate && endDate < startDate) throw C.bad("end_date cannot be before start_date");
  return {
    frequency_months: frequency,
    frequency_unit: unit,
    cycle_start_day: C.num(b.cycle_start_day, "cycle_start_day", { min: 1, max: 31, integer: true }) ?? (startDate ? Number(startDate.slice(8, 10)) : 1),
    bill_timing: C.oneOf(b.bill_timing, "bill_timing", ["ARREARS", "ADVANCE"], { fallback: "ARREARS" }),
    end_date: endDate,
    invoice_grouping: grouping,
    site_id: siteId,
    // Chemical supply and termite work are always billed against a PO.
    po_required: PO_TYPES.includes(billingType) ? 1 : C.bool(b.po_required) ? 1 : 0,
    // GST on the invoices (Commercial customers); Residential customers never get GST.
    gst_applicable: b.gst_applicable === undefined || b.gst_applicable === null ? 1 : C.bool(b.gst_applicable) ? 1 : 0,
    // The GST rate when GST applies: a GST slab (5, 12, 18, 28 %); 18 when not given.
    gst_rate: readGstRate(b.gst_rate),
    shortfall_billing: C.oneOf(b.shortfall_billing, "shortfall_billing", ["PRO_RATA", "FULL"], { fallback: "PRO_RATA" }),
    description_template: C.str(b.description_template, "description_template", { max: 500 }) || defaultDescription(billingType, frequency),
    notes: C.str(b.notes, "notes", { max: 1000 }),
    ...readSeparateBills(b),
  };
}

/** Separate bills: services and chemicals invoiced separately, the chemical invoice with its own description. */
function readSeparateBills(b) {
  const separate = C.bool(b.separate_bills);
  const chemical = C.str(b.chemical_description_template, "chemical_description_template", { max: 500 });
  if (separate && !chemical) throw C.bad("Type or choose the description for the chemical bill");
  return { separate_bills: separate ? 1 : 0, chemical_description_template: separate ? chemical : null };
}

/**
 * One contract per customer, whatever the type: refuses when any of `companyIds` already has a
 * contract that is not ended (its own, or a group contract it is part of).
 */
async function assertNoOtherContract(conn, companyIds) {
  const [[other]] = await conn.query(
    `SELECT bc.contract_code, TRIM(co.name) AS customer
       FROM billing_contracts bc
       JOIN companies co ON co.id IN (?)
      WHERE bc.status <> 'ENDED'
        AND (bc.company_id = co.id OR EXISTS (SELECT 1 FROM billing_contract_companies cc WHERE cc.contract_id = bc.id AND cc.company_id = co.id))
      ORDER BY bc.created_at LIMIT 1`,
    [companyIds]
  );
  if (other) {
    throw C.conflict(`${other.customer} already has contract ${other.contract_code}. A customer can have only one contract - open it to make changes, or end it first.`);
  }
}

const PO_TYPES = ["CHEMICAL", "TERMITE"];

/** "First bill from" / next billing date: optional, on or after the start date, not after the end date. */
function readFirstBill(raw, startDate, endDate, field) {
  const value = C.date(raw, field);
  if (!value) return null;
  if (startDate && value < startDate) throw C.bad("The first billing date cannot be before the contract start date");
  if (endDate && value > endDate) throw C.bad("The first billing date cannot be after the contract end date");
  return value;
}

function readGstRate(raw) {
  if (raw === undefined || raw === null || raw === "") return 18;
  const rate = Number(raw);
  if (!calc.GST_RATES.includes(rate)) throw C.bad(`GST rate must be one of ${calc.GST_RATES.join(", ")} %`);
  return rate;
}

/** Link the chosen POs (customer_pos.contract_id) to the contract; POs no longer chosen are unlinked. */
async function linkContractPos(conn, contractId, companyId, rawIds, billingType) {
  if (!Array.isArray(rawIds)) throw C.bad("po_ids must be a list");
  const ids = [...new Set(rawIds.map((v) => String(v || "").trim()).filter(Boolean))];
  if (billingType === "TERMITE" && !ids.length) throw C.bad("Choose at least one purchase order for a termite contract");
  if (ids.length) {
    const [rows] = await conn.query("SELECT id, po_number, company_id, contract_id, status FROM customer_pos WHERE id IN (?) FOR UPDATE", [ids]);
    if (rows.length !== ids.length) throw C.bad("A chosen purchase order was not found");
    for (const po of rows) {
      if (po.company_id !== companyId) throw C.bad(`PO ${po.po_number} belongs to another customer`);
      if (po.status !== "ACTIVE") throw C.bad(`PO ${po.po_number} is closed`);
      if (po.contract_id && po.contract_id !== contractId) throw C.bad(`PO ${po.po_number} is already linked to another contract`);
    }
  }
  await conn.query("UPDATE customer_pos SET contract_id = NULL WHERE contract_id = ?" + (ids.length ? " AND id NOT IN (?)" : ""), ids.length ? [contractId, ids] : [contractId]);
  if (ids.length) await conn.query("UPDATE customer_pos SET contract_id = ? WHERE id IN (?)", [contractId, ids]);
}

// GET /contracts?company_id&type&status&due_month
const listContracts = C.handle("Failed to load contracts", async (req, res) => {
  const companyId = C.str(req.query.company_id, "company_id", { max: 20 });
  const type = C.oneOf(req.query.type, "type", TYPES, { required: false });
  const status = C.oneOf(req.query.status, "status", ["ACTIVE", "PAUSED", "ENDED"], { required: false });
  const dueMonth = C.month(req.query.due_month, "due_month", { required: false });
  const q = C.str(req.query.q, "q", { max: 100 });
  const [rows] = await pool.query(
    `SELECT bc.*, c.name AS customer, ${AREA_UNIT_SQL},
            (SELECT bi.invoice_number FROM billing_invoices bi
              WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED' ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice_number,
            IF(bc.contract_kind = 'GROUP', TRIM(gn.name), NULL) AS group_name,
            IF(bc.contract_kind = 'GROUP', (SELECT COUNT(*) FROM billing_group_profiles gp
              WHERE gp.group_id = bc.group_id AND gp.is_active = 1 AND TRIM(gp.billing_name) <> ''
                AND TRIM(gp.billing_address) <> '' AND gp.state_code IS NOT NULL AND gp.state_code <> ''), NULL) AS group_bill_to_ok
       FROM billing_contracts bc JOIN companies c ON c.id = bc.company_id
       LEFT JOIN group_name gn ON gn.id = bc.group_id
      WHERE (? IS NULL OR bc.company_id = ?) AND (? IS NULL OR bc.billing_type = ?) AND (? IS NULL OR bc.status = ?)
        AND (? IS NULL OR bc.next_period_start <= ?)
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR bc.contract_code LIKE CONCAT('%', ?, '%')
             OR (bc.contract_kind = 'GROUP' AND gn.name LIKE CONCAT('%', ?, '%')))
      ORDER BY COALESCE(IF(bc.contract_kind = 'GROUP', gn.name, NULL), c.name), bc.contract_code`,
    [companyId, companyId, type, type, status, status, dueMonth, dueMonth ? C.monthRange(dueMonth).end : null, q, q, q, q]
  );
  res.json(rows.map(contractOut));
});

async function contractDetail(db, id) {
  const [[c]] = await db.query(
    `SELECT bc.*, c.name AS customer, c.type AS customer_type, DATE_FORMAT(bc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_key, ${AREA_UNIT_SQL},
            (SELECT bi.invoice_number FROM billing_invoices bi
              WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED' ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice_number,
            IF(bc.contract_kind = 'GROUP', TRIM(gn.name), NULL) AS group_name,
            IF(bc.contract_kind = 'GROUP', (SELECT COUNT(*) FROM billing_group_profiles gp
              WHERE gp.group_id = bc.group_id AND gp.is_active = 1 AND TRIM(gp.billing_name) <> ''
                AND TRIM(gp.billing_address) <> '' AND gp.state_code IS NOT NULL AND gp.state_code <> ''), NULL) AS group_bill_to_ok
       FROM billing_contracts bc JOIN companies c ON c.id = bc.company_id
       LEFT JOIN group_name gn ON gn.id = bc.group_id WHERE bc.id = ?`,
    [id]
  );
  if (!c) throw C.notFound("Contract not found");
  const [lines] = await db.query(
    `SELECT l.*, s.name AS site FROM billing_contract_lines l LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.contract_id = ? ORDER BY l.sort_order, l.effective_from`,
    [id]
  );
  const [[inv]] = await db.query(
    "SELECT SUM(status = 'ISSUED') AS n, SUM(status <> 'CANCELLED') AS open FROM billing_invoices WHERE contract_id = ?",
    [id]
  );
  const [pos] = await db.query(
    `SELECT id, po_number, po_date, expiry_date, po_amount, po_kind, status FROM customer_pos WHERE contract_id = ? ORDER BY po_date DESC`,
    [id]
  );
  const [companies] = c.contract_kind === "GROUP"
    ? await db.query(
      `SELECT cc.company_id, TRIM(co.name) AS name, TRIM(g.name) AS group_name
         FROM billing_contract_companies cc JOIN companies co ON co.id = cc.company_id
         LEFT JOIN group_name g ON g.id = co.group_id
        WHERE cc.contract_id = ? ORDER BY co.name`,
      [id]
    )
    : [[]];
  const today = C.todayIst();
  const current = lines.filter((l) => !l.effective_to || C.ymd(l.effective_to) >= today);
  const history = lines.filter((l) => l.effective_to && C.ymd(l.effective_to) < today);
  return { ...contractOut(c), category: calc.categoryOf(c.customer_type),
    companies: companies.map((x) => ({ company_id: x.company_id, name: x.name })), group: companies[0]?.group_name || null,
    lines: current.map(lineOut), price_history: history.map(lineOut), invoices_issued: Number(inv.n || 0),
    // No draft or issued invoice yet: the next billing date can still be moved (e.g. billed elsewhere until then).
    next_period_editable: !Number(inv.open || 0) && c.status !== "ENDED",
    pos: pos.map((p) => ({ id: p.id, po_number: p.po_number, po_date: C.ymd(p.po_date), expiry_date: C.ymd(p.expiry_date), po_amount: p.po_amount === null ? null : Number(p.po_amount), po_kind: p.po_kind, status: p.status })),
  };
}

// POST /contracts
const createContract = C.handle("Failed to create the contract", async (req, res) => {
  const b = req.body || {};
  const companyId = C.str(b.company_id, "company_id", { required: true, max: 20 });
  const billingType = C.oneOf(b.billing_type, "billing_type", TYPES);
  const startDate = C.date(b.start_date, "start_date", { required: true });
  // Group based: several companies of one group, billed to the group's Bill To. company_id is the
  // first of them (it keeps every existing screen working).
  const kind = b.contract_kind === "GROUP" ? "GROUP" : "SERVICE";
  const groupId = kind === "GROUP" ? C.str(b.group_id, "group_id", { required: true, max: 36 }) : null;
  const result = await C.inTransaction(pool, async (conn) => {
    const groupCompanies = kind === "GROUP" ? await require("./groupContracts.controller").readGroupCompanies(conn, groupId, b.company_ids) : [];
    if (kind === "GROUP" && !groupCompanies.includes(companyId)) throw C.bad("company_id must be one of the ticked companies");
    const company = await companyOrThrow(conn, companyId);
    if (!calc.categoryOf(company.type)) throw C.bad("Customer type is not set - set it on the customer before adding a contract");
    // One contract per customer (a group contract counts for every company it covers).
    await assertNoOtherContract(conn, kind === "GROUP" ? groupCompanies : [companyId]);
    const sites = await siteIdsOf(conn, companyId);
    const siteCompany = new Map();
    if (kind === "GROUP") {
      const [rows] = await conn.query("SELECT id, company_id FROM sites WHERE company_id IN (?)", [groupCompanies]);
      for (const r of rows) {
        sites.add(r.id);
        siteCompany.set(r.id, r.company_id);
      }
    }
    // The description on invoice is required and picked from the master (Masters > Invoice Descriptions).
    await assertDescription(conn, C.str(b.description_template, "description_template", { max: 500 }), null, req.user.id);
    const header = readContractHeader(b, sites, billingType, startDate);
    if (header.separate_bills) await assertDescription(conn, header.chemical_description_template, null, req.user.id);
    // First bill from: a customer already billed elsewhere (e.g. Vyapar) up to a date starts billing
    // here from the day after, instead of from the contract start date.
    const firstBill = readFirstBill(b.first_bill_from, startDate, header.end_date, "first_bill_from") || startDate;
    // The billing frequency is picked from the master (Masters > Billing Frequencies); daily / weekly
    // Termite billing is not in that list of months.
    if (header.frequency_unit === "MONTH") await assertFrequency(conn, header.frequency_months);
    const lines = (Array.isArray(b.lines) ? b.lines : []).map((l, i) => readContractLine(l, i, sites, startDate));
    for (const [i, l] of lines.entries()) {
      if (kind !== "GROUP") l.company_id = null;
      else if (l.company_id && !groupCompanies.includes(l.company_id)) throw C.bad(`Line ${i + 1}: the company is not one of the ticked companies`);
      else if (l.company_id && l.site_id && siteCompany.get(l.site_id) !== l.company_id) throw C.bad(`Line ${i + 1}: the outlet is not that company's`);
    }

    await conn.query("INSERT IGNORE INTO sequences (name, value) VALUES ('billing_contract', 0)");
    await conn.query("UPDATE sequences SET value = LAST_INSERT_ID(value + 1) WHERE name = 'billing_contract'");
    const [[{ n }]] = await conn.query("SELECT LAST_INSERT_ID() AS n");
    const code = `${CODE_PREFIX[billingType]}-${String(n).padStart(4, "0")}`;

    const id = uuid();
    await conn.query(
      `INSERT INTO billing_contracts
         (id, contract_code, contract_kind, company_id, group_id, billing_type, frequency_months, frequency_unit, cycle_start_day, bill_timing, start_date, end_date,
          next_period_start, invoice_grouping, site_id, po_required, gst_applicable, gst_rate, shortfall_billing, description_template,
          separate_bills, chemical_description_template, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code, kind, companyId, groupId, billingType, header.frequency_months, header.frequency_unit, header.cycle_start_day, header.bill_timing, startDate, header.end_date,
        firstBill, header.invoice_grouping, header.site_id, header.po_required, header.gst_applicable, header.gst_rate, header.shortfall_billing, header.description_template,
        header.separate_bills, header.chemical_description_template, header.notes, req.user.id, req.user.id,
      ]
    );
    for (const [i, line] of lines.entries()) await insertContractLine(conn, id, line, i, req.user.id);
    for (const cid of groupCompanies) await conn.query("INSERT INTO billing_contract_companies (contract_id, company_id) VALUES (?, ?)", [id, cid]);
    if (billingType === "TERMITE" || b.po_ids !== undefined) await linkContractPos(conn, id, companyId, b.po_ids ?? [], billingType);
    await logAudit(conn, req, {
      module: "BILLING",
      action: "CONTRACT_CREATED",
      entity_type: "BILLING_CONTRACT",
      entity_id: id,
      entity_label: code,
      customer_id: companyId,
      summary: `Contract ${code} (${billingType}) created for ${kind === "GROUP" ? `${groupCompanies.length} companies of a group` : company.name}${firstBill !== startDate ? `, first bill from ${C.dmy(firstBill)}` : ""}`,
    });
    return { id, contract_code: code, next_period_start: firstBill };
  });
  res.status(201).json(result);
});

// GET /contracts/:id
const getContract = C.handle("Failed to load the contract", async (req, res) => {
  res.json(await contractDetail(pool, req.params.id));
});

// PUT /contracts/:id  { updated_at, ...header fields }
const updateContract = C.handle("Failed to update the contract", async (req, res) => {
  const b = req.body || {};
  await C.inTransaction(pool, async (conn) => {
    const current = await contractDetail(conn, req.params.id);
    if (b.updated_at && String(b.updated_at) !== current.updated_at) throw C.conflict("This contract was changed by someone else. Reload and try again.");
    if (current.status === "ENDED") throw C.bad("An ended contract cannot be changed");
    const sites = await contractSiteIdsOf(conn, current.id, current.company_id);
    const merged = { ...current, ...b };
    // A listed, active description - or the one the contract already has, even if switched off since.
    await assertDescription(conn, C.str(merged.description_template, "description_template", { max: 500 }), current.description_template, req.user.id);
    const header = readContractHeader(merged, sites, current.billing_type, current.start_date);
    if (header.separate_bills) await assertDescription(conn, header.chemical_description_template, current.chemical_description_template, req.user.id);
    // A listed, active frequency - or the one the contract already has, even if switched off since.
    if (header.frequency_unit === "MONTH") await assertFrequency(conn, header.frequency_months, current.frequency_months);
    // Weekly / daily periods follow on from the invoices already made: the unit is fixed once any exist.
    if (header.frequency_unit !== current.frequency_unit && !current.next_period_editable) {
      throw C.bad("Daily / weekly / monthly cannot be changed once an invoice is drafted or issued on this contract");
    }
    // The next billing date can be moved only while nothing is drafted or issued on the contract
    // (once invoices exist, the periods follow on from them).
    let nextStart = current.next_period_start;
    if (b.next_period_start !== undefined && b.next_period_start !== current.next_period_start) {
      if (!current.next_period_editable) throw C.bad("The next billing date cannot be changed once an invoice is drafted or issued on this contract");
      nextStart = readFirstBill(b.next_period_start, current.start_date, header.end_date, "next_period_start") || current.start_date;
    }
    await conn.query(
      `UPDATE billing_contracts
          SET frequency_months = ?, frequency_unit = ?, cycle_start_day = ?, bill_timing = ?, end_date = ?, invoice_grouping = ?, site_id = ?,
              po_required = ?, gst_applicable = ?, gst_rate = ?, shortfall_billing = ?, description_template = ?,
              separate_bills = ?, chemical_description_template = ?, notes = ?,
              next_period_start = ?, updated_by = ?
        WHERE id = ?`,
      [
        header.frequency_months, header.frequency_unit, header.cycle_start_day, header.bill_timing, header.end_date, header.invoice_grouping, header.site_id,
        header.po_required, header.gst_applicable, header.gst_rate, header.shortfall_billing, header.description_template,
        header.separate_bills, header.chemical_description_template, header.notes,
        nextStart, req.user.id, req.params.id,
      ]
    );
    if (b.po_ids !== undefined) await linkContractPos(conn, req.params.id, current.company_id, b.po_ids, current.billing_type);
    await logAudit(conn, req, {
      module: "BILLING",
      action: "CONTRACT_UPDATED",
      entity_type: "BILLING_CONTRACT",
      entity_id: req.params.id,
      entity_label: current.contract_code,
      customer_id: current.company_id,
      summary: `Contract ${current.contract_code} updated`,
    });
  });
  res.json(await contractDetail(pool, req.params.id));
});

// POST /contracts/:id/status { status: ACTIVE | PAUSED | ENDED, reason }
const setContractStatus = C.handle("Failed to change the contract status", async (req, res) => {
  const status = C.oneOf(req.body?.status, "status", ["ACTIVE", "PAUSED", "ENDED"]);
  const reason = C.str(req.body?.reason, "reason", { max: 500 });
  const contract = await contractDetail(pool, req.params.id);
  if (contract.status === "ENDED" && status !== "ENDED") throw C.bad("An ended contract cannot be restarted - create a new contract");
  await pool.query("UPDATE billing_contracts SET status = ?, status_reason = ?, updated_by = ? WHERE id = ?", [status, reason, req.user.id, req.params.id]);
  await logAudit(pool, req, {
    module: "BILLING",
    action: "CONTRACT_STATUS",
    entity_type: "BILLING_CONTRACT",
    entity_id: req.params.id,
    entity_label: contract.contract_code,
    customer_id: contract.company_id,
    summary: `Contract ${contract.contract_code}: ${contract.status} -> ${status}`,
    reason,
  });
  res.json({ id: req.params.id, status });
});

// POST /contracts/:id/lines  (one line)
const addContractLine = C.handle("Failed to add the price line", async (req, res) => {
  const contract = await contractDetail(pool, req.params.id);
  const sites = await contractSiteIdsOf(pool, contract.id, contract.company_id);
  const line = readContractLine(req.body, 0, sites, C.todayIst() > contract.start_date ? C.todayIst() : contract.start_date);
  await assertLineCompany(pool, contract.id, line);
  const id = await insertContractLine(pool, req.params.id, line, contract.lines.length, req.user.id);
  const [[row]] = await pool.query("SELECT l.*, s.name AS site FROM billing_contract_lines l LEFT JOIN sites s ON s.id = l.site_id WHERE l.id = ?", [id]);
  res.status(201).json(lineOut(row));
});

// PUT /contracts/:id/lines/:lineId
//   { rate, effective_from }  -> a price change: the old line ends the day before, a new line starts
//   other fields only         -> the line is corrected in place
const updateContractLine = C.handle("Failed to update the price line", async (req, res) => {
  const b = req.body || {};
  const result = await C.inTransaction(pool, async (conn) => {
    const [[old]] = await conn.query("SELECT * FROM billing_contract_lines WHERE id = ? AND contract_id = ? FOR UPDATE", [req.params.lineId, req.params.id]);
    if (!old) throw C.notFound("Price line not found");
    if (old.effective_to) throw C.bad("This price line has already ended");
    const [[contract]] = await conn.query("SELECT company_id FROM billing_contracts WHERE id = ?", [req.params.id]);
    const sites = await contractSiteIdsOf(conn, req.params.id, contract.company_id);
    const merged = { ...lineOut(old), ...b, effective_from: b.effective_from || C.ymd(old.effective_from) };
    const line = readContractLine(merged, 0, sites, C.ymd(old.effective_from));
    await assertLineCompany(conn, req.params.id, line);

    if (b.rate !== undefined && Number(b.rate) !== Number(old.rate)) {
      const from = C.date(b.effective_from, "effective_from", { required: true });
      if (from <= C.ymd(old.effective_from)) throw C.bad("The new price must start after the current one started");
      const endedOn = C.addDays(from, -1);
      await conn.query("UPDATE billing_contract_lines SET effective_to = ?, is_active = 0, updated_by = ? WHERE id = ?", [endedOn, req.user.id, old.id]);
      const newId = await insertContractLine(conn, req.params.id, { ...line, effective_from: from }, Number(old.sort_order), req.user.id);
      return { ended_line: { id: old.id, effective_to: endedOn }, new_line: { id: newId, rate: line.rate, effective_from: from } };
    }
    await conn.query(
      `UPDATE billing_contract_lines
          SET site_id = ?, item_name = ?, item_kind = ?, invoice_group = ?, sac_code = ?, service_id = ?, plan_service_type = ?, plan_sub_service = ?,
              pricing_basis = ?, unit = ?, default_qty = ?, updated_by = ?
        WHERE id = ?`,
      [line.site_id, line.item_name, line.item_kind, line.invoice_group, line.sac_code, line.service_id, line.plan_service_type, line.plan_sub_service, line.pricing_basis, line.unit, line.default_qty, req.user.id, old.id]
    );
    await rememberChemical(conn, line, req.user.id);
    const [[row]] = await conn.query("SELECT l.*, s.name AS site FROM billing_contract_lines l LEFT JOIN sites s ON s.id = l.site_id WHERE l.id = ?", [old.id]);
    return lineOut(row);
  });
  res.json(result);
});

// GET /chemicals - chemicals typed on contracts before, to pick for another customer (no master screen).
const listChemicals = C.handle("Failed to load the chemicals", async (req, res) => {
  const [rows] = await pool.query("SELECT name FROM billing_chemicals WHERE is_active = 1 ORDER BY name");
  res.json(rows.map((r) => r.name));
});

module.exports = {
  GST_STATES,
  listChemicals,
  listCustomers,
  getProfile,
  saveProfile,
  serviceOptions,
  listContracts,
  createContract,
  getContract,
  updateContract,
  setContractStatus,
  addContractLine,
  updateContractLine,
  contractDetail,
};
