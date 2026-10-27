import { formatInr, gstOn } from "./brigadeShared";

// The PO-match message (from poMatch() or an invoice check): green when the services match the
// PO, blue for information, amber when something doesn't add up. It never blocks anything.
export function PoCheck({ check, className = "" }) {
  if (!check) return null;
  return (
    <div className={`bgc-check ${check.tone} ${className}`} role={check.tone === "warn" ? "alert" : "status"}>
      <span className="bgc-check-icon" aria-hidden="true">
        {check.tone === "ok" ? "✓" : check.tone === "warn" ? "!" : "i"}
      </span>
      <div>
        <strong>{check.title}</strong>
        {check.text && <p>{check.text}</p>}
      </div>
    </div>
  );
}

// Service value -> CGST 9% + SGST 9% -> total incl. GST, as definition-list rows.
export function GstRows({ value, label = "Services (excl. GST)", totalLabel = "Total incl. GST" }) {
  const t = gstOn(value);
  return (
    <>
      <div className="bgc-row"><dt>{label}</dt><dd>{formatInr(t.base)}</dd></div>
      <div className="bgc-row muted"><dt>CGST 9%</dt><dd>{formatInr(t.cgst)}</dd></div>
      <div className="bgc-row muted"><dt>SGST 9%</dt><dd>{formatInr(t.sgst)}</dd></div>
      <div className="bgc-row strong"><dt>{totalLabel}</dt><dd>{formatInr(t.total)}</dd></div>
    </>
  );
}
