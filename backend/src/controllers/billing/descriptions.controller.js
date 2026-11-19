// Invoice descriptions master (Masters > Invoice Descriptions): the wordings a contract may print on
// its invoices. {month}, {period}, {from_month} and {to_month} are filled in on each invoice.
// Table: data/migrations/20261118b_billing_invoice_descriptions.sql.

const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const { logAudit } = require("../../services/Audit.service");

const PLACEHOLDERS = ["{month}", "{period}", "{from_month}", "{to_month}"];

function out(r) {
  return { id: r.id, text: r.text, is_active: Boolean(r.is_active), sort_order: Number(r.sort_order), contracts: Number(r.contracts || 0), updated_at: r.updated_at };
}

/** The text as entered, checked: required, at most 500 characters, only known {placeholders}. */
function readText(raw) {
  const text = C.str(raw, "text", { required: true, max: 500 }).replace(/\s+/g, " ").trim();
  const unknown = (text.match(/\{[^}]*\}/g) || []).filter((p) => !PLACEHOLDERS.includes(p));
  if (unknown.length) throw C.bad(`Unknown placeholder ${unknown[0]}. Use ${PLACEHOLDERS.join(", ")}.`);
  return text;
}

// GET /descriptions?active=true  (active=true: only the ones a contract may pick)
const list = C.handle("Failed to load the invoice descriptions", async (req, res) => {
  const activeOnly = req.query.active !== undefined && C.bool(req.query.active);
  const [rows] = await pool.query(
    `SELECT d.*, (SELECT COUNT(*) FROM billing_contracts bc WHERE bc.description_template = d.text AND bc.status <> 'ENDED') AS contracts
       FROM billing_invoice_descriptions d
      ${activeOnly ? "WHERE d.is_active = 1" : ""}
      ORDER BY d.is_active DESC, d.sort_order, d.text`
  );
  res.json(rows.map(out));
});

// POST /descriptions { text }
const create = C.handle("Failed to save the invoice description", async (req, res) => {
  const text = readText(req.body?.text);
  const id = uuid();
  const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM billing_invoice_descriptions");
  try {
    await pool.query("INSERT INTO billing_invoice_descriptions (id, text, sort_order, created_by, updated_by) VALUES (?, ?, ?, ?, ?)", [id, text, next, req.user.id, req.user.id]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw C.conflict("This description is already in the list");
    throw err;
  }
  await logAudit(pool, req, { module: "BILLING", action: "INVOICE_DESCRIPTION_ADDED", entity_type: "BILLING_INVOICE_DESCRIPTION", entity_id: id, entity_label: text.slice(0, 100), summary: `Invoice description added: ${text}` });
  const [[row]] = await pool.query("SELECT * FROM billing_invoice_descriptions WHERE id = ?", [id]);
  res.json(out(row));
});

// PUT /descriptions/:id { text?, is_active? }
// Changing the text also changes it on the contracts that use it (they keep printing the same choice).
const update = C.handle("Failed to save the invoice description", async (req, res) => {
  const result = await C.inTransaction(pool, async (conn) => {
    const [[current]] = await conn.query("SELECT * FROM billing_invoice_descriptions WHERE id = ? FOR UPDATE", [req.params.id]);
    if (!current) throw C.notFound("Invoice description not found");
    const text = req.body?.text === undefined ? current.text : readText(req.body.text);
    const active = req.body?.is_active === undefined ? Boolean(current.is_active) : C.bool(req.body.is_active);
    try {
      await conn.query("UPDATE billing_invoice_descriptions SET text = ?, is_active = ?, updated_by = ? WHERE id = ?", [text, active ? 1 : 0, req.user.id, current.id]);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw C.conflict("This description is already in the list");
      throw err;
    }
    let moved = 0;
    if (text !== current.text) {
      const [r] = await conn.query("UPDATE billing_contracts SET description_template = ?, updated_by = ? WHERE description_template = ?", [text, req.user.id, current.text]);
      moved = r.affectedRows || 0;
    }
    await logAudit(conn, req, {
      module: "BILLING",
      action: "INVOICE_DESCRIPTION_CHANGED",
      entity_type: "BILLING_INVOICE_DESCRIPTION",
      entity_id: current.id,
      entity_label: text.slice(0, 100),
      summary: `Invoice description ${text !== current.text ? `changed to "${text}"${moved ? ` (${moved} contract(s) updated)` : ""}` : ""}${Boolean(current.is_active) !== active ? `${text !== current.text ? "; " : ""}${active ? "switched on" : "switched off"}` : ""}`,
    });
    const [[row]] = await conn.query("SELECT * FROM billing_invoice_descriptions WHERE id = ?", [current.id]);
    return { ...out(row), contracts_updated: moved };
  });
  res.json(result);
});

/**
 * Checks a contract's description and keeps the master in step: a contract may pick a wording from
 * the list or type its own. A typed wording (only known {placeholders}) is added to the master so it
 * can be picked next time; a wording that was switched off is switched on again. A contract keeping
 * the description it already has is always fine.
 */
async function assertDescription(db, text, currentText = null, userId = null) {
  if (!text) throw C.bad("Type or choose the description on invoice");
  if (currentText && text === currentText) return;
  const unknown = (text.match(/\{[^}]*\}/g) || []).filter((p) => !PLACEHOLDERS.includes(p));
  if (unknown.length) throw C.bad(`Unknown placeholder ${unknown[0]} in the description. Use ${PLACEHOLDERS.join(", ")}.`);
  const [[row]] = await db.query("SELECT id, is_active FROM billing_invoice_descriptions WHERE text = ?", [text]);
  if (!row) {
    const [[{ next }]] = await db.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM billing_invoice_descriptions");
    await db.query(
      "INSERT IGNORE INTO billing_invoice_descriptions (id, text, sort_order, created_by, updated_by) VALUES (?, ?, ?, ?, ?)",
      [uuid(), text, next, userId, userId]
    );
  } else if (!row.is_active) {
    await db.query("UPDATE billing_invoice_descriptions SET is_active = 1, updated_by = ? WHERE id = ?", [userId, row.id]);
  }
}

module.exports = { list, create, update, assertDescription, PLACEHOLDERS };
