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

  return (
    <div className="bg-page">
      <div className="bg-page-header">
        <div>
          <h2>Prices &amp; BHK</h2>
          <p>Price list for each Brigade property by BHK and service, and the BHK types used in the booking form. Prices exclude GST.</p>
        </div>
      </div>

      {error && <div className="bg-error">{error}</div>}

      {loading ? (
        <div className="bg-card"><div className="bg-loading">Loading properties…</div></div>
      ) : !properties.length ? (
        <div className="bg-card">
          <div className="bg-empty-state">
            <strong>No Brigade properties yet</strong>
            Add a company under “Brigade Group” in Companies, with a site, then come back here.
          </div>
        </div>
      ) : (
        <div className="bg-props" role="radiogroup" aria-label="Property">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === companyId}
              className={`bg-prop ${p.id === companyId ? "active" : ""}`}
              onClick={() => setCompanyId(p.id)}
            >
              <span className="bg-prop-name">{p.name}</span>
              {/* Only flag a property that cannot be booked yet. */}
              {!p.sites.length && (
                <span className="bg-prop-meta">
                  <span className="bg-chip warn">No site</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {property && (
        <>
          <div className="bg-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "prices"}
              className={`bg-tab ${tab === "prices" ? "active" : ""}`}
              onClick={() => setTab("prices")}
            >
              Price list <span className="bg-tab-count">{prices.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "bhk"}
              className={`bg-tab ${tab === "bhk" ? "active" : ""}`}
              onClick={() => setTab("bhk")}
            >
              BHK types <span className="bg-tab-count">{bhkTypes.length}</span>
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
            <PricesMaster
              property={property}
              bhkTypes={bhkTypes}
              flats={[]}
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
    <div className="bg-card">
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
/* Prices                                                              */
/* ------------------------------------------------------------------ */

const sortBhk = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// Price list: quick-add bar, filter chips, one table. A BHK price covers
// every flat of that BHK in the property.
function PricesMaster({ property, bhkTypes, flats, prices, subServices, loading, onChanged, onStatus }) {
  const [form, setForm] = useState({ target: "", sub_service: "", price: "" }); // target: "bhk:<bhk>" | "flat:<id>"
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState(""); // "" | "bhk:<bhk>" | "flats"
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const priceInputRef = useRef(null);

  const bhkPrices = prices.filter((p) => !p.flat_id);
  const flatPrices = prices.filter((p) => p.flat_id);

  // BHKs that have flats or prices first; every standard BHK is still selectable.
  const usedBhks = useMemo(
    () => [...new Set([...flats.map((f) => f.bhk), ...bhkPrices.map((p) => p.bhk)])].sort(sortBhk),
    [flats, bhkPrices]
  );
  const otherBhks = bhkTypes.filter((b) => !usedBhks.includes(b));

  const priceFor = (bhk, service) => bhkPrices.find((p) => p.bhk === bhk && p.sub_service === service) || null;
  const pricedCount = (bhk) => subServices.filter((s) => priceFor(bhk, s)).length;

  /* ----- add bar helpers ----- */
  const targetFlat = form.target.startsWith("flat:") ? flats.find((f) => f.id === form.target.slice(5)) : null;
  const targetBhk = form.target.startsWith("bhk:") ? form.target.slice(4) : targetFlat?.bhk || "";
  const existing = !form.sub_service || !form.target
    ? null
    : targetFlat
      ? flatPrices.find((p) => p.flat_id === targetFlat.id && p.sub_service === form.sub_service) || null
      : priceFor(targetBhk, form.sub_service);
  const basePrice = targetFlat && form.sub_service ? priceFor(targetFlat.bhk, form.sub_service)?.price ?? null : null;
  const priceInvalid = form.price !== "" && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0);

  let priceHint = " ";
  if (existing) priceHint = `Currently ${formatInr(existing.price)} — saving replaces it`;
  else if (targetFlat && form.sub_service) {
    priceHint = basePrice !== null ? `${targetFlat.bhk} price is ${formatInr(basePrice)}` : `No ${targetFlat.bhk} price for this service`;
  }

  function prefill(target, service) {
    setForm({ target, sub_service: service, price: "" });
    setTimeout(() => priceInputRef.current?.focus(), 0);
  }

  async function savePrice(e) {
    e.preventDefault();
    if (!form.target) return onStatus({ type: "error", message: "Choose a BHK or a flat" });
    if (!form.sub_service) return onStatus({ type: "error", message: "Choose the service" });
    if (form.price === "" || priceInvalid) return onStatus({ type: "error", message: "Price must be a number of 0 or more" });

    setSaving(true);
    try {
      const data = await brigadeRequest("/api/brigade/prices", {
        method: "POST",
        body: JSON.stringify({
          company_id: property.id,
          bhk: targetFlat ? undefined : targetBhk,
          flat_id: targetFlat ? targetFlat.id : undefined,
          sub_service: form.sub_service,
          price: Number(form.price),
        }),
      });
      setForm((f) => ({ ...f, sub_service: "", price: "" })); // keep the BHK/flat for the next service
      await onChanged();
      onStatus({ type: "success", message: data.updated ? "Price updated" : "Price saved" });
    } catch (err) {
      onStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function saveInline(row, value) {
    try {
      if (value === "") {
        setConfirmDelete(row);
        return true;
      }
      await brigadeRequest(`/api/brigade/prices/${row.id}`, { method: "PUT", body: JSON.stringify({ price: Number(value) }) });
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

  /* ----- table rows ----- */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...bhkPrices, ...flatPrices]
      .filter((p) => {
        if (filter === "flats" && !p.flat_id) return false;
        if (filter.startsWith("bhk:") && (p.bhk !== filter.slice(4) || p.flat_id)) return false;
        return !q || p.sub_service.toLowerCase().includes(q) || (p.flat_number || "").toLowerCase().includes(q);
      })
      .sort(
        (a, b) =>
          sortBhk(a.bhk, b.bhk) ||
          Number(Boolean(a.flat_id)) - Number(Boolean(b.flat_id)) ||
          subServices.indexOf(a.sub_service) - subServices.indexOf(b.sub_service) ||
          (a.flat_number || "").localeCompare(b.flat_number || "")
      );
  }, [bhkPrices, flatPrices, filter, search, subServices]);

  const filterBhk = filter.startsWith("bhk:") ? filter.slice(4) : "";
  const missingForFilter = filterBhk ? subServices.filter((s) => !priceFor(filterBhk, s)) : [];

  return (
    <div className="bg-card">
      <div className="bg-card-head">
        <div>
          <h3>Price list — {property.name}</h3>
          <p className="bg-card-sub">
            {prices.length} price{prices.length === 1 ? "" : "s"} · Each price applies to every flat of that BHK in this property.
          </p>
        </div>
      </div>

      <form className="bg-quickadd cols-4" onSubmit={savePrice} aria-label="Set price">
        <div className="bg-field">
          <label htmlFor="bg-price-target">Applies to</label>
          <select id="bg-price-target" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}>
            <option value="">Select BHK or flat</option>
            <optgroup label="Every flat of a BHK">
              {[...usedBhks, ...otherBhks].map((b) => (
                <option key={b} value={`bhk:${b}`}>All {b} flats</option>
              ))}
            </optgroup>
            {flats.length > 0 && (
              <optgroup label="One flat (special price)">
                {flats.map((f) => (
                  <option key={f.id} value={`flat:${f.id}`}>Flat {f.flat_number} · {f.bhk}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="bg-field">
          <label htmlFor="bg-price-service">Service</label>
          <select id="bg-price-service" value={form.sub_service} onChange={(e) => setForm((f) => ({ ...f, sub_service: e.target.value }))}>
            <option value="">Select service</option>
            {subServices.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="bg-field">
          <label htmlFor="bg-price-amount">Price (₹, excl. GST)</label>
          <input
            id="bg-price-amount"
            ref={priceInputRef}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            className={priceInvalid ? "invalid" : ""}
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
          <span className={priceInvalid ? "bg-field-error" : "bg-field-hint"}>
            {priceInvalid ? "Enter a number of 0 or more" : priceHint}
          </span>
        </div>
        <div className="bg-field">
          <span className="bg-label" aria-hidden="true">&nbsp;</span>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Saving…" : existing ? "Update price" : "+ Save price"}
          </button>
        </div>
      </form>

      <div className="bg-toolbar" style={{ justifyContent: "space-between", margin: "16px 0 6px" }}>
        <div className="bg-filter-chips" role="group" aria-label="Filter prices">
          <button type="button" className={`bg-filter-chip ${!filter ? "active" : ""}`} onClick={() => setFilter("")}>
            All <span>{prices.length}</span>
          </button>
          {usedBhks.map((b) => (
            <button
              key={b}
              type="button"
              className={`bg-filter-chip ${filter === `bhk:${b}` ? "active" : ""}`}
              onClick={() => setFilter(filter === `bhk:${b}` ? "" : `bhk:${b}`)}
              title={`${pricedCount(b)} of ${subServices.length} services priced`}
            >
              {b}{" "}
              <span className={pricedCount(b) === subServices.length ? "bg-coverage full" : ""}>
                {pricedCount(b)}/{subServices.length}
              </span>
            </button>
          ))}
          {flatPrices.length > 0 && (
            <button
              type="button"
              className={`bg-filter-chip ${filter === "flats" ? "active" : ""}`}
              onClick={() => setFilter(filter === "flats" ? "" : "flats")}
            >
              Flat prices <span>{flatPrices.length}</span>
            </button>
          )}
        </div>
        <div className="bg-field" style={{ minWidth: 200 }}>
          <input placeholder="Search service or flat" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search prices" />
        </div>
      </div>

      {loading && !prices.length ? (
        <div className="bg-loading">Loading prices…</div>
      ) : prices.length === 0 ? (
        <div className="bg-empty-state">
          <strong>No prices yet</strong>
          Set the first one above — e.g. All 2 BHK flats · Deep Cleaning · ₹6,000.
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-empty">No prices match these filters.</div>
      ) : (
        <div className="bg-table-wrap">
          <table className="bg-table">
            <thead>
              <tr>
                <th style={{ width: "36%" }}>Service</th>
                <th>Applies to</th>
                <th className="num" style={{ width: 220 }}>Price</th>
                <th className="num" style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const base = p.flat_id ? priceFor(p.bhk, p.sub_service)?.price ?? null : null;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.sub_service}</strong></td>
                    <td>
                      {p.flat_id ? (
                        <span className="bg-chip warn">Flat {p.flat_number} · {p.bhk}</span>
                      ) : (
                        <span className="bg-chip accent">All {p.bhk} flats</span>
                      )}
                      {p.flat_id && base !== null && (
                        <span className="bg-field-hint" style={{ marginLeft: 8 }}>
                          {p.bhk} price {formatInr(base)}
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ width: 220 }}>
                      <PriceCell value={p.price} label={`${p.sub_service}, ${p.flat_id ? `flat ${p.flat_number}` : p.bhk}`} onSave={(v) => saveInline(p, v)} />
                    </td>
                    <td style={{ width: 90 }}>
                      <div className="bg-actions">
                        <button type="button" className="bg-link-btn danger" onClick={() => setConfirmDelete(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filterBhk && missingForFilter.length > 0 && (
        <div className="bg-missing">
          <span className="bg-label">Not priced yet for {filterBhk}</span>
          <div className="bg-filter-chips">
            {missingForFilter.map((s) => (
              <button key={s} type="button" className="bg-filter-chip dashed" onClick={() => prefill(`bhk:${filterBhk}`, s)}>
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Remove price?"
        message={
          confirmDelete
            ? confirmDelete.flat_id
              ? `Flat ${confirmDelete.flat_number} will use the ${confirmDelete.bhk} price for ${confirmDelete.sub_service} again. Existing bookings keep their price.`
              : `${confirmDelete.sub_service} will not be bookable for ${confirmDelete.bhk} flats until a price is set again. Existing bookings keep their price.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// Click-to-edit price. Enter saves, Esc cancels, an empty value removes it.
function PriceCell({ value, label, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value === null ? "" : String(value));
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed !== "" && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0)) return;
    if ((trimmed === "" && value === null) || (trimmed !== "" && Number(trimmed) === value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`bg-cell ${value === null ? "empty" : ""}`}
        onClick={start}
        aria-label={value === null ? `Set price for ${label}` : `Change price for ${label}, now ${formatInr(value)}`}
      >
        {value === null ? "+ Set" : formatInr(value)}
      </button>
    );
  }

  const invalid = draft.trim() !== "" && (!Number.isFinite(Number(draft)) || Number(draft) < 0);
  return (
    <div className="bg-cell-edit">
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={draft}
        autoFocus
        disabled={saving}
        aria-label={`Price for ${label}`}
        aria-invalid={invalid}
        style={invalid ? { borderColor: "#dc2626" } : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button type="button" className="primary" onClick={commit} disabled={saving || invalid}>
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} aria-label="Cancel">
        ✕
      </button>
    </div>
  );
}
