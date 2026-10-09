const { pool } = require("../../db");
const { logHistory } = require("../utils/workTasks");
const { notifyPaymentReminderDue } = require("./notifications.service");

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
    const [invoices] = await connection.query(
      "SELECT id, pending_amount FROM invoices WHERE customer_id = ? AND status <> 'CANCELLED'",
      [customerId]
    );
    const pendingById = new Map(invoices.map((i) => [i.id, Number(i.pending_amount) || 0]));
    const customerPending = invoices.reduce((s, i) => s + (Number(i.pending_amount) || 0), 0);

    // A repeating reminder for one invoice has nothing left to chase once that invoice is
    // paid, so its schedule is stopped (no more reminders are made). A repeating reminder
    // for the whole customer keeps running: the customer will be invoiced again.
    const paidInvoiceIds = invoices.filter((i) => (Number(i.pending_amount) || 0) <= EPS).map((i) => i.id);
    if (paidInvoiceIds.length) {
      await connection.query(
        `UPDATE work_task_series SET status = 'CANCELLED', pause_from = NULL, pause_until = NULL
          WHERE status IN ('ACTIVE', 'PAUSED') AND source_module = ? AND source_id IN (?)`,
        [FOLLOWUP_MODULES.INVOICE, paidInvoiceIds]
      );
    }

    if (!tasks.length) {
      await connection.commit();
      return 0;
    }

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

const inr = (n) => `₹ ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// "10:00:00" -> "10:00 AM"
function clockLabel(time) {
  if (!time) return "";
  const [h, m] = String(time).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Timed reminders. Sends one notification to a payment reminder's owner when its date and
// time arrive (a reminder with no time counts as 9:00 AM). Runs every minute from the cron.
//
// No extra column is needed to remember what was sent: a reminder is alerted only if there is
// no PAYMENT_REMINDER notification for it created at/after its current due time. So it never
// alerts twice for the same time, and a rescheduled reminder alerts again at its new time.
// Reminders that came due more than a day ago are left alone (they already show as Overdue),
// so switching this on does not flood anyone with old alerts.
async function sendDueReminderAlerts() {
  const dueAt = "TIMESTAMP(t.due_date, COALESCE(t.due_time, '09:00:00'))";

  const [due] = await pool.query(
    `SELECT t.id, t.assigned_to, t.source_module, t.source_id, t.due_time
       FROM work_tasks t
      WHERE t.status IN (?)
        AND t.source_module IN (?, ?)
        AND ${dueAt} BETWEEN NOW() - INTERVAL 1 DAY AND NOW()
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.type = 'PAYMENT_REMINDER' AND n.entity_type = 'payment_reminder'
             AND n.entity_id = t.id AND n.user_id = t.assigned_to
             AND n.created_at >= ${dueAt})`,
    [ACTIVE, FOLLOWUP_MODULES.CUSTOMER, FOLLOWUP_MODULES.INVOICE]
  );

  let sent = 0;
  for (const task of due) {
    let name = "Customer";
    let detail = "";
    if (task.source_module === FOLLOWUP_MODULES.INVOICE) {
      const [[inv]] = await pool.query(
        `SELECT i.invoice_number, i.pending_amount, COALESCE(co.display_name, co.name) AS customer_name
           FROM invoices i JOIN companies co ON co.id = i.customer_id WHERE i.id = ?`,
        [task.source_id]
      );
      if (inv) {
        name = String(inv.customer_name || name).trim();
        detail = `Invoice ${inv.invoice_number} · ${inr(inv.pending_amount)} pending`;
      }
    } else {
      const [[co]] = await pool.query("SELECT COALESCE(display_name, name) AS name FROM companies WHERE id = ?", [task.source_id]);
      const [[tot]] = await pool.query(
        `SELECT COALESCE(SUM(pending_amount), 0) AS pending, COUNT(*) AS invoices
           FROM invoices WHERE customer_id = ? AND status <> 'CANCELLED' AND pending_amount > 0`,
        [task.source_id]
      );
      if (co) name = String(co.name || name).trim();
      detail = `${inr(tot.pending)} outstanding · ${tot.invoices} unpaid invoice${Number(tot.invoices) === 1 ? "" : "s"}`;
    }

    const time = clockLabel(task.due_time);
    await notifyPaymentReminderDue({
      userId: task.assigned_to,
      taskId: task.id,
      title: `Payment reminder: ${name}`.slice(0, 255),
      message: `Due now${time ? ` (${time})` : ""}${detail ? ` · ${detail}` : ""}`,
    });
    sent += 1;
  }
  return sent;
}

module.exports = { FOLLOWUP_MODULES, closeClearedFollowUps, closeClearedFollowUpsSafely, sendDueReminderAlerts };
