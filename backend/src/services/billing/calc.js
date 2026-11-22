// Money rules of Invoice Generation. Every amount on an invoice is worked out here, on the
// server, from the line inputs; totals sent by the browser are never used.
//
//   line amount   rate x quantity, then the line's adjustment (services done, days, percent, manual)
//   subtotal      sum of line amounts
//   tax           the contract's GST rate (5, 12, 18 or 28 %; 18 by default): in Karnataka split in
//                 half as CGST + SGST (9 % + 9 %), other states all IGST; Residential: none
//   total         subtotal + tax rounded to whole rupees; the difference is the round-off

const { amountInWords } = require("../../utils/brigadeInvoiceDocument");

const HOME_STATE = "29"; // Karnataka: BestServe's GST state
const CGST_RATE = 9;
const SGST_RATE = 9;
const IGST_RATE = 18;

/** Half-up rounding to paise. */
const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

const ADJUSTMENTS = ["NONE", "SERVICES", "FULL_DESPITE_SHORTFALL", "DAYS", "PERCENT", "MANUAL"];

/** companies.type -> COMMERCIAL / RESIDENTIAL (null when the customer type is not set). */
function categoryOf(companyType) {
  if (companyType === "CORPORATE") return "COMMERCIAL";
  if (companyType === "INDIVIDUAL" || companyType === "RWA") return "RESIDENTIAL";
  return null;
}

/** Which taxes apply: none for Residential, IGST outside Karnataka, else CGST + SGST. */
function taxModeFor(category, stateCode, gstApplicable = true) {
  // No GST for Residential, or when the contract is set to bill without GST.
  if (category === "RESIDENTIAL" || !gstApplicable) return "NONE";
  return String(stateCode || HOME_STATE) === HOME_STATE ? "CGST_SGST" : "IGST";
}

/** The amount of one line from its inputs. */
function lineAmount(line) {
  const base = (Number(line.rate) || 0) * (Number(line.quantity) || 0);
  switch (line.adjustment_type) {
    case "SERVICES": {
      const planned = Number(line.services_planned) || 0;
      if (planned <= 0) return round2(base);
      return round2((base * Math.min(Number(line.services_done) || 0, planned)) / planned);
    }
    case "DAYS": {
      const total = Number(line.days_in_period) || 0;
      return total > 0 ? round2((base * (Number(line.days_worked) || 0)) / total) : round2(base);
    }
    case "PERCENT":
      return round2((base * (Number(line.percent) || 0)) / 100);
    case "MANUAL":
      return round2(line.manual_amount);
    default: // NONE, FULL_DESPITE_SHORTFALL
      return round2(base);
  }
}

// The GST rates a contract may bill at (0 % is "No GST", set by gst_applicable instead).
const GST_RATES = [5, 12, 18, 28];

/** The GST rate to use: a valid slab, otherwise the standard 18 %. */
const gstRateOf = (rate) => (GST_RATES.includes(Number(rate)) ? Number(rate) : IGST_RATE);

/** Subtotal, taxes, round-off and total for the lines' amounts, at `gstRate` % (default 18). */
function totalsFor(lines, taxMode, gstRate = IGST_RATE) {
  const rate = gstRateOf(gstRate);
  const subtotal = round2(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
  const cgst = taxMode === "CGST_SGST" ? round2((subtotal * rate) / 2 / 100) : 0;
  const sgst = taxMode === "CGST_SGST" ? round2((subtotal * rate) / 2 / 100) : 0;
  const igst = taxMode === "IGST" ? round2((subtotal * rate) / 100) : 0;
  const raw = round2(subtotal + cgst + sgst + igst);
  const total = Math.round(raw);
  return { subtotal, cgst, sgst, igst, round_off: round2(total - raw), total };
}

module.exports = {
  HOME_STATE,
  CGST_RATE,
  SGST_RATE,
  IGST_RATE,
  GST_RATES,
  gstRateOf,
  ADJUSTMENTS,
  round2,
  categoryOf,
  taxModeFor,
  lineAmount,
  totalsFor,
  amountInWords,
};
