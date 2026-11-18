import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { ApiError, billingGet, billingPut, qs, useBilling } from "./billingApi";
import { CATEGORY_LABEL } from "./format";
import { Field, Msg } from "./ui";
import { STATES } from "./states";
import useDebounced from "./useDebounced";

// Billing Customers: every customer's category (from the customer type: Corporate = Commercial
// with GST, Individual / RWA = Residential without GST) and its billing profile (bill-to name,
// address, GST state, payment terms). A customer without a profile cannot be invoiced.


export default function BillingCustomers() {
  const { me } = useOutletContext();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [missing, setMissing] = useState(false);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useBilling(`/customers${qs({ q, category, missing_profile: missing })}`);
  const [editing, setEditing] = useState(null);
  const rows = data || [];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Billing Customers</h1>
          <p className="ac-sub">Bill-to details and GST state of each customer. Commercial customers are billed with GST, Residential without.</p>
        </div>
      </div>

      <div className={editing ? "bl-split wide" : ""}>
        <div className="ac-card">
          <div className="ac-filters" style={{ marginBottom: 12 }}>
            <input className="ac-input" placeholder="Search name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="ac-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="RESIDENTIAL">Residential</option>
            </select>
            <label className="bl-toggle" style={{ paddingTop: 0 }}><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> Profile missing</label>
            <div />
          </div>
          <Msg error={error} />
          <div className="ac-table-wrap">
            <table className="ac-table ac-stack">
              <thead><tr><th>Customer</th><th>Category</th><th>GSTIN</th><th>Billing profile</th><th className="ac-num">Active contracts</th><th>Service plan</th><th /></tr></thead>
              <tbody>
                {loading || !rows.length ? (
                  <EmptyRow cols={7} loading={loading} text="No customers match." />
                ) : (
                  rows.map((c) => (
                    <tr key={c.company_id} className={`bl-click ${editing?.company_id === c.company_id ? "bl-sel" : ""}`} onClick={() => setEditing(c)}>
                      <td><b>{c.name}</b><div className="bl-sub" title={c.sites} style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sites || "No outlets"}</div></td>
                      <td>{c.category ? CATEGORY_LABEL[c.category] : <span className="bl-warn err">Set customer type first</span>}</td>
                      <td>{c.gst_number || (c.category === "COMMERCIAL" ? <span className="ac-badge b-amber">Missing</span> : <span className="ac-sub">—</span>)}</td>
                      <td>{c.profile_complete ? <span className="ac-badge b-green">Complete</span> : <span className="ac-badge b-red">Missing</span>}</td>
                      <td className="bl-num">{c.active_contracts}</td>
                      <td>{c.has_service_plan ? <span className="ac-badge b-green">Yes</span> : <span className="ac-sub">—</span>}</td>
                      <td><button type="button" className="ac-btn sm">{me.can("MANAGE_BILLING_MASTERS") ? "Edit profile" : "View"}</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {editing && <ProfilePanel key={editing.company_id} customer={editing} canEdit={me.can("MANAGE_BILLING_MASTERS")} onClose={() => setEditing(null)} onSaved={reload} />}
      </div>
    </div>
  );
}

function ProfilePanel({ customer, canEdit, onClose, onSaved }) {
  const [loaded, setLoaded] = useState(null);
  const [edits, setEdits] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    billingGet(`/profiles/${encodeURIComponent(customer.company_id)}`)
      .catch((err) => (err instanceof ApiError && err.status === 404 ? null : Promise.reject(err)))
      .then((p) => live && setLoaded(p || { billing_name: customer.display_name || "", billing_address: "", state_code: "29", payment_terms_days: 30, is_active: true, gst_number: customer.gst_number || "", isNew: true }))
      .catch((err) => live && setMsg({ error: err.message }));
    return () => {
      live = false;
    };
  }, [customer]);

  const form = edits || loaded;
  const set = (patch) => setEdits({ ...form, ...patch });

  async function save() {
    setBusy(true);
    setMsg({});
    try {
      const saved = await billingPut(`/profiles/${encodeURIComponent(customer.company_id)}`, {
        billing_name: form.billing_name, billing_address: form.billing_address, state_code: form.state_code,
        payment_terms_days: Number(form.payment_terms_days) || 0, is_active: form.is_active,
        gst_number: (form.gst_number || "").trim().toUpperCase(),
      });
      setLoaded(saved);
      setEdits(null);
      setMsg({ ok: "Billing profile saved." });
      onSaved();
    } catch (err) {
      setMsg({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ac-card">
      <div className="bl-panel-title">
        <h3 className="ac-card-title" style={{ margin: 0 }}>Billing profile · {customer.name}</h3>
        <button type="button" className="bl-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {!customer.category && <div className="bl-msg err" style={{ marginBottom: 12 }}>Set the customer type (Corporate / Individual / RWA) on the customer first; it decides whether GST applies.</div>}
      {!form ? <div className="ac-sub">Loading…</div> : (
        <div className="bl-grid">
          <Field label="Billing name" required><input className="ac-input" value={form.billing_name} disabled={!canEdit} maxLength={255} placeholder="No display name set for this customer. Type the billing name" onChange={(e) => set({ billing_name: e.target.value })} /></Field>
          <Field label="GSTIN" required={customer.category === "COMMERCIAL"} hint={customer.category === "RESIDENTIAL" ? "Residential customers are billed without GST; leave blank" : "15 characters, e.g. 29ABCDE1234F1Z5. The state below follows its first 2 digits."}>
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
          <Field label="Billing address" required><textarea className="ac-textarea" value={form.billing_address} disabled={!canEdit} maxLength={1000} onChange={(e) => set({ billing_address: e.target.value })} placeholder="One line per row, as printed under Bill To" /></Field>
          <div className="bl-grid g2">
            <Field label="State (GST)" required hint={form.state_code === "29" ? "Karnataka: CGST + SGST" : "Outside Karnataka: IGST"}>
              <select className="ac-select" value={form.state_code} disabled={!canEdit} onChange={(e) => set({ state_code: e.target.value })}>
                {STATES.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
              </select>
            </Field>
            <Field label="Payment terms (days)"><input type="number" min="0" max="365" className="ac-input" value={form.payment_terms_days} disabled={!canEdit} onChange={(e) => set({ payment_terms_days: e.target.value })} /></Field>
          </div>
          <label className="bl-toggle"><input type="checkbox" checked={Boolean(form.is_active)} disabled={!canEdit} onChange={(e) => set({ is_active: e.target.checked })} /> Active (can be invoiced)</label>
          <Msg {...msg} />
          {canEdit && (
            <div className="ac-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ac-btn" onClick={onClose}>Close</button>
              <button type="button" className="ac-btn ac-btn-primary" disabled={busy || (!edits && !form.isNew) || !form.billing_name || !form.billing_address || (customer.category === "COMMERCIAL" && !(form.gst_number || "").trim())} onClick={save}>{busy ? "Saving…" : "Save profile"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
