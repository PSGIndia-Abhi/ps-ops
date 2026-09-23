const { pool } = require("../../db");
const { recordPayment } = require("../services/Payment.service");

async function getUserBranchId(connection, userId) {
  const [[row]] = await connection.query("SELECT branch_id FROM users WHERE id = ?", [userId]);
  return row?.branch_id || null;
}

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

async function listPayments(req, res) {
  const { role, id: userId } = req.user;
  const connection = await pool.getConnection();
  try {
    let where = "";
    let params = [];

    if (role === "client") {
      const companyId = await getClientCompanyId(connection, userId);
      if (!companyId) return res.status(403).json({ error: "Client company not found" });
      where = "WHERE p.customer_id = ?";
      params = [companyId];
    } else if (role !== "admin") {
      const branchId = await getUserBranchId(connection, userId);
      if (!branchId) return res.status(403).json({ error: "Branch not assigned" });
      where = "WHERE EXISTS (SELECT 1 FROM sites s WHERE s.company_id = p.customer_id AND s.branch_id = ?)";
      params = [branchId];
    }

    const [rows] = await connection.query(
      `SELECT p.*, COALESCE(co.display_name, co.name) AS customer_name, co.code AS customer_code, u.name AS created_by_name,
              (SELECT COALESCE(SUM(pa.allocated_amount), 0) FROM payment_allocations pa WHERE pa.payment_id = p.id) AS allocated_amount
       FROM payments p
       JOIN companies co ON co.id = p.customer_id
       LEFT JOIN users u ON u.id = p.created_by
       ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to list payments:", err);
    res.status(500).json({ error: "Failed to load payments" });
  } finally {
    connection.release();
  }
}

async function getPayment(req, res) {
  const { role, id: userId } = req.user;
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    const [[payment]] = await connection.query(
      `SELECT p.*, COALESCE(co.display_name, co.name) AS customer_name, co.code AS customer_code
       FROM payments p
       JOIN companies co ON co.id = p.customer_id
       WHERE p.id = ?`,
      [id]
    );
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    if (role === "client") {
      const companyId = await getClientCompanyId(connection, userId);
      if (!companyId || payment.customer_id !== companyId) {
        return res.status(404).json({ error: "Payment not found" });
      }
    } else if (role !== "admin") {
      const branchId = await getUserBranchId(connection, userId);
      const [[hasSite]] = await connection.query(
        "SELECT 1 AS ok FROM sites WHERE company_id = ? AND branch_id = ? LIMIT 1",
        [payment.customer_id, branchId]
      );
      if (!hasSite) return res.status(404).json({ error: "Payment not found" });
    }

    const [allocations] = await connection.query(
      `SELECT pa.*, i.invoice_number, tt.tds_type
       FROM payment_allocations pa
       JOIN invoices i ON i.id = pa.invoice_id
       LEFT JOIN tds_transactions tt ON tt.payment_allocation_id = pa.id
       WHERE pa.payment_id = ?`,
      [id]
    );

    res.json({ ...payment, allocations });
  } catch (err) {
    console.error("Failed to get payment:", err);
    res.status(500).json({ error: "Failed to load payment" });
  } finally {
    connection.release();
  }
}

async function createPayment(req, res) {
  const { role, id: userId } = req.user;
  const { customer_id, payment_date, received_amount, payment_mode, reference_number, remarks, allocations } = req.body;

  if (!customer_id || !payment_date || !received_amount || !payment_mode) {
    return res.status(400).json({ error: "customer_id, payment_date, received_amount and payment_mode are required" });
  }
  if (Number(received_amount) <= 0) {
    return res.status(400).json({ error: "received_amount must be greater than 0" });
  }

  if (role !== "admin") {
    const connection = await pool.getConnection();
    try {
      const branchId = await getUserBranchId(connection, userId);
      const [[hasSite]] = await connection.query(
        "SELECT 1 AS ok FROM sites WHERE company_id = ? AND branch_id = ? LIMIT 1",
        [customer_id, branchId]
      );
      if (!hasSite) return res.status(403).json({ error: "Cannot record a payment for another branch's customer" });
    } finally {
      connection.release();
    }
  }

  try {
    const paymentId = await recordPayment({
      customer_id,
      payment_date,
      received_amount,
      payment_mode,
      reference_number,
      remarks,
      allocations,
      created_by: userId,
    });
    res.json({ success: true, id: paymentId });
  } catch (err) {
    console.error("Failed to create payment:", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to create payment" });
  }
}

module.exports = { listPayments, getPayment, createPayment };
