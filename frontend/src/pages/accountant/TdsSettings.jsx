import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { DataError, EmptyRow } from "./ui";
import { fetchTdsSettings, saveTdsSettings, useAccountantData } from "./data";
import { money } from "./format";
import "./accountant.css";

// Customer TDS master: whether TDS applies to a customer and at what rate.
// New invoices copy this setting. Old invoices keep the rate they were created with,
// unless "apply to existing invoices" is ticked (then only invoices with no TDS deducted yet are refreshed).
export default function TdsSettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null); // { id, name, applicable, rate, existing }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  // TDS still to be collected per customer, from their invoices (cancelled invoices are left out).
  const { invoices, loading: invoicesLoading } = useAccountantData();
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

  const shown = rows.filter((r) => `${r.name} ${r.code || ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  function open(r) {
    setFormError("");
    setEdit({ id: r.id, name: r.name, applicable: r.tds_applicable, rate: r.tds_rate ?? "", existing: false });
  }

  async function save() {
    const rate = Number(edit.rate);
    if (edit.applicable && !(rate > 0 && rate <= 100)) {
      setFormError("Enter a TDS rate between 0 and 100.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await saveTdsSettings(edit.id, {
        tds_applicable: edit.applicable,
        tds_rate: edit.applicable ? rate : null,
        apply_to_existing: edit.existing,
      });
      setNotice(`Saved for ${edit.name}.${edit.existing ? ` ${res.updated_invoices} existing invoice(s) updated.` : ""}`);
      setEdit(null);
      await load();
    } catch (err) {
      setFormError(err.message || "The TDS settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h2 className="ac-title">TDS Settings</h2>
          <p className="ac-sub">Set whether TDS applies to each customer. New invoices copy this setting; old invoices keep their own rate.</p>
        </div>
        <input className="ac-input" style={{ maxWidth: 260 }} placeholder="Search customer" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DataError error={error} onRetry={load} />
      {notice && <div className="ac-note ok"><FiCheckCircle /> {notice}</div>}

      <div className="ac-card">
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead><tr><th>Customer</th><th>TDS Applicable</th><th className="ac-num">TDS Rate</th><th className="ac-num">Pending TDS</th><th /></tr></thead>
            <tbody>
              {shown.length ? shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.tds_applicable ? "Yes" : "No"}</td>
                  <td className="ac-num">{r.tds_applicable ? `${r.tds_rate}%` : "—"}</td>
                  <td className="ac-num">{invoicesLoading ? "…" : r.tds_applicable || pendingTds.get(r.id) ? money(pendingTds.get(r.id) || 0) : "—"}</td>
                  <td className="ac-num"><button type="button" className="ac-btn" onClick={() => open(r)}>Edit</button></td>
                </tr>
              )) : <EmptyRow cols={5} loading={loading} text="No customers found" />}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <div className="ac-overlay" onMouseDown={() => !saving && setEdit(null)}>
          <div className="ac-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>TDS for {edit.name}</h3>
            <label className="ac-checkline" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={edit.applicable} onChange={(e) => setEdit({ ...edit, applicable: e.target.checked })} /> TDS applicable
            </label>
            <div className="ac-field">
              <label>TDS Rate (%)</label>
              <input className="ac-input" type="number" min="0" max="100" step="0.01" disabled={!edit.applicable} value={edit.rate}
                onChange={(e) => setEdit({ ...edit, rate: e.target.value })} />
            </div>
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
