import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { brigadeRequest, formatDate, formatInr } from "./brigadeShared";
import PoSheet, { NewPoDialog, SearchIcon } from "./PoSheet";
import "./brigade.css";

// PO section (/brigade/pos): where client POs are managed. Create a PO (+ New PO) or open
// one; inside it, change the PO details and files, add or remove services and set each
// service's price on this PO (any status), see the flats waiting on it and its invoices.
// Billing only views completed services and generates invoices.
// The open PO lives in the URL (?po=) so the browser back button returns to the list.
export default function BrigadePos() {
  const [params, setParams] = useSearchParams();
  const openPo = params.get("po");
  const open = (number) => setParams(number ? { po: number } : {});
  return openPo ? (
    <PoSheet key={openPo} mode="manage" number={openPo} onBack={() => open(null)} onOpen={open} />
  ) : (
    <PoTable onOpen={open} />
  );
}

const round2 = (n) => Math.round(n * 100) / 100;
const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

function Money({ value, signed }) {
  if (value === null || value === undefined) return <span className="bgb-muted">—</span>;
  return <span className={signed && value < 0 ? "bgb-neg" : undefined}>{formatInr(value)}</span>;
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

// Per PO: assigned = services + pending flats on it (with GST) - work to come, for information.
// The PO amount (incl. GST) is used up only by invoices: balance = PO amount - invoiced.
function poFacts(p) {
  const amount = p.totals.po_amount;
  const assigned = round2((p.totals.billed_incl ?? p.totals.billed) + (p.totals.pending_incl || 0));
  const invoiced = p.totals.invoiced || 0;
  const balance = p.totals.balance;
  const state = amount === null || amount === undefined ? "none"
    : balance !== null && balance < -0.5 ? "over"
      : balance !== null && balance <= 0.5 ? "used"
        : assigned > amount + 0.5 ? "work"
          : "ok";
  return { amount, assigned, invoiced, balance, state };
}
const STATE = {
  ok: ["ok", "Balance left"], work: ["warn", "Work > PO"], used: ["bad", "Used up"], over: ["bad", "Over PO"], none: ["muted", "No amount"],
};
const SORTS = {
  newest: ["Newest first", (a, b) => String(b.p.po_date || "").localeCompare(String(a.p.po_date || ""))],
  balance: ["Highest balance", (a, b) => (b.f.balance ?? -Infinity) - (a.f.balance ?? -Infinity)],
  amount: ["Highest PO amount", (a, b) => (b.f.amount ?? -1) - (a.f.amount ?? -1)],
  number: ["PO number", (a, b) => a.p.po_number.localeCompare(b.p.po_number, undefined, { numeric: true })],
};

function PoTable({ onOpen }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("newest");
  const [newPo, setNewPo] = useState(null); // null | prefilled PO number

  useEffect(() => {
    brigadeRequest("/api/brigade/pos")
      .then((rows) => setPos(Array.isArray(rows) ? rows : []))
      .catch((err) => setError(err.message || "Failed to load POs"))
      .finally(() => setLoading(false));
  }, []);

  const all = useMemo(() => pos.map((p) => ({ p, f: poFacts(p) })), [pos]);
  const counts = useMemo(() => all.reduce((m, { f }) => { m[f.state] = (m[f.state] || 0) + 1; return m; }, {}), [all]);
  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all
        .filter(({ f }) => view === "all" || (view === "work" ? f.state === "work" : view === "used" ? f.state === "used" || f.state === "over" : f.state === view))
        .filter(({ p }) => !term || [p.po_number, p.po_source, ...p.properties, ...p.flats].some((v) => String(v || "").toLowerCase().includes(term)))
        .sort(SORTS[sort][1]),
    [all, view, term, sort]
  );

  const summary = useMemo(() => {
    const withAmount = all.filter(({ f }) => f.amount !== null && f.amount !== undefined);
    const value = round2(withAmount.reduce((s, { f }) => s + f.amount, 0));
    const invoiced = round2(all.reduce((s, { f }) => s + f.invoiced, 0));
    return {
      value,
      invoiced,
      balance: round2(withAmount.reduce((s, { f }) => s + (f.balance ?? 0), 0)),
      assigned: round2(all.reduce((s, { f }) => s + f.assigned, 0)),
      services: pos.reduce((s, p) => s + p.totals.services, 0),
      completed: pos.reduce((s, p) => s + (p.completed || 0), 0),
    };
  }, [all, pos]);

  return (
    <div className="bg-page bdz bpo">
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Purchase orders</span>
            <h1>Purchase orders</h1>
            <p>PO amounts include GST · a PO is used up only by invoices</p>
          </div>
          <button type="button" className="bpo-new" onClick={() => setNewPo("")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New PO
          </button>
        </div>
        {loading ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat"><span>Purchase orders</span><b>{pos.length.toLocaleString("en-IN")}</b><em>{summary.services.toLocaleString("en-IN")} services · {summary.completed.toLocaleString("en-IN")} completed</em></div>
            <div className="bdz-hstat aqua"><span>Total PO value</span><b title={formatInr(summary.value)}>{shortInr(summary.value)}</b><em>{counts.none ? `${counts.none} PO${counts.none === 1 ? "" : "s"} without amount` : "incl. GST"}</em></div>
            <div className="bdz-hstat blue"><span>Invoiced</span><b title={formatInr(summary.invoiced)}>{shortInr(summary.invoiced)}</b><em>{pctOf(summary.invoiced, summary.value) ?? 0}% of PO value used</em></div>
            <div className={`bdz-hstat ${summary.balance < 0 ? "red" : ""}`}><span>Balance remaining</span><b title={formatInr(summary.balance)}>{shortInr(summary.balance)}</b><em>{shortInr(summary.assigned)} of work on POs</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      <section className="bdz-panel bnp-panel">
        <div className="bnp-toolbar">
          <div className="bpm-seg" role="tablist" aria-label="Filter POs">
            {[["all", "All", pos.length], ["ok", "Balance left", counts.ok || 0], ["work", "Work > PO", counts.work || 0], ["used", "Used up", (counts.used || 0) + (counts.over || 0)], ["none", "No amount", counts.none || 0]].map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l} <b>{n}</b></button>
            ))}
          </div>
          <div className="bpo-tools">
            <select className="bpo-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <form
              className="bnp-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const typed = query.trim().toLowerCase();
                const exact = typed && pos.find((p) => p.po_number.toLowerCase() === typed);
                if (exact) onOpen(exact.po_number);
              }}
            >
              <SearchIcon />
              <input value={query} maxLength={100} placeholder="Search PO, property or flat" aria-label="Search POs" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            </form>
          </div>
        </div>

        {loading ? (
          <div className="bpm-skel-grid" role="status" aria-label="Loading POs">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 60, borderRadius: 12 }} />)}
          </div>
        ) : !pos.length ? (
          <div className="bnp-empty">
            <span aria-hidden="true">+</span>
            <strong>No purchase orders yet</strong>
            <p>Use “New PO” to create one, or type a PO number while booking.</p>
          </div>
        ) : !shown.length ? (
          <div className="bnp-empty muted">
            <strong>No matching POs</strong>
            {query.trim() ? (
              <button type="button" className="bpo-create-link" onClick={() => setNewPo(query.trim())}>Create a new PO “{query.trim()}”</button>
            ) : <p>Try another filter or search.</p>}
          </div>
        ) : (
          <div className="bnp-scroll">
            <table className="bnp-table bpo-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Property · flats</th>
                  <th className="num">Services</th>
                  <th className="num">PO amount</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Balance</th>
                  <th style={{ width: 170 }}>Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, f }) => {
                  const invPct = f.amount ? Math.min((f.invoiced / f.amount) * 100, 100) : 0;
                  const workPct = f.amount ? Math.min((Math.max(f.assigned - f.invoiced, 0) / f.amount) * 100, 100 - invPct) : 0;
                  return (
                    <tr key={p.po_number} tabIndex={0} onClick={() => onOpen(p.po_number)} onKeyDown={(e) => e.key === "Enter" && onOpen(p.po_number)}>
                      <td>
                        <div className="bnp-who">
                          <span className="bpo-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
                          </span>
                          <span><strong>{p.po_number}</strong><small className="bpo-meta">{p.po_date ? formatDate(p.po_date) : "No date"} · {p.po_source || "Source not set"}</small></span>
                        </div>
                      </td>
                      <td className="bpo-props">
                        <span>{p.properties.join(", ") || <em className="bnp-muted">No services yet</em>}</span>
                        {p.flats.length > 0 && <small title={p.flats.join(", ")}>{p.flats.length} flat{p.flats.length === 1 ? "" : "s"} · {p.flats.slice(0, 4).join(", ")}{p.flats.length > 4 ? "…" : ""}</small>}
                      </td>
                      <td className="num">
                        <strong>{p.totals.services}</strong>
                        <small className="bpo-sub">{p.completed || 0} done{p.pending_flats > 0 ? ` · ${p.pending_flats} pending` : ""}</small>
                      </td>
                      <td className="num"><Money value={f.amount} /></td>
                      <td className="num">{formatInr(f.invoiced)}</td>
                      <td className="num bnp-price"><Money value={f.balance} signed /></td>
                      <td>
                        {f.amount ? (
                          <span className="bpo-used" title={`Invoiced ${formatInr(f.invoiced)} · work on PO ${formatInr(f.assigned)} of ${formatInr(f.amount)}`}>
                            <span className="bpo-used-bar"><i className="inv" style={{ width: `${invPct}%` }} /><i className="work" style={{ width: `${workPct}%` }} /></span>
                            <small>{pctOf(f.invoiced, f.amount)}%</small>
                          </span>
                        ) : <span className="bnp-muted">—</span>}
                      </td>
                      <td><span className={`bpo-pill ${STATE[f.state][0]}`}>{STATE[f.state][1]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="bpo-legend"><span><i className="inv" />Invoiced</span><span><i className="work" />Work on the PO, not invoiced yet</span></div>
      </section>

      {newPo !== null && (
        <NewPoDialog
          initial={newPo}
          existing={pos}
          onClose={() => setNewPo(null)}
          onCreate={(number) => {
            setNewPo(null);
            onOpen(number);
          }}
        />
      )}
    </div>
  );
}
