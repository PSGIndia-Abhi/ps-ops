import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatusAlertModal from "../../components/StatusAlertModal";
import {
  brigadeBasePath,
  brigadeRequest,
  formatDate,
  formatInr,
  statusLabel,
} from "./brigadeShared";
import KpiTile from "./KpiTile";
import "./brigade.css";

// Brigade billing: client PO -> the services billed under it, with an amount
// per service. Used by admin (/admin/brigade-billing) and the Brigade
// Executive (/brigade/billing). The open PO lives in the URL (?po=) so the
// browser back button returns to the list.
export default function BrigadeBilling() {
  const [params, setParams] = useSearchParams();
  const openPo = params.get("po");

  function open(number) {
    setParams(number ? { po: number } : {});
  }

  return openPo ? (
    <PoEditor key={openPo} number={openPo} onBack={() => open(null)} onOpen={open} />
  ) : (
    <PoList onOpen={open} />
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Where a PO stands: drives the status badge, bar colour and list filters.
function poState(poAmount, balance) {
  if (poAmount === null) return { key: "none", tone: "muted", label: "No PO amount" };
  if (balance < 0) return { key: "over", tone: "danger", label: "Over-billed" };
  if (balance === 0) return { key: "full", tone: "ok", label: "Fully billed" };
  return { key: "open", tone: "info", label: "Open" };
}

function usedPct(billed, poAmount) {
  return poAmount ? Math.round((billed / poAmount) * 100) : null;
}

function StateBadge({ state }) {
  return <span className={`bgb-badge ${state.tone}`}>{state.label}</span>;
}

// Billed vs PO amount. Red past 100%.
function UsageBar({ billed, poAmount }) {
  if (!poAmount) return <div className="bgb-bar empty" />;
  const pct = (billed / poAmount) * 100;
  return (
    <div className={`bgb-bar ${pct > 100 ? "over" : pct === 100 ? "full" : ""}`} role="img" aria-label={`${Math.round(pct)}% billed`}>
      <span style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function Money({ value, signed }) {
  if (value === null || value === undefined) return <span className="bgb-muted">—</span>;
  return <span className={signed && value < 0 ? "bgb-neg" : undefined}>{formatInr(value)}</span>;
}

function SearchIcon() {
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
/* PO list                                                             */
/* ------------------------------------------------------------------ */

const LIST_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "full", label: "Fully billed" },
  { key: "over", label: "Over-billed" },
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
      billedAgainst: round2(withAmount.reduce((s, p) => s + p.totals.billed, 0)),
      billed: round2(pos.reduce((s, p) => s + p.totals.billed, 0)),
      balance: round2(withAmount.reduce((s, p) => s + p.totals.balance, 0)),
      over: counts.over || 0,
    };
  }, [pos, counts]);

  const typed = query.trim();
  const exact = typed && pos.find((p) => p.po_number.toLowerCase() === typed.toLowerCase());

  function submit(e) {
    e.preventDefault();
    if (typed) onOpen(exact ? exact.po_number : typed);
  }

  const overallPct = usedPct(summary.billedAgainst, summary.value);

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <h2 className="bgb-h1">Billing</h2>
          <p className="bgb-lede">Client purchase orders and the services billed against them. Amounts exclude GST.</p>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}

      <section className="bgk-grid" aria-label="Billing summary">
        <KpiTile
          icon="file"
          tone="blue"
          label="Purchase orders"
          value={pos.length}
          note={`${counts.open || 0} open · ${counts.full || 0} fully billed`}
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
          label="Billed"
          value={formatInr(summary.billed)}
          progress={overallPct}
          note={overallPct === null ? "No PO amounts yet" : `${overallPct}% of PO value`}
        />
        <KpiTile
          icon="wallet"
          tone={summary.balance < 0 || summary.over ? "red" : "amber"}
          label="Balance"
          value={<Money value={summary.balance} signed />}
          note={summary.over ? `${summary.over} PO${summary.over === 1 ? "" : "s"} over-billed` : "No PO over-billed"}
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
              aria-label="Search or open a PO"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="primary" disabled={!typed}>
              {typed && !exact ? "+ New PO" : "Open"}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="bg-loading bgb-pad">Loading POs…</div>
        ) : !pos.length ? (
          <div className="bg-empty-state">
            <strong>No purchase orders yet</strong>
            POs typed during booking appear here. To start one, type its number in the search box and press New PO.
          </div>
        ) : !shown.length ? (
          <div className="bg-empty-state">
            <strong>No matching POs</strong>
            {typed && !exact ? (
              <button type="button" className="bg-link-btn" onClick={() => onOpen(typed)}>
                Start a new PO “{typed}”
              </button>
            ) : (
              "Try another search or filter."
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
                  <th className="num">Lines</th>
                  <th className="num">PO amount</th>
                  <th className="num">Billed</th>
                  <th className="num">Balance</th>
                  <th style={{ width: 170 }}>Utilisation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const pct = usedPct(p.totals.billed, p.totals.po_amount);
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
                      <td className="num">{formatInr(p.totals.billed)}</td>
                      <td className="num bgb-strong"><Money value={p.totals.balance} signed /></td>
                      <td>
                        <div className="bgb-util">
                          <UsageBar billed={p.totals.billed} poAmount={p.totals.po_amount} />
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

/* ------------------------------------------------------------------ */
/* One PO: details, line items, totals                                 */
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

function PoEditor({ number, onBack, onOpen }) {
  const navigate = useNavigate();
  const [po, setPo] = useState(null);
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [removed, setRemoved] = useState([]); // saved services taken off this PO
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [picking, setPicking] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const apply = useCallback((data) => {
    setPo(data);
    setForm(formFrom(data));
    setRows(rowsFrom(data));
    setRemoved([]);
  }, []);

  useEffect(() => {
    brigadeRequest(`/api/brigade/billing/po?number=${encodeURIComponent(number)}`)
      .then(apply)
      .catch((err) => setLoadError(err.message || "Failed to load PO"))
      .finally(() => setLoading(false));
  }, [number, apply]);

  const dirty = useMemo(() => {
    if (!po || !form) return false;
    if (removed.length) return true;
    if (JSON.stringify(form) !== JSON.stringify(formFrom(po))) return true;
    const before = rowsFrom(po).map((r) => [r.job_id, r.amountText]);
    const after = rows.map((r) => [r.job_id, r.amountText]);
    return JSON.stringify(before) !== JSON.stringify(after);
  }, [po, form, rows, removed]);

  const poAmount = toNumber(form?.po_amount);
  const billed = round2(rows.reduce((s, r) => s + (toNumber(r.amountText) || 0), 0));
  const booked = round2(rows.reduce((s, r) => s + (r.booked_price || 0), 0));
  const balance = poAmount === null ? null : round2(poAmount - billed);
  const state = poState(poAmount, balance);
  const pct = usedPct(billed, poAmount);
  const invalidIds = new Set(
    rows.filter((r) => toNumber(r.amountText) === null || toNumber(r.amountText) < 0).map((r) => r.job_id)
  );
  const poAmountInvalid = form?.po_amount !== "" && (poAmount === null || poAmount < 0);
  const properties = [...new Set(rows.map((r) => r.property).filter(Boolean))];

  // Group rows by property + flat, keeping their order; number lines across groups.
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
    // Re-adding a service removed in this session simply keeps it.
    const ids = new Set(services.map((s) => s.job_id));
    setRemoved((prev) => prev.filter((id) => !ids.has(id)));
    setPicking(false);
  }

  function discard() {
    apply(po);
  }

  async function save() {
    if (invalidIds.size) {
      return setStatus({ type: "error", message: "Enter an amount of 0 or more for every line." });
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
      apply(data);
      if (data.po_number !== number) onOpen(data.po_number);
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
  const saveLabel = saving ? "Saving…" : po?.is_new ? "Save PO" : "Save changes";
  const saveNote = dirty ? "Unsaved changes" : po?.is_new ? "Not saved yet" : "All changes saved";

  const actions = po && (
    <div className={`bgb-save ${dirty ? "dirty" : ""}`}>
      <span className="bgb-save-note">{saveNote}</span>
      <button type="button" className="bgb-btn-ghost" onClick={discard} disabled={!dirty || saving}>Discard</button>
      <button type="button" className="primary" onClick={save} disabled={!dirty || saving}>{saveLabel}</button>
    </div>
  );

  return (
    <div className="bg-page bgb">
      <div className="bgb-topbar">
        <div>
          <nav className="bgb-crumbs" aria-label="Breadcrumb">
            <button type="button" onClick={back}>Billing</button>
            <span aria-hidden="true">›</span>
            <span>{po?.po_number || number}</span>
          </nav>
          <div className="bgb-title-row">
            <h2 className="bgb-h1">{po?.po_number || number}</h2>
            {po && <StateBadge state={state} />}
            {po?.is_new && <span className="bgb-badge muted">Draft</span>}
          </div>
        </div>
        <div className="bgb-topbar-actions">{actions}</div>
      </div>

      {loadError && <div className="bg-error">{loadError}</div>}

      {loading ? (
        <section className="bgb-sheet"><div className="bg-loading bgb-pad">Loading PO…</div></section>
      ) : po && (
        <article className="bgb-sheet bgb-doc">
          {/* Document header: who / what, and where the PO stands */}
          <header className="bgb-doc-head">
            <div className="bgb-doc-party">
              <span className="bgb-eyebrow">Client purchase order</span>
              <strong>Brigade Group</strong>
              <span className="bgb-sub">{properties.length ? properties.join(", ") : "No property yet"}</span>
              {po.header_from === "booking" && (
                <span className="bgb-sub">PO details filled from the booking — edits here apply to billing only.</span>
              )}
            </div>
            <div className={`bgb-doc-status ${state.key}`}>
              <span className="bgb-eyebrow">Balance</span>
              <strong>{balance === null ? "—" : formatInr(balance)}</strong>
              <UsageBar billed={billed} poAmount={poAmount} />
              <span className="bgb-sub">
                {pct === null ? "Enter the PO amount to track usage" : `${formatInr(billed)} billed · ${pct}% of PO`}
              </span>
            </div>
          </header>

          {/* PO details */}
          <section className="bgb-doc-meta">
            <div className="bgb-meta-field">
              <label htmlFor="bgb-date">PO date</label>
              <input
                id="bgb-date"
                type="date"
                value={form.po_date}
                onChange={(e) => setForm((f) => ({ ...f, po_date: e.target.value }))}
              />
            </div>
            <div className="bgb-meta-field">
              <label htmlFor="bgb-amount">PO amount</label>
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
            </div>
            <div className="bgb-meta-field wide">
              <label htmlFor="bgb-source">Received from / reference</label>
              <input
                id="bgb-source"
                value={form.po_source}
                maxLength={255}
                placeholder="e.g. Email from Brigade FM"
                onChange={(e) => setForm((f) => ({ ...f, po_source: e.target.value }))}
              />
            </div>
          </section>

          {/* Line items */}
          <section className="bgb-doc-lines">
            <div className="bgb-lines-bar">
              <h3>Line items <span className="bgb-count">{rows.length}</span></h3>
              <button type="button" className="bgb-btn-outline" onClick={() => setPicking(true)}>+ Add services</button>
            </div>

            {!rows.length ? (
              <div className="bg-empty-state bgb-lines-empty">
                <strong>No line items yet</strong>
                <button type="button" className="bg-link-btn" onClick={() => setPicking(true)}>
                  Add the Brigade services this PO pays for
                </button>
              </div>
            ) : (
              <div className="bg-table-wrap">
                <table className="bgb-ledger bgb-items">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>#</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th className="num">Booked rate</th>
                      <th className="num" style={{ width: 170 }}>Amount</th>
                      <th style={{ width: 44 }} aria-label="Actions" />
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
                          <td />
                        </tr>
                        {g.rows.map((r) => {
                          const amt = toNumber(r.amountText);
                          const diff = amt !== null && r.booked_price !== null ? round2(amt - r.booked_price) : 0;
                          return (
                            <tr key={r.job_id} className={r.added ? "bgb-added" : undefined}>
                              <td className="bgb-line-no">{r.line}</td>
                              <td>
                                <div className="bgb-strong">{r.sub_service}</div>
                                <div className="bgb-sub">
                                  <button
                                    type="button"
                                    className="bgb-code"
                                    onClick={() => navigate(`${jobBase}/jobs/${r.job_id}`)}
                                  >
                                    {r.code}
                                  </button>
                                  {r.start_date && <> · {formatDate(r.start_date)}</>}
                                  {r.from_booking && <> · <span className="bgb-tag"><LockIcon /> Booked on this PO</span></>}
                                  {r.added && <> · <span className="bgb-tag new">New line</span></>}
                                </div>
                              </td>
                              <td><span className={`bg-status ${r.status}`}>{statusLabel(r.status)}</span></td>
                              <td className="num bgb-muted">{formatInr(r.booked_price)}</td>
                              <td className="num">
                                <div className={`bgb-money compact ${invalidIds.has(r.job_id) ? "invalid" : ""}`}>
                                  <span aria-hidden="true">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={r.amountText}
                                    aria-label={`Amount for ${r.code} ${r.sub_service}`}
                                    onChange={(e) => setAmount(r.job_id, e.target.value)}
                                  />
                                </div>
                                {diff !== 0 && (
                                  <div className={`bgb-diff ${diff > 0 ? "up" : "down"}`}>
                                    {diff > 0 ? "+" : "−"}{formatInr(Math.abs(diff))} vs booked
                                  </div>
                                )}
                              </td>
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

          {/* Totals */}
          <footer className="bgb-doc-foot">
            <p className="bgb-doc-note">
              All amounts are in INR and exclude GST. Lines marked “Booked on this PO” came with the booking and stay on it.
            </p>
            <dl className="bgb-totals">
              <div><dt>Booked value</dt><dd>{formatInr(booked)}</dd></div>
              <div><dt>Billed ({rows.length} line{rows.length === 1 ? "" : "s"})</dt><dd>{formatInr(billed)}</dd></div>
              <div><dt>PO amount</dt><dd><Money value={poAmount} /></dd></div>
              <div className="grand">
                <dt>Balance</dt>
                <dd><Money value={balance} signed /></dd>
              </div>
            </dl>
          </footer>
        </article>
      )}

      {po && <div className="bgb-mobile-save">{actions}</div>}

      {picking && (
        <AddServicesModal
          exclude={new Set(rows.map((r) => r.job_id))}
          onAdd={addServices}
          onClose={() => setPicking(false)}
        />
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

/* ------------------------------------------------------------------ */
/* Pick services that are not under any PO yet                        */
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
      <div className="bgm-modal bgb-pick" role="dialog" aria-modal="true" aria-labelledby="bgb-pick-title">
        <div className="bgm-header">
          <div>
            <h3 id="bgb-pick-title">Add services to PO</h3>
            <p>Brigade services that are not on any PO yet</p>
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
                  <th>Description</th>
                  <th>Property · flat</th>
                  <th>Status</th>
                  <th className="num">Booked rate</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr
                    key={s.job_id}
                    className={picked.has(s.job_id) ? "bgb-picked" : undefined}
                    onClick={() => toggle(s)}
                  >
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
            {picked.size ? `${picked.size} selected · ${formatInr(pickedTotal)}` : "Select the services this PO covers"}
          </span>
          <div className="bgb-pick-actions">
            <button type="button" className="bgb-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="primary" disabled={!picked.size} onClick={() => onAdd([...picked.values()])}>
              Add {picked.size || ""} line{picked.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
