// Billing periods of a contract.
//
//   AMC        every frequency_months (1-12, from Masters > Billing Frequencies). Periods start on
//              the contract's cycle day (cycle_start_day, by default the day of the start date):
//              cycle day 21 + monthly -> 21 Sep - 20 Oct, 21 Oct - 20 Nov, ...
//              A cycle day past the month's end starts on the last day of that month and goes back
//              to the cycle day the month after: cycle day 31 -> 31 Jan - 27 Feb, 28 Feb - 30 Mar,
//              31 Mar - 29 Apr, ... (it never drifts to the 28th for good).
//              A first period that does not start on the cycle day (e.g. "first bill from" a date in
//              the middle of a cycle) runs to the next cycle day, then the periods are regular.
//   TERMITE /  monthly unless frequency_months says otherwise. A Termite contract can also be billed
//   CHEMICAL   weekly (frequency_unit WEEK: 7-day periods from the first bill date) or daily (DAY:
//              one-day periods); each such period is its own invoice, and the month's Bill Run
//              drafts every one of them that is due (see duePeriods).
//   ONE_TIME   one period: start_date to end_date (or the start date alone)
//
// A period is due for a month when it can be billed by the month end:
//   ARREARS (billed after the period) -> the period has ended by the month end
//   ADVANCE (billed before)           -> the period has started by the month end

const { addDays } = require("./common");

const pad = (n) => String(n).padStart(2, "0");
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The date in month number `index` (year * 12 + month - 1) on `day`, or that month's last day. */
function onCycleDay(index, day) {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

const frequencyOf = (contract) => (contract.billing_type === "ONE_TIME" ? null : Number(contract.frequency_months) || 1);

/** MONTH, WEEK or DAY. Weekly / daily billing is for Termite contracts only; anything else is MONTH. */
const unitOf = (contract) =>
  contract.billing_type === "TERMITE" && (contract.frequency_unit === "WEEK" || contract.frequency_unit === "DAY") ? contract.frequency_unit : "MONTH";

/** Several invoices per month (one per week / day)? */
const isShortPeriod = (contract) => unitOf(contract) !== "MONTH";

/** The contract's cycle day (1-31): cycle_start_day, else the day of its start date. */
function cycleDayOf(contract, start) {
  const day = Number(contract.cycle_start_day);
  if (day >= 1 && day <= 31) return day;
  const from = contract.start_date || start;
  return from ? Number(String(from).slice(8, 10)) || 1 : 1;
}

/** The first cycle-day date after `start`, then `months - 1` cycles more: where the next period starts. */
function nextCycleStart(start, months, cycleDay) {
  const [y, m] = start.split("-").map(Number);
  let index = y * 12 + (m - 1);
  if (onCycleDay(index, cycleDay) <= start) index += 1;
  return onCycleDay(index + months - 1, cycleDay);
}

/** The contract's next period { start, end }, or null when the contract has nothing left to bill. */
function nextPeriod(contract) {
  return periodFrom(contract, contract.next_period_start);
}

/** The period starting on `start` { start, end }, or null when it is past the contract end. */
function periodFrom(contract, start) {
  if (!start) return null;
  if (contract.end_date && start > contract.end_date) return null;
  if (contract.billing_type === "ONE_TIME") {
    const end = contract.end_date && contract.end_date >= start ? contract.end_date : start;
    return { start, end };
  }
  const unit = unitOf(contract);
  let end =
    unit === "DAY" ? start
      : unit === "WEEK" ? addDays(start, 6)
        : addDays(nextCycleStart(start, frequencyOf(contract), cycleDayOf(contract, start)), -1);
  if (contract.end_date && end > contract.end_date) end = contract.end_date;
  return { start, end };
}

/**
 * Every period of a weekly / daily contract due by `monthEnd`, from its next period on (at most
 * `limit`). A monthly contract has one: its next period, if due.
 */
function duePeriods(contract, monthEnd, limit = 62) {
  const out = [];
  let period = nextPeriod(contract);
  while (period && isDue(contract, period, monthEnd) && out.length < limit) {
    out.push(period);
    if (!isShortPeriod(contract)) break;
    period = periodFrom(contract, periodAfter(contract, period));
  }
  return out;
}

/** The start of the period after `period` (what next_period_start becomes once it is billed). */
function periodAfter(contract, period) {
  return addDays(period.end, 1);
}

/** Can `period` be billed in the month ending `monthEnd`? */
function isDue(contract, period, monthEnd) {
  if (!period) return false;
  return contract.bill_timing === "ADVANCE" ? period.start <= monthEnd : period.end <= monthEnd;
}

module.exports = { frequencyOf, unitOf, isShortPeriod, cycleDayOf, nextPeriod, periodFrom, duePeriods, periodAfter, isDue };
