import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { brigadeRequest, formatDate, formatInr, poState, round2, usedPct } from "./brigadeShared";
import KpiTile from "./KpiTile";
import PoSheet, { Money, SearchIcon, StateBadge, UsageBar } from "./PoSheet";
import "./brigade.css";

// Brigade billing (/brigade/billing): VIEW ONLY. Every PO with its completed services,
// totals with GST and the balance; inside a PO, tick completed services and
// Preview -> Generate the tax invoice. POs, prices and services are managed in the
// PO section. The open PO lives in the URL (?po=) so the browser back button returns.
export default function BrigadeBilling() {
  const [params, setParams] = useSearchParams();
  const openPo = params.get("po");

  function open(number) {
    setParams(number ? { po: number } : {});
  }

  return openPo ? (
    <PoSheet key={openPo} mode="billing" number={openPo} onBack={() => open(null)} onOpen={open} />
  ) : (
    <PoList onOpen={open} />
  );
}

/* ------------------------------------------------------------------ */
/* PO list                                                             */
/* ------------------------------------------------------------------ */

const LIST_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "full", label: "Fully used" },
  { key: "over", label: "Over the PO" },
  { key: "none", label: "No PO amount" },
];

function PoList({ onOpen }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    brigadeRequest("/api/brigade/billing/pos")
      .then((rows) =>
        setPos((Array.isArray(rows) ? rows : []).map((p) => ({ ...p, state: poState(p.totals.po_amount, p.totals.balance) })))
      )
      .catch((err) => setError(err.message || "Failed to load POs"))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: pos.length };
    for (const p of pos) c[p.state.key] = (c[p.state.key] || 0) + 1;
    return c;
  }, [pos]);

  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      pos.filter(
        (p) =>
          (filter === "all" || p.state.key === filter) &&
          (!term ||
            [p.po_number, p.po_source, ...p.properties, ...p.flats].some((v) =>
              String(v || "").toLowerCase().includes(term)
            ))
      ),
    [pos, term, filter]
  );

  const summary = useMemo(() => {
    const withAmount = pos.filter((p) => p.totals.po_amount !== null);
    return {
      value: round2(withAmount.reduce((s, p) => s + p.totals.po_amount, 0)),
      billedAgainst: round2(withAmount.reduce((s, p) => s + (p.totals.billed_incl ?? p.totals.billed), 0)),
      billed: round2(pos.reduce((s, p) => s + (p.totals.billed_incl ?? p.totals.billed), 0)),
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

  const overallPct = usedPct(summary.billedAgainst, summary.value);

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Billing</h2>
          <p className="bgb-lede">Completed services billed against each client PO, and the tax invoices. View only — POs, prices and services are managed in the PO section. PO amounts include GST.</p>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgk-grid" aria-label="Billing summary">
        <KpiTile
          icon="file"
          tone="blue"
          label="Purchase orders"
          value={pos.length}
          note={`${counts.open || 0} open · ${counts.full || 0} fully used`}
        />
        <KpiTile
          icon="rupee"
          tone="violet"
          label="Total PO value"
          value={formatInr(summary.value)}
          note={counts.none ? `${counts.none} PO${counts.none === 1 ? "" : "s"} without an amount` : "All POs have an amount"}
        />
        <KpiTile
          icon="receipt"
          tone="green"
          label="Billed incl. GST"
          value={formatInr(summary.billed)}
          progress={overallPct}
          note={overallPct === null ? "No PO amounts yet" : `${overallPct}% of PO value`}
        />
        <KpiTile
          icon="wallet"
          tone={summary.balance < 0 || summary.over ? "red" : "amber"}
          label="Balance"
          value={<Money value={summary.balance} signed />}
          note={summary.over ? `${summary.over} PO${summary.over === 1 ? "" : "s"} over the PO amount` : "No PO over its amount"}
          noteTone={summary.over ? "bad" : undefined}
        />
      </section>

      <section className="bgb-sheet">
        <div className="bgb-sheet-toolbar">
          <div className="bgb-tabs" role="tablist" aria-label="Filter POs">
            {LIST_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`bgb-tab ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span>{counts[f.key] || 0}</span>
              </button>
            ))}
          </div>
          <form className="bgb-search" onSubmit={submit} role="search">
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
            POs appear here once they are created in the PO section or typed during booking.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching POs</strong>
            Try another search or filter. New POs are created in the PO section.
          </div>
        ) : (
          <div className="bg-table-wrap">
            <table className="bgb-ledger">
              <thead>
                <tr>
                  <th className="bgb-col-po">PO number</th>
                  <th>PO date</th>
                  <th>Property · flats</th>
                  <th className="num">Lines</th>
                  <th className="num">PO amount</th>
                  <th className="num">Completed incl. GST</th>
                  <th className="num">Balance</th>
                  <th style={{ width: 170 }}>Utilisation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const billedIncl = p.totals.billed_incl ?? p.totals.billed;
                  const pct = usedPct(billedIncl, p.totals.po_amount);
                  return (
                    <tr
                      key={p.po_number}
                      tabIndex={0}
                      onClick={() => onOpen(p.po_number)}
                      onKeyDown={(e) => e.key === "Enter" && onOpen(p.po_number)}
                    >
                      <td>
                        <div className="bgb-po-no">{p.po_number}</div>
                        <div className="bgb-sub">{p.po_source || "Source not set"}</div>
                      </td>
                      <td className="bgb-nowrap">{p.po_date ? formatDate(p.po_date) : <span className="bgb-muted">—</span>}</td>
                      <td>
                        <div>{p.properties.join(", ") || <span className="bgb-muted">No services yet</span>}</div>
                        {p.flats.length > 0 && <div className="bgb-sub">{p.flats.join(", ")}</div>}
                      </td>
                      <td className="num">{p.totals.services}</td>
                      <td className="num"><Money value={p.totals.po_amount} /></td>
                      <td className="num">{formatInr(billedIncl)}</td>
                      <td className="num bgb-strong"><Money value={p.totals.balance} signed /></td>
                      <td>
                        <div className="bgb-util">
                          <UsageBar billed={billedIncl} poAmount={p.totals.po_amount} />
                          <span>{pct === null ? "—" : `${pct}%`}</span>
                        </div>
                      </td>
                      <td><StateBadge state={p.state} /></td>
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
