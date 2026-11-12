import { useEffect, useState } from "react";
import { FiClock } from "react-icons/fi";
import { getJson } from "./data";
import { actionLabel, fieldLabel, moduleBadge, moduleLabel, showValue, showWhen } from "./auditLabels";

// "Change History" card on Invoice Details: every recorded change to this one invoice,
// newest first (edits, payments, TDS changes, cancellation, how it was created).

// The part of an entry that concerns this invoice (a payment or TDS change can cover several).
function describe(entry, invoiceId) {
  const d = entry.details || {};
  const tds = (d.invoices || []).find((i) => i.invoice_id === invoiceId);
  if (tds) {
    return <>TDS <span className="ac-audit-old">₹{tds.tds_before}</span> → <span className="ac-audit-new">₹{tds.tds_after}</span></>;
  }
  const alloc = (d.allocations || []).find((a) => a.invoice_id === invoiceId);
  if (alloc) {
    return (
      <>
        {entry.entity_label} · ₹{alloc.cash} cash{alloc.tds ? ` + ₹${alloc.tds} TDS` : ""}
        {d.payment_mode ? ` · ${d.payment_mode}` : ""}{d.reference_number ? ` · UTR ${d.reference_number}` : ""}
        {" · pending "}<span className="ac-audit-old">₹{alloc.pending_before}</span> → <span className="ac-audit-new">₹{alloc.pending_after}</span>
      </>
    );
  }
  if (entry.changes?.length) {
    return entry.changes.map((c, i) => (
      <span key={i}>
        {i > 0 && " · "}
        {fieldLabel(c.field)} <span className="ac-audit-old">{showValue(c.field, c.from)}</span> → <span className="ac-audit-new">{showValue(c.field, c.to)}</span>
      </span>
    ));
  }
  return entry.summary || "";
}

export default function ChangeHistory({ invoiceId }) {
  const [state, setState] = useState({ loading: true, entries: [], error: "" });

  useEffect(() => {
    // The card is keyed by invoice (and retry) in InvoiceDetails, so it starts fresh in "loading".
    let cancelled = false;
    getJson(`/api/audit-logs/invoice/${encodeURIComponent(invoiceId)}`)
      .then((data) => { if (!cancelled) setState({ loading: false, entries: data.entries || [], error: "" }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, entries: [], error: err.message || "Could not load the change history" }); });
    return () => { cancelled = true; };
  }, [invoiceId]);

  return (
    <div className="ac-card">
      <h3 className="ac-card-title"><FiClock className="ac-title-icon" />Change History</h3>
      {state.loading ? (
        <p className="ac-sub">Loading…</p>
      ) : state.error ? (
        <p className="ac-sub">{state.error}</p>
      ) : !state.entries.length ? (
        <p className="ac-sub">No changes recorded yet.</p>
      ) : (
        <div className="ac-history">
          {state.entries.map((e) => (
            <div key={e.id} className="ac-history-item">
              <span className="ac-audit-muted">{showWhen(e.created_at)}</span>
              <span><span className={`ac-badge ${moduleBadge(e.module, e.action)}`}>{moduleLabel(e.module)}</span></span>
              <span>
                <b>{actionLabel(e.action)}</b>
                {e.user_name ? <> by {e.user_name}</> : e.source === "SYSTEM" ? " by System" : ""}
                {" — "}{describe(e, invoiceId)}
                {e.reason ? <span className="ac-audit-muted"> · Reason: {e.reason}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
