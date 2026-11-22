// Live preview of line amounts and totals while a draft is edited. Same rules as the server
// (backend/src/services/billing/calc.js); the server recalculates everything on save.

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

export function lineAmount(l) {
  const base = (Number(l.rate) || 0) * (Number(l.quantity) || 0);
  switch (l.adjustment_type) {
    case "SERVICES": {
      const planned = Number(l.services_planned) || 0;
      return planned > 0 ? round2((base * Math.min(Number(l.services_done) || 0, planned)) / planned) : round2(base);
    }
    case "DAYS":
      return Number(l.days_in_period) > 0 ? round2((base * (Number(l.days_worked) || 0)) / Number(l.days_in_period)) : round2(base);
    case "PERCENT":
      return round2((base * (Number(l.percent) || 0)) / 100);
    case "MANUAL":
      return round2(l.manual_amount);
    default:
      return round2(base);
  }
}

// The GST rates a contract may bill at (same as the server's calc.GST_RATES).
export const GST_RATES = [5, 12, 18, 28];
export const gstRateOf = (rate) => (GST_RATES.includes(Number(rate)) ? Number(rate) : 18);

/** "CGST 9% + SGST 9% (Karnataka)" / "IGST 18% (outside Karnataka)", or which rates are allowed. */
export function gstHint(rate, stateCode = "29") {
  const r = Number(rate);
  if (!GST_RATES.includes(r)) return `Allowed: ${GST_RATES.join(", ")} %`;
  return String(stateCode || "29") === "29" ? `CGST ${r / 2}% + SGST ${r / 2}% (Karnataka)` : `IGST ${r}% (outside Karnataka)`;
}

/** Totals at the invoice's GST rate (default 18 %): CGST + SGST half each, or all IGST. */
export function totalsFor(lines, taxMode, gstRate = 18) {
  const rate = gstRateOf(gstRate);
  const subtotal = round2(lines.reduce((t, l) => t + lineAmount(l), 0));
  const cgst = taxMode === "CGST_SGST" ? round2((subtotal * rate) / 2 / 100) : 0;
  const sgst = taxMode === "CGST_SGST" ? round2((subtotal * rate) / 2 / 100) : 0;
  const igst = taxMode === "IGST" ? round2((subtotal * rate) / 100) : 0;
  const raw = round2(subtotal + cgst + sgst + igst);
  const total = Math.round(raw);
  return { subtotal, cgst, sgst, igst, round_off: round2(total - raw), total };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function below1000(n) {
  const out = [];
  if (n >= 100) {
    out.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) out.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  else if (n > 0) out.push(ONES[n]);
  return out.join(" ");
}
function words(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 15257 -> "Fifteen Thousand Two Hundred Fifty Seven Rupees only" (same wording as the PDF). */
export const amountInWords = (n) => `${words(Math.round(Number(n) || 0))} Rupees only`;
