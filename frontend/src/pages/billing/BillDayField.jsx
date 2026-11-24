import { Field } from "./ui";

// Bill date of a contract: the day of the month its bill is raised (1-31, typed or stepped like the
// late alert day on Print & email). The Bill Run dates the invoice on that day of the
// bill month (its last day in a shorter month), or today when the day is still to come.
// Empty day: dated the day the Bill Run makes the invoice (as before).

const LAST_BILL_DAY = 31;
const dayIn = (v) => (v === "" || v === null || v === undefined ? "" : Math.min(LAST_BILL_DAY, Math.max(1, Math.round(Number(v)) || 1)));
const ordinalDay = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;


export default function BillDayField({ day, onDay, disabled = false }) {
  const n = Number(day) || 0;
  const hint = n
    ? `Invoice dated the ${ordinalDay(n)} of the month${n > 28 ? " (or the month's last day)" : ""} · day 1–31`
    : "Type a day from 1 to 31. Empty: dated the day the Bill Run makes the invoice";
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
