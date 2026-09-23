const { pool } = require("../../db");

// Keeps the stored invoice status the same as what the screens show.
//  * An unpaid or part-paid invoice whose due date has passed is stored as OVERDUE.
//  * An OVERDUE invoice whose due date is not late (any more) goes back to PENDING, or PARTIAL if something was paid.
// PAID and CANCELLED are never touched. Safe to run as often as needed.
async function syncInvoiceStatuses(executor = pool) {
  const [late] = await executor.query(
    `UPDATE invoices SET status = 'OVERDUE'
     WHERE status IN ('PENDING', 'PARTIAL') AND due_date IS NOT NULL AND due_date < CURDATE()`
  );
  const [restored] = await executor.query(
    `UPDATE invoices SET status = IF(paid_amount > 0, 'PARTIAL', 'PENDING')
     WHERE status = 'OVERDUE' AND (due_date IS NULL OR due_date >= CURDATE())`
  );
  return { markedOverdue: late.affectedRows, restored: restored.affectedRows };
}

// Used after an invoice is created or changed: a failure here must never fail the request itself.
async function syncInvoiceStatusesSafely() {
  try {
    await syncInvoiceStatuses();
  } catch (err) {
    console.error("Invoice status sync failed:", err);
  }
}

module.exports = { syncInvoiceStatuses, syncInvoiceStatusesSafely };
