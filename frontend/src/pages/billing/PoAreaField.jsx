import { Field } from "./ui";
import { PO_AREA_UNITS, fmtArea } from "./poAreas";

// PO area and rate (Termite): square feet, square meter, or both. Tick a unit, then type the area the
// PO covers and the rate per that unit. The area billed on each issued invoice in that unit is
// deducted from it.
// areas: [{ unit: "sq.ft" | "sq.m", area, rate, used?, balance? }] - only the ticked units.


export default function PoAreaField({ areas = [], onChange, disabled = false, hint, className }) {
  const find = (u) => areas.find((a) => a.unit === u);
  const toggle = (u, on) => onChange(on ? [...areas, { unit: u, area: "", rate: "" }].sort((a, b) => (a.unit < b.unit ? -1 : 1)) : areas.filter((a) => a.unit !== u));
  const set = (u, patch) => onChange(areas.map((a) => (a.unit === u ? { ...a, ...patch } : a)));
  return (
    <Field label="PO area and rate" className={className}
      hint={hint || "Optional · tick square feet, square meter or both, then type the area and the rate per unit. The area billed on each invoice is deducted from it."}>
      <div className="po-areas">
        {PO_AREA_UNITS.map(([u, label, short]) => {
          const row = find(u);
          return (
            <div key={u} className={`po-area ${row ? "on" : ""}`}>
              <label className="po-area-unit">
                <input type="checkbox" className="bl-cb" checked={Boolean(row)} disabled={disabled} onChange={(e) => toggle(u, e.target.checked)} />
                <span>{label}</span>
              </label>
              <div className="po-area-input">
                <input type="number" min="0" step="0.01" className="ac-input" value={row?.area ?? ""} disabled={disabled || !row} aria-label={`Area in ${short}`}
                  placeholder={row ? "Area" : "Tick to add"} onChange={(e) => set(u, { area: e.target.value })} />
                <span>{short}</span>
              </div>
              <div className="po-area-input po-rate-input">
                <i aria-hidden="true">₹</i>
                <input type="number" min="0" step="any" className="ac-input" value={row?.rate ?? ""} disabled={disabled || !row} aria-label={`Rate per ${short}`}
                  placeholder={row ? "Rate" : ""} onChange={(e) => set(u, { rate: e.target.value })} />
                <span>per {short}</span>
              </div>
              {row && row.balance !== undefined && row.balance !== null && (
                <small className={`po-area-left ${row.balance < 0 ? "over" : ""}`}>{fmtArea(row.balance)} {short} left · {fmtArea(row.used || 0)} billed</small>
              )}
            </div>
          );
        })}
      </div>
    </Field>
  );
}
