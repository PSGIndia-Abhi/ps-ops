import { useEffect, useState } from "react";

// The accountant panel covers two businesses, switched from the header:
//   PEST "Pest Control": every customer except Brigade.
//   DEEP "Deep Clean":   only Brigade.
// A customer is Brigade when its name contains "Brigade" (any case).
export const BUSINESSES = [
  { key: "PEST", label: "Pest Control" },
  { key: "DEEP", label: "Deep Clean" },
];

const KEY = "accountant.business";
const EVENT = "accountant-business-change";

export const isBrigade = (customerName) => /brigade/i.test(String(customerName || ""));

// Whether a customer belongs to the chosen business.
export const inBusiness = (business, customerName) => (business === "DEEP" ? isBrigade(customerName) : !isBrigade(customerName));

export function getBusiness() {
  try {
    return localStorage.getItem(KEY) === "DEEP" ? "DEEP" : "PEST";
  } catch {
    return "PEST";
  }
}

export function setBusiness(business) {
  try {
    localStorage.setItem(KEY, business);
  } catch {
    // not remembered across visits, but still switches for this page
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: business }));
}

// The chosen business; every screen using it updates as soon as the header switch changes.
export function useBusiness() {
  const [business, setState] = useState(getBusiness);
  useEffect(() => {
    const onChange = (e) => setState(e.detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [business, setBusiness];
}
