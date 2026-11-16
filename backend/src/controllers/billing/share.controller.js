// Print and share an issued invoice: print every copy, email it, WhatsApp it, a secure link,
// or log a share done through another app. Every print and share is a row in
// billing_invoice_shares. Payloads: docs/Invoice Generation - API Payloads.docx §12.
//
// Public links (/api/public/billing/invoices/:token) need FRONTEND_URL (or PUBLIC_API_URL) set on
// the server: the link is built as <that URL>/api/public/billing/invoices/<token>. Only the
// SHA-256 of the token is stored, it expires, and it stops working when the invoice is cancelled.

const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { pool } = require("../../../db");
const C = require("../../services/billing/common");
const { renderBillingInvoicePdf, billingInvoicePdfBuffer, COPY_LABELS } = require("../../utils/billingInvoiceDocument");
const { sendBillingInvoiceEmail } = require("../../utils/mailer");
const { sendPdf, pdfName } = require("./invoices.controller");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

/** The issued invoice with its frozen content (404 / 400 otherwise). */
async function issuedInvoice(db, id, { allowCancelled = false } = {}) {
  const [[row]] = await db.query(
    `SELECT bi.id, bi.invoice_number, bi.status, bi.total, bi.print_copies, bi.company_id, bi.content,
            DATE_FORMAT(bi.due_date, '%Y-%m-%d') AS due_date, DATE_FORMAT(bi.period_start, '%Y-%m-%d') AS period_start,
            bi.description, c.name AS customer
       FROM billing_invoices bi JOIN companies c ON c.id = bi.company_id
      WHERE bi.id = ?`,
    [id]
  );
  if (!row) throw C.notFound("Invoice not found");
  if (row.status === "DRAFT") throw C.bad("Only issued invoices can be printed or shared");
  if (row.status === "CANCELLED" && !allowCancelled) throw C.bad("This invoice is cancelled");
  return { ...row, total: Number(row.total), print_copies: Number(row.print_copies), content: C.json(row.content, null) };
}

async function logShare(db, invoiceId, userId, share) {
  const id = uuid();
  await db.query(
    `INSERT INTO billing_invoice_shares
       (id, billing_invoice_id, channel, recipients, cc, subject, attach, copies, note, token_hash, expires_at, status, error_message, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, invoiceId, share.channel, share.recipients ? JSON.stringify(share.recipients) : null, share.cc ? JSON.stringify(share.cc) : null,
      share.subject || null, share.attach || null, share.copies || null, share.note || null, share.token_hash || null,
      share.expires_at || null, share.status || "LOGGED", share.error_message || null, userId,
    ]
  );
  return id;
}

/** Base URL for public links, from the server settings. */
function publicBase() {
  const base = String(process.env.PUBLIC_API_URL || process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw new C.HttpError(503, "FRONTEND_URL is not set on the server. Add FRONTEND_URL=https://www.bestserve.in to the backend settings and restart it.");
  }
  return base;
}

/** A new secure link (token returned once; only its hash is kept). */
function newToken(days) {
  const token = crypto.randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + days * 86400000);
  return { token, token_hash: sha256(token), expires_at: expires, link: `${publicBase()}/api/public/billing/invoices/${token}` };
}

/** A number WhatsApp accepts in a wa.me link: 10-digit Indian mobiles get 91 in front. */
function whatsappNumber(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) throw C.bad("Enter a 10-digit mobile number");
  return digits;
}

function emails(list, field, { required = false } = {}) {
  const values = (Array.isArray(list) ? list : list ? [list] : []).map((e) => String(e || "").trim()).filter(Boolean);
  if (required && !values.length) throw C.bad("Add at least one valid email address");
  if (values.length > 10) throw C.bad(`Too many ${field} addresses (max 10)`);
  for (const e of values) if (!EMAIL_RE.test(e) || e.length > 150) throw C.bad(`"${e}" is not a valid email address`);
  return [...new Set(values)];
}

function defaults(inv) {
  const month = inv.period_start ? C.monthName(inv.period_start) : "";
  const amount = `₹${inr.format(inv.total)}`;
  return {
    subject: `Invoice ${inv.invoice_number} - Pest control${month ? `, ${month}` : ""}`,
    message:
      `Dear Sir/Madam,\n\nPlease find attached our invoice ${inv.invoice_number} for pest control services${month ? ` for ${month}` : ""} ` +
      `(${amount}${inv.due_date ? `, due ${C.dmy(inv.due_date)}` : ""}). Kindly arrange payment.\n\nRegards,\nAccounts - BestServe Pest Management Pvt Ltd`,
    whatsapp: `Invoice ${inv.invoice_number} for ${amount}${inv.due_date ? ` (due ${C.dmy(inv.due_date)})` : ""}. View: {link}`,
  };
}

// GET /invoices/:id/print?copies=3  -> one PDF with every copy, each labelled
const print = C.handle("Failed to print the invoice", async (req, res) => {
  const inv = await issuedInvoice(pool, req.params.id);
  const copies = C.num(req.query.copies, "copies", { min: 1, max: 4, integer: true }) ?? inv.print_copies;
  await logShare(pool, inv.id, req.user.id, { channel: "PRINT", copies, status: "LOGGED" });
  sendPdf(res, inv.content, pdfName(inv), { copies, labelSingle: true });
});

// GET /invoices/:id/share-options
const shareOptions = C.handle("Failed to load the share options", async (req, res) => {
  const inv = await issuedInvoice(pool, req.params.id);
  const [contacts] = await pool.query(
    `SELECT id AS contact_id, name, email, phone, is_primary
       FROM customer_payment_contacts WHERE customer_id = ? AND is_active = 1
      ORDER BY is_primary DESC, created_at`,
    [inv.company_id]
  );
  const d = defaults(inv);
  res.json({
    invoice_number: inv.invoice_number,
    customer: inv.customer,
    total: inv.total,
    due_date: inv.due_date,
    print_copies: inv.print_copies,
    copy_labels: COPY_LABELS.slice(0, inv.print_copies),
    contacts: contacts.map((c) => ({ ...c, is_primary: Boolean(c.is_primary), is_payment_contact: true })),
    default_email: { to: contacts.map((c) => c.email).filter(Boolean), subject: d.subject, message: d.message },
    default_whatsapp_text: d.whatsapp,
  });
});

// POST /invoices/:id/share/email { to, cc, subject, message, attach: ORIGINAL | ALL_COPIES }
const shareEmail = C.handle("Failed to email the invoice", async (req, res) => {
  const b = req.body || {};
  const inv = await issuedInvoice(pool, req.params.id);
  const d = defaults(inv);
  const to = emails(b.to, "to", { required: true });
  const cc = emails(b.cc, "cc");
  const subject = C.str(b.subject, "subject", { max: 255 }) || d.subject;
  const message = C.str(b.message, "message", { max: 5000 }) || d.message;
  const attach = C.oneOf(b.attach, "attach", ["ORIGINAL", "ALL_COPIES"], { fallback: "ORIGINAL" });
  const pdf = await billingInvoicePdfBuffer(inv.content, attach === "ALL_COPIES" ? { copies: inv.print_copies, labelSingle: true } : {});
  try {
    await sendBillingInvoiceEmail({ to, cc, subject, text: message, attachments: [{ filename: pdfName(inv), content: pdf, contentType: "application/pdf" }] });
  } catch (err) {
    console.error("Invoice email failed:", err.message);
    await logShare(pool, inv.id, req.user.id, { channel: "EMAIL", recipients: to, cc, subject, attach, status: "FAILED", error_message: String(err.message).slice(0, 500) });
    throw new C.HttpError(502, "The email could not be sent. Check the mail settings and try again.");
  }
  const shareId = await logShare(pool, inv.id, req.user.id, { channel: "EMAIL", recipients: to, cc, subject, attach, status: "SENT" });
  res.json({ share_id: shareId, channel: "EMAIL", sent_to: to.length + cc.length, sent_at: new Date().toISOString() });
});

// POST /invoices/:id/share/whatsapp { phone, text }  -> wa.me link with a secure invoice link
const shareWhatsapp = C.handle("Failed to prepare the WhatsApp message", async (req, res) => {
  const b = req.body || {};
  const inv = await issuedInvoice(pool, req.params.id);
  const phone = whatsappNumber(b.phone);
  const t = newToken(30);
  const text = (C.str(b.text, "text", { max: 1000 }) || defaults(inv).whatsapp).replace(/\{link\}/g, t.link);
  const shareId = await logShare(pool, inv.id, req.user.id, {
    channel: "WHATSAPP", recipients: [phone], token_hash: t.token_hash, expires_at: t.expires_at, status: "LOGGED",
  });
  res.json({ share_id: shareId, channel: "WHATSAPP", link: t.link, wa_me_url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` });
});

// POST /invoices/:id/share/link { expires_in_days }
const shareLink = C.handle("Failed to create the link", async (req, res) => {
  const inv = await issuedInvoice(pool, req.params.id);
  const days = C.num(req.body?.expires_in_days, "expires_in_days", { min: 1, max: 90, integer: true }) ?? 30;
  const t = newToken(days);
  const shareId = await logShare(pool, inv.id, req.user.id, { channel: "LINK", token_hash: t.token_hash, expires_at: t.expires_at, status: "LOGGED" });
  res.status(201).json({ share_id: shareId, channel: "LINK", link: t.link, expires_at: t.expires_at.toISOString() });
});

// POST /invoices/:id/share/log { channel: OTHER, note }  (shared from the device's own share sheet)
const shareLog = C.handle("Failed to record the share", async (req, res) => {
  const inv = await issuedInvoice(pool, req.params.id);
  C.oneOf(req.body?.channel, "channel", ["OTHER"], { fallback: "OTHER" });
  const note = C.str(req.body?.note, "note", { max: 255 });
  const shareId = await logShare(pool, inv.id, req.user.id, { channel: "OTHER", note, status: "LOGGED" });
  res.status(201).json({ share_id: shareId });
});

// GET /invoices/:id/shares
const shares = C.handle("Failed to load the share history", async (req, res) => {
  await issuedInvoice(pool, req.params.id, { allowCancelled: true });
  const [rows] = await pool.query(
    `SELECT s.id, s.channel, s.recipients, s.cc, s.subject, s.copies, s.note, s.status, s.open_count, s.expires_at, s.revoked_at,
            u.name AS by_name, s.created_at
       FROM billing_invoice_shares s LEFT JOIN users u ON u.id = s.created_by
      WHERE s.billing_invoice_id = ?
      ORDER BY s.created_at DESC`,
    [req.params.id]
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      to: C.json(r.recipients, []),
      cc: C.json(r.cc, []),
      subject: r.subject,
      copies: C.n2(r.copies),
      note: r.note,
      status: r.status,
      link_opened: r.channel === "LINK" || r.channel === "WHATSAPP" ? Number(r.open_count) : undefined,
      link_active: r.expires_at ? !r.revoked_at && new Date(r.expires_at) > new Date() : undefined,
      by: r.by_name,
      at: r.created_at,
    }))
  );
});

// GET /api/public/billing/invoices/:token  (no login: the customer opens the shared link)
async function publicInvoice(req, res) {
  try {
    const token = String(req.params.token || "");
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ error: "This link is not valid" });
    const [[share]] = await pool.query(
      `SELECT s.id, s.expires_at, s.revoked_at, bi.status, bi.invoice_number, bi.content
         FROM billing_invoice_shares s JOIN billing_invoices bi ON bi.id = s.billing_invoice_id
        WHERE s.token_hash = ?`,
      [sha256(token)]
    );
    if (!share) return res.status(404).json({ error: "This link is not valid" });
    if (share.revoked_at || share.status !== "ISSUED" || (share.expires_at && new Date(share.expires_at) < new Date())) {
      return res.status(410).json({ error: "This link has expired. Please ask BestServe for a new one." });
    }
    await pool.query("UPDATE billing_invoice_shares SET open_count = open_count + 1, last_opened_at = NOW() WHERE id = ?", [share.id]);
    const content = C.json(share.content, null);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(pdfName({ invoice_number: share.invoice_number, content }))}`);
    res.setHeader("Cache-Control", "private, no-store");
    renderBillingInvoicePdf(content, res, {});
  } catch (err) {
    C.sendError(res, err, "Failed to open the invoice");
  }
}

module.exports = { print, shareOptions, shareEmail, shareWhatsapp, shareLink, shareLog, shares, publicInvoice };
