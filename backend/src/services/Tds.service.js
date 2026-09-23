const { v4: uuid } = require("uuid");

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Works out the TDS snapshot for a new invoice from the customer's TDS setting.
// TDS is a percentage of the total invoice amount.
function snapshotForInvoice(company, invoiceAmount) {
  const rate = Number(company?.tds_rate) || 0;
  const applicable = Boolean(company?.tds_applicable) && rate > 0;
  const expected = applicable ? round2((Number(invoiceAmount) * rate) / 100) : 0;
  return {
    tds_applicable: applicable ? 1 : 0,
    tds_rate: applicable ? rate : null,
    expected_tds: expected,
    pending_tds: expected,
    status: applicable ? "PENDING" : "NOT_APPLICABLE",
  };
}

// Saves the snapshot for an invoice. Call this in the same transaction that creates the invoice.
async function insertInvoiceTds(executor, invoiceId, company, invoiceAmount) {
  const s = snapshotForInvoice(company, invoiceAmount);
  await executor.query(
    `INSERT INTO invoice_tds (id, invoice_id, tds_applicable, tds_rate, expected_tds, deducted_tds, pending_tds, status)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [uuid(), invoiceId, s.tds_applicable, s.tds_rate, s.expected_tds, s.pending_tds, s.status]
  );
}

// TDS status after some TDS has been deducted.
function tdsStatus(expected, deducted) {
  if (Number(deducted) >= Number(expected) && Number(expected) > 0) return "CLEARED";
  if (Number(deducted) > 0) return "PARTIAL";
  return "PENDING";
}

module.exports = { round2, snapshotForInvoice, insertInvoiceTds, tdsStatus };
