/* eslint-disable no-bitwise */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { QUOTATION_LOGO_PNG_BASE64 } from './quotationLogo';

// A saved quotation as a Word document (.doc), so it can be opened and edited in Word or WPS, or
// shared. The same document as the web's (frontend/src/pages/leads/quotationWord.js) - keep the two
// in step.
//
// It is built here in the browser from the quotation's saved details (GET .../content), in the same
// order and style as the PDF the server draws (backend/src/utils/crmQuotationDocument.js): the cover
// letter, the scope & charges (services, the price table, the total), then value added services,
// terms, our commitment and acceptance. Word cannot copy the PDF's rounded cards exactly, so they
// become plain shaded tables - the same content and colours, laid out cleanly and fully editable.
//
// The file is a single-file web page (MHTML) that Word opens as a document, with the logo inside it.
// No library is needed for this.

const COMPANY = {
  name: "Bestserve Pest Management Pvt. Ltd.",
  addressLines: ["#372/2, Lokesh Building, Hogebandi Garden, DLF New Town", "Begur, Bangalore - 560068"],
  contact: "+91 90366 66601 / 02  ·  info@bestserve.in  ·  www.bestserve.in",
  cin: "U24100KA2012PTC064496",
  email: "info@bestserve.in",
};
const SIGNATORY = { name: "Prashanth Shetty", designation: "Authorised Signatory", phone: "+91 96204 27000" };

const C = {
  navy: "#0f2340", ink: "#14213d", body: "#3b4252", muted: "#6b7280", line: "#d5dbe5",
  card: "#f6f7f9", red: "#c8102e", sky: "#8cc8f5", onNavy: "#c9d3e3", headRow: "#e4e9f1", pillSoft: "#e8eef7",
};
const FONT = "'Segoe UI', Calibri, Arial, sans-serif";

const PER: Record<string, string> = { MONTHLY: " / month", YEARLY: " / year", ONE_TIME: "" };
const PER_WORD: Record<string, string> = { MONTHLY: "per month", YEARLY: "per year", ONE_TIME: "one-time" };
const ROW_COLS = [
  { key: "defense_area", label: "Defence Area", w: 24 },
  { key: "material_used", label: "Method", w: 27 },
  { key: "treatment_area", label: "Treated Area", w: 31 },
  { key: "frequency", label: "Frequency", w: 18 },
];

// ---- small helpers -------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rupees = (n: unknown) => `₹${inr0.format(Number(n) || 0)}`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
const joinNames = (names: string[]) => (names.length <= 1 ? names[0] || "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}
/** 158000 -> "One Lakh Fifty Eight Thousand" (the same wording as the PDF). */
function rupeesInWords(value: unknown) {
  let n = Math.floor(Number(value) || 0);
  if (n === 0) return "Zero";
  const parts: string[] = [];
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
function amountInWords(value: unknown) {
  const paise = Math.round((Number(value) - Math.floor(Number(value))) * 100);
  return `Rupees ${rupeesInWords(value)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

// Text -> base64 (UTF-8), wrapped at 76 characters as e-mail style files expect. Written out by hand
// so it does not depend on the phone's JavaScript engine having btoa / TextEncoder.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      c = 0;
    }
  }
  return out;
}
function base64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    s += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    s += c === undefined ? '=' : B64[c & 63];
  }
  return s;
}
const wrap76 = (b64: string) => b64.replace(/.{76}/g, '$&\r\n');

// A cell's text: each line its own paragraph; a numbered point ("1. ...") hangs its text after the
// number, as Word's own numbered lists do.
const POINT_RE = /^(\d{1,3}[.)])(?!\d)\s*(.*)$/;
function cellHtml(value: unknown, { align = "left", bold = false, size = 10, color = C.ink, points = true }: { align?: string; bold?: boolean; size?: number; color?: string; points?: boolean } = {}) {
  const lines = String(value ?? "").split("\n");
  const base = `margin:0;text-align:${align};font-size:${size}pt;color:${color};${bold ? "font-weight:bold;" : ""}`;
  return lines
    .map((line) => {
      const m = points ? POINT_RE.exec(line.trim()) : null;
      if (m) return `<p style="${base}margin-left:18pt;text-indent:-18pt">${esc(m[1])}<span style="mso-tab-count:1">&nbsp;&nbsp;</span>${esc(m[2])}</p>`;
      return `<p style="${base}">${esc(line) || "&nbsp;"}</p>`;
    })
    .join("");
}

const p = (html: string, style = "") => `<p style="margin:0 0 8pt 0;font-size:10.5pt;color:${C.body};line-height:1.4;${style}">${html}</p>`;
const eyebrow = (text: string, color: string = C.red) =>
  `<p style="margin:0 0 4pt 0;font-size:7.5pt;font-weight:bold;letter-spacing:1.5pt;color:${color};text-transform:uppercase">${esc(text)}</p>`;
const spacer = (pt: number) => `<p style="margin:0;font-size:${pt}pt;line-height:${pt}pt">&nbsp;</p>`;
const pageBreak = `<br clear="all" style="page-break-before:always;mso-break-type:page-break">`;
const td = (html: string, style = "") => `<td style="padding:6pt 8pt;vertical-align:top;${style}">${html}</td>`;

// The price table's column widths (percent) from its text, so a short column like "Sl No" stays narrow.
function priceTableWidths(t: any): number[] {
  const all = [t.header, ...t.body];
  const cols = t.header.length;
  const want = Array.from({ length: cols }, (_, c) =>
    Math.max(
      String(t.header[c] || "").length + 4,
      ...all.map((r) => Math.min(70, Math.max(...String(r[c] || "").split("\n").map((l) => l.length)))),
      4
    )
  );
  const sum = want.reduce((a, w) => a + w, 0);
  return want.map((w) => Math.round((w / sum) * 1000) / 10);
}

// ---- the document ----------------------------------------------------------------

function documentHtml(q: any, meta: { number?: string; leadNumber?: string | null; date: Date }, logoSrc: string) {
  const date = meta.date;
  const validUntil = new Date(date.getTime() + (q.validDays || 30) * 86400000);
  // The date chosen in the builder is the one printed at the top (Valid Until still counts from the day it was made).
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(String(q.quotationDate || '')) ? new Date(`${q.quotationDate}T12:00:00`) : null;
  const shownDate = picked && !Number.isNaN(picked.getTime()) ? picked : date;
  const by = q.preparedBy?.name ? q.preparedBy : SIGNATORY;
  const docLabel = meta.number ? `Quotation ${meta.number}` : "Quotation";
  const services = q.services || [];
  const out: string[] = [];

  // ================= 1. cover letter =================
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${C.navy}">
  <tr>
    <td style="padding:14pt 16pt;vertical-align:middle;width:45%">
      ${logoSrc ? `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td style="background:#ffffff;padding:6pt 10pt"><img src="${logoSrc}" width="150" height="59" alt="Bestserve"></td></tr></table>` : `<p style="margin:0;font-size:14pt;font-weight:bold;color:#ffffff">BESTSERVE</p>`}
    </td>
    <td style="padding:14pt 16pt;vertical-align:middle;text-align:right">
      <p style="margin:0;font-size:11pt;font-weight:bold;color:#ffffff">${esc(COMPANY.name)}</p>
      <p style="margin:2pt 0 0 0;font-size:7.5pt;color:${C.onNavy}">CIN: ${esc(COMPANY.cin)}</p>
      <p style="margin:0;font-size:7.5pt;color:${C.onNavy}">${esc(COMPANY.addressLines[0])}</p>
      <p style="margin:0;font-size:7.5pt;color:${C.onNavy}">${esc(COMPANY.addressLines[1])}</p>
      <p style="margin:0;font-size:7.5pt;color:${C.onNavy}">${esc(COMPANY.contact)}</p>
    </td>
  </tr>
</table>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
  <td style="width:72%;height:3pt;background:${C.red};font-size:2pt;line-height:2pt">&nbsp;</td>
  <td style="width:28%;height:3pt;background:#0a7fd6;font-size:2pt;line-height:2pt">&nbsp;</td>
</tr></table>`);
  out.push(spacer(14));

  // tag + date
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
  <td style="vertical-align:middle"><span style="background:${C.red};color:#ffffff;font-size:8pt;font-weight:bold;letter-spacing:1.6pt;padding:3pt 10pt">&nbsp;${q.revised ? "REVISED QUOTATION" : "QUOTATION"}&nbsp;</span></td>
  <td style="vertical-align:middle;text-align:right;font-size:10pt;font-weight:bold;color:${C.ink}">${esc(longDate(shownDate))}</td>
</tr></table>`);
  out.push(spacer(8));

  // particulars
  const particulars = [
    ...(meta.number ? [["Quotation No", meta.number]] : []),
    ["Valid Until", longDate(validUntil)],
    ["Contract Period", `${q.contractMonths || 12} Month${(q.contractMonths || 12) > 1 ? "s" : ""}`],
    ...(meta.leadNumber ? [["Reference", meta.leadNumber]] : []),
  ];
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${C.card};border:1px solid #e6e9ef"><tr>
  ${particulars
    .map(
      ([k, v], i) => `<td style="padding:8pt 12pt;vertical-align:top;${i > 0 ? "border-left:1px solid #e6e9ef;" : ""}">
      <p style="margin:0;font-size:6.8pt;font-weight:bold;letter-spacing:1pt;color:${C.muted};text-transform:uppercase">${esc(k)}</p>
      <p style="margin:2pt 0 0 0;font-size:9.6pt;font-weight:bold;color:${C.ink}">${esc(v)}</p></td>`
    )
    .join("")}
</tr></table>`);
  out.push(spacer(14));

  // prepared for
  out.push(eyebrow("Prepared for", C.muted));
  out.push(`<p style="margin:0 0 3pt 0;font-size:17pt;font-weight:bold;color:${C.ink}">${esc(q.customer?.name)}</p>`);
  for (const line of [q.customer?.address, q.customer?.phone].filter(Boolean)) {
    out.push(`<p style="margin:0;font-size:9.6pt;color:${C.muted}">${esc(line)}</p>`);
  }
  out.push(`<p style="margin:12pt 0 16pt 0;border-bottom:1px solid #e6e9ef;font-size:2pt">&nbsp;</p>`);

  // title + subject
  out.push(`<p style="margin:0 0 4pt 0;font-size:19pt;font-weight:bold;color:${C.ink}">${esc(`Proposal for ${joinNames(services.map((s: any) => s.name))}`)}</p>`);
  out.push(`<p style="margin:0 0 16pt 0;font-size:10.5pt;font-weight:bold;color:${C.red}">${esc(q.subject)}</p>`);

  // letter
  out.push(p("Dear Sir / Madam,"));
  out.push(p("Thank you for your interest in our pest control services."));
  out.push(p("We would be glad to serve your premises with an eco-friendly approach to pest control, creating a healthy environment for your staff and customers."));
  out.push(p("Please find our proposal, recommendations and treatment method on the following pages for your consideration. Feel free to contact us for any further information."));
  out.push(p("We look forward to your favourable reply and to working together towards a pest-free environment.", "margin-bottom:14pt"));
  out.push(p("Yours faithfully,", "margin-bottom:28pt"));
  out.push(`<p style="margin:0;width:170pt;border-top:1px solid #9aa1ad;padding-top:6pt;font-size:12pt;font-weight:bold;color:${C.ink}">${esc(by.name)}</p>`);
  if (by.designation) out.push(`<p style="margin:0;font-size:9.4pt;color:${C.muted}">${esc(by.designation)}</p>`);
  if (by.phone) out.push(`<p style="margin:0;font-size:9.4pt;color:${C.muted}">${esc(by.phone)}</p>`);

  // ================= 2. scope & charges =================
  out.push(pageBreak);
  out.push(eyebrow("Scope of work & charges"));
  out.push(`<p style="margin:0 0 4pt 0;font-size:20pt;font-weight:bold;color:${C.ink}">${esc(services.length === 1 ? services[0].name : `${services.length} services for your premises`)}</p>`);
  out.push(p(esc(`Recommended treatment plan and charges for ${q.customer?.name || ""}.`), `color:${C.muted};margin-bottom:14pt`));

  const card = (no: number, title: string, pill: string, dark: boolean, inner: string) => `
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${C.card};border:1px solid #e6e9ef">
  <tr><td style="padding:10pt 12pt 6pt 12pt">
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
      <td style="width:26pt;background:${C.navy};text-align:center;vertical-align:middle;padding:5pt 0"><span style="font-size:10.5pt;font-weight:bold;color:${C.sky}">${pad2(no)}</span></td>
      <td style="padding-left:10pt;vertical-align:middle"><span style="font-size:14pt;font-weight:bold;color:${C.ink}">${esc(title)}</span></td>
      <td style="text-align:right;vertical-align:middle"><span style="background:${dark ? C.navy : C.pillSoft};color:${dark ? "#ffffff" : C.navy};font-size:9.6pt;font-weight:bold;padding:3pt 10pt">&nbsp;${esc(pill)}&nbsp;</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:4pt 8pt 10pt 8pt">${inner}</td></tr>
</table>`;
  const ruled = `border:1px solid ${C.line};`;

  services.forEach((s: any, si: number) => {
    const pkg = q.pricing?.mode === "PACKAGE";
    const pill = pkg ? "Included in package" : `${rupees(s.price)} + GST${PER[s.billing] || ""}`;
    const table = `
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff">
  <tr>${ROW_COLS.map((c) => td(`<p style="margin:0;font-size:7.6pt;font-weight:bold;letter-spacing:0.9pt;color:${C.ink};text-transform:uppercase">${esc(c.label)}</p>`, `width:${c.w}%;background:${C.headRow};${ruled}`)).join("")}</tr>
  ${(s.rows || [])
    .map((r: any) => `<tr>${ROW_COLS.map((c) => td(cellHtml(r[c.key], { size: 9 }), ruled)).join("")}</tr>`)
    .join("")}
</table>`;
    out.push(card(si + 1, s.name, pill, !pkg, table));
    out.push(spacer(8));
  });

  // the salesperson's own price table
  const t = q.priceTable;
  if (t?.header) {
    const cols = t.header.length;
    // The widths set by dragging in the editor, else automatic from the text.
    const widths = Array.isArray(t.widths) && t.widths.length === cols ? t.widths : priceTableWidths(t);
    const bodyRows = (t.body || []).filter((cells: string[]) => cells.some((c: string) => String(c || "").trim()));
    const lastAlign = (c: number) => (c === cols - 1 && cols > 1 ? "right" : "left");
    const table = `
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff">
  <tr>${t.header
    .map((h: string, c: number) => td(`<p style="margin:0;text-align:${lastAlign(c)};font-size:7.6pt;font-weight:bold;letter-spacing:0.9pt;color:${C.ink};text-transform:uppercase">${esc(h)}</p>`, `width:${widths[c]}%;background:${C.headRow};white-space:nowrap;${ruled}`))
    .join("")}</tr>
  ${bodyRows
    .map((cells: string[]) => `<tr>${cells.map((v: string, c: number) => td(cellHtml(v, { align: lastAlign(c), size: 9.4, points: c !== cols - 1 }), ruled)).join("")}</tr>`)
    .join("")}
  <tr>${Array.from({ length: cols }, (_, c) => {
    const v = c === 0 ? t.totalLabel || "Total" : c === cols - 1 ? rupees(t.total) : "";
    return td(cellHtml(v, { align: lastAlign(c), size: 10.5, bold: true, color: c === cols - 1 ? C.navy : C.ink, points: false }), `background:${C.pillSoft};${ruled}`);
  }).join("")}</tr>
</table>`;
    out.push(card(services.length + 1, t.title || "Price details", `Total ${rupees(t.total)}`, true, table));
    out.push(spacer(8));
  }

  // package line (one price for everything) - a price table already says it
  if (q.pricing?.mode === "PACKAGE" && !t?.header) {
    out.push(p(esc(`${q.pricing.description || ""}${q.pricing.planLabel ? `  ·  ${q.pricing.planLabel}` : ""}`), "font-weight:bold"));
  }

  // combined total
  const totals = q.totals || {};
  const main = totals.primaryBilling || "ONE_TIME";
  const others = [
    ...(totals.monthly > 0 && main !== "MONTHLY" ? [`Monthly: ${rupees(totals.monthly)} + GST`] : []),
    ...(totals.yearly > 0 && main !== "YEARLY" ? [`AMC: ${rupees(totals.yearly)} + GST / year`] : []),
    ...(totals.oneTime > 0 && main !== "ONE_TIME" ? [`One-time: ${rupees(totals.oneTime)} + GST`] : []),
  ];
  const totalLabel = ({ MONTHLY: "Combined monthly charges", YEARLY: "Combined yearly charges (AMC)", ONE_TIME: "Total charges" } as Record<string, string>)[main];
  const countText = q.pricing?.mode === "PACKAGE" ? "One package price for all services" : `${services.length} service${services.length > 1 ? "s" : ""}`;
  const discount = totals.discount || 0;
  const final = totals.final ?? totals.primary;
  const perWord = `${PER_WORD[main]}${q.perOutlet ? " + per outlet" : ""}`;
  const right = discount > 0
    ? `<p style="margin:0;text-align:right;font-size:9.2pt;color:${C.onNavy}">Subtotal&nbsp;&nbsp;<s>${esc(rupees(totals.primary))} + GST</s></p>
       <p style="margin:4pt 0;text-align:right;font-size:11pt;font-weight:bold;color:#ffffff"><span style="background:#16a34a;padding:2pt 8pt">&nbsp;SPECIAL DISCOUNT&nbsp;&nbsp;- ${esc(rupees(discount))}&nbsp;</span></p>
       <p style="margin:6pt 0 0 0;text-align:right;font-size:8pt;font-weight:bold;letter-spacing:1.2pt;color:${C.sky}">FINAL AMOUNT</p>`
    : "";
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${C.navy}"><tr>
  <td style="padding:14pt 16pt;vertical-align:top">
    <p style="margin:0;font-size:7.6pt;font-weight:bold;letter-spacing:1.5pt;color:${C.sky};text-transform:uppercase">${esc(totalLabel)}</p>
    <p style="margin:3pt 0 0 0;font-size:9.4pt;color:${C.onNavy}">${esc(countText)}</p>
    ${others.length ? `<p style="margin:3pt 0 0 0;font-size:8.6pt;font-weight:bold;color:#ffffff">${esc(others.join("   ·   "))}</p>` : ""}
  </td>
  <td style="padding:14pt 16pt;vertical-align:top;text-align:right">
    ${right}
    <p style="margin:0;text-align:right;font-size:22pt;font-weight:bold;color:#ffffff">${esc(rupees(final))} + GST</p>
    <p style="margin:0;text-align:right;font-size:8.6pt;color:${C.onNavy}">${esc(perWord)}</p>
  </td>
</tr></table>`);
  const words = `${amountInWords(final)}${main === "MONTHLY" ? " per month" : main === "YEARLY" ? " per year" : ""}${q.perOutlet ? " + per outlet" : ""}.`;
  out.push(p(esc(`All charges are exclusive of GST.  ${words}`), `margin-top:6pt;font-size:8.4pt;color:${C.muted}`));

  // ================= 3. closing =================
  const lists = [
    ...((q.valueAdded || []).length ? [["Value added services", q.valueAdded]] : []),
    ...((q.terms || []).length ? [["Terms & conditions", q.terms]] : []),
  ];
  if (lists.length) {
    out.push(spacer(10));
    out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
  ${lists
    .map(
      ([title, items], li) => `<td style="width:${100 / lists.length}%;vertical-align:top;background:${C.card};border:1px solid #e6e9ef;padding:12pt 14pt;${li > 0 ? "border-left:8pt solid #ffffff;" : ""}">
      ${eyebrow(title)}
      ${items
        .map((it: string) => `<p style="margin:0 0 5pt 14pt;text-indent:-14pt;font-size:9.2pt;color:${C.body}"><span style="color:#0a7fd6;font-weight:bold">✓</span>&nbsp;&nbsp;${esc(it)}</p>`)
        .join("")}
    </td>`
    )
    .join("")}
</tr></table>`);
  }

  // our commitment
  out.push(spacer(16));
  out.push(eyebrow("Our commitment"));
  out.push(`<p style="margin:0 0 8pt 0;font-size:17pt;font-weight:bold;color:${C.ink}">A plan built around your premises</p>`);
  out.push(
    p(
      `This quotation is customised for <b style="color:${C.ink}">${esc(q.customer?.name)}</b> and can be adjusted further to your requirements. ` +
        "We do not work from standard rates or packages: our in-house team of experts shapes each service around the client's needs."
    )
  );

  // acceptance
  out.push(`<p style="margin:14pt 0 14pt 0;border-bottom:1px solid #e6e9ef;font-size:2pt">&nbsp;</p>`);
  out.push(eyebrow("Acceptance"));
  out.push(spacer(30));
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>
  ${[
    [`For ${COMPANY.name}`, [by.name, by.designation].filter(Boolean).join("  ·  ")],
    [`For ${q.customer?.name || ""}`, "Name, signature & date"],
  ]
    .map(
      ([who, sub], i) => `<td style="width:46%;vertical-align:top;border-top:1px solid #9aa1ad;padding-top:6pt">
      <p style="margin:0;font-size:9.6pt;font-weight:bold;color:${C.ink}">${esc(who)}</p>
      <p style="margin:2pt 0 0 0;font-size:8.8pt;color:${C.muted}">${esc(sub)}</p></td>${i === 0 ? `<td style="width:8%">&nbsp;</td>` : ""}`
    )
    .join("")}
</tr></table>`);

  // contact band
  out.push(spacer(24));
  out.push(`
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:${C.navy}">
  <tr>${[["Call", by.phone || "+91 90366 66601 / 02"], ["Email", COMPANY.email], ["Web", "www.bestserve.in"]]
    .map(
      ([k, v]) => `<td style="padding:12pt 16pt 6pt 16pt;vertical-align:top">
      <p style="margin:0;font-size:7.5pt;font-weight:bold;letter-spacing:1.5pt;color:${C.sky};text-transform:uppercase">${esc(k)}</p>
      <p style="margin:2pt 0 0 0;font-size:10pt;font-weight:bold;color:#ffffff">${esc(v)}</p></td>`
    )
    .join("")}</tr>
  <tr><td colspan="3" style="padding:6pt 16pt 12pt 16pt;border-top:1px solid #2a3d5e">
    <p style="margin:0;font-size:7.8pt;color:${C.onNavy}">Looking forward to a pest-free partnership.  ·  CIN: ${esc(COMPANY.cin)}</p>
  </td></tr>
</table>`);

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(`${docLabel} - ${q.customer?.name || ""}`)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page Section1 { size: 595.3pt 841.9pt; margin: 36pt 40pt 36pt 40pt; }
  div.Section1 { page: Section1; }
  body { font-family: ${FONT}; font-size: 10.5pt; color: ${C.body}; }
  p { font-family: ${FONT}; }
  td { font-family: ${FONT}; border: none; }
</style>
</head>
<body><div class="Section1">
${out.join("\n")}
</div></body></html>`;
}

/**
 * Builds the quotation's Word file in the app's cache and returns its path (to share or open).
 *   content: the saved quotation details (getQuotationContent)
 *   meta: { number, sentAt, leadNumber, fileName }
 */
export async function quotationWordFile(
  content: any,
  meta: { number?: string; sentAt?: string | null; leadNumber?: string | null; fileName?: string },
): Promise<string> {
  const date = meta.sentAt ? new Date(String(meta.sentAt).slice(0, 10) + 'T00:00:00') : new Date();
  const logoLocation = 'file:///C:/bestserve-quotation/logo.png';
  const html = documentHtml(
    content,
    { number: meta.number, leadNumber: meta.leadNumber, date: Number.isNaN(date.getTime()) ? new Date() : date },
    logoLocation,
  );

  const boundary = '----=_BestserveQuotation';
  const mhtml = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    'Content-Location: file:///C:/bestserve-quotation/quotation.htm',
    '',
    wrap76(base64(utf8Bytes(html))),
    '',
    `--${boundary}`,
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    `Content-Location: ${logoLocation}`,
    '',
    wrap76(QUOTATION_LOGO_PNG_BASE64),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const name = (meta.fileName || 'Quotation.pdf').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_') + '.doc';
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${name}`;
  await ReactNativeBlobUtil.fs.writeFile(path, mhtml, 'utf8'); // all plain ASCII
  return path;
}
