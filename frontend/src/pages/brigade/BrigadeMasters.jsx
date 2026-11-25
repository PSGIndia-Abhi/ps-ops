import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatusAlertModal from "../../components/StatusAlertModal";
import { brigadeRequest, formatInr } from "./brigadeShared";
import "./brigade.css";

// Brigade masters: price list per property (Property + BHK + service) and the
// BHK types master. Flat numbers are typed in the booking form, so there is no
// flat master here. Brigade Executive panel only (/brigade/masters).
export default function BrigadeMasters() {
  const [properties, setProperties] = useState([]);
  const [subServices, setSubServices] = useState([]);
  const [bhkTypes, setBhkTypes] = useState([]); // names from the BHK types master
  const [companyId, setCompanyId] = useState("");
  const [tab, setTab] = useState("prices");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);

  // Property + BHK prices (old flat-specific prices are no longer used).
  const [prices, setPrices] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    Promise.all([brigadeRequest("/api/brigade/meta"), brigadeRequest("/api/brigade/properties")])
      .then(([meta, props]) => {
        setSubServices(meta?.sub_services || []);
        setBhkTypes(meta?.bhk_types || []);
        const list = Array.isArray(props) ? props : [];
        setProperties(list);
        if (list.length) setCompanyId(list[0].id);
      })
      .catch((err) => setError(err.message || "Failed to load properties"))
      .finally(() => setLoading(false));
  }, []);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoadingData(true);
    try {
      const q = `company_id=${encodeURIComponent(companyId)}`;
      const p = await brigadeRequest(`/api/brigade/prices?${q}`);
      setPrices((p || []).filter((row) => !row.flat_id));
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoadingData(false);
    }
  }, [companyId]);

  useEffect(() => {
    setPrices([]);
    reload();
  }, [reload]);

  const property = properties.find((p) => p.id === companyId) || null;
  const cells = subServices.length * bhkTypes.length;

  return (
    <div className="bg-page bdz bpm">
      <section className="bdz-hero bpm-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Brigade · Masters</span>
            <h1>Prices &amp; BHK</h1>
            <p>Price per property, BHK and service · prices exclude GST</p>
          </div>
          {property && (
            <div className="bpm-hero-stat">
              <span>Priced for {property.name}</span>
              <b>{prices.length}<small> / {cells}</small></b>
              <span className="bpm-meter" aria-hidden="true"><i style={{ width: `${cells ? Math.min((prices.length / cells) * 100, 100) : 0}%` }} /></span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bpm-props">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel dark" style={{ height: 60 }} />)}</div>
        ) : properties.length > 0 && (
          <div className="bpm-props" role="radiogroup" aria-label="Property">
            {properties.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === companyId}
                className={`bpm-prop ${p.id === companyId ? "on" : ""}`} onClick={() => setCompanyId(p.id)}>
                <span className="bpm-avatar" aria-hidden="true">{initials(p.name)}</span>
                <span className="bpm-prop-name">{p.name}</span>
                {/* Only flag a property that cannot be booked yet. */}
                {!p.sites.length && <span className="bpm-nosite">No site</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <div className="bg-error">{error}</div>}

      {!loading && !properties.length && (
        <div className="bdz-panel">
          <div className="bg-empty-state">
            <strong>No Brigade properties yet</strong>
            Ask the Admin to add the property under “Brigade Group” in Companies, with a site.
          </div>
        </div>
      )}

      {property && (
        <>
          <div className="bpm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "prices"} className={tab === "prices" ? "on" : ""} onClick={() => setTab("prices")}>
              Price grid <span>{prices.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "bhk"} className={tab === "bhk" ? "on" : ""} onClick={() => setTab("bhk")}>
              BHK types <span>{bhkTypes.length}</span>
            </button>
          </div>

          {tab === "bhk" ? (
            <BhkTypesMaster
              onChanged={(names) => {
                setBhkTypes(names);
                reload(); // a rename also renames flats and prices
              }}
              onStatus={setStatus}
            />
          ) : (
            <PriceGrid
              property={property}
              bhkTypes={bhkTypes}
              prices={prices}
              subServices={subServices}
              loading={loadingData}
              onChanged={reload}
              onStatus={setStatus}
            />
          )}
        </>
      )}

      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}

const initials = (name) => String(name || "?").replace(/^brigade\s+/i, "").trim().slice(0, 2).toUpperCase();

/* ------------------------------------------------------------------ */
/* BHK types (shared by every Brigade property)                        */
/* ------------------------------------------------------------------ */

function BhkTypesMaster({ onChanged, onStatus }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await brigadeRequest("/api/brigade/bhk-types");
      setTypes(rows || []);
      return rows || [];
    } catch (err) {
      onStatus({ type: "error", message: err.message });
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    const rows = await load();
    if (rows) onChanged(rows.map((t) => t.name));
  }

  async function addType(e) {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) return onStatus({ type: "error", message: "Enter the BHK type, e.g. 2.5 BHK" });
    setSaving(true);
    try {
      await brigadeRequest("/api/brigade/bhk-types", { method: "POST", body: JSON.stringify({ name: trimmed }) });
      setName("");
      await refresh();
      onStatus({ type: "success", message: `"${trimmed}" added` });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function saveRename() {
    const trimmed = editing.name.trim().replace(/\s+/g, " ");
    if (!trimmed) return onStatus({ type: "error", message: "Name cannot be empty" });
    try {
      await brigadeRequest(`/api/brigade/bhk-types/${editing.id}`, { method: "PUT", body: JSON.stringify({ name: trimmed }) });
      setEditing(null);
      await refresh();
      onStatus({ type: "success", message: "BHK type renamed — prices updated" });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    }
  }

  // Swap display order with the neighbour above/below.
  async function move(index, direction) {
    const a = types[index];
    const b = types[index + direction];
    if (!a || !b) return;
    setBusyId(a.id);
    try {
      await brigadeRequest(`/api/brigade/bhk-types/${a.id}`, { method: "PUT", body: JSON.stringify({ sort_order: b.sort_order }) });
      await brigadeRequest(`/api/brigade/bhk-types/${b.id}`, { method: "PUT", body: JSON.stringify({ sort_order: a.sort_order }) });
      await refresh();
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    const t = confirmDelete;
    setConfirmDelete(null);
    try {
      await brigadeRequest(`/api/brigade/bhk-types/${t.id}`, { method: "DELETE" });
      await refresh();
      onStatus({ type: "success", message: `"${t.name}" removed` });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    }
  }

  return (
    <div className="bdz-panel bpm-bhk">
      <div className="bg-card-head">
        <div>
          <h3>BHK types</h3>
          <p className="bg-card-sub">
            Shared by every Brigade property. These are the choices in the BHK dropdowns. Renaming one also renames it on existing prices.
          </p>
        </div>
      </div>

      <form className="bg-quickadd bhk" onSubmit={addType} aria-label="Add BHK type">
        <div className="bg-field">
          <label htmlFor="bg-new-bhk-type">BHK type</label>
          <input
            id="bg-new-bhk-type"
            value={name}
            maxLength={20}
            placeholder="e.g. 2.5 BHK"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="bg-field">
          <span className="bg-label" aria-hidden="true">&nbsp;</span>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Adding…" : "+ Add BHK type"}
          </button>
        </div>
      </form>

      {loading && !types.length ? (
        <div className="bg-loading">Loading BHK types…</div>
      ) : types.length === 0 ? (
        <div className="bg-empty-state">
          <strong>No BHK types yet</strong>
          Add the first one above — e.g. 1 BHK.
        </div>
      ) : (
        <div className="bg-table-wrap" style={{ marginTop: 16 }}>
          <table className="bg-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Order</th>
                <th style={{ width: "34%" }}>BHK type</th>
                <th>Used by</th>
                <th className="num" style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t, i) => (
                <tr key={t.id}>
                  <td>
                    <div className="bg-order">
                      <button
                        type="button"
                        className="bg-order-btn"
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || busyId !== null}
                        aria-label={`Move ${t.name} up`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="bg-order-btn"
                        onClick={() => move(i, 1)}
                        disabled={i === types.length - 1 || busyId !== null}
                        aria-label={`Move ${t.name} down`}
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td>
                    {editing?.id === t.id ? (
                      <div className="bg-field">
                        <input
                          value={editing.name}
                          maxLength={20}
                          autoFocus
                          aria-label="BHK type name"
                          onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      </div>
                    ) : (
                      <span className="bg-chip accent">{t.name}</span>
                    )}
                  </td>
                  <td className="bg-field-hint" style={{ fontSize: 13 }}>
                    {t.price_count
                      ? `${t.price_count} price${t.price_count === 1 ? "" : "s"}`
                      : "Not used yet"}
                  </td>
                  <td>
                    <div className="bg-actions">
                      {editing?.id === t.id ? (
                        <>
                          <button type="button" className="bg-link-btn" onClick={saveRename}>Save</button>
                          <button type="button" className="bg-link-btn" onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="bg-link-btn" onClick={() => setEditing({ id: t.id, name: t.name })}>Rename</button>
                          <button
                            type="button"
                            className="bg-link-btn danger"
                            onClick={() => setConfirmDelete(t)}
                            disabled={Boolean(t.flat_count || t.price_count)}
                            title={t.flat_count || t.price_count ? "In use — change those prices first" : undefined}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Remove BHK type?"
        message={confirmDelete ? `"${confirmDelete.name}" will no longer appear in the BHK dropdowns.` : ""}
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Price grid: services down the side, BHK types across the top        */
/* ------------------------------------------------------------------ */

// Every cell is one price (property + BHK + service). Click a cell, type, Enter.
// An empty cell is "+ Set"; clearing a price asks before removing it.
function PriceGrid({ property, bhkTypes, prices, subServices, loading, onChanged, onStatus }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all"); // all | priced | missing
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Columns: every BHK type in master order, plus any BHK still used by an old price.
  const columns = useMemo(() => {
    const extra = [...new Set(prices.map((p) => p.bhk))].filter((b) => !bhkTypes.includes(b));
    return [...bhkTypes, ...extra];
  }, [bhkTypes, prices]);
  const byKey = useMemo(() => new Map(prices.map((p) => [`${p.bhk}\u0000${p.sub_service}`, p])), [prices]);
  const cell = (bhk, service) => byKey.get(`${bhk}\u0000${service}`) || null;
  const rowCount = (service) => columns.filter((b) => cell(b, service)).length;
  const colCount = (bhk) => subServices.filter((s) => cell(bhk, s)).length;

  const q = search.trim().toLowerCase();
  const rows = subServices.filter((s) => {
    if (q && !s.toLowerCase().includes(q)) return false;
    const n = rowCount(s);
    if (view === "priced") return n > 0;
    if (view === "missing") return n < columns.length;
    return true;
  });

  async function save(bhk, service, value) {
    const row = cell(bhk, service);
    try {
      if (value === "") {
        if (row) setConfirmDelete(row);
        return true;
      }
      if (row) {
        await brigadeRequest(`/api/brigade/prices/${row.id}`, { method: "PUT", body: JSON.stringify({ price: Number(value) }) });
      } else {
        await brigadeRequest("/api/brigade/prices", {
          method: "POST",
          body: JSON.stringify({ company_id: property.id, bhk, sub_service: service, price: Number(value) }),
        });
      }
      await onChanged();
      return true;
    } catch (err) {
      onStatus({ type: "error", message: err.message });
      return false;
    }
  }

  async function doDelete() {
    const row = confirmDelete;
    setConfirmDelete(null);
    try {
      await brigadeRequest(`/api/brigade/prices/${row.id}`, { method: "DELETE" });
      await onChanged();
      onStatus({ type: "success", message: "Price removed" });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    }
  }

  return (
    <section className="bdz-panel bpm-grid-card">
      <div className="bpm-grid-head">
        <div>
          <h3>{property.name}</h3>
          <span>Click a price to change it · Enter saves · Esc cancels · clear it to remove</span>
        </div>
        <div className="bpm-grid-tools">
          <div className="bpm-seg" role="radiogroup" aria-label="Show">
            {[["all", "All"], ["priced", "Priced"], ["missing", "Missing"]].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          <input className="bpm-search" placeholder="Search service" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search services" />
        </div>
      </div>

      {loading && !prices.length ? (
        <div className="bpm-skel-grid" role="status" aria-label="Loading prices">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="bdz-skel" style={{ height: 44, borderRadius: 10 }} />)}
        </div>
      ) : !columns.length || !subServices.length ? (
        <div className="bg-empty-state">
          <strong>{columns.length ? "No services set up" : "No BHK types yet"}</strong>
          {columns.length ? "Services come from the Brigade service list." : "Add BHK types in the BHK types tab first."}
        </div>
      ) : !rows.length ? (
        <div className="bdz-empty">No services match</div>
      ) : (
        <div className={`bpm-scroll ${loading ? "busy" : ""}`}>
          <table className="bpm-grid">
            <thead>
              <tr>
                <th className="bpm-svc-h">Service</th>
                {columns.map((b) => (
                  <th key={b}>
                    <span className="bpm-col">{b}</span>
                    <small className={colCount(b) === subServices.length ? "full" : ""}>{colCount(b)}/{subServices.length}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const n = rowCount(s);
                return (
                  <tr key={s}>
                    <th scope="row" className="bpm-svc">
                      <span>{s}</span>
                      <small className={n === columns.length ? "full" : n ? "" : "none"}>{n}/{columns.length}</small>
                    </th>
                    {columns.map((b) => {
                      const row = cell(b, s);
                      return (
                        <td key={b}>
                          <PriceCell value={row ? row.price : null} label={`${s}, ${b}`} onSave={(v) => save(b, s, v)} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Remove price?"
        message={confirmDelete ? `${confirmDelete.sub_service} will not be bookable for ${confirmDelete.bhk} flats until a price is set again. Existing bookings keep their price.` : ""}
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}

// Click-to-edit price. Enter saves, Esc cancels, an empty value removes it.
function PriceCell({ value, label, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  function start() {
    setDraft(value === null ? "" : String(value));
    setEditing(true);
  }

  const invalid = draft.trim() !== "" && (!Number.isFinite(Number(draft)) || Number(draft) < 0);

  async function commit() {
    const trimmed = draft.trim();
    if (invalid || busy.current) return;
    if ((trimmed === "" && value === null) || (trimmed !== "" && Number(trimmed) === value)) {
      setEditing(false);
      return;
    }
    busy.current = true;
    setSaving(true);
    const ok = await onSave(trimmed);
    busy.current = false;
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`bpm-cell ${value === null ? "empty" : ""}`}
        onClick={start}
        aria-label={value === null ? `Set price for ${label}` : `Change price for ${label}, now ${formatInr(value)}`}
        title={value === null ? "Set price" : formatInr(value)}
      >
        {value === null ? "+ Set" : formatInr(value).replace(/\.00$/, "")}
      </button>
    );
  }

  return (
    <input
      className={`bpm-cell-input ${invalid ? "invalid" : ""}`}
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      value={draft}
      autoFocus
      disabled={saving}
      placeholder="₹"
      aria-label={`Price for ${label}`}
      aria-invalid={invalid}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
