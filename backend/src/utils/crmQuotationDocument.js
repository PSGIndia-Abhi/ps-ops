const path = require("path");
const PDFDocument = require("pdfkit");

// ---------------------------------------------------------------------------
// Quotations built from the quotation master: checking what the builder sent
// (normalizeQuotationContent) and drawing the customer-facing PDF
// (renderQuotationPdf). The company block, signatory and standard wording are
// fixed here; everything else comes from the request.
// ---------------------------------------------------------------------------

const COMPANY = {
  name: "Bestserve Pest Management Pvt. Ltd.",
  addressLines: ["#372/2, Lokesh Building, Hogebandi Garden, DLF New Town", "Begur, Bangalore - 560068"],
  contact: "+91 90366 66601 / 02  |  info@bestserve.in  |  www.bestserve.in",
  cin: "U24100KA2012PTC064496",
  regdOffice: "#372/2, Lokesh Building, Begur, Bangalore - 560068",
  email: "info@bestserve.in",
};
const SIGNATORY = { name: "Prashanth Shetty", title: "Authorised Signatory", phone: "+91 96204 27000" };
const LOGO = path.join(__dirname, "../../assets/quotation-logo.png"); // transparent background

class QuotationInputError extends Error {}

// ---- input -----------------------------------------------------------------

function text(value, label, max, { required = false, min = 1 } = {}) {
  const s = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
  if (!s) {
    if (required) throw new QuotationInputError(`Enter the ${label}`);
    return "";
  }
  if (s.length < min) throw new QuotationInputError(`The ${label} is too short`);
  if (s.length > max) throw new QuotationInputError(`The ${label} is too long (max ${max} characters)`);
  return s;
}
function int(value, label, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new QuotationInputError(`${label} must be between ${min} and ${max}`);
  return n;
}
function amount(value, label) {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(n) || n < 0 || n > 99999999) {
    throw new QuotationInputError(`Enter a valid ${label}`);
  }
  return Math.round(n * 100) / 100;
}
// ONE_TIME: a single charge. MONTHLY: per month. YEARLY: AMC, one amount per year.
const BILLINGS = ["ONE_TIME", "MONTHLY", "YEARLY"];
function billing(value) {
  if (!BILLINGS.includes(value)) throw new QuotationInputError("Billing must be ONE_TIME, MONTHLY or YEARLY");
  return value;
}
// What kind of contract the quotation is for - asked when it is saved, shown on the lead (not on the PDF).
const CONTRACT_TYPES = ["ONE_TIME", "AMC"];
function contractType(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!CONTRACT_TYPES.includes(value)) throw new QuotationInputError("Choose One-time or AMC");
  return value;
}
function clauseList(list, label) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 25) throw new QuotationInputError(`Too many ${label}`);
  return list.map((c) => text(c, `${label} line`, 500, { min: 3 })).filter(Boolean);
}

/**
 * The salesperson's own price table (optional - some clients want the price laid out their way):
 * rows of cells, the first row the headings, the last row the total - a label in the first cell and
 * the amount in the last, which becomes the package price. -> { header, body, totalLabel, total } or null.
 */
function priceTable(t) {
  if (t === undefined || t === null || t === false) return null;
  const rows = Array.isArray(t?.rows) ? t.rows : null;
  if (!rows || rows.length < 2 || rows.length > 20) throw new QuotationInputError("The price table needs 2 to 20 rows");
  const cols = Array.isArray(rows[0]) ? rows[0].length : 0;
  if (cols < 2 || cols > 6) throw new QuotationInputError("The price table needs 2 to 6 columns");
  const clean = rows.map((r, i) => {
    if (!Array.isArray(r) || r.length !== cols) throw new QuotationInputError(`Price table row ${i + 1} has the wrong number of cells`);
    return r.map((c) => text(c, `price table cell (row ${i + 1})`, 120));
  });
  if (!clean[0].some(Boolean)) throw new QuotationInputError("Fill in the headings (first row) of the price table");
  const last = clean[clean.length - 1];
  // The total adds up the Amount column (the last one); amounts print with thousands separators.
  const toNumber = (v) => {
    const raw = String(v || "").replace(/[₹,\s]/g, "");
    return raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
  };
  const body = clean.slice(1, -1).map((r) => {
    const n = toNumber(r[cols - 1]);
    return n === null ? r : [...r.slice(0, -1), inr0.format(n)];
  });
  const sum = clean.slice(1, -1).reduce((t, r) => t + (toNumber(r[cols - 1]) || 0), 0);
  // A table saved before the total added itself up: its typed total.
  const total = Math.round((sum > 0 ? sum : toNumber(last[cols - 1]) || 0) * 100) / 100;
  if (total <= 0) throw new QuotationInputError("Enter the amounts in the last column of the price table");
  if (total > 99999999) throw new QuotationInputError("The price table total is too large");
  // The heading printed above the table (older tables have none: the default).
  const title = text(t.title, "price table heading", 80) || "Price details";
  return { title, header: clean[0], body, totalLabel: last[0] || "Total", total };
}

/**
 * Checks and tidies the builder's request body. Throws QuotationInputError
 * (a 400) with a readable message. Returns the content plus its totals:
 * { ..., totals: { monthly, yearly, oneTime, primary, primaryBilling, discount, final } }.
 * `primary` is the main total before the discount; `final` = primary - discount.
 */
function normalizeQuotationContent(body) {
  const b = body || {};
  const c = b.customer || {};
  const customer = {
    name: text(c.name, "customer name", 150, { required: true, min: 2 }),
    address: text(c.address, "customer address", 400),
    attention: text(c.attention, "contact person", 100),
    phone: text(c.phone, "customer phone", 30),
  };
  const subject = text(b.subject, "subject", 300, { required: true, min: 5 });

  if (!Array.isArray(b.services) || b.services.length === 0) throw new QuotationInputError("Pick at least one service");
  if (b.services.length > 20) throw new QuotationInputError("A quotation can have at most 20 services");

  // A price table sets one package price: its total.
  const table = priceTable(b.priceTable);
  const mode = table || b.pricing?.mode === "PACKAGE" ? "PACKAGE" : "PER_SERVICE";
  const services = b.services.map((s, i) => {
    const where = `Service ${i + 1}: `;
    try {
      const rows = Array.isArray(s?.rows) ? s.rows : [];
      if (rows.length === 0) throw new QuotationInputError("add at least one treatment row");
      if (rows.length > 30) throw new QuotationInputError("at most 30 treatment rows");
      return {
        name: text(s?.name, "service name", 80, { required: true, min: 2 }),
        plan: text(s?.plan, "plan", 60),
        billing: billing(s?.billing || "MONTHLY"),
        price: mode === "PER_SERVICE" ? amount(s?.price, "price") : null,
        rows: rows.map((r, j) => {
          try {
            return {
              defense_area: text(r?.defense_area, "defense area", 120, { required: true }),
              material_used: text(r?.material_used, "material used", 160, { required: true }),
              treatment_area: text(r?.treatment_area, "location / treatment area", 255, { required: true }),
              frequency: text(r?.frequency, "frequency", 60, { required: true }),
            };
          } catch (err) {
            throw new QuotationInputError(`row ${j + 1} - ${err.message.toLowerCase()}`);
          }
        }),
      };
    } catch (err) {
      throw new QuotationInputError(where + err.message);
    }
  });

  let pricing;
  let totals;
  if (mode === "PACKAGE") {
    const p = b.pricing || {};
    const pkgAmount = table ? table.total : amount(p.amount, "package amount");
    if (pkgAmount <= 0) throw new QuotationInputError("Enter the package amount");
    pricing = {
      mode,
      amount: pkgAmount,
      billing: billing(p.billing || "MONTHLY"),
      description: text(p.description, "package description", 200) || `Pest management services ${services.length > 1 ? `1 to ${services.length}` : "1"} as per scope above`,
      planLabel: text(p.planLabel, "package plan", 80),
    };
    totals = {
      monthly: pricing.billing === "MONTHLY" ? pkgAmount : 0,
      yearly: pricing.billing === "YEARLY" ? pkgAmount : 0,
      oneTime: pricing.billing === "ONE_TIME" ? pkgAmount : 0,
    };
  } else {
    pricing = { mode };
    const sum = (b) => services.filter((s) => s.billing === b).reduce((total, s) => total + s.price, 0);
    totals = { monthly: sum("MONTHLY"), yearly: sum("YEARLY"), oneTime: sum("ONE_TIME") };
  }
  totals.monthly = Math.round(totals.monthly * 100) / 100;
  totals.yearly = Math.round(totals.yearly * 100) / 100;
  totals.oneTime = Math.round(totals.oneTime * 100) / 100;
  // The figure saved as the quotation's total_amount (and offered as the deal amount at
  // conversion): the recurring charge if there is one (monthly first, then the AMC), else one-time.
  totals.primaryBilling = totals.monthly > 0 ? "MONTHLY" : totals.yearly > 0 ? "YEARLY" : "ONE_TIME";
  totals.primary = { MONTHLY: totals.monthly, YEARLY: totals.yearly, ONE_TIME: totals.oneTime }[totals.primaryBilling];
  if (totals.primary <= 0) throw new QuotationInputError("The quotation total must be more than zero");

  // Special discount (a rupee amount typed by the salesperson) comes off the main total above.
  // `final` is what the customer pays and what is saved as the quotation's total.
  const discount = b.discount === undefined || b.discount === null || b.discount === "" ? 0 : amount(b.discount, "discount");
  if (discount >= totals.primary) throw new QuotationInputError("The discount must be less than the total");
  totals.discount = discount;
  totals.final = Math.round((totals.primary - discount) * 100) / 100;

  return {
    customer,
    subject,
    revised: Boolean(b.revised),
    validDays: int(b.validDays, "Valid for (days)", 1, 180, 30),
    contractMonths: int(b.contractMonths, "Contract period (months)", 1, 60, 12),
    services,
    pricing,
    priceTable: table,
    // The price is for one outlet (a client with several branches pays it for each).
    perOutlet: Boolean(b.perOutlet),
    contractType: contractType(b.contractType),
    valueAdded: clauseList(b.valueAdded, "value added services"),
    terms: clauseList(b.terms, "terms and conditions"),
    totals,
  };
}

// ---- formatting --------------------------------------------------------------

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => inr.format(Number(n) || 0);
const longDate = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}
/** 158000 -> "One Lakh Fifty Eight Thousand"; Indian grouping (crore, lakh, thousand). */
function rupeesInWords(value) {
  let n = Math.floor(Number(value) || 0);
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}
function amountInWords(value) {
  const paise = Math.round((Number(value) - Math.floor(Number(value))) * 100);
  return `Rupees ${rupeesInWords(value)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

// ---- drawing -----------------------------------------------------------------
//
// "Service proposal" layout, three parts:
//   1. Cover letter - dark header band with the logo, a QUOTATION tag, Prepared for, the
//      quotation's particulars, a large title and a short signed letter.
//   2. Scope & charges - one card per service (treatment rows + its price), then a dark total card.
//   3. Closing - value added / terms cards, our commitment, next steps, acceptance, and a contact
//      band at the foot of the last page.
// Set in Plus Jakarta Sans (assets/fonts, SIL Open Font License), which also prints the rupee sign.

const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const FONTS = {
  R: "PlusJakartaSans-Regular.ttf",
  SB: "PlusJakartaSans-SemiBold.ttf",
  B: "PlusJakartaSans-Bold.ttf",
  XB: "PlusJakartaSans-ExtraBold.ttf",
};

const C = {
  navy: "#0f2340", ink: "#14213d", body: "#3b4252", muted: "#6b7280", line: "#e6e9ef",
  card: "#f6f7f9", red: "#c8102e", blue: "#0a7fd6", sky: "#8cc8f5", onNavy: "#c9d3e3", pillSoft: "#e8eef7",
};
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const L = 48;
const R = PAGE_W - 48;
const W = R - L;
const BOTTOM = PAGE_H - 54; // content stops here on ordinary pages
const BAND_H = 92; // contact band at the foot of the last page

const PER = { MONTHLY: " / month", YEARLY: " / year", ONE_TIME: "" };
const PER_WORD = { MONTHLY: "per month", YEARLY: "per year", ONE_TIME: "one-time" };
const BILLING_LABEL = { MONTHLY: "Monthly", YEARLY: "AMC (Yearly)", ONE_TIME: "One-time" };
const ROW_COLS = [
  { key: "defense_area", label: "Defence Area", f: 0.24 },
  { key: "material_used", label: "Method", f: 0.27 },
  { key: "treatment_area", label: "Treated Area", f: 0.31 },
  { key: "frequency", label: "Frequency", f: 0.18 },
];

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rupees = (n) => `₹${inr0.format(Number(n) || 0)}`;
const pad2 = (n) => String(n).padStart(2, "0");
const joinNames = (names) => (names.length <= 1 ? names[0] || "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Draws the quotation. `meta`: { number, date (Date), leadNumber, draft, preparedBy: { name, designation, phone } }.
 * A draft (preview) looks the same as the saved quotation, only without a quotation number.
 * Resolves with the PDF as a Buffer.
 */
function renderQuotationPdf(content, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: { Title: `${meta.draft ? "Quotation" : `Quotation ${meta.number}`} - ${content.customer.name}`, Author: COMPANY.name, Subject: content.subject },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));
      draw(doc, content, meta);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc, q, meta) {
  const validUntil = new Date(meta.date.getTime() + q.validDays * 86400000);
  // Who made the quotation (signs the letter and the acceptance); falls back to the company signatory.
  const by = meta.preparedBy?.name ? meta.preparedBy : { name: SIGNATORY.name, designation: SIGNATORY.title, phone: SIGNATORY.phone };
  const docLabel = meta.draft ? "Quotation" : `Quotation ${meta.number}`;
  let y = 0;

  const font = (name, size, color = C.body) => doc.font(name).fontSize(size).fillColor(color);
  const hLine = (yy, color = C.line, width = 0.7, x1 = L, x2 = R) => doc.moveTo(x1, yy).lineTo(x2, yy).lineWidth(width).strokeColor(color).stroke();
  const eyebrow = (text, x, yy, color = C.red) => font("B", 7.6, color).text(text.toUpperCase(), x, yy, { characterSpacing: 1.6, lineBreak: false });
  const accentBar = (yy, h) => {
    doc.rect(0, yy, PAGE_W * 0.72, h).fill(C.red);
    doc.rect(PAGE_W * 0.72, yy, PAGE_W * 0.28, h).fill(C.blue);
  };

  // ---------------- page furniture
  function slimHeader() {
    doc.rect(0, 0, PAGE_W, 44).fill(C.navy);
    accentBar(44, 3);
    font("B", 10, "#ffffff").text(COMPANY.name, L, 16, { lineBreak: false });
    const tag = `QUOTATION  ·  ${q.customer.name.toUpperCase()}`.slice(0, 60);
    font("B", 7.4, C.sky).text(tag, R - 300, 18, { width: 300, align: "right", characterSpacing: 1.3, lineBreak: false });
    return 47;
  }
  function newPage() {
    doc.addPage();
    y = slimHeader() + 30;
  }
  function ensure(h) {
    if (y + h > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  }
  function paragraph(str, { fontName = "R", size = 10, color = C.body, width = W, x = L, after = 8, gap = 3 } = {}) {
    font(fontName, size, color);
    const h = doc.heightOfString(str, { width, lineGap: gap });
    ensure(h + 2);
    doc.text(str, x, y, { width, lineGap: gap });
    y += h + after;
  }
  // Text with some phrases in bold (the company's name in the terms, the customer's name in "our commitment").
  function richText(str, boldPatterns, x, yy, { size, color = C.body, width, gap = 2 }) {
    const re = new RegExp(`(${boldPatterns.join("|")})`, "gi");
    const parts = str.split(re).filter((p) => p !== "" && p !== undefined);
    parts.forEach((p, idx) => {
      const bold = new RegExp(`^(${boldPatterns.join("|")})$`, "i").test(p);
      font(bold ? "B" : "R", size, bold ? C.ink : color);
      const opts = { width, lineGap: gap, continued: idx < parts.length - 1 };
      if (idx === 0) doc.text(p, x, yy, opts);
      else doc.text(p, opts);
    });
  }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const COMPANY_RE = "Bestserve Pest Management Pvt\\.? Ltd\\.?";
  function check(x, yy, color = C.blue) {
    doc.moveTo(x, yy + 4).lineTo(x + 3, yy + 7).lineTo(x + 8.5, yy + 0.5).lineWidth(1.5).strokeColor(color).stroke();
  }

  // ================= 1. cover letter =================
  doc.rect(0, 0, PAGE_W, 112).fill(C.navy);
  accentBar(112, 4);
  const logoH = 44;
  const logoW = logoH * (800 / 314);
  doc.roundedRect(L, 28, logoW + 26, logoH + 16, 12).fill("#ffffff");
  doc.image(LOGO, L + 13, 36, { height: logoH });
  font("B", 11, "#ffffff").text(COMPANY.name, R - 320, 28, { width: 320, align: "right" });
  font("R", 7.8, C.onNavy);
  doc.text(`CIN: ${COMPANY.cin}`, R - 320, 45, { width: 320, align: "right" });
  doc.text(COMPANY.addressLines[0], R - 320, 57, { width: 320, align: "right" });
  doc.text(COMPANY.addressLines[1], R - 320, 68, { width: 320, align: "right" });
  doc.text(COMPANY.contact.replace(/\s*\|\s*/g, "  ·  "), R - 320, 81, { width: 320, align: "right" });

  // tag + date (a preview looks exactly like the saved quotation - no "draft" marking)
  y = 146;
  const tagText = q.revised ? "REVISED QUOTATION" : "QUOTATION";
  font("B", 8, "#ffffff");
  const tagW = doc.widthOfString(tagText, { characterSpacing: 1.8 }) + 30;
  doc.roundedRect(L, y, tagW, 22, 11).fill(C.red);
  font("B", 8, "#ffffff").text(tagText, L, y + 7, { width: tagW, align: "center", characterSpacing: 1.8, lineBreak: false });
  font("B", 10, C.ink).text(longDate(meta.date), R - 200, y + 5, { width: 200, align: "right", lineBreak: false });

  // particulars, in a light card under the tag (a preview has no quotation number yet, so it is left out)
  y += 36;
  const particulars = [
    ...(meta.draft ? [] : [["Quotation No", meta.number]]),
    ["Valid Until", longDate(validUntil)],
    ["Contract Period", `${q.contractMonths} Month${q.contractMonths > 1 ? "s" : ""}`],
    ...(meta.leadNumber ? [["Reference", meta.leadNumber]] : []),
  ];
  doc.roundedRect(L, y, W, 48, 10).fillAndStroke(C.card, C.line);
  const pw = (W - 36) / particulars.length;
  particulars.forEach(([k, v], i) => {
    const px = L + 18 + i * pw;
    if (i > 0) doc.moveTo(px - 12, y + 11).lineTo(px - 12, y + 37).lineWidth(0.7).strokeColor(C.line).stroke();
    font("B", 6.8, C.muted).text(k.toUpperCase(), px, y + 12, { characterSpacing: 1.1, lineBreak: false });
    font("B", 9.6, C.ink).text(v, px, y + 25, { width: pw - 16, lineBreak: false });
  });
  y += 48 + 26;

  // prepared for
  eyebrow("Prepared for", L, y, C.muted);
  y += 13;
  font("XB", 17, C.ink).text(q.customer.name, L, y, { width: W });
  y += doc.heightOfString(q.customer.name, { width: W }) + 3;
  const forLines = [q.customer.address, q.customer.phone].filter(Boolean); // address and phone, each on its own line
  for (const line of forLines) {
    font("R", 9.6, C.muted).text(line, L, y, { width: W * 0.75 });
    y += doc.heightOfString(line, { width: W * 0.75 }) + 1;
  }
  y += 16;
  hLine(y);

  // title + subject
  y += 26;
  const title = `Proposal for ${joinNames(q.services.map((s) => s.name))}`;
  font("XB", 19, C.ink).text(title, L, y, { width: W * 0.86, lineGap: 1 });
  y += doc.heightOfString(title, { width: W * 0.86, lineGap: 1 }) + 6;
  font("SB", 10.5, C.red).text(q.subject, L, y, { width: W * 0.9, lineGap: 2 });
  y += doc.heightOfString(q.subject, { width: W * 0.9, lineGap: 2 }) + 20;

  // letter
  paragraph("Dear Sir / Madam,", { after: 10 });
  paragraph("Thank you for your interest in our pest control services.", { after: 10 });
  paragraph("We would be glad to serve your premises with an eco-friendly approach to pest control, creating a healthy environment for your staff and customers.", { after: 10 });
  paragraph("Please find our proposal, recommendations and treatment method on the following pages for your consideration. Feel free to contact us for any further information.", { after: 10 });
  paragraph("We look forward to your favourable reply and to working together towards a pest-free environment.", { after: 18 });
  paragraph("Yours faithfully,", { after: 34 });
  // signed by whoever made the quotation: name, designation, phone
  hLine(y, "#9aa1ad", 0.8, L, L + 170);
  y += 9;
  font("XB", 12, C.ink).text(by.name, L, y, { lineBreak: false });
  y += 17;
  if (by.designation) {
    font("R", 9.4, C.muted).text(by.designation, L, y, { lineBreak: false });
    y += 13;
  }
  if (by.phone) font("R", 9.4, C.muted).text(by.phone, L, y, { lineBreak: false });

  // ================= 2. scope & charges =================
  newPage();
  eyebrow("Scope of work & charges", L, y);
  y += 15;
  const heading = q.services.length === 1 ? q.services[0].name : `${q.services.length} services for your premises`;
  font("XB", 20, C.ink).text(heading, L, y, { width: W });
  y += doc.heightOfString(heading, { width: W }) + 5;
  paragraph(`Recommended treatment plan and charges for ${q.customer.name}.`, { size: 10, color: C.muted, after: 18 });

  const inner = W - 32;
  const colX = [];
  ROW_COLS.reduce((x, c) => (colX.push(x), x + c.f * inner), L + 16);
  const rowH = (r) => {
    font("SB", 9);
    return Math.max(...ROW_COLS.map((c) => doc.heightOfString(r[c.key], { width: c.f * inner - 14, lineGap: 1 }))) + 14;
  };
  const HEAD_H = 60; // badge, service name, price, divider
  const LABELS_H = 22; // the table's heading row

  q.services.forEach((s, si) => {
    const heights = s.rows.map(rowH);
    const whole = HEAD_H + LABELS_H + heights.reduce((a, b) => a + b, 0) + 14;
    // Keep a card together when it fits on a page; a very long one runs on with its column labels repeated.
    if (whole <= BOTTOM - 120 && y + whole > BOTTOM) newPage();

    let i = 0;
    let first = true;
    while (i < s.rows.length) {
      const top = y;
      const headH = first ? HEAD_H : 12;
      let used = 0;
      let j = i;
      while (j < s.rows.length && y + headH + LABELS_H + used + heights[j] + 14 <= BOTTOM) used += heights[j++];
      if (j === i) {
        if (y > 120) {
          newPage();
          continue;
        }
        used += heights[j++]; // a single row taller than the page: draw it anyway
      }
      const segH = headH + LABELS_H + used + 14;
      doc.roundedRect(L, top, W, segH, 12).fillAndStroke(C.card, C.line);

      if (first) {
        // number badge and service name, side by side and centred on each other
        doc.roundedRect(L + 16, top + 15, 30, 30, 8).fill(C.navy);
        font("XB", 10.5, C.sky).text(pad2(si + 1), L + 16, top + 25, { width: 30, align: "center", lineBreak: false });
        font("XB", 14, C.ink).text(s.name, L + 58, top + 22, { width: W - 250, lineBreak: false });

        // price pill (or "included" when one package price covers everything)
        const pillText = q.pricing.mode === "PACKAGE" ? "Included in package" : `${rupees(s.price)} + GST${PER[s.billing]}`;
        const dark = q.pricing.mode !== "PACKAGE";
        font("B", 9.6);
        const pillW = doc.widthOfString(pillText) + 28;
        doc.roundedRect(R - 16 - pillW, top + 17.5, pillW, 25, 12.5).fill(dark ? C.navy : C.pillSoft);
        font("B", 9.6, dark ? "#ffffff" : C.navy).text(pillText, R - 16 - pillW, top + 25, { width: pillW, align: "center", lineBreak: false });
      }

      // the treatment rows as a ruled table: white box, grey heading row, column and row lines
      const tx1 = L + 10;
      const tx2 = R - 10;
      const tTop = top + headH;
      const tBottom = tTop + LABELS_H + used;
      const rule = "#d5dbe5";
      doc.roundedRect(tx1, tTop, tx2 - tx1, tBottom - tTop, 6).fill("#ffffff");
      doc.save();
      doc.roundedRect(tx1, tTop, tx2 - tx1, tBottom - tTop, 6).clip();
      doc.rect(tx1, tTop, tx2 - tx1, LABELS_H).fill("#e4e9f1");
      doc.restore();
      ROW_COLS.forEach((c, ci) => font("B", 7.6, C.ink).text(c.label.toUpperCase(), colX[ci], tTop + 8, { characterSpacing: 0.9, lineBreak: false }));
      let ry = tTop + LABELS_H;
      for (let k = i; k < j; k++) {
        hLine(ry, rule, 0.7, tx1, tx2);
        ROW_COLS.forEach((c, ci) => font("SB", 9, C.ink).text(s.rows[k][c.key], colX[ci], ry + 7, { width: c.f * inner - 14, lineGap: 1 }));
        ry += heights[k];
      }
      for (let ci = 1; ci < ROW_COLS.length; ci++) {
        doc.moveTo(colX[ci] - 7, tTop).lineTo(colX[ci] - 7, tBottom).lineWidth(0.7).strokeColor(rule).stroke();
      }
      doc.roundedRect(tx1, tTop, tx2 - tx1, tBottom - tTop, 6).lineWidth(0.8).strokeColor(rule).stroke();

      y = top + segH + 12;
      i = j;
      first = false;
      if (i < s.rows.length) newPage();
    }
  });

  // the salesperson's own price table, as a card like the service cards above it: a numbered navy badge with
  // the table's heading and its total on a pill, then the table - white box, grey heading row, ruled
  // lines, the total row tinted at the bottom, the amount column on the right. Empty rows are left
  // out. A long table runs on to the next page with its heading row again.
  if (q.priceTable) {
    const t = q.priceTable;
    const cols = t.header.length;
    const HEAD_H = 60; // the card's heading band (badge, title, pill)
    const tx1 = L + 10;
    const tx2 = R - 10;
    const TW = tx2 - tx1;
    const weights = t.header.map((_, k) => (k === 0 && cols > 2 ? 1.6 : 1));
    const wsum = weights.reduce((a, w) => a + w, 0);
    const cw = weights.map((w) => (w / wsum) * TW);
    const cx = [];
    cw.reduce((x, w) => (cx.push(x), x + w), tx1);
    const body = t.body.filter((cells) => cells.some((c) => String(c || "").trim()));
    const rows = [
      { kind: "head", cells: t.header.map((h) => String(h || "").toUpperCase()) },
      ...body.map((cells) => ({ kind: "body", cells })),
      { kind: "total", cells: [t.totalLabel, ...Array(cols - 2).fill(""), rupees(t.total)] },
    ];
    const style = {
      head: { name: "B", size: 7.6, spacing: 0.9 },
      body: { name: "SB", size: 9.4, spacing: 0 },
      total: { name: "XB", size: 10.5, spacing: 0 },
    };
    const heightOf = (r) => {
      const st = style[r.kind];
      font(st.name, st.size);
      const h = Math.max(...r.cells.map((v, k) => doc.heightOfString(v || " ", { width: cw[k] - 18, lineGap: 1, characterSpacing: st.spacing })));
      return h + (r.kind === "head" ? 16 : 18);
    };
    const heights = rows.map(heightOf);
    const whole = heights.reduce((a, h) => a + h, 0);
    // Keep the heading band with at least the first rows; move the whole card on when it fits a page.
    if (y + HEAD_H + heights[0] + (heights[1] || 0) + 20 > BOTTOM) newPage();
    else if (HEAD_H + whole + 14 <= BOTTOM - 140 && y + HEAD_H + whole + 14 > BOTTOM) newPage();

    const rule = "#d5dbe5";
    let i = 0;
    let first = true;
    while (i < rows.length) {
      const headH = first ? HEAD_H : 14;
      // the rows that fit on this page; after a page break the heading row comes again
      const seg = i === 0 ? [] : [0];
      let used = i === 0 ? 0 : heights[0];
      let j = i;
      while (j < rows.length && y + headH + used + heights[j] + 14 <= BOTTOM) used += heights[j], seg.push(j++);
      if (j === i) {
        newPage();
        continue;
      }
      const top = y;
      const segH = headH + used + 14;
      doc.roundedRect(L, top, W, segH, 12).fillAndStroke(C.card, C.line);

      if (first) {
        // numbered on from the service cards (01, 02 ... then the table), whatever its heading says;
        // the total on a navy pill
        doc.roundedRect(L + 16, top + 15, 30, 30, 8).fill(C.navy);
        font("XB", 10.5, C.sky).text(pad2(q.services.length + 1), L + 16, top + 25, { width: 30, align: "center", lineBreak: false });
        font("XB", 14, C.ink).text(t.title || "Price details", L + 58, top + 22, { width: W - 250, lineBreak: false });
        const pillText = `Total ${rupees(t.total)}`;
        font("B", 9.6);
        const pillW = doc.widthOfString(pillText) + 28;
        doc.roundedRect(R - 16 - pillW, top + 17.5, pillW, 25, 12.5).fill(C.navy);
        font("B", 9.6, "#ffffff").text(pillText, R - 16 - pillW, top + 25, { width: pillW, align: "center", lineBreak: false });
      }

      const tTop = top + headH;
      const tBottom = tTop + used;
      doc.roundedRect(tx1, tTop, TW, used, 6).fill("#ffffff");
      doc.save();
      doc.roundedRect(tx1, tTop, TW, used, 6).clip();
      let ry = tTop;
      seg.forEach((k) => {
        const r = rows[k];
        if (r.kind === "head") doc.rect(tx1, ry, TW, heights[k]).fill("#e4e9f1");
        if (r.kind === "total") doc.rect(tx1, ry, TW, heights[k]).fill(C.pillSoft);
        ry += heights[k];
      });
      doc.restore();
      ry = tTop;
      seg.forEach((k, n) => {
        const r = rows[k];
        const st = style[r.kind];
        if (n > 0) hLine(ry, rule, 0.7, tx1, tx2);
        r.cells.forEach((v, c) => {
          const last = c === cols - 1;
          const color = r.kind === "total" && last ? C.navy : C.ink;
          font(st.name, st.size, color).text(v || "", cx[c] + 9, ry + (r.kind === "head" ? 8 : 9), {
            width: cw[c] - 18,
            align: last && cols > 1 ? "right" : "left",
            lineGap: 1,
            characterSpacing: st.spacing,
          });
        });
        ry += heights[k];
      });
      for (let c = 1; c < cols; c++) doc.moveTo(cx[c], tTop).lineTo(cx[c], tBottom).lineWidth(0.7).strokeColor(rule).stroke();
      doc.roundedRect(tx1, tTop, TW, used, 6).lineWidth(0.8).strokeColor(rule).stroke();

      y = top + segH + 12;
      i = j;
      first = false;
      if (i < rows.length) newPage();
    }
  }

  // package line (one price for everything) - a price table already says it
  if (q.pricing.mode === "PACKAGE" && !q.priceTable) {
    const text = `${q.pricing.description}${q.pricing.planLabel ? `  ·  ${q.pricing.planLabel}` : ""}`;
    paragraph(text, { fontName: "SB", size: 9.4, color: C.body, after: 10 });
  }

  // combined total
  const { monthly, yearly, oneTime } = q.totals;
  const main = q.totals.primaryBilling;
  const others = [
    ...(monthly > 0 && main !== "MONTHLY" ? [`Monthly: ${rupees(monthly)} + GST`] : []),
    ...(yearly > 0 && main !== "YEARLY" ? [`AMC: ${rupees(yearly)} + GST / year`] : []),
    ...(oneTime > 0 && main !== "ONE_TIME" ? [`One-time: ${rupees(oneTime)} + GST`] : []),
  ];
  const totalLabel = { MONTHLY: "Combined monthly charges", YEARLY: "Combined yearly charges (AMC)", ONE_TIME: "Total charges" }[main];
  const countText = q.pricing.mode === "PACKAGE" ? "One package price for all services" : `${q.services.length} service${q.services.length > 1 ? "s" : ""}`;
  const discount = q.totals.discount || 0;
  const final = q.totals.final ?? q.totals.primary;
  const perWord = `${PER_WORD[main]}${q.perOutlet ? " + per outlet" : ""}`;
  if (discount > 0) {
    // With a discount the eye should land on it: subtotal small and struck through, the discount on
    // a green bar, then the final amount large.
    const cardH = 138 + (others.length ? 12 : 0);
    ensure(cardH + 34);
    y += 4;
    doc.roundedRect(L, y, W, cardH, 14).fill(C.navy);
    eyebrow(totalLabel, L + 22, y + 24, C.sky);
    font("R", 9.4, C.onNavy).text(countText, L + 22, y + 39, { lineBreak: false });
    if (others.length) font("SB", 8.6, "#ffffff").text(others.join("   ·   "), L + 22, y + 56, { width: W * 0.45, lineBreak: false });

    const rx = R - 22 - 262; // the breakdown column on the right
    const rw = 262;
    // subtotal, struck through
    const subText = `${rupees(q.totals.primary)} + GST`;
    font("R", 9.2, C.onNavy).text("Subtotal", rx, y + 22, { lineBreak: false });
    font("SB", 10, C.onNavy).text(subText, rx, y + 21, { width: rw, align: "right", lineBreak: false });
    const subW = doc.widthOfString(subText);
    doc.moveTo(rx + rw - subW, y + 27.5).lineTo(rx + rw, y + 27.5).lineWidth(0.9).strokeColor(C.onNavy).stroke();
    // the discount, on a green bar
    doc.roundedRect(rx - 10, y + 40, rw + 10, 28, 8).fill("#16a34a");
    font("B", 8, "#ffffff").text("SPECIAL DISCOUNT", rx, y + 50, { characterSpacing: 1.2, lineBreak: false });
    font("XB", 13, "#ffffff").text(`- ${rupees(discount)}`, rx, y + 47, { width: rw - 10, align: "right", lineBreak: false });
    // the final amount
    doc.moveTo(rx, y + 80).lineTo(rx + rw, y + 80).lineWidth(0.7).strokeColor("#2a3d5e").stroke();
    font("B", 8, C.sky).text("FINAL AMOUNT", rx, y + 96, { characterSpacing: 1.2, lineBreak: false });
    font("XB", 24, "#ffffff").text(`${rupees(final)} + GST`, rx, y + 88, { width: rw, align: "right", lineBreak: false });
    font("R", 8.6, C.onNavy).text(perWord, rx, y + 120, { width: rw, align: "right", lineBreak: false });
    y += cardH + 12;
  } else {
    const cardH = 80 + (others.length ? 12 : 0);
    ensure(cardH + 34);
    y += 4;
    doc.roundedRect(L, y, W, cardH, 14).fill(C.navy);
    eyebrow(totalLabel, L + 22, y + 22, C.sky);
    font("R", 9.4, C.onNavy).text(countText, L + 22, y + 37, { lineBreak: false });
    if (others.length) font("SB", 8.6, "#ffffff").text(others.join("   ·   "), L + 22, y + 52, { width: W * 0.5, lineBreak: false });
    font("XB", 24, "#ffffff").text(`${rupees(final)} + GST`, R - 280, y + 18, { width: 258, align: "right", lineBreak: false });
    font("R", 8.6, C.onNavy).text(perWord, R - 280, y + 50, { width: 258, align: "right", lineBreak: false });
    y += cardH + 12;
  }
  const words = `${amountInWords(final)}${main === "MONTHLY" ? " per month" : main === "YEARLY" ? " per year" : ""}${q.perOutlet ? " + per outlet" : ""}.`;
  paragraph(`All charges are exclusive of GST.  ${words}`, { size: 8.4, color: C.muted, after: 6 });

  // ================= 3. closing =================
  // value added + terms, side by side when both are there
  const lists = [
    ...(q.valueAdded.length ? [["Value added services", q.valueAdded]] : []),
    ...(q.terms.length ? [["Terms & conditions", q.terms]] : []),
  ];
  if (lists.length) {
    const gap = 14;
    const colW = lists.length === 2 ? (W - gap) / 2 : W;
    const listH = (items) => {
      font("R", 9.2);
      return items.reduce((s, t) => s + doc.heightOfString(t, { width: colW - 52, lineGap: 2 }) + 7, 0);
    };
    const boxH = Math.max(...lists.map(([, items]) => listH(items))) + 52;
    y += 18;
    if (boxH < BOTTOM - 140) ensure(boxH);
    lists.forEach(([title, items], li) => {
      const x = L + li * (colW + gap);
      doc.roundedRect(x, y, colW, boxH, 12).fillAndStroke(C.card, C.line);
      eyebrow(title, x + 20, y + 20);
      let iy = y + 40;
      for (const t of items) {
        check(x + 20, iy + 2);
        font("R", 9.2);
        const h = doc.heightOfString(t, { width: colW - 52, lineGap: 2 });
        richText(t, [COMPANY_RE], x + 36, iy, { size: 9.2, width: colW - 52 });
        iy += h + 7;
      }
    });
    y += boxH;
  }

  // our commitment
  const commitment =
    `This quotation is customised for ${q.customer.name} and can be adjusted further to your requirements. ` +
    "We do not work from standard rates or packages: our in-house team of experts shapes each service around the client's needs.";
  font("R", 10);
  const commitmentH = doc.heightOfString(commitment, { width: W, lineGap: 3 });
  // "Our commitment" and "Acceptance" stay together, on the last page above the contact band.
  const closingH = 28 + 15 + 28 + commitmentH + 6 + 22 + 22 + 54 + 40;
  if (y + closingH > PAGE_H - BAND_H - 16) newPage();
  const atTop = y < 120;
  y += atTop ? 0 : 28;
  eyebrow("Our commitment", L, y);
  y += 15;
  font("XB", 17, C.ink).text("A plan built around your premises", L, y, { lineBreak: false });
  y += 28;
  richText(commitment, [escapeRe(q.customer.name)], L, y, { size: 10, width: W, gap: 3 });
  y += commitmentH + 6;

  // acceptance
  y += 22;
  hLine(y);
  y += 22;
  eyebrow("Acceptance", L, y);
  y += 54;
  const aw = (W - 40) / 2;
  [
    [`For ${COMPANY.name}`, [by.name, by.designation].filter(Boolean).join("  ·  ")],
    [`For ${q.customer.name}`, "Name, signature & date"],
  ].forEach(([who, sub], i) => {
    const x = L + i * (aw + 40);
    hLine(y, "#9aa1ad", 0.8, x, x + aw);
    font("B", 9.6, C.ink).text(who, x, y + 9, { width: aw, lineBreak: false });
    font("R", 8.8, C.muted).text(sub, x, y + 24, { width: aw, lineBreak: false });
  });
  y += 40;

  // the contact band needs the foot of the last page
  if (y > PAGE_H - BAND_H - 16) newPage();

  // ---------------- footers: a line on every page, the contact band on the last
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const pageNo = `${pad2(i + 1)} / ${pad2(total)}`;
    if (i < total - 1) {
      font("R", 7.6, C.muted).text(`Bestserve Pest Management  ·  ${docLabel} for ${q.customer.name}`, L, PAGE_H - 34, { width: W - 80, lineBreak: false });
      font("B", 8, C.red).text(pageNo, R - 80, PAGE_H - 34, { width: 80, align: "right", lineBreak: false });
      continue;
    }
    const bandY = PAGE_H - BAND_H;
    doc.rect(0, bandY, PAGE_W, BAND_H).fill(C.navy);
    [["Call", by.phone || "+91 90366 66601 / 02"], ["Email", COMPANY.email], ["Web", "www.bestserve.in"]].forEach(([k, v], ci) => {
      const x = L + ci * (W / 3);
      eyebrow(k, x, bandY + 20, C.sky);
      font("B", 10, "#ffffff").text(v, x, bandY + 33, { lineBreak: false });
    });
    hLine(bandY + 56, "#2a3d5e", 0.7, L, R);
    font("R", 7.8, C.onNavy).text(`Looking forward to a pest-free partnership.  ·  CIN: ${COMPANY.cin}`, L, bandY + 66, { width: W - 80, lineBreak: false });
    font("B", 8, C.sky).text(pageNo, R - 80, bandY + 66, { width: 80, align: "right", lineBreak: false });
  }
}

module.exports = { normalizeQuotationContent, renderQuotationPdf, QuotationInputError, amountInWords };
