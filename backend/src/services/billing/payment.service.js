// Payments received against issued invoices, recorded in Billing (billing_invoice_payments,
// 20261125_billing_payments.sql).
//
// An invoice connected to the Accountant Panel (billing_invoices.receivable_invoice_id: every invoice
// issued while BILLING_ACCOUNTS_LINK is on, and any invoice paid from a termite advance) has ONE paid
// figure: the receivable's paid_amount in the invoices table. It holds the advance, the payments the
// Collection Executive records in the Accountant Panel, and the payments recorded here - each payment
// recorded or removed here is added to / taken off the receivable, so nothing is counted twice.
// Not connected: paid = termite advance adjusted on it + every payment recorded here (money + TDS).
//   PAID     paid covers the total
//   PARTIAL  something paid, a balance left
//   PENDING  nothing paid yet

const { v4: uuid } = require("uuid");
const C = require("./common");
const calc = require("./calc");
const { logAudit } = require("../Audit.service");
const { tdsStatus } = require("../Tds.service");

const EPS = 0.005;
const MODES = ["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "DD", "CASH", "OTHER"];
const REF_MODES = ["NEFT", "RTGS", "IMPS", "UPI"]; // need the UTR / transaction id
const INSTRUMENT_MODES = ["CHEQUE", "DD"]; // need the number, date and bank

// SQL pieces for queries on billing_invoices aliased "bi".
const RECORDED_SQL = `(SELECT COALESCE(SUM(bp.amount + bp.tds_amount), 0) FROM billing_invoice_payments bp
                        WHERE bp.billing_invoice_id = bi.id AND bp.deleted_at IS NULL)`;
const PAID_SQL = `(CASE WHEN bi.receivable_invoice_id IS NOT NULL
                        THEN COALESCE((SELECT r.paid_amount FROM invoices r WHERE r.id = bi.receivable_invoice_id), 0)
                        ELSE bi.advance_adjusted + ${RECORDED_SQL} END)`;
const STATUS_SQL = `(CASE WHEN ${PAID_SQL} >= bi.total - ${EPS} THEN 'PAID' WHEN ${PAID_SQL} > ${EPS} THEN 'PARTIAL' ELSE 'PENDING' END)`;

const statusOf = (total, paid) => (paid >= total - EPS ? "PAID" : paid > EPS ? "PARTIAL" : "PENDING");

/** The payments on an invoice (newest first) and its money summary. */
async function forInvoice(db, invoiceId) {
  const [[inv]] = await db.query(
    `SELECT bi.id, bi.total, bi.advance_adjusted, bi.status, bi.receivable_invoice_id, r.paid_amount AS receivable_paid
       FROM billing_invoices bi LEFT JOIN invoices r ON r.id = bi.receivable_invoice_id WHERE bi.id = ?`,
    [invoiceId]
  );
  if (!inv) throw C.notFound("Invoice not found");
  const [rows] = await db.query(
    `SELECT bp.id, bp.amount, bp.tds_amount, DATE_FORMAT(bp.paid_on, '%Y-%m-%d') AS paid_on, bp.mode, bp.mode_other,
            bp.reference_no, bp.cheque_no, DATE_FORMAT(bp.cheque_date, '%Y-%m-%d') AS cheque_date, bp.bank_name, bp.received_in,
            bp.remarks, bp.proof_file_name, bp.created_at, u.name AS created_by_name
       FROM billing_invoice_payments bp LEFT JOIN users u ON u.id = bp.created_by
      WHERE bp.billing_invoice_id = ? AND bp.deleted_at IS NULL
      ORDER BY bp.paid_on DESC, bp.created_at DESC`,
    [invoiceId]
  );
  const payments = rows.map((r) => ({ ...r, amount: Number(r.amount), tds_amount: Number(r.tds_amount), has_proof: Boolean(r.proof_file_name) }));
  const total = Number(inv.total);
  const advance = Number(inv.advance_adjusted);
  const received = calc.round2(payments.reduce((t, p) => t + p.amount, 0));
  const tds = calc.round2(payments.reduce((t, p) => t + p.tds_amount, 0));
  const connected = Boolean(inv.receivable_invoice_id);
  // connected: the receivable's paid amount, which also has what the Accountant Panel recorded
  const paid = connected ? calc.round2(Number(inv.receivable_paid) || 0) : calc.round2(advance + received + tds);
  const accounts = connected ? Math.max(0, calc.round2(paid - advance - received - tds)) : 0;
  return {
    summary: { total, advance, received, tds, accounts, connected, paid, balance: Math.max(0, calc.round2(total - paid)), status: statusOf(total, paid) },
    payments,
  };
}

/**
 * Adds a Billing payment to the connected receivable in the Accountant Panel (negative = removes it),
 * so its paid / pending / status - and the TDS deducted - match. A cancelled receivable is left alone.
 */
async function applyToReceivable(conn, receivableId, cashTds, tds, userId) {
  if (!receivableId) return;
  const [[r]] = await conn.query("SELECT id, invoice_amount, paid_amount, status FROM invoices WHERE id = ? FOR UPDATE", [receivableId]);
  if (!r || r.status === "CANCELLED") return;
  const paid = Math.max(0, calc.round2(Number(r.paid_amount) + cashTds));
  const pending = Math.max(0, calc.round2(Number(r.invoice_amount) - paid));
  await conn.query("UPDATE invoices SET paid_amount = ?, pending_amount = ?, status = ?, updated_by = ? WHERE id = ?", [
    paid, pending, pending <= EPS ? "PAID" : paid > EPS ? "PARTIAL" : "PENDING", userId, receivableId,
  ]);
  if (tds) {
    const [[t]] = await conn.query("SELECT id, expected_tds, deducted_tds FROM invoice_tds WHERE invoice_id = ? FOR UPDATE", [receivableId]);
    if (t) {
      const deducted = Math.max(0, calc.round2(Number(t.deducted_tds) + tds));
      await conn.query("UPDATE invoice_tds SET deducted_tds = ?, pending_tds = ?, status = ? WHERE id = ?", [
        deducted, Math.max(0, calc.round2(Number(t.expected_tds) - deducted)), tdsStatus(t.expected_tds, deducted), t.id,
      ]);
    }
  }
}

/** Checks a payment form; returns the clean values (throws a readable 400 otherwise). */
function readPayment(body) {
  const amount = C.num(body.amount, "Amount received", { min: 0 }) ?? 0;
  const tds = C.num(body.tds_amount, "TDS deducted", { min: 0 }) ?? 0;
  if (amount + tds <= EPS) throw C.bad("Enter the amount received (or the TDS deducted)");
  const paidOn = C.date(body.paid_on, "Payment date", { required: true });
  if (paidOn > C.todayIst()) throw C.bad("The payment date cannot be in the future");
  const mode = C.oneOf(body.mode, "Payment mode", MODES, { required: true });
  const out = {
    amount: calc.round2(amount),
    tds_amount: calc.round2(tds),
    paid_on: paidOn,
    mode,
    mode_other: mode === "OTHER" ? C.str(body.mode_other, "How it was paid", { required: true, max: 60 }) : null,
    reference_no: REF_MODES.includes(mode)
      ? C.str(body.reference_no, "UTR / transaction ID", { required: true, max: 60 })
      : C.str(body.reference_no, "Reference", { max: 60 }),
    cheque_no: INSTRUMENT_MODES.includes(mode) ? C.str(body.cheque_no, mode === "DD" ? "DD number" : "Cheque number", { required: true, max: 30 }) : null,
    cheque_date: INSTRUMENT_MODES.includes(mode) ? C.date(body.cheque_date, mode === "DD" ? "DD date" : "Cheque date", { required: true }) : null,
    bank_name: INSTRUMENT_MODES.includes(mode) ? C.str(body.bank_name, "Bank", { required: true, max: 100 }) : C.str(body.bank_name, "Bank", { max: 100 }),
    received_in: C.str(body.received_in, "Received in", { max: 100 }),
    remarks: C.str(body.remarks, "Remarks", { max: 500 }),
  };
  return out;
}

/**
 * Records one payment on an issued invoice. `proof` = { object_key, file_name, file_type } of an
 * uploaded file, or null. Refuses more than the balance and a UTR already used on another payment.
 */
async function recordPayment(conn, req, invoiceId, p, proof) {
  const [[inv]] = await conn.query("SELECT id, invoice_number, company_id, status, total, receivable_invoice_id FROM billing_invoices WHERE id = ? FOR UPDATE", [invoiceId]);
  if (!inv) throw C.notFound("Invoice not found");
  if (inv.status !== "ISSUED") throw C.bad(inv.status === "CANCELLED" ? "This invoice is cancelled" : "Only issued invoices take payments");
  const { summary } = await forInvoice(conn, invoiceId);
  if (summary.balance <= EPS) throw C.bad(`${inv.invoice_number} is already fully paid`);
  if (p.amount + p.tds_amount > summary.balance + EPS) {
    throw C.bad(`That is more than the balance of ₹${summary.balance.toFixed(2)} on ${inv.invoice_number}`);
  }
  if (p.reference_no && REF_MODES.includes(p.mode)) {
    const [[dup]] = await conn.query(
      `SELECT bi.invoice_number FROM billing_invoice_payments bp JOIN billing_invoices bi ON bi.id = bp.billing_invoice_id
        WHERE bp.reference_no = ? AND bp.deleted_at IS NULL LIMIT 1`,
      [p.reference_no]
    );
    if (dup) throw C.conflict(`UTR ${p.reference_no} is already recorded (on ${dup.invoice_number})`);
  }
  const id = uuid();
  await conn.query(
    `INSERT INTO billing_invoice_payments
       (id, billing_invoice_id, amount, tds_amount, paid_on, mode, mode_other, reference_no, cheque_no, cheque_date, bank_name,
        received_in, remarks, proof_object_key, proof_file_name, proof_file_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, inv.id, p.amount, p.tds_amount, p.paid_on, p.mode, p.mode_other, p.reference_no, p.cheque_no, p.cheque_date, p.bank_name,
      p.received_in, p.remarks, proof?.object_key || null, proof?.file_name || null, proof?.file_type || null, req.user.id]
  );
  // connected to the Accountant Panel: the Collection Executive sees it as received
  await applyToReceivable(conn, inv.receivable_invoice_id, calc.round2(p.amount + p.tds_amount), p.tds_amount, req.user.id);
  await logAudit(conn, req, {
    module: "BILLING", action: "INVOICE_PAYMENT_RECORDED", entity_type: "BILLING_INVOICE", entity_id: inv.id, entity_label: inv.invoice_number,
    customer_id: inv.company_id,
    summary: `Payment of ₹${p.amount.toFixed(2)}${p.tds_amount ? ` + TDS ₹${p.tds_amount.toFixed(2)}` : ""} on ${inv.invoice_number} (${p.mode === "OTHER" ? p.mode_other : p.mode}${p.reference_no ? ` ${p.reference_no}` : ""})`,
  });
  return id;
}

/** Removes a wrongly entered payment (kept, marked deleted, with the reason). */
async function removePayment(conn, req, paymentId, reason) {
  const [[p]] = await conn.query(
    `SELECT bp.id, bp.amount, bp.tds_amount, bp.deleted_at, bi.id AS invoice_id, bi.invoice_number, bi.company_id, bi.status, bi.receivable_invoice_id
       FROM billing_invoice_payments bp JOIN billing_invoices bi ON bi.id = bp.billing_invoice_id
      WHERE bp.id = ? FOR UPDATE`,
    [paymentId]
  );
  if (!p || p.deleted_at) throw C.notFound("Payment not found");
  await conn.query("UPDATE billing_invoice_payments SET deleted_at = NOW(), deleted_by = ?, delete_reason = ? WHERE id = ?", [req.user.id, reason, p.id]);
  await applyToReceivable(conn, p.receivable_invoice_id, -calc.round2(Number(p.amount) + Number(p.tds_amount)), -Number(p.tds_amount), req.user.id);
  await logAudit(conn, req, {
    module: "BILLING", action: "INVOICE_PAYMENT_REMOVED", entity_type: "BILLING_INVOICE", entity_id: p.invoice_id, entity_label: p.invoice_number,
    customer_id: p.company_id, reason,
    summary: `Payment of ₹${Number(p.amount).toFixed(2)}${Number(p.tds_amount) ? ` + TDS ₹${Number(p.tds_amount).toFixed(2)}` : ""} removed from ${p.invoice_number}`,
  });
  return p.invoice_id;
}

/** True when payments recorded in Billing stand against the invoice (it cannot be cancelled then). */
async function hasPayments(db, invoiceId) {
  const [[r]] = await db.query("SELECT COUNT(*) AS n FROM billing_invoice_payments WHERE billing_invoice_id = ? AND deleted_at IS NULL", [invoiceId]);
  return Number(r.n) > 0;
}

module.exports = { MODES, RECORDED_SQL, PAID_SQL, STATUS_SQL, statusOf, forInvoice, readPayment, recordPayment, removePayment, hasPayments };
