import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { brigadeRequest, formatDate, formatInr, gstOn, poFileProblem, round2, statusLabel, toNumber, uploadPoFile } from "./brigadeShared";
import { SearchIcon } from "./PoSheet";
import "./brigade.css";

// Services without PO (/brigade/no-po): every Brigade service that is not under any PO yet (booked
// before the client's PO came). Filter by property, flat and status, tick services and "Add to PO":
// an existing PO (its details are kept) or a new one (number, date, amount, source, optional copy).
// Each ticked service's price on the PO starts at its booked price and can be changed. Adding is never
// blocked; a PO whose services would come to more than its amount gets a warning (invoices on a PO are
// still blocked over its amount).

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "done", label: "Completed" },
  { key: "open", label: "Not done yet" },
];

export default function BrigadeNoPo() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [property, setProperty] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [picked, setPicked] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(null); // { po_number, count }

  // Loads the list (loading starts true; a reload after adding keeps the old rows until the new ones come).
  const load = useCallback(() => (
    brigadeRequest("/api/brigade/billing/unassigned-services")
      .then((list) => { setRows(Array.isArray(list) ? list : []); setError(""); })
      .catch((err) => setError(err.message || "Failed to load services"))
      .finally(() => setLoading(false))
  ), []);
  useEffect(() => { load(); }, [load]);

  const properties = useMemo(() => [...new Set(rows.map((r) => r.property).filter(Boolean))].sort(), [rows]);
  const term = query.trim().toLowerCase();
  const inScope = rows.filter((r) => (!property || r.property === property) && (!term || [r.flat_number, r.sub_service, r.code, r.bhk].some((v) => String(v || "").toLowerCase().includes(term))));
  const counts = { all: inScope.length, done: inScope.filter((r) => r.status === "COMPLETED").length, open: inScope.filter((r) => r.status !== "COMPLETED").length };
  const shown = inScope.filter((r) => tab === "all" || (tab === "done" ? r.status === "COMPLETED" : r.status !== "COMPLETED"));
  const value = (list) => round2(list.reduce((t, r) => t + (Number(r.amount) || 0), 0));
  const pickedRows = rows.filter((r) => picked.has(r.job_id));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.job_id));

  function toggle(id) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleShown() {
    setPicked((p) => {
      const n = new Set(p);
      if (allShownPicked) shown.forEach((r) => n.delete(r.job_id));
      else shown.forEach((r) => n.add(r.job_id));
      return n;
    });
  }

  const doneCount = rows.filter((r) => r.status === "COMPLETED").length;
  const doneValue = value(rows.filter((r) => r.status === "COMPLETED"));
  const byProperty = properties.map((p) => ({ name: p, count: rows.filter((r) => r.property === p).length }));

  return (
    <div className="bg-page bdz bnp">
      <section className="bdz-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Purchase orders</span>
            <h1>Services without PO</h1>
            <p>Booked before the client&apos;s PO came. Tick them and add them to a PO, then they can be invoiced.</p>
          </div>
        </div>
        {loading && !rows.length ? (
          <div className="bdz-hero-kpis bnp-kpis">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" />)}</div>
        ) : (
          <div className="bdz-hero-kpis bnp-kpis">
            <div className="bdz-hstat red"><span>Waiting for a PO</span><b>{rows.length.toLocaleString("en-IN")}</b><em>{properties.length} propert{properties.length === 1 ? "y" : "ies"}</em></div>
            <div className="bdz-hstat aqua"><span>Completed · can bill once on a PO</span><b>{doneCount.toLocaleString("en-IN")}</b><em>{formatInr(gstOn(doneValue).total)} incl. GST</em></div>
            <div className="bdz-hstat"><span>Not done yet</span><b>{(rows.length - doneCount).toLocaleString("en-IN")}</b><em>Booked or in progress</em></div>
            <div className="bdz-hstat blue"><span>Total value</span><b title={formatInr(gstOn(value(rows)).total)}>{shortInr(gstOn(value(rows)).total)}</b><em>incl. GST · at booked prices</em></div>
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}
      {done && (
        <div className="bnp-done" role="status">
          <span className="bnp-done-icon" aria-hidden="true">✓</span>
          <div>
            <strong>{done.count} service{done.count === 1 ? "" : "s"} added to PO {done.po_number}</strong>
            <span>They are no longer in this list.</span>
          </div>
          <button type="button" className="bnp-done-open" onClick={() => navigate(`/brigade/pos?po=${encodeURIComponent(done.po_number)}`)}>Open the PO →</button>
          <button type="button" className="bnp-done-x" aria-label="Close" onClick={() => setDone(null)}>×</button>
        </div>
      )}

      <section className="bdz-panel bnp-panel">
        {byProperty.length > 1 && (
          <div className="bnp-props" role="radiogroup" aria-label="Property">
            <button type="button" role="radio" aria-checked={!property} className={!property ? "on" : ""} onClick={() => setProperty("")}>
              All properties <span>{rows.length}</span>
            </button>
            {byProperty.map((p) => (
              <button key={p.name} type="button" role="radio" aria-checked={property === p.name} className={property === p.name ? "on" : ""} onClick={() => setProperty(property === p.name ? "" : p.name)}>
                <i aria-hidden="true">{initials(p.name)}</i>{p.name} <span>{p.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bnp-toolbar">
          <div className="bpm-seg" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
                {t.label} <b>{counts[t.key]}</b>
              </button>
            ))}
          </div>
          <div className="bnp-search">
            <SearchIcon />
            <input value={query} maxLength={100} placeholder="Flat, service or job code" aria-label="Search services" onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {loading ? (
          <div className="bpm-skel-grid" role="status" aria-label="Loading services">
            {Array.from({ length: 7 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 56, borderRadius: 12 }} />)}
          </div>
        ) : !rows.length ? (
          <div className="bnp-empty">
            <span aria-hidden="true">✓</span>
            <strong>Every service is on a PO</strong>
            <p>Nothing is waiting for a PO.</p>
          </div>
        ) : !shown.length ? (
          <div className="bnp-empty muted"><strong>No matching services</strong><p>Try another property, status or search.</p></div>
        ) : (
          <div className="bnp-scroll">
            <table className="bnp-table">
              <thead>
                <tr>
                  <th className="bnp-check"><input type="checkbox" checked={allShownPicked} onChange={toggleShown} aria-label="Tick every service shown" /></th>
                  <th>Property · flat</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="num">Booked price</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.job_id} className={picked.has(r.job_id) ? "picked" : ""} onClick={() => toggle(r.job_id)}>
                    <td className="bnp-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(r.job_id)} onChange={() => toggle(r.job_id)} aria-label={`Tick ${r.sub_service}, flat ${r.flat_number}`} />
                    </td>
                    <td>
                      <div className="bnp-who">
                        <span className="bnp-avatar" aria-hidden="true">{initials(r.property)}</span>
                        <span><strong>Flat {r.flat_number}{r.bhk ? <em> · {r.bhk}</em> : null}</strong><small>{r.property || "—"}</small></span>
                      </div>
                    </td>
                    <td><strong className="bnp-svc">{r.sub_service}</strong><small className="bnp-code">{r.code}</small></td>
                    <td><span className={`bnp-status ${r.status === "COMPLETED" ? "done" : "open"}`}><i aria-hidden="true" />{statusLabel(r.status)}</span></td>
                    <td className="bnp-date">{r.start_date ? formatDate(r.start_date) : <span className="bnp-muted">—</span>}</td>
                    <td className="num bnp-price">{r.amount === null || r.amount === undefined ? <span className="bnp-noprice">No price</span> : formatInr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pickedRows.length > 0 && (
        <div className="bnp-bar" role="region" aria-label="Selected services">
          <span className="bnp-bar-count">{pickedRows.length}</span>
          <div>
            <strong>service{pickedRows.length === 1 ? "" : "s"} selected</strong>
            <span>{formatInr(gstOn(value(pickedRows)).total)} incl. GST · {[...new Set(pickedRows.map((r) => r.property))].join(", ")}</span>
          </div>
          <button type="button" className="bnp-bar-clear" onClick={() => setPicked(new Set())}>Clear</button>
          <button type="button" className="bnp-bar-go" onClick={() => setAdding(true)}>Add to PO →</button>
        </div>
      )}

      {adding && (
        <AddToPoDialog
          services={pickedRows}
          onClose={() => setAdding(false)}
          onDone={(poNumber, count) => {
            setAdding(false);
            setPicked(new Set());
            setDone({ po_number: poNumber, count });
            load();
          }}
        />
      )}
    </div>
  );
}

const initials = (name) => String(name || "?").replace(/^brigade\s+/i, "").trim().slice(0, 2).toUpperCase();
function shortInr(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return formatInr(v);
}

/** Add the ticked services to an existing PO or a new one, each at a price on the PO. */
function AddToPoDialog({ services, onClose, onDone }) {
  const [pos, setPos] = useState(null);
  const [mode, setMode] = useState("existing");
  const [poNumber, setPoNumber] = useState("");
  const [poSearch, setPoSearch] = useState("");
  const [fresh, setFresh] = useState({ number: "", date: new Date().toISOString().slice(0, 10), amount: "", source: "" });
  const [file, setFile] = useState(null);
  const [prices, setPrices] = useState(() => Object.fromEntries(services.map((s) => [s.job_id, s.amount === null || s.amount === undefined ? "" : String(s.amount)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    brigadeRequest("/api/brigade/pos").then((rows) => setPos(Array.isArray(rows) ? rows : [])).catch(() => setPos([]));
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const lines = services.map((s) => ({ ...s, price: toNumber(prices[s.job_id]) }));
  const missing = lines.filter((l) => l.price === null || l.price < 0);
  const addValue = round2(lines.reduce((t, l) => t + (l.price || 0), 0));
  const addIncl = gstOn(addValue).total;
  const term = poSearch.trim().toLowerCase();
  const poList = (pos || []).filter((p) => !term || [p.po_number, p.po_source, ...(p.properties || [])].some((v) => String(v || "").toLowerCase().includes(term)));
  const chosen = mode === "existing" ? (pos || []).find((p) => p.po_number === poNumber) : null;
  const typedClash = mode === "new" && fresh.number.trim() && (pos || []).find((p) => p.po_number.toLowerCase() === fresh.number.trim().toLowerCase());

  // Everything on the PO after adding (with GST) against the PO amount (incl. GST): a warning, never a block.
  const poAmount = mode === "existing" ? chosen?.totals?.po_amount ?? null : toNumber(fresh.amount);
  const onPoBefore = mode === "existing" && chosen ? round2((chosen.totals.billed_incl ?? chosen.totals.billed ?? 0) + (chosen.totals.pending_incl || 0)) : 0;
  const onPoAfter = round2(onPoBefore + addIncl);
  const over = poAmount !== null && poAmount !== undefined && onPoAfter > poAmount + 0.5;

  async function save() {
    setError("");
    if (missing.length) return setError(`Enter a price of 0 or more for ${missing.map((l) => `${l.sub_service} (Flat ${l.flat_number})`).join(", ")}.`);
    const body = { lines: lines.map((l) => ({ job_id: l.job_id, amount: l.price })) };
    if (mode === "existing") {
      if (!chosen) return setError("Choose the PO.");
    } else {
      if (!fresh.number.trim()) return setError("Enter the PO number.");
      if (typedClash) return setError(`PO ${typedClash.po_number} already exists - choose it under "Existing PO".`);
      if (!fresh.date) return setError("Enter the PO date.");
      if (toNumber(fresh.amount) === null) return setError("Enter the PO amount (incl. GST).");
      if (!fresh.source.trim()) return setError("Enter where the PO came from (e.g. Email from Brigade purchase team).");
      if (file && poFileProblem(file)) return setError(poFileProblem(file));
    }
    setSaving(true);
    try {
      let number;
      if (mode === "existing") {
        number = chosen.po_number;
        await brigadeRequest("/api/brigade/billing/po/services", { method: "POST", body: JSON.stringify({ po_number: number, ...body }) });
      } else {
        const saved = await brigadeRequest("/api/brigade/billing/po", {
          method: "PUT",
          body: JSON.stringify({ po_number: fresh.number.trim(), po_source: fresh.source.trim(), po_date: fresh.date, po_amount: fresh.amount, ...body }),
        });
        number = saved.po_number;
        if (file) await uploadPoFile(number, file).catch(() => setError(`PO ${number} saved, but the file did not upload - add it on the PO page.`));
      }
      onDone(number, lines.length);
    } catch (err) {
      setError(err.message || "Could not add the services to the PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bgm-overlay" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bgn-dialog" role="dialog" aria-modal="true" aria-labelledby="bgn-title">
        <header className="bgn-dialog-head">
          <div>
            <h3 id="bgn-title">Add {services.length} service{services.length === 1 ? "" : "s"} to a PO</h3>
            <p>{formatInr(addIncl)} incl. GST · {[...new Set(services.map((s) => s.property))].join(", ")}</p>
          </div>
          <button type="button" className="bgb-btn-ghost" onClick={onClose} disabled={saving}>Close</button>
        </header>

        <div className="bgn-dialog-body">
          <div className="bgn-mode" role="radiogroup" aria-label="Which PO">
            <button type="button" role="radio" aria-checked={mode === "existing"} className={mode === "existing" ? "on" : ""} onClick={() => setMode("existing")}>Existing PO</button>
            <button type="button" role="radio" aria-checked={mode === "new"} className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>New PO</button>
          </div>

          {mode === "existing" ? (
            <div className="bgn-po-pick">
              <div className="bgb-search">
                <SearchIcon />
                <input value={poSearch} placeholder="Search PO number, source or property" onChange={(e) => setPoSearch(e.target.value)} aria-label="Search POs" autoFocus />
              </div>
              <div className="bgn-po-list" role="listbox" aria-label="POs">
                {pos === null && <div className="bg-loading">Loading POs…</div>}
                {pos && !poList.length && <div className="bgb-sub bgb-pad">No PO matches. Use “New PO” if the PO is not in the system yet.</div>}
                {poList.map((p) => {
                  const bal = p.totals?.balance;
                  return (
                    <button key={p.po_number} type="button" role="option" aria-selected={poNumber === p.po_number} className={poNumber === p.po_number ? "on" : ""} onClick={() => setPoNumber(p.po_number)}>
                      <span><strong>{p.po_number}</strong><small>{p.po_date ? formatDate(p.po_date) : "No date"} · {(p.properties || []).join(", ") || "No services yet"}</small></span>
                      <span className="num"><small>PO amount</small>{p.totals?.po_amount === null || p.totals?.po_amount === undefined ? "—" : formatInr(p.totals.po_amount)}<small>{bal === null || bal === undefined ? "" : `Balance ${formatInr(bal)}`}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bgn-new">
              <label><span>PO number</span><input value={fresh.number} maxLength={100} onChange={(e) => setFresh({ ...fresh, number: e.target.value })} autoFocus /></label>
              <label><span>PO date</span><input type="date" value={fresh.date} onChange={(e) => setFresh({ ...fresh, date: e.target.value })} /></label>
              <label><span>PO amount (incl. GST)</span><input type="number" min="0" step="0.01" value={fresh.amount} onChange={(e) => setFresh({ ...fresh, amount: e.target.value })} /></label>
              <label className="wide"><span>Where it came from</span><input value={fresh.source} maxLength={255} placeholder="e.g. Email from Brigade purchase team" onChange={(e) => setFresh({ ...fresh, source: e.target.value })} /></label>
              <label className="wide"><span>PO copy (optional)</span><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
              {typedClash && <div className="bg-field-error wide">PO {typedClash.po_number} already exists - choose it under “Existing PO”.</div>}
            </div>
          )}

          <div className="bgn-lines">
            <div className="bgn-lines-head"><span>Service</span><span className="num">Price on this PO (excl. GST)</span></div>
            {lines.map((l) => (
              <div key={l.job_id} className="bgn-line">
                <span><strong>{l.sub_service}</strong><small>{l.property} · Flat {l.flat_number} · {statusLabel(l.status)}</small></span>
                <input type="number" min="0" step="0.01" value={prices[l.job_id]} onChange={(e) => setPrices({ ...prices, [l.job_id]: e.target.value })} aria-label={`Price for ${l.sub_service}, flat ${l.flat_number}`} />
              </div>
            ))}
          </div>

          {(chosen || mode === "new") && poAmount !== null && poAmount !== undefined && (
            <div className={`bgc-check ${over ? "warn" : "ok"}`} role={over ? "alert" : "status"}>
              <span className="bgc-check-icon" aria-hidden="true">{over ? "!" : "✓"}</span>
              <div>
                <strong>{over ? "More than the PO amount" : "Within the PO amount"}</strong>
                <p>
                  {mode === "existing" ? `Already on this PO ${formatInr(onPoBefore)} + these ${formatInr(addIncl)} = ${formatInr(onPoAfter)} incl. GST` : `These services ${formatInr(addIncl)} incl. GST`}
                  {` of ${formatInr(poAmount)}.`}
                  {over ? " You can still add them, but invoices on this PO cannot go over its amount." : ""}
                </p>
              </div>
            </div>
          )}
          {error && <div className="bg-error">{error}</div>}
        </div>

        <footer className="bgn-dialog-foot">
          <button type="button" className="bgb-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="primary" onClick={save} disabled={saving || (mode === "existing" && !chosen)}>
            {saving ? "Adding…" : mode === "existing" ? `Add to ${chosen ? chosen.po_number : "PO"}` : "Create PO and add"}
          </button>
        </footer>
      </div>
    </div>
  );
}
