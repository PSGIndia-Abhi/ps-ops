import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  brigadeBasePath,
  brigadeRequest,
  downloadInvoice,
  formatDate,
  formatInr,
  listInvoices,
  statusLabel,
} from "./brigadeShared";
import KpiTile from "./KpiTile";
import PoFiles from "./PoFiles";
import "./brigade.css";

// PO tab: every client PO and, inside one, every service assigned to it - whatever its
// status (not started, in progress, completed) - with its amount. Read only: amounts come
// from the booking; billing and invoices are done in Billing (completed services only).
// The open PO lives in the URL (?po=) so the browser back button returns to the list.
export default function BrigadePos() {
  const [params, setParams] = useSearchParams();
  const openPo = params.get("po");
  const open = (number) => setParams(number ? { po: number } : {});
  return openPo ? <PoDetail key={openPo} number={openPo} onBack={() => open(null)} /> : <PoTable onOpen={open} />;
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
      assigned: round2(pos.reduce((s, p) => s + p.totals.billed, 0)),
      services: pos.reduce((s, p) => s + p.totals.services, 0),
      completed: pos.reduce((s, p) => s + (p.completed || 0), 0),
    };
  }, [pos]);

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Purchase Orders</h2>
          <p className="bgb-lede">Every client PO and the services assigned to it, whatever their status. Amounts exclude GST.</p>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgk-grid" aria-label="PO summary">
        <KpiTile icon="file" tone="blue" label="Purchase orders" value={pos.length} note={`${shown.length} shown`} />
        <KpiTile icon="rupee" tone="violet" label="Total PO value" value={formatInr(summary.value)} note="Sum of PO amounts" />
        <KpiTile icon="receipt" tone="green" label="Assigned services" value={summary.services} note={`${summary.completed} completed`} />
        <KpiTile icon="wallet" tone="amber" label="Assigned value" value={formatInr(summary.assigned)} note="Booked value of those services" />
      </section>

      <section className="bgb-sheet">
        <div className="bgb-sheet-toolbar">
          <span className="bgb-sub">Click a PO to see its services.</span>
          <form className="bgb-search" onSubmit={(e) => e.preventDefault()} role="search">
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
            POs typed during booking or created in Billing appear here.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching POs</strong>
            Try another search.
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
                  const balance = p.totals.po_amount === null ? null : round2(p.totals.po_amount - p.totals.billed);
                  const pct = pctOf(p.totals.billed, p.totals.po_amount);
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
                      </td>
                      <td className="num"><Money value={p.totals.po_amount} /></td>
                      <td className="num">{formatInr(p.totals.billed)}</td>
                      <td className="num bgb-strong"><Money value={balance} signed /></td>
                      <td>
                        <div className="bgb-util">
                          <Bar value={p.totals.billed} poAmount={p.totals.po_amount} />
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One PO                                                              */
/* ------------------------------------------------------------------ */

function PoDetail({ number, onBack }) {
  const navigate = useNavigate();
  const [po, setPo] = useState(null);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    brigadeRequest(`/api/brigade/pos/detail?number=${encodeURIComponent(number)}`)
      .then(setPo)
      .catch((err) => setError(err.message || "Failed to load PO"));
    listInvoices(number)
      .then((rows) => setInvoices(Array.isArray(rows) ? rows : []))
      .catch(() => setInvoices([])); // invoices not set up yet: the list just stays empty
  }, [number]);

  // Services grouped by property + flat, numbered across groups.
  const groups = useMemo(() => {
    const map = new Map();
    let line = 0;
    for (const s of po?.services || []) {
      const key = `${s.property || ""}|${s.flat_number || ""}`;
      if (!map.has(key)) map.set(key, { key, property: s.property, flat: s.flat_number, bhk: s.bhk, rows: [] });
      map.get(key).rows.push({ ...s, line: ++line });
    }
    return [...map.values()];
  }, [po]);

  const services = po?.services || [];
  const assigned = round2(services.reduce((s, r) => s + (r.amount || 0), 0));
  const done = services.filter((s) => s.status === "COMPLETED");
  const doneValue = round2(done.reduce((s, r) => s + (r.amount || 0), 0));
  const poAmount = po?.po_amount ?? null;
  const balance = poAmount === null ? null : round2(poAmount - assigned);
  const pct = pctOf(assigned, poAmount);
  const jobBase = brigadeBasePath();

  async function download(inv) {
    try {
      await downloadInvoice(inv);
    } catch (err) {
      setError(err.message || "Could not download the invoice");
    }
  }

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <nav className="bgb-crumbs" aria-label="Breadcrumb">
            <button type="button" onClick={onBack}>Purchase Orders</button>
            <span aria-hidden="true">›</span>
            <span>{po?.po_number || number}</span>
          </nav>
          <h2 className="bgb-h1">{po?.po_number || number}</h2>
        </div>
        <div className="bgb-topbar-actions">
          <button type="button" className="bgb-btn-outline" onClick={() => navigate(`${jobBase}/billing?po=${encodeURIComponent(po?.po_number || number)}`)}>
            Open in Billing
          </button>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}

      {!po && !error ? (
        <section className="bgb-sheet"><div className="bg-loading bgb-pad">Loading PO…</div></section>
      ) : po && (
        <article className="bgb-sheet bgb-doc">
          <header className="bgb-doc-head">
            <div className="bgb-doc-party">
              <span className="bgb-eyebrow">Client purchase order</span>
              <strong>Brigade Group</strong>
              <span className="bgb-sub">{[...new Set(services.map((s) => s.property).filter(Boolean))].join(", ") || "No property yet"}</span>
            </div>
            <div className="bgb-doc-status">
              <span className="bgb-eyebrow">Balance</span>
              <strong>{balance === null ? "—" : formatInr(balance)}</strong>
              <Bar value={assigned} poAmount={poAmount} />
              <span className="bgb-sub">{pct === null ? "No PO amount set" : `${formatInr(assigned)} assigned · ${pct}% of PO`}</span>
            </div>
          </header>

          <section className="bgb-doc-meta">
            <div className="bgb-meta-field">
              <label>PO date</label>
              <span className="bgb-meta-value">{po.po_date ? formatDate(po.po_date) : "—"}</span>
            </div>
            <div className="bgb-meta-field">
              <label>PO amount</label>
              <span className="bgb-meta-value"><Money value={poAmount} /></span>
            </div>
            <div className="bgb-meta-field wide">
              <label>Received from / reference</label>
              <span className="bgb-meta-value">{po.po_source || "—"}</span>
            </div>
            <div className="bgb-meta-field full">
              <label>Files</label>
              <PoFiles poNumber={po.po_number} />
            </div>
          </section>

          <section className="bgb-doc-lines">
            <div className="bgb-lines-bar">
              <h3>Assigned services <span className="bgb-count">{services.length}</span></h3>
              <span className="bgb-sub">{done.length} completed · {services.length - done.length} not completed yet</span>
            </div>

            {!services.length ? (
              <div className="bg-empty-state bgb-lines-empty">
                <strong>No services on this PO yet</strong>
                Services booked with this PO number, or added to it in Billing, appear here.
              </div>
            ) : (
              <div className="bg-table-wrap">
                <table className="bgb-ledger bgb-items">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th>Service</th>
                      <th>Status</th>
                      <th className="num">Booked rate</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  {groups.map((g) => (
                    <tbody key={g.key}>
                      <tr className="bgb-group">
                        <td />
                        <td colSpan={3}>
                          <span className="bgb-strong">{g.property || "—"}</span>
                          {g.flat && <span className="bgb-flat">Flat {g.flat}</span>}
                          {g.bhk && <span className="bgb-sub-inline">{g.bhk}</span>}
                        </td>
                        <td className="num bgb-sub-inline">{formatInr(round2(g.rows.reduce((s, r) => s + (r.amount || 0), 0)))}</td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={r.job_id} style={{ cursor: "default" }}>
                          <td className="bgb-line-no">{r.line}</td>
                          <td>
                            <div className="bgb-strong">{r.sub_service}</div>
                            <div className="bgb-sub">
                              <button type="button" className="bgb-code" onClick={() => navigate(`${jobBase}/jobs/${r.job_id}`)}>
                                {r.code}
                              </button>
                              {r.start_date && <> · {formatDate(r.start_date)}</>}
                            </div>
                          </td>
                          <td><span className={`bg-status ${r.status}`}>{statusLabel(r.status)}</span></td>
                          <td className="num bgb-muted">{formatInr(r.booked_price)}</td>
                          <td className="num"><strong>{r.amount === null ? <span className="bgb-muted">No price</span> : formatInr(r.amount)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>

          <footer className="bgb-doc-foot">
            <p className="bgb-doc-note">
              All services on this PO, in any status. Amounts are in INR and exclude GST. Completed services can be billed and invoiced in Billing.
            </p>
            <dl className="bgb-totals">
              <div><dt>Assigned value ({services.length})</dt><dd>{formatInr(assigned)}</dd></div>
              <div><dt>Completed ({done.length})</dt><dd>{formatInr(doneValue)}</dd></div>
              <div><dt>Not completed yet ({services.length - done.length})</dt><dd>{formatInr(round2(assigned - doneValue))}</dd></div>
              <div><dt>PO amount</dt><dd><Money value={poAmount} /></dd></div>
              <div className="grand"><dt>Balance</dt><dd><Money value={balance} signed /></dd></div>
            </dl>
          </footer>

          <section className="bgb-invoices">
            <div className="bgb-lines-bar">
              <h3>Invoices <span className="bgb-count">{invoices.length}</span></h3>
            </div>
            {!invoices.length ? (
              <div className="bgb-sub">No invoices yet. Invoices are generated in Billing from completed services.</div>
            ) : (
              <table className="bgb-invoice-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Date</th>
                    <th>Services</th>
                    <th className="num">Total</th>
                    <th aria-label="Download" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td><strong>{inv.invoice_number}</strong></td>
                      <td>{formatDate(inv.invoice_date)}</td>
                      <td>{inv.lines}</td>
                      <td className="num"><strong>{formatInr(inv.total)}</strong></td>
                      <td className="num"><button type="button" className="bg-link-btn" onClick={() => download(inv)}>Download PDF</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </article>
      )}
    </div>
  );
}
