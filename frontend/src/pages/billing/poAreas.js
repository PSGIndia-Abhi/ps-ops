// PO area and rate helpers (Termite POs: sq. ft / sq. m, each with its area and rate). Used by
// PoAreaField, New Contract and Purchase Orders.

export const PO_AREA_UNITS = [["sq.ft", "Square feet", "sq. ft"], ["sq.m", "Square meter", "sq. m"]];
const shortOf = (u) => PO_AREA_UNITS.find(([v]) => v === u)?.[2] || "";

export const fmtArea = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The first problem with the ticked areas ("" when fine). */
export function poAreasProblem(areas = []) {
  for (const a of areas) {
    const s = shortOf(a.unit);
    if (!(Number(a.area) > 0)) return `Type the PO area in ${s}, or untick it.`;
    if (!(Number(a.rate) > 0)) return `Type the rate per ${s}, or untick it.`;
  }
  return "";
}

/** The body for the API: [{ unit, area, rate }]. */
export const poAreasBody = (areas = []) => areas.map((a) => ({ unit: a.unit, area: Number(a.area), rate: Number(a.rate) }));

/** "2,500 sq. ft @ ₹42 · 300 sq. m @ ₹450" - for lists. */
export const poAreasText = (areas = [], { left = false } = {}) =>
  areas.map((a) => `${fmtArea(left ? a.balance : a.area)}${left ? ` of ${fmtArea(a.area)}` : ""} ${shortOf(a.unit)}${left ? " left" : ` @ ₹${fmtArea(a.rate)}`}`).join(" · ");
