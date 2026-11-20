// Formatting for the Billing screens (Indian number style, DD-MM-YYYY dates like the printed invoice).

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 176056 -> "1,76,056.00"; null -> "—". */
export const amount = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : inr.format(Number(n)));

/** 176056 -> "₹1,76,056.00". */
export const rupees = (n) => (n === null || n === undefined ? "—" : `₹${amount(n)}`);

/** 3860000 -> "₹38.6L", 420000 -> "₹4.2L", 15257 -> "₹15,257". */
export function rupeesShort(n) {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

/** "2026-11-30" -> "30-11-2026". */
export function dmy(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "—";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-05" -> "05-Nov-26". */
export function shortDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}` : "—";
}

/** "2026-11" or "2026-11-01" -> "November 2026". */
export function monthLabel(value) {
  const m = /^(\d{4})-(\d{2})/.exec(String(value || ""));
  return m ? `${LONG[Number(m[2]) - 1]} ${m[1]}` : "";
}

// Date maths matching the backend (services/billing/common.js, period.js).
const pad2 = (n) => String(n).padStart(2, "0");
function addDaysYmd(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
/** The date in month number `index` (year * 12 + month - 1) on `day`, or that month's last day. */
function onCycleDay(index, day) {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${pad2(m)}-${pad2(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
}

/** Where the period after one starting `from` begins: the next cycle day, then `months - 1` cycles more. */
function nextCycleStart(from, months, cycleDay) {
  const [y, m] = from.split("-").map(Number);
  let index = y * 12 + (m - 1);
  if (onCycleDay(index, cycleDay) <= from) index += 1;
  return onCycleDay(index + months - 1, cycleDay);
}

/**
 * The next period a contract bills and the month whose Bill Run lists it (as period.js decides):
 * in arrears once the period has ended, in advance once it has started. Periods start on the
 * contract's cycle day (cycle_start_day, else the day of its start date).
 * contract: { billing_type, frequency_months, bill_timing, end_date, cycle_start_day, start_date }, from: the period start.
 */
export function nextBilling(contract, from) {
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if (contract.end_date && from > contract.end_date) return null;
  let end;
  if (contract.billing_type === "ONE_TIME") end = contract.end_date && contract.end_date >= from ? contract.end_date : from;
  else {
    const stored = Number(contract.cycle_start_day);
    const startDay = Number(String(contract.start_date || from).slice(8, 10)) || 1;
    const cycleDay = stored >= 1 && stored <= 31 ? stored : startDay;
    end = addDaysYmd(nextCycleStart(from, Number(contract.frequency_months) || 1, cycleDay), -1);
    if (contract.end_date && end > contract.end_date) end = contract.end_date;
  }
  const advance = contract.bill_timing === "ADVANCE";
  return { start: from, end, advance, billMonth: (advance ? from : end).slice(0, 7) };
}

/** A billing period as shown in lists: whole month -> "Nov 2026", else "01-Aug-26 – 31-Oct-26". */
export function periodLabel(start, end) {
  if (!start) return "—";
  const s = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(end || start);
  if (s && e && start === end) return shortDate(start);
  const lastDay = e ? new Date(Number(e[1]), Number(e[2]), 0).getDate() : 0;
  if (s && e && s[3] === "01" && Number(e[3]) === lastDay && s[1] === e[1] && s[2] === e[2]) return `${MONTHS[Number(s[2]) - 1]} ${s[1]}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** This month as "YYYY-MM" (India time). */
export function thisMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date());
}

/** Today as "YYYY-MM-DD" (India time). */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "2026-11" -> "2026-12-01" (first day of the next month). */
export function nextMonthStart(month = thisMonth()) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export const TYPE_LABEL = { AMC: "AMC", ONE_TIME: "One-time", TERMITE: "Termite", CHEMICAL: "Chemical" };
const FREQ = { 1: "Monthly", 3: "Quarterly", 4: "4-monthly", 6: "Half-yearly", 12: "Yearly" };

/** "AMC · Monthly", "Termite", ... */
export function typeLabel(type, frequency) {
  if (type === "AMC" && frequency) return `AMC · ${FREQ[frequency] || `${frequency} months`}`;
  return TYPE_LABEL[type] || type || "—";
}

export const typeClass = (type) => ({ AMC: "b-blue", ONE_TIME: "b-teal", TERMITE: "b-orange", CHEMICAL: "b-purple" })[type] || "b-grey";

export const CATEGORY_LABEL = { COMMERCIAL: "Commercial", RESIDENTIAL: "Residential" };

/** "Chai days Jayanagar" -> "CJ" (for the round initials avatar). */
export const initials = (name) => String(name || "?").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] || "").join("").toUpperCase() || "?";
