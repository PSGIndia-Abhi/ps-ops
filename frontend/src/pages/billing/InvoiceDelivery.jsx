import { useEffect, useState } from "react";
import { FiMail, FiPrinter } from "react-icons/fi";
import { billingPut, useBilling } from "./billingApi";
import { deliveryBody, deliveryFrom, deliveryProblem } from "./delivery";
import { Field, Msg } from "./ui";
import { RowsSkeleton } from "./Skeletons";

// Invoice delivery: how many copies are printed and where the invoice is emailed, for the whole
// customer and per outlet. Asked on New Contract (step 1) and edited on the
// contract page (Billing details). Stored on the customer's billing profile
// (PUT /customer-profiles/:companyId/settings), so every contract of the customer uses it.

// Any number of copies (65535 is only the database column's limit, SMALLINT UNSIGNED - not a business rule).
const MAX_COPIES = 65535;
// 0 = nothing is printed when an invoice is issued.
const copiesIn = (v) => (v === "" ? "" : Math.min(MAX_COPIES, Math.max(0, Math.round(Number(v)) || 0)));
/** The fields only: the parent holds the form and saves it. */
// (The "Bill by (late alert)" day was removed: a bill is late once its contract's Bill date passes.)
export function DeliveryFields({ form, setForm, readOnly = false }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // Emails: each part is its own email with its own To and CC; "+ Add email" adds a part
  const parts = form.parts?.length ? form.parts : [{ to: "", cc: "" }];
  const setParts = (list) => set({ parts: list.length ? list : [{ to: "", cc: "" }] });
  const setPart = (i, patch) => setParts(parts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [focusNew, setFocusNew] = useState(false); // focus the To of the part just added
  return (
    <div className="dl-wrap">
      <div className="bl-grid g4">
        <Field label="Print copies" hint={Number(form.print_copies) === 0 ? "0 - not printed when an invoice is issued" : "Printed when an invoice is issued"}>
          {/* − n + : as many copies as needed (Original, Duplicate, Triplicate, then extra copies); typed or stepped */}
          <div className="bl-stp sp-stp dl-copies-stp">
            <button type="button" disabled={readOnly || (Number(form.print_copies) || 0) <= 0} onClick={() => set({ print_copies: Math.max(0, (Number(form.print_copies) || 0) - 1) })} aria-label="Fewer copies">−</button>
            <input type="number" min="0" value={form.print_copies ?? ""} disabled={readOnly} aria-label="Print copies"
              onChange={(e) => set({ print_copies: copiesIn(e.target.value) })}
              onBlur={() => { if (form.print_copies === "") set({ print_copies: 1 }); }} />
            <button type="button" disabled={readOnly || (Number(form.print_copies) || 1) >= MAX_COPIES} onClick={() => set({ print_copies: copiesIn((Number(form.print_copies) || 0) + 1) })} aria-label="More copies">+</button>
          </div>
        </Field>
        <Field label="Email invoice to" className={showAlert ? "bl-span2" : "bl-span3"}
          hint={parts.length > 1 ? `${parts.length} separate emails · each To gets the invoice with only its own CC` : "Several addresses in a box: separate them with commas · + Add email for a separate email"}>
          {/* Each part = one email: its To and its CC */}
          <div className="dl-parts">
            {parts.map((x, i) => (
              <div key={i} className="dl-part">
                {parts.length > 1 && (
                  <div className="dl-part-h">
                    <b>Email {i + 1}</b>
                    {!readOnly && <button type="button" className="dl-cc-rm" aria-label={`Remove email ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                )}
                <div className="dl-cc">
                  <span>To</span>
                  <input className="ac-input" type="text" inputMode="email" value={x.to} disabled={readOnly} placeholder="accounts@customer.com" aria-label={`Email ${i + 1} To`}
                    autoFocus={focusNew && i === parts.length - 1 && !x.to}
                    onChange={(e) => setPart(i, { to: e.target.value })} />
                </div>
                <div className="dl-cc">
                  <span>CC</span>
                  <input className="ac-input" type="text" inputMode="email" value={x.cc} disabled={readOnly} placeholder="manager@customer.com (optional)" aria-label={`Email ${i + 1} CC`}
                    onChange={(e) => setPart(i, { cc: e.target.value })} />
                </div>
              </div>
            ))}
            {!readOnly && parts.length < 10 && (
              <button type="button" className="dl-part-add" onClick={() => { setFocusNew(true); setParts([...parts, { to: "", cc: "" }]); }}>+ Add email (To + CC)</button>
            )}
          </div>
        </Field>
      </div>
      <label className={`bl-autoemail ${form.auto_email ? "on" : ""}`}>
        <input type="checkbox" className="bl-cb" checked={form.auto_email} disabled={readOnly} onChange={(e) => set({ auto_email: e.target.checked })} />
        <span>
          <b>Email invoices automatically</b>
          <small>{form.auto_email ? "Each invoice is emailed to the addresses above as soon as it is issued." : "Off - no email is sent on issue. Invoices can still be shared by hand."}</small>
        </span>
      </label>
    </div>
  );
}

/** Loads, edits and saves one customer's invoice delivery (the contract page). */
export default function InvoiceDelivery({ companyId, canEdit }) {
  const { data, error, loading } = useBilling(companyId ? `/customer-profiles/${encodeURIComponent(companyId)}` : null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  // The last saved settings: Save / Reset are active only when the form differs from them.
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (!data) return;
    const f = deliveryFrom(data);
    setForm(f);
    setSaved(f);
  }, [data]);
  const sameAs = (a, b) => {
    try { return JSON.stringify(deliveryBody(a)) === JSON.stringify(deliveryBody(b)); } catch { return false; }
  };
  const dirty = Boolean(form && saved) && !sameAs(form, saved);
  // editing again clears the "saved" message
  const edit = (next) => {
    setForm(next);
    if (msg.ok) setMsg({});
  };

  async function save() {
    const problem = deliveryProblem(form);
    if (problem) { setMsg({ error: problem }); return; }
    setBusy(true);
    setMsg({});
    try {
      await billingPut(`/customer-profiles/${encodeURIComponent(companyId)}/settings`, deliveryBody(form));
      setSaved(form);
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
          <DeliveryFields form={form} setForm={edit} readOnly={!canEdit || !data.profile} />
          <Msg {...msg} />
          {canEdit && data.profile && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" className="ac-btn" disabled={busy || !dirty} onClick={() => { setForm(saved); setMsg({}); }}>Reset</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save delivery"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
