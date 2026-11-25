import { useEffect, useState } from "react";
import { ApiError, billingGet, billingPut } from "./billingApi";
import { CATEGORY_LABEL } from "./format";
import { Field, Msg } from "./ui";
import { STATES } from "./states";
import ServiceToField from "./ServiceToField";

// Billing details of a customer (its billing profile): bill-to name, address, GSTIN, GST state and
// payment terms. Shown on the contract page; a customer without them cannot be invoiced. They belong
// to the customer, so every contract of the customer uses the same details.
// customer: a row of GET /customers (company_id, name, display_name, category, gst_number, active_contracts).
// group: { group_id, name, companies } for a group based contract - the card then shows and saves the
// group's Bill To (the same details as New Contract step 1), billed in the group's name.

const blank = (customer) => ({ billing_name: customer.display_name || "", billing_address: "", state_code: "29", payment_terms_days: 30, is_active: true, gst_number: customer.gst_number || "", isNew: true });
const stateName = (code) => STATES.find(([c]) => c === code)?.[1] || "";

export default function BillingProfileCard({ customer, canEdit, onSaved, group = null }) {
  const url = group ? `/group-profiles/${encodeURIComponent(group.group_id)}` : `/profiles/${encodeURIComponent(customer.company_id)}`;
  const [loaded, setLoaded] = useState(null);
  const [edits, setEdits] = useState(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setEdits(null);
    billingGet(url)
      .catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err)))
      .then((p) => {
        if (!live) return;
        setLoaded(p ? (group ? { ...p, billing_name: group.name } : p) : group ? { ...blank(customer), billing_name: group.name, gst_number: "" } : blank(customer));
        setEditing(!p); // missing: open the form straight away
      })
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
  }, [customer, url]);

  const form = edits || loaded;
  const set = (patch) => setEdits({ ...form, ...patch });
  const commercial = customer.category === "COMMERCIAL";
  // Service Offered To ticked: from the saved address until the tick is changed.
  const serviceToOn = form ? (form.service_to_on ?? Boolean(form.service_offered_to)) : false;
  const others = group ? 0 : Math.max(0, Number(customer.active_contracts || 0) - 1);

  async function save() {
    if (serviceToOn && !(form.service_offered_to || "").trim()) {
      setMsg({ error: "Type the Service Offered To address, or untick it." });
      return;
    }
    setBusy(true);
    setMsg({});
    try {
      const saved = await billingPut(url, {
        billing_name: form.billing_name, billing_address: form.billing_address, state_code: form.state_code,
        payment_terms_days: Number(form.payment_terms_days) || 0, is_active: form.is_active,
        gst_number: (form.gst_number || "").trim().toUpperCase(),
        // Service Offered To: the customer's own, or the group's for a group contract
        service_offered_to: serviceToOn ? (form.service_offered_to || "").trim() : null,
      });
      setLoaded(saved);
      setEdits(null);
      setEditing(false);
      setMsg({ ok: "Billing details saved." });
      onSaved?.();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setEdits(null);
    setMsg({});
    if (!loaded?.isNew) setEditing(false);
  }

  return (
    <div className="ac-card" id="billing-details">
      <div className="bl-panel-title">
        <div>
          <h3 className="ac-card-title" style={{ margin: 0 }}>{group ? "Group billing details" : "Billing details"}</h3>
          <div className="ac-sub" style={{ fontSize: 12.5 }}>
            {customer.category ? `${CATEGORY_LABEL[customer.category]} · ${commercial ? "billed with GST" : "billed without GST"}` : "Customer type not set"}
            {group && ` · one Bill To for the group ${group.name}${group.companies ? ` (${group.companies} compan${group.companies === 1 ? "y" : "ies"})` : ""}`}
            {others > 0 && ` · shared by ${others + 1} contracts of this customer`}
          </div>
        </div>
        {form && !editing && canEdit && (
          <button type="button" className="ac-btn sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {!customer.category && <div className="bl-msg err" style={{ marginBottom: 12 }}>Set the customer type (Corporate / Individual / RWA) on the customer first; it decides whether GST applies.</div>}
      {!form ? (
        <div className="ac-sub">{msg.error ? "" : "Loading…"}</div>
      ) : !editing ? (
        <dl className="bl-kv">
          <dt>Bill To</dt>
          <dd>
            <b>{form.billing_name}</b>
            <div className="bl-addr">{form.billing_address}</div>
          </dd>
          {form.service_offered_to && (
            <>
              <dt>Service Offered To</dt>
              <dd><div className="bl-addr">{form.service_offered_to}</div></dd>
            </>
          )}
          <dt>GSTIN</dt>
          <dd>{form.gst_number || <span className="ac-sub">{commercial ? "Missing" : "Not needed (Residential)"}</span>}</dd>
          <dt>State</dt>
          <dd>
            {form.state_code} – {stateName(form.state_code)} <span className="ac-sub">· {form.state_code === "29" ? "CGST + SGST" : "IGST"}</span>
          </dd>
          <dt>Payment terms</dt>
          <dd>{Number(form.payment_terms_days) ? `${form.payment_terms_days} days` : "Due on the invoice date"}</dd>
          <dt>Status</dt>
          <dd>{form.is_active ? <span className="ac-badge b-green">Active</span> : <span className="ac-badge b-grey">Inactive (cannot be invoiced)</span>}</dd>
        </dl>
      ) : (
        <div className="bl-grid">
          {form.isNew && <div className="bl-msg err">{group ? "This group has no billing details yet, so its contract cannot be invoiced. Fill them in and save." : "This customer has no billing details yet, so it cannot be invoiced. Fill them in and save."}</div>}
          <div className="bl-grid g2">
            <Field label="Billing name" required hint={group ? "The group name: a group contract is billed in the group's name" : undefined}>
              <input className="ac-input" value={form.billing_name} disabled={!canEdit || Boolean(group)} maxLength={255} placeholder="No display name set for this customer. Type the billing name" onChange={(e) => set({ billing_name: e.target.value })} />
            </Field>
            <Field label="GSTIN" required={commercial} hint={customer.category === "RESIDENTIAL" ? "Residential customers are billed without GST; leave blank" : "15 characters, e.g. 29ABCDE1234F1Z5. The state follows its first 2 digits."}>
              <input
                className="ac-input"
                value={form.gst_number || ""}
                disabled={!canEdit}
                maxLength={15}
                placeholder="e.g. 29ABCDE1234F1Z5"
                style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
                onChange={(e) => {
                  const gst = e.target.value.replace(/\s+/g, "").toUpperCase();
                  const code = gst.slice(0, 2);
                  set({ gst_number: gst, ...(/^\d{2}$/.test(code) && STATES.some(([c]) => c === code) ? { state_code: code } : {}) });
                }}
              />
            </Field>
          </div>
          {/* Billing address and Service Offered To side by side. */}
          <div className="bl-grid g2">
            <Field label="Billing address" required>
              <textarea className="ac-textarea" rows={3} value={form.billing_address} disabled={!canEdit} maxLength={1000} onChange={(e) => set({ billing_address: e.target.value })} placeholder="One line per row, as printed under Bill To" />
            </Field>
            <ServiceToField disabled={!canEdit} on={serviceToOn} value={form.service_offered_to || ""}
              onToggle={(v) => set({ service_to_on: v })} onChange={(v) => set({ service_offered_to: v })} />
          </div>
          <div className="bl-grid g2">
            <Field label="State (GST)" required hint={form.state_code === "29" ? "Karnataka: CGST + SGST" : "Outside Karnataka: IGST"}>
              <select className="ac-select" value={form.state_code} disabled={!canEdit} onChange={(e) => set({ state_code: e.target.value })}>
                {STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} – {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment terms (days)" hint="Due date = invoice date + these days">
              <input type="number" min="0" max="365" className="ac-input" value={form.payment_terms_days} disabled={!canEdit} onChange={(e) => set({ payment_terms_days: e.target.value })} />
            </Field>
          </div>
          {!group && (
            <label className="bl-toggle">
              <input type="checkbox" checked={Boolean(form.is_active)} disabled={!canEdit} onChange={(e) => set({ is_active: e.target.checked })} /> Active (can be invoiced)
            </label>
          )}
          {group && <div className="ac-sub" style={{ fontSize: 12.5 }}>These details are the group&apos;s: saving changes the Bill To of every contract of {group.name}. The companies&apos; own billing details are not used.</div>}
          {others > 0 && <div className="ac-sub" style={{ fontSize: 12.5 }}>These details are the customer&apos;s: saving changes them for all {others + 1} of its contracts.</div>}
          <Msg {...msg} />
          {canEdit && (
            <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
              {!form.isNew && (
                <button type="button" className="ac-btn" disabled={busy} onClick={cancel}>
                  Cancel
                </button>
              )}
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (!edits && !form.isNew) || !form.billing_name?.trim() || !form.billing_address?.trim() || (commercial && !(form.gst_number || "").trim())} onClick={save}>
                {busy ? "Saving…" : "Save billing details"}
              </button>
            </div>
          )}
        </div>
      )}
      {!editing && <Msg {...msg} />}
    </div>
  );
}
