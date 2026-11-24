import { Field } from "./ui";

// PO area (Termite): choose square feet or square metre first, then type the area the PO covers.
// The treated area billed on each issued invoice (in that unit) is deducted from it.
// unit: "sq.ft" | "sq.m" | "", area: number | "".

const UNITS = [["sq.ft", "Square feet"], ["sq.m", "Square metre"]];
const short = (u) => (u === "sq.ft" ? "sq. ft" : u === "sq.m" ? "sq. m" : "");

export default function PoAreaField({ unit, area, onChange, disabled = false, hint, className }) {
  return (
    <Field label="PO area" className={className}
      hint={hint || (unit ? `Area in ${short(unit)} · the area billed on each invoice is deducted from it` : "Optional · choose square feet or square metre, then type the area")}>
      <div className="po-area">
        <select className="ac-select" value={unit || ""} disabled={disabled} aria-label="Area unit"
          onChange={(e) => onChange({ po_area_unit: e.target.value, ...(e.target.value ? {} : { po_area: "" }) })}>
          <option value="">No area</option>
          {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="po-area-input">
          <input type="number" min="0" step="0.01" className="ac-input" value={area ?? ""} disabled={disabled || !unit} aria-label="PO area"
            placeholder={unit ? "Enter the area" : "Pick a unit"} onChange={(e) => onChange({ po_area: e.target.value })} />
          {unit && <span>{short(unit)}</span>}
        </div>
      </div>
    </Field>
  );
}
