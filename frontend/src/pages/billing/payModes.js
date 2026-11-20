// How a payment was made (Record payment form and the payment list on the invoice page).
export const PAY_MODES = [
  ["NEFT", "NEFT"], ["RTGS", "RTGS"], ["IMPS", "IMPS"], ["UPI", "UPI"],
  ["CHEQUE", "Cheque"], ["DD", "Demand draft"], ["CASH", "Cash"], ["OTHER", "Other"],
];

/** "NEFT", "Cheque", or what was typed for "Other". */
export const modeLabel = (p) => (p.mode === "OTHER" ? p.mode_other || "Other" : (PAY_MODES.find(([v]) => v === p.mode) || [p.mode, p.mode])[1]);
