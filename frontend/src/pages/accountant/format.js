// Formats a number as Indian rupees; shows a dash when there is no value.
export const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
