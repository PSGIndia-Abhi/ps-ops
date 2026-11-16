// Billing periods of a contract.
//
//   AMC        every frequency_months (1, 3, 4, 6, 12) from next_period_start:
//              cycle_start_day 21 + monthly -> 21 Sep - 20 Oct, 21 Oct - 20 Nov, ...
//   TERMITE /  monthly unless frequency_months says otherwise
//   CHEMICAL
//   ONE_TIME   one period: start_date to end_date (or the start date alone)
//
// A period is due for a month when it can be billed by the month end:
//   ARREARS (billed after the period) -> the period has ended by the month end
//   ADVANCE (billed before)           -> the period has started by the month end

const { addDays, addMonths } = require("./common");

const frequencyOf = (contract) => (contract.billing_type === "ONE_TIME" ? null : Number(contract.frequency_months) || 1);

/** The contract's next period { start, end }, or null when the contract has nothing left to bill. */
function nextPeriod(contract) {
  const start = contract.next_period_start;
  if (!start) return null;
  if (contract.end_date && start > contract.end_date) return null;
  if (contract.billing_type === "ONE_TIME") {
    const end = contract.end_date && contract.end_date >= start ? contract.end_date : start;
    return { start, end };
  }
  let end = addDays(addMonths(start, frequencyOf(contract)), -1);
  if (contract.end_date && end > contract.end_date) end = contract.end_date;
  return { start, end };
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

module.exports = { frequencyOf, nextPeriod, periodAfter, isDue };
