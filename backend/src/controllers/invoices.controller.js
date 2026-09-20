const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { insertInvoiceTds } = require("../services/Tds.service");

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getUserBranchId(connection, userId) {
  const [[row]] = await connection.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
  return row?.branch_id || null;
}

// contacts.company_id actually stores a sites.id (legacy naming) — bridge through
// sites to reach the real companies.id that invoices.customer_id references.
async function getClientCompanyId(connection, userId) {
  const [[row]] = await connection.query(
    `SELECT s.company_id AS company_id
     FROM users u
     JOIN contacts c ON c.id = u.contact_id
     JOIN sites s ON s.id = c.company_id
     WHERE u.id = ?`,
    [userId]
  );
  return row?.company_id || null;
}

function computeInvoiceView(row) {
  const isOverdue =
    row.status !== "PAID" &&
    row.status !== "CANCELLED" &&
    row.due_date &&
    new Date(row.due_date) < new Date(new Date().toDateString());
  return { ...row, display_status: isOverdue ? "OVERDUE" : row.status };
}

async function listInvoices(req, res) {
  const { role, id: userId } = req.user;
  const connection = await pool.getConnection();
  try {
    let where = "";
    let params = [];

    if (role === "client") {
      const companyId = await getClientCompanyId(connection, userId);
      if (!companyId) return res.status(403).json({ error: "Client company not found" });
      where = "WHERE i.customer_id = ?";
      params = [companyId];
    } else if (role !== "admin") {
      const branchId = await getUserBranchId(connection, userId);
      if (!branchId) return res.status(403).json({ error: "Branch not assigned" });
      where = "WHERE s.branch_id = ?";
      params = [branchId];
    }

    const [rows] = await connection.query(
      `SELECT i.*, co.name AS customer_name, co.code AS customer_code, s.name AS site_name,
              (SELECT MAX(p.payment_date) FROM payment_allocations pa
                 JOIN payments p ON p.id = pa.payment_id AND p.status = 'POSTED'
                WHERE pa.invoice_id = i.id) AS last_payment_date,
              t.tds_applicable, t.tds_rate, t.expected_tds, t.deducted_tds, t.pending_tds, t.status AS tds_status
       FROM invoices i
       JOIN companies co ON co.id = i.customer_id
       LEFT JOIN sites s ON s.id = i.site_id
       LEFT JOIN invoice_tds t ON t.invoice_id = i.id
       ${where}
       ORDER BY i.invoice_date DESC, i.created_at DESC`,
      params
    );

    res.json(rows.map(computeInvoiceView));
  } catch (err) {
    console.error("Failed to list invoices:", err);
    res.status(500).json({ error: "Failed to load invoices" });
  } finally {
    connection.release();
  }
}

async function getInvoice(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    const [[invoice]] = await connection.query(
      `SELECT i.*, co.name AS customer_name, co.code AS customer_code, s.name AS site_name
       FROM invoices i
       JOIN companies co ON co.id = i.customer_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE i.id = ?`,
      [id]
    );
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    if (role === "client") {
      const companyId = await getClientCompanyId(connection, userId);
      if (!companyId || invoice.customer_id !== companyId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
    } else if (role !== "admin") {
      const branchId = await getUserBranchId(connection, userId);
      if (!invoice.site_id) return res.status(404).json({ error: "Invoice not found" });
      const [[site]] = await connection.query("SELECT branch_id FROM sites WHERE id = ?", [invoice.site_id]);
      if (!site || site.branch_id !== branchId) return res.status(404).json({ error: "Invoice not found" });
    }

    const [allocations] = await connection.query(
      `SELECT pa.*, p.payment_number, p.payment_date, p.payment_mode, p.reference_number, u.name AS received_by
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE pa.invoice_id = ?
       ORDER BY p.payment_date DESC`,
      [id]
    );

    const [[tds]] = await connection.query("SELECT * FROM invoice_tds WHERE invoice_id = ?", [id]);
    const [tdsHistory] = await connection.query(
      `SELECT tt.id, tt.tds_type, tt.tds_rate, tt.tds_amount, tt.remarks, p.payment_number, p.payment_date
       FROM tds_transactions tt
       JOIN payments p ON p.id = tt.payment_id
       WHERE tt.invoice_id = ?
       ORDER BY p.payment_date DESC, tt.created_at DESC`,
      [id]
    );

    res.json({ ...computeInvoiceView(invoice), allocations, tds: tds || null, tds_history: tdsHistory });
  } catch (err) {
    console.error("Failed to get invoice:", err);
    res.status(500).json({ error: "Failed to load invoice" });
  } finally {
    connection.release();
  }
}

async function createInvoice(req, res) {
  const { role, id: userId } = req.user;
  const { customer_id, site_id, invoice_number, invoice_date, due_date, invoice_amount, remarks } = req.body;

  if (!customer_id || !invoice_number || !invoice_date || !invoice_amount) {
    return res.status(400).json({ error: "customer_id, invoice_number, invoice_date and invoice_amount are required" });
  }
  if (Number(invoice_amount) <= 0) {
    return res.status(400).json({ error: "invoice_amount must be greater than 0" });
  }

  const connection = await pool.getConnection();
  try {
    const [[customer]] = await connection.query("SELECT id, tds_applicable, tds_rate FROM companies WHERE id = ?", [customer_id]);
    if (!customer) throw withStatus("Invalid customer", 400);

    let resolvedSiteId = site_id || null;
    if (resolvedSiteId) {
      const [[site]] = await connection.query(
        "SELECT id, company_id, branch_id FROM sites WHERE id = ?",
        [resolvedSiteId]
      );
      if (!site || site.company_id !== customer_id) throw withStatus("Site does not belong to this customer", 400);
      if (role !== "admin") {
        const branchId = await getUserBranchId(connection, userId);
        if (!branchId || site.branch_id !== branchId) throw withStatus("Cannot create an invoice for another branch", 403);
      }
    } else if (role !== "admin") {
      throw withStatus("site_id is required", 400);
    }

    const id = uuid();
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO invoices
       (id, invoice_number, customer_id, site_id, invoice_date, due_date, invoice_amount, pending_amount, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [id, invoice_number, customer_id, resolvedSiteId, invoice_date, due_date || null, invoice_amount, invoice_amount, remarks || null, userId]
    );
    await insertInvoiceTds(connection, id, customer, invoice_amount);
    await connection.commit();

    res.json({ success: true, id });
  } catch (err) {
    await connection.rollback().catch(() => {});
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An invoice with this number already exists for this customer" });
    }
    console.error("Failed to create invoice:", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to create invoice" });
  } finally {
    connection.release();
  }
}

async function updateInvoice(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const { invoice_date, due_date, invoice_amount, remarks } = req.body;

  const connection = await pool.getConnection();
  try {
    const [[invoice]] = await connection.query("SELECT * FROM invoices WHERE id = ?", [id]);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "CANCELLED") return res.status(400).json({ error: "Cannot edit a cancelled invoice" });

    if (role !== "admin") {
      if (!invoice.site_id) return res.status(403).json({ error: "Forbidden" });
      const branchId = await getUserBranchId(connection, userId);
      const [[site]] = await connection.query("SELECT branch_id FROM sites WHERE id = ?", [invoice.site_id]);
      if (!site || site.branch_id !== branchId) return res.status(403).json({ error: "Forbidden" });
    }

    const newAmount = invoice_amount !== undefined ? Number(invoice_amount) : Number(invoice.invoice_amount);
    if (newAmount <= 0) return res.status(400).json({ error: "invoice_amount must be greater than 0" });
    if (newAmount < Number(invoice.paid_amount)) {
      return res.status(400).json({ error: "invoice_amount cannot be less than the amount already paid" });
    }
    const newPending = newAmount - Number(invoice.paid_amount);
    const newStatus = newPending <= 0 ? "PAID" : Number(invoice.paid_amount) > 0 ? "PARTIAL" : "PENDING";

    await connection.query(
      `UPDATE invoices
       SET invoice_date = ?, due_date = ?, invoice_amount = ?, pending_amount = ?, status = ?, remarks = ?, updated_by = ?
       WHERE id = ?`,
      [
        invoice_date || invoice.invoice_date,
        due_date !== undefined ? due_date : invoice.due_date,
        newAmount,
        newPending,
        newStatus,
        remarks !== undefined ? remarks : invoice.remarks,
        userId,
        id,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update invoice:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  } finally {
    connection.release();
  }
}

async function cancelInvoice(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    const [[invoice]] = await connection.query("SELECT * FROM invoices WHERE id = ?", [id]);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "CANCELLED") return res.status(400).json({ error: "Invoice is already cancelled" });
    if (Number(invoice.paid_amount) > 0) {
      return res.status(400).json({ error: "Cannot cancel an invoice that already has payments allocated to it" });
    }

    if (role !== "admin") {
      if (!invoice.site_id) return res.status(403).json({ error: "Forbidden" });
      const branchId = await getUserBranchId(connection, userId);
      const [[site]] = await connection.query("SELECT branch_id FROM sites WHERE id = ?", [invoice.site_id]);
      if (!site || site.branch_id !== branchId) return res.status(403).json({ error: "Forbidden" });
    }

    await connection.query("UPDATE invoices SET status = 'CANCELLED', updated_by = ? WHERE id = ?", [userId, id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to cancel invoice:", err);
    res.status(500).json({ error: "Failed to cancel invoice" });
  } finally {
    connection.release();
  }
}

module.exports = { listInvoices, getInvoice, createInvoice, updateInvoice, cancelInvoice };
