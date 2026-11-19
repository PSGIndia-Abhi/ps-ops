// Billing frequencies master (Masters > Billing Frequencies): the "every N months" choices a contract
// can pick as its billing frequency (1 to 12 months).
// Table: data/migrations/20261119_billing_frequencies.sql.

const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const { logAudit } = require("../../services/Audit.service");

const label = (m) => `Every ${m} month${m === 1 ? "" : "s"}`;

function out(r) {
  const months = Number(r.months);
  return { months, label: label(months), is_active: Boolean(r.is_active), contracts: Number(r.contracts || 0), updated_at: r.updated_at };
}

/** A whole number of months from 1 to 12. */
const readMonths = (raw) => C.num(raw, "Months", { required: true, integer: true, min: 1, max: 12 });

// GET /frequencies?active=true  (active=true: only the ones a contract may pick)
const list = C.handle("Failed to load the billing frequencies", async (req, res) => {
  const activeOnly = req.query.active !== undefined && C.bool(req.query.active);
  const [rows] = await pool.query(
    `SELECT f.*, (SELECT COUNT(*) FROM billing_contracts bc WHERE bc.frequency_months = f.months AND bc.status <> 'ENDED') AS contracts
       FROM billing_frequencies f
      ${activeOnly ? "WHERE f.is_active = 1" : ""}
      ORDER BY f.months`
  );
  res.json(rows.map(out));
});

// POST /frequencies { months }  - a month already in the list (switched off) is switched on again.
const create = C.handle("Failed to save the billing frequency", async (req, res) => {
  const months = readMonths(req.body?.months);
  const [[existing]] = await pool.query("SELECT is_active FROM billing_frequencies WHERE months = ?", [months]);
  if (existing?.is_active) throw C.conflict(`${label(months)} is already in the list`);
  if (existing) {
    await pool.query("UPDATE billing_frequencies SET is_active = 1, updated_by = ? WHERE months = ?", [req.user.id, months]);
  } else {
    await pool.query("INSERT INTO billing_frequencies (months, created_by, updated_by) VALUES (?, ?, ?)", [months, req.user.id, req.user.id]);
  }
  await logAudit(pool, req, { module: "BILLING", action: "BILLING_FREQUENCY_ADDED", entity_type: "BILLING_FREQUENCY", entity_id: String(months), entity_label: label(months), summary: `Billing frequency added: ${label(months)}` });
  const [[row]] = await pool.query("SELECT * FROM billing_frequencies WHERE months = ?", [months]);
  res.json(out(row));
});

// PUT /frequencies/:months { is_active }  - switching off stops new contracts picking it; contracts
// already on it keep it.
const update = C.handle("Failed to save the billing frequency", async (req, res) => {
  const months = readMonths(req.params.months);
  const active = C.bool(req.body?.is_active);
  const [r] = await pool.query("UPDATE billing_frequencies SET is_active = ?, updated_by = ? WHERE months = ?", [active ? 1 : 0, req.user.id, months]);
  if (!r.affectedRows) throw C.notFound("Billing frequency not found");
  await logAudit(pool, req, { module: "BILLING", action: "BILLING_FREQUENCY_CHANGED", entity_type: "BILLING_FREQUENCY", entity_id: String(months), entity_label: label(months), summary: `Billing frequency ${label(months)} ${active ? "switched on" : "switched off"}` });
  const [[row]] = await pool.query("SELECT * FROM billing_frequencies WHERE months = ?", [months]);
  res.json(out(row));
});

/**
 * Checks a contract's billing frequency against the master: an active entry, or (when a contract is
 * edited) the frequency it already has, even if that entry was switched off since. null = One-time.
 */
async function assertFrequency(db, months, currentMonths = null) {
  if (months === null || months === undefined) return;
  if (currentMonths !== null && currentMonths !== undefined && Number(months) === Number(currentMonths)) return;
  const [[row]] = await db.query("SELECT is_active FROM billing_frequencies WHERE months = ?", [months]);
  if (!row || !row.is_active) throw C.bad(`${label(Number(months))} is not in Masters › Billing Frequencies; choose another or add it there`);
}

module.exports = { list, create, update, assertFrequency };
