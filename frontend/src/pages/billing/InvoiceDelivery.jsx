import { useEffect, useState } from "react";
import { FiMail, FiPrinter } from "react-icons/fi";
import { billingPut, useBilling } from "./billingApi";
import { deliveryBody, deliveryFrom, deliveryProblem } from "./delivery";
import { Field, Msg } from "./ui";

// Invoice delivery: how many copies are printed and where the invoice is emailed, for the whole
// customer and per outlet, plus the bill-by day. Asked on New Contract (step 1) and edited on the
// contract page (Billing details). Stored on the customer's billing profile
// (PUT /customer-profiles/:companyId/settings), so every contract of the customer uses it.

// Any number of copies; 127 is only the database column's limit (TINYINT), not a business rule.
const MAX_COPIES = 127;
const copiesIn = (v) => (v === "" ? "" : Math.min(MAX_COPIES, Math.max(1, Math.round(Number(v)) || 1)));
// Bill-by day: 1 to 28, so the day exists in every month (February too).
const LAST_DAY = 28;
const DEFAULT_DAY = 25;
const dayIn = (v) => (v === "" ? "" : Math.min(LAST_DAY, Math.max(1, Math.round(Number(v)) || 1)));
const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;

/** The fields only: the parent holds the form and saves it. */
export function DeliveryFields({ form, setForm, outlets = [], readOnly = false }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // Late alert switch: on = a bill-by day is set. Kept apart from the day so clearing the box
  // while typing does not switch it off.
  const [switchedOn, setSwitchedOn] = useState(false);
  const alertOn = switchedOn || Boolean(form.bill_by_day);
  const setAlertOn = setSwitchedOn;
  const day = Number(form.bill_by_day) || 0;
  function toggleAlert() {
    if (alertOn) { setAlertOn(false); set({ bill_by_day: "" }); } else { setAlertOn(true); set({ bill_by_day: day || DEFAULT_DAY }); }
  }
  const setOutlet = (siteId, patch) => setForm((f) => ({ ...f, outlets: f.outlets.map((o) => (o.site_id === siteId ? { ...o, ...patch } : o)) }));
  return (
    <div className="dl-wrap">
      <div className="bl-grid g4">
        <Field label="Print copies" hint="Printed when an invoice is issued">
          {/* − n + : as many copies as needed (Original, Duplicate, Triplicate, then extra copies); typed or stepped */}
          <div className="bl-stp sp-stp dl-copies-stp">
            <button type="button" disabled={readOnly || (Number(form.print_copies) || 1) <= 1} onClick={() => set({ print_copies: Math.max(1, (Number(form.print_copies) || 1) - 1) })} aria-label="Fewer copies">−</button>
            <input type="number" min="1" value={form.print_copies ?? ""} disabled={readOnly} aria-label="Print copies"
              onChange={(e) => set({ print_copies: copiesIn(e.target.value) })}
              onBlur={() => { if (form.print_copies === "") set({ print_copies: 1 }); }} />
            <button type="button" disabled={readOnly || (Number(form.print_copies) || 1) >= MAX_COPIES} onClick={() => set({ print_copies: copiesIn((Number(form.print_copies) || 0) + 1) })} aria-label="More copies">+</button>
          </div>
        </Field>
        <Field label="Email invoice to" className="bl-span2" hint="Separate several addresses with commas">
          <input className="ac-input" type="text" inputMode="email" value={form.invoice_emails} disabled={readOnly} placeholder="accounts@customer.com, manager@customer.com" onChange={(e) => set({ invoice_emails: e.target.value })} />
        </Field>
        {/* Bill by: late alert switch + the day (− n +, typed or stepped). Off hides the day. */}
        <Field label="Bill by (late alert)" hint={alertOn ? (day ? `Late alert after the ${ordinal(day)} · day 1–28` : "Type a day from 1 to 28") : "Off · no late alert"}>
          <div className="dl-billby-line">
            <button type="button" role="switch" aria-checked={alertOn} disabled={readOnly} className={`dl-switch ${alertOn ? "on" : ""}`} onClick={toggleAlert} aria-label="Late alert if not billed by a day" />
            {alertOn && <div className="dl-cal" aria-hidden="true"><small>EVERY MONTH</small><b>{day || "–"}</b></div>}
            {alertOn ? (
              <div className="bl-stp sp-stp dl-copies-stp">
                <button type="button" disabled={readOnly || day <= 1} onClick={() => set({ bill_by_day: Math.max(1, (day || 1) - 1) })} aria-label="Earlier day">−</button>
                <input type="number" min="1" max={LAST_DAY} value={form.bill_by_day ?? ""} disabled={readOnly} aria-label="Bill by day of month"
                  onChange={(e) => set({ bill_by_day: dayIn(e.target.value) })}
                  onBlur={() => { if (form.bill_by_day === "") set({ bill_by_day: DEFAULT_DAY }); }} />
                <button type="button" disabled={readOnly || day >= LAST_DAY} onClick={() => set({ bill_by_day: Math.min(LAST_DAY, day + 1) })} aria-label="Later day">+</button>
              </div>
            ) : <span className="ac-sub">Off</span>}
          </div>
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
                        <input type="number" min="1" className="bl-cell-input" value={f.print_copies ?? 1} disabled={readOnly}
                          onChange={(e) => setOutlet(o.site_id, { print_copies: copiesIn(e.target.value) })}
                          onBlur={() => { if (f.print_copies === "") setOutlet(o.site_id, { print_copies: 1 }); }} aria-label={`Print copies for ${o.name}`} />
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
      {loading && !data && <div className="ac-sub">Loading…</div>}
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
