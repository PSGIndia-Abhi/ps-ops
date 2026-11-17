// Billing masters: billing customers and profiles, service options, contracts and price lists.
// Routes: routes/billing.routes.js (/api/billing). Payloads: docs/Invoice Generation - API Payloads.docx §4, §7.

const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const calc = require("../../services/billing/calc");
const { logAudit } = require("../../services/Audit.service");

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

// GET /service-options?company_id= : the customer's outlets and the services used on its jobs
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
  // The service catalogue (the same list the Leads quotations use): picked as the price line's item.
  const [catalog] = await pool.query("SELECT id, name FROM crm_quote_services WHERE is_active = 1 ORDER BY sort_order, name");
  res.json({ sites, services, catalog });
});

// ---- contracts --------------------------------------------------------------------------------

function contractOut(c) {
  return {
    id: c.id,
    contract_code: c.contract_code,
    company_id: c.company_id,
    customer: c.customer || undefined,
    billing_type: c.billing_type,
    frequency_months: C.n2(c.frequency_months),
    cycle_start_day: Number(c.cycle_start_day),
    bill_timing: c.bill_timing,
    start_date: C.ymd(c.start_date),
    end_date: C.ymd(c.end_date),
    next_period_start: C.ymd(c.next_period_start),
    invoice_grouping: c.invoice_grouping,
    site_id: c.site_id,
    po_required: Boolean(c.po_required),
    gst_applicable: c.gst_applicable === undefined ? true : Boolean(c.gst_applicable),
    shortfall_billing: c.shortfall_billing,
    description_template: c.description_template,
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
    site_id: l.site_id,
    site: l.site || null,
    item_name: l.item_name,
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
    site_id: siteId,
    item_name: C.str(raw.item_name, `${at}: item name`, { required: true }),
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
  if (line.plan_sub_service && !line.site_id) throw C.bad(`${at}: choose the outlet for the planned service`);
  return line;
}

async function insertContractLine(conn, contractId, line, sortOrder, userId) {
  const id = uuid();
  await conn.query(
    `INSERT INTO billing_contract_lines
       (id, contract_id, site_id, item_name, sac_code, service_id, plan_service_type, plan_sub_service, pricing_basis,
        unit, rate, default_qty, effective_from, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, contractId, line.site_id, line.item_name, line.sac_code, line.service_id, line.plan_service_type, line.plan_sub_service,
      line.pricing_basis, line.unit, line.rate, line.default_qty, line.effective_from, sortOrder, userId, userId,
    ]
  );
  return id;
}

/** Contract header fields from the request (shared by create and update). */
function readContractHeader(b, sites, billingType, startDate) {
  let frequency = null;
  if (billingType === "AMC") {
    frequency = C.num(b.frequency_months, "frequency_months", { required: true, integer: true });
    if (![1, 3, 4, 6, 12].includes(frequency)) throw C.bad("frequency_months must be 1, 3, 4, 6 or 12 for AMC contracts");
  } else if (billingType !== "ONE_TIME") {
    frequency = C.num(b.frequency_months, "frequency_months", { integer: true }) ?? 1;
    if (![1, 3, 4, 6, 12].includes(frequency)) throw C.bad("frequency_months must be 1, 3, 4, 6 or 12");
  }
  const siteId = C.str(b.site_id, "site_id", { max: 20 });
  if (siteId && !sites.has(siteId)) throw C.bad("site_id must be an outlet of this customer");
  const grouping = C.oneOf(b.invoice_grouping, "invoice_grouping", ["PER_CUSTOMER", "PER_SITE"], { fallback: "PER_CUSTOMER" });
  const endDate = C.date(b.end_date, "end_date");
  if (endDate && startDate && endDate < startDate) throw C.bad("end_date cannot be before start_date");
  return {
    frequency_months: frequency,
    cycle_start_day: C.num(b.cycle_start_day, "cycle_start_day", { min: 1, max: 31, integer: true }) ?? (startDate ? Number(startDate.slice(8, 10)) : 1),
    bill_timing: C.oneOf(b.bill_timing, "bill_timing", ["ARREARS", "ADVANCE"], { fallback: "ARREARS" }),
    end_date: endDate,
    invoice_grouping: grouping,
    site_id: siteId,
    // Chemical supply and termite work are always billed against a PO.
    po_required: PO_TYPES.includes(billingType) ? 1 : C.bool(b.po_required) ? 1 : 0,
    // GST on the invoices (Commercial customers); Residential customers never get GST.
    gst_applicable: b.gst_applicable === undefined || b.gst_applicable === null ? 1 : C.bool(b.gst_applicable) ? 1 : 0,
    shortfall_billing: C.oneOf(b.shortfall_billing, "shortfall_billing", ["PRO_RATA", "FULL"], { fallback: "PRO_RATA" }),
    description_template: C.str(b.description_template, "description_template", { max: 500 }) || defaultDescription(billingType, frequency),
    notes: C.str(b.notes, "notes", { max: 1000 }),
  };
}

const PO_TYPES = ["CHEMICAL", "TERMITE"];

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
    `SELECT bc.*, c.name AS customer,
            (SELECT bi.invoice_number FROM billing_invoices bi
              WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED' ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice_number
       FROM billing_contracts bc JOIN companies c ON c.id = bc.company_id
      WHERE (? IS NULL OR bc.company_id = ?) AND (? IS NULL OR bc.billing_type = ?) AND (? IS NULL OR bc.status = ?)
        AND (? IS NULL OR bc.next_period_start <= ?)
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR bc.contract_code LIKE CONCAT('%', ?, '%'))
      ORDER BY c.name, bc.contract_code`,
    [companyId, companyId, type, type, status, status, dueMonth, dueMonth ? C.monthRange(dueMonth).end : null, q, q, q]
  );
  res.json(rows.map(contractOut));
});

async function contractDetail(db, id) {
  const [[c]] = await db.query(
    `SELECT bc.*, c.name AS customer, c.type AS customer_type, DATE_FORMAT(bc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at_key,
            (SELECT bi.invoice_number FROM billing_invoices bi
              WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED' ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice_number
       FROM billing_contracts bc JOIN companies c ON c.id = bc.company_id WHERE bc.id = ?`,
    [id]
  );
  if (!c) throw C.notFound("Contract not found");
  const [lines] = await db.query(
    `SELECT l.*, s.name AS site FROM billing_contract_lines l LEFT JOIN sites s ON s.id = l.site_id
      WHERE l.contract_id = ? ORDER BY l.sort_order, l.effective_from`,
    [id]
  );
  const [[inv]] = await db.query("SELECT COUNT(*) AS n FROM billing_invoices WHERE contract_id = ? AND status = 'ISSUED'", [id]);
  const [pos] = await db.query(
    `SELECT id, po_number, po_date, expiry_date, po_amount, po_kind, status FROM customer_pos WHERE contract_id = ? ORDER BY po_date DESC`,
    [id]
  );
  const today = C.todayIst();
  const current = lines.filter((l) => !l.effective_to || C.ymd(l.effective_to) >= today);
  const history = lines.filter((l) => l.effective_to && C.ymd(l.effective_to) < today);
  return { ...contractOut(c), category: calc.categoryOf(c.customer_type), lines: current.map(lineOut), price_history: history.map(lineOut), invoices_issued: Number(inv.n),
    pos: pos.map((p) => ({ id: p.id, po_number: p.po_number, po_date: C.ymd(p.po_date), expiry_date: C.ymd(p.expiry_date), po_amount: p.po_amount === null ? null : Number(p.po_amount), po_kind: p.po_kind, status: p.status })),
  };
}

// POST /contracts
const createContract = C.handle("Failed to create the contract", async (req, res) => {
  const b = req.body || {};
  const companyId = C.str(b.company_id, "company_id", { required: true, max: 20 });
  const billingType = C.oneOf(b.billing_type, "billing_type", TYPES);
  const startDate = C.date(b.start_date, "start_date", { required: true });
  const result = await C.inTransaction(pool, async (conn) => {
    const company = await companyOrThrow(conn, companyId);
    if (!calc.categoryOf(company.type)) throw C.bad("Customer type is not set - set it on the customer before adding a contract");
    const sites = await siteIdsOf(conn, companyId);
    const header = readContractHeader(b, sites, billingType, startDate);
    const lines = (Array.isArray(b.lines) ? b.lines : []).map((l, i) => readContractLine(l, i, sites, startDate));

    await conn.query("INSERT IGNORE INTO sequences (name, value) VALUES ('billing_contract', 0)");
    await conn.query("UPDATE sequences SET value = LAST_INSERT_ID(value + 1) WHERE name = 'billing_contract'");
    const [[{ n }]] = await conn.query("SELECT LAST_INSERT_ID() AS n");
    const code = `${CODE_PREFIX[billingType]}-${String(n).padStart(4, "0")}`;

    const id = uuid();
    await conn.query(
      `INSERT INTO billing_contracts
         (id, contract_code, company_id, billing_type, frequency_months, cycle_start_day, bill_timing, start_date, end_date,
          next_period_start, invoice_grouping, site_id, po_required, gst_applicable, shortfall_billing, description_template, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code, companyId, billingType, header.frequency_months, header.cycle_start_day, header.bill_timing, startDate, header.end_date,
        startDate, header.invoice_grouping, header.site_id, header.po_required, header.gst_applicable, header.shortfall_billing, header.description_template,
        header.notes, req.user.id, req.user.id,
      ]
    );
    for (const [i, line] of lines.entries()) await insertContractLine(conn, id, line, i, req.user.id);
    if (billingType === "TERMITE" || b.po_ids !== undefined) await linkContractPos(conn, id, companyId, b.po_ids ?? [], billingType);
    await logAudit(conn, req, {
      module: "BILLING",
      action: "CONTRACT_CREATED",
      entity_type: "BILLING_CONTRACT",
      entity_id: id,
      entity_label: code,
      customer_id: companyId,
      summary: `Contract ${code} (${billingType}) created for ${company.name}`,
    });
    return { id, contract_code: code, next_period_start: startDate };
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
    const sites = await siteIdsOf(conn, current.company_id);
    const merged = { ...current, ...b };
    const header = readContractHeader(merged, sites, current.billing_type, current.start_date);
    await conn.query(
      `UPDATE billing_contracts
          SET frequency_months = ?, cycle_start_day = ?, bill_timing = ?, end_date = ?, invoice_grouping = ?, site_id = ?,
              po_required = ?, gst_applicable = ?, shortfall_billing = ?, description_template = ?, notes = ?, updated_by = ?
        WHERE id = ?`,
      [
        header.frequency_months, header.cycle_start_day, header.bill_timing, header.end_date, header.invoice_grouping, header.site_id,
        header.po_required, header.gst_applicable, header.shortfall_billing, header.description_template, header.notes, req.user.id, req.params.id,
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
  const sites = await siteIdsOf(pool, contract.company_id);
  const line = readContractLine(req.body, 0, sites, C.todayIst() > contract.start_date ? C.todayIst() : contract.start_date);
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
    const sites = await siteIdsOf(conn, contract.company_id);
    const merged = { ...lineOut(old), ...b, effective_from: b.effective_from || C.ymd(old.effective_from) };
    const line = readContractLine(merged, 0, sites, C.ymd(old.effective_from));

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
          SET site_id = ?, item_name = ?, sac_code = ?, service_id = ?, plan_service_type = ?, plan_sub_service = ?,
              pricing_basis = ?, unit = ?, default_qty = ?, updated_by = ?
        WHERE id = ?`,
      [line.site_id, line.item_name, line.sac_code, line.service_id, line.plan_service_type, line.plan_sub_service, line.pricing_basis, line.unit, line.default_qty, req.user.id, old.id]
    );
    const [[row]] = await conn.query("SELECT l.*, s.name AS site FROM billing_contract_lines l LEFT JOIN sites s ON s.id = l.site_id WHERE l.id = ?", [old.id]);
    return lineOut(row);
  });
  res.json(result);
});

module.exports = {
  GST_STATES,
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
