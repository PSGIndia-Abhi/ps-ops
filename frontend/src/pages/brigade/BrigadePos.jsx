import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { brigadeRequest, formatDate, formatInr } from "./brigadeShared";
import KpiTile from "./KpiTile";
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

/** Assigned value vs PO amount. Red past 100%. */
function Bar({ value, poAmount }) {
  if (!poAmount) return <div className="bgb-bar empty" />;
  const pct = (value / poAmount) * 100;
  return (
    <div className={`bgb-bar ${pct > 100 ? "over" : pct === 100 ? "full" : ""}`} role="img" aria-label={`${Math.round(pct)}% of PO used`}>
      <span style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PO list                                                             */
/* ------------------------------------------------------------------ */

function PoTable({ onOpen }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [newPo, setNewPo] = useState(null); // null | prefilled PO number

  useEffect(() => {
    brigadeRequest("/api/brigade/pos")
      .then((rows) => setPos(Array.isArray(rows) ? rows : []))
      .catch((err) => setError(err.message || "Failed to load POs"))
      .finally(() => setLoading(false));
  }, []);

  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      pos.filter(
        (p) => !term || [p.po_number, p.po_source, ...p.properties, ...p.flats].some((v) => String(v || "").toLowerCase().includes(term))
      ),
    [pos, term]
  );

  const summary = useMemo(() => {
    const withAmount = pos.filter((p) => p.totals.po_amount !== null);
    return {
      value: round2(withAmount.reduce((s, p) => s + p.totals.po_amount, 0)),
      assigned: round2(pos.reduce((s, p) => s + (p.totals.billed_incl ?? p.totals.billed), 0)),
      services: pos.reduce((s, p) => s + p.totals.services, 0),
      completed: pos.reduce((s, p) => s + (p.completed || 0), 0),
    };
  }, [pos]);

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Purchase Orders</h2>
          <p className="bgb-lede">Create and manage client POs: details, files, the services on each PO and their prices. PO amounts include GST; services get 18% GST (CGST 9% + SGST 9%).</p>
        </div>
        <button type="button" className="primary bgb-new-po" onClick={() => setNewPo("")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New PO
        </button>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgk-grid" aria-label="PO summary">
        <KpiTile icon="file" tone="blue" label="Purchase orders" value={pos.length} note={`${shown.length} shown`} />
        <KpiTile icon="rupee" tone="violet" label="Total PO value" value={formatInr(summary.value)} note="Sum of PO amounts" />
        <KpiTile icon="receipt" tone="green" label="Assigned services" value={summary.services} note={`${summary.completed} completed`} />
        <KpiTile icon="wallet" tone="amber" label="Assigned value incl. GST" value={formatInr(summary.assigned)} note="Those services with 18% GST" />
      </section>

      <section className="bgb-sheet">
        <div className="bgb-sheet-toolbar">
          <span className="bgb-sub">Open a PO to manage its details, services and prices.</span>
          <form
            className="bgb-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const typed = query.trim().toLowerCase();
              const exact = typed && pos.find((p) => p.po_number.toLowerCase() === typed);
              if (exact) onOpen(exact.po_number);
            }}
          >
            <SearchIcon />
            <input
              value={query}
              maxLength={100}
              placeholder="Search PO, property or flat"
              aria-label="Search POs"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </form>
        </div>

        {loading ? (
          <div className="bg-loading bgb-pad">Loading POs…</div>
        ) : !pos.length ? (
          <div className="bg-empty-state">
            <strong>No purchase orders yet</strong>
            Use “New PO” to create one, or type a PO number while booking.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching POs</strong>
            {query.trim() ? (
              <button type="button" className="bg-link-btn" onClick={() => setNewPo(query.trim())}>
                Create a new PO “{query.trim()}”
              </button>
            ) : (
              "Try another search."
            )}
          </div>
        ) : (
          <div className="bg-table-wrap">
            <table className="bgb-ledger">
              <thead>
                <tr>
                  <th className="bgb-col-po">PO number</th>
                  <th>PO date</th>
                  <th>Property · flats</th>
                  <th className="num">Services</th>
                  <th className="num">PO amount</th>
                  <th className="num">Assigned value</th>
                  <th className="num">Balance</th>
                  <th style={{ width: 160 }}>Used</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  // PO amount includes GST: compare with services + pending flats, both with GST.
                  const usedIncl = round2((p.totals.billed_incl ?? p.totals.billed) + (p.totals.pending_incl || 0));
                  const balance = p.totals.po_amount === null ? null : round2(p.totals.po_amount - usedIncl);
                  const pct = pctOf(usedIncl, p.totals.po_amount);
                  return (
                    <tr key={p.po_number} tabIndex={0} onClick={() => onOpen(p.po_number)} onKeyDown={(e) => e.key === "Enter" && onOpen(p.po_number)}>
                      <td>
                        <div className="bgb-po-no">{p.po_number}</div>
                        <div className="bgb-sub">{p.po_source || "Source not set"}</div>
                      </td>
                      <td className="bgb-nowrap">{p.po_date ? formatDate(p.po_date) : <span className="bgb-muted">—</span>}</td>
                      <td>
                        <div>{p.properties.join(", ") || <span className="bgb-muted">No services yet</span>}</div>
                        {p.flats.length > 0 && <div className="bgb-sub">{p.flats.join(", ")}</div>}
                      </td>
                      <td className="num">
                        {p.totals.services}
                        <div className="bgb-sub">{p.completed || 0} completed</div>
                        {p.pending_flats > 0 && <div className="bgb-sub bgb-pending-note">{p.pending_flats} flat{p.pending_flats === 1 ? "" : "s"} pending</div>}
                      </td>
                      <td className="num"><Money value={p.totals.po_amount} /></td>
                      <td className="num">{formatInr(usedIncl)}</td>
                      <td className="num bgb-strong"><Money value={balance} signed /></td>
                      <td>
                        <div className="bgb-util">
                          <Bar value={usedIncl} poAmount={p.totals.po_amount} />
                          <span>{pct === null ? "—" : `${pct}%`}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
