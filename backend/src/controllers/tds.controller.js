const { pool } = require("../../db");

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
      `SELECT c.id, COALESCE(c.display_name, c.name) AS name, c.code, c.tds_applicable, c.tds_rate
       FROM companies c
       WHERE c.is_active = 1 ${filter.where}
       ORDER BY COALESCE(c.display_name, c.name) ASC`,
      filter.params
    );
    res.json(rows.map((r) => ({ ...r, tds_applicable: Boolean(r.tds_applicable), tds_rate: r.tds_rate == null ? null : Number(r.tds_rate) })));
  } catch (err) {
    console.error("Failed to list TDS settings:", err);
    res.status(500).json({ error: "Failed to load the TDS settings" });
  } finally {
    connection.release();
  }
}

// PUT /api/invoices/tds-settings/:customerId
// body: { tds_applicable, tds_rate, apply_to_existing }
// New invoices copy this setting when they are created. Existing invoices keep the rate they were created with,
// unless apply_to_existing is true; then only invoices with no TDS deducted yet are refreshed.
async function updateTdsSettings(req, res) {
  const { customerId } = req.params;
  const applicable = Boolean(req.body?.tds_applicable);
  const rate = req.body?.tds_rate === "" || req.body?.tds_rate == null ? null : Number(req.body.tds_rate);

  if (applicable && !(rate > 0 && rate <= 100)) {
    return res.status(400).json({ error: "Enter a TDS rate between 0 and 100" });
  }

  const connection = await pool.getConnection();
  try {
    const filter = await visibleCustomerFilter(connection, req.user);
    if (!filter) return res.status(403).json({ error: "Branch not assigned" });

    const [[customer]] = await connection.query(
      `SELECT c.id FROM companies c WHERE c.id = ? ${filter.where}`,
      [customerId, ...filter.params]
    );
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    await connection.beginTransaction();
    await connection.query("UPDATE companies SET tds_applicable = ?, tds_rate = ? WHERE id = ?", [
      applicable ? 1 : 0,
      applicable ? rate : null,
      customerId,
    ]);

    let updated = 0;
    if (req.body?.apply_to_existing) {
      const [result] = applicable
        ? await connection.query(
            `UPDATE invoice_tds t
             JOIN invoices i ON i.id = t.invoice_id
             SET t.tds_applicable = 1, t.tds_rate = ?,
                 t.expected_tds = ROUND(i.invoice_amount * ? / 100, 2),
                 t.pending_tds = ROUND(i.invoice_amount * ? / 100, 2),
                 t.status = 'PENDING'
             WHERE i.customer_id = ? AND i.status <> 'CANCELLED' AND t.deducted_tds = 0`,
            [rate, rate, rate, customerId]
          )
        : await connection.query(
            `UPDATE invoice_tds t
             JOIN invoices i ON i.id = t.invoice_id
             SET t.tds_applicable = 0, t.tds_rate = NULL, t.expected_tds = 0, t.pending_tds = 0, t.status = 'NOT_APPLICABLE'
             WHERE i.customer_id = ? AND t.deducted_tds = 0`,
            [customerId]
          );
      updated = result.affectedRows || 0;
    }
    await connection.commit();

    res.json({ success: true, updated_invoices: updated });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("Failed to update TDS settings:", err);
    res.status(500).json({ error: "Failed to save the TDS settings" });
  } finally {
    connection.release();
  }
}

module.exports = { listTdsSettings, updateTdsSettings };
