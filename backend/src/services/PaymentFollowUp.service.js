const { pool } = require("../../db");
const { logHistory } = require("../utils/workTasks");

// Payment follow-ups are ordinary Task Management tasks (work_tasks). What makes
// one a payment follow-up is where it points:
//   source_module = PAYMENT_CUSTOMER, source_id = companies.id  -> the customer's whole outstanding
//   source_module = PAYMENT_INVOICE,  source_id = invoices.id   -> one invoice
// No extra table: the amount is always read live from `invoices`.
const FOLLOWUP_MODULES = { CUSTOMER: "PAYMENT_CUSTOMER", INVOICE: "PAYMENT_INVOICE" };
const ACTIVE = ["OPEN", "IN_PROGRESS", "PAUSED"];
const EPS = 0.005;

// Completes the customer's open payment follow-ups whose outstanding is now
// cleared: a customer follow-up when the customer owes nothing, an invoice
// follow-up when that invoice owes nothing. Each one gets a COMPLETE entry in
// work_task_history, so the follow-up's trail shows why it closed.
async function closeClearedFollowUps(customerId, { userId = null, paymentNumber = null } = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [tasks] = await connection.query(
      `SELECT id, status, source_module, source_id
         FROM work_tasks
        WHERE status IN (?)
          AND ((source_module = ? AND source_id = ?)
            OR (source_module = ? AND source_id IN (SELECT id FROM invoices WHERE customer_id = ?)))
        FOR UPDATE`,
      [ACTIVE, FOLLOWUP_MODULES.CUSTOMER, customerId, FOLLOWUP_MODULES.INVOICE, customerId]
    );
    if (!tasks.length) {
      await connection.commit();
      return 0;
    }

    const [invoices] = await connection.query(
      "SELECT id, pending_amount FROM invoices WHERE customer_id = ? AND status <> 'CANCELLED'",
      [customerId]
    );
    const pendingById = new Map(invoices.map((i) => [i.id, Number(i.pending_amount) || 0]));
    const customerPending = invoices.reduce((s, i) => s + (Number(i.pending_amount) || 0), 0);

    const note = `Outstanding cleared${paymentNumber ? ` (payment ${paymentNumber})` : ""}`;
    let closed = 0;
    for (const task of tasks) {
      const cleared =
        task.source_module === FOLLOWUP_MODULES.CUSTOMER
          ? customerPending <= EPS
          : customerPending <= EPS || (pendingById.get(task.source_id) ?? 0) <= EPS;
      if (!cleared) continue;

      // paused_seconds/paused_at are set before status, so the IF still sees the old status.
      const [result] = await connection.query(
        `UPDATE work_tasks
            SET paused_seconds = paused_seconds + IF(status = 'PAUSED', GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(paused_at, NOW()), NOW())), 0),
                paused_at = NULL,
                status = 'COMPLETED', completed_at = NOW(), completed_by = ?, completion_note = ?
          WHERE id = ? AND status IN (?)`,
        [userId, note, task.id, ACTIVE]
      );
      if (!result.affectedRows) continue;
      await logHistory(connection, task.id, "COMPLETE", { fromStatus: task.status, toStatus: "COMPLETED", note, changedBy: userId });
      closed += 1;
    }

    await connection.commit();
    return closed;
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

// Used right after a payment is saved: a failure here must never fail the payment itself.
async function closeClearedFollowUpsSafely(customerId, options) {
  try {
    return await closeClearedFollowUps(customerId, options);
  } catch (err) {
    console.error("Payment follow-up auto-complete failed:", err);
    return 0;
  }
}

module.exports = { FOLLOWUP_MODULES, closeClearedFollowUps, closeClearedFollowUpsSafely };
