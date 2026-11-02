const path = require("path");
const PDFDocument = require("pdfkit");

// ---------------------------------------------------------------------------
// The Brigade tax invoice PDF, laid out like BESTSERVE's own invoice:
//   Tax Invoice title, seller block with logo, Bill To / Ship To / Invoice
//   Details, the item table, SGST + CGST, amount in words, description, bank
//   details, terms and the signatory. Drawn from a saved snapshot (`content`),
//   so re-downloading an invoice always prints exactly what was issued.
// ---------------------------------------------------------------------------

const SELLER = {
  name: "BESTSERVE PEST MANAGEMENT PVT LTD",
  lines: [
    "NO 372/2 LOKESH BUILDING HOGEBANDI GARDEN DLF NEW TOWN BEGUR",
    "Phone no.: 8884442602 Email: accounts@bestserve.in",
    "GSTIN: 29AAFCB0465J1ZK, State: 29-Karnataka",
    "MSME-: UDYAM-KR-03-0011173",
    "SAC -: 998531/998533",
  ],
};

// Every Brigade property is billed to the parent company.
const BILL_TO = {
  name: "Brigade Enterprises Limited",
  lines: [
    "29th & 30th floor, World Trade Center,",
    "26/1, Brigade Gateway Campus,",
    "Dr.Rajkumar Road, Bangalore- 560055.",
    "Karnataka, INDIA.",
    "Ph: 80-41379200",
  ],
  gstin: "29AAACB7459F1ZI",
  state: "29-Karnataka",
};

const PLACE_OF_SUPPLY = "29-Karnataka";
const TAX_RATE = 9; // SGST and CGST each (intra-state)

// Bank details: label | value, drawn as two aligned columns.
const BANK = [
  ["Bank", "ICICI Bank Limited, Bannerghatta"],
  ["Account No.", "100705001440"],
  ["IFSC Code", "ICIC0001007"],
  ["Account Name", "Bestserve Pest Management Pvt Ltd"],
];

const TERMS = [
  "All Payments should be made in the name of Bestserve pest management Pvt ltd.",
  '"Thanks for your Business. As we are raise the invoice after providing the service we request you to clear the payment Immediately"',
];

const LOGO = path.join(__dirname, "../../assets/quotation-logo.png");
// The company's stamp with signature (transparent PNG).
const STAMP = path.join(__dirname, "../../assets/invoice-stamp.png");
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
// Liberation Serif (SIL Open Font License): the same shapes and widths as Times New Roman,
// which itself cannot be bundled. Like Times New Roman it has no rupee sign, so only the "₹"
// is drawn in Plus Jakarta Sans (RS / RSB) - see moneyAt().
const FONTS = {
  R: "LiberationSerif-Regular.ttf",
  B: "LiberationSerif-Bold.ttf",
  RS: "PlusJakartaSans-Regular.ttf",
  RSB: "PlusJakartaSans-Bold.ttf",
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "2026-10-31" -> "31-10-2026" (the sample's date style). */
function dmy(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// ---- amount in words (Indian system: thousand, lakh, crore) --------------------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function wholeWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${wholeWords(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 4720 -> "Four Thousand Seven Hundred Twenty Rupees only"; 10.5 -> "... Rupees and Fifty Paise only". */
function amountInWords(amount) {
  const paiseTotal = Math.round((Number(amount) || 0) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  return `${wholeWords(rupees)} Rupees${paise ? ` and ${below1000(paise)} Paise` : ""} only`;
}

/** The tax figures for a taxable amount: SGST and CGST at 9% each. */
function taxFor(subtotal) {
  const sub = round2(subtotal);
  const sgst = round2((sub * TAX_RATE) / 100);
  const cgst = round2((sub * TAX_RATE) / 100);
  return { subtotal: sub, sgst, cgst, total: round2(sub + sgst + cgst) };
}

// ---- drawing ----------------------------------------------------------------------

/**
 * Writes the invoice PDF for `content` to `stream`:
 * { invoice_number, invoice_date, po_number, po_date, ship_to: [..], lines: [{ name, bill_value, qty, amount }],
 *   subtotal, sgst, cgst, total, description }. `preview` stamps it PREVIEW (not issued yet).
 */
function renderInvoicePdf(content, stream, { preview = false } = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Tax Invoice ${content.invoice_number || ""}`.trim() } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
  doc.pipe(stream);

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

  /**
   * "₹ 4,000.00" in a box `width` wide at (x, y): the number in the invoice font and the rupee
   * sign in a font that has it, placed together so the pair aligns like one piece of text.
   */
  function moneyAt(value, x, y, width, { bold = false, size = 8, align = "right" } = {}) {
    const sign = "₹ ";
    const amount = inr2.format(Number(value) || 0);
    const signW = doc.font(bold ? "RSB" : "RS").fontSize(size).widthOfString(sign);
    const amountW = doc.font(bold ? "B" : "R").fontSize(size).widthOfString(amount);
    const start = align === "right" ? x + width - signW - amountW : x;
    // The sans rupee sign sits a touch high next to serif figures; nudge it onto the baseline.
    font(bold ? "RSB" : "RS", size * 0.92).text(sign, start, y + size * 0.06, { lineBreak: false });
    font(bold ? "B" : "R", size).text(amount, start + signW, y, { lineBreak: false });
  }

  function watermark() {
    if (!preview) return;
    doc.save();
    doc.rotate(-30, { origin: [297, 421] });
    font("B", 90, "#ececec").text("PREVIEW", 60, 380, { width: 480, align: "center", lineBreak: false });
    doc.restore();
  }
  watermark();

  // ---- title -------------------------------------------------------------------
  font("B", 12).text("Tax Invoice", L, 26, { width: W, align: "center" });
  let y = 44;
  // Where the outer frame starts on the current page (the first page starts under the title).
  let frameTop = y;

  // ---- seller ----------------------------------------------------------------------
  const sellerH = 104;
  // The logo image already carries the company name under the mark.
  doc.image(LOGO, L + 8, y + 18, { height: 40 });
  font("B", 12.5).text(SELLER.name, L + 200, y + 10, { width: W - 208, align: "right" });
  let sy = y + 30;
  for (const line of SELLER.lines) {
    font("R", 7.6).text(line, L + 200, sy, { width: W - 208, align: "right" });
    sy += 13;
  }
  y += sellerH;
  hline(y);

  // ---- Bill To / Ship To / Invoice Details ------------------------------------------
  const c1 = L + Math.round(W * 0.335);
  const c2 = L + Math.round(W * 0.67);
  font("B", 8.4).text("Bill To", L + PAD, y + 5, { lineBreak: false });
  font("B", 8.4).text("Ship To", c1 + PAD, y + 5, { lineBreak: false });
  font("B", 8.4).text("Invoice Details", c2 + PAD, y + 5, { width: R - c2 - PAD * 2, align: "right", lineBreak: false });
  const partyHead = y;
  y += 19;
  hline(y);

  const billLines = [
    ["B", BILL_TO.name, 4],
    ...BILL_TO.lines.map((t) => ["R", t, 0]),
    ["R", "", 4],
    ["R", `GSTIN : ${BILL_TO.gstin}`, 4],
    ["R", `State: ${BILL_TO.state}`, 0],
  ];
  let by = y + 6;
  for (const [f, t, after] of billLines) {
    if (t) font(f, 8).text(t, L + PAD, by, { width: c1 - L - PAD * 2 });
    by += (t ? textH(t, c1 - L - PAD * 2, 8, f) : 6) + after;
  }

  // Ship To: the property and its service address. (Invoices issued before addresses were
  // added saved only property names - plain strings - and print as before.)
  let shy = y + 6;
  const shipW = c2 - c1 - PAD * 2;
  const shipTo = content.ship_to || [];
  if (!shipTo.length) font("R", 8).text("-", c1 + PAD, shy, { width: shipW });
  for (const entry of shipTo) {
    const name = typeof entry === "string" ? entry : entry.name;
    const addresses = typeof entry === "string" ? [] : entry.addresses || [];
    if (name) {
      font("B", 8).text(name, c1 + PAD, shy, { width: shipW });
      shy += textH(name, shipW, 8, "B") + 2;
    }
    for (const address of addresses) {
      font("R", 8).text(address, c1 + PAD, shy, { width: shipW });
      shy += textH(address, shipW, 8) + 4;
    }
    shy += 4;
  }

  const details = [
    `Invoice No. : ${content.invoice_number || "(assigned when saved)"}`,
    `Date : ${dmy(content.invoice_date)}`,
    `Place of supply: ${PLACE_OF_SUPPLY}`,
    `PO Date : ${dmy(content.po_date) || "-"}`,
    `PO Number : ${content.po_number}`,
  ];
  let dy = y + 6;
  for (const t of details) {
    font("R", 8).text(t, c2 + PAD, dy, { width: R - c2 - PAD * 2, align: "right" });
    dy += 14;
  }
  y = Math.max(by, dy, shy) + 8;
  vline(c1, partyHead, y);
  vline(c2, partyHead, y);
  hline(y);

  // ---- items ----------------------------------------------------------------------------
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
  // The space the rest of the invoice needs under the table (totals, tax, words, bank).
  const FOOTER_H = 290;

  function itemHeader(yy) {
    cols.forEach((c, i) => font("B", 8).text(c.label, colX[i] + PAD, yy + 5, { width: colW(i) - PAD * 2, align: c.align, lineBreak: false }));
    hline(yy + 19);
    return yy + 19;
  }
  let tableTop = y;
  y = itemHeader(y);

  const lines = content.lines || [];
  const minBodyEnd = y + 180; // an empty-looking table body, like the sample
  lines.forEach((line, i) => {
    const nameH = textH(line.name, colW(1) - PAD * 2, 8, "B");
    const rowH = Math.max(18, nameH + 8);
    if (y + rowH > PAGE_H - 40 - (i === lines.length - 1 ? FOOTER_H : 0)) {
      // Next page: close this table section, start again with the header row.
      cols.forEach((_, ci) => ci > 0 && vline(colX[ci], tableTop, y));
      box(L, frameTop, W, y - frameTop);
      doc.addPage();
      watermark();
      y = 30;
      frameTop = y;
      tableTop = y;
      hline(y);
      y = itemHeader(y);
    }
    font("R", 8).text(String(i + 1), colX[0] + PAD, y + 5, { width: colW(0) - PAD * 2 });
    font("B", 8).text(line.name, colX[1] + PAD, y + 5, { width: colW(1) - PAD * 2 });
    moneyAt(line.bill_value, colX[2] + PAD, y + 5, colW(2) - PAD * 2);
    font("R", 8).text(String(line.qty), colX[3] + PAD, y + 5, { width: colW(3) - PAD * 2, align: "right" });
    moneyAt(line.amount, colX[4] + PAD, y + 5, colW(4) - PAD * 2);
    y += rowH;
  });
  y = Math.max(y, minBodyEnd);
  hline(y);

  const qty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  font("B", 8).text("Total", colX[1] + PAD, y + 5, { lineBreak: false });
  font("B", 8).text(String(qty), colX[3] + PAD, y + 5, { width: colW(3) - PAD * 2, align: "right", lineBreak: false });
  moneyAt(content.subtotal, colX[4] + PAD, y + 5, colW(4) - PAD * 2, { bold: true });
  const totalRowEnd = y + 19;
  cols.forEach((_, ci) => ci > 0 && vline(colX[ci], tableTop, totalRowEnd));
  y = totalRowEnd;
  hline(y);

  // ---- tax table (left) and amounts (right) ---------------------------------------------
  const mid = L + Math.round(W * 0.5);
  const taxCols = [L + PAD, L + 70, L + 160, L + 205];
  const taxTop = y;
  font("B", 8).text("Tax type", taxCols[0], y + 5, { lineBreak: false });
  font("B", 8).text("Taxable amount", taxCols[1], y + 5, { width: 85, align: "right", lineBreak: false });
  font("B", 8).text("Rate", taxCols[2], y + 5, { width: 40, align: "right", lineBreak: false });
  font("B", 8).text("Tax amount", taxCols[3], y + 5, { width: mid - taxCols[3] - PAD, align: "right", lineBreak: false });
  font("B", 8).text("Amounts", mid + PAD, y + 5, { lineBreak: false });
  let ty = y + 24;
  for (const [label, amt] of [["SGST", content.sgst], ["CGST", content.cgst]]) {
    font("R", 8).text(label, taxCols[0], ty, { lineBreak: false });
    moneyAt(content.subtotal, taxCols[1], ty, 85);
    font("R", 8).text(`${TAX_RATE}%`, taxCols[2], ty, { width: 40, align: "right", lineBreak: false });
    moneyAt(amt, taxCols[3], ty, mid - taxCols[3] - PAD);
    ty += 24;
  }
  const ay = y + 24;
  font("R", 8).text("Sub Total", mid + PAD, ay, { lineBreak: false });
  moneyAt(content.subtotal, mid + PAD, ay, R - mid - PAD * 2);
  font("R", 8).text(`Tax (${TAX_RATE * 2}%)`, mid + PAD, ay + 24, { lineBreak: false });
  moneyAt(round2(content.sgst + content.cgst), mid + PAD, ay + 24, R - mid - PAD * 2);
  // Total sits under a rule, below Tax (18%).
  const totalY = ay + 24 + 18;
  hline(totalY, mid, R);
  font("B", 8.4).text("Total", mid + PAD, totalY + 5, { lineBreak: false });
  moneyAt(content.total, mid + PAD, totalY + 5, R - mid - PAD * 2, { bold: true, size: 8.4 });
  const taxEnd = Math.max(ty + 4, totalY + 21);
  vline(mid, taxTop, taxEnd);
  y = taxEnd;
  hline(y);

  // ---- amount in words (left) and description (right) ----------------------------------
  const wordsTop = y;
  font("B", 8.4).text("Invoice Amount In Words", L + PAD, y + 6, { width: mid - L - PAD * 2, align: "center" });
  font("B", 8.4).text("Description", mid + PAD, y + 6, { lineBreak: false });
  const words = amountInWords(content.total);
  font("R", 8).text(words, L + PAD, y + 26, { width: mid - L - PAD * 2, align: "center" });
  font("R", 8).text(content.description || "", mid + PAD, y + 26, { width: R - mid - PAD * 2 });
  const wordsH = Math.max(textH(words, mid - L - PAD * 2, 8), textH(content.description || "", R - mid - PAD * 2, 8));
  y = y + 32 + wordsH;
  vline(mid, wordsTop, y);
  hline(y);

  // ---- bank details / terms / signatory ----------------------------------------------------
  const b1 = L + Math.round(W * 0.335);
  const b2 = L + Math.round(W * 0.67);
  const bankTop = y;
  font("B", 8.4).text("Bank Details", L + PAD + 4, y + 6, { lineBreak: false });
  font("B", 8.4).text("Terms and Conditions", b1 + PAD, y + 6, { lineBreak: false });
  font("R", 8).text(`For : ${SELLER.name}`, b2 + PAD, y + 12, { width: R - b2 - PAD * 2, align: "center" });

  const bankX = L + PAD + 4;
  const bankW = b1 - bankX - PAD;
  // Labels in a fixed column, values in the next one, so a wrapped value stays under its value.
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

  // The company stamp with signature, between "For: ..." and "Authorized Signatory".
  const bankEnd = Math.max(ky, ry, y + 104) + 4;
  const stampTop = y + 34;
  const stampH = bankEnd - 24 - stampTop;
  doc.image(STAMP, b2 + PAD, stampTop, { fit: [R - b2 - PAD * 2, stampH], align: "center", valign: "center" });
  font("B", 8.4).text("Authorized Signatory", b2 + PAD, bankEnd - 20, { width: R - b2 - PAD * 2, align: "center", lineBreak: false });
  vline(b1, bankTop, bankEnd);
  vline(b2, bankTop, bankEnd);
  y = bankEnd;

  box(L, frameTop, W, y - frameTop);
  doc.end();
}

module.exports = { renderInvoicePdf, amountInWords, taxFor, round2 };
