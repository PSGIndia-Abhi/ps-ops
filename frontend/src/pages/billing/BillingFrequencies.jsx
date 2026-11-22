import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, useBilling } from "./billingApi";
import { Msg, BackButton } from "./ui";

// Masters > Billing Frequencies: the "every N months" choices (1 to 12) a contract can pick as its
// billing frequency. A frequency that is switched off can no longer be picked; contracts already on
// it keep it.

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function BillingFrequencies() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const { data, error, loading, reload } = useBilling("/frequencies");
  const [months, setMonths] = useState("");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  // Months not in the list yet, or switched off (adding one switches it on again).
  const active = new Set((data || []).filter((f) => f.is_active).map((f) => f.months));
  const addable = MONTHS.filter((m) => !active.has(m));

  async function run(fn, ok) {
    setBusy(true);
    setMsg({});
    try {
      await fn();
      setMsg({ ok });
      reload();
      return true;
    } catch (err) {
      setMsg({ error: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const add = async () => (await run(() => billingPost("/frequencies", { months: Number(months) }), "Billing frequency added.")) && setMonths("");
  const toggle = (f) => run(() => billingPut(`/frequencies/${f.months}`, { is_active: !f.is_active }), f.is_active ? "Switched off: it can no longer be chosen." : "Switched on.");

  return (
    <div className="ac-page nc-page">
      <div className="ac-head">
        <div>
          <div className="bl-backrow"><BackButton to="/billing/masters" label="Masters" /><div className="ac-crumb"><button type="button" onClick={() => navigate("/billing/masters")}>Masters</button> / Billing Frequencies</div></div>
          <h1 className="ac-title">Billing Frequencies</h1>
          <p className="ac-sub">How often a contract can be billed. Each contract picks one in its Billing frequency.</p>
        </div>
      </div>

      {canEdit && (
        <div className="ac-card">
          <h3 className="ac-card-title">Add a frequency</h3>
          <div className="nc-po-pick" style={{ marginBottom: 0 }}>
            <select className="ac-select" style={{ flex: "1 1 260px" }} value={months} onChange={(e) => setMonths(e.target.value)} disabled={!data || !addable.length}>
              <option value="">{!data ? "Loading…" : addable.length ? "Choose the number of months…" : "Every month from 1 to 12 is already in the list"}</option>
              {addable.map((m) => (
                <option key={m} value={m}>
                  Every {m} month{m === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !months} onClick={add}>
              + Add
            </button>
          </div>
        </div>
      )}

      <Msg {...msg} />
      <div className="ac-card">
        <Msg error={error} />
        <table className="ac-table ac-stack">
          <thead>
            <tr>
              <th>Billing frequency</th>
              <th className="ac-num">Contracts</th>
              <th>Status</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {loading || !data?.length ? (
              <EmptyRow cols={canEdit ? 4 : 3} loading={loading} text="No billing frequencies yet." />
            ) : (
              data.map((f) => (
                <tr key={f.months} style={f.is_active ? undefined : { opacity: 0.6 }}>
                  <td>
                    <b>{f.label}</b>
                  </td>
                  <td className="bl-num">{f.contracts}</td>
                  <td>
                    <span className={`ac-badge ${f.is_active ? "b-green" : "b-grey"}`}>{f.is_active ? "In use" : "Switched off"}</span>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="ac-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button type="button" className="ac-btn sm" disabled={busy} onClick={() => toggle(f)}>
                          {f.is_active ? "Switch off" : "Switch on"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
