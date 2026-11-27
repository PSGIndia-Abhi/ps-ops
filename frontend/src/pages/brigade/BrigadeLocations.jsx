import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HiOutlineMapPin,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlineBuildingOffice2,
  HiOutlineXMark,
  HiOutlineViewfinderCircle,
} from "react-icons/hi2";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatusAlertModal from "../../components/StatusAlertModal";
import { brigadeRequest } from "./brigadeShared";
import "./brigade.css";

// Master Settings → Locations. Adds / edits the locations (sites) of the
// EXISTING Brigade properties. Uses the existing /api/brigade/properties and
// /api/sites APIs; the backend limits a Brigade Executive to Brigade Group.
const EMPTY = { name: "", address: "", city: "", state: "", postal_code: "", latitude: "", longitude: "" };

export default function BrigadeLocations() {
  const [properties, setProperties] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null); // null | { id?, company_id, ...EMPTY }
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([brigadeRequest("/api/brigade/properties"), brigadeRequest("/api/sites")]);
      setProperties(Array.isArray(p) ? p : []);
      setSites(Array.isArray(s) ? s : []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sitesByProperty = useMemo(() => {
    const map = new Map();
    for (const s of sites) {
      if (!map.has(s.company_id)) map.set(s.company_id, []);
      map.get(s.company_id).push(s);
    }
    return map;
  }, [sites]);

  const q = search.trim().toLowerCase();
  const matches = (s) => [s.name, s.address, s.city, s.state].some((v) => String(v || "").toLowerCase().includes(q));
  const shown = properties
    .map((p) => {
      const list = sitesByProperty.get(p.id) || [];
      if (!q || p.name.toLowerCase().includes(q)) return { p, list };
      const hit = list.filter(matches);
      return hit.length ? { p, list: hit } : null;
    })
    .filter(Boolean);

  const noLocation = properties.filter((p) => !(sitesByProperty.get(p.id) || []).length).length;

  function openAdd(p) {
    setForm({ company_id: p.id, property: p.name, ...EMPTY });
  }

  function openEdit(p, s) {
    setForm({
      id: s.id,
      company_id: p.id,
      property: p.name,
      name: s.name || "",
      address: s.address || "",
      city: s.city || "",
      state: s.state || "",
      postal_code: s.postal_code || "",
      latitude: s.latitude ?? "",
      longitude: s.longitude ?? "",
    });
  }

  function pinCurrentLocation() {
    if (!navigator.geolocation) return setStatus({ type: "error", message: "This browser cannot share its location" });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => f && { ...f, latitude: pos.coords.latitude.toFixed(7), longitude: pos.coords.longitude.toFixed(7) });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setStatus({ type: "error", message: err.code === 1 ? "Location permission was denied" : "Could not get the current location" });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const pinBad = form && form.postal_code.trim() !== "" && !/^\d{6}$/.test(form.postal_code.trim());

  async function save(e) {
    e.preventDefault();
    const name = form.name.trim().replace(/\s+/g, " ");
    if (!name) return setStatus({ type: "error", message: "Enter the location name" });
    if (pinBad) return setStatus({ type: "error", message: "Pincode must be 6 digits" });

    setSaving(true);
    try {
      const base = {
        company_id: form.company_id,
        name,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
      };
      if (form.id) {
        await brigadeRequest(`/api/sites/${form.id}`, { method: "PUT", body: JSON.stringify(base) });
      } else {
        await brigadeRequest("/api/sites", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            postal_code: form.postal_code.trim(),
            country: "India",
            latitude: form.latitude === "" ? null : Number(form.latitude),
            longitude: form.longitude === "" ? null : Number(form.longitude),
          }),
        });
      }
      setStatus({ type: "success", message: form.id ? "Location updated" : `${name} added to ${form.property}` });
      setForm(null);
      await load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    const s = confirmDelete;
    setConfirmDelete(null);
    try {
      await brigadeRequest(`/api/sites/${s.id}`, { method: "DELETE" });
      setStatus({ type: "success", message: `${s.name} removed` });
      await load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <div className="bg-page bdz bms">
      <section className="bdz-hero bms-hero">
        <div className="bdz-hero-top">
          <div>
            <span className="bdz-eyebrow">Master Settings</span>
            <h1>Locations</h1>
            <p>Add and edit the locations of existing Brigade properties</p>
          </div>
        </div>
        <div className="bms-hero-stats">
          <div><span>Properties</span><b>{properties.length}</b></div>
          <div><span>Locations</span><b>{sites.length}</b></div>
          <div className={noLocation ? "warn" : ""}><span>Without a location</span><b>{noLocation}</b></div>
        </div>
      </section>

      {error && <div className="bg-error">{error}</div>}

      <div className="bms-toolbar solo">
        <label className="bms-search">
          <HiOutlineMagnifyingGlass aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search property, location, address or city" aria-label="Search locations" />
        </label>
      </div>

      {loading && !properties.length ? (
        <div className="bms-props">{[0, 1, 2, 3].map((i) => <span key={i} className="bdz-skel" style={{ height: 180 }} />)}</div>
      ) : !properties.length ? (
        <div className="bdz-panel">
          <div className="bg-empty-state">
            <strong>No Brigade properties yet</strong>
            Ask the Admin to add the property under “Brigade Group” in Companies.
          </div>
        </div>
      ) : !shown.length ? (
        <div className="bdz-panel"><div className="bdz-empty">Nothing matches “{search}”</div></div>
      ) : (
        <div className="bms-props">
          {shown.map(({ p, list }) => (
            <section key={p.id} className={`bdz-panel bms-prop`}>
              <div className="bms-prop-head">
                <span className="bms-avatar" aria-hidden="true"><HiOutlineBuildingOffice2 /></span>
                <div className="bms-card-name">
                  <strong>{p.name}</strong>
                  <small>{list.length ? `${list.length} location${list.length === 1 ? "" : "s"}` : "No location — cannot be booked yet"}</small>
                </div>
                <button type="button" className="bms-btn small" onClick={() => openAdd(p)}>
                  <HiOutlinePlus aria-hidden="true" /> Add location
                </button>
              </div>

              {list.length > 0 && (
                <ul className="bms-sites">
                  {list.map((s) => (
                    <li key={s.id}>
                      <span className="bms-pin" aria-hidden="true"><HiOutlineMapPin /></span>
                      <div className="bms-site-main">
                        <strong>{s.name}</strong>
                        <small>{[s.address, s.city, s.state, s.postal_code].filter(Boolean).join(", ") || "No address"}</small>
                        <span className="bms-site-meta">
                          <em>{Number(s.contact_count) || 0} contacts</em>
                          <em>{Number(s.job_count) || 0} jobs</em>
                          {s.latitude && s.longitude && (
                            <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer">Open map</a>
                          )}
                        </span>
                      </div>
                      <div className="bms-card-acts">
                        <button type="button" onClick={() => openEdit(p, s)} aria-label={`Edit ${s.name}`} title="Edit"><HiOutlinePencilSquare /></button>
                        <button type="button" className="danger" onClick={() => setConfirmDelete(s)} aria-label={`Remove ${s.name}`} title="Remove"><HiOutlineTrash /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {form && (
        <div className="bms-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !saving && setForm(null)}>
          <form className="bms-dialog" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="bms-loc-title">
            <div className="bms-dialog-head">
              <div>
                <h3 id="bms-loc-title">{form.id ? "Edit location" : "Add location"}</h3>
                <p>{form.property}</p>
              </div>
              <button type="button" className="bms-x" onClick={() => setForm(null)} aria-label="Close"><HiOutlineXMark /></button>
            </div>
            <div className="bms-dialog-body">
              <label className="wide">
                Location name <i>*</i>
                <input value={form.name} maxLength={150} autoFocus onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Tower A / Main gate" autoComplete="off" />
              </label>
              <label className="wide">
                Address
                <textarea rows={2} value={form.address} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street, area, landmark" />
              </label>
              <label>
                City
                <input value={form.city} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </label>
              <label>
                State
                <input value={form.state} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
              </label>
              {!form.id ? (
                <>
                  <label>
                    Pincode
                    <input value={form.postal_code} inputMode="numeric" maxLength={6} aria-invalid={pinBad} className={pinBad ? "invalid" : ""} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "") }))} />
                  </label>
                  <div className="bms-geo">
                    <span>Map pin</span>
                    <button type="button" className="bms-btn ghost" onClick={pinCurrentLocation} disabled={locating}>
                      <HiOutlineViewfinderCircle aria-hidden="true" /> {locating ? "Locating…" : form.latitude ? "Update pin" : "Use my location"}
                    </button>
                    {form.latitude !== "" && <small>{form.latitude}, {form.longitude}</small>}
                  </div>
                </>
              ) : (
                <p className="bms-hint wide">Pincode and map pin are set when the location is added and cannot be changed here.</p>
              )}
            </div>
            <div className="bms-dialog-foot">
              <button type="button" className="bms-btn ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="bms-btn" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Add location"}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Remove location?"
        message={confirmDelete
          ? `${confirmDelete.name} will no longer appear in the booking lists.${Number(confirmDelete.job_count) ? ` Its ${confirmDelete.job_count} existing job(s) are kept.` : ""}`
          : ""}
        confirmLabel="Remove"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      <StatusAlertModal status={status} onClose={() => setStatus(null)} />
    </div>
  );
}
