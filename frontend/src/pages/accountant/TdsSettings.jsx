import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { DataError, EmptyRow, Pager } from "./ui";
import { fetchTdsSettings, nameKey, saveTdsSettingsForRow, useAccountantData, usePaged } from "./data";
import { money } from "./format";
import "./accountant.css";

// What TDS is worked out on (companies.tds_basis):
//   INVOICE "Invoice TDS": the full invoice amount, GST included (how it has always worked).
//   TAXABLE "Taxable TDS": the taxable value before GST - the invoice's "Taxable Value" from the
//   import file, or, when that was left blank, the amount / 1.18 (18% GST).
const BASES = [
  { key: "TAXABLE", label: "Taxable TDS", hint: "On the taxable value (before GST)" },
  { key: "INVOICE", label: "Invoice TDS", hint: "On the full invoice amount (incl. GST)" },
];
const BASIS_LABEL = { TAXABLE: "Taxable TDS", INVOICE: "Invoice TDS" };
// The worked example shown in the Edit dialog.
const EXAMPLE_TAXABLE = 100000;
const EXAMPLE_GST = 18;

// Customer TDS master: whether TDS applies to a customer, at what rate, and on what amount.
// New invoices copy this setting. Old invoices keep the rate they were created with,
// unless "apply to existing invoices" is ticked (then only invoices with no TDS deducted yet are refreshed).
// Customer records with the same display name (e.g. one per outlet) are one row here, and a change
// is saved for every record in that row.
export default function TdsSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null); // { group, applicable, rate, basis, existing }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState(null); // the customer row the "Remove TDS?" dialog is open for

  // TDS still to be collected per customer record, from their invoices (cancelled invoices are left out).
  const { invoices, loading: invoicesLoading, reload: reloadInvoices } = useAccountantData();
  const pendingTds = useMemo(() => {
    const totals = new Map();
    for (const i of invoices) {
      if (i.status === "CANCELLED") continue;
      totals.set(i.customer_id, (totals.get(i.customer_id) || 0) + i.pending_tds);
    }
    return totals;
  }, [invoices]);

  const load = useCallback(async () => {
    try {
      setRows(await fetchTdsSettings());
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the TDS settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // One row per display name. `onCount` is how many of its records have TDS on; `rates` their rates.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = nameKey(r.name);
      if (!map.has(key)) map.set(key, { key, name: String(r.name || "").trim(), members: [] });
      map.get(key).members.push(r);
    }
    return [...map.values()].map((g) => {
      const on = g.members.filter((m) => m.tds_applicable);
      return {
        ...g,
        ids: g.members.map((m) => m.id),
        codes: g.members.map((m) => m.code).filter(Boolean),
        onCount: on.length,
        rates: [...new Set(on.map((m) => m.tds_rate))],
        bases: [...new Set(on.map((m) => m.tds_basis || "INVOICE"))],
      };
    });
  }, [rows]);

  const needle = search.trim().toLowerCase();
  const shown = groups.filter((g) => `${g.name} ${g.codes.join(" ")}`.toLowerCase().includes(needle));
  // 25 customers a page; a new search starts again on page 1.
  const { pageRows, page, setPage, pageSize } = usePaged(shown, 25);

  const groupPending = (g) => g.ids.reduce((s, id) => s + (pendingTds.get(id) || 0), 0);

  // Saves the same TDS setting for every record of a customer row in one request: all records
  // change together (or none do) and the audit log gets one entry. Returns how many invoices were updated.
  async function saveForGroup(g, body) {
    const res = await saveTdsSettingsForRow(g.ids, body);
    return res.updated_invoices || 0;
  }

  // Remove TDS (set by mistake): TDS is switched off for the customer, and taken off the
  // customer's invoices that have no TDS deducted yet. The customer and the invoices stay;
  // an invoice where TDS was already deducted keeps it.
  async function removeTds() {
    setSaving(true);
    try {
      const updated = await saveForGroup(removing, { tds_applicable: false, tds_rate: null, apply_to_existing: true });
      setNotice(`TDS removed for ${removing.name}. ${updated} invoice(s) updated.`);
      setRemoving(null);
    } catch (err) {
      setNotice("");
      setFormError(err.message || "TDS could not be removed.");
      setRemoving(null);
    } finally {
      setSaving(false);
      await Promise.all([load(), reloadInvoices()]); // the Pending TDS column reads the invoices
    }
  }

  function open(g) {
    setFormError("");
    setEdit({ group: g, applicable: g.onCount > 0, rate: g.rates[0] ?? "", basis: g.bases[0] || "INVOICE", existing: false });
  }

  async function save() {
    const rate = Number(edit.rate);
    if (edit.applicable && !(rate > 0 && rate <= 100)) {
      setFormError("Enter a TDS rate between 0 and 100.");
      return;
    }
    setSaving(true);
    setFormError("");
    let ok = false;
    try {
      const updated = await saveForGroup(edit.group, {
        tds_applicable: edit.applicable,
        tds_rate: edit.applicable ? rate : null,
        tds_basis: edit.basis,
        apply_to_existing: edit.existing,
      });
      setNotice(`Saved for ${edit.group.name}.${edit.existing ? ` ${updated} existing invoice(s) updated.` : ""}`);
      ok = true;
    } catch (err) {
      setFormError(err.message || "The TDS settings could not be saved.");
    } finally {
      setSaving(false);
      if (ok) setEdit(null);
      await Promise.all([load(), reloadInvoices()]); // the Pending TDS column reads the invoices
    }
  }

  const applicableText = (g) => (g.onCount === 0 ? "No" : g.onCount === g.members.length ? "Yes" : `Partly (${g.onCount} of ${g.members.length})`);
  const rateText = (g) => (g.onCount ? g.rates.map((r) => `${r}%`).join(" / ") : "—");
  const basisCell = (g) =>
    g.onCount ? (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        {g.bases.map((b) => <span key={b} className={`ac-badge tds-${b.toLowerCase()}`}>{BASIS_LABEL[b] || b}</span>)}
      </span>
    ) : "—";

  // The worked example in the Edit dialog, at the rate being typed.
  const exampleRate = Number(edit?.rate) > 0 && Number(edit?.rate) <= 100 ? Number(edit.rate) : 0;
  const exampleTotal = EXAMPLE_TAXABLE * (1 + EXAMPLE_GST / 100);
  const exampleTds = (base) => (base * exampleRate) / 100;

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">TDS Settings</h2>
          <p className="ac-sub">Set whether TDS applies to each customer, and whether it is on the taxable value or the full invoice amount. New invoices copy this setting; old invoices keep their own.</p>
        </div>
        <input className="ac-input" style={{ maxWidth: 260 }} placeholder="Search customer" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <DataError error={error} onRetry={load} />
      {notice && <div className="ac-note ok"><FiCheckCircle /> {notice}</div>}
      {!edit && formError && <div className="ac-info error" role="alert"><span>{formError}</span></div>}

      <div className="ac-card">
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead><tr><th>Customer</th><th>TDS Applicable</th><th>TDS On</th><th className="ac-num">TDS Rate</th><th className="ac-num">Pending TDS</th><th /></tr></thead>
            <tbody>
              {pageRows.length ? pageRows.map((g) => {
                const pending = groupPending(g);
                return (
                  <tr key={g.key}>
                    <td>{g.name}{g.members.length > 1 && <div className="ac-sub">{g.members.length} customer records</div>}</td>
                    <td>{applicableText(g)}</td>
                    <td>{basisCell(g)}</td>
                    <td className="ac-num">{rateText(g)}</td>
                    <td className="ac-num">{invoicesLoading ? "…" : g.onCount || pending ? money(pending) : "—"}</td>
                    <td className="ac-num">
                      <div className="ac-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 8 }}>
                        <button type="button" className="ac-btn" onClick={() => open(g)}>Edit</button>
                        {g.onCount > 0 && (
                          <button type="button" className="ac-btn" style={{ color: "#b91c1c" }} onClick={() => { setFormError(""); setRemoving(g); }}>Remove TDS</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : <EmptyRow cols={6} loading={loading} text="No customers found" />}
            </tbody>
          </table>
        </div>
        <Pager total={shown.length} page={page} pageSize={pageSize} onPage={setPage} />
      </div>

      {removing && (
        <div className="ac-overlay" onMouseDown={() => !saving && setRemoving(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Remove TDS for {removing.name}?</h3>
            <p className="ac-sub" style={{ fontSize: 14 }}>
              TDS ({rateText(removing)}) is switched off for this customer
              {removing.members.length > 1 ? ` (all ${removing.members.length} customer records with this name)` : ""} and taken off
              their invoices that have no TDS deducted yet. The customer and the invoices are not deleted. Invoices where TDS was
              already deducted keep it.
            </p>
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn" onClick={() => setRemoving(null)} disabled={saving}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" onClick={removeTds} disabled={saving}>{saving ? "Removing…" : "Remove TDS"}</button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div className="ac-overlay" onMouseDown={() => !saving && setEdit(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>TDS for {edit.group.name}</h3>
            {edit.group.members.length > 1 && (
              <p className="ac-sub" style={{ fontSize: 14, marginTop: 0 }}>
                Saved for all {edit.group.members.length} customer records with this name.
              </p>
            )}
            <label className="ac-checkline" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={edit.applicable} onChange={(e) => setEdit({ ...edit, applicable: e.target.checked })} /> TDS applicable
            </label>
            <div className="ac-field" style={{ marginBottom: 12 }}>
              <label>Calculate TDS on</label>
              <div className="tds-basis-options" role="radiogroup" aria-label="Calculate TDS on">
                {BASES.map((b) => (
                  <label key={b.key} className={`tds-basis-option ${edit.basis === b.key ? "selected" : ""} ${edit.applicable ? "" : "disabled"}`}>
                    <input type="radio" name="tds-basis" value={b.key} checked={edit.basis === b.key} disabled={!edit.applicable}
                      onChange={() => setEdit({ ...edit, basis: b.key })} />
                    <span>
                      <strong>{b.label}</strong>
                      <small>{b.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="ac-field">
              <label>TDS Rate (%)</label>
              <input className="ac-input" type="number" min="0" max="100" step="0.01" disabled={!edit.applicable} value={edit.rate}
                onChange={(e) => setEdit({ ...edit, rate: e.target.value })} />
            </div>
            {edit.applicable && exampleRate > 0 && (
              <div className="tds-example">
                <div className="tds-example-title">Example on a {money(exampleTotal)} invoice</div>
                <div className="tds-example-row"><span>Taxable value</span><span>{money(EXAMPLE_TAXABLE)}</span></div>
                <div className="tds-example-row"><span>GST ({EXAMPLE_GST}%)</span><span>{money(exampleTotal - EXAMPLE_TAXABLE)}</span></div>
                <div className="tds-example-row strong">
                  <span>TDS @ {exampleRate}% on {edit.basis === "TAXABLE" ? "taxable value" : "invoice amount"}</span>
                  <span>{money(exampleTds(edit.basis === "TAXABLE" ? EXAMPLE_TAXABLE : exampleTotal))}</span>
                </div>
                <div className="tds-example-row muted">
                  <span>({edit.basis === "TAXABLE" ? "Invoice" : "Taxable"} TDS would be {money(exampleTds(edit.basis === "TAXABLE" ? exampleTotal : EXAMPLE_TAXABLE))})</span>
                </div>
                {edit.basis === "TAXABLE" && (
                  <div className="tds-example-note">
                    Uses each invoice&apos;s Taxable Value from the import file; where it was left blank, Amount ÷ 1.18.
                  </div>
                )}
              </div>
            )}
            <label className="ac-checkline" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={edit.existing} onChange={(e) => setEdit({ ...edit, existing: e.target.checked })} />
              Also apply to existing invoices that have no TDS deducted yet
            </label>
            {formError && <div className="ac-info error" style={{ marginTop: 12 }} role="alert"><span>{formError}</span></div>}
            <div className="ac-modal-foot">
              <button type="button" className="ac-btn" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
              <button type="button" className="ac-btn ac-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
