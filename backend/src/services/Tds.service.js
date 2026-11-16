const { v4: uuid } = require("uuid");

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// TDS is kept in whole rupees, rounded to the nearest rupee (50 paise and above go up),
// as Income Tax rule 288B does. round2 first so a float like 216.4999999 is not rounded down.
const roundRupee = (n) => Math.round(round2(n)) || 0;

// TDS basis: what TDS is a percentage of.
//   INVOICE ("Invoice TDS"): the full invoice amount, GST included (the original behaviour).
//   TAXABLE ("Taxable TDS"): the taxable value, before GST.
const TDS_BASES = ["INVOICE", "TAXABLE"];
const normalizeBasis = (basis) => (basis === "TAXABLE" ? "TAXABLE" : "INVOICE");

// Used to work out the taxable value when an invoice has none (its import row left
// "Taxable Value" blank): taxable value = amount / (1 + 18%).
const DEFAULT_GST_RATE = 18;

// An invoice's taxable value: the one saved on it, otherwise worked out from the amount.
function taxableValue(invoiceAmount, taxableAmount) {
  if (taxableAmount != null && taxableAmount !== "" && Number(taxableAmount) > 0) return round2(taxableAmount);
  return round2(Number(invoiceAmount) / (1 + DEFAULT_GST_RATE / 100));
}

// The amount TDS is a percentage of, for the given basis.
function tdsBaseAmount(basis, invoiceAmount, taxableAmount) {
  return normalizeBasis(basis) === "TAXABLE" ? taxableValue(invoiceAmount, taxableAmount) : Number(invoiceAmount) || 0;
}

// The same as tdsBaseAmount, in SQL. `basisSql` is a SQL expression (a column or a "?"),
// `inv` the invoices table alias. Rounded the same way as the JS version. The TDS worked out
// from it must be ROUND(..., 0), like roundRupee.
function tdsBaseSql(basisSql, inv = "i") {
  return `(CASE WHEN ${basisSql} = 'TAXABLE'
            THEN COALESCE(NULLIF(${inv}.taxable_amount, 0), ROUND(${inv}.invoice_amount / ${1 + DEFAULT_GST_RATE / 100}, 2))
            ELSE ${inv}.invoice_amount END)`;
}

// Works out the TDS snapshot for a new invoice from the customer's TDS setting.
// TDS is a percentage of the invoice amount or of the taxable value (company.tds_basis),
// rounded to the nearest rupee.
function snapshotForInvoice(company, invoiceAmount, taxableAmount = null) {
  const rate = Number(company?.tds_rate) || 0;
  const applicable = Boolean(company?.tds_applicable) && rate > 0;
  const basis = normalizeBasis(company?.tds_basis);
  const expected = applicable ? roundRupee((tdsBaseAmount(basis, invoiceAmount, taxableAmount) * rate) / 100) : 0;
  return {
    tds_applicable: applicable ? 1 : 0,
    tds_rate: applicable ? rate : null,
    tds_basis: basis,
    expected_tds: expected,
    pending_tds: expected,
    status: applicable ? "PENDING" : "NOT_APPLICABLE",
  };
}

// Saves the snapshot for an invoice. Call this in the same transaction that creates the invoice.
async function insertInvoiceTds(executor, invoiceId, company, invoiceAmount, taxableAmount = null) {
  const s = snapshotForInvoice(company, invoiceAmount, taxableAmount);
  await executor.query(
    `INSERT INTO invoice_tds (id, invoice_id, tds_applicable, tds_rate, tds_basis, expected_tds, deducted_tds, pending_tds, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [uuid(), invoiceId, s.tds_applicable, s.tds_rate, s.tds_basis, s.expected_tds, s.pending_tds, s.status]
  );
}

// TDS status after some TDS has been deducted.
function tdsStatus(expected, deducted) {
  if (Number(deducted) >= Number(expected) && Number(expected) > 0) return "CLEARED";
  if (Number(deducted) > 0) return "PARTIAL";
  return "PENDING";
}

module.exports = {
  round2,
  roundRupee,
  TDS_BASES,
  DEFAULT_GST_RATE,
  normalizeBasis,
  taxableValue,
  tdsBaseAmount,
  tdsBaseSql,
  snapshotForInvoice,
  insertInvoiceTds,
  tdsStatus,
};
