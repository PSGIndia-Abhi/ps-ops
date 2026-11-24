// "Service Offered To" on the customer's billing details (New Contract step 1 and the contract page's
// Billing details): ticked, a different address is typed here and printed under "Service Offered To"
// on the invoices instead of the outlet / billing address. Unticked, the box is closed (not saved).
// Laid out like a form field (label, box, hint) so it sits beside the Billing address.

export default function ServiceToField({ on, value, onToggle, onChange, disabled = false, className = "" }) {
  return (
    <div className={`ac-field bl-svcto ${on ? "on" : ""} ${className}`}>
      <label className="bl-svcto-label">
        <input type="checkbox" className="bl-cb" checked={on} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
        Service Offered To
      </label>
      <textarea
        className="ac-textarea"
        rows={3}
        maxLength={1000}
        disabled={disabled || !on}
        value={value}
        placeholder={on ? "One line per row, e.g. the site where the service is done" : "Tick Service Offered To to type an address"}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Service Offered To address"
      />
      <span className="bl-sub" style={{ color: "#64748b", fontSize: 12 }}>
        {on ? "Printed under “Service Offered To” on the invoices" : "Optional · a different address for “Service Offered To” on the invoices"}
      </span>
    </div>
  );
}
