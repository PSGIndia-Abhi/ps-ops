const path = require("path");
const PDFDocument = require("pdfkit");
const { amountInWords, SELLER, BANK, TERMS, LOGO, STAMP, FONT_DIR, FONTS } = require("./brigadeInvoiceDocument");

// ---------------------------------------------------------------------------
// The Invoice Generation (Billing) invoice PDF. Same layout and company details as the
// Brigade tax invoice (utils/brigadeInvoiceDocument.js), with what generated invoices need:
//   * Bill To / Ship To from the customer's billing profile and outlet
//   * CGST + SGST, IGST (outside Karnataka) or no tax rows (Residential, titled "Invoice")
//   * a Round off row, any number of PO numbers (no due date is printed)
//   * copies: one set of pages per copy, labelled "ORIGINAL FOR RECIPIENT", ...
//   * PREVIEW (draft) and CANCELLED watermarks
// Drawn only from `content` (billing_invoices.content, frozen on issue), so a re-download or
// re-print is always identical to what was issued.
// ---------------------------------------------------------------------------

const COPY_LABELS = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER", "EXTRA COPY"];

const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

function dmy(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** One copy of the invoice, starting on the current page. */
function drawCopy(doc, content, { label = "", watermarkText = "" } = {}) {
  const PAGE_H = 842;
  const L = 30;
  const R = 565;
  const W = R - L;
  const PAD = 6;
  const LINE = "#7a7a7a";
  const INK = "#111111";

  const font = (name, size, color = INK) => doc.font(name).fontSize(size).fillColor(color);
  const hline = (y, x1 = L, x2 = R) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(0.7).strokeColor(LINE).stroke();
  const vline = (x, y1, y2) => doc.moveTo(x, y1).lineTo(x, y2).lineWidth(0.7).strokeColor(LINE).stroke();
  const box = (x, y, w, h) => doc.rect(x, y, w, h).lineWidth(0.7).strokeColor(LINE).stroke();
  const textH = (str, width, size, name = "R") => doc.font(name).fontSize(size).heightOfString(str, { width });

  function moneyAt(value, x, y, width, { bold = false, size = 8, align = "right" } = {}) {
    const sign = Number(value) < 0 ? "- ₹ " : "₹ ";
    const amount = inr2.format(Math.abs(Number(value) || 0));
    const signW = doc.font(bold ? "RSB" : "RS").fontSize(size).widthOfString(sign);
    const amountW = doc.font(bold ? "B" : "R").fontSize(size).widthOfString(amount);
    const start = align === "right" ? x + width - signW - amountW : x;
    font(bold ? "RSB" : "RS", size * 0.92).text(sign, start, y + size * 0.06, { lineBreak: false });
    font(bold ? "B" : "R", size).text(amount, start + signW, y, { lineBreak: false });
  }

  function pageMarks() {
    if (watermarkText) {
      doc.save();
      doc.rotate(-30, { origin: [297, 421] });
      font("B", 90, "#ececec").text(watermarkText, 0, 380, { width: 594, align: "center", lineBreak: false });
      doc.restore();
    }
    if (label) font("B", 7.5, "#555555").text(label, L, 14, { width: W, align: "right", lineBreak: false });
  }
  pageMarks();

  // ---- title -------------------------------------------------------------------
  font("B", 12).text(content.title || "Tax Invoice", L, 26, { width: W, align: "center" });
  let y = 44;
  let frameTop = y;

  // ---- seller ------------------------------------------------------------------
  doc.image(LOGO, L + 8, y + 18, { height: 40 });
  font("B", 12.5).text(SELLER.name, L + 200, y + 10, { width: W - 208, align: "right" });
  let sy = y + 30;
  for (const line of SELLER.lines) {
    font("R", 7.6).text(line, L + 200, sy, { width: W - 208, align: "right" });
    sy += 13;
  }
  y += 104;
  hline(y);

  // ---- Bill To / Ship To / Invoice Details ---------------------------------------
  // Group based invoices have no Ship To: Bill To and Invoice Details share the width half and half.
  const noShip = Boolean(content.hide_ship_to);
  const c1 = L + Math.round(W * (noShip ? 0.5 : 0.335));
  const c2 = noShip ? c1 : L + Math.round(W * 0.67);
  font("B", 8.4).text("Bill To", L + PAD, y + 5, { lineBreak: false });
  font("B", 8.4).text("Service Offered By", c1 + PAD, y + 5, { lineBreak: false });
  font("B", 8.4).text("Invoice Details", c2 + PAD, y + 5, { width: R - c2 - PAD * 2, align: "right", lineBreak: false });
  const partyHead = y;
  y += 19;
  hline(y);

  const billTo = content.bill_to || {};
  const billLines = [
    ["B", billTo.name || "", 4],
    ...(billTo.lines || []).map((t) => ["R", t, 0]),
    ["R", "", 4],
    ...(billTo.gstin ? [["R", `GSTIN : ${billTo.gstin}`, 4]] : []),
    ...(billTo.state ? [["R", `State: ${billTo.state}`, 0]] : []),
  ];
  let by = y + 6;
  for (const [f, t, after] of billLines) {
    if (t) font(f, 8).text(t, L + PAD, by, { width: c1 - L - PAD * 2 });
    by += (t ? textH(t, c1 - L - PAD * 2, 8, f) : 6) + after;
  }

  let shy = y + 6;
  const shipW = c2 - c1 - PAD * 2;
  // No outlet chosen: show the Bill To customer's name and address here instead.
  const shipTo = (content.ship_to || []).length
    ? content.ship_to
    : [{ name: billTo.name || "", addresses: [...(billTo.lines || []), ...(billTo.state ? [`State: ${billTo.state}`] : [])] }];
  for (const entry of shipTo) {
    if (entry.name) {
      font("B", 8).text(entry.name, c1 + PAD, shy, { width: shipW });
      shy += textH(entry.name, shipW, 8, "B") + 2;
    }
    for (const address of entry.addresses || []) {
      font("R", 8).text(address, c1 + PAD, shy, { width: shipW });
      shy += textH(address, shipW, 8) + 4;
    }
    shy += 4;
  }

  const pos = content.pos || [];
  const details = [
    `Invoice No. : ${content.invoice_number || "(given when issued)"}`,
    `Date : ${dmy(content.invoice_date)}`,
    `Place of supply: ${content.place_of_supply || ""}`,
    ...(pos.length
      ? [`PO Date : ${pos.map((p) => dmy(p.po_date) || "-").join(" / ")}`, `PO Number : ${pos.map((p) => p.po_number).join(" / ")}`]
      : []),
  ];
  let dy = y + 6;
  for (const t of details) {
    font("R", 8).text(t, c2 + PAD, dy, { width: R - c2 - PAD * 2, align: "right" });
    dy += textH(t, R - c2 - PAD * 2, 8) + 4;
  }
  y = Math.max(by, dy, shy) + 8;
  vline(c1, partyHead, y);
  if (!noShip) vline(c2, partyHead, y);
  hline(y);

  // ---- items -----------------------------------------------------------------------
  const cols = [
    { label: "#", w: 0.06, align: "left" },
    { label: "Item name", w: 0.46, align: "left" },
    { label: "Bill Value", w: 0.18, align: "right" },
    { label: "Quantity", w: 0.15, align: "right" },
    { label: "Amount", w: 0.15, align: "right" },
  ];
  const colX = [];
  let cx = L;
  for (const c of cols) {
    colX.push(cx);
    cx += W * c.w;
  }
  const colW = (i) => (i + 1 < cols.length ? colX[i + 1] : R) - colX[i];
  const FOOTER_H = 310;

  function itemHeader(yy) {
    cols.forEach((c, i) => font("B", 8).text(c.label, colX[i] + PAD, yy + 5, { width: colW(i) - PAD * 2, align: c.align, lineBreak: false }));
    hline(yy + 19);
    return yy + 19;
  }
  let tableTop = y;
  y = itemHeader(y);

  const lines = content.lines || [];
  const minBodyEnd = y + 160;
  const qtyText = (q) => (Number.isInteger(Number(q)) ? String(Number(q)) : String(Number(q)));
  lines.forEach((line, i) => {
    const nameH = textH(line.name, colW(1) - PAD * 2, 8, "B");
    const rowH = Math.max(18, nameH + 8);
    if (y + rowH > PAGE_H - 40 - (i === lines.length - 1 ? FOOTER_H : 0)) {
      cols.forEach((_, ci) => ci > 0 && vline(colX[ci], tableTop, y));
      box(L, frameTop, W, y - frameTop);
      doc.addPage();
      pageMarks();
      y = 30;
      frameTop = y;
      tableTop = y;
      hline(y);
      y = itemHeader(y);
    }
    font("R", 8).text(String(i + 1), colX[0] + PAD, y + 5, { width: colW(0) - PAD * 2 });
    font("B", 8).text(line.name, colX[1] + PAD, y + 5, { width: colW(1) - PAD * 2 });
    moneyAt(line.bill_value, colX[2] + PAD, y + 5, colW(2) - PAD * 2);
    font("R", 8).text(qtyText(line.qty), colX[3] + PAD, y + 5, { width: colW(3) - PAD * 2, align: "right" });
    moneyAt(line.amount, colX[4] + PAD, y + 5, colW(4) - PAD * 2);
    y += rowH;
  });
  if (y + FOOTER_H > PAGE_H - 30) {
    // The totals do not fit under the last line: continue on a new page.
    cols.forEach((_, ci) => ci > 0 && vline(colX[ci], tableTop, y));
    box(L, frameTop, W, y - frameTop);
    doc.addPage();
    pageMarks();
    y = 30;
    frameTop = y;
    tableTop = y;
    hline(y);
  } else {
    y = Math.max(y, minBodyEnd);
  }
  hline(y);

  font("B", 8).text("Total", colX[1] + PAD, y + 5, { lineBreak: false });
  moneyAt(content.subtotal, colX[4] + PAD, y + 5, colW(4) - PAD * 2, { bold: true });
  const totalRowEnd = y + 19;
  cols.forEach((_, ci) => ci > 0 && vline(colX[ci], tableTop, totalRowEnd));
  y = totalRowEnd;
  hline(y);

  // ---- tax table (left) and amounts (right) -------------------------------------------
  const mid = L + Math.round(W * 0.5);
  const taxCols = [L + PAD, L + 70, L + 160, L + 205];
  const taxTop = y;
  // The invoice's GST rate (copied from its contract); invoices from before the rate was stored are 18 %.
  const gstRate = [5, 12, 18, 28].includes(Number(content.gst_rate)) ? Number(content.gst_rate) : 18;
  const halfRate = gstRate / 2;
  const taxRows =
    content.tax_mode === "IGST" ? [["IGST", content.igst, gstRate]] : content.tax_mode === "NONE" ? [] : [["SGST", content.sgst, halfRate], ["CGST", content.cgst, halfRate]];
  font("B", 8).text("Tax type", taxCols[0], y + 5, { lineBreak: false });
  font("B", 8).text("Taxable amount", taxCols[1], y + 5, { width: 85, align: "right", lineBreak: false });
  font("B", 8).text("Rate", taxCols[2], y + 5, { width: 40, align: "right", lineBreak: false });
  font("B", 8).text("Tax amount", taxCols[3], y + 5, { width: mid - taxCols[3] - PAD, align: "right", lineBreak: false });
  font("B", 8).text("Amounts", mid + PAD, y + 5, { lineBreak: false });
  let ty = y + 24;
  if (!taxRows.length) {
    font("R", 8).text(content.category === "RESIDENTIAL" ? "No GST (Residential customer)" : "No GST", taxCols[0], ty, { width: mid - taxCols[0] - PAD, lineBreak: false });
    ty += 24;
  }
  for (const [label, amt, rate] of taxRows) {
    font("R", 8).text(label, taxCols[0], ty, { lineBreak: false });
    moneyAt(content.subtotal, taxCols[1], ty, 85);
    font("R", 8).text(`${rate}%`, taxCols[2], ty, { width: 40, align: "right", lineBreak: false });
    moneyAt(amt, taxCols[3], ty, mid - taxCols[3] - PAD);
    ty += 24;
  }
  const taxTotal = round2((content.cgst || 0) + (content.sgst || 0) + (content.igst || 0));
  const amountRows = [["Sub Total", content.subtotal]];
  if (taxRows.length) amountRows.push([`Tax (${gstRate}%)`, taxTotal]);
  if (Number(content.round_off)) amountRows.push(["Round off", content.round_off]);
  let ay = y + 24;
  for (const [label, value] of amountRows) {
    font("R", 8).text(label, mid + PAD, ay, { lineBreak: false });
    moneyAt(value, mid + PAD, ay, R - mid - PAD * 2);
    ay += 24;
  }
  const totalY = ay - 6;
  hline(totalY, mid, R);
  font("B", 8.4).text("Total", mid + PAD, totalY + 5, { lineBreak: false });
  moneyAt(content.total, mid + PAD, totalY + 5, R - mid - PAD * 2, { bold: true, size: 8.4 });
  const taxEnd = Math.max(ty + 4, totalY + 21);
  vline(mid, taxTop, taxEnd);
  y = taxEnd;
  hline(y);

  // ---- amount in words (left) and description (right) --------------------------------
  const wordsTop = y;
  font("B", 8.4).text("Invoice Amount In Words", L + PAD, y + 6, { width: mid - L - PAD * 2, align: "center" });
  font("B", 8.4).text("Description", mid + PAD, y + 6, { lineBreak: false });
  const words = content.amount_in_words || amountInWords(content.total);
  font("R", 8).text(words, L + PAD, y + 26, { width: mid - L - PAD * 2, align: "center" });
  font("R", 8).text(content.description || "", mid + PAD, y + 26, { width: R - mid - PAD * 2 });
  const wordsH = Math.max(textH(words, mid - L - PAD * 2, 8), textH(content.description || "", R - mid - PAD * 2, 8));
  y = y + 32 + wordsH;
  vline(mid, wordsTop, y);
  hline(y);

  // ---- bank details / terms / signatory --------------------------------------------------
  const b1 = L + Math.round(W * 0.335);
  const b2 = L + Math.round(W * 0.67);
  const bankTop = y;
  font("B", 8.4).text("Bank Details", L + PAD + 4, y + 6, { lineBreak: false });
  font("B", 8.4).text("TERMS AND CONDITIONS", b1 + PAD, y + 6, { lineBreak: false });
  font("R", 8).text(`For : ${SELLER.name}`, b2 + PAD, y + 12, { width: R - b2 - PAD * 2, align: "center" });

  const bankX = L + PAD + 4;
  const bankW = b1 - bankX - PAD;
  const labelW = 62;
  const valueX = bankX + labelW;
  const valueW = bankW - labelW;
  let ky = y + 24;
  for (const [k, v] of BANK) {
    font("B", 7.8).text(k, bankX, ky, { width: labelW - 6, lineBreak: false });
    font("R", 7.8).text(v, valueX, ky, { width: valueW });
    ky += Math.max(textH(k, labelW - 6, 7.8, "B"), textH(v, valueW, 7.8)) + 6;
  }
  let ry = y + 24;
  for (const t of TERMS) {
    font("R", 7.6).text(t, b1 + PAD, ry, { width: b2 - b1 - PAD * 2 });
    ry += textH(t, b2 - b1 - PAD * 2, 7.6) + 10;
  }
  const bankEnd = Math.max(ky, ry, y + 104) + 4;
  const stampTop = y + 34;
  const stampH = bankEnd - 24 - stampTop;
  doc.image(STAMP, b2 + PAD, stampTop, { fit: [R - b2 - PAD * 2, stampH], align: "center", valign: "center" });
  font("B", 8.4).text("Authorized Signatory", b2 + PAD, bankEnd - 20, { width: R - b2 - PAD * 2, align: "center", lineBreak: false });
  vline(b1, bankTop, bankEnd);
  vline(b2, bankTop, bankEnd);
  y = bankEnd;
  box(L, frameTop, W, y - frameTop);
}

/**
 * Writes the invoice PDF to `stream`. Options:
 *   copies  number of copies (1-4), each a separate set of pages with its label; 1 copy prints no label
 *   preview PREVIEW watermark (draft)     cancelled  CANCELLED watermark
 */
function renderBillingInvoicePdf(content, stream, { copies = 1, preview = false, cancelled = false, labelSingle = false } = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `${content.title || "Tax Invoice"} ${content.invoice_number || ""}`.trim() } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
  doc.pipe(stream);
  const count = Math.min(Math.max(Number(copies) || 1, 1), COPY_LABELS.length);
  const watermarkText = preview ? "PREVIEW" : cancelled ? "CANCELLED" : "";
  for (let i = 0; i < count; i += 1) {
    if (i > 0) doc.addPage();
    drawCopy(doc, content, { label: count > 1 || labelSingle ? COPY_LABELS[i] : "", watermarkText });
  }
  doc.end();
}

/**
 * Several invoices in ONE PDF (Download all / Print all): items = [{ content, copies, cancelled }].
 * Each invoice starts on a new page; with copies > 1 every copy is labelled.
 */
function renderBillingInvoicesPdf(items, stream, { title = "Invoices" } = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: title } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
  doc.pipe(stream);
  let first = true;
  for (const it of items) {
    const count = Math.min(Math.max(Number(it.copies) || 1, 1), COPY_LABELS.length);
    for (let i = 0; i < count; i += 1) {
      if (!first) doc.addPage();
      first = false;
      drawCopy(doc, it.content, { label: count > 1 ? COPY_LABELS[i] : "", watermarkText: it.cancelled ? "CANCELLED" : "" });
    }
  }
  doc.end();
}

/** The PDF as a Buffer (for email attachments). */
function billingInvoicePdfBuffer(content, options) {
  return new Promise((resolve, reject) => {
    const { PassThrough } = require("stream");
    const sink = new PassThrough();
    const chunks = [];
    sink.on("data", (c) => chunks.push(c));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);
    try {
      renderBillingInvoicePdf(content, sink, options);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderBillingInvoicePdf, renderBillingInvoicesPdf, billingInvoicePdfBuffer, COPY_LABELS };
