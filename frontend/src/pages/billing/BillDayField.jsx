import { Field } from "./ui";

// Bill date of a contract: the day of the month its bill is raised (1-31). A period billed after it
// ends is billed on that day once the period is over - usually the next month (November services,
// day 10 -> 10 Dec); billed in advance, on that day of the period's first month. A day past a month's
// end is its last day. The Bill Run's Date view lists the bill on that date and marks it missed after;
// the SOS of a month is due the same day. The invoice is dated the day it is issued (issue.service.js).

const LAST_BILL_DAY = 31;
const dayIn = (v) => (v === "" || v === null || v === undefined ? "" : Math.min(LAST_BILL_DAY, Math.max(1, Math.round(Number(v)) || 1)));
const ordinalDay = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;


export default function BillDayField({ day, onDay, disabled = false }) {
  const n = Number(day) || 0;
  const hint = n
    ? n >= 28
      ? `Billed on the ${ordinalDay(n)} (or the month's last day) once the period is over · day 1–31`
      : `Billed on the ${ordinalDay(n)} of the next month, after the services (e.g. Nov services → ${n} Dec) · day 1–31`
    : "Day to raise the bill (1 to 31). Empty: no bill date - never marked missed";
  return (
    <Field label="Bill date" hint={hint}>
      <div className="nc-billday">
        <div className="dl-cal" aria-hidden="true"><small>EVERY MONTH</small><b>{n || "–"}</b></div>
        <div className="bl-stp sp-stp dl-copies-stp">
          <button type="button" disabled={disabled || n <= 1} onClick={() => onDay(Math.max(1, (n || 2) - 1))} aria-label="Earlier day">−</button>
          <input type="number" min="1" max={LAST_BILL_DAY} value={day ?? ""} disabled={disabled} aria-label="Bill day of the month" placeholder="Day"
            onChange={(e) => onDay(dayIn(e.target.value))} />
          <button type="button" disabled={disabled || n >= LAST_BILL_DAY} onClick={() => onDay(Math.min(LAST_BILL_DAY, n + 1))} aria-label="Later day">+</button>
        </div>
      </div>
    </Field>
  );
}
