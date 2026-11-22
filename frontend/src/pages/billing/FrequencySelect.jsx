import { useBilling } from "./billingApi";

// Billing frequency of a contract: a dropdown of Masters > Billing Frequencies (the active entries).
// A contract's own frequency stays selectable even if it was switched off in the master since.

const label = (m) => `Every ${m} month${Number(m) === 1 ? "" : "s"}`;

export default function FrequencySelect({ value, onChange, disabled = false, oneTime = false }) {
  const { data } = useBilling("/frequencies?active=true");
  const months = (data || []).map((f) => f.months);
  const current = value === "" || value === null || value === undefined ? null : Number(value);

  return (
    <select className="ac-select" value={oneTime ? "" : current ?? ""} disabled={disabled || oneTime} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}>
      {oneTime ? (
        <option value="">Once</option>
      ) : (
        <option value="">{data ? "Choose the frequency…" : "Loading…"}</option>
      )}
      {!oneTime && months.map((m) => <option key={m} value={m}>{label(m)}</option>)}
      {!oneTime && current !== null && !months.includes(current) && <option value={current}>{label(current)}</option>}
    </select>
  );
}
