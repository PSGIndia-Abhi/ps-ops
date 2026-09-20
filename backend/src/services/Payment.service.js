const { pool } = require("../../db");
const { v4: uuid } = require("uuid");
const { round2, tdsStatus } = require("./Tds.service");

function withStatus(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const EPS = 0.005;

// Records one payment: cash and TDS, split across invoices, in a single transaction.
//
// allocations: [{ invoice_id, cash_amount, tds_amount, tds_type? }]
//   (allocated_amount is accepted as an older name for cash_amount)
//
// Rules:
//  * The cash allocated cannot be more than the cash received.
//  * An invoice with a balance can take cash + TDS up to that balance; both reduce the balance.
//  * An invoice that is already fully paid takes TDS only ("previous TDS"), up to its pending TDS.
//    That never reopens the invoice: invoice status and TDS status are independent.
//  * TDS is only accepted for invoices whose customer has TDS applicable.
async function recordPayment({
  customer_id,
  payment_date,
  received_amount,
  payment_mode,
  reference_number,
  remarks,
  allocations,
  created_by,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[customer]] = await connection.query("SELECT id FROM companies WHERE id = ?", [customer_id]);
    if (!customer) throw withStatus("Invalid customer", 400);

    const cash = round2(received_amount);
    const clean = (allocations || [])
      .map((a) => ({
        invoice_id: a.invoice_id,
        cash: round2(a.cash_amount ?? a.allocated_amount ?? 0),
        tds: round2(a.tds_amount ?? 0),
        tds_type: a.tds_type,
      }))
      .filter((a) => a.invoice_id && (a.cash > 0 || a.tds > 0));

    if (clean.some((a) => a.cash < 0 || a.tds < 0)) throw withStatus("Amounts cannot be negative", 400);
    if (new Set(clean.map((a) => a.invoice_id)).size !== clean.length) {
      throw withStatus("The same invoice appears more than once", 400);
    }

    const cashTotal = round2(clean.reduce((s, a) => s + a.cash, 0));
    const tdsTotal = round2(clean.reduce((s, a) => s + a.tds, 0));
    if (cashTotal > cash + EPS) throw withStatus("Allocated cash cannot exceed the cash received", 400);

    const paymentId = uuid();
    const paymentNumber = `PAY-${Date.now()}`;

    await connection.query(
      `INSERT INTO payments
       (id, payment_number, customer_id, payment_date, received_amount, tds_amount, payment_mode, reference_number, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, paymentNumber, customer_id, payment_date, cash, tdsTotal, payment_mode, reference_number || null, remarks || null, created_by]
    );

    for (const alloc of clean) {
      const [[invoice]] = await connection.query(
        "SELECT * FROM invoices WHERE id = ? AND customer_id = ? FOR UPDATE",
        [alloc.invoice_id, customer_id]
      );
      if (!invoice) throw withStatus("One of the invoices does not belong to this customer", 400);
      if (invoice.status === "CANCELLED") throw withStatus(`Invoice ${invoice.invoice_number} is cancelled`, 400);

      const [[tds]] = await connection.query("SELECT * FROM invoice_tds WHERE invoice_id = ? FOR UPDATE", [invoice.id]);

      const pending = round2(invoice.pending_amount);
      const open = pending > EPS; // the invoice still has a balance

      if (open) {
        if (round2(alloc.cash + alloc.tds) > pending + EPS) {
          throw withStatus(`Cash plus TDS is more than the pending amount on invoice ${invoice.invoice_number}`, 400);
        }
      } else if (alloc.cash > EPS) {
        throw withStatus(`Invoice ${invoice.invoice_number} is already fully paid. Only TDS can be added to it.`, 400);
      }

      if (alloc.tds > 0) {
        if (!tds || !tds.tds_applicable) {
          throw withStatus(`TDS is not applicable for invoice ${invoice.invoice_number}`, 400);
        }
        if (!open && alloc.tds > round2(tds.pending_tds) + EPS) {
          throw withStatus(`TDS is more than the pending TDS on invoice ${invoice.invoice_number}`, 400);
        }
      }

      const allocationId = uuid();
      await connection.query(
        `INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, tds_amount, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [allocationId, paymentId, invoice.id, alloc.cash, alloc.tds, created_by]
      );

      if (alloc.tds > 0) {
        const type = alloc.tds_type === "CURRENT" || alloc.tds_type === "PREVIOUS" ? alloc.tds_type : open ? "CURRENT" : "PREVIOUS";
        await connection.query(
          `INSERT INTO tds_transactions
           (id, payment_id, payment_allocation_id, invoice_id, customer_id, tds_type, tds_rate, tds_amount, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), paymentId, allocationId, invoice.id, customer_id, type, tds.tds_rate, alloc.tds, remarks || null, created_by]
        );

        const deducted = round2(Number(tds.deducted_tds) + alloc.tds);
        const pendingTds = Math.max(0, round2(Number(tds.expected_tds) - deducted));
        await connection.query(
          "UPDATE invoice_tds SET deducted_tds = ?, pending_tds = ?, status = ? WHERE id = ?",
          [deducted, pendingTds, tdsStatus(tds.expected_tds, deducted), tds.id]
        );
      }

      // Cash and TDS both settle an invoice that still has a balance. A fully paid invoice is left alone.
      if (open) {
        const newPaid = round2(Number(invoice.paid_amount) + alloc.cash + alloc.tds);
        const newPending = Math.max(0, round2(Number(invoice.invoice_amount) - newPaid));
        await connection.query(
          "UPDATE invoices SET paid_amount = ?, pending_amount = ?, status = ?, updated_by = ? WHERE id = ?",
          [newPaid, newPending, newPending <= EPS ? "PAID" : "PARTIAL", created_by, invoice.id]
        );
      }
    }

    await connection.commit();
    return paymentId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { recordPayment };
