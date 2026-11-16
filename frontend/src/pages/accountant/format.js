// Formats a number as Indian rupees, rounded off to the nearest rupee (₹14,159.50 -> ₹ 14,160);
// shows a dash when there is no value. Only the display is rounded: the amounts saved and
// added up stay exact. `|| 0` keeps a tiny negative (-0.3) from showing as "-0".
export const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : `₹ ${(Math.round(Number(n)) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
