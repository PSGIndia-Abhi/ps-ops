// Delivery of an issued invoice as set in the customer's billing profile:
//   email  -> the outlet's addresses for an invoice made per outlet (billing_outlet_settings.emails),
//             else the profile's invoice_emails. Sent right after issuing, PDF attached, logged on
//             the invoice (billing_invoice_shares, channel EMAIL, SENT / FAILED).
//   prints -> the copies on the invoice (print_copies) come from the same settings (draft.service).
// Only when the profile has "Send invoices by email automatically" on (billing_profiles.auto_email);
// otherwise nothing is sent (status OFF) and the invoice can be shared by hand. Several addresses
// go in one email, all in To.
// A failed or missing email never stops the invoice: the result says what happened.

const { v4: uuid } = require("uuid");
const C = require("./common");
const { billingInvoicePdfBuffer } = require("../../utils/billingInvoiceDocument");
const { sendBillingInvoiceEmail } = require("../../utils/mailer");
const F = require("./sosFiles.service");

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const list = (s) => String(s || "").split(",").map((e) => e.trim()).filter(Boolean);
const fileName = (content, number) => `${String(number || "Invoice").replace(/\//g, "-")}.pdf`; // the invoice number alone

/** Where an issued invoice is emailed: [addresses] (outlet first, else the customer's). */
async function recipientsFor(db, inv) {
  if (inv.site_id) {
    const [[o]] = await db.query("SELECT emails FROM billing_outlet_settings WHERE company_id = ? AND site_id = ?", [inv.company_id, inv.site_id]);
    if (list(o?.emails).length) return list(o.emails);
  }
  const [[p]] = await db.query("SELECT invoice_emails FROM billing_profiles WHERE company_id = ?", [inv.company_id]);
  return list(p?.invoice_emails);
}

/**
 * Emails one issued invoice to the addresses in the profile.
 * Returns { status: SENT | FAILED | NO_EMAIL | OFF, to: [...], error? }.
 */
async function emailIssued(db, invoiceId, userId) {
  const [[inv]] = await db.query(
    `SELECT bi.id, bi.company_id, bi.site_id, bi.invoice_number, bi.status, bi.total, bi.content, bi.is_manual,
            DATE_FORMAT(bi.due_date, '%Y-%m-%d') AS due_date, DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start,
            DATE_FORMAT(bi.period_end, '%Y-%m-%d') AS period_end
       FROM billing_invoices bi WHERE bi.id = ?`,
    [invoiceId]
  );
  if (!inv || inv.status !== "ISSUED") return { status: "FAILED", to: [], error: "Not an issued invoice" };
  const [[flag]] = await db.query("SELECT auto_email FROM billing_profiles WHERE company_id = ?", [inv.company_id]);
  if (!Number(flag?.auto_email)) return { status: "OFF", to: [] };
  const to = await recipientsFor(db, inv);
  if (!to.length) return { status: "NO_EMAIL", to: [] };

  const content = C.json(inv.content, null);
  const month = inv.period_start ? C.monthName(inv.period_start) : "";
  const amount = `₹${inr.format(Number(inv.total))}`;
  const subject = `Invoice ${inv.invoice_number} - Pest control${month ? `, ${month}` : ""}`;
  const text =
    `Dear Sir/Madam,\n\nPlease find attached our invoice ${inv.invoice_number} for pest control services${month ? ` for ${month}` : ""} ` +
    `(${amount}). Kindly arrange payment.\n\nRegards,\nAccounts - BestServe Pest Management Pvt Ltd`;
  let note = "Sent automatically on issue";
  const log = (status, error = null) => db.query(
    `INSERT INTO billing_invoice_shares (id, billing_invoice_id, channel, recipients, subject, attach, status, error_message, note, created_by)
     VALUES (?, ?, 'EMAIL', ?, ?, 'ORIGINAL', ?, ?, ?, ?)`,
    [uuid(), inv.id, JSON.stringify(to), subject, status, error ? String(error).slice(0, 500) : null, note, userId]
  );
  try {
    const pdf = await billingInvoicePdfBuffer(content, {});
    // The files attached to the SOS of the invoice's months go with it. Too large together: the
    // invoice is still sent, without them (they can be sent by hand).
    const sosFiles = await F.emailAttachments(db, inv);
    if (sosFiles.tooLarge) note += ` - SOS attachments not included (${F.mb(sosFiles.totalBytes)}, too large to email)`;
    else if (sosFiles.attachments.length) note += ` with ${sosFiles.attachments.length} SOS attachment${sosFiles.attachments.length === 1 ? "" : "s"}`;
    await sendBillingInvoiceEmail({
      to, subject, text,
      attachments: [{ filename: fileName(content, inv.invoice_number), content: pdf, contentType: "application/pdf" }, ...sosFiles.attachments],
    });
    await log("SENT");
    return { status: "SENT", to };
  } catch (err) {
    console.error(`Invoice ${inv.invoice_number} email failed:`, err.message);
    await log("FAILED", err.message).catch(() => {});
    return { status: "FAILED", to, error: "The email could not be sent - share it again from Issued Invoices" };
  }
}

module.exports = { recipientsFor, emailIssued };
