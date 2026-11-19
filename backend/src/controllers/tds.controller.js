const { pool } = require("../../db");
const { logAudit } = require("../services/Audit.service");
const { TDS_BASES, normalizeBasis, roundRupee, tdsBaseAmount, tdsBaseSql } = require("../services/Tds.service");

async function getUserBranchId(connection, userId) {
  const [[row]] = await connection.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
  return row?.branch_id || null;
}

// Customers the user may see: everything for an admin, otherwise customers with a site in the user's branch.
async function visibleCustomerFilter(connection, user) {
  if (user.role === "admin") return { where: "", params: [] };
  const branchId = await getUserBranchId(connection, user.id);
  if (!branchId) return null;
  return {
    where: "AND EXISTS (SELECT 1 FROM sites s WHERE s.company_id = c.id AND s.branch_id = ?)",
    params: [branchId],
  };
}

// GET /api/invoices/tds-settings
async function listTdsSettings(req, res) {
  const connection = await pool.getConnection();
  try {
    const filter = await visibleCustomerFilter(connection, req.user);
    if (!filter) return res.status(403).json({ error: "Branch not assigned" });

    const [rows] = await connection.query(
      `SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.code, c.tds_applicable, c.tds_rate, c.tds_basis
       FROM companies c
       WHERE c.is_active = 1 ${filter.where}
       ORDER BY COALESCE(c.display_name, c.name) ASC`,
      filter.params
    );
    res.json(rows.map((r) => ({
      ...r,
      tds_applicable: Boolean(r.tds_applicable),
      tds_rate: r.tds_rate == null ? null : Number(r.tds_rate),
      tds_basis: normalizeBasis(r.tds_basis),
    })));
  } catch (err) {
    console.error("Failed to list TDS settings:", err);
    res.status(500).json({ error: "Failed to load the TDS settings" });
  } finally {
    connection.release();
  }
}

function readTdsInput(body) {
  const applicable = Boolean(body?.tds_applicable);
  const rate = body?.tds_rate === "" || body?.tds_rate == null ? null : Number(body.tds_rate);
  // tds_basis is optional: when it is not sent, each customer keeps the basis it has.
  const basis = body?.tds_basis == null || body.tds_basis === "" ? null : String(body.tds_basis).toUpperCase();
  return { applicable, rate, basis, applyToExisting: Boolean(body?.apply_to_existing) };
}

const BASIS_LABEL = { INVOICE: "Invoice TDS", TAXABLE: "Taxable TDS" };
const tdsLabel = (on, r, basis) => (on ? `On · ${r}% · ${BASIS_LABEL[normalizeBasis(basis)]}` : "Off");

// Saves one TDS setting for a set of customer records in ONE transaction, and writes ONE
// audit entry for them. The TDS Settings page shows records with the same display name
// (e.g. one per outlet) as one row; a change to that row is one action, so it is one entry.
// New invoices copy this setting when they are created. Existing invoices keep the rate they
// were created with, unless apply_to_existing is true; then only invoices with no TDS deducted
// yet are refreshed.
async function saveTdsSetting(req, res, customerIds) {
  const { applicable, rate, basis, applyToExisting } = readTdsInput(req.body);
  if (applicable && !(rate > 0 && rate <= 100)) {
    return res.status(400).json({ error: "Enter a TDS rate between 0 and 100" });
  }
  if (basis !== null && !TDS_BASES.includes(basis)) {
    return res.status(400).json({ error: "TDS basis must be INVOICE or TAXABLE" });
  }
  const ids = [...new Set((customerIds || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: "No customer selected" });
  if (ids.length > 200) return res.status(400).json({ error: "Too many customer records in one save" });

  const connection = await pool.getConnection();
  try {
    const filter = await visibleCustomerFilter(connection, req.user);
    if (!filter) return res.status(403).json({ error: "Branch not assigned" });

    const [customers] = await connection.query(
      `SELECT c.id, c.name AS record_name, COALESCE(c.display_name, c.name) AS name, c.tds_applicable, c.tds_rate, c.tds_basis
       FROM companies c WHERE c.id IN (?) ${filter.where}`,
      [ids, ...filter.params]
    );
    // Every record must exist and be visible to this user; otherwise nothing is saved.
    if (customers.length !== ids.length) return res.status(404).json({ error: "Customer not found" });
    // Each record's basis after the save: the one sent, otherwise the one it already has.
    const basisAfter = (c) => basis || normalizeBasis(c.tds_basis);
    const customerById = new Map(customers.map((c) => [c.id, c]));

    await connection.beginTransaction();

    // The invoices "apply to existing" will touch, with their TDS before the change (for the audit).
    const [touched] = applyToExisting
      ? await connection.query(
          `SELECT i.id, i.customer_id, i.invoice_number, i.invoice_amount, i.taxable_amount, t.pending_tds
           FROM invoice_tds t JOIN invoices i ON i.id = t.invoice_id
           WHERE i.customer_id IN (?) AND t.deducted_tds = 0 ${applicable ? "AND i.status <> 'CANCELLED'" : ""}
           ORDER BY i.invoice_date, i.invoice_number`,
          [ids]
        )
      : [[]];

    await connection.query("UPDATE companies SET tds_applicable = ?, tds_rate = ?, tds_basis = COALESCE(?, tds_basis) WHERE id IN (?)", [
      applicable ? 1 : 0,
      applicable ? rate : null,
      basis,
      ids,
    ]);

    let updated = 0;
    if (applyToExisting) {
      const [result] = applicable
        ? await connection.query(
            // The customer's basis was saved just above, so it is read back from companies (c.tds_basis).
            `UPDATE invoice_tds t
             JOIN invoices i ON i.id = t.invoice_id
             JOIN companies c ON c.id = i.customer_id
             SET t.tds_applicable = 1, t.tds_rate = ?, t.tds_basis = c.tds_basis,
                 t.expected_tds = ROUND(${tdsBaseSql("c.tds_basis")} * ? / 100, 0),
                 t.pending_tds = ROUND(${tdsBaseSql("c.tds_basis")} * ? / 100, 0),
                 t.status = 'PENDING'
             WHERE i.customer_id IN (?) AND i.status <> 'CANCELLED' AND t.deducted_tds = 0`,
            [rate, rate, rate, ids]
          )
        : await connection.query(
            `UPDATE invoice_tds t
             JOIN invoices i ON i.id = t.invoice_id
             SET t.tds_applicable = 0, t.tds_rate = NULL, t.expected_tds = 0, t.pending_tds = 0, t.status = 'NOT_APPLICABLE'
             WHERE i.customer_id IN (?) AND t.deducted_tds = 0`,
            [ids]
          );
      updated = result.affectedRows || 0;
    }

    // One audit entry for the whole save. "Before" is the old setting; if the records
    // differed (e.g. one On, one Off) it is shown as "Mixed".
    const befores = [...new Set(customers.map((c) => tdsLabel(Boolean(c.tds_applicable), c.tds_rate == null ? null : Number(c.tds_rate), c.tds_basis)))];
    const changedRecords = customers.filter((c) => {
      const wasOn = Boolean(c.tds_applicable);
      const oldRate = c.tds_rate == null ? null : Number(c.tds_rate);
      return wasOn !== applicable || (applicable && (oldRate !== rate || normalizeBasis(c.tds_basis) !== basisAfter(c)));
    });
    if (changedRecords.length || touched.length) {
      const first = customers.find((c) => c.id === ids[0]) || customers[0];
      const same = befores.length === 1;
      const wasOn = Boolean(first.tds_applicable);
      const oldRate = first.tds_rate == null ? null : Number(first.tds_rate);
      const oldBasis = normalizeBasis(first.tds_basis);
      await logAudit(connection, req, {
        module: "TDS",
        action: applicable ? "TDS_SETTING_CHANGED" : "TDS_REMOVED",
        entity_type: "CUSTOMER",
        entity_id: first.id,
        entity_label: first.name,
        customer_id: first.id,
        summary: `TDS ${same ? befores[0] : "Mixed"} → ${tdsLabel(applicable, rate, basisAfter(first))}${
          customers.length > 1 ? ` · ${customers.length} customer records` : ""
        }${applyToExisting ? ` · ${updated} existing invoice(s) updated` : ""}`,
        changes: changedRecords.length
          ? [
              { field: "tds_applicable", from: same ? wasOn : "Mixed", to: applicable },
              { field: "tds_rate", from: same ? oldRate : "Mixed", to: applicable ? rate : null },
              ...(applicable && oldBasis !== basisAfter(first)
                ? [{ field: "tds_basis", from: same ? oldBasis : "Mixed", to: basisAfter(first) }]
                : []),
            ]
          : [],
        details: {
          customer_name: first.name,
          apply_to_existing: applyToExisting,
          records: customers.map((c) => ({ customer_id: c.id, name: c.record_name })),
          invoices: touched.map((i) => ({
            invoice_id: i.id,
            invoice_number: i.invoice_number,
            tds_before: Number(i.pending_tds),
            tds_after: applicable
              ? roundRupee((tdsBaseAmount(basisAfter(customerById.get(i.customer_id) || first), i.invoice_amount, i.taxable_amount) * rate) / 100)
              : 0,
          })),
        },
        refs: [
          ...customers.map((c) => ({ entity_type: "CUSTOMER", entity_id: c.id })),
          ...touched.map((i) => ({ entity_type: "INVOICE", entity_id: i.id })),
        ],
      });
    }
    await connection.commit();

    res.json({ success: true, updated_invoices: updated, customers: customers.length });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("Failed to update TDS settings:", err);
    res.status(500).json({ error: "Failed to save the TDS settings" });
  } finally {
    connection.release();
  }
}

// PUT /api/invoices/tds-settings/:customerId   { tds_applicable, tds_rate, tds_basis?, apply_to_existing }
// One customer record (unchanged API).
async function updateTdsSettings(req, res) {
  return saveTdsSetting(req, res, [req.params.customerId]);
}

// PUT /api/invoices/tds-settings   { customer_ids: [...], tds_applicable, tds_rate, tds_basis?, apply_to_existing }
// Every record of one TDS Settings row, saved together: all change or none do.
async function updateTdsSettingsBulk(req, res) {
  const ids = req.body?.customer_ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "customer_ids must be a list" });
  return saveTdsSetting(req, res, ids);
}

module.exports = { listTdsSettings, updateTdsSettings, updateTdsSettingsBulk };
