// Delivery of an issued invoice as set in the customer's billing profile:
//   email  -> the outlet's addresses for an invoice made per outlet (billing_outlet_settings.emails),
//             else the profile's email parts (invoice_email_parts: [{ to, cc }]) - ONE EMAIL PER
//             PART, each To seeing only its own CC. Sent right after issuing, PDF attached, logged
//             on the invoice (billing_invoice_shares, channel EMAIL, SENT / FAILED), one row per email.
//   prints -> the copies on the invoice (print_copies) come from the same settings (draft.service).
// Only when the profile has "Send invoices by email automatically" on (billing_profiles.auto_email);
// otherwise nothing is sent (status OFF) and the invoice can be shared by hand. Invoices issued
// together (Issue all / selected) with exactly the same parts go together: one email per part with
// one PDF per invoice (emailIssuedMany).
// A failed or missing email never stops the invoice: the result says what happened.

const { v4: uuid } = require("uuid");
const C = require("./common");
const { billingInvoicePdfBuffer } = require("../../utils/billingInvoiceDocument");
const { sendBillingInvoiceEmail } = require("../../utils/mailer");
const F = require("./sosFiles.service");

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const list = (s) => String(s || "").split(",").map((e) => e.trim()).filter(Boolean);
const fileName = (content, number) => `${String(number || "Invoice").replace(/\//g, "-")}.pdf`; // the invoice number alone

const addrs = (v) => (Array.isArray(v) ? v.map((e) => String(e || "").trim()).filter(Boolean) : list(v));

/** A part without repeats: To deduplicated, CC less anything already in To. */
function cleanPart(part) {
  const to = [...new Map(addrs(part?.to).map((e) => [e.toLowerCase(), e])).values()];
  const inTo = new Set(to.map((e) => e.toLowerCase()));
  const cc = [...new Map(addrs(part?.cc).filter((e) => !inTo.has(e.toLowerCase())).map((e) => [e.toLowerCase(), e])).values()];
  return { to, cc };
}

/**
 * The emails an issued invoice goes out as: [{ to: [...], cc: [...] }], one email each.
 * An outlet with its own addresses (invoice made per outlet): one email to them. Else the customer's
 * parts (invoice_email_parts), or - saved before parts existed - one email: invoice_emails + CC.
 */
async function partsFor(db, inv) {
  if (inv.site_id) {
    const [[o]] = await db.query("SELECT emails FROM billing_outlet_settings WHERE company_id = ? AND site_id = ?", [inv.company_id, inv.site_id]);
    if (list(o?.emails).length) return [cleanPart({ to: list(o.emails) })];
  }
  const [[p]] = await db.query("SELECT invoice_emails, invoice_cc_emails, invoice_email_parts FROM billing_profiles WHERE company_id = ?", [inv.company_id]);
  const saved = C.json(p?.invoice_email_parts, null);
  const parts = Array.isArray(saved) && saved.length ? saved : [{ to: list(p?.invoice_emails), cc: list(p?.invoice_cc_emails) }];
  return parts.map(cleanPart).filter((x) => x.to.length);
}

/** Every To address an invoice is emailed to (all parts) - for the Share dialog. */
async function recipientsFor(db, inv) {
  const parts = await partsFor(db, inv);
  return [...new Map(parts.flatMap((x) => x.to).map((e) => [e.toLowerCase(), e])).values()];
}

/** Sends one email per part; logs each. Returns { status: SENT | FAILED, to, cc, emails, failed? }. */
async function sendParts(parts, send, log) {
  let failed = 0;
  for (const part of parts) {
    try {
      await send(part);
      await log(part, "SENT");
    } catch (err) {
      failed += 1;
      console.error(`Invoice email to ${part.to.join(", ")} failed:`, err.message);
      await log(part, "FAILED", err.message).catch(() => {});
    }
  }
  const to = parts.flatMap((x) => x.to);
  const cc = parts.flatMap((x) => x.cc);
  if (!failed) return { status: "SENT", to, cc, emails: parts.length };
  return {
    status: "FAILED", to, cc, emails: parts.length, failed,
    error: parts.length > 1 && failed < parts.length
      ? `${failed} of ${parts.length} emails could not be sent - share it again from Issued Invoices`
      : "The email could not be sent - share it again from Issued Invoices",
  };
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
  const parts = await partsFor(db, inv);
  if (!parts.length) return { status: "NO_EMAIL", to: [] };

  const content = C.json(inv.content, null);
  const month = inv.period_start ? C.monthName(inv.period_start) : "";
  const amount = `₹${inr.format(Number(inv.total))}`;
  const subject = `Invoice ${inv.invoice_number} - Pest control${month ? `, ${month}` : ""}`;
  const text =
    `Dear Sir/Madam,\n\nPlease find attached our invoice ${inv.invoice_number} for pest control services${month ? ` for ${month}` : ""} ` +
    `(${amount}). Kindly arrange payment.\n\nRegards,\nAccounts - BestServe Pest Management Pvt Ltd`;
  let note = "Sent automatically on issue";
  let attachments;
  try {
    const pdf = await billingInvoicePdfBuffer(content, {});
    // The files attached to the SOS of the invoice's months go with it. Too large together: the
    // invoice is still sent, without them (they can be sent by hand).
    const sosFiles = await F.emailAttachments(db, inv);
    if (sosFiles.tooLarge) note += ` - SOS attachments not included (${F.mb(sosFiles.totalBytes)}, too large to email)`;
    else if (sosFiles.attachments.length) note += ` with ${sosFiles.attachments.length} SOS attachment${sosFiles.attachments.length === 1 ? "" : "s"}`;
    attachments = [{ filename: fileName(content, inv.invoice_number), content: pdf, contentType: "application/pdf" }, ...sosFiles.attachments];
  } catch (err) {
    console.error(`Invoice ${inv.invoice_number} PDF failed:`, err.message);
    return { status: "FAILED", to: parts.flatMap((x) => x.to), error: "The email could not be sent - share it again from Issued Invoices" };
  }
  const log = (part, status, error = null) => db.query(
    `INSERT INTO billing_invoice_shares (id, billing_invoice_id, channel, recipients, subject, attach, status, error_message, note, created_by)
     VALUES (?, ?, 'EMAIL', ?, ?, 'ORIGINAL', ?, ?, ?, ?)`,
    [uuid(), inv.id, JSON.stringify(part.to), subject, status, error ? String(error).slice(0, 500) : null,
      `${note}${part.cc.length ? ` (CC ${part.cc.join(", ")})` : ""}${parts.length > 1 ? ` - email ${parts.indexOf(part) + 1} of ${parts.length}` : ""}`, userId]
  );
  return sendParts(parts, (part) => sendBillingInvoiceEmail({ to: part.to, cc: part.cc, subject, text, attachments }), log);
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
    const parts = await partsFor(db, inv);
    if (!parts.length) { results.set(id, { status: "NO_EMAIL", to: [] }); continue; }
    // the same emails (each part's To and CC), whatever the order or capitals they were typed in
    const norm = (a) => [...new Set(a.map((e) => e.toLowerCase()))].sort().join(",");
    const key = parts.map((x) => `${norm(x.to)}|${norm(x.cc)}`).sort().join(";");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ inv, parts });
  }

  for (const members of groups.values()) {
    if (members.length === 1) {
      results.set(members[0].inv.id, await emailIssued(db, members[0].inv.id, userId));
      continue;
    }
    const parts = members[0].parts;
    const months = [...new Set(members.map((m) => (m.inv.period_start ? C.monthName(m.inv.period_start) : "")).filter(Boolean))];
    const month = months.length === 1 ? months[0] : "";
    const total = members.reduce((t, m) => t + Number(m.inv.total), 0);
    const subject = `Invoices ${members.map((m) => m.inv.invoice_number).join(", ")} - Pest control${month ? `, ${month}` : ""}`.slice(0, 255);
    const text =
      `Dear Sir/Madam,\n\nPlease find attached our invoices for pest control services${month ? ` for ${month}` : ""}:\n\n` +
      members.map((m) => `  - ${m.inv.invoice_number} - ${C.json(m.inv.content, null)?.bill_to?.name || m.inv.company} - ₹${inr.format(Number(m.inv.total))}`).join("\n") +
      `\n\nTotal: ₹${inr.format(total)}\n\nKindly arrange payment.\n\nRegards,\nAccounts - BestServe Pest Management Pvt Ltd`;
    const log = (inv, part, status, error = null) => db.query(
      `INSERT INTO billing_invoice_shares (id, billing_invoice_id, channel, recipients, subject, attach, status, error_message, note, created_by)
       VALUES (?, ?, 'EMAIL', ?, ?, 'ORIGINAL', ?, ?, ?, ?)`,
      [uuid(), inv.id, JSON.stringify(part.to), subject, status, error ? String(error).slice(0, 500) : null,
        `Sent automatically on issue, in one email with ${members.length} invoices${part.cc.length ? ` (CC ${part.cc.join(", ")})` : ""}${parts.length > 1 ? ` - email ${parts.indexOf(part) + 1} of ${parts.length}` : ""}`, userId]
    );
    let attachments;
    try {
      attachments = [];
      for (const m of members) {
        const content = C.json(m.inv.content, null);
        attachments.push({ filename: fileName(content, m.inv.invoice_number), content: await billingInvoicePdfBuffer(content, {}), contentType: "application/pdf" });
      }
    } catch (err) {
      console.error(`Combined email PDFs (${members.map((m) => m.inv.invoice_number).join(", ")}) failed:`, err.message);
      for (const m of members) results.set(m.inv.id, { status: "FAILED", to: parts.flatMap((x) => x.to), error: "The email could not be sent - share it again from Issued Invoices" });
      continue;
    }
    const outcome = await sendParts(
      parts,
      (part) => sendBillingInvoiceEmail({ to: part.to, cc: part.cc, subject, text, attachments }),
      async (part, status, error) => { for (const m of members) await log(m.inv, part, status, error); }
    );
    for (const m of members) results.set(m.inv.id, { ...outcome, combined: members.length });
  }
  return results;
}

module.exports = { recipientsFor, partsFor, emailIssued, emailIssuedMany };
