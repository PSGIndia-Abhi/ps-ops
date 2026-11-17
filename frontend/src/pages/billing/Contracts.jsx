import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { EmptyRow } from "../accountant/ui";
import { qs, useBilling } from "./billingApi";
import { dmy, thisMonth } from "./format";
import { Msg, StatusBadge, TypeBadge } from "./ui";
import useDebounced from "./useDebounced";

// Contracts & Price Lists: how each customer is billed (type, frequency, timing, PO) and its prices.

export default function Contracts() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [dueOnly, setDueOnly] = useState(false);
  const q = useDebounced(search);
  const { data, error, loading } = useBilling(`/contracts${qs({ q, type, status, due_month: dueOnly ? thisMonth() : "" })}`);
  const rows = data || [];

  return (
    <div className="ac-page">
      <div className="ac-head">
        <div>
          <h1 className="ac-title">Contracts &amp; Price Lists</h1>
          <p className="ac-sub">How each customer is billed: AMC, one-time, termite or chemical, the frequency, PO and the price of every service.</p>
        </div>
        {me.can("MANAGE_BILLING_MASTERS") && (
          <div className="ac-actions">
            <button type="button" className="ac-btn ac-btn-primary" onClick={() => navigate("/billing/contracts/new")}>+ New contract</button>
          </div>
        )}
      </div>

      <div className="ac-card">
        <div className="ac-filters" style={{ marginBottom: 12 }}>
          <input className="ac-input" placeholder="Search customer or contract code…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="ac-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            <option value="AMC">AMC</option>
            <option value="ONE_TIME">One-time</option>
            <option value="TERMITE">Termite</option>
            <option value="CHEMICAL">Chemical</option>
          </select>
          <select className="ac-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ENDED">Ended</option>
          </select>
          <label className="bl-toggle" style={{ paddingTop: 0 }}>
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Due this month
          </label>
        </div>
        <Msg error={error} />
        <div className="ac-table-wrap">
          <table className="ac-table ac-stack">
            <thead>
              <tr><th>Contract</th><th>Customer</th><th>Type</th><th>Next period from</th><th>Timing</th><th>PO</th><th>Status</th><th>Last invoice</th></tr>
            </thead>
            <tbody>
              {loading || !rows.length ? (
                <EmptyRow cols={8} loading={loading} text="No contracts yet." />
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="bl-click" onClick={() => navigate(`/billing/contracts/${c.id}`)}>
                    <td><b>{c.contract_code}</b></td>
                    <td>{c.customer}</td>
                    <td><TypeBadge type={c.billing_type} frequency={c.frequency_months} /></td>
                    <td>{dmy(c.next_period_start)}</td>
                    <td>{c.bill_timing === "ADVANCE" ? "In advance" : "In arrears"}</td>
                    <td>{c.po_required ? <span className="ac-badge b-blue">Required</span> : <span className="ac-sub">—</span>}</td>
                    <td><StatusBadge value={c.status} /></td>
                    <td>{c.last_invoice_number || <span className="ac-sub">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
