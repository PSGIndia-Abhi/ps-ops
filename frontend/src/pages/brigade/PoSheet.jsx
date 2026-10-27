import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatusAlertModal from "../../components/StatusAlertModal";
import {
  brigadeBasePath,
  brigadeRequest,
  formatDate,
  formatInr,
  gstOn,
  poMatch,
  poState,
  round2,
  statusLabel,
  toNumber,
  usedPct,
} from "./brigadeShared";
import BrigadeBookingModal from "./BrigadeBookingModal";
import { GstRows, PoCheck } from "./PoCheck";
import PoFiles from "./PoFiles";
import PoInvoices from "./PoInvoices";
import "./brigade.css";

// One client PO, shown the same way in two places:
//  mode="manage" (PO section, /brigade/pos?po=): everything about the PO - details, files,
//    every service on it (any status) with its price for this PO, the flats booked on it that
//    are not scheduled yet, invoices. PO details, prices and services can be changed here.
//  mode="billing" (Billing, /brigade/billing?po=): view only - completed services, GST totals,
//    and Preview -> Generate invoice. Nothing about the PO is edited in Billing.
// Service prices exclude GST; GST is 18% (CGST 9% + SGST 9%); the PO amount includes GST.

/* ------------------------------------------------------------------ */
/* Shared bits (also used by the PO and Billing lists)                 */
/* ------------------------------------------------------------------ */

export function StateBadge({ state }) {
  return <span className={`bgb-badge ${state.tone}`}>{state.label}</span>;
}

// Used (incl. GST) vs PO amount. Red past 100%.
export function UsageBar({ billed, poAmount }) {
  if (!poAmount) return <div className="bgb-bar empty" />;
  const pct = (billed / poAmount) * 100;
  return (
    <div className={`bgb-bar ${pct > 100 ? "over" : pct >= 99.99 ? "full" : ""}`} role="img" aria-label={`${Math.round(pct)}% of PO`}>
      <span style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function Money({ value, signed }) {
  if (value === null || value === undefined) return <span className="bgb-muted">—</span>;
  return <span className={signed && value < 0 ? "bgb-neg" : undefined}>{formatInr(value)}</span>;
}

export function SearchIcon() {
  return (
    <svg className="bgb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* New PO (PO section)                                                 */
/* ------------------------------------------------------------------ */

// Enter the client PO number; the PO then opens to fill in its details and services.
export function NewPoDialog({ initial, existing, onClose, onCreate }) {
  const [number, setNumber] = useState(initial || "");
  const value = number.trim();
  const match = value && existing.find((p) => p.po_number.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e) {
    e.preventDefault();
    if (!value) return;
    onCreate(match ? match.po_number : value);
  }

  return (
    <div className="bgm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="bgb-newpo" role="dialog" aria-modal="true" aria-labelledby="bgb-newpo-title" onSubmit={submit}>
        <div className="bgb-newpo-head">
          <span className="bgb-newpo-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
              <path d="M14 3v5h5M12 11v6M9 14h6" />
            </svg>
          </span>
          <div>
            <h3 id="bgb-newpo-title">New purchase order</h3>
            <p>Enter the client PO number. Next you add the PO details and the services it covers.</p>
          </div>
        </div>

        <div className="bgb-meta-field">
          <label htmlFor="bgb-newpo-number">PO number</label>
          <input
            id="bgb-newpo-number"
            value={number}
            maxLength={100}
            placeholder="e.g. 4500012345"
            autoFocus
            autoComplete="off"
            onChange={(e) => setNumber(e.target.value)}
          />
          {match ? (
            <span className="bgb-newpo-note warn">PO {match.po_number} already exists — it will open as it is.</span>
          ) : (
            <span className="bgb-newpo-note">Use the number exactly as it is on the client&apos;s PO.</span>
          )}
        </div>

        <div className="bgb-newpo-foot">
          <button type="button" className="bgb-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!value}>
            {match ? "Open PO" : "Create PO"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One PO                                                              */
/* ------------------------------------------------------------------ */

function rowsFrom(po) {
  return po.services.map((s) => ({ ...s, amountText: s.amount === null ? "" : String(s.amount) }));
}

function formFrom(po) {
  return {
    po_source: po.po_source || "",
    po_date: po.po_date || "",
    po_amount: po.po_amount === null ? "" : String(po.po_amount),
  };
}

export default function PoSheet({ number, mode, onBack, onOpen }) {
  const manage = mode === "manage";
  const navigate = useNavigate();
  const [po, setPo] = useState(null);
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [removed, setRemoved] = useState([]); // saved services taken off this PO (manage)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [picking, setPicking] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [booking, setBooking] = useState(false); // "+ Book flat": booking form fixed to this PO
  // Billing: services ticked for the next invoice (job ids).
  const [invoicePick, setInvoicePick] = useState(() => new Set());

  const apply = useCallback((data) => {
    setPo(data);
    setForm(formFrom(data));
    setRows(rowsFrom(data));
    setRemoved([]);
    setInvoicePick(new Set());
  }, []);

  // The PO section sees every service on the PO (any status) + pending flats; Billing completed ones.
  const url = manage
    ? `/api/brigade/pos/detail?number=${encodeURIComponent(number)}`
    : `/api/brigade/billing/po?number=${encodeURIComponent(number)}`;
  const load = useCallback(
    () => brigadeRequest(url).then(apply),
    [url, apply]
  );

  useEffect(() => {
    load()
      .catch((err) => setLoadError(err.message || "Failed to load PO"))
      .finally(() => setLoading(false));
  }, [load]);

  const dirty = useMemo(() => {
    if (!manage || !po || !form) return false;
    if (removed.length) return true;
    if (JSON.stringify(form) !== JSON.stringify(formFrom(po))) return true;
    const before = rowsFrom(po).map((r) => [r.job_id, r.amountText]);
    const after = rows.map((r) => [r.job_id, r.amountText]);
    return JSON.stringify(before) !== JSON.stringify(after);
  }, [manage, po, form, rows, removed]);

  const pendingFlats = manage ? po?.pending_flats || [] : [];
  const poAmount = toNumber(form?.po_amount); // incl. GST
  const servicesValue = round2(rows.reduce((s, r) => s + (toNumber(r.amountText) || 0), 0)); // excl. GST
  const pendingValue = round2(pendingFlats.reduce((s, f) => s + (f.value || 0), 0)); // excl. GST
  const onPo = round2(servicesValue + pendingValue);
  const onPoIncl = gstOn(onPo).total;
  const balance = poAmount === null ? null : round2(poAmount - onPoIncl);
  const state = poState(poAmount, balance);
  const pct = usedPct(onPoIncl, poAmount);
  // Everything on the PO (with GST) against the PO amount (incl. GST) - a message, never a block.
  const poCheck = po && (rows.length || pendingFlats.length) ? poMatch({ poAmount, value: onPo }) : null;
  const invalidIds = new Set(
    rows.filter((r) => toNumber(r.amountText) === null || toNumber(r.amountText) < 0).map((r) => r.job_id)
  );
  const poAmountInvalid = form?.po_amount !== "" && (poAmount === null || poAmount < 0);
  const properties = [...new Set([...rows, ...pendingFlats].map((r) => r.property).filter(Boolean))];
  const done = rows.filter((r) => r.status === "COMPLETED");

  // Services grouped by property + flat, numbered across groups.
  const groups = useMemo(() => {
    const map = new Map();
    let line = 0;
    for (const r of rows) {
      const key = `${r.property || ""}|${r.flat_number || ""}`;
      if (!map.has(key)) map.set(key, { key, property: r.property, flat: r.flat_number, bhk: r.bhk, rows: [] });
      map.get(key).rows.push({ ...r, line: ++line });
    }
    return [...map.values()];
  }, [rows]);

  function setAmount(jobId, value) {
    setRows((prev) => prev.map((r) => (r.job_id === jobId ? { ...r, amountText: value } : r)));
  }

  function removeRow(row) {
    setRows((prev) => prev.filter((r) => r.job_id !== row.job_id));
    if (row.amount_saved) setRemoved((prev) => [...prev, row.job_id]);
  }

  function addServices(services) {
    setRows((prev) => [
      ...prev,
      ...services.map((s) => ({ ...s, added: true, amountText: s.booked_price === null ? "" : String(s.booked_price) })),
    ]);
    const ids = new Set(services.map((s) => s.job_id));
    setRemoved((prev) => prev.filter((id) => !ids.has(id)));
    setPicking(false);
  }

  function togglePick(jobId) {
    setInvoicePick((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  const pickable = manage ? [] : rows.filter((r) => !invalidIds.has(r.job_id));
  const pickedRows = pickable.filter((r) => invoicePick.has(r.job_id));
  const allPicked = pickable.length > 0 && pickedRows.length === pickable.length;
  const pickedAmount = round2(pickedRows.reduce((s, r) => s + (toNumber(r.amountText) || 0), 0));

  async function save() {
    if (invalidIds.size) {
      const names = rows.filter((r) => invalidIds.has(r.job_id)).map((r) => `${r.sub_service} (Flat ${r.flat_number})`);
      return setStatus({ type: "error", message: `Enter a price of 0 or more for ${names.join(", ")}.` });
    }
    if (poAmountInvalid) return setStatus({ type: "error", message: "PO amount must be a number of 0 or more." });
    setSaving(true);
    try {
      const data = await brigadeRequest("/api/brigade/billing/po", {
        method: "PUT",
        body: JSON.stringify({
          po_number: po.po_number,
          po_source: form.po_source,
          po_date: form.po_date,
          po_amount: form.po_amount,
          lines: rows.map((r) => ({ job_id: r.job_id, amount: r.amountText })),
          remove_job_ids: removed,
        }),
      });
      if (data.po_number !== number) onOpen(data.po_number);
      else await load();
      setStatus({ type: "success", message: `PO ${data.po_number} saved` });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (dirty) setConfirmLeave(true);
    else onBack();
  }

  const jobBase = brigadeBasePath();
  const saveNote = dirty ? "Unsaved changes" : po?.is_new ? "Not saved yet" : "All changes saved";
  const actions = po && manage && (
    <div className={`bgb-save ${dirty ? "dirty" : ""}`}>
      <span className="bgb-save-note">{saveNote}</span>
      <button type="button" className="bgb-btn-ghost" onClick={() => apply(po)} disabled={!dirty || saving}>Discard</button>
      <button type="button" className="primary" onClick={save} disabled={!dirty || saving}>
        {saving ? "Saving…" : po.is_new ? "Save PO" : "Save changes"}
      </button>
    </div>
  );

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <nav className="bgb-crumbs" aria-label="Breadcrumb">
            <button type="button" onClick={back}>{manage ? "Purchase Orders" : "Billing"}</button>
            <span aria-hidden="true">›</span>
            <span>{po?.po_number || number}</span>
          </nav>
          <div className="bgb-title-row">
            <h2 className="bgb-h1">{po?.po_number || number}</h2>
            {po && <StateBadge state={state} />}
            {po?.is_new && <span className="bgb-badge muted">New</span>}
            {!manage && <span className="bgb-badge muted">View only</span>}
          </div>
        </div>
        <div className="bgb-topbar-actions">
          {!manage && (
            po && (
              <button
                type="button"
                className="bgb-btn-outline"
                onClick={() => navigate(`${jobBase}/pos?po=${encodeURIComponent(po.po_number)}`)}
              >
                Manage in PO section
              </button>
            )
          )}
        </div>
      </div>

      {loadError && <div className="bg-error">{loadError}</div>}

      {loading ? (
        <section className="bgb-sheet"><div className="bg-loading bgb-pad">Loading PO…</div></section>
      ) : po && (
        <article className="bgb-sheet bgb-doc">
          <header className="bgb-doc-head">
            <div className="bgb-doc-party">
              <span className="bgb-eyebrow">Client purchase order</span>
              <strong>Brigade Group</strong>
              <span className="bgb-sub">{properties.length ? properties.join(", ") : "No property yet"}</span>
              {!manage && (
                <span className="bgb-sub">Completed services only. Prices, services and PO details are changed in the PO section.</span>
              )}
            </div>
            <div className={`bgb-doc-status ${state.key}`}>
              <span className="bgb-eyebrow">Balance</span>
              <strong>{balance === null ? "—" : formatInr(balance)}</strong>
              <UsageBar billed={onPoIncl} poAmount={poAmount} />
              <span className="bgb-sub">
                {pct === null
                  ? manage ? "Enter the PO amount to track it" : "No PO amount yet"
                  : `${formatInr(onPoIncl)} incl. GST ${manage ? "on this PO" : "completed"} · ${pct}% of PO`}
              </span>
            </div>
          </header>

          {/* PO details */}
          <section className="bgb-doc-meta">
            <div className="bgb-meta-field">
              <label htmlFor="bgb-date">PO date</label>
              {manage ? (
                <input id="bgb-date" type="date" value={form.po_date} onChange={(e) => setForm((f) => ({ ...f, po_date: e.target.value }))} />
              ) : (
                <span className="bgb-meta-value">{po.po_date ? formatDate(po.po_date) : "—"}</span>
              )}
            </div>
            <div className="bgb-meta-field">
              <label htmlFor="bgb-amount">PO amount (incl. GST)</label>
              {manage ? (
                <div className={`bgb-money ${poAmountInvalid ? "invalid" : ""}`}>
                  <span aria-hidden="true">₹</span>
                  <input
                    id="bgb-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.po_amount}
                    placeholder="0.00"
                    onChange={(e) => setForm((f) => ({ ...f, po_amount: e.target.value }))}
                  />
                </div>
              ) : (
                <span className="bgb-meta-value"><Money value={poAmount} /></span>
              )}
            </div>
            <div className="bgb-meta-field wide">
              <label htmlFor="bgb-source">Received from / reference</label>
              {manage ? (
                <input
                  id="bgb-source"
                  value={form.po_source}
                  maxLength={255}
                  placeholder="e.g. Email from Brigade FM"
                  onChange={(e) => setForm((f) => ({ ...f, po_source: e.target.value }))}
                />
              ) : (
                <span className="bgb-meta-value">{po.po_source || "—"}</span>
              )}
            </div>
            <div className="bgb-meta-field full">
              <label>Files</label>
              <PoFiles poNumber={po.po_number} readOnly={!manage} />
            </div>
          </section>

          {/* Flats booked on this PO, not scheduled yet (PO section) */}
          {pendingFlats.length > 0 && (
            <section className="bgb-doc-lines bgb-pending-flats">
              <div className="bgb-lines-bar">
                <h3>Waiting to be scheduled <span className="bgb-count">{pendingFlats.length}</span></h3>
                <span className="bgb-sub">Booked on this PO, no visit date or team yet (Dashboard → Pending)</span>
              </div>
              <ul className="bgb-pending-list">
                {pendingFlats.map((f) => (
                  <li key={f.request_id}>
                    <span className="bgb-strong">{f.property}</span>
                    <span className="bgf-bhk">Flat {f.flat_number} · {f.bhk}</span>
                    <span className="bgb-sub">{f.services.map((x) => x.sub_service).join(", ") || "No services yet"}</span>
                    <span className="bgb-pending-value">{formatInr(gstOn(f.value).total)} <small>incl. GST</small></span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Services */}
          <section className="bgb-doc-lines">
            <div className="bgb-lines-bar">
              <h3>
                {manage ? "Services on this PO" : "Completed services"} <span className="bgb-count">{rows.length}</span>
              </h3>
              {manage ? (
                <div className="bgb-lines-actions">
                  {rows.length > 0 && (
                    <span className="bgb-sub">{done.length} completed · {rows.length - done.length} not completed yet</span>
                  )}
                  <button type="button" className="bgb-btn-outline" onClick={() => setPicking(true)}>+ Add services</button>
                  <BookFlatButton po={po} dirty={dirty} onClick={() => setBooking(true)} />
                </div>
              ) : (
                <span className="bgb-sub">Tick the services to put on the invoice</span>
              )}
            </div>

            {!rows.length ? (
              <div className="bg-empty-state bgb-lines-empty">
                <strong>{manage ? "No services on this PO yet" : "No completed services yet"}</strong>
                {manage ? (
                  <span className="bgb-empty-actions">
                    <button type="button" className="bg-link-btn" onClick={() => setPicking(true)}>
                      Add booked services
                    </button>
                    <span className="bgb-muted">or</span>
                    <BookFlatButton po={po} dirty={dirty} onClick={() => setBooking(true)} link />
                  </span>
                ) : (
                  "Services show here once they are completed."
                )}
              </div>
            ) : (
              <div className="bg-table-wrap">
                <table className="bgb-ledger bgb-items">
                  <thead>
                    <tr>
                      <th style={{ width: manage ? 44 : 64 }}>
                        {manage ? (
                          "#"
                        ) : (
                          <label className="bgb-pick" title="Select all for the invoice">
                            <input
                              type="checkbox"
                              checked={allPicked}
                              disabled={!pickable.length}
                              onChange={() => setInvoicePick(allPicked ? new Set() : new Set(pickable.map((r) => r.job_id)))}
                              aria-label="Select all services for the invoice"
                            />
                            #
                          </label>
                        )}
                      </th>
                      <th>Service</th>
                      <th>Status</th>
                      <th className="num">Booked price</th>
                      <th className="num" style={{ width: manage ? 180 : 150 }}>{manage ? "Price on this PO" : "Amount"}</th>
                      {manage && <th style={{ width: 44 }} aria-label="Remove" />}
                    </tr>
                  </thead>
                  {groups.map((g) => {
                    const subtotal = round2(g.rows.reduce((s, r) => s + (toNumber(r.amountText) || 0), 0));
                    return (
                      <tbody key={g.key}>
                        <tr className="bgb-group">
                          <td />
                          <td colSpan={3}>
                            <span className="bgb-strong">{g.property || "—"}</span>
                            {g.flat && <span className="bgb-flat">Flat {g.flat}</span>}
                            {g.bhk && <span className="bgb-sub-inline">{g.bhk}</span>}
                          </td>
                          <td className="num bgb-sub-inline">{formatInr(subtotal)}</td>
                          {manage && <td />}
                        </tr>
                        {g.rows.map((r) => {
                          const amt = toNumber(r.amountText);
                          const diff = amt !== null && r.booked_price !== null ? round2(amt - r.booked_price) : 0;
                          return (
                            <tr key={r.job_id} className={r.added ? "bgb-added" : undefined}>
                              <td className="bgb-line-no">
                                {manage ? (
                                  r.line
                                ) : (
                                  <label className="bgb-pick">
                                    <input
                                      type="checkbox"
                                      checked={invoicePick.has(r.job_id)}
                                      disabled={invalidIds.has(r.job_id)}
                                      onChange={() => togglePick(r.job_id)}
                                      aria-label={`Put ${r.code} ${r.sub_service} on the invoice`}
                                    />
                                    {r.line}
                                  </label>
                                )}
                              </td>
                              <td>
                                <div className="bgb-strong">{r.sub_service}</div>
                                <div className="bgb-sub">
                                  <button type="button" className="bgb-code" onClick={() => navigate(`${jobBase}/jobs/${r.job_id}`)}>
                                    {r.code}
                                  </button>
                                  {r.start_date && <> · {formatDate(r.start_date)}</>}
                                  {r.from_booking && <> · <span className="bgb-tag"><LockIcon /> Booked on this PO</span></>}
                                  {r.added && <> · <span className="bgb-tag new">New line</span></>}
                                  {r.invoiced_in?.length > 0 && (
                                    <> · <span className="bgb-tag invoiced" title="Already on a tax invoice">Invoiced {r.invoiced_in.join(", ")}</span></>
                                  )}
                                </div>
                              </td>
                              <td><span className={`bg-status ${r.status}`}>{statusLabel(r.status)}</span></td>
                              <td className="num bgb-muted">{formatInr(r.booked_price)}</td>
                              <td className="num">
                                {manage ? (
                                  <div className={`bgb-money compact ${invalidIds.has(r.job_id) ? "invalid" : ""}`}>
                                    <span aria-hidden="true">₹</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      inputMode="decimal"
                                      value={r.amountText}
                                      placeholder="0.00"
                                      aria-label={`Price on this PO for ${r.code} ${r.sub_service}`}
                                      onChange={(e) => setAmount(r.job_id, e.target.value)}
                                    />
                                  </div>
                                ) : invalidIds.has(r.job_id) ? (
                                  <span className="bgb-no-price">No price</span>
                                ) : (
                                  <strong>{formatInr(amt)}</strong>
                                )}
                                {diff !== 0 && (
                                  <div className={`bgb-diff ${diff > 0 ? "up" : "down"}`}>
                                    {diff > 0 ? "+" : "−"}{formatInr(Math.abs(diff))} vs booked
                                  </div>
                                )}
                              </td>
                              {manage && (
                                <td className="num">
                                  {!r.from_booking && (
                                    <button
                                      type="button"
                                      className="bgb-icon-btn"
                                      onClick={() => removeRow(r)}
                                      aria-label={`Remove ${r.code} from this PO`}
                                      title="Remove from this PO"
                                    >
                                      ×
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </section>

          {poCheck && <PoCheck check={poCheck} className="bgb-doc-check" />}

          {/* Totals */}
          <footer className="bgb-doc-foot">
            <p className="bgb-doc-note">
              {manage
                ? "Every service on this PO in any status, and the flats booked on it that are not scheduled yet. The price on this PO starts at the booked price and can be changed here (the price master is not changed). Prices exclude GST; 18% GST (CGST 9% + SGST 9%) is added and the PO amount includes GST."
                : "Completed services only; others appear once they are done. Amounts exclude GST; 18% GST (CGST 9% + SGST 9%) is added and the PO amount includes GST."}
            </p>
            <dl className="bgb-totals">
              {manage && pendingFlats.length > 0 && (
                <>
                  <div className="bgc-row muted"><dt>Services ({rows.length})</dt><dd>{formatInr(servicesValue)}</dd></div>
                  <div className="bgc-row muted"><dt>Pending flats ({pendingFlats.length})</dt><dd>{formatInr(pendingValue)}</dd></div>
                </>
              )}
              <GstRows
                value={onPo}
                label={manage ? "On this PO (excl. GST)" : `Completed (${rows.length}, excl. GST)`}
                totalLabel={manage ? "On this PO incl. GST" : "Completed incl. GST"}
              />
              {!manage && (
                <div className="bgb-picked-total"><dt>Selected for invoice ({pickedRows.length}, incl. GST)</dt><dd>{formatInr(gstOn(pickedAmount).total)}</dd></div>
              )}
              <div><dt>PO amount (incl. GST)</dt><dd><Money value={poAmount} /></dd></div>
              <div className="grand">
                <dt>Balance</dt>
                <dd><Money value={balance} signed /></dd>
              </div>
            </dl>
          </footer>

          {/* Tax invoices: generated in Billing; the PO section lists them */}
          <PoInvoices
            poNumber={po.po_number}
            readOnly={manage}
            selected={{ ids: pickedRows.map((r) => r.job_id), count: pickedRows.length, amount: pickedAmount }}
            blockedReason={
              manage
                ? ""
                : po.is_new
                  ? "This PO has no saved details yet."
                  : !rows.length
                    ? "No completed services on this PO yet."
                    : !pickedRows.length
                      ? "Tick the completed services above to put them on the invoice."
                      : ""
            }
          />
        </article>
      )}

      {/* Save / Discard stay at the bottom of the screen while the PO is edited below. */}
      {manage && po && <div className="bgb-stickybar">{actions}</div>}

      {/* Book a new flat on this PO: the booking form with the PO fixed; it goes to Pending. */}
      {booking && (
        <BrigadeBookingModal
          isOpen
          presetPo={po.po_number}
          onClose={() => setBooking(false)}
          onCreated={() => load().catch(() => {})}
        />
      )}

      {picking && (
        <AddServicesModal exclude={new Set(rows.map((r) => r.job_id))} onAdd={addServices} onClose={() => setPicking(false)} />
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="Your changes to this PO will be lost."
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

// "+ Book flat": a flat not booked yet - property, flat no, BHK (price master) and services in
// the booking form, saved to Pending on this PO. The PO has to be saved first (the booking uses
// its saved details).
function BookFlatButton({ po, dirty, onClick, link = false }) {
  const reason = po.is_new ? "Save the PO first" : dirty ? "Save your changes first" : "";
  return (
    <button
      type="button"
      className={link ? "bg-link-btn" : "primary bgb-book-flat"}
      onClick={onClick}
      disabled={Boolean(reason)}
      title={reason || "Book a new flat on this PO: flat no, BHK and services - it goes to Pending"}
    >
      {link ? "book a new flat on this PO" : "+ Book flat"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Add services: Brigade services not on any PO yet (any status)       */
/* ------------------------------------------------------------------ */

function AddServicesModal({ exclude, onAdd, onClose }) {
  const [properties, setProperties] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [flat, setFlat] = useState("");
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(() => new Map());

  useEffect(() => {
    brigadeRequest("/api/brigade/properties")
      .then((rows) => setProperties(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (companyId) q.set("company_id", companyId);
    if (flat.trim()) q.set("flat_number", flat.trim().toUpperCase());
    const timer = setTimeout(() => {
      setLoading(true);
      brigadeRequest(`/api/brigade/billing/unassigned-services?${q}`)
        .then((rows) => {
          setServices(Array.isArray(rows) ? rows : []);
          setError("");
        })
        .catch((err) => setError(err.message || "Failed to load services"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [companyId, flat]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = services.filter((s) => !exclude.has(s.job_id));
  const pickedTotal = round2([...picked.values()].reduce((s, x) => s + (x.booked_price || 0), 0));

  function toggle(service) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(service.job_id)) next.delete(service.job_id);
      else next.set(service.job_id, service);
      return next;
    });
  }

  const allShownPicked = list.length > 0 && list.every((s) => picked.has(s.job_id));
  function toggleAll() {
    setPicked((prev) => {
      const next = new Map(prev);
      for (const s of list) {
        if (allShownPicked) next.delete(s.job_id);
        else next.set(s.job_id, s);
      }
      return next;
    });
  }

  return (
    <div className="bgm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bgm-modal bgb-picker" role="dialog" aria-modal="true" aria-labelledby="bgb-pick-title">
        <div className="bgm-header">
          <div>
            <h3 id="bgb-pick-title">Add services to PO</h3>
            <p>Brigade services that are not on any PO yet — scheduled, in progress or completed</p>
          </div>
          <button type="button" className="bgm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="bgb-pick-filters">
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Property">
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="bgb-search slim">
            <SearchIcon />
            <input
              value={flat}
              placeholder="Flat, e.g. L-0123"
              maxLength={10}
              aria-label="Flat"
              onChange={(e) => setFlat(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="bgb-pick-body">
          {error && <div className="bg-error">{error}</div>}

          {loading && !services.length ? (
            <div className="bg-loading bgb-pad">Loading services…</div>
          ) : !list.length ? (
            <div className="bg-empty-state">
              <strong>No services without a PO</strong>
              {companyId || flat ? "Try another property or flat." : "Every Brigade service is already on a PO."}
            </div>
          ) : (
            <table className="bgb-ledger">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input type="checkbox" checked={allShownPicked} onChange={toggleAll} aria-label="Select all shown" />
                  </th>
                  <th>Service</th>
                  <th>Property · flat</th>
                  <th>Status</th>
                  <th className="num">Booked price</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.job_id} className={picked.has(s.job_id) ? "bgb-picked" : undefined} onClick={() => toggle(s)}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.has(s.job_id)}
                        onChange={() => toggle(s)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${s.code}`}
                      />
                    </td>
                    <td>
                      <div className="bgb-strong">{s.sub_service}</div>
                      <div className="bgb-sub">{s.code}{s.start_date && <> · {formatDate(s.start_date)}</>}</div>
                    </td>
                    <td>
                      <div>{s.property}</div>
                      <div className="bgb-sub">{[s.flat_number, s.bhk].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td><span className={`bg-status ${s.status}`}>{statusLabel(s.status)}</span></td>
                    <td className="num">{formatInr(s.booked_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bgb-pick-foot">
          <span className="bgb-sub-inline">
            {picked.size ? `${picked.size} selected · ${formatInr(pickedTotal)} + GST` : "Select the services this PO covers"}
          </span>
          <div className="bgb-pick-actions">
            <button type="button" className="bgb-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="primary" disabled={!picked.size} onClick={() => onAdd([...picked.values()])}>
              Add {picked.size || ""} service{picked.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
