import { useEffect, useState } from "react";
import { FiMail, FiPrinter } from "react-icons/fi";
import { billingPut, useBilling } from "./billingApi";
import { deliveryBody, deliveryFrom, deliveryProblem } from "./delivery";
import { Field, Msg } from "./ui";
import { RowsSkeleton } from "./Skeletons";

// Invoice delivery: how many copies are printed and where the invoice is emailed, for the whole
// customer and per outlet, plus the bill-by day. Asked on New Contract (step 1) and edited on the
// contract page (Billing details). Stored on the customer's billing profile
// (PUT /customer-profiles/:companyId/settings), so every contract of the customer uses it.

const COPIES = [1, 2, 3, 4];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** The fields only: the parent holds the form and saves it. */
export function DeliveryFields({ form, setForm, outlets = [], readOnly = false }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setOutlet = (siteId, patch) => setForm((f) => ({ ...f, outlets: f.outlets.map((o) => (o.site_id === siteId ? { ...o, ...patch } : o)) }));
  return (
    <div className="dl-wrap">
      <div className="bl-grid g4">
        <Field label="Print copies" hint="Printed when an invoice is issued">
          <div className="dl-copies" role="radiogroup" aria-label="Print copies">
            {COPIES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={Number(form.print_copies) === n} disabled={readOnly}
                className={Number(form.print_copies) === n ? "on" : ""} onClick={() => set({ print_copies: n })}>
                {n}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Email invoice to" className="bl-span2" hint="Separate several addresses with commas">
          <input className="ac-input" type="text" inputMode="email" value={form.invoice_emails} disabled={readOnly} placeholder="accounts@customer.com, manager@customer.com" onChange={(e) => set({ invoice_emails: e.target.value })} />
        </Field>
        <Field label="Bill by (day of month)" hint="Late alert to Accounts after this day">
          <select className="ac-select" value={form.bill_by_day} disabled={readOnly} onChange={(e) => set({ bill_by_day: e.target.value })}>
            <option value="">Not set</option>
            {DAYS.map((d) => <option key={d} value={d}>Day {d}</option>)}
          </select>
        </Field>
      </div>
      <label className={`bl-autoemail ${form.auto_email ? "on" : ""}`}>
        <input type="checkbox" className="bl-cb" checked={form.auto_email} disabled={readOnly} onChange={(e) => set({ auto_email: e.target.checked })} />
        <span>
          <b>Email invoices automatically</b>
          <small>{form.auto_email ? "Each invoice is emailed as soon as it is issued - to the outlet’s emails for per-outlet invoices, else to the addresses above." : "Off - no email is sent on issue. Invoices can still be shared by hand."}</small>
        </span>
      </label>
      {outlets.length > 0 && (
        <details className="dl-outlets">
          <summary>Different copies or email for an outlet? <span className="ac-sub">({outlets.length} outlet{outlets.length === 1 ? "" : "s"})</span></summary>
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>Outlet</th><th style={{ width: 130 }}><FiPrinter aria-hidden="true" /> Copies</th><th><FiMail aria-hidden="true" /> Email invoice to</th></tr></thead>
              <tbody>
                {outlets.map((o) => {
                  const f = form.outlets.find((x) => x.site_id === o.site_id) || {};
                  return (
                    <tr key={o.site_id}>
                      <td data-label="Outlet"><b>{o.name}</b>{o.address && <div className="bl-sub">{o.address}</div>}</td>
                      <td data-label="Copies">
                        <select className="bl-cell-input" value={f.print_copies || 1} disabled={readOnly} onChange={(e) => setOutlet(o.site_id, { print_copies: e.target.value })} aria-label={`Print copies for ${o.name}`}>
                          {COPIES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td data-label="Email"><input className="bl-cell-input" value={f.emails || ""} disabled={readOnly} placeholder="Same as above" onChange={(e) => setOutlet(o.site_id, { emails: e.target.value })} aria-label={`Email for ${o.name}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/** Loads, edits and saves one customer's invoice delivery (the contract page). */
export default function InvoiceDelivery({ companyId, canEdit }) {
  const { data, error, loading } = useBilling(companyId ? `/customer-profiles/${encodeURIComponent(companyId)}` : null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setForm(deliveryFrom(data)); }, [data]);

  async function save() {
    const problem = deliveryProblem(form);
    if (problem) { setMsg({ error: problem }); return; }
    setBusy(true);
    setMsg({});
    try {
      await billingPut(`/customer-profiles/${encodeURIComponent(companyId)}/settings`, deliveryBody(form));
      setMsg({ ok: "Invoice delivery saved." });
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-card">
      <div className="ac-card-head">
        <h3 className="ac-card-title">Invoice delivery</h3>
        <span className="ac-sub" style={{ fontSize: 12 }}>For every invoice of this customer</span>
      </div>
      {loading && !data && <RowsSkeleton rows={2} />}
      <Msg error={error} />
      {data && !data.profile && <div className="ac-info error"><span>Save the Bill To above first, then the print copies and email.</span></div>}
      {form && (
        <>
          <DeliveryFields form={form} setForm={setForm} outlets={data.outlets} readOnly={!canEdit || !data.profile} />
          <Msg {...msg} />
          {canEdit && data.profile && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" className="ac-btn" disabled={busy} onClick={() => { setForm(deliveryFrom(data)); setMsg({}); }}>Reset</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save delivery"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
