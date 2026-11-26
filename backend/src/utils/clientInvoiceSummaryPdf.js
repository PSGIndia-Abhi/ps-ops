// Client Portal: one-page "Invoice summary" PDF built from the invoices / payments tables.
// Invoice PDFs from the accounting software are not stored in the system, so this summary is
// what a client can view and download. It says plainly that it is not the GST tax invoice.

const path = require("path");
const PDFDocument = require("pdfkit");

const LOGO = path.join(__dirname, "../../assets/quotation-logo.png");
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const FONTS = {
  R: "PlusJakartaSans-Regular.ttf",
  SB: "PlusJakartaSans-SemiBold.ttf",
  B: "PlusJakartaSans-Bold.ttf",
};

const INK = "#0F172A";
const MUTED = "#475569";
const LINE = "#E2E8F0";
const BLUE = "#1E40AF";
const GREEN = "#15803D";
const RED = "#B91C1C";

const MODE_LABELS = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  NEFT: "NEFT",
  CHEQUE: "Cheque",
  CARD: "Card",
  OTHER: "Other",
};

const STATUS_LABELS = {
  PENDING: "Pending",
  PARTIAL: "Partly paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => `₹${inr.format(Number(n) || 0)}`;

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Writes the summary PDF to `stream` (an HTTP response).
 * invoice: { invoice_number, invoice_date, due_date, invoice_amount, paid_amount, pending_amount, status,
 *            company_name, site_name, site_address }
 * payments: [{ date, mode, amount }]
 */
function writeInvoiceSummaryPdf(stream, invoice, payments, support) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `Invoice summary ${invoice.invoice_number || ""}`.trim(), Author: "BestServe" },
  });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
  doc.pipe(stream);

  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  // ---- Header: logo + title block ----
  try {
    doc.image(LOGO, left, 44, { fit: [150, 48] });
  } catch {
    doc.font("B").fontSize(18).fillColor(BLUE).text("BestServe", left, 54);
  }
  doc.font("B").fontSize(20).fillColor(BLUE).text("Invoice summary", left, 46, { width, align: "right" });
  doc.font("R").fontSize(10).fillColor(MUTED)
    .text(`Invoice No. ${invoice.invoice_number || "—"}`, left, 72, { width, align: "right" });

  doc.moveTo(left, 108).lineTo(right, 108).lineWidth(1).strokeColor(LINE).stroke();

  // ---- Billed to (left) and dates (right) ----
  let y = 124;
  doc.font("SB").fontSize(9).fillColor(MUTED).text("BILLED TO", left, y);
  doc.font("B").fontSize(13).fillColor(INK).text(invoice.company_name || "—", left, y + 14, { width: width * 0.55 });
  let by = doc.y + 2;
  if (invoice.site_name) {
    doc.font("SB").fontSize(10.5).fillColor(INK).text(invoice.site_name, left, by, { width: width * 0.55 });
    by = doc.y + 1;
  }
  if (invoice.site_address) {
    doc.font("R").fontSize(10).fillColor(MUTED).text(invoice.site_address, left, by, { width: width * 0.55 });
  }
  const billedBottom = doc.y;

  const facts = [
    ["Invoice date", fmtDate(invoice.invoice_date)],
    ["Due date", fmtDate(invoice.due_date)],
    ["Status", STATUS_LABELS[String(invoice.status || "").toUpperCase()] || invoice.status || "—"],
  ];
  let fy = y;
  for (const [label, value] of facts) {
    doc.font("R").fontSize(10).fillColor(MUTED).text(label, left + width * 0.6, fy, { width: width * 0.2 });
    doc.font("SB").fontSize(10).fillColor(INK).text(value, left + width * 0.8, fy, { width: width * 0.2, align: "right" });
    fy += 18;
  }

  // ---- Bill details box ----
  y = Math.max(billedBottom, fy) + 24;
  doc.font("B").fontSize(13).fillColor(INK).text("Bill details", left, y);
  y += 24;
  const boxTop = y;
  const pad = 16;
  const row = (label, value, opts = {}) => {
    doc.font(opts.bold ? "B" : "R").fontSize(opts.size || 11).fillColor(opts.labelColor || (opts.bold ? INK : MUTED))
      .text(label, left + pad, y, { width: width / 2 });
    doc.font(opts.bold ? "B" : "SB").fontSize(opts.size || 11).fillColor(opts.color || INK)
      .text(value, left + width / 2, y, { width: width / 2 - pad, align: "right" });
    y += opts.gap || 24;
  };
  y += pad;
  row("Invoice amount", money(invoice.invoice_amount));
  row("Paid so far", `-${money(invoice.paid_amount)}`, { color: GREEN });
  y += 2;
  doc.moveTo(left + pad, y).lineTo(right - pad, y).dash(3, { space: 3 }).lineWidth(1).strokeColor("#CBD5E1").stroke().undash();
  y += 12;
  const balance = Number(invoice.pending_amount) || 0;
  row("Balance due", money(balance), { bold: true, size: 13, color: balance > 0 ? RED : GREEN, gap: 22 });
  y += pad - 6;
  doc.roundedRect(left, boxTop, width, y - boxTop, 10).lineWidth(1).strokeColor(LINE).stroke();

  // ---- Payments received ----
  y += 26;
  doc.font("B").fontSize(13).fillColor(INK).text("Payments received", left, y);
  y += 24;
  if (!payments.length) {
    doc.font("R").fontSize(10.5).fillColor(MUTED).text("No payments have been recorded against this invoice yet.", left, y);
    y = doc.y;
  } else {
    const cols = [left + pad, left + width * 0.38, left + width * 0.62];
    doc.rect(left, y, width, 24).fillColor("#F1F5F9").fill();
    doc.font("SB").fontSize(9.5).fillColor(MUTED);
    doc.text("DATE", cols[0], y + 8);
    doc.text("PAID BY", cols[1], y + 8);
    doc.text("AMOUNT", cols[2], y + 8, { width: right - pad - cols[2], align: "right" });
    y += 24;
    for (const p of payments) {
      doc.font("R").fontSize(10.5).fillColor(INK);
      doc.text(fmtDate(p.date), cols[0], y + 8);
      doc.text(MODE_LABELS[String(p.mode || "").toUpperCase()] || p.mode || "—", cols[1], y + 8);
      doc.font("SB").text(money(p.amount), cols[2], y + 8, { width: right - pad - cols[2], align: "right" });
      y += 26;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(LINE).stroke();
    }
  }

  // ---- Footer note ----
  const noteY = doc.page.height - 48 - 46;
  doc.moveTo(left, noteY - 10).lineTo(right, noteY - 10).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.font("R").fontSize(9).fillColor(MUTED).text(
    `This summary was generated from BestServe's records on ${fmtDate(new Date())}. It is not a GST tax invoice. `
      + `For a copy of the tax invoice, contact ${support.email} or ${support.phone}.`,
    left, noteY, { width }
  );

  doc.end();
}

module.exports = { writeInvoiceSummaryPdf };
