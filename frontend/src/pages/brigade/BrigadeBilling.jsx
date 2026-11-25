import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { brigadeRequest, formatDate, formatInr, poState, round2, usedPct } from "./brigadeShared";
import PoSheet, { Money, SearchIcon } from "./PoSheet";
import "./brigade.css";

// Brigade billing (/brigade/billing): VIEW ONLY. Every PO with its completed services,
// totals with GST and the balance (PO amount - invoices generated); inside a PO, tick completed services and
// Preview -> Generate the tax invoice. POs, prices and services are managed in the
// PO section. The open PO lives in the URL (?po=) so the browser back button returns.
// inBilling: shown in the Billing panel (Billing -> Brigade) for Accounts - same screens, without the
// links that open Brigade-only pages (PO section, job details).
export default function BrigadeBilling({ inBilling = false }) {
  const [params, setParams] = useSearchParams();
  const openPo = params.get("po");

  function open(number) {
    setParams(number ? { po: number } : {});
  }

  return openPo ? (
    <PoSheet key={openPo} mode="billing" number={openPo} onBack={() => open(null)} onOpen={open} inBilling={inBilling} />
  ) : (
    <PoList onOpen={open} inBilling={inBilling} />
  );
}

/* ------------------------------------------------------------------ */
/* PO list                                                             */
/* ------------------------------------------------------------------ */

const shortInr = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return formatInr(v);
};
const PILL = { open: "ok", full: "muted", over: "bad", none: "muted" };

function PoList({ onOpen, inBilling }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    brigadeRequest("/api/brigade/billing/pos")
      .then((rows) =>
        setPos((Array.isArray(rows) ? rows : []).map((p) => {
          const billed = p.totals.billed_incl ?? p.totals.billed;
          const invoiced = p.totals.invoiced || 0; // the PO is used up only by invoices
          return { ...p, billed, invoiced, ready: round2(Math.max(billed - invoiced, 0)), state: poState(p.totals.po_amount, p.totals.balance) };
        }))
      )
      .catch((err) => setError(err.message || "Failed to load POs"))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: pos.length, ready: pos.filter((p) => p.ready > 0.5).length };
    for (const p of pos) c[p.state.key] = (c[p.state.key] || 0) + 1;
    return c;
  }, [pos]);

  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      pos.filter(
        (p) =>
          (filter === "all" || (filter === "ready" ? p.ready > 0.5 : p.state.key === filter)) &&
          (!term || [p.po_number, p.po_source, ...p.properties, ...p.flats].some((v) => String(v || "").toLowerCase().includes(term)))
      ),
    [pos, term, filter]
  );

  const summary = useMemo(() => {
    const withAmount = pos.filter((p) => p.totals.po_amount !== null);
    return {
      value: round2(withAmount.reduce((s, p) => s + p.totals.po_amount, 0)),
      invoiced: round2(pos.reduce((s, p) => s + p.invoiced, 0)),
      ready: round2(pos.reduce((s, p) => s + p.ready, 0)),
      balance: round2(withAmount.reduce((s, p) => s + p.totals.balance, 0)),
      over: counts.over || 0,
    };
  }, [pos, counts]);

  const typed = query.trim();
  const exact = typed && pos.find((p) => p.po_number.toLowerCase() === typed.toLowerCase());

  // Enter in the search box opens a PO only when the number matches exactly.
  function submit(e) {
    e.preventDefault();
    if (exact) onOpen(exact.po_number);
  }

  const overallPct = usedPct(summary.invoiced, summary.value) ?? 0;

  return (
    <div className={`bg-page bdz bpo ${inBilling ? "bdz-embedded" : ""}`}>
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Billing</span>
            <h1>Billing</h1>
            <p>Open a PO, tick its completed services and generate the tax invoice · PO amounts include GST</p>
          </div>
        </div>
        {loading ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat aqua"><span>Ready to invoice</span><b title={formatInr(summary.ready)}>{shortInr(summary.ready)}</b><em>{counts.ready} PO{counts.ready === 1 ? "" : "s"} with completed work · incl. GST</em></div>
            <div className="bdz-hstat blue"><span>Invoiced</span><b title={formatInr(summary.invoiced)}>{shortInr(summary.invoiced)}</b><em>{overallPct}% of PO value</em></div>
            <div className="bdz-hstat"><span>Total PO value</span><b title={formatInr(summary.value)}>{shortInr(summary.value)}</b><em>{pos.length} POs{counts.none ? ` · ${counts.none} without amount` : ""}</em></div>
            <div className={`bdz-hstat ${summary.balance < 0 || summary.over ? "red" : ""}`}><span>Balance</span><b title={formatInr(summary.balance)}>{shortInr(summary.balance)}</b><em>{summary.over ? `${summary.over} PO${summary.over === 1 ? "" : "s"} over the PO amount` : "No PO over its amount"}</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel bnp-panel">
        <div className="bnp-toolbar">
          <div className="bpm-seg" role="tablist" aria-label="Filter POs">
            {[["all", "All"], ["ready", "Ready to invoice"], ["open", "Open"], ["full", "Fully used"], ["over", "Over the PO"], ["none", "No amount"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l} <b>{counts[k] || 0}</b></button>
            ))}
          </div>
          <form className="bnp-search" onSubmit={submit} role="search">
            <SearchIcon />
            <input value={query} maxLength={100} placeholder="Search PO, property or flat" aria-label="Search POs" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </form>
        </div>

        {loading ? (
          <div className="bpm-skel-grid" role="status" aria-label="Loading POs">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 60, borderRadius: 12 }} />)}
          </div>
        ) : !pos.length ? (
          <div className="bnp-empty muted">
            <strong>No purchase orders yet</strong>
            <p>POs appear here once they are created in the PO section or typed during booking.</p>
          </div>
        ) : !shown.length ? (
          <div className="bnp-empty muted">
            <strong>No matching POs</strong>
            <p>Try another search or filter. New POs are created in the PO section.</p>
          </div>
        ) : (
          <div className="bnp-scroll">
            <table className="bnp-table bpo-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Property · flats</th>
                  <th className="num">PO amount</th>
                  <th className="num">Ready to invoice</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Balance</th>
                  <th style={{ width: 160 }}>Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const pct = usedPct(p.invoiced, p.totals.po_amount);
                  return (
                    <tr key={p.po_number} tabIndex={0} onClick={() => onOpen(p.po_number)} onKeyDown={(e) => e.key === "Enter" && onOpen(p.po_number)}>
                      <td>
                        <div className="bnp-who">
                          <span className="bpo-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
                          </span>
                          <span><strong>{p.po_number}</strong><small className="bpo-meta">{p.po_date ? formatDate(p.po_date) : "No date"} · {p.totals.services} line{p.totals.services === 1 ? "" : "s"}</small></span>
                        </div>
                      </td>
                      <td className="bpo-props">
                        <span>{p.properties.join(", ") || <em className="bnp-muted">No services yet</em>}</span>
                        {p.flats.length > 0 && <small title={p.flats.join(", ")}>{p.flats.length} flat{p.flats.length === 1 ? "" : "s"} · {p.flats.slice(0, 4).join(", ")}{p.flats.length > 4 ? "…" : ""}</small>}
                      </td>
                      <td className="num"><Money value={p.totals.po_amount} /></td>
                      <td className="num">
                        {p.ready > 0.5 ? <span className="bbl-ready">{formatInr(p.ready)}<small>Generate →</small></span> : <span className="bnp-muted">—</span>}
                      </td>
                      <td className="num">{formatInr(p.invoiced)}</td>
                      <td className="num bnp-price"><Money value={p.totals.balance} signed /></td>
                      <td>
                        {p.totals.po_amount ? (
                          <span className="bpo-used">
                            <span className="bpo-used-bar"><i className="inv" style={{ width: `${Math.min(pct || 0, 100)}%` }} /></span>
                            <small>{pct}%</small>
                          </span>
                        ) : <span className="bnp-muted">—</span>}
                      </td>
                      <td><span className={`bpo-pill ${PILL[p.state.key]}`}>{p.state.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
