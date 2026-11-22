// Invoice numbers for Invoice Generation: the company's main series, continued from Vyapar.
//
//   BSPMPL<financial year>/<number>, no leading zeros - exactly as Vyapar numbers them
//   (BSPMPL26-27/1194 -> the next one is BSPMPL26-27/1195). A new financial year starts at 1.
//
// The accounts team billed in Vyapar until now, and its invoices are in the Accountant Panel
// (`invoices`). Each number is the highest one already used in the year's series + 1, read when the
// invoice is issued, so Billing carries straight on from Vyapar's last invoice. A number is never
// given twice: one used anywhere (Accountant Panel, Billing, Brigade) is skipped. The counter row
// (`sequences`, name billing_invoice_<fy>) is locked while a number is handed out, so two invoices
// issued at the same moment get different numbers; it also remembers numbers whose invoice was
// later cancelled, so they are not reused.
//
// Brigade invoices still use their own counter (brigade_invoice_sequences, from 5000) until Brigade
// moves onto these tables. Numbers from 5000 up are left to it, so the two never meet.

const { HttpError } = require("./common");

const PREFIX = "BSPMPL";
const BRIGADE_FIRST = 5000;

/** "2026-10-26" -> "26-27"; "2027-02-10" -> "26-27" (April to March). */
function financialYear(date) {
  const [y, m] = String(date).slice(0, 10).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const invoiceNumber = (fy, seq) => `${PREFIX}${fy}/${seq}`;

/** Is this invoice number already used anywhere? */
async function taken(conn, number) {
  const [[a]] = await conn.query(
    `SELECT EXISTS(SELECT 1 FROM invoices WHERE invoice_number = ?)
         OR EXISTS(SELECT 1 FROM billing_invoices WHERE invoice_number = ?) AS used`,
    [number, number]
  );
  if (Number(a.used)) return true;
  try {
    const [[b]] = await conn.query("SELECT EXISTS(SELECT 1 FROM brigade_invoices WHERE invoice_number = ?) AS used", [number]);
    return Boolean(Number(b.used));
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") return false;
    throw err;
  }
}

/**
 * The next invoice number for an invoice dated `invoiceDate`, inside the caller's transaction.
 * Returns { fy, seq, number }.
 */
async function nextInvoiceNumber(conn, invoiceDate) {
  const fy = financialYear(invoiceDate);
  const prefix = `${PREFIX}${fy}/`;
  const key = `billing_invoice_${fy}`;
  await conn.query("INSERT IGNORE INTO sequences (name, value) VALUES (?, 0)", [key]);
  const [[counter]] = await conn.query("SELECT value FROM sequences WHERE name = ? FOR UPDATE", [key]);

  // The highest number used in this year's series in the Accountant Panel (Vyapar's invoices and ours).
  const from = prefix.length + 1;
  const [[used]] = await conn.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number, ?) AS UNSIGNED)), 0) AS n
       FROM invoices
      WHERE invoice_number LIKE ?
        AND SUBSTRING(invoice_number, ?) REGEXP '^[0-9]+$'
        AND CAST(SUBSTRING(invoice_number, ?) AS UNSIGNED) < ?`,
    [from, `${prefix}%`, from, from, BRIGADE_FIRST]
  );

  let seq = Math.max(Number(counter.value) || 0, Number(used.n) || 0) + 1;
  while (await taken(conn, invoiceNumber(fy, seq))) seq += 1;
  if (seq >= BRIGADE_FIRST) {
    throw new HttpError(409, `The ${fy} invoice series has reached ${BRIGADE_FIRST}, where the Brigade numbers start. Ask the developer to move Brigade onto the main series.`);
  }
  await conn.query("UPDATE sequences SET value = ? WHERE name = ?", [seq, key]);
  return { fy, seq, number: invoiceNumber(fy, seq) };
}

module.exports = { PREFIX, financialYear, invoiceNumber, nextInvoiceNumber };
