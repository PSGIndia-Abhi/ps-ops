import { useState } from "react";
import { Field } from "./ui";

// Bill by (late alert): a switch and the day of the month (1-30, − n + typed or stepped). Off = no
// late alert (value ""). In a shorter month (February) a day past its end gives no late alert that
// month (the next month still shows the invoice as late). Saved with the customer's invoice delivery
// settings (bill_by_day).

const LAST_DAY = 30;
const DEFAULT_DAY = 25;
const dayIn = (v) => (v === "" ? "" : Math.min(LAST_DAY, Math.max(1, Math.round(Number(v)) || 1)));
const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;

export default function LateAlertField({ value, onChange, readOnly = false, className }) {
  // Kept apart from the day so clearing the box while typing does not switch it off.
  const [switchedOn, setSwitchedOn] = useState(false);
  const alertOn = switchedOn || Boolean(value);
  const day = Number(value) || 0;
  function toggle() {
    if (alertOn) { setSwitchedOn(false); onChange(""); } else { setSwitchedOn(true); onChange(day || DEFAULT_DAY); }
  }
  return (
    <Field label="Bill by (late alert)" className={className} hint={alertOn ? (day ? `Late alert after the ${ordinal(day)} · day 1–30` : "Type a day from 1 to 30") : "Off · no late alert"}>
      <div className="dl-billby-line">
        <button type="button" role="switch" aria-checked={alertOn} disabled={readOnly} className={`dl-switch ${alertOn ? "on" : ""}`} onClick={toggle} aria-label="Late alert if not billed by a day" />
        {alertOn && <div className="dl-cal" aria-hidden="true"><small>EVERY MONTH</small><b>{day || "–"}</b></div>}
        {alertOn ? (
          <div className="bl-stp sp-stp dl-copies-stp">
            <button type="button" disabled={readOnly || day <= 1} onClick={() => onChange(Math.max(1, (day || 1) - 1))} aria-label="Earlier day">−</button>
            <input type="number" min="1" max={LAST_DAY} value={value ?? ""} disabled={readOnly} aria-label="Bill by day of month"
              onChange={(e) => onChange(dayIn(e.target.value))}
              onBlur={() => { if (value === "") onChange(DEFAULT_DAY); }} />
            <button type="button" disabled={readOnly || day >= LAST_DAY} onClick={() => onChange(Math.min(LAST_DAY, day + 1))} aria-label="Later day">+</button>
          </div>
        ) : <span className="ac-sub">Off</span>}
      </div>
    </Field>
  );
}
