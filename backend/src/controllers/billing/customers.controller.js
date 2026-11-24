// Customer Billing Profile: everything billing knows about a customer, on one screen.
//   GET /customer-profiles                 the customers with their billing status (list page)
//   GET /customer-profiles/:companyId      one customer: billing details, outlets with their print /
//                                          email settings and services, contracts, POs
//   PUT /customer-profiles/:companyId/settings   prints, emails and the bill-by day
// Bill To / GSTIN / state / payment terms are saved with PUT /profiles/:companyId (masters.controller).
// Tables: billing_profiles, billing_outlet_settings (20261121_billing_customer_profile.sql),
// billing_contracts + billing_contract_lines (services, rate, services per month), customer_pos.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const calc = require("../../services/billing/calc");
const { logAudit } = require("../../services/Audit.service");

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.in, b@y.com" -> "a@x.in, b@y.com" (checked, de-duplicated) or null. */
function readEmails(raw, field) {
  if (raw === undefined || raw === null) return null;
  const list = (Array.isArray(raw) ? raw : String(raw).split(/[,;\s]+/)).map((e) => String(e || "").trim()).filter(Boolean);
  if (list.length > 10) throw C.bad(`${field}: at most 10 email addresses`);
  for (const e of list) if (!EMAIL_RE.test(e) || e.length > 150) throw C.bad(`${field}: "${e}" is not a valid email address`);
  const out = [...new Set(list.map((e) => e.toLowerCase()))].join(", ");
  return out || null;
}

// Any number of print copies; 127 is only the TINYINT column's limit.
// 0 = nothing is printed when an invoice is issued (Print by hand still prints one).
const copiesOf = (raw, field) => C.num(raw, field, { min: 0, max: 65535, integer: true }) ?? 1; // 65535 = the column limit
const emailList = (s) => String(s || "").split(",").map((e) => e.trim()).filter(Boolean);

// Price lines in force today, with what a month comes to.
const LINES_SQL = `
  SELECT l.id, l.contract_id, l.site_id, s.name AS site, l.item_name, l.item_kind, l.invoice_group, l.pricing_basis,
         l.unit, l.rate, l.default_qty, l.plan_sub_service, l.sort_order
    FROM billing_contract_lines l
    JOIN billing_contracts bc ON bc.id = l.contract_id
    LEFT JOIN sites s ON s.id = l.site_id
   WHERE bc.company_id = ? AND l.is_active = 1 AND l.effective_from <= CURDATE() AND (l.effective_to IS NULL OR l.effective_to >= CURDATE())
   ORDER BY bc.created_at, l.sort_order, l.created_at`;

const lineOut = (l) => ({
  id: l.id,
  contract_id: l.contract_id,
  site_id: l.site_id,
  site: l.site || null,
  item_name: l.item_name,
  item_kind: l.item_kind || "SERVICE",
  invoice_group: l.invoice_group || null,
  pricing_basis: l.pricing_basis,
  unit: l.unit,
  rate: Number(l.rate),
  per_month: l.default_qty === null ? null : Number(l.default_qty),
  monthly_value: l.default_qty === null ? null : calc.round2(Number(l.rate) * Number(l.default_qty)),
});

// GET /customer-profiles?q=&group_id=&status=ready|incomplete
const listProfiles = C.handle("Failed to load the customers", async (req, res) => {
  const q = C.str(req.query.q, "q", { max: 100 });
  const groupId = C.str(req.query.group_id, "group_id", { max: 36 });
  const status = C.oneOf(req.query.status, "status", ["ready", "incomplete"], { required: false });
  const [rows] = await pool.query(
    `SELECT c.id AS company_id, c.name, c.type AS customer_type, c.gst_number, c.group_id, g.name AS group_name,
            (SELECT COUNT(*) FROM sites s WHERE s.company_id = c.id) AS outlets,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ') FROM sites s WHERE s.company_id = c.id) AS outlet_names,
            (bp.company_id IS NOT NULL AND bp.is_active = 1) AS has_profile, bp.bill_by_day,
            (SELECT COUNT(*) FROM billing_contracts bc WHERE bc.company_id = c.id AND bc.status = 'ACTIVE') AS contracts,
            (SELECT COUNT(*) FROM billing_contract_lines l JOIN billing_contracts bc ON bc.id = l.contract_id
              WHERE bc.company_id = c.id AND bc.status = 'ACTIVE' AND l.is_active = 1
                AND l.effective_from <= CURDATE() AND (l.effective_to IS NULL OR l.effective_to >= CURDATE())) AS services,
            (SELECT COALESCE(SUM(l.rate * COALESCE(l.default_qty, 0)), 0) FROM billing_contract_lines l JOIN billing_contracts bc ON bc.id = l.contract_id
              WHERE bc.company_id = c.id AND bc.status = 'ACTIVE' AND l.is_active = 1
                AND l.effective_from <= CURDATE() AND (l.effective_to IS NULL OR l.effective_to >= CURDATE())) AS monthly_value,
            (SELECT COUNT(*) FROM customer_pos po WHERE po.company_id = c.id AND po.status = 'ACTIVE'
                AND (po.expiry_date IS NULL OR po.expiry_date >= CURDATE())) AS active_pos
       FROM companies c
       LEFT JOIN group_name g ON g.id = c.group_id
       LEFT JOIN billing_profiles bp ON bp.company_id = c.id
      WHERE (c.is_active IS NULL OR c.is_active = 1)
        AND (? IS NULL OR c.group_id = ?)
        AND (? IS NULL OR c.name LIKE CONCAT('%', ?, '%') OR c.display_name LIKE CONCAT('%', ?, '%') OR g.name LIKE CONCAT('%', ?, '%'))
      ORDER BY (g.name IS NULL), g.name, c.name`,
    [groupId, groupId, q, q, q, q]
  );
  const out = rows.map((r) => {
    const category = calc.categoryOf(r.customer_type);
    const missing = [];
    if (!category) missing.push("Customer type");
    if (!Number(r.has_profile)) missing.push("Billing details");
    if (!Number(r.contracts)) missing.push("Contract");
    else if (!Number(r.services)) missing.push("Services");
    return {
      company_id: r.company_id,
      name: r.name,
      group_id: r.group_id,
      group: r.group_name || null,
      category,
      gst_number: r.gst_number || null,
      outlets: Number(r.outlets),
      outlet_names: r.outlet_names || "",
      contracts: Number(r.contracts),
      services: Number(r.services),
      monthly_value: calc.round2(r.monthly_value),
      active_pos: Number(r.active_pos),
      bill_by_day: r.bill_by_day === null ? null : Number(r.bill_by_day),
      missing,
      ready: missing.length === 0,
    };
  });
  const [groups] = await pool.query(
    `SELECT g.id, g.name, COUNT(c.id) AS customers FROM group_name g JOIN companies c ON c.group_id = g.id
      WHERE (c.is_active IS NULL OR c.is_active = 1) GROUP BY g.id, g.name ORDER BY g.name`
  );
  const shown = status ? out.filter((r) => (status === "ready" ? r.ready : !r.ready)) : out;
  res.json({
    rows: shown,
    groups: groups.map((g) => ({ id: g.id, name: g.name, customers: Number(g.customers) })),
    summary: {
      customers: out.length,
      ready: out.filter((r) => r.ready).length,
      incomplete: out.filter((r) => !r.ready).length,
      billed_customers: out.filter((r) => r.contracts > 0).length,
      monthly_value: calc.round2(out.reduce((t, r) => t + r.monthly_value, 0)),
    },
  });
});

/** The whole profile of one customer. */
async function profileDetail(db, companyId) {
  const [[c]] = await db.query(
    `SELECT c.id, c.name, c.display_name, c.type, c.gst_number, c.group_id, g.name AS group_name
       FROM companies c LEFT JOIN group_name g ON g.id = c.group_id WHERE c.id = ?`,
    [companyId]
  );
  if (!c) throw C.notFound("Customer not found");
  const [[p]] = await db.query("SELECT * FROM billing_profiles WHERE company_id = ?", [companyId]);
  const [sites] = await db.query(
    `SELECT s.id, s.name, s.address, s.city, os.print_copies, os.emails
       FROM sites s LEFT JOIN billing_outlet_settings os ON os.site_id = s.id AND os.company_id = s.company_id
      WHERE s.company_id = ? ORDER BY s.name`,
    [companyId]
  );
  const [contracts] = await db.query(
    `SELECT bc.*, (SELECT l.unit FROM billing_contract_lines l WHERE l.contract_id = bc.id AND l.pricing_basis = 'PER_UNIT' AND l.unit LIKE 'sq%'
                    ORDER BY l.is_active DESC, l.sort_order LIMIT 1) AS area_unit,
                  (SELECT bi.invoice_number FROM billing_invoices bi WHERE bi.contract_id = bc.id AND bi.status = 'ISSUED'
                    ORDER BY bi.issued_at DESC LIMIT 1) AS last_invoice
       FROM billing_contracts bc WHERE bc.company_id = ? ORDER BY (bc.status = 'ACTIVE') DESC, bc.created_at DESC`,
    [companyId]
  );
  const [lines] = await db.query(LINES_SQL, [companyId]);
  const [pos] = await db.query(
    `SELECT id, po_number, po_date, expiry_date, po_amount, po_kind, status, contract_id FROM customer_pos
      WHERE company_id = ? ORDER BY (status = 'ACTIVE') DESC, po_date DESC`,
    [companyId]
  );
  const allLines = lines.map(lineOut);
  const today = C.todayIst();
  return {
    customer: {
      company_id: c.id,
      name: c.name,
      display_name: (c.display_name || "").trim(),
      category: calc.categoryOf(c.type),
      gst_number: c.gst_number || null,
      group_id: c.group_id,
      group: c.group_name || null,
    },
    profile: p
      ? {
        billing_name: p.billing_name,
        billing_address: p.billing_address,
        state_code: p.state_code,
        state_name: p.state_name,
        payment_terms_days: Number(p.payment_terms_days),
        is_active: Boolean(p.is_active),
      }
      : null,
    settings: {
      print_copies: p ? Number(p.print_copies) : 1,
      invoice_emails: p ? emailList(p.invoice_emails) : [],
      auto_email: p ? Boolean(Number(p.auto_email)) : false,
      bill_by_day: p && p.bill_by_day !== null ? Number(p.bill_by_day) : null,
    },
    outlets: sites.map((s) => ({
      site_id: s.id,
      name: s.name,
      address: [s.address, s.city].filter(Boolean).join(", "),
      print_copies: s.print_copies === null || s.print_copies === undefined ? null : Number(s.print_copies),
      emails: emailList(s.emails),
      services: allLines.filter((l) => l.site_id === s.id),
    })),
    // Price lines that cover the whole customer (no outlet).
    customer_services: allLines.filter((l) => !l.site_id),
    contracts: contracts.map((bc) => ({
      id: bc.id,
      contract_code: bc.contract_code,
      billing_type: bc.billing_type,
      frequency_months: bc.frequency_months === null ? null : Number(bc.frequency_months),
      frequency_unit: bc.billing_type === "TERMITE" && (bc.frequency_unit === "WEEK" || bc.frequency_unit === "DAY") ? bc.frequency_unit : "MONTH",
      bill_timing: bc.bill_timing,
      // Termite: priced per sq. ft / sq. m of treated area (PER_SQFT / PER_SQM)
      structure: bc.billing_type === "TERMITE" ? (/ft/i.test(bc.area_unit || "") ? "PER_SQFT" : "PER_SQM") : bc.shortfall_billing === "FULL" ? "FIXED" : "SERVICE_BASED",
      invoice_grouping: bc.invoice_grouping,
      gst_applicable: Boolean(bc.gst_applicable),
      gst_rate: Number(bc.gst_rate),
      po_required: Boolean(bc.po_required),
      description_template: bc.description_template,
      start_date: C.ymd(bc.start_date),
      end_date: C.ymd(bc.end_date),
      next_period_start: C.ymd(bc.next_period_start),
      status: bc.status,
      last_invoice: bc.last_invoice || null,
      lines: allLines.filter((l) => l.contract_id === bc.id),
      monthly_value: calc.round2(allLines.filter((l) => l.contract_id === bc.id).reduce((t, l) => t + (l.monthly_value || 0), 0)),
    })),
    pos: pos.map((po) => ({
      id: po.id,
      po_number: po.po_number,
      po_date: C.ymd(po.po_date),
      expiry_date: C.ymd(po.expiry_date),
      po_amount: po.po_amount === null ? null : Number(po.po_amount),
      kind: po.po_kind,
      status: po.status !== "ACTIVE" ? "CLOSED" : po.expiry_date && C.ymd(po.expiry_date) < today ? "EXPIRED" : "ACTIVE",
      contract_id: po.contract_id,
    })),
  };
}

// GET /customer-profiles/:companyId
const getCustomerProfile = C.handle("Failed to load the customer profile", async (req, res) => {
  res.json(await profileDetail(pool, C.str(req.params.companyId, "companyId", { required: true, max: 20 })));
});

// PUT /customer-profiles/:companyId/settings
// { print_copies, invoice_emails, auto_email, bill_by_day, outlets: [{ site_id, print_copies, emails }] }
const saveCustomerSettings = C.handle("Failed to save the invoice settings", async (req, res) => {
  const companyId = C.str(req.params.companyId, "companyId", { required: true, max: 20 });
  const b = req.body || {};
  const [[profile]] = await pool.query("SELECT company_id FROM billing_profiles WHERE company_id = ?", [companyId]);
  // A group contract keeps its print / email settings with its main company, which may have no Bill To
  // of its own (the group's Bill To is used). Then an inactive profile holds just these settings; the
  // company still needs its own Bill To before it can be billed on its own.
  const forGroup = C.bool(b.for_group);
  if (!profile && !forGroup) throw C.bad("Save the billing details (Bill To) first");
  const printCopies = copiesOf(b.print_copies, "print_copies");
  const invoiceEmails = readEmails(b.invoice_emails, "Invoice emails");
  const billBy = C.num(b.bill_by_day, "bill_by_day", { min: 1, max: 30, integer: true });
  const autoEmail = C.bool(b.auto_email);
  const outlets = Array.isArray(b.outlets) ? b.outlets : [];
  const [siteRows] = await pool.query("SELECT id FROM sites WHERE company_id = ?", [companyId]);
  const known = new Set(siteRows.map((s) => s.id));
  const outletRows = outlets.map((o, i) => {
    const siteId = C.str(o?.site_id, `Outlet ${i + 1}`, { required: true, max: 20 });
    if (!known.has(siteId)) throw C.bad("An outlet does not belong to this customer");
    return { siteId, copies: copiesOf(o.print_copies, "Outlet print copies"), emails: readEmails(o.emails, "Outlet emails") };
  });
  // Auto-send needs somewhere to send to.
  if (autoEmail && !invoiceEmails && !outletRows.some((o) => o.emails)) {
    throw C.bad("Add at least one email, or untick \"Send invoices by email automatically\"");
  }
  await C.inTransaction(pool, async (conn) => {
    if (!profile) {
      const [[co]] = await conn.query("SELECT name FROM companies WHERE id = ?", [companyId]);
      if (!co) throw C.notFound("Customer not found");
      await conn.query(
        "INSERT INTO billing_profiles (company_id, billing_name, billing_address, is_active, created_by, updated_by) VALUES (?, ?, '', 0, ?, ?)",
        [companyId, String(co.name || "").trim().slice(0, 255), req.user.id, req.user.id]
      );
    }
    await conn.query(
      "UPDATE billing_profiles SET print_copies = ?, invoice_emails = ?, auto_email = ?, bill_by_day = ?, updated_by = ? WHERE company_id = ?",
      [printCopies, invoiceEmails, autoEmail ? 1 : 0, billBy, req.user.id, companyId]
    );
    for (const o of outletRows) {
      await conn.query(
        `INSERT INTO billing_outlet_settings (company_id, site_id, print_copies, emails, updated_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE print_copies = VALUES(print_copies), emails = VALUES(emails), updated_by = VALUES(updated_by)`,
        [companyId, o.siteId, o.copies, o.emails, req.user.id]
      );
    }
    await logAudit(conn, req, {
      module: "BILLING",
      action: "CUSTOMER_SETTINGS_SAVED",
      entity_type: "BILLING_PROFILE",
      entity_id: companyId,
      entity_label: companyId,
      customer_id: companyId,
      summary: `Invoice settings saved: ${printCopies} cop${printCopies === 1 ? "y" : "ies"}${billBy ? `, bill by day ${billBy}` : ""}, ${outletRows.length} outlet(s)`,
    });
  });
  res.json(await profileDetail(pool, companyId));
});

// GET /customer-options - for the customer filter on every billing list: customers with a contract,
// their group and outlets.
const listOptions = C.handle("Failed to load the customers", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id AS company_id, c.name, g.name AS group_name,
            (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ') FROM sites s WHERE s.company_id = c.id) AS outlets
       FROM companies c LEFT JOIN group_name g ON g.id = c.group_id
      WHERE EXISTS (SELECT 1 FROM billing_contracts bc WHERE bc.company_id = c.id)
      ORDER BY (g.name IS NULL), g.name, c.name`
  );
  res.json(rows.map((r) => ({ id: r.company_id, name: r.name, group: r.group_name || null, outlets: r.outlets || "" })));
});

module.exports = { listProfiles, getCustomerProfile, saveCustomerSettings, profileDetail, listOptions };
