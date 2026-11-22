import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { billingPost, billingPut, useBilling } from "./billingApi";
import { Msg, BackButton } from "./ui";

// Masters > Invoice Descriptions: the wordings a contract can print as its "Description on invoice".
// {month}, {period}, {from_month} and {to_month} are filled in on each invoice. A description that is
// switched off can no longer be picked; contracts already using it keep it.

const PLACEHOLDERS = [
  ["{month}", "the month, e.g. November 2026"],
  ["{period}", "the period dates, e.g. 01-11-2026 to 30-11-2026"],
  ["{from_month}", "the first month of the period"],
  ["{to_month}", "the last month of the period"],
];
const EXAMPLE = { "{month}": "November 2026", "{period}": "01-11-2026 to 30-11-2026", "{from_month}": "November 2026", "{to_month}": "January 2027" };
const preview = (text) => String(text || "").replace(/\{(month|period|from_month|to_month)\}/g, (m) => EXAMPLE[m]);

export default function InvoiceDescriptions() {
  const { me } = useOutletContext();
  const canEdit = me.can("MANAGE_BILLING_MASTERS");
  const { data, error, loading, reload } = useBilling("/descriptions");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null); // { id, text }
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

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
  const add = async () => (await run(() => billingPost("/descriptions", { text }), "Description added.")) && setText("");
  const saveEdit = async () => (await run(() => billingPut(`/descriptions/${editing.id}`, { text: editing.text }), "Description saved.")) && setEditing(null);
  const toggle = (d) => run(() => billingPut(`/descriptions/${d.id}`, { is_active: !d.is_active }), d.is_active ? "Switched off: it can no longer be chosen." : "Switched on.");
  const insert = (p) => (editing ? setEditing({ ...editing, text: `${editing.text}${p}` }) : setText(`${text}${p}`));

  return (
    <div className="ac-page nc-page">
      <div className="ac-head">
        <div>
          <div className="bl-backrow"><BackButton to="/billing/masters" label="Masters" /></div>
          <h1 className="ac-title">Invoice Descriptions</h1>
        </div>
      </div>

      {canEdit && (
        <div className="ac-card">
          <h3 className="ac-card-title">Add a description</h3>
          <div className="nc-po-pick" style={{ marginBottom: 6 }}>
            <input className="ac-input" style={{ flex: "1 1 360px" }} value={text} maxLength={500} placeholder="e.g. Pest control services for the month of {month}" onChange={(e) => setText(e.target.value)} />
            <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !text.trim()} onClick={add}>+ Add</button>
          </div>
          <div className="bl-chipbar">
            {PLACEHOLDERS.map(([p, meaning]) => <button key={p} type="button" className="bl-chip" title={meaning} onClick={() => insert(p)}>{p}</button>)}
          </div>
          {text.trim() && <p className="ac-sub" style={{ margin: "8px 0 0" }}>On the invoice: “{preview(text)}”</p>}
        </div>
      )}

      <Msg {...msg} />
      <div className="ac-card">
        <Msg error={error} />
        <table className="ac-table ac-stack">
          <thead><tr><th>Description</th><th className="ac-num">Contracts</th><th>Status</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {loading || !data?.length ? <EmptyRow cols={canEdit ? 4 : 3} loading={loading} text="No descriptions yet." /> : data.map((d) => (
              <tr key={d.id} style={d.is_active ? undefined : { opacity: 0.6 }}>
                <td>
                  {editing?.id === d.id ? (
                    <>
                      <input className="ac-input" value={editing.text} maxLength={500} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                      <div className="bl-sub">On the invoice: “{preview(editing.text)}”{d.contracts ? ` · also changes it on ${d.contracts} contract(s)` : ""}</div>
                    </>
                  ) : (
                    <>
                      <b>{d.text}</b>
                      <div className="bl-sub">e.g. “{preview(d.text)}”</div>
                    </>
                  )}
                </td>
                <td className="bl-num">{d.contracts}</td>
                <td><span className={`ac-badge ${d.is_active ? "b-green" : "b-grey"}`}>{d.is_active ? "In use" : "Switched off"}</span></td>
                {canEdit && (
                  <td>
                    <div className="ac-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      {editing?.id === d.id ? (
                        <>
                          <button type="button" className="ac-btn sm ac-btn-primary" disabled={busy || !editing.text.trim()} onClick={saveEdit}>Save</button>
                          <button type="button" className="ac-btn sm" onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="ac-btn sm" onClick={() => setEditing({ id: d.id, text: d.text })}>Edit</button>
                          <button type="button" className="ac-btn sm" disabled={busy} onClick={() => toggle(d)}>{d.is_active ? "Switch off" : "Switch on"}</button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
