// Delivery of an issued invoice as set in the customer's billing profile:
//   email  -> the outlet's addresses for an invoice made per outlet (billing_outlet_settings.emails),
//             else the profile's invoice_emails. Sent right after issuing, PDF attached, logged on
//             the invoice (billing_invoice_shares, channel EMAIL, SENT / FAILED).
//   prints -> the copies on the invoice (print_copies) come from the same settings (draft.service).
// Only when the profile has "Send invoices by email automatically" on (billing_profiles.auto_email);
// otherwise nothing is sent (status OFF) and the invoice can be shared by hand. Several addresses
// go in one email, all in To. Invoices issued together (Issue all / selected) for exactly the same
// addresses go in ONE email with one PDF per invoice (emailIssuedMany).
// A failed or missing email never stops the invoice: the result says what happened.

const { v4: uuid } = require("uuid");
const C = require("./common");
const { billingInvoicePdfBuffer } = require("../../utils/billingInvoiceDocument");
const { sendBillingInvoiceEmail } = require("../../utils/mailer");

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
    `SELECT bi.id, bi.company_id, bi.site_id, bi.invoice_number, bi.status, bi.total, bi.content,
            DATE_FORMAT(bi.due_date, '%Y-%m-%d') AS due_date, DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start
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
  const log = (status, error = null) => db.query(
    `INSERT INTO billing_invoice_shares (id, billing_invoice_id, channel, recipients, subject, attach, status, error_message, note, created_by)
     VALUES (?, ?, 'EMAIL', ?, ?, 'ORIGINAL', ?, ?, 'Sent automatically on issue', ?)`,
    [uuid(), inv.id, JSON.stringify(to), subject, status, error ? String(error).slice(0, 500) : null, userId]
  );
  try {
    const pdf = await billingInvoicePdfBuffer(content, {});
    await sendBillingInvoiceEmail({ to, subject, text, attachments: [{ filename: fileName(content, inv.invoice_number), content: pdf, contentType: "application/pdf" }] });
    await log("SENT");
    return { status: "SENT", to };
  } catch (err) {
    console.error(`Invoice ${inv.invoice_number} email failed:`, err.message);
    await log("FAILED", err.message).catch(() => {});
    return { status: "FAILED", to, error: "The email could not be sent - share it again from Issued Invoices" };
  }
}

/**
 * Emails invoices issued together (Draft Invoices > Issue all / Issue selected). Invoices whose
 * recipients are exactly the same addresses go in ONE email with one PDF per invoice; an invoice
 * with its own addresses is emailed alone, exactly as emailIssued does. Each invoice still gets its
 * own log row (SENT / FAILED) and its own result.
 * Returns Map invoiceId -> { status: SENT | FAILED | NO_EMAIL | OFF, to: [...], error?, combined? }.
 */
async function emailIssuedMany(db, invoiceIds, userId) {
  const results = new Map();
  const groups = new Map(); // "a@x.com,b@y.com" -> [{ inv, to }]
  for (const id of invoiceIds) {
    const [[inv]] = await db.query(
      `SELECT bi.id, bi.company_id, bi.site_id, bi.invoice_number, bi.status, bi.total, bi.content,
              DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start, TRIM(c.name) AS company
         FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id WHERE bi.id = ?`,
      [id]
    );
    if (!inv || inv.status !== "ISSUED") { results.set(id, { status: "FAILED", to: [], error: "Not an issued invoice" }); continue; }
    const [[flag]] = await db.query("SELECT auto_email FROM billing_profiles WHERE company_id = ?", [inv.company_id]);
    if (!Number(flag?.auto_email)) { results.set(id, { status: "OFF", to: [] }); continue; }
    const to = await recipientsFor(db, inv);
    if (!to.length) { results.set(id, { status: "NO_EMAIL", to: [] }); continue; }
    // the same people, whatever the order or capitals the addresses were typed in
    const key = [...new Set(to.map((e) => e.toLowerCase()))].sort().join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ inv, to });
  }

  for (const members of groups.values()) {
    if (members.length === 1) {
      results.set(members[0].inv.id, await emailIssued(db, members[0].inv.id, userId));
      continue;
    }
    const to = members[0].to;
    const months = [...new Set(members.map((m) => (m.inv.period_start ? C.monthName(m.inv.period_start) : "")).filter(Boolean))];
    const month = months.length === 1 ? months[0] : "";
    const total = members.reduce((t, m) => t + Number(m.inv.total), 0);
    const subject = `Invoices ${members.map((m) => m.inv.invoice_number).join(", ")} - Pest control${month ? `, ${month}` : ""}`.slice(0, 255);
    const text =
      `Dear Sir/Madam,\n\nPlease find attached our invoices for pest control services${month ? ` for ${month}` : ""}:\n\n` +
      members.map((m) => `  - ${m.inv.invoice_number} - ${C.json(m.inv.content, null)?.bill_to?.name || m.inv.company} - ₹${inr.format(Number(m.inv.total))}`).join("\n") +
      `\n\nTotal: ₹${inr.format(total)}\n\nKindly arrange payment.\n\nRegards,\nAccounts - BestServe Pest Management Pvt Ltd`;
    const log = (inv, status, error = null) => db.query(
      `INSERT INTO billing_invoice_shares (id, billing_invoice_id, channel, recipients, subject, attach, status, error_message, note, created_by)
       VALUES (?, ?, 'EMAIL', ?, ?, 'ORIGINAL', ?, ?, ?, ?)`,
      [uuid(), inv.id, JSON.stringify(to), subject, status, error ? String(error).slice(0, 500) : null,
        `Sent automatically on issue, in one email with ${members.length} invoices`, userId]
    );
    try {
      const attachments = [];
      for (const m of members) {
        const content = C.json(m.inv.content, null);
        attachments.push({ filename: fileName(content, m.inv.invoice_number), content: await billingInvoicePdfBuffer(content, {}), contentType: "application/pdf" });
      }
      await sendBillingInvoiceEmail({ to, subject, text, attachments });
      for (const m of members) {
        await log(m.inv, "SENT");
        results.set(m.inv.id, { status: "SENT", to, combined: members.length });
      }
    } catch (err) {
      console.error(`Combined email (${members.map((m) => m.inv.invoice_number).join(", ")}) failed:`, err.message);
      for (const m of members) {
        await log(m.inv, "FAILED", err.message).catch(() => {});
        results.set(m.inv.id, { status: "FAILED", to, error: "The email could not be sent - share it again from Issued Invoices" });
      }
    }
  }
  return results;
}

module.exports = { recipientsFor, emailIssued, emailIssuedMany };
