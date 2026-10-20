const express = require("express");
const router = express.Router();
const { pool } = require("../../db");
const auth = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permission.middleware");
const { uuid, hasPerm, forgetQuoteServices } = require("../utils/crmLeadManagement");

// ---------------------------------------------------------------------------
// Quotation master (crm_quote_*): the services a commercial quotation offers,
// each service's standard treatment rows, the plans (one-time / AMC), a price
// per service and plan, and the standard value-added / terms clauses.
//
// Anyone who works leads reads it (the quotation builder); only lead managers
// (MANAGE_LEADS: sales manager, admin) change it. Services, plans and clauses
// are never deleted - a quotation keeps its own copy of what it used - they are
// switched off instead. Treatment rows and price cells are plain settings and
// are replaced as a whole.
//
// Separate from GET /api/crm/services (crm_services), which is the residential
// price list by house type.
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An entry with this name already exists" });
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
function requireManager(req) {
  if (!hasPerm(req, "MANAGE_LEADS")) throw new HttpError(403, "You cannot change the quotation master");
}

// Text that must be present: trimmed, at least `min` and at most `max` characters.
function requiredText(value, label, max, min = 2) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) throw new HttpError(400, `Enter the ${label}`);
  if (text.length > max) throw new HttpError(400, `The ${label} is too long (max ${max} characters)`);
  return text;
}
function optionalText(value, label, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${label}`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `The ${label} is too long (max ${max} characters)`);
  return text || null;
}
function sortOrder(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, "Invalid sort order");
  return n;
}
function price(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) throw new HttpError(400, "Enter a valid price");
  return Math.round(n * 100) / 100;
}
const flag = (value) => (value ? 1 : 0);

const BILLING = ["ONE_TIME", "MONTHLY", "YEARLY"]; // YEARLY = AMC, one amount per year
const CLAUSE_KINDS = ["VALUE_ADDED", "TERMS"];
const MAX_TREATMENTS = 30;

// A new row goes to the end of its list.
async function nextSortOrder(table, where = "", params = []) {
  const [[row]] = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM ${table} ${where}`, params);
  return Number(row.next);
}

const toService = (r) => ({
  id: r.id, name: r.name, description: r.description, sort_order: Number(r.sort_order), is_active: Number(r.is_active) === 1,
});
const toPlan = (r) => ({
  id: r.id, name: r.name, billing: r.billing, visits_per_month: r.visits_per_month === null ? null : Number(r.visits_per_month),
  sort_order: Number(r.sort_order), is_active: Number(r.is_active) === 1,
});
const toClause = (r) => ({
  id: r.id, kind: r.kind, text: r.text, is_default: Number(r.is_default) === 1, sort_order: Number(r.sort_order), is_active: Number(r.is_active) === 1,
});
const toTreatment = (r) => ({
  id: r.id, defense_area: r.defense_area, material_used: r.material_used, treatment_area: r.treatment_area, frequency: r.frequency,
});

// ---------------------------------------------------------------------------
// GET /api/crm/quote-master
// -> { services: [{ ..., treatments: [...], prices: [{ plan_id, price }] }], plans: [...], clauses: [...] }
// Active items only. ?all=1 (lead managers) also returns switched-off ones, for the master screen.
// ---------------------------------------------------------------------------
router.get("/quote-master", auth, requirePermission("CRM_VIEW_LEAD"), async (req, res) => {
  try {
    const all = req.query.all === "1" && hasPerm(req, "MANAGE_LEADS");
    const active = all ? "" : "WHERE is_active = 1";
    const [services] = await pool.query(`SELECT * FROM crm_quote_services ${active} ORDER BY sort_order, name`);
    const [plans] = await pool.query(`SELECT * FROM crm_quote_plans ${active} ORDER BY sort_order, name`);
    const [clauses] = await pool.query(`SELECT * FROM crm_quote_clauses ${active} ORDER BY kind, sort_order, created_at`);
    const [treatments] = await pool.query("SELECT * FROM crm_quote_service_treatments ORDER BY sort_order");
    const [prices] = await pool.query("SELECT service_id, plan_id, price FROM crm_quote_service_prices");

    const planIds = new Set(plans.map((p) => p.id));
    const byService = new Map(services.map((s) => [s.id, { ...toService(s), treatments: [], prices: [] }]));
    for (const t of treatments) byService.get(t.service_id)?.treatments.push(toTreatment(t));
    for (const p of prices) {
      if (planIds.has(p.plan_id)) byService.get(p.service_id)?.prices.push({ plan_id: p.plan_id, price: Number(p.price) });
    }

    res.json({
      services: [...byService.values()],
      plans: plans.map(toPlan),
      clauses: clauses.map(toClause),
    });
  } catch (err) {
    sendError(res, err, "Failed to load the quotation master");
  }
});

// ---------------------------------------------------------------------------
// Services
// POST  /api/crm/quote-services      { name, description?, sort_order? }
// PATCH /api/crm/quote-services/:id  { name?, description?, sort_order?, is_active? }
// PUT   /api/crm/quote-services/:id/treatments
//       { treatments: [{ defense_area, material_used, treatment_area, frequency }] } -- replaces the list, in this order
// ---------------------------------------------------------------------------
router.post("/quote-services", auth, async (req, res) => {
  try {
    requireManager(req);
    const body = req.body || {};
    const name = requiredText(body.name, "service name", 80);
    const description = optionalText(body.description, "description", 500);
    const order = body.sort_order !== undefined ? sortOrder(body.sort_order) : await nextSortOrder("crm_quote_services");
    const id = uuid();
    await pool.query(
      "INSERT INTO crm_quote_services (id, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, 1)",
      [id, name, description, order]
    );
    forgetQuoteServices(); // lead forms and lead pages pick up the new service
    res.status(201).json({ id, name, description, sort_order: order, is_active: true, treatments: [], prices: [] });
  } catch (err) {
    sendError(res, err, "Failed to add the service");
  }
});

router.patch("/quote-services/:id", auth, async (req, res) => {
  try {
    requireManager(req);
    const [[service]] = await pool.query("SELECT * FROM crm_quote_services WHERE id = ?", [req.params.id]);
    if (!service) throw new HttpError(404, "Service not found");
    const body = req.body || {};
    const next = {
      name: body.name !== undefined ? requiredText(body.name, "service name", 80) : service.name,
      description: body.description !== undefined ? optionalText(body.description, "description", 500) : service.description,
      sort_order: body.sort_order !== undefined ? sortOrder(body.sort_order) : Number(service.sort_order),
      is_active: body.is_active !== undefined ? flag(body.is_active) : Number(service.is_active),
    };
    await pool.query(
      "UPDATE crm_quote_services SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?",
      [next.name, next.description, next.sort_order, next.is_active, service.id]
    );
    forgetQuoteServices();
    res.json(toService({ ...service, ...next }));
  } catch (err) {
    sendError(res, err, "Failed to update the service");
  }
});

router.put("/quote-services/:id/treatments", auth, async (req, res) => {
  try {
    requireManager(req);
    const [[service]] = await pool.query("SELECT id FROM crm_quote_services WHERE id = ?", [req.params.id]);
    if (!service) throw new HttpError(404, "Service not found");
    const list = req.body?.treatments;
    if (!Array.isArray(list)) throw new HttpError(400, "treatments must be a list");
    if (list.length > MAX_TREATMENTS) throw new HttpError(400, `A service can have at most ${MAX_TREATMENTS} treatment rows`);
    const rows = list.map((t, i) => {
      const where = `row ${i + 1}: `;
      try {
        return {
          id: uuid(),
          defense_area: requiredText(t?.defense_area, "defense area", 120),
          material_used: requiredText(t?.material_used, "material used", 160),
          treatment_area: requiredText(t?.treatment_area, "location / treatment area", 255),
          frequency: requiredText(t?.frequency, "frequency", 60),
          sort_order: (i + 1) * 10,
        };
      } catch (err) {
        throw new HttpError(400, where + err.message);
      }
    });

    await inTransaction(async (conn) => {
      await conn.query("DELETE FROM crm_quote_service_treatments WHERE service_id = ?", [service.id]);
      for (const r of rows) {
        await conn.query(
          `INSERT INTO crm_quote_service_treatments (id, service_id, defense_area, material_used, treatment_area, frequency, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [r.id, service.id, r.defense_area, r.material_used, r.treatment_area, r.frequency, r.sort_order]
        );
      }
    });
    res.json(rows.map(toTreatment));
  } catch (err) {
    sendError(res, err, "Failed to save the treatment rows");
  }
});

// ---------------------------------------------------------------------------
// Price chart
// PUT /api/crm/quote-prices  { prices: [{ service_id, plan_id, price }] }
// Sets each listed cell; price null removes it (the plan is then not offered for that service).
// Cells not listed are left as they are.
// ---------------------------------------------------------------------------
router.put("/quote-prices", auth, async (req, res) => {
  try {
    requireManager(req);
    const list = req.body?.prices;
    if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "prices must be a non-empty list");
    if (list.length > 2000) throw new HttpError(400, "Too many prices in one request");

    const [services] = await pool.query("SELECT id FROM crm_quote_services");
    const [plans] = await pool.query("SELECT id FROM crm_quote_plans");
    const serviceIds = new Set(services.map((s) => s.id));
    const planIds = new Set(plans.map((p) => p.id));
    const cells = list.map((c) => {
      if (!serviceIds.has(c?.service_id)) throw new HttpError(400, "Unknown service in the price chart");
      if (!planIds.has(c?.plan_id)) throw new HttpError(400, "Unknown plan in the price chart");
      return { service_id: c.service_id, plan_id: c.plan_id, price: c.price === null || c.price === "" ? null : price(c.price) };
    });

    await inTransaction(async (conn) => {
      for (const c of cells) {
        if (c.price === null) {
          await conn.query("DELETE FROM crm_quote_service_prices WHERE service_id = ? AND plan_id = ?", [c.service_id, c.plan_id]);
        } else {
          await conn.query(
            `INSERT INTO crm_quote_service_prices (service_id, plan_id, price) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [c.service_id, c.plan_id, c.price]
          );
        }
      }
    });
    res.json({ saved: cells.length });
  } catch (err) {
    sendError(res, err, "Failed to save the prices");
  }
});

// ---------------------------------------------------------------------------
// Plans
// POST  /api/crm/quote-plans      { name, billing: ONE_TIME|MONTHLY|YEARLY, visits_per_month?, sort_order? }
// PATCH /api/crm/quote-plans/:id  { name?, billing?, visits_per_month?, sort_order?, is_active? }
//
// visits_per_month is the number of services in one billing period: per month for a
// MONTHLY plan, per year for a YEARLY (AMC) plan, none for ONE_TIME.
//
// A plan's name is also what a treatment row shows as its Frequency (e.g. "Weekly Once"), so
// renaming a plan also renames it on the master's treatment rows. Quotations keep their own copy.
// ---------------------------------------------------------------------------
function planBilling(value) {
  if (!BILLING.includes(value)) throw new HttpError(400, "billing must be ONE_TIME, MONTHLY or YEARLY");
  return value;
}
function visitsPerPeriod(value, billing) {
  if (billing === "ONE_TIME" || value === null || value === undefined || value === "") return null;
  const max = billing === "YEARLY" ? 365 : 31;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new HttpError(400, `Services per ${billing === "YEARLY" ? "year" : "month"} must be between 1 and ${max}`);
  }
  return n;
}

router.post("/quote-plans", auth, async (req, res) => {
  try {
    requireManager(req);
    const body = req.body || {};
    const name = requiredText(body.name, "plan name", 60);
    const billing = planBilling(body.billing || "MONTHLY");
    const visits = visitsPerPeriod(body.visits_per_month, billing);
    const order = body.sort_order !== undefined ? sortOrder(body.sort_order) : await nextSortOrder("crm_quote_plans");
    const id = uuid();
    await pool.query(
      "INSERT INTO crm_quote_plans (id, name, billing, visits_per_month, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [id, name, billing, visits, order]
    );
    res.status(201).json(toPlan({ id, name, billing, visits_per_month: visits, sort_order: order, is_active: 1 }));
  } catch (err) {
    sendError(res, err, "Failed to add the plan");
  }
});

router.patch("/quote-plans/:id", auth, async (req, res) => {
  try {
    requireManager(req);
    const [[plan]] = await pool.query("SELECT * FROM crm_quote_plans WHERE id = ?", [req.params.id]);
    if (!plan) throw new HttpError(404, "Plan not found");
    const body = req.body || {};
    const billing = body.billing !== undefined ? planBilling(body.billing) : plan.billing;
    const next = {
      name: body.name !== undefined ? requiredText(body.name, "plan name", 60) : plan.name,
      billing,
      visits_per_month: body.visits_per_month !== undefined ? visitsPerPeriod(body.visits_per_month, billing) : billing === "ONE_TIME" ? null : plan.visits_per_month,
      sort_order: body.sort_order !== undefined ? sortOrder(body.sort_order) : Number(plan.sort_order),
      is_active: body.is_active !== undefined ? flag(body.is_active) : Number(plan.is_active),
    };
    await inTransaction(async (conn) => {
      await conn.query(
        "UPDATE crm_quote_plans SET name = ?, billing = ?, visits_per_month = ?, sort_order = ?, is_active = ? WHERE id = ?",
        [next.name, next.billing, next.visits_per_month, next.sort_order, next.is_active, plan.id]
      );
      if (next.name !== plan.name) {
        await conn.query("UPDATE crm_quote_service_treatments SET frequency = ? WHERE frequency = ?", [next.name, plan.name]);
      }
    });
    res.json(toPlan({ ...plan, ...next }));
  } catch (err) {
    sendError(res, err, "Failed to update the plan");
  }
});

// ---------------------------------------------------------------------------
// Clauses
// POST  /api/crm/quote-clauses      { kind: VALUE_ADDED|TERMS, text, is_default?, sort_order? }
// PATCH /api/crm/quote-clauses/:id  { text?, is_default?, sort_order?, is_active? }
// ---------------------------------------------------------------------------
router.post("/quote-clauses", auth, async (req, res) => {
  try {
    requireManager(req);
    const body = req.body || {};
    if (!CLAUSE_KINDS.includes(body.kind)) throw new HttpError(400, "kind must be VALUE_ADDED or TERMS");
    const text = requiredText(body.text, "clause text", 500, 3);
    const isDefault = flag(body.is_default);
    const order = body.sort_order !== undefined
      ? sortOrder(body.sort_order)
      : await nextSortOrder("crm_quote_clauses", "WHERE kind = ?", [body.kind]);
    const id = uuid();
    await pool.query(
      "INSERT INTO crm_quote_clauses (id, kind, text, is_default, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [id, body.kind, text, isDefault, order]
    );
    res.status(201).json(toClause({ id, kind: body.kind, text, is_default: isDefault, sort_order: order, is_active: 1 }));
  } catch (err) {
    sendError(res, err, "Failed to add the clause");
  }
});

router.patch("/quote-clauses/:id", auth, async (req, res) => {
  try {
    requireManager(req);
    const [[clause]] = await pool.query("SELECT * FROM crm_quote_clauses WHERE id = ?", [req.params.id]);
    if (!clause) throw new HttpError(404, "Clause not found");
    const body = req.body || {};
    const next = {
      text: body.text !== undefined ? requiredText(body.text, "clause text", 500, 3) : clause.text,
      is_default: body.is_default !== undefined ? flag(body.is_default) : Number(clause.is_default),
      sort_order: body.sort_order !== undefined ? sortOrder(body.sort_order) : Number(clause.sort_order),
      is_active: body.is_active !== undefined ? flag(body.is_active) : Number(clause.is_active),
    };
    await pool.query(
      "UPDATE crm_quote_clauses SET text = ?, is_default = ?, sort_order = ?, is_active = ? WHERE id = ?",
      [next.text, next.is_default, next.sort_order, next.is_active, clause.id]
    );
    res.json(toClause({ ...clause, ...next }));
  } catch (err) {
    sendError(res, err, "Failed to update the clause");
  }
});

module.exports = router;
