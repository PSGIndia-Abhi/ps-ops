const path = require("path");
const PDFDocument = require("pdfkit");
const { amountInWords } = require("./crmQuotationDocument");

// ---------------------------------------------------------------------------
// Service agreements for converted commercial leads: checking what the web form
// sent (normalizeAgreementContent) and drawing BestServe's standard agreement
// (renderAgreementPdf) - parties, recitals, clauses 1-13, signatures, and
// Annexure-1 (the services table, from the quotation's treatment rows).
// The wording is the company's standard agreement; only the highlighted parts
// (names, dates, scope, charges) come from the form.
// ---------------------------------------------------------------------------

const COMPANY = {
  name: "Bestserve Pest Management Pvt. Ltd.",
  nameCaps: "BESTSERVE PEST MANAGEMENT PVT. LTD.",
  office: "#372/2, Lokesh Building, Hogebandi Garden, DLF New Town, Begur, Bengaluru - 560068",
  noticeLines: ["#372/2, Lokesh Building, Hogebandi Garden,", "DLF New Town, Begur,", "Bangalore 560068"],
  mobile: "9036666601/02",
  email: "service@bestserve.in",
};
const LOGO = path.join(__dirname, "../../assets/quotation-logo.png");

class AgreementInputError extends Error {}

// ---- input -----------------------------------------------------------------

function text(value, label, max, { required = false, min = 1 } = {}) {
  const s = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
  if (!s) {
    if (required) throw new AgreementInputError(`Enter the ${label}`);
    return "";
  }
  if (s.length < min) throw new AgreementInputError(`The ${label} is too short`);
  if (s.length > max) throw new AgreementInputError(`The ${label} is too long (max ${max} characters)`);
  return s;
}
function isoDate(value, label) {
  const s = typeof value === "string" ? value.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) throw new AgreementInputError(`Pick the ${label}`);
  return s;
}

/**
 * Checks and tidies the web form's body. Throws AgreementInputError (a 400) with a readable
 * message. Shape:
 * {
 *   customer: { name, shortName, industryWord, address, representative },
 *   signatory: { name, designation },          // who signs for BestServe
 *   customerSignatory: { name, designation, date },  // the customer's side (optional - blank = by hand)
 *   termStart, termEnd, signingDate,           // YYYY-MM-DD
 *   pestsCovered, frequencySummary, servicesPhrase,
 *   monthlyCharge, months, total,              // total: the yearly / term amount (default monthly x months)
 *   services: [{ name, rows: [{ defense_area, material_used, treatment_area, frequency }] }],
 *   quotationId                                // the quotation it was made from (optional)
 * }
 */
function normalizeAgreementContent(body) {
  const b = body || {};
  const c = b.customer || {};
  const customer = {
    name: text(c.name, "customer name", 150, { required: true, min: 2 }),
    shortName: text(c.shortName, "short name", 40, { required: true }),
    industryWord: text(c.industryWord, "industry word", 40, { required: true }),
    address: text(c.address, "customer address", 400, { required: true, min: 5 }),
    representative: text(c.representative, "customer representative", 120, { required: true }),
  };
  const s = b.signatory || {};
  const signatory = {
    name: text(s.name, "BestServe signatory", 80, { required: true }),
    designation: text(s.designation, "signatory designation", 80, { required: true }),
  };
  const cs = b.customerSignatory || {};
  const customerSignatory = {
    name: text(cs.name, "customer signatory name", 80),
    designation: text(cs.designation, "customer signatory designation", 80),
    date: cs.date ? isoDate(cs.date, "customer signing date") : "",
  };
  const termStart = isoDate(b.termStart, "term start date");
  const termEnd = isoDate(b.termEnd, "term end date");
  if (termEnd <= termStart) throw new AgreementInputError("The term must end after it starts");
  const signingDate = isoDate(b.signingDate, "signing date");

  const monthlyCharge = Number(b.monthlyCharge);
  if (!Number.isFinite(monthlyCharge) || monthlyCharge <= 0 || monthlyCharge > 99999999) {
    throw new AgreementInputError("Enter the monthly charge");
  }
  const months = Number(b.months);
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new AgreementInputError("Months must be between 1 and 60");

  if (!Array.isArray(b.services) || b.services.length === 0) throw new AgreementInputError("Add at least one service to Annexure-1");
  if (b.services.length > 20) throw new AgreementInputError("Annexure-1 can have at most 20 services");
  const services = b.services.map((sv, i) => {
    const where = `Annexure-1, service ${i + 1}: `;
    try {
      const rows = Array.isArray(sv?.rows) ? sv.rows : [];
      if (rows.length === 0) throw new AgreementInputError("add at least one row");
      if (rows.length > 30) throw new AgreementInputError("at most 30 rows");
      return {
        name: text(sv?.name, "service name", 80, { required: true, min: 2 }),
        rows: rows.map((r, j) => {
          try {
            return {
              defense_area: text(r?.defense_area, "defense area", 120, { required: true }),
              material_used: text(r?.material_used, "material used", 160, { required: true }),
              treatment_area: text(r?.treatment_area, "location / treatment area", 255, { required: true }),
              frequency: text(r?.frequency, "frequency", 80, { required: true }),
            };
          } catch (err) {
            throw new AgreementInputError(`row ${j + 1} - ${err.message.toLowerCase()}`);
          }
        }),
      };
    } catch (err) {
      throw new AgreementInputError(where + err.message);
    }
  });

  const charge = Math.round(monthlyCharge * 100) / 100;
  let total = Math.round(charge * months * 100) / 100;
  if (b.total !== undefined && b.total !== null && b.total !== "") {
    total = Number(b.total);
    if (!Number.isFinite(total) || total <= 0 || total > 9999999999) throw new AgreementInputError("Enter the yearly amount");
    total = Math.round(total * 100) / 100;
  }
  return {
    customer,
    signatory,
    customerSignatory,
    termStart,
    termEnd,
    signingDate,
    pestsCovered: text(b.pestsCovered, "pests covered", 300, { required: true }),
    frequencySummary: text(b.frequencySummary, "service frequency", 400, { required: true }),
    servicesPhrase: text(b.servicesPhrase, "services description", 200, { required: true }),
    monthlyCharge: charge,
    months,
    total,
    services,
    quotationId: typeof b.quotationId === "string" && b.quotationId.length <= 36 ? b.quotationId : null,
  };
}

// ---- formatting --------------------------------------------------------------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (iso) => iso.split("-").map(Number);
const ordinal = (n) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
/** "2026-10-01" -> "1st October 2026" */
const longDate = (iso) => {
  const [y, m, d] = parts(iso);
  return `${ordinal(d)} ${MONTH_NAMES[m - 1]} ${y}`;
};
/** "2026-10-01" -> "01/10/2026" */
const shortDate = (iso) => {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rs = (n) => `Rs. ${inr0.format(Number(n) || 0)}/-`;
const SMALL = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty"];
const numberWord = (n) => (n < 20 ? SMALL[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${SMALL[n % 10]}` : ""}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** 12 -> "One year", 24 -> "Two years", 6 -> "Six months" */
const periodWords = (months) =>
  months % 12 === 0 ? `${cap(numberWord(months / 12))} year${months === 12 ? "" : "s"}` : `${cap(numberWord(months))} month${months === 1 ? "" : "s"}`;

// ---- the wording -------------------------------------------------------------
//
// Blocks drawn in order. Text may mark bold with **...**. `S` = the customer's short name,
// `IND` = its industry word (in place of the old template's "Society").

function agreementBlocks(a, meta) {
  const S = a.customer.shortName;
  const IND = a.customer.industryWord;
  const start = longDate(a.termStart);
  const end = longDate(a.termEnd);
  const B = "Bestserve";
  return [
    { t: "para", text: "This Agreement is executed on the day and month as set forth in the signature portion of this Agreement below, by and between" },
    {
      t: "party",
      text:
        `**${COMPANY.nameCaps}**, a company incorporated under the Companies Act 1956, having its office at ${COMPANY.office}, ` +
        `represented herein by its ${a.signatory.designation}, ${a.signatory.name} (hereinafter referred to as the “**${B}**”, which ` +
        "expression shall unless repugnant to the meaning or context thereof be deemed to mean and include its successors in interest " +
        "and permitted assigns) of the **FIRST PART**.",
    },
    { t: "and" },
    {
      t: "party",
      text:
        `**${a.customer.name.toUpperCase()}**, located at ${a.customer.address}, and represented herein by ${a.customer.representative} ` +
        `(hereinafter referred to as the “**${S}**”, which expression shall unless repugnant to the meaning or context thereof be deemed ` +
        "to mean and include its successors in interest and permitted assigns) of the **OTHER PART**.",
    },
    { t: "para", text: `(The ${B} and ${S}, wherever the context so requires or permits, are hereinafter individually referred to as “**Party**” and jointly as “**Parties**”.)` },

    { t: "label", text: "WHEREAS:" },
    { t: "item", no: "A.", text: `The ${B} is in the business of providing General Pest Control and Rodent Control Service.` },
    { t: "item", no: "B.", text: `The ${B} has offered to provide “**Pest Management Services**” (as defined hereinafter) by representing to the ${S} that:` },
    { t: "item", no: "a.", level: 2, text: `The ${B} has the experience, expertise and necessary infrastructure to meet the requirement, in providing support and catering to any requests/requirements made by the ${B}.` },
    { t: "item", no: "b.", level: 2, text: `The ${B} will render the Pest Management Services during the term of this Agreement and any extended period thereof, without any interruption whatsoever to the ${B}.` },
    { t: "item", no: "c.", level: 2, text: `Relying on the representations of the ${B}, the ${IND} has agreed to accept the Pest Management Services offered by the ${B} on the terms and subject to the conditions specified hereunder for their above-mentioned office.` },

    { t: "label", text: "NOW THIS AGREEMENT WITNESSES AS FOLLOWS:" },
    { t: "heading", no: "1", title: "Definitions and Interpretation" },
    { t: "para", text: "Unless the context otherwise requires, when used in this Agreement:", indent: 1 },
    { t: "item", no: "1.1", text: "“**Agreement**” shall mean this agreement, including any subsequent written modifications and amendments thereto in terms hereof." },
    { t: "item", no: "1.2", text: "“**Confidential Information**” shall mean and include all information, data related to the Company during the term of this agreement." },
    { t: "item", no: "1.3", text: `“**Pest Management Services**” shall mean and include the maintenance services agreed to be rendered by the ${B} to the ${S} in terms hereof.` },
    { t: "item", no: "1.4", text: "“**Month**” shall mean the calendar month of the year." },
    { t: "item", no: "1.5", text: `“**Term**” shall mean the tenure of this Agreement commencing from **${start}** and ending on **${end}**.` },

    { t: "heading", no: "2", title: "Agreement" },
    {
      t: "para",
      indent: 1,
      text:
        `In consideration of the charges hereinafter reserved and agreed to be paid by the ${B} as set out in this Agreement and the Parties ` +
        `agreeing to comply with the covenants and conditions mentioned herein, the ${B} hereby agrees to provide Pest Management Services to ` +
        `the ${S}, for a period of ${periodWords(a.months)} commencing with effect from **${start}** and ending on **${end}**. Notwithstanding ` +
        "any provision to the contrary, the Parties shall not be entitled to terminate this Agreement during the Term except in accordance " +
        "with Clause 10 herein below.",
    },

    { t: "heading", no: "3", title: `Pest Management Services and Scope thereof for ${a.customer.name}` },
    { t: "item", no: "3.1", text: `The Pest Management Services will cover and provide **${a.pestsCovered}** and as detailed in **Annexure-1** of this Agreement. The cost for such services shall be borne by the ${B}.` },
    { t: "item", no: "3.2", text: `The ${B} shall ensure to provide **${a.frequencySummary}**.` },
    { t: "item", no: "3.3", text: `In case any additional service is requested by the ${S} to the ${B}, the same may be provided at an additional cost.` },

    { t: "heading", no: "4", title: "Charges" },
    {
      t: "item",
      no: "4.1",
      text:
        `In consideration of the ${B} providing Pest Management Services for the ${a.servicesPhrase}, the ${S} shall pay ` +
        `**${rs(a.monthlyCharge)} (${amountInWords(a.monthlyCharge)})** per month as charges (“**Charges**”) for a term of ` +
        `${numberWord(a.months)} months, **Total ${rs(a.total)} (${amountInWords(a.total)})**. All taxes are extra as applicable. ` +
        `A monthly report will be submitted by the ${B} along with the bill.`,
    },
    { t: "item", no: "4.2", text: "The payment of Charges would be subject to deduction of income tax and other taxes and cesses as may be required to be made under any other applicable law." },

    { t: "heading", no: "5", title: `Obligations of the ${B}` },
    { t: "item", no: "5.1", text: `The ${B} is ready to sign a Non-Disclosure Agreement with the ${IND} to ensure that the Confidentiality clause shall be strictly adhered to. For security reasons, the personnel duly authorised by the ${B} to render services at the premises of the ${S} are also ready to sign a Non-Disclosure Agreement.` },
    { t: "item", no: "5.2", text: `The ${B} shall ensure that the personnel deputed by the ${B} are well trained and will not cause unnecessary hindrance to the ${S} or its employees.` },

    { t: "heading", no: "6", title: `Obligations of the ${B}` },
    { t: "para", indent: 1, text: `The ${S} shall ensure that during the contracted period, they will not engage any other person or agency who is not authorised by the ${B} to attend to the Pest Management related tasks.` },

    { t: "heading", no: "7", title: "Confidentiality" },
    { t: "item", no: "7.1", text: `The ${B} undertakes and agrees that any information or data which the ${B} or its personnel may have access to during the term of this Agreement whilst providing services to the ${S} (“**Confidential Information**”), which has been furnished to the ${B} by the ${S}, will be kept confidential.` },
    { t: "item", no: "7.2", text: `The ${B} shall implement reasonable procedures to prohibit the disclosure, unauthorised duplication, misuse or non-disclosure of the Confidential Information to any third party.` },

    { t: "heading", no: "8", title: "Force Majeure" },
    {
      t: "para",
      indent: 1,
      text:
        "Neither Party shall be liable for any failure of performance hereunder due to causes beyond its reasonable control, including, but not " +
        "limited to, acts of God, fire, explosion, storms or other similar catastrophes; any law, order, regulation, direction, action of any " +
        "government, including state and local governments having jurisdiction over either of the Parties, or of any department, agency, " +
        "commission, court, bureau, corporation or other instrumentality of any one or more of said governments, or of any civil or military " +
        "authority; national emergencies; acts of terrorism, insurrections, riots, wars, or strikes, lockouts, work stoppages or other labour " +
        "disputes or difficulties.",
    },

    { t: "heading", no: "9", title: "Right to Audit" },
    {
      t: "para",
      indent: 1,
      text:
        `The ${IND} entering into this Agreement reserves the right to audit the services and verify the operating environment and other areas ` +
        `of service of the ${B}, the ${B}’s representatives and any other identified individuals in respect of the information held by them on ` +
        `the ${S} data, the ${S} client’s data, performance data, equipment provided etc., to ensure that the ${B} is maintaining adequate ` +
        `controls and security measures, that the ${B}’s billings to the Company are correct, and that reports relating to the Service ` +
        `Provider’s performance are accurate. If found guilty of misconduct, the ${IND} is authorised to take legal action.`,
    },

    { t: "heading", no: "10", title: "Renewal and Termination" },
    { t: "item", no: "10.1", text: `This Agreement shall remain in force for the entire tenure of the Term. The Agreement shall automatically renew at the end of the initial Term and any subsequent term for a renewal period of one year, unless the ${S} has provided the ${B} a written termination notice of its intention not to renew the Agreement.` },
    { t: "item", no: "10.2", text: "Either Party to this Agreement shall be entitled to terminate this Agreement before the expiry of the Term by giving one calendar month’s notice to the other Party without assigning any reasons." },

    { t: "heading", no: "11", title: "Arbitration" },
    { t: "para", indent: 1, text: "All disputes or differences whatsoever arising between the Parties out of or relating to the construction, meaning and operation or effect of this contract or the breach thereof shall be settled by arbitration in accordance with the Rules of Arbitration of the Indian Council of Arbitration, and the award made in pursuance thereof shall be binding on both the Parties." },

    { t: "heading", no: "12", title: "Jurisdiction" },
    { t: "para", indent: 1, text: "Subject to the arbitration herein above, this Agreement shall be construed in accordance with the laws of India and be subject to the exclusive jurisdiction of the competent Courts in the city of Bangalore, in the State of Karnataka, India. All disputes arising between the Parties in relation to this Agreement shall be subject to the jurisdiction of the courts at Bangalore, Karnataka." },

    { t: "heading", no: "13", title: "General" },
    { t: "sub", no: "13.1", title: "Waiver and Amendment" },
    { t: "para", indent: 2, text: "No modification, amendment or waiver of any provision of this Agreement shall be effective unless in writing and signed by both the Parties. No failure or delay by either Party in exercising any right, power or remedy under this Agreement, except as specifically provided herein, shall operate as a waiver of any such right, power or remedy." },
    { t: "sub", no: "13.2", title: "Notice" },
    { t: "para", indent: 2, text: "All notices or other communications required or permitted to be delivered or given hereunder shall be in writing and shall be delivered by hand or sent by mail, prepaid telex, or by registered, certified or express mail, or reputable courier service, and shall be deemed delivered or given when so delivered by hand, facsimile, telex or cable, or if mailed, 3 (three) business days after mailing and 2 (two) business days in the case of express mail or courier service, at the addresses specified below:" },
    { t: "address" },
    { t: "sub", no: "13.3", title: "Assignment" },
    { t: "para", indent: 2, text: `The ${B} shall not assign or otherwise transfer any of its rights or obligations under this Agreement without the prior written consent of the ${S}.` },
    { t: "sub", no: "13.4", title: "Taxes" },
    { t: "para", indent: 2, text: `Each Party agrees to pay, and to indemnify and hold the other Party harmless from, any taxes, duty or cesses not based on each Party’s net income, including any penalties and interest, as well as any costs associated with the collection or withholding thereof, and all governmental permit fees, licence fees and similar fees levied upon the provision by the ${B} of the Pest Management Services.` },
    { t: "sub", no: "13.5", title: "Severability" },
    { t: "para", indent: 2, text: `In the event that any provision contained in this Agreement, or the application of any such provision to either the ${B} or the ${IND}, is held to be contrary to any law or otherwise unenforceable, such provision shall be amended by the Parties in writing so as to best accomplish the objectives of the original provision to the fullest extent allowed by law, and the remaining provisions of this Agreement will remain in full force and effect.` },
    { t: "sub", no: "13.6", title: "No Third Party Beneficiaries" },
    { t: "para", indent: 2, text: "This Agreement inures to the benefit of both the Parties only and no third party shall have any rights hereunder." },

    { t: "signatures", withDate: true, intro: "IN WITNESS WHEREOF THE PARTIES HAVE EXECUTED THIS AGREEMENT ON THE DATE, MONTH AND YEAR MENTIONED BELOW" },
    { t: "annexure" },
    { t: "signatures", withDate: false },
  ];
}

// ---- drawing -----------------------------------------------------------------

const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const FONTS = {
  R: "PlusJakartaSans-Regular.ttf",
  SB: "PlusJakartaSans-SemiBold.ttf",
  B: "PlusJakartaSans-Bold.ttf",
  XB: "PlusJakartaSans-ExtraBold.ttf",
};
const C = {
  navy: "#0f2340", ink: "#14213d", body: "#2f3746", muted: "#6b7280", line: "#dfe3ea",
  card: "#f6f7f9", red: "#c8102e", blue: "#0a7fd6", head: "#e9eef6", soft: "#f3f6fb",
};
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const L = 56;
const R = PAGE_W - 56;
const W = R - L;
const TOP = 86; // content starts below the page header
const BOTTOM = PAGE_H - 62; // and stops above the footer
const SIZE = 9.6;
const GAP = 3.2;
const INDENT = [0, 26, 52];

/**
 * Draws the agreement. `meta`: { number, draft }. A draft (preview) has no number yet.
 * Resolves with the PDF as a Buffer.
 */
function renderAgreementPdf(content, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: { Title: `Service Agreement${meta.draft ? "" : ` ${meta.number}`} - ${content.customer.name}`, Author: COMPANY.name },
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

function draw(doc, a, meta) {
  let y = TOP;
  const font = (name, size, color = C.body) => doc.font(name).fontSize(size).fillColor(color);
  const hLine = (yy, color = C.line, width = 0.7, x1 = L, x2 = R) => doc.moveTo(x1, yy).lineTo(x2, yy).lineWidth(width).strokeColor(color).stroke();

  function newPage() {
    doc.addPage();
    y = TOP;
  }
  function ensure(h) {
    if (y + h > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  }

  // Text with **bold** parts, laid out word by word: each word is measured in its own face and
  // placed exactly, so there is never a stray gap where bold meets normal text, and lines can be
  // justified (the last line of a paragraph stays left-aligned).
  function words(str) {
    const out = [];
    let cur = [];
    str.split("**").forEach((run, i) => {
      const bold = i % 2 === 1;
      for (const part of run.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          if (cur.length) out.push(cur);
          cur = [];
        } else cur.push({ t: part, bold });
      }
    });
    if (cur.length) out.push(cur);
    return out;
  }
  function layout(str, width, size) {
    const list = words(str).map((segs) => ({
      segs,
      w: segs.reduce((sum, g) => {
        font(g.bold ? "B" : "R", size);
        return sum + doc.widthOfString(g.t);
      }, 0),
    }));
    font("R", size);
    const space = doc.widthOfString(" ");
    const lh = doc.currentLineHeight(true) + GAP;
    const lines = [];
    let line = [];
    let lw = 0;
    for (const wd of list) {
      const add = line.length ? space + wd.w : wd.w;
      if (line.length && lw + add > width) {
        lines.push({ words: line, w: lw });
        line = [wd];
        lw = wd.w;
      } else {
        line.push(wd);
        lw += add;
      }
    }
    if (line.length) lines.push({ words: line, w: lw });
    return { lines, space, lh, h: lines.length * lh };
  }
  function rich(str, x, yy, width, { size = SIZE, align = "justify", color = C.body } = {}) {
    const { lines, space, lh } = layout(str, width, size);
    lines.forEach((ln, i) => {
      const gaps = ln.words.length - 1;
      let extra = align === "justify" && i < lines.length - 1 && gaps > 0 ? (width - ln.w) / gaps : 0;
      if (extra > space * 3) extra = 0; // a nearly empty line reads better left-aligned
      let cx = x + (align === "center" ? (width - ln.w) / 2 : 0);
      for (const wd of ln.words) {
        for (const g of wd.segs) {
          font(g.bold ? "B" : "R", size, g.bold ? C.ink : color);
          doc.text(g.t, cx, yy + i * lh, { lineBreak: false });
          cx += doc.widthOfString(g.t);
        }
        cx += space + extra;
      }
    });
  }
  const measure = (str, width, size = SIZE) => layout(str, width, size).h;

  // ---------------- page 1 title block
  function titleBlock() {
    font("XB", 22, C.ink).text("SERVICE AGREEMENT", L, y, { width: W, align: "center", characterSpacing: 2.5 });
    y += 32;
    const accent = 70;
    doc.rect(PAGE_W / 2 - accent / 2, y, accent * 0.72, 2.6).fill(C.red);
    doc.rect(PAGE_W / 2 - accent / 2 + accent * 0.72, y, accent * 0.28, 2.6).fill(C.blue);
    y += 30;
  }

  // ---------------- blocks
  function para(b) {
    const x = L + INDENT[b.indent || 0];
    const w = R - x;
    const h = measure(b.text, w);
    ensure(h);
    rich(b.text, x, y, w);
    y += h + 8;
  }
  function item(b) {
    const level = b.level || 1;
    const numX = L + INDENT[level - 1];
    const x = L + INDENT[level];
    const w = R - x;
    const h = measure(b.text, w);
    ensure(h);
    font(level === 1 ? "B" : "SB", SIZE, C.ink).text(b.no, numX, y, { width: x - numX - 4, lineBreak: false });
    rich(b.text, x, y, w);
    y += h + 7;
  }
  function heading(b) {
    // keep a heading with at least three lines of what follows
    ensure(78);
    y += 6;
    font("XB", 10.4, C.navy).text(b.no, L, y, { width: INDENT[1] - 4, lineBreak: false });
    font("XB", 10.4, C.navy).text(b.title.toUpperCase(), L + INDENT[1], y, { width: W - INDENT[1], characterSpacing: 0.6 });
    y += doc.heightOfString(b.title.toUpperCase(), { width: W - INDENT[1], characterSpacing: 0.6 }) + 3;
    hLine(y, C.line, 0.7, L + INDENT[1], R);
    y += 8;
  }
  function sub(b) {
    ensure(40);
    font("B", SIZE, C.ink).text(b.no, L + INDENT[1], y, { lineBreak: false });
    font("B", SIZE, C.ink).text(b.title, L + INDENT[2], y, { lineBreak: false });
    y += 15;
  }
  function label(b) {
    ensure(40);
    y += 4;
    font("XB", 9.8, C.ink).text(b.text, L, y, { width: W, characterSpacing: 0.5 });
    y += 18;
  }
  // A party: a plain justified paragraph that starts with its name in bold.
  function party(b) {
    const h = measure(b.text, W);
    ensure(h);
    rich(b.text, L, y, W);
    y += h + 6;
  }
  // "AND" between the parties, centred between two thin rules.
  function and() {
    ensure(30);
    y += 4;
    font("XB", 9.4, C.ink);
    const label = "AND";
    const lw = doc.widthOfString(label, { characterSpacing: 2.4 });
    const mid = L + W / 2;
    hLine(y + 6, C.line, 0.8, mid - 90, mid - lw / 2 - 12);
    hLine(y + 6, C.line, 0.8, mid + lw / 2 + 12, mid + 90);
    doc.text(label, mid - lw / 2, y, { characterSpacing: 2.4, lineBreak: false });
    y += 24;
  }
  function address() {
    const lines = [COMPANY.name, ...COMPANY.noticeLines, `Mob: ${COMPANY.mobile}`, `Email: ${COMPANY.email}`];
    const x = L + INDENT[2];
    const h = lines.length * 13.5 + 18;
    ensure(h);
    doc.roundedRect(x, y, 230, h, 7).fillAndStroke(C.card, C.line);
    lines.forEach((ln, i) => {
      font(i === 0 ? "B" : "R", 9, i === 0 ? C.ink : C.body).text(ln, x + 12, y + 9 + i * 13.5, { width: 210, lineBreak: false });
    });
    y += h + 10;
  }

  // Two-column signature table: BestServe filled in; the customer's side as entered on the form
  // (anything left empty stays blank to fill by hand).
  function signatures(b) {
    const rowH = 30;
    const sealH = 92;
    const introH = b.intro ? measure(b.intro, W, 9.4) + 12 : 0;
    const cs = a.customerSignatory || {};
    const rows = [
      ["Name", a.signatory.name, cs.name || ""],
      ["Title / Designation", a.signatory.designation, cs.designation || ""],
      ...(b.withDate ? [["Date", shortDate(a.signingDate), cs.date ? shortDate(cs.date) : ""]] : []),
    ];
    const tableH = 34 + rows.length * rowH + sealH;
    ensure(introH + tableH + 10);
    y += 8;
    if (b.intro) {
      font("XB", 9.4, C.ink).text(b.intro, L, y, { width: W, lineGap: 2 });
      y += introH;
    }
    const half = W / 2;
    const top = y;
    // heading row
    doc.rect(L, top, W, 34).fill(C.navy);
    font("B", 8.6, "#ffffff").text(COMPANY.nameCaps, L + 12, top + 12, { width: half - 24, lineBreak: false });
    font("B", 8.6, "#ffffff").text(a.customer.name.toUpperCase(), L + half + 12, top + 12, { width: half - 24, lineBreak: false, ellipsis: true });
    let ry = top + 34;
    rows.forEach(([k, ours, theirs]) => {
      font("B", 6.8, C.muted).text(k.toUpperCase(), L + 12, ry + 7, { characterSpacing: 0.8, lineBreak: false });
      font("B", 9.6, C.ink).text(ours, L + 12, ry + 16, { width: half - 24, lineBreak: false });
      font("B", 6.8, C.muted).text(k.toUpperCase(), L + half + 12, ry + 7, { characterSpacing: 0.8, lineBreak: false });
      if (theirs) font("B", 9.6, C.ink).text(theirs, L + half + 12, ry + 16, { width: half - 24, lineBreak: false, ellipsis: true });
      ry += rowH;
      hLine(ry, C.line, 0.7);
    });
    font("B", 6.8, C.muted).text("SIGNATURE WITH COMPANY SEAL", L + 12, ry + 8, { characterSpacing: 0.8, lineBreak: false });
    font("B", 6.8, C.muted).text("SIGNATURE WITH COMPANY SEAL", L + half + 12, ry + 8, { characterSpacing: 0.8, lineBreak: false });
    ry += sealH;
    doc.rect(L, top, W, ry - top).lineWidth(0.9).strokeColor("#c5ccd8").stroke();
    doc.moveTo(L + half, top).lineTo(L + half, ry).lineWidth(0.9).strokeColor("#c5ccd8").stroke();
    y = ry + 16;
  }

  // Annexure-1: the services table. The service cell spans its rows; a run of equal
  // frequencies inside a service is one merged cell. A long table continues on the next
  // page with its heading row again.
  function annexure() {
    newPage();
    font("XB", 13, C.ink).text("ANNEXURE-1", L, y, { characterSpacing: 1.5 });
    y += 20;
    const title = `CHARGES FOR PEST CONTROL SERVICES AT ${a.customer.name.toUpperCase()} PREMISES`;
    font("B", 9.4, C.red).text(title, L, y, { width: W, characterSpacing: 0.4 });
    y += doc.heightOfString(title, { width: W, characterSpacing: 0.4 }) + 12;

    const cols = [
      { label: "Sl. No", w: 0.06, align: "center" },
      { label: "Service Recommended", w: 0.18 },
      { label: "Defense Area", w: 0.15 },
      { label: "Material Used", w: 0.18 },
      { label: "Location / Treatment Area", w: 0.27 },
      { label: "Frequency Required", w: 0.16 },
    ];
    const cw = cols.map((c) => c.w * W);
    const cx = [];
    cw.reduce((x, w) => (cx.push(x), x + w), L);
    const PADX = 6;
    const PADY = 7;
    const CS = 8.6;
    const cellH = (s, k, f = "R") => {
      font(f, CS);
      return doc.heightOfString(s || " ", { width: cw[k] - PADX * 2, lineGap: 1.5 });
    };
    const rule = "#c9d0dc";

    function headerRow() {
      font("B", 7.4);
      const h = Math.max(...cols.map((c, k) => doc.heightOfString(c.label.toUpperCase(), { width: cw[k] - PADX * 2, characterSpacing: 0.5 }))) + 14;
      doc.rect(L, y, W, h).fill(C.navy);
      cols.forEach((c, k) => {
        font("B", 7.4, "#ffffff").text(c.label.toUpperCase(), cx[k] + PADX, y + 7, { width: cw[k] - PADX * 2, align: c.align || "left", characterSpacing: 0.5 });
      });
      y += h;
    }

    headerRow();
    a.services.forEach((svc, si) => {
      // each row's height: the tallest of its own cells (defense, material, area, frequency)
      const heights = svc.rows.map((r) => Math.max(cellH(r.defense_area, 2), cellH(r.material_used, 3), cellH(r.treatment_area, 4), cellH(r.frequency, 5)) + PADY * 2);
      const nameH = cellH(svc.name, 1, "SB") + PADY * 2;
      let i = 0;
      let first = true;
      while (i < svc.rows.length) {
        // the rows of this service that fit on the page (at least one; the name cell needs room)
        let used = 0;
        let j = i;
        while (j < svc.rows.length && y + used + heights[j] <= BOTTOM) used += heights[j++];
        if (j === i || (first && y + Math.max(used, nameH) > BOTTOM)) {
          newPage();
          headerRow();
          continue;
        }
        const segH = Math.max(used, first ? nameH : 0);
        const top = y;
        if (si % 2 === 1) doc.rect(L, top, W, segH).fill(C.soft);
        // number + service name, spanning the segment
        font("B", CS, C.ink).text(String(si + 1), cx[0] + PADX, top + PADY, { width: cw[0] - PADX * 2, align: "center" });
        font("SB", CS, C.ink).text(first ? svc.name : `${svc.name} (contd.)`, cx[1] + PADX, top + PADY, { width: cw[1] - PADX * 2, lineGap: 1.5 });
        // rows
        let ry = top;
        for (let k = i; k < j; k += 1) {
          const r = svc.rows[k];
          const rh = k === j - 1 ? segH - (ry - top) : heights[k];
          [[r.defense_area, 2], [r.material_used, 3], [r.treatment_area, 4]].forEach(([v, c]) => {
            font("R", CS, C.body).text(v, cx[c] + PADX, ry + PADY, { width: cw[c] - PADX * 2, lineGap: 1.5 });
          });
          if (k > i) doc.moveTo(cx[2], ry).lineTo(k > i && r.frequency === svc.rows[k - 1].frequency ? cx[5] : R, ry).lineWidth(0.6).strokeColor(rule).stroke();
          ry += rh;
        }
        // frequency: one cell per run of equal values
        let k = i;
        let fy = top;
        while (k < j) {
          let m = k;
          let h = 0;
          while (m < j && svc.rows[m].frequency === svc.rows[k].frequency) {
            h += m === j - 1 ? segH - (fy + h - top) : heights[m];
            m += 1;
          }
          const fh = cellH(svc.rows[k].frequency, 5);
          font("SB", CS, C.ink).text(svc.rows[k].frequency, cx[5] + PADX, fy + Math.max(PADY, (h - fh) / 2), { width: cw[5] - PADX * 2, align: "center", lineGap: 1.5 });
          fy += h;
          k = m;
        }
        // grid
        doc.rect(L, top, W, segH).lineWidth(0.8).strokeColor(rule).stroke();
        for (let c = 1; c < cols.length; c += 1) doc.moveTo(cx[c], top).lineTo(cx[c], top + segH).lineWidth(0.6).strokeColor(rule).stroke();
        y = top + segH;
        i = j;
        first = false;
        if (i < svc.rows.length) {
          newPage();
          headerRow();
        }
      }
    });
    y += 14;
  }

  // ---------------- run
  titleBlock();
  const run = { para, item, heading, sub, label, party, and, address, signatures, annexure };
  for (const b of agreementBlocks(a, meta)) run[b.t](b);

  // ---------------- page header + footer on every page
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let p = 0; p < total; p += 1) {
    doc.switchToPage(range.start + p);
    // header: logo left, document name + number right, a thin rule
    doc.image(LOGO, L, 26, { height: 30 });
    font("B", 7.2, C.muted).text("SERVICE AGREEMENT", R - 260, 30, { width: 260, align: "right", characterSpacing: 1.4, lineBreak: false });
    font("B", 8.6, C.ink).text(meta.draft ? a.customer.name : `${meta.number}  ·  ${a.customer.name}`, R - 260, 42, { width: 260, align: "right", lineBreak: false, ellipsis: true });
    doc.rect(L, 64, W * 0.72, 1.6).fill(C.red);
    doc.rect(L + W * 0.72, 64, W * 0.28, 1.6).fill(C.blue);
    // footer
    hLine(PAGE_H - 44, C.line, 0.7);
    font("R", 7.6, C.muted).text(COMPANY.name, L, PAGE_H - 34, { lineBreak: false });
    font("B", 7.6, C.ink).text(`Page ${p + 1} of ${total}`, R - 120, PAGE_H - 34, { width: 120, align: "right", lineBreak: false });
  }
}

module.exports = { normalizeAgreementContent, renderAgreementPdf, AgreementInputError };
